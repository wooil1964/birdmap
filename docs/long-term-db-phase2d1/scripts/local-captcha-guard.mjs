// Local proof of the application-level Turnstile redemption guard (ephemeral Miniflare D1, synthetic).
// Siteverify is stubbed in two modes:
//   racy       - every valid token succeeds, even when reused (the 2026-09-26 staging race-like behavior)
//   cloudflare - documented contract: first use succeeds; same idempotency_key retry succeeds; else duplicate
// usage: node docs/long-term-db-phase2d1/scripts/local-captcha-guard.mjs <wrangler node_modules>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { localDb, installAuthStubs, environments, input, post, failingBinding, ORIGIN } from '../../../reports-api/local-test/helpers.mjs';
import { rows, first } from '../../../reports-api/src/canonical/data.js';
import { handleRequest as publicHandler } from '../../../reports-api/src/public.js';
import { handleRequest as adminHandler } from '../../../reports-api/src/admin.js';

const evidence = { at: new Date().toISOString(), scope: 'local ephemeral D1, synthetic tokens', tests: [] };
const check = async (name, fn) => { const d = await fn(); evidence.tests.push({ name, result: 'PASS', ...(d ? { detail: d } : {}) }); console.log('PASS ' + name); };
let local, auth;
try {
  local = await localDb(process.argv[2]); const db = local.db; auth = await installAuthStubs();
  const authFetch = globalThis.fetch, consumed = new Map(), keysSeen = [];
  let mode = 'racy';
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return authFetch(url, options);
    const p = new URLSearchParams(options.body), token = p.get('response'), key = p.get('idempotency_key');
    keysSeen.push(key);
    if (/^(invalid|expired)\./.test(token)) return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
    if (mode === 'racy') return Response.json({ success: true });
    if (!consumed.has(token)) { consumed.set(token, key); return Response.json({ success: true }); }
    return Response.json(key && consumed.get(token) === key ? { success: true } : { success: false, 'error-codes': ['timeout-or-duplicate'] });
  };
  const { pub, admin } = environments(db);
  const TABLES = ['reports', 'raw_submissions', 'checklists', 'sightings', 'captcha_redemptions'];
  const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async t => [t, (await first(db, `SELECT COUNT(*) n FROM ${t}`)).n])));
  const delta = (a, b) => Object.fromEntries(TABLES.map(t => [t, b[t] - a[t]]));
  const same = (d, v) => TABLES.every(t => d[t] === v);
  const present = async id => (await Promise.all(['reports WHERE id', 'raw_submissions WHERE source_id', 'checklists WHERE checklist_id', 'sightings WHERE checklist_id'].map(async q => (await first(db, `SELECT COUNT(*) n FROM ${q}=?`, id)).n))).reduce((a, b) => a + b, 0);

  let aBody, aResponse;
  await check('A fresh token: one submission stored, one redemption, idempotency_key = request_id', async () => {
    const c0 = await counts(); aBody = input(101, { turnstileToken: 'tok-A' }); keysSeen.length = 0;
    const r = await post(pub, aBody); assert.equal(r.status, 201); aResponse = await r.json();
    assert(same(delta(c0, await counts()), 1)); assert.deepEqual(keysSeen, [aBody.request_id]);
    const red = await first(db, 'SELECT * FROM captcha_redemptions WHERE request_id=?', aBody.request_id);
    assert.deepEqual(Object.keys(red).sort(), ['redeemed_at', 'request_id', 'token_hash']); assert.match(red.token_hash, /^[0-9a-f]{64}$/); assert.notEqual(red.token_hash, 'tok-A');
  });
  const rounds = [];
  await check('B same token, 4 different request_ids concurrent (racy Siteverify): exactly one stored, 3 CAPTCHA_REUSED', async () => {
    for (let round = 0; round < 3; round++) {
      const c0 = await counts(), bodies = [0, 1, 2, 3].map(i => input(200 + round * 10 + i, { turnstileToken: 'tok-B' + round }));
      const rs = await Promise.all(bodies.map(b => post(pub, b))), js = await Promise.all(rs.map(r => r.json()));
      const statuses = rs.map(r => r.status), d = delta(c0, await counts());
      assert.equal(statuses.filter(s => s === 201).length, 1); assert(same(d, 1));
      assert.deepEqual(js.filter((_, i) => statuses[i] !== 201).map(j => [j.error.code]), [['CAPTCHA_REUSED'], ['CAPTCHA_REUSED'], ['CAPTCHA_REUSED']]);
      for (const [i, b] of bodies.entries()) if (statuses[i] !== 201) assert.equal(await present(b.request_id), 0);
      rounds.push({ statuses: statuses.slice().sort(), delta: d });
    }
    return rounds;
  });
  await check('C same request_id + same payload replay: 201, original result, no insert', async () => {
    const c0 = await counts(), r = await post(pub, { ...aBody, turnstileToken: 'tok-other' });
    assert.equal(r.status, 201); assert.deepEqual(await r.json(), aResponse); assert(same(delta(c0, await counts()), 0));
  });
  await check('D same request_id + changed payload: IDEMPOTENCY_CONFLICT, no insert', async () => {
    const c0 = await counts(), r = await post(pub, { ...aBody, species: '다른종', turnstileToken: 'tok-D' });
    assert.equal(r.status, 409); assert.equal((await r.json()).error.code, 'IDEMPOTENCY_CONFLICT'); assert(same(delta(c0, await counts()), 0));
  });
  await check('E invalid token: 403, redemption 0, canonical 0', async () => {
    const c0 = await counts(), r = await post(pub, input(301, { turnstileToken: 'invalid.x' }));
    assert.equal(r.status, 403); assert.equal((await r.json()).error.code, 'CAPTCHA_FAILED'); assert(same(delta(c0, await counts()), 0));
  });
  await check('F expired token: 403, redemption 0, canonical 0', async () => {
    const c0 = await counts(), r = await post(pub, input(302, { turnstileToken: 'expired.x' }));
    assert.equal(r.status, 403); assert(same(delta(c0, await counts()), 0));
  });
  mode = 'cloudflare';
  await check('G1 Siteverify success -> failure before the D1 batch: partial 0; same-request retry succeeds via same idempotency_key', async () => {
    const body = input(401, { turnstileToken: 'tok-G1' }), c0 = await counts();
    const broken = { ...pub, REPORTS_DB: { prepare: s => db.prepare(s), batch: () => Promise.reject(Error('injected: connection lost before batch')) } };
    const r = await post(broken, body); assert.equal(r.status, 503); assert(same(delta(c0, await counts()), 0));
    const other = await post(pub, input(402, { turnstileToken: 'tok-G1' }));             // a different request cannot use it
    assert.equal(other.status, 403); assert.equal((await other.json()).error.code, 'CAPTCHA_FAILED');
    keysSeen.length = 0; const retry = await post(pub, body);
    assert.equal(retry.status, 201); assert.deepEqual(keysSeen, [body.request_id]); assert(same(delta(c0, await counts()), 1));
  });
  await check('G2 Siteverify success -> failure inside the D1 batch: full rollback incl. redemption; retry succeeds', async () => {
    const body = input(403, { turnstileToken: 'tok-G2' }), c0 = await counts();
    for (const at of [4, 6, 8]) { // after redemption insert, after reports insert, after checklists insert
      const r = await post({ ...pub, REPORTS_DB: failingBinding(db, at) }, body);
      assert.equal(r.status, 503); assert(same(delta(c0, await counts()), 0)); assert.equal(await present(body.request_id), 0);
    }
    const retry = await post(pub, body); assert.equal(retry.status, 201); assert(same(delta(c0, await counts()), 1));
  });
  mode = 'racy';
  await check('H redemption PK conflict rolls back the whole batch (reports/raw/checklist/sighting 0 for loser)', async () => {
    const c0 = await counts(), body = input(501, { turnstileToken: 'tok-A' });
    const r = await post(pub, body); assert.equal(r.status, 403); assert.equal((await r.json()).error.code, 'CAPTCHA_REUSED');
    assert(same(delta(c0, await counts()), 0)); assert.equal(await present(body.request_id), 0);
    assert.equal((await first(db, 'SELECT request_id FROM captcha_redemptions WHERE request_id=?', body.request_id)), null);
  });
  await check('I cleanup: redemptions older than 1 h deleted in the submit batch, recent kept', async () => {
    const now = Date.now(), old = new Date(now - 2 * 3600e3).toISOString(), recent = new Date(now - 10 * 60e3).toISOString();
    await db.batch([db.prepare('INSERT INTO captcha_redemptions VALUES (?,?,?)').bind('a'.repeat(64), 'old-request', old), db.prepare('INSERT INTO captcha_redemptions VALUES (?,?,?)').bind('b'.repeat(64), 'recent-request', recent)]);
    const r = await post(pub, input(601, { turnstileToken: 'tok-I' })); assert.equal(r.status, 201);
    assert.equal(await first(db, "SELECT 1 x FROM captcha_redemptions WHERE request_id='old-request'"), null);
    assert(await first(db, "SELECT 1 x FROM captcha_redemptions WHERE request_id='recent-request'"));
    assert.equal((await first(db, 'SELECT COUNT(*) n FROM captcha_redemptions WHERE redeemed_at<?', new Date(now - 3600e3).toISOString())).n, 0);
  });
  await check('J captcha_redemptions never exposed by public or admin APIs', async () => {
    const hashes = (await rows(db, 'SELECT token_hash,request_id FROM captcha_redemptions')), leaks = [];
    const bodies = [];
    for (const p of ['/reports/approved', '/reports/pending', '/reports/site/1', `/reports/${aBody.request_id}/status`, '/reports/capabilities'])
      bodies.push([p, await (await publicHandler(new Request('https://reports.example' + p, { headers: { Origin: ORIGIN } }), pub)).text()]);
    for (const p of ['/admin/api/reports?status=all', '/admin/api/capabilities', '/admin'])
      bodies.push([p, await (await adminHandler(new Request('https://admin.example' + p, { headers: { 'Cf-Access-Jwt-Assertion': auth.token } }), admin)).text()]);
    for (const [p, t] of bodies) if (hashes.some(h => t.includes(h.token_hash)) || /captcha_redemptions|token_hash/.test(t)) leaks.push(p);
    const src = ['public.js', 'admin.js', 'admin-actions.js', 'shared.js', 'canonical/shadow.js', 'canonical/control.js'].filter(f => readFileSync(new URL('../../../reports-api/src/' + f, import.meta.url), 'utf8').includes('captcha_redemptions'));
    assert.deepEqual(leaks, []); assert.deepEqual(src, []);
    return { endpoints_checked: bodies.length, source_files_referencing_table: ['canonical/persistence.js', 'canonical/data.js (allowlists)'] };
  });
  writeFileSync(new URL('../.local/local-captcha-guard.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.tests.length, b_rounds: rounds }));
} finally { auth?.restore(); await local?.close(); }
