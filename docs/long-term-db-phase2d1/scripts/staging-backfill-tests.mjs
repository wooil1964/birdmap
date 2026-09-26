// Staging rehearsal of the production-prep backfill runner on the real rehearsal D1
// (birdmap-backfill-rehearsal-staging) through the real Access-protected admin ops route.
// usage: node staging-backfill-tests.mjs 22,23,24,37,400
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { http } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, P2C, ROOT, target } from './staging.mjs';
import { prepareSiteSeed } from '../../../reports-api/tools/sites-seed.mjs';
import { write, assertWriteAllowed, PRODUCTION_DB } from '../../../reports-api/tools/d1-rest.mjs';
import { row, siteIds } from '../../long-term-db-phase2a/proof/fixture.mjs';

const T = join(LOCAL, 'target.rehearsal.json'), rt = target('rehearsal');
const jwt = readFileSync(join(P2C, 'staging-access-jwt.txt'), 'utf8').trim();
const rehearsal = { 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt, 'X-Phase2D1-Db': 'rehearsal' };
const evidence = { at: new Date().toISOString(), database: rt.database_id, cohorts: [], tests: [] };
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'reports-api/tools', script), ...args], { encoding: 'utf8', cwd: ROOT, timeout: 300000 });
  return { code: r.status, ...JSON.parse((r.stdout || r.stderr).trim().split('\n').at(-1)) };
};
const runner = (...a) => run('backfill-runner.mjs', ...a, '--target', T);
const freezeTool = (...a) => run('freeze.mjs', ...a, '--target', T);
const d1 = async body => { const r = await http('public', '/_phase2d1', { db: 'rehearsal', ...body }); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 400)); return r.body.value; };
const seed = async plan => { const r = await http('admin', '/admin/api/ops/seed', plan, rehearsal); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 400)); return r.body; };
const sitesPlan = await prepareSiteSeed(readFileSync(join(ROOT, 'index.html'), 'utf8'), { capturedAt: '2026-09-26T00:00:00.000Z' });
const cohort = (n, base) => Array.from({ length: n }, (_, i) => row(base + i, { status: ['approved', 'rejected', 'pending'][i % 3], decided_at: i % 3 === 2 ? null : '2026-09-25T00:00:00.000Z',
  bird_count: i % 7 === 0 ? null : [null, 0, 1, 7][i % 4], species: i % 7 === 0 ? '합성갑 · 합성을' : '합성단일' + i, site_id: i % 2 ? null : siteIds[i % siteIds.length] }));
async function fresh(source) {
  const s = await d1({ op: 'state' });
  if (s.system_state.mode !== 'NORMAL') assert.equal(freezeTool('--unfreeze', '--reason', 'rehearsal-reset', '--confirm', 'UNFREEZE_WRITES').code, 0);
  await d1({ op: 'rehearsal-reset' });
  for (let i = 0; i < source.length; i += 500) await d1({ op: 'rehearsal-load', reports: source.slice(i, i + 500) });
  const f = freezeTool('--freeze', '--reason', 'rehearsal-backfill', '--confirm', 'FREEZE_WRITES'); assert.equal(f.code, 0, JSON.stringify(f));
  assert.equal((await seed(sitesPlan)).added, 190);
  return f;
}
const manifestPath = n => { const p = join(LOCAL, `manifest-N${n}.json`); if (existsSync(p)) rmSync(p); return p; };

for (const n of process.argv[2].split(',').map(Number)) {
  const source = cohort(n, 20000), f = await fresh(source), c = { n };
  const dry = runner('--dry-run'); assert.equal(dry.code, 0, JSON.stringify(dry)); assert.equal(dry.source_row_count, n);
  const before = freezeTool('--status');
  const m = manifestPath(n), prep = runner('--prepare', '--run-id', `phase2d1-staging-N${n}`, '--out', m);
  assert.equal(prep.code, 0, JSON.stringify(prep)); assert.equal(prep.rest.writes, 0); assert.equal(prep.rest.rowsWrittenByReads, 0); assert.equal(prep.target_state, 'READY_EMPTY');
  const after = freezeTool('--status');
  assert.equal(after.reports.digest, before.reports.digest); assert.equal(after.canonical_digest, before.canonical_digest); // --prepare is read-only
  const manifest = JSON.parse(readFileSync(m, 'utf8'));
  assert.equal(manifest.source_row_count, n); assert.equal(manifest.freeze_generation, f.state.generation);
  assert(!JSON.stringify(manifest).includes('합성'), 'manifest must not contain payload');
  assert.equal(runner('--verify-only', '--manifest', m).target_state, 'READY_EMPTY');
  const t0 = Date.now(), apply = runner('--apply', '--manifest', m);
  assert.equal(apply.code, 0, JSON.stringify(apply)); assert.equal(apply.state, 'applied'); assert.equal(apply.added, n); assert.equal(apply.statements, 3 * n + 3); assert.equal(apply.after, 'VERIFIED');
  c.apply_ms = Date.now() - t0; c.statements = apply.statements;
  const again = runner('--apply', '--manifest', m); assert.equal(again.code, 0); assert.equal(again.added, 0); assert.equal(again.after, 'VERIFIED');
  const s = await d1({ op: 'state' });
  for (const tb of ['raw_submissions', 'checklists', 'sightings']) assert.equal(s.counts[tb], n);
  assert.equal(s.counts.backfill_runs, 1); assert.equal(s.counts.reviews, 0); assert.equal(s.counts.audit_log, 0); assert.equal(s.counts.transaction_assertions, 0);
  c.prepare_reads = prep.rest.reads; c.manifest_fields = Object.keys(manifest).length; c.result = 'PASS';
  evidence.cohorts.push(c); console.log(JSON.stringify(c));
}

// Abort paths on the last cohort (frozen, applied).
const n0 = Number(process.argv[2].split(',')[0]);
{
  const source = cohort(n0, 30000); await fresh(source);
  const m = manifestPath('abort'); assert.equal(runner('--prepare', '--run-id', 'phase2d1-abort', '--out', m).code, 0);
  const man = JSON.parse(readFileSync(m, 'utf8'));
  const tampered = join(LOCAL, 'manifest-tampered.json'); writeFileSync(tampered, JSON.stringify({ ...man, source_row_count: n0 + 1 }));
  let r = runner('--apply', '--manifest', tampered); assert.equal(r.error, 'MANIFEST_INVALID'); evidence.tests.push({ name: 'tampered manifest refused', result: 'PASS' });
  assert.equal(freezeTool('--unfreeze', '--reason', 'abort-test', '--confirm', 'UNFREEZE_WRITES').code, 0);
  await d1({ op: 'rehearsal-load', reports: [row(39999)] });
  assert.equal(freezeTool('--freeze', '--reason', 'abort-test', '--confirm', 'FREEZE_WRITES').code, 0);
  r = runner('--apply', '--manifest', m); assert.equal(r.error, 'MANIFEST_MISMATCH'); assert(r.fields.includes('source_digest') && r.fields.includes('freeze_generation'));
  evidence.tests.push({ name: 'source + freeze generation change refused', result: 'PASS', fields: r.fields });
  const m2 = manifestPath('abort2'); assert.equal(runner('--prepare', '--run-id', 'phase2d1-abort2', '--out', m2).code, 0);
  assert.equal(runner('--apply', '--manifest', m2).code, 0);
  const victim = (await d1({ op: 'rows', ids: [row(30001).id] }))[0].id;
  await write(rt, rt.database_id, 'DELETE FROM sightings WHERE checklist_id=?', [victim]);
  r = runner('--verify-only', '--manifest', m2); assert.equal(r.target_state, 'PARTIAL_OR_DRIFT');
  r = runner('--apply', '--manifest', m2); assert.equal(r.error, 'PARTIAL_OR_DRIFT');
  evidence.tests.push({ name: 'partial target state detected and not overwritten', result: 'PASS' });
  const m3 = manifestPath('abort3'); r = runner('--prepare', '--run-id', 'phase2d1-abort3', '--out', m3);
  evidence.tests.push({ name: 'prepare on partial target reports state (does not write)', result: 'PASS', target_state: r.target_state });
  // shared multi-species + shared count legacy row -> ABORT + REPORT in every mode
  await fresh([...cohort(5, 31000), row(31999, { species: '합성갑 · 합성을', bird_count: 4 })]);
  for (const mode of [['--dry-run'], ['--prepare', '--run-id', 'x', '--out', manifestPath('shared')]]) { r = runner(...mode); assert.equal(r.error, 'LEGACY_SHARED_MULTI_SPECIES_COUNT'); }
  assert(!existsSync(join(LOCAL, 'manifest-Nshared.json')));
  evidence.tests.push({ name: 'shared multi-species count aborts dry-run and prepare, no manifest', result: 'PASS' });
  // Write guard only (no Production call is made): production id or non-staging target throws before any request.
  assert.throws(() => assertWriteAllowed({ environment: 'staging' }, PRODUCTION_DB), /PRODUCTION_WRITE_NOT_APPROVED/);
  assert.throws(() => assertWriteAllowed({ environment: 'production' }, 'any-ledger-id'), /PRODUCTION_WRITE_NOT_APPROVED/);
  assert.doesNotThrow(() => assertWriteAllowed(rt, rt.database_id));
  evidence.tests.push({ name: 'Production writes refused without Phase 2E approval (guard unit, no network)', result: 'PASS' });
}
evidence.finished_at = new Date().toISOString();
writeFileSync(join(LOCAL, 'staging-backfill.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ cohorts: evidence.cohorts.length, tests: evidence.tests }));
