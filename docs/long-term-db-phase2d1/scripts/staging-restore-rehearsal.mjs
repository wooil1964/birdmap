// Forbidden-content purge + main D1 Time Travel restore rehearsal (staging main D1 + staging safety ledger).
// Phases (each persists evidence first; the destructive restore runs once and is never repeated on resume):
//   prepare -> purge -> barrier -> restore -> reconcile -> reopen
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { http, success } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, P2C, ROOT, WORKERS, target, wrangler, setIngress } from './staging.mjs';
import { read, write, ingressClosed } from '../../../reports-api/tools/d1-rest.mjs';
import { fingerprint } from '../../../reports-api/src/canonical/data.js';

const phase = process.argv[2], T = join(LOCAL, 'target.main.json'), t = target('main');
const S = join(LOCAL, 'restore-rehearsal.json'), st = existsSync(S) ? JSON.parse(readFileSync(S, 'utf8')) : { steps: {} };
const save = (k, v) => { st.steps[k] = { at: new Date().toISOString(), ...v }; writeFileSync(S, JSON.stringify(st, null, 2) + '\n'); console.log(k, JSON.stringify(v).slice(0, 900)); };
const jwt = readFileSync(join(P2C, 'staging-access-jwt.txt'), 'utf8').trim(), auth = { 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt };
const tool = (script, ...args) => { const r = spawnSync(process.execPath, [join(ROOT, 'reports-api/tools', script), ...args, '--target', T], { encoding: 'utf8', cwd: ROOT, timeout: 300000 }); return { code: r.status, ...JSON.parse((r.stdout || r.stderr).trim().split('\n').at(-1)) }; };
const MARK = '합성금지번식표지';
const ledgerDigest = async () => fingerprint(await read(t, t.ledger_database_id, 'SELECT * FROM purge_events ORDER BY purge_event_id'));
async function exposure(ids) {
  const out = {};
  for (const p of ['/reports/approved', '/reports/pending']) { const r = await http('public', p); out[p] = { status: r.status, ids: ids.filter(id => JSON.stringify(r.body).includes(id)).length, marker: JSON.stringify(r.body).includes(MARK) }; }
  for (const id of ids) { const r = await http('public', `/reports/${id}/status`); out['status:' + id.slice(0, 8)] = r.status; }
  const a = await http('admin', '/admin/api/reports?status=all', undefined, auth); out.admin = { status: a.status, ids: ids.filter(id => JSON.stringify(a.body).includes(id)).length };
  return out;
}
async function residue(ids) { const r = {}; for (const id of ids) r[id] = (await read(t, t.database_id, 'SELECT (SELECT COUNT(*) FROM reports WHERE id=?1)+(SELECT COUNT(*) FROM checklists WHERE checklist_id=?1)+(SELECT COUNT(*) FROM sightings WHERE checklist_id=?1)+(SELECT COUNT(*) FROM raw_submissions WHERE source_id=?1) n', [id]))[0].n; return r; }

if (phase === 'prepare') {
  assert.equal(tool('freeze.mjs', '--status').state.mode, 'NORMAL');
  const stamp = String(Date.now() % 1e9).padStart(12, '0');
  // (1) legacy row that exists only in reports (as before the core migration), approved = publicly visible
  const legacyOnly = `00000000-0000-4000-9000-${stamp}`;
  await write(t, t.database_id, "INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,decided_at,bird_count,reporter,note,name_public,pending_public,ip_hash,dedupe_hash) VALUES (?,'approved',?,37.41,127.41,'2026-09-20',?,?,NULL,NULL,'SYNTHETIC_FORBIDDEN_DETAIL',0,0,'synthetic-forbidden',?)",
    [legacyOnly, MARK + '1', new Date().toISOString(), new Date().toISOString(), 'synthetic-forbidden-' + stamp]);
  // (2) native dual-write report (4 tables) approved through the real admin route
  const native = `40000000-0000-4000-8000-${stamp}`;
  const q = await success('public', { op: 'quick-injected', syntheticIp: '198.51.120.1', body: { request_id: native, non_breeding_confirmed: true, species: MARK + '2', lat: 37.42, lon: 127.42, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'SYNTHETIC_FORBIDDEN_DETAIL', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
  assert.equal(q.status, 201, JSON.stringify(q));
  const ap = await http('admin', '/admin/api/reports/' + native, { action: 'approve', request_id: `41000000-0000-4000-8000-${stamp}`, expected_revision: 1 }, auth); assert.equal(ap.status, 200, JSON.stringify(ap));
  // (3) an existing backfilled legacy row (reports + canonical legacy_reports) with no dependents
  const [backfilled] = await read(t, t.database_id, "SELECT c.checklist_id id FROM checklists c JOIN reports r ON r.id=c.checklist_id WHERE c.source_type='legacy_reports' AND r.status='approved' AND NOT EXISTS (SELECT 1 FROM reports x WHERE x.spot_key=c.checklist_id) AND NOT EXISTS (SELECT 1 FROM checklists y WHERE y.spot_key=c.checklist_id) AND r.spot_key IS NULL ORDER BY c.checklist_id DESC LIMIT 1");
  const ids = [legacyOnly, native, backfilled.id];
  const before = await exposure(ids);
  assert(before['/reports/approved'].ids === 3);
  const tt = JSON.parse(wrangler(['d1', 'time-travel', 'info', 'birdmap-reports-staging', '--json'], null, 'tt-before-purge'));
  save('prepare', { ids, kinds: ['legacy_reports_only', 'native_dual', 'legacy_backfilled'], exposure_before: before, residue_before: await residue(ids), bookmark_before_purge: tt.bookmark, system_state: tool('freeze.mjs', '--status').state });
}
if (phase === 'purge') {
  const { ids } = st.steps.prepare;
  const f = tool('freeze.mjs', '--freeze', '--reason', 'phase2d1-forbidden-purge', '--confirm', 'FREEZE_WRITES'); assert.equal(f.code, 0);
  const denied = tool('purge-runner.mjs', '--purge', '--source-id', ids[0], '--policy-version', 'forbidden-v1', '--actor-ref', 'operator-1');
  assert.equal(denied.error, 'CONFIRMATION_REQUIRED');
  const results = ids.map(id => tool('purge-runner.mjs', '--purge', '--source-id', id, '--policy-version', 'forbidden-v1', '--actor-ref', 'operator-1', '--confirm', 'PURGE_FORBIDDEN_CONTENT'));
  for (const r of results) { assert.equal(r.code, 0, JSON.stringify(r)); assert.equal(r.residue.clean, true); assert.equal(r.ledger, 'completed'); }
  const again = tool('purge-runner.mjs', '--purge', '--source-id', ids[0], '--policy-version', 'forbidden-v1', '--actor-ref', 'operator-1', '--confirm', 'PURGE_FORBIDDEN_CONTENT');
  assert.equal(again.code, 0); // idempotent: same ledger event, nothing left to delete
  const ledger = await read(t, t.ledger_database_id, 'SELECT * FROM purge_events ORDER BY intent_at');
  assert.equal(ledger.length, 3); assert(ledger.every(e => e.state === 'completed'));
  const leak = JSON.stringify(ledger); assert(!leak.includes(MARK) && !leak.includes('SYNTHETIC_FORBIDDEN') && !/37\.4|127\.4/.test(leak));
  let ledgerImmutable;
  try { await write(t, t.ledger_database_id, 'DELETE FROM purge_events WHERE purge_event_id=?', [ledger[0].purge_event_id]); ledgerImmutable = false; } catch { ledgerImmutable = true; }
  assert(ledgerImmutable);
  save('purge', { freeze_generation: f.state.generation, results: results.map(r => ({ id: r.purge_event_id, type: r.source_type, gate: r.gate.gate, residue: r.residue })), idempotent_rerun: again.residue.clean,
    ledger_columns: Object.keys(ledger[0]), ledger_digest: await ledgerDigest(), ledger_delete_refused: ledgerImmutable, exposure_after_purge: await exposure(ids), residue_after_purge: await residue(ids), check: tool('purge-runner.mjs', '--check') });
}
if (phase === 'barrier') {
  const s = tool('freeze.mjs', '--status'); assert.equal(s.state.mode, 'READ_ONLY_MAINTENANCE');
  const drain = tool('freeze.mjs', '--drain', '--generation', String(s.state.generation), '--rounds', '3', '--interval', '10'); assert.equal(drain.drained, true);
  for (const role of ['public', 'admin']) await setIngress(role, false);
  const probes = [];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const p = await http('public', '/reports/approved').catch(e => ({ status: 'network-error' })), a = await http('admin', '/admin/api/reports?status=all', undefined, auth).catch(() => ({ status: 'network-error' }));
    probes.push([p.status, a.status]); if (p.status !== 200 && a.status !== 200 && probes.length >= 3 && probes.slice(-3).every(x => x[0] !== 200 && x[1] !== 200)) break;
  }
  const closed = await ingressClosed(t); assert.equal(closed.closed, true);
  assert(probes.slice(-3).every(x => x[0] !== 200 && x[1] !== 200), JSON.stringify(probes));
  save('barrier', { drain: drain.rounds.length, ingress: closed, http_probes: probes, post_attempt: (await http('public', '/reports', { species: 'x' }).catch(() => ({ status: 'network-error' }))).status });
}
if (phase === 'restore') {
  if (st.steps.restore) throw Error('RESTORE_ALREADY_DONE — do not repeat the destructive restore');
  assert.equal((await ingressClosed(t)).closed, true);
  const bookmark = st.steps.prepare.bookmark_before_purge, ledgerBefore = await ledgerDigest();
  const out = wrangler(['d1', 'time-travel', 'restore', 'birdmap-reports-staging', '--bookmark', bookmark, '--json'], null, 'tt-restore');
  save('restore', { bookmark, wrangler_ok: /restored|success/i.test(out), ledger_digest_before_restore: ledgerBefore });
}
if (phase === 'reconcile') {
  const { ids } = st.steps.prepare;
  const closed = await ingressClosed(t); assert.equal(closed.closed, true);                   // barrier survived the restore
  const [sys] = await read(t, t.database_id, 'SELECT mode,generation FROM system_state WHERE id=1');
  const back = await residue(ids), ledgerAfter = await ledgerDigest();
  assert.equal(ledgerAfter, st.steps.purge.ledger_digest);                                    // ledger survived the main restore
  assert(Object.values(back).every(n => n > 0));                                             // forbidden rows came back in main
  const check = tool('purge-runner.mjs', '--check'); assert.equal(check.residue_events, 3);
  const rec = tool('purge-runner.mjs', '--reconcile', '--confirm', 'PURGE_FORBIDDEN_CONTENT'); assert.equal(rec.code, 0, JSON.stringify(rec)); assert.equal(rec.repurged, 3); assert.equal(rec.all_clean, true);
  const rec2 = tool('purge-runner.mjs', '--reconcile', '--confirm', 'PURGE_FORBIDDEN_CONTENT'); assert.equal(rec2.repurged, 0);
  const tomb = (await read(t, t.database_id, "SELECT COUNT(*) n FROM audit_log WHERE action='forbidden_content_purged' AND target_id IN (?,?,?)", ids))[0].n;
  // restored state had system_state NORMAL: re-freeze before any ingress reopens
  const f = tool('freeze.mjs', '--freeze', '--reason', 'post-restore-hold', '--confirm', 'FREEZE_WRITES'); assert.equal(f.code, 0);
  save('reconcile', { ingress_closed: closed.closed, restored_system_state: sys, residue_after_restore: back, ledger_digest_unchanged: true, check_before: { residue_events: check.residue_events }, reconcile: { gate: rec.gate, repurged: rec.repurged, all_clean: rec.all_clean }, reconcile_rerun_repurged: rec2.repurged, tombstones: tomb, residue_after_reconcile: await residue(ids), refrozen_generation: f.state.generation });
}
if (phase === 'reopen') {
  const { ids } = st.steps.prepare;
  for (const role of ['public', 'admin']) await setIngress(role, true);
  let ok = false, exp;
  for (let i = 0; i < 20 && !ok; i++) { await new Promise(r => setTimeout(r, 3000)); exp = await exposure(ids).catch(() => null); ok = exp && exp['/reports/approved'].status === 200 && exp.admin.status === 200; }
  assert(ok, JSON.stringify(exp));
  for (const p of ['/reports/approved', '/reports/pending']) { assert.equal(exp[p].ids, 0); assert.equal(exp[p].marker, false); }
  for (const id of ids) assert.equal(exp['status:' + id.slice(0, 8)], 404); assert.equal(exp.admin.ids, 0);
  const frozenPost = await success('public', { op: 'quick-injected', syntheticIp: '198.51.120.9', body: { request_id: ids[1], non_breeding_confirmed: true, species: MARK + '2', lat: 37.42, lon: 127.42, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'x', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
  const u = tool('freeze.mjs', '--unfreeze', '--reason', 'post-restore-reopen', '--confirm', 'UNFREEZE_WRITES'); assert.equal(u.code, 0);
  const resubmit = await success('public', { op: 'quick-injected', syntheticIp: '198.51.120.10', body: { request_id: ids[1], non_breeding_confirmed: true, species: MARK + '2', lat: 37.42, lon: 127.42, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'x', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
  assert.equal(resubmit.status, 410);                                                         // purged native request id cannot be revived
  const smoke = await success('public', { op: 'quick-injected', syntheticIp: '198.51.120.11', body: { request_id: `42000000-0000-4000-8000-${String(Date.now() % 1e9).padStart(12, '0')}`, non_breeding_confirmed: true, species: '합성재개', lat: 37.43, lon: 127.43, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'reopen smoke', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
  assert.equal(smoke.status, 201);
  save('reopen', { exposure_after_reopen: exp, frozen_post_status: frozenPost.status, purged_resubmit_status: resubmit.status, reopen_smoke_status: smoke.status, final_check: tool('purge-runner.mjs', '--check') });
}
