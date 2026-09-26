// Phase 2E read-only Production checks (D1 REST SELECT + Cloudflare API GET + public/admin HTTP GET/POST that cannot write).
//   node prod-verify.mjs schema                 migrations 0001/0002/0003 installed exactly, reports unchanged shape
//   node prod-verify.mjs http <expect>          expect = maintenance | dual-frozen | open
//   node prod-verify.mjs backfill               canonical == legacy projection, count/site/provenance semantics
//   node prod-verify.mjs workers                versions, bindings, previews off, secret NAMES only
// Never prints coordinates, names, notes, species or secrets; only counts, hashes and statuses.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, apiGet, loadTarget, stats } from '../../../reports-api/tools/d1-rest.mjs';
import { fingerprint, stable, canonicalProjection, REPORT_COLUMNS } from '../../../reports-api/src/canonical/data.js';
import { prepareSiteSeed } from '../../../reports-api/tools/sites-seed.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)), ROOT = join(HERE, '../../..'), LOCAL = join(HERE, '../.local');
const t = loadTarget(join(HERE, '../targets/production.json')), db = t.database_id;
const [stage, expect] = process.argv.slice(2), out = { stage, at: new Date().toISOString(), checks: {} };
const ok = (name, cond, detail) => { out.checks[name] = { pass: !!cond, ...(detail !== undefined ? { detail } : {}) }; if (!cond) out.failed = true; };
const q = (sql, p) => read(t, db, sql, p);
const CANONICAL_TABLES = ['sites', 'taxa', 'raw_submissions', 'checklists', 'sightings', 'reviews', 'audit_log', 'backfill_runs', 'transaction_assertions'];

if (stage === 'schema') {
  const objects = (await q(`SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND tbl_name IN (${CANONICAL_TABLES.map(() => '?').join(',')}) ORDER BY type,name`, CANONICAL_TABLES))
    .map(r => ({ ...r, sql: r.sql.replace(/\s+/g, ' ').trim().replace(/;$/, '') }));
  ok('canonical_schema_hash', await fingerprint(objects) === '76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0');
  const migrations = (await q('SELECT name FROM d1_migrations ORDER BY id')).map(r => r.name);
  ok('d1_migrations', stable(migrations) === stable(['0001_core.sql', '0002_system_state.sql', '0003_captcha_redemptions.sql']), migrations);
  const gate = (await q("SELECT name FROM sqlite_schema WHERE type='trigger' AND name IN ('reports_freeze_insert','reports_freeze_update','system_state_permanent','system_state_transition') ORDER BY name")).map(r => r.name);
  ok('freeze_gate_triggers', gate.length === 4, gate);
  ok('system_state_row', (await q('SELECT COUNT(*) n FROM system_state'))[0].n === 1);
  const cols = (await q("SELECT name,\"notnull\" AS nn,pk FROM pragma_table_info('captcha_redemptions') ORDER BY cid"));
  ok('captcha_columns_exact', stable(cols) === stable([{ name: 'token_hash', nn: 1, pk: 1 }, { name: 'request_id', nn: 1, pk: 0 }, { name: 'redeemed_at', nn: 1, pk: 0 }]), cols.map(c => c.name));
  ok('captcha_cleanup_index', (await q("SELECT COUNT(*) n FROM sqlite_schema WHERE type='index' AND name='captcha_redemptions_redeemed_at'"))[0].n === 1);
  const reportCols = (await q("SELECT name FROM pragma_table_info('reports')")).map(r => r.name).sort();
  ok('reports_22_columns', stable(reportCols) === stable([...REPORT_COLUMNS].sort()));
  ok('fk_clean', (await q('PRAGMA foreign_key_check')).length === 0);
} else if (stage === 'workers') {
  for (const w of t.workers) {
    const s = await apiGet(t, `/workers/scripts/${w}/settings`), d = await apiGet(t, `/workers/scripts/${w}/deployments`), sub = await apiGet(t, `/workers/scripts/${w}/subdomain`);
    const dep = (d.deployments ?? d)[0], vars = Object.fromEntries(s.bindings.filter(b => b.type === 'plain_text' && /^REPORTS_|^ENVIRONMENT$/.test(b.name)).map(b => [b.name, b.text]));
    out.checks[w] = { versions: dep.versions, vars, secrets: s.bindings.filter(b => b.type === 'secret_text').map(b => b.name).sort(),
      d1: s.bindings.find(b => b.name === 'REPORTS_DB')?.id, peer: s.bindings.find(b => b.name === 'REPORTS_PEER')?.service ?? null, workers_dev: sub.enabled, previews: sub.previews_enabled };
    ok(w + ':d1', out.checks[w].d1 === db); ok(w + ':previews_off', sub.previews_enabled === false); ok(w + ':single_version', dep.versions.length === 1 && dep.versions[0].percentage === 100);
    if (expect) ok(w + ':mode', vars.REPORTS_WRITE_MODE === expect, vars.REPORTS_WRITE_MODE);
  }
  ok('no_custom_domains', (await apiGet(t, '/workers/domains')).filter(x => t.workers.includes(x.service)).length === 0);
} else if (stage === 'http') {
  const pub = 'https://birdmap-reports.wooil-birdmap.workers.dev', origin = { Origin: 'https://wooil1964.github.io' };
  const get = async p => { const r = await fetch(pub + p, { headers: origin }); return { status: r.status, body: await r.json().catch(() => null) }; };
  for (const p of ['/reports/approved', '/reports/pending']) ok('GET ' + p, (await get(p)).status === 200);
  const cap = await get('/reports/capabilities');
  // Legacy-format body (no request_id / confirmation). No valid token -> nothing can be stored on any path.
  const legacyBody = { species: 'phase2e-probe', lat: 37.5, lon: 127.0, observedOn: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), birdCount: 1, turnstileToken: 'invalid.phase2e-probe' };
  const post = await fetch(pub + '/reports', { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json' }, body: JSON.stringify(legacyBody) });
  const pb = await post.json().catch(() => null);
  out.checks.post = { status: post.status, code: pb?.error?.code, retryAfter: post.headers.get('Retry-After') };
  if (expect === 'maintenance') { ok('capabilities_maintenance', cap.body?.maintenance === true); ok('POST 503', post.status === 503 && pb?.error?.code === 'WRITE_MAINTENANCE' && post.headers.get('Retry-After') === '60'); }
  if (expect === 'dual-frozen' || expect === 'open') {
    ok('capabilities_canonical', cap.body?.quickReport?.nonBreedingConfirmation === true && cap.body?.quickReport?.requestId === true);
    // Reached the canonical path (legacy path would validate + Siteverify and answer 403).
    ok('legacy_format_rejected_by_canonical_path', post.status === 400 && pb?.error?.code === 'NON_BREEDING_CONFIRMATION_REQUIRED');
  }
  const jwtFile = t.access_jwt_file; let jwt = null; try { jwt = readFileSync(jwtFile, 'utf8').trim(); } catch {}
  if (jwt) {
    const auth = { 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt };
    const ag = await fetch(t.ops_url + '/admin/api/reports?status=approved', { headers: auth }); ok('admin GET', ag.status === 200, ag.status);
    const ac = await (await fetch(t.ops_url + '/admin/api/capabilities', { headers: auth })).json().catch(() => null);
    out.checks.admin_capability = { mode: ac?.mode, ready: ac?.ready, release: ac?.release };
    if (expect === 'maintenance') {
      const ap = await fetch(t.ops_url + '/admin/api/reports/00000000-0000-4000-8000-000000000000', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{"action":"approve"}' });
      ok('admin POST 503', ap.status === 503 && ap.headers.get('Retry-After') === '60', ap.status);
    }
    if (expect === 'dual-frozen' || expect === 'open') ok('admin_ready', ac?.ready === true && ac?.mode === 'CANONICAL_DUAL_WRITE');
  } else out.checks.admin = 'SKIPPED_NO_ACCESS_TOKEN';
} else if (stage === 'backfill') {
  const legacy = await q('SELECT * FROM reports ORDER BY id');
  const canonical = await q(canonicalProjection.replace('FROM checklists WHERE', "FROM checklists WHERE source_type='legacy_reports' AND") + ' ORDER BY checklist_id');
  const legacyIds = new Set((await q("SELECT checklist_id FROM checklists WHERE source_type='legacy_reports'")).map(r => r.checklist_id));
  const legacyRows = legacy.filter(r => legacyIds.has(r.id));
  const run = (await q('SELECT source_count FROM backfill_runs'))[0];
  ok('legacy_checklists_equal_backfill_N', run && legacyIds.size === run.source_count && legacyRows.length === legacyIds.size, { reports: legacy.length, legacy_checklists: legacyIds.size, backfill_N: run?.source_count });
  ok('projection_equal_22_fields', stable(canonical) === stable(legacyRows));
  const s = (await q("SELECT COUNT(*) n,SUM(count_accuracy='unknown') unknown_acc,SUM(count_value IS NULL) nulls,SUM(count_value=1) ones,SUM(interpretation<>'single') multi FROM sightings s JOIN checklists c USING(checklist_id) WHERE c.source_type='legacy_reports'"))[0];
  const src = (await q("SELECT SUM(bird_count IS NULL) nulls,SUM(bird_count=1) ones FROM reports WHERE id IN (SELECT checklist_id FROM checklists WHERE source_type='legacy_reports')"))[0];
  ok('count_semantics', s.unknown_acc === s.n && s.nulls === src.nulls && s.ones === src.ones && s.multi === 0, { sightings: s.n, nulls: s.nulls, ones: s.ones });
  ok('raw_provenance', (await q("SELECT COUNT(*) n FROM raw_submissions WHERE source_type='legacy_reports_snapshot' AND (submitted_at IS NOT NULL OR non_breeding_confirmed IS NOT NULL)"))[0].n === 0);
  if (expect !== 'after-reopen') ok('no_fabricated_reviews_audit (before reopen)', (await q("SELECT (SELECT COUNT(*) FROM reviews)+(SELECT COUNT(*) FROM audit_log WHERE action<>'forbidden_content_purged') n"))[0].n === 0);
  const registry = await prepareSiteSeed(readFileSync(join(ROOT, 'index.html'), 'utf8'), { capturedAt: new Date().toISOString() });
  const sites = await q('SELECT site_id,registry_revision FROM sites ORDER BY site_id');
  ok('site_registry_ids_unchanged', stable(sites.map(x => x.site_id)) === stable(registry.sites.map(x => x.site_id).sort()) && sites.every(x => x.registry_revision === registry.registry_revision), { sites: sites.length });
  ok('report_site_ids_in_registry', (await q('SELECT COUNT(*) n FROM reports WHERE site_id IS NOT NULL AND site_id NOT IN (SELECT site_id FROM sites)'))[0].n === 0);
  ok('fk_clean', (await q('PRAGMA foreign_key_check')).length === 0);
  ok('assertions_clean', (await q('SELECT COUNT(*) n FROM transaction_assertions'))[0].n === 0);
} else throw Error('usage: schema | workers [mode] | http <maintenance|dual-frozen|open> | backfill');
out.rest = stats;
writeFileSync(join(LOCAL, `verify-${stage}${expect ? '-' + expect : ''}-${Date.now()}.json`), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
process.exitCode = out.failed ? 2 : 0;
