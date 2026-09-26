// Crash windows of the cross-D1 purge protocol, simulated by stopping after individual steps.
//  A) ledger intent committed, main purge never ran     -> check shows intent+residue, reconcile purges + completes
//  B) main purged, ledger still 'intent' (no completion) -> check shows intent, clean; reconcile only completes
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { LOCAL, ROOT, target } from './staging.mjs';
import { read, write } from '../../../reports-api/tools/d1-rest.mjs';

const T = join(LOCAL, 'target.main.json'), t = target('main');
const tool = (script, ...args) => { const r = spawnSync(process.execPath, [join(ROOT, 'reports-api/tools', script), ...args, '--target', T], { encoding: 'utf8', cwd: ROOT }); return { code: r.status, ...JSON.parse((r.stdout || r.stderr).trim().split('\n').at(-1)) }; };
const stamp = String(Date.now() % 1e9).padStart(12, '0'), a = `00000000-0000-4000-a000-${stamp}`, b = `00000000-0000-4000-b000-${stamp}`;
for (const id of [a, b]) await write(t, t.database_id, "INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,bird_count,note,name_public,pending_public,ip_hash,dedupe_hash) VALUES (?,'approved','합성중단',37.5,127.5,'2026-09-20',?,NULL,'SYNTHETIC_FORBIDDEN_DETAIL',0,0,'synthetic-crash',?)", [id, new Date().toISOString(), 'synthetic-crash-' + id]);
assert.equal(tool('freeze.mjs', '--freeze', '--reason', 'ledger-crash-test', '--confirm', 'FREEZE_WRITES').code, 0);
const intent = id => write(t, t.ledger_database_id, "INSERT INTO purge_events(purge_event_id,source_type,source_id,reason_code,policy_version,actor_ref,state,intent_at) VALUES (?,'legacy_report',?,'forbidden_breeding_content','forbidden-v1','operator-1','intent',?)", [randomUUID(), id, new Date().toISOString()]);
await intent(a);                                                  // A: crash right after intent
await intent(b); await write(t, t.database_id, 'DELETE FROM reports WHERE id=?', [b]);   // B: crash after main delete, before tombstone/complete
const before = tool('purge-runner.mjs', '--check');
const ra = before.results.find(r => r.state === 'intent' && r.reports === 1), rb = before.results.find(r => r.state === 'intent' && r.reports === 0);
assert(ra && rb); assert.equal(before.intents, 2);
const rec = tool('purge-runner.mjs', '--reconcile', '--confirm', 'PURGE_FORBIDDEN_CONTENT'); assert.equal(rec.code, 0, JSON.stringify(rec)); assert.equal(rec.all_clean, true);
const after = tool('purge-runner.mjs', '--check'); assert.equal(after.intents, 0); assert.equal(after.residue_events, 0);
const states = await read(t, t.ledger_database_id, 'SELECT state FROM purge_events WHERE source_id IN (?,?)', [a, b]); assert(states.every(s => s.state === 'completed'));
assert.equal(tool('freeze.mjs', '--unfreeze', '--reason', 'ledger-crash-test-done', '--confirm', 'UNFREEZE_WRITES').code, 0);
const out = { at: new Date().toISOString(), check_before: { intents: before.intents, residue_events: before.residue_events }, reconcile: { repurged: rec.repurged, all_clean: rec.all_clean }, check_after: { intents: after.intents, residue_events: after.residue_events, ledger_events: after.ledger_events } };
writeFileSync(join(LOCAL, 'staging-ledger-crash.json'), JSON.stringify(out, null, 2) + '\n'); console.log(JSON.stringify(out));
