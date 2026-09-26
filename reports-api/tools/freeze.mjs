// DB write freeze through the system_state gate (docs/long-term-db-phase2d1/migrations/0002_system_state.sql).
//   --status   --target t.json                                   READ ONLY
//   --freeze   --target t.json --reason R --confirm FREEZE_WRITES   (Production: a Production write)
//   --unfreeze --target t.json --reason R --confirm UNFREEZE_WRITES
//   --drain    --target t.json --generation G [--rounds 4 --interval 20]   READ ONLY
// The freeze UPDATE and the post-freeze snapshot run in one REST batch, executed sequentially with no
// other query interleaved, so the snapshot is exactly the frozen state.
import { parseArgs } from 'node:util';
import { loadTarget, read, writeBatch, stats } from './d1-rest.mjs';
import { fingerprint } from '../src/canonical/data.js';

const { values: a } = parseArgs({ options: { status: { type: 'boolean' }, freeze: { type: 'boolean' }, unfreeze: { type: 'boolean' }, drain: { type: 'boolean' }, target: { type: 'string' }, reason: { type: 'string' }, confirm: { type: 'string' }, generation: { type: 'string' }, rounds: { type: 'string', default: '4' }, interval: { type: 'string', default: '20' } } });
const fail = (code, extra = {}) => { const e = Error(code); e.code = code; e.extra = extra; throw e; };
// Exact gate objects. A dropped or altered trigger means the freeze proves nothing.
const GATE = ['reports_freeze_insert', 'reports_freeze_update', 'system_state_permanent', 'system_state_transition'];
const GATE_SQL = "SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name IN ('reports_freeze_insert','reports_freeze_update','system_state_permanent','system_state_transition') ORDER BY name";
const REPORTS = 'SELECT * FROM reports ORDER BY id';
const CANONICAL = "SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('raw_submissions','checklists','sightings','reviews','audit_log','sites','backfill_runs')";

const summary = async reports => ({ count: reports.length, max_received_at: reports.reduce((m, r) => r.received_at > m ? r.received_at : m, ''), max_decided_at: reports.reduce((m, r) => r.decided_at && r.decided_at > m ? r.decided_at : m, ''), digest: await fingerprint(reports) });
async function gate(t) {
  const g = await read(t, t.database_id, GATE_SQL);
  return { present: g.map(r => r.name).join() === GATE.join(), fingerprint: await fingerprint(g.map(r => ({ name: r.name, sql: r.sql.replace(/\s+/g, ' ').trim() }))) };
}
async function status(t) {
  const [state] = await read(t, t.database_id, 'SELECT mode,generation,reason,updated_at FROM system_state WHERE id=1');
  const canonical = {};
  for (const { name } of await read(t, t.database_id, CANONICAL)) canonical[name] = await fingerprint(await read(t, t.database_id, `SELECT * FROM ${name} ORDER BY 1`));
  return { state: state ?? null, gate: await gate(t), reports: await summary(await read(t, t.database_id, REPORTS)), canonical_digest: await fingerprint(canonical) };
}
async function transition(t, from, to) {
  const g = await gate(t);
  if (!g.present) fail('GATE_MISSING', g);
  const res = await writeBatch(t, t.database_id, [
    ['UPDATE system_state SET mode=?,generation=generation+1,reason=?,updated_at=? WHERE id=1 AND mode=?', [to, a.reason, new Date().toISOString(), from]],
    ['SELECT mode,generation FROM system_state WHERE id=1'], [REPORTS]]);
  if (res[0].meta?.changes !== 1) fail('TRANSITION_NOT_APPLIED', { from, to, state: res[1].results[0] });
  return { changes: 1, state: res[1].results[0], snapshot: await summary(res[2].results), gate: g };
}

try {
  const mode = ['status', 'freeze', 'unfreeze', 'drain'].filter(m => a[m]);
  if (mode.length !== 1 || !a.target) fail('USAGE');
  const t = loadTarget(a.target);
  let out;
  if (mode[0] === 'status') out = await status(t);
  else if (mode[0] === 'freeze') { if (a.confirm !== 'FREEZE_WRITES' || !a.reason) fail('CONFIRMATION_REQUIRED'); out = await transition(t, 'NORMAL', 'READ_ONLY_MAINTENANCE'); }
  else if (mode[0] === 'unfreeze') { if (a.confirm !== 'UNFREEZE_WRITES' || !a.reason) fail('CONFIRMATION_REQUIRED'); out = await transition(t, 'READ_ONLY_MAINTENANCE', 'NORMAL'); }
  else {
    // Drain: gate present, same frozen generation, and every observation identical across the window.
    const g = Number(a.generation), rounds = [];
    for (let i = 0; i < Number(a.rounds); i++) {
      if (i) await new Promise(r => setTimeout(r, Number(a.interval) * 1000));
      rounds.push({ at: new Date().toISOString(), ...(await status(t)) });
    }
    const first = rounds[0], stable = rounds.every(r => r.state?.mode === 'READ_ONLY_MAINTENANCE' && r.state.generation === g && r.gate.present && r.gate.fingerprint === first.gate.fingerprint && r.reports.digest === first.reports.digest && r.canonical_digest === first.canonical_digest);
    out = { drained: stable, generation: g, rounds: rounds.map(r => ({ at: r.at, mode: r.state?.mode, generation: r.state?.generation, count: r.reports.count, digest: r.reports.digest, canonical: r.canonical_digest, gate: r.gate.present })) };
    if (!stable) process.exitCode = 2;
  }
  console.log(JSON.stringify({ mode: mode[0], target: t.name, ...out, rest: stats }));
} catch (e) {
  console.error(JSON.stringify({ error: e.code || 'FREEZE_TOOL_FAILED', ...(e.extra || {}), ...(e.code ? {} : { message: String(e.message).slice(0, 300) }), rest: stats }));
  process.exitCode = 1;
}
