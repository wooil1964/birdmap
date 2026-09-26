// Is applying 0001/0002/0003 to Production (mode NORMAL) safe for the CURRENT legacy Worker?
// Local Miniflare D1 built from the exact Production reports DDL (read in preflight), the pinned
// migration files applied statement by statement, and the HEAD legacy handlers (= Production source)
// exercised after EVERY statement prefix of 0002 (models an interrupted migration).
// usage: node docs/long-term-db-phase2e/scripts/local-0002-safety.mjs <wrangler node_modules>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installAuthStubs, splitDDL, ORIGIN } from '../../../reports-api/local-test/helpers.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)), ROOT = join(HERE, '../../..');
const prod = JSON.parse(readFileSync(join(HERE, '../.local/production-start.json'), 'utf8'));
const prodDDL = prod.aggregate.schema.results.filter(r => r.tbl_name === 'reports' && r.sql).sort((a, b) => (a.type === 'table' ? -1 : 1) - (b.type === 'table' ? -1 : 1)).map(r => r.sql);
const files = ['0001_core.sql', '0002_system_state.sql', '0003_captcha_redemptions.sql'].map(f => [f, splitDDL(readFileSync(join(HERE, '../migrations-main', f), 'utf8'))]);
const dir = mkdtempSync(join(tmpdir(), 'phase2e-head-'));
for (const f of ['public.js', 'admin.js', 'shared.js', 'admin-page.js', 'site-picker.js']) writeFileSync(join(dir, f), execFileSync('git', ['show', 'd39bf4b:reports-api/src/' + f], { cwd: ROOT }));
const { handleRequest: pub } = await import(pathToFileURL(join(dir, 'public.js')));
const { handleRequest: adm } = await import(pathToFileURL(join(dir, 'admin.js')));
const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)(join(process.argv[2], 'miniflare'));
const auth = await installAuthStubs();
const env = db => ({ ENVIRONMENT: 'production', REPORTS_DB: db, REPORT_IP_SALT: 's', TURNSTILE_SECRET_KEY: 'k', ACCESS_TEAM_DOMAIN: 'phase2b-test', ACCESS_AUD: 'phase2b-test', ADMIN_EMAILS: 'local-admin@example.test' });
let n = 0;
async function legacyWrites(db) {
  n++;
  const body = { species: '합성복제' + n, lat: 37.1 + n / 1000, lon: 127.1, observedOn: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), birdCount: 1, reporter: '합성', namePublic: true, note: '합성', turnstileToken: 't' };
  const p = await pub(new Request('https://r/reports', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + n }, body: JSON.stringify(body) }), env(db));
  const id = (await p.clone().json()).id, results = [p.status];
  for (const action of [{ action: 'approve' }, { action: 'reject' }, { action: 'unpublish' }, { action: 'consent', namePublic: false }, { action: 'visibility', public: true }, { action: 'site', siteId: null }, { action: 'link', spotKey: 'fixed:1:0' }, { action: 'unlink' }]) {
    const r = await adm(new Request('https://a/admin/api/reports/' + id, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': auth.token, 'Content-Type': 'application/json' }, body: JSON.stringify(action) }), env(db));
    results.push(r.status);
  }
  return results;
}
const evidence = { at: new Date().toISOString(), production_reports_ddl_objects: prodDDL.length, prefixes: [] };
try {
  const all = files.flatMap(([f, ss]) => ss.map((s, i) => ({ f, i, s })));
  // After each statement prefix of the whole 0001->0002->0003 sequence, the legacy binary must still write.
  for (let k = 0; k <= all.length; k++) {
    const mf = new Miniflare(convertV4MiniflareOptions({ name: 'p2e', modules: true, script: 'export default {fetch(){return new Response("x")}}', compatibilityDate: '2026-09-24', d1Databases: { DB: 'p2e-' + k }, d1Persist: false, cf: false }));
    const db = await mf.getD1Database('DB');
    try {
      for (const s of prodDDL) await db.prepare(s).run();
      for (const { s } of all.slice(0, k)) await db.prepare(s).run();
      const statuses = await legacyWrites(db);
      const after = all[k - 1];
      evidence.prefixes.push({ applied: k, last: after ? `${after.f}#${after.i}` : 'none', statuses });
      assert.deepEqual(statuses, [201, 200, 200, 200, 200, 200, 200, 200, 200], `prefix ${k}`);
      if (k === all.length) {
        evidence.final_system_state = await db.prepare('SELECT mode,generation FROM system_state').first();
        evidence.reports_triggers = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name='reports' ORDER BY name").all()).results.map(r => r.name);
      }
    } finally { await mf.dispose(); }
  }
  evidence.result = 'PASS';
  writeFileSync(join(HERE, '../.local/local-0002-safety.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS', statements: all.length, prefixes_tested: evidence.prefixes.length, final_system_state: evidence.final_system_state, reports_triggers: evidence.reports_triggers, ddl_objects: prodDDL.length }));
} finally { auth.restore(); }
