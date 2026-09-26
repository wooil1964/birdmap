// Phase 2D.1 local proof (ephemeral Miniflare D1 only, synthetic rows, no network except stubs).
// 1) system_state trigger freeze vs the HEAD legacy binary (same source as Production today) and the new build.
// 2) ops.applyBackfill for dynamic N with constant query count, idempotency and every abort path.
// usage: node docs/long-term-db-phase2d1/scripts/local-freeze-backfill.mjs <wrangler node_modules>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localDb, installAuthStubs, environments, input, post, splitDDL, ORIGIN } from '../../../reports-api/local-test/helpers.mjs';
import { rows, first, insert, fingerprint } from '../../../reports-api/src/canonical/data.js';
import { handleRequest as publicNew } from '../../../reports-api/src/public.js';
import { handleRequest as adminNew } from '../../../reports-api/src/admin.js';
import { applyBackfill, applySeed, observe, manifestChecksum, MANIFEST_VERSION, SCHEMA_SQL } from '../../../reports-api/src/canonical/ops.js';
import { prepareSiteSeed } from '../../../reports-api/tools/sites-seed.mjs';
import { row } from '../../long-term-db-phase2a/proof/fixture.mjs';

const toolchain = process.argv[2]; if (!toolchain) throw Error('toolchain dir required');
const out = new URL('../.local/', import.meta.url); mkdirSync(out, { recursive: true });
const FREEZE_SQL = readFileSync(new URL('../migrations/0002_system_state.sql', import.meta.url), 'utf8');
const evidence = { at: new Date().toISOString(), scope: 'local ephemeral D1, synthetic only', tests: [] };
const check = async (name, fn) => { const detail = await fn(); evidence.tests.push({ name, result: 'PASS', ...(detail ? { detail } : {}) }); console.log('PASS ' + name); };

// HEAD legacy sources == code the Production Workers were deployed from. Read-only git show into a temp dir.
const legacyDir = mkdtempSync(join(tmpdir(), 'phase2d1-head-'));
for (const f of ['public.js', 'admin.js', 'shared.js', 'admin-page.js', 'site-picker.js']) writeFileSync(join(legacyDir, f), execFileSync('git', ['show', 'HEAD:reports-api/src/' + f]));
const { handleRequest: publicOld } = await import(pathToFileURL(join(legacyDir, 'public.js')));
const { handleRequest: adminOld } = await import(pathToFileURL(join(legacyDir, 'admin.js')));

const freeze = (db, from, to) => db.prepare("UPDATE system_state SET mode=?,generation=generation+1,reason=?,updated_at=? WHERE id=1 AND mode=?").bind(to, 'phase2d1-local', new Date().toISOString(), from).run();
const digest = async db => fingerprint(await Promise.all(['reports', 'raw_submissions', 'checklists', 'sightings', 'reviews', 'audit_log', 'backfill_runs', 'transaction_assertions'].map(t => rows(db, `SELECT * FROM ${t} ORDER BY 1`))));
const legacyBody = n => ({ species: `합성동결${n}`, lat: 37.1 + n / 1000, lon: 127.1, observedOn: '2026-09-20', birdCount: 1, reporter: '합성', namePublic: true, note: '합성', turnstileToken: 'synthetic-token' });
const legacyPost = (handler, env, n) => handler(new Request('https://reports.example/reports', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + (n % 250) }, body: JSON.stringify(legacyBody(n)) }), env);
const adminPost = (handler, env, token, id, body) => handler(new Request('https://admin.example/admin/api/reports/' + id, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
const get = (handler, env, path) => handler(new Request('https://reports.example' + path, { headers: { Origin: ORIGIN } }), env);
const adminGet = (handler, env, token) => handler(new Request('https://admin.example/admin/api/reports?status=all', { headers: { 'Cf-Access-Jwt-Assertion': token } }), env);

let local, auth;
try {
  local = await localDb(toolchain); const db = local.db; auth = await installAuthStubs();
  await db.batch(splitDDL(FREEZE_SQL).map(s => db.prepare(s)));
  const { pub, admin } = environments(db);
  const normal = { pub: { ...pub, REPORTS_WRITE_MODE: 'NORMAL', REPORTS_DUAL_WRITE_ENABLED: 'false' }, admin: { ...admin, REPORTS_WRITE_MODE: 'NORMAL', REPORTS_DUAL_WRITE_ENABLED: 'false' } };
  let legacyId;
  await check('NORMAL: HEAD legacy binary and new build write normally', async () => {
    const a = await legacyPost(publicOld, normal.pub, 1); assert.equal(a.status, 201); legacyId = (await a.json()).id;
    const ap = await adminPost(adminOld, normal.admin, auth.token, legacyId, { action: 'approve' }); assert.equal(ap.status, 200, JSON.stringify(await ap.clone().json()));
    assert.equal((await legacyPost(publicNew, normal.pub, 2)).status, 201);
    assert.equal((await post(pub, input(1))).status, 201);
  });
  const before = await digest(db);
  const frozen = {};
  await check('freeze: one UPDATE flips mode and advances generation', async () => {
    assert.equal((await freeze(db, 'NORMAL', 'READ_ONLY_MAINTENANCE')).meta.changes, 1);
    assert.deepEqual(await first(db, 'SELECT mode,generation FROM system_state'), { mode: 'READ_ONLY_MAINTENANCE', generation: 1 });
  });
  await check('frozen: HEAD legacy binary cannot write (public insert, admin update); DB unchanged', async () => {
    const p = await legacyPost(publicOld, normal.pub, 3), pb = await p.json();
    const m = await adminPost(adminOld, normal.admin, auth.token, legacyId, { action: 'reject' }), mb = await m.json();
    frozen.headPublic = { status: p.status, code: pb.error?.code }; frozen.headAdmin = { status: m.status, code: mb.error?.code };
    assert(p.status >= 400 && m.status >= 400);
    assert.equal(await digest(db), before);
    return frozen;
  });
  await check('frozen: new build returns 503 WRITE_MAINTENANCE + Retry-After 60 on every write path', async () => {
    const cases = [await legacyPost(publicNew, normal.pub, 4), await adminPost(adminNew, normal.admin, auth.token, legacyId, { action: 'reject' }),
      await post(pub, input(2)), await adminPost(adminNew, admin, auth.token, input(1).request_id, { action: 'approve', request_id: '20000000-0000-4000-8000-000000000001', expected_revision: 1 })];
    for (const r of cases) { assert.equal(r.status, 503); assert.equal(r.headers.get('Retry-After'), '60'); assert.equal((await r.json()).error.code, 'WRITE_MAINTENANCE'); }
    assert.equal(await digest(db), before);
  });
  await check('frozen: public GET and admin GET keep working', async () => {
    for (const h of [publicOld, publicNew]) for (const p of ['/reports/approved', '/reports/pending', `/reports/${legacyId}/status`]) assert.equal((await get(h, normal.pub, p)).status, 200);
    assert.equal((await adminGet(adminOld, normal.admin, auth.token)).status, 200);
    assert.equal((await adminGet(adminNew, admin, auth.token)).status, 200);
  });
  await check('system_state: invalid transitions and delete are rejected', async () => {
    await assert.rejects(() => freeze(db, 'READ_ONLY_MAINTENANCE', 'READ_ONLY_MAINTENANCE'), /system_state_transition_invalid/);
    await assert.rejects(() => db.prepare('UPDATE system_state SET mode=?,generation=generation+2 WHERE id=1').bind('NORMAL').run(), /system_state_transition_invalid/);
    await assert.rejects(() => db.prepare('DELETE FROM system_state').run(), /system_state_permanent/);
    await assert.rejects(() => db.prepare("INSERT INTO system_state VALUES (2,'NORMAL',0,NULL,'x')").run(), /CHECK|constraint/i);
  });
  await check('unfreeze: writes reopen for HEAD legacy, new NORMAL and dual-write', async () => {
    assert.equal((await freeze(db, 'READ_ONLY_MAINTENANCE', 'NORMAL')).meta.changes, 1);
    assert.equal((await first(db, 'SELECT generation FROM system_state')).generation, 2);
    assert.equal((await legacyPost(publicOld, normal.pub, 5)).status, 201);
    assert.equal((await legacyPost(publicNew, normal.pub, 6)).status, 201);
    assert.equal((await post(pub, input(3))).status, 201);
    assert.equal((await adminPost(adminOld, normal.admin, auth.token, legacyId, { action: 'reject' })).status, 200);
  });
  await check('fail closed: missing system_state row blocks writes', async () => {
    await db.prepare('DROP TRIGGER system_state_permanent').run(); await db.prepare('DELETE FROM system_state').run();
    const r = await legacyPost(publicNew, normal.pub, 7); assert.equal(r.status, 503);
  });
  local.close(); local = null;

  // ---- dynamic N backfill through the same function the admin ops route calls ----
  const sitesPlan = await prepareSiteSeed(readFileSync('index.html', 'utf8'), { capturedAt: '2026-09-26T00:00:00.000Z' });
  evidence.backfill = [];
  for (const n of [22, 23, 24, 37, 300]) {
    local = await localDb(toolchain); const bdb = local.db;
    await bdb.batch(splitDDL(FREEZE_SQL).map(s => bdb.prepare(s)));
    const source = Array.from({ length: n }, (_, i) => row(5000 + i, { status: ['approved', 'rejected', 'pending'][i % 3], decided_at: i % 3 === 2 ? null : '2026-09-25T00:00:00.000Z', bird_count: i % 7 === 0 ? null : [null, 0, 1, 7][i % 4], species: i % 7 === 0 ? '합성갑 · 합성을' : '합성단일' + i, site_id: i % 2 ? null : sitesPlan.sites[i % 190].site_id }));
    await bdb.batch(source.map(r => insert(bdb, 'reports', r)));
    await freeze(bdb, 'NORMAL', 'READ_ONLY_MAINTENANCE');
    const counter = { queries: 0, batches: [] }, wrap = s => ({ inner: s, bind: (...v) => wrap(s.bind(...v)), all: () => (counter.queries++, s.all()), first: () => (counter.queries++, s.first()), run: () => (counter.queries++, s.run()) });
    const cdb = { prepare: sql => wrap(bdb.prepare(sql)), batch: ss => (counter.batches.push(ss.length), bdb.batch(ss.map(x => x.inner))) };
    assert.equal((await applySeed(bdb, sitesPlan)).added, 190); assert.equal((await applySeed(bdb, sitesPlan)).added, 0);
    const read = async () => observe({ state: await first(bdb, 'SELECT mode,generation FROM system_state WHERE id=1'), schema: await rows(bdb, SCHEMA_SQL), reports: await rows(bdb, 'SELECT * FROM reports ORDER BY id'), sites: await rows(bdb, 'SELECT * FROM sites ORDER BY site_id') });
    const m = { manifest_version: MANIFEST_VERSION, database_id: 'local', run_id: 'phase2d1-local-N' + n, generated_at: '2026-09-26T01:00:00.000Z', ...(await read()) };
    m.manifest_checksum = await manifestChecksum(m);
    const applied = await applyBackfill(cdb, m);
    assert.equal(applied.added, n); assert.deepEqual(counter.batches, [3 * n + 3]);
    const q = counter.queries;
    for (const t of ['raw_submissions', 'checklists', 'sightings']) assert.equal((await first(bdb, `SELECT COUNT(*) n FROM ${t}`)).n, n);
    const s = await rows(bdb, 'SELECT s.count_value,s.count_accuracy,s.interpretation,c.status,c.site_id FROM sightings s JOIN checklists c USING(checklist_id) ORDER BY s.sighting_id');
    const sorted = [...source].sort((x, y) => x.id.localeCompare(y.id));
    sorted.forEach((r, i) => { assert.equal(s[i].count_value, /·/.test(r.species) ? null : r.bird_count); assert.equal(s[i].count_accuracy, 'unknown'); assert.equal(s[i].status, r.status); assert.equal(s[i].site_id, r.site_id); });
    const snap = await digest(bdb);
    counter.queries = 0; assert.deepEqual(await applyBackfill(cdb, m), { state: 'verified', added: 0, source_count: n }); assert.equal(await digest(bdb), snap);
    await assert.rejects(() => applyBackfill(bdb, { ...m, source_row_count: n + 1 }), { code: 'MANIFEST_INVALID' });
    const re = { ...m, run_id: 'other' }; re.manifest_checksum = await manifestChecksum(re);
    await assert.rejects(() => applyBackfill(bdb, re), { code: 'MANIFEST_OR_PARTIAL_STATE' });
    const victim = sorted[1].id, sight = await first(bdb, 'SELECT * FROM sightings WHERE checklist_id=?', victim);
    await bdb.prepare('DELETE FROM sightings WHERE checklist_id=?').bind(victim).run();
    await assert.rejects(() => applyBackfill(bdb, m), { code: 'PARTIAL_STATE' });
    await insert(bdb, 'sightings', sight).run(); assert.equal(await digest(bdb), snap);
    evidence.backfill.push({ n, statements_in_single_batch: 3 * n + 3, queries_first_apply: q, queries_reapply: counter.queries, result: 'PASS' });
    local.close(); local = null;
  }
  await check('backfill dynamic N (22/23/24/37/300): single batch 3N+3, constant queries, idempotent, partial/manifest refused', async () => {
    assert(new Set(evidence.backfill.map(b => b.queries_first_apply)).size === 1); return evidence.backfill;
  });

  local = await localDb(toolchain); const g = local.db;
  await g.batch(splitDDL(FREEZE_SQL).map(s => g.prepare(s)));
  await g.batch([row(9001), row(9002)].map(r => insert(g, 'reports', r)));
  await check('backfill aborts: not frozen, generation/source change, shared multi-species count, purged resurrected', async () => {
    const make = async () => { const m = { manifest_version: MANIFEST_VERSION, database_id: 'local', run_id: 'abort', generated_at: '2026-09-26T01:00:00.000Z', ...(await observe({ state: await first(g, 'SELECT mode,generation FROM system_state'), schema: await rows(g, SCHEMA_SQL), reports: await rows(g, 'SELECT * FROM reports ORDER BY id'), sites: await rows(g, 'SELECT * FROM sites ORDER BY site_id') })) }; m.manifest_checksum = await manifestChecksum(m); return m; };
    const notFrozen = await make(); await assert.rejects(() => applyBackfill(g, notFrozen), { code: 'FREEZE_REQUIRED' });
    await freeze(g, 'NORMAL', 'READ_ONLY_MAINTENANCE'); await applySeed(g, sitesPlan);
    const m1 = await make();
    await freeze(g, 'READ_ONLY_MAINTENANCE', 'NORMAL'); await freeze(g, 'NORMAL', 'READ_ONLY_MAINTENANCE');
    await assert.rejects(() => applyBackfill(g, m1), e => e.code === 'MANIFEST_MISMATCH' && /freeze_generation/.test(e.message));
    await freeze(g, 'READ_ONLY_MAINTENANCE', 'NORMAL'); await insert(g, 'reports', row(9003)).run(); await freeze(g, 'NORMAL', 'READ_ONLY_MAINTENANCE');
    const stale = { ...(await make()), manifest_checksum: m1.manifest_checksum };
    await assert.rejects(() => applyBackfill(g, stale), { code: 'MANIFEST_INVALID' });
    const m2 = await make(); await freeze(g, 'READ_ONLY_MAINTENANCE', 'NORMAL'); await insert(g, 'reports', row(9004)).run(); await freeze(g, 'NORMAL', 'READ_ONLY_MAINTENANCE');
    await assert.rejects(() => applyBackfill(g, m2), e => e.code === 'MANIFEST_MISMATCH' && /source_digest/.test(e.message));
    await freeze(g, 'READ_ONLY_MAINTENANCE', 'NORMAL'); await insert(g, 'reports', row(9005, { species: '합성갑 · 합성을', bird_count: 5 })).run(); await freeze(g, 'NORMAL', 'READ_ONLY_MAINTENANCE');
    await assert.rejects(async () => applyBackfill(g, await make()), { code: 'LEGACY_SHARED_MULTI_SPECIES_COUNT' });
    await g.prepare('DELETE FROM reports WHERE id=?').bind(row(9005).id).run();
    await insert(g, 'audit_log', { audit_id: 'purge:x', actor_id: 'op', action: 'forbidden_content_purged', target_type: 'report', target_id: row(9001).id, request_id: 'x', request_fingerprint: null, event_count: 0, created_at: 'x' }).run();
    await assert.rejects(async () => applyBackfill(g, await make()), { code: 'REPORT_PURGED' });
    for (const t of ['raw_submissions', 'checklists', 'sightings', 'backfill_runs']) assert.equal((await first(g, `SELECT COUNT(*) n FROM ${t}`)).n, 0);
  });
  evidence.frozen_old_binary_responses = frozen;
  evidence.finished_at = new Date().toISOString();
  writeFileSync(new URL('local-freeze-backfill.json', out), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.tests.length, frozen, backfill: evidence.backfill }));
} finally { auth?.restore(); await local?.close(); }
