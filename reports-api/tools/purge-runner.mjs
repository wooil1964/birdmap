// Forbidden-content purge with an external safety ledger (separate D1, outside the main restore domain).
//   --check     --target t.json                          READ ONLY: residue of every ledger event in main
//   --purge     --target t.json --source-id UUID --policy-version V --actor-ref R --confirm PURGE_FORBIDDEN_CONTENT
//   --reconcile --target t.json --confirm PURGE_FORBIDDEN_CONTENT   re-purge every ledger event (after restore)
// Protocol: ledger intent -> idempotent main deletes (children first) -> residue 0 -> ledger completed.
// Cross-D1 atomicity is not assumed; every step is safe to repeat. Ledger holds no observation content.
// Writes need main frozen (system_state) or, when that cannot be trusted (restore), the ingress barrier closed.
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { loadTarget, read, write, stats, ingressClosed } from './d1-rest.mjs';

const { values: a } = parseArgs({ options: { check: { type: 'boolean' }, purge: { type: 'boolean' }, reconcile: { type: 'boolean' }, target: { type: 'string' }, 'source-id': { type: 'string' }, 'policy-version': { type: 'string' }, 'actor-ref': { type: 'string' }, confirm: { type: 'string' } } });
const fail = (code, extra = {}) => { const e = Error(code); e.code = code; e.extra = extra; throw e; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const t = a.target && loadTarget(a.target), main = t?.database_id, ledgerDb = t?.ledger_database_id;

async function tables() { return new Set((await read(t, main, "SELECT name FROM sqlite_schema WHERE type='table'")).map(r => r.name)); }
async function residue(id, tb) {
  const n = async (sql) => (await read(t, main, sql, [id]))[0].n;
  const r = { reports: await n('SELECT COUNT(*) n FROM reports WHERE id=?') };
  if (tb.has('checklists')) Object.assign(r, {
    checklists: await n('SELECT COUNT(*) n FROM checklists WHERE checklist_id=?'), sightings: await n('SELECT COUNT(*) n FROM sightings WHERE checklist_id=?'),
    reviews: await n('SELECT COUNT(*) n FROM reviews WHERE checklist_id=?'), raw_submissions: await n('SELECT COUNT(*) n FROM raw_submissions WHERE source_id=?'),
    audit_non_tombstone: await n("SELECT COUNT(*) n FROM audit_log WHERE target_id=? AND action<>'forbidden_content_purged'"),
    tombstone: await n("SELECT COUNT(*) n FROM audit_log WHERE target_id=? AND action='forbidden_content_purged'") });
  const { tombstone, ...rest } = r;
  return { ...r, clean: Object.values(rest).every(v => v === 0) && (tombstone === undefined || tombstone === 1) };
}
async function writable(tb) {
  const state = tb.has('system_state') ? (await read(t, main, 'SELECT mode,generation FROM system_state WHERE id=1'))[0] : null;
  if (state?.mode === 'READ_ONLY_MAINTENANCE') return { gate: 'system_state', generation: state.generation };
  const barrier = await ingressClosed(t);
  if (barrier.closed) return { gate: 'ingress_barrier', system_state: state?.mode ?? 'ABSENT' };
  fail('NOT_FROZEN', { system_state: state?.mode ?? 'ABSENT', ingress: barrier.workers });
}
async function purgeMain(event, tb) {
  const id = event.source_id;
  const dependents = (await read(t, main, 'SELECT COUNT(*) n FROM reports WHERE spot_key=? AND id<>?', [id, id]))[0].n
    + (tb.has('checklists') ? (await read(t, main, 'SELECT COUNT(*) n FROM checklists WHERE spot_key=? AND checklist_id<>?', [id, id]))[0].n : 0);
  if (dependents) fail('PURGE_DEPENDENCIES', { dependents });   // never auto-unlink other observations
  const statements = tb.has('checklists') ? [
    ['DELETE FROM reviews WHERE checklist_id=?', [id]], ['DELETE FROM sightings WHERE checklist_id=?', [id]],
    ['DELETE FROM checklists WHERE checklist_id=?', [id]], ['DELETE FROM raw_submissions WHERE source_id=?', [id]],
    ["DELETE FROM audit_log WHERE target_id=? AND action<>'forbidden_content_purged'", [id]]] : [];
  statements.push(['DELETE FROM reports WHERE id=?', [id]]);
  if (tb.has('audit_log')) statements.push([
    "INSERT INTO audit_log(audit_id,actor_id,action,target_type,target_id,request_id,request_fingerprint,event_count,created_at) SELECT ?,?,'forbidden_content_purged','report',?,?,NULL,0,? WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?)",
    ['purge:' + event.purge_event_id, event.actor_ref, id, event.purge_event_id, event.intent_at, id]]);
  for (const [sql, params] of statements) await write(t, main, sql, params);
  const r = await residue(id, tb);
  if (!r.clean) fail('PURGE_RESIDUE', { residue: r });
  return r;
}
const events = () => read(t, ledgerDb, 'SELECT * FROM purge_events ORDER BY intent_at,purge_event_id');
async function complete(event) {
  if (event.state === 'intent') await write(t, ledgerDb, "UPDATE purge_events SET state='completed',purged_at=? WHERE purge_event_id=? AND state='intent'", [new Date().toISOString(), event.purge_event_id]);
  const [after] = await read(t, ledgerDb, 'SELECT state FROM purge_events WHERE purge_event_id=?', [event.purge_event_id]);
  if (after?.state !== 'completed') fail('LEDGER_COMPLETE_FAILED');
}

try {
  const mode = ['check', 'purge', 'reconcile'].filter(m => a[m]);
  if (mode.length !== 1 || !t || !ledgerDb || ledgerDb === main) fail('USAGE');
  if (mode[0] !== 'check' && a.confirm !== 'PURGE_FORBIDDEN_CONTENT') fail('CONFIRMATION_REQUIRED');
  const tb = await tables();
  let out;
  if (mode[0] === 'check') {
    const list = await events(), results = [];
    for (const e of list) results.push({ purge_event_id: e.purge_event_id, state: e.state, ...(await residue(e.source_id, tb)) });
    out = { ledger_events: list.length, intents: list.filter(e => e.state === 'intent').length, residue_events: results.filter(r => !r.clean).length, results };
  } else if (mode[0] === 'purge') {
    const id = a['source-id'];
    if (!UUID.test(id || '') || !a['policy-version'] || !/^[a-z0-9-]{1,40}$/.test(a['actor-ref'] || '')) fail('USAGE');
    const gate = await writable(tb);
    const native = tb.has('checklists') && (await read(t, main, "SELECT COUNT(*) n FROM checklists WHERE checklist_id=? AND source_type='native'", [id]))[0].n === 1;
    const exists = (await read(t, main, 'SELECT COUNT(*) n FROM reports WHERE id=?', [id]))[0].n;
    const [known] = await read(t, ledgerDb, 'SELECT * FROM purge_events WHERE source_id=?', [id]);
    if (!known && !exists) fail('NOT_FOUND');
    // 1. durable intent outside the main restore domain, before anything is deleted
    if (!known) await write(t, ledgerDb, "INSERT INTO purge_events(purge_event_id,source_type,source_id,reason_code,policy_version,actor_ref,state,intent_at) VALUES (?,?,?,'forbidden_breeding_content',?,?,'intent',?)",
      [randomUUID(), native ? 'native_report' : 'legacy_report', id, a['policy-version'], a['actor-ref'], new Date().toISOString()]);
    const [event] = await read(t, ledgerDb, 'SELECT * FROM purge_events WHERE source_id=?', [id]);
    const r = await purgeMain(event, tb);                      // 2. idempotent main purge + residue 0
    await complete(event);                                     // 3. ledger completed
    out = { purge_event_id: event.purge_event_id, source_type: event.source_type, gate, residue: r, ledger: 'completed' };
  } else {
    const gate = await writable(tb), results = [];
    for (const e of await events()) {
      const before = await residue(e.source_id, tb);
      const after = before.clean ? before : await purgeMain(e, tb);
      await complete(e);
      results.push({ purge_event_id: e.purge_event_id, repurged: !before.clean, clean: after.clean });
    }
    out = { gate, ledger_events: results.length, repurged: results.filter(r => r.repurged).length, all_clean: results.every(r => r.clean), results };
  }
  console.log(JSON.stringify({ mode: mode[0], target: t.name, ...out, rest: stats }));
} catch (e) {
  console.error(JSON.stringify({ error: e.code || 'PURGE_RUNNER_FAILED', ...(e.extra || {}), ...(e.code ? {} : { message: String(e.message).slice(0, 300) }), rest: stats }));
  process.exitCode = 1;
}
