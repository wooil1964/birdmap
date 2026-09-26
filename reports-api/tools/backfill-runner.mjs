// Production-prep backfill runner. N is always read from the frozen source; nothing is hard-coded.
//   --dry-run     --target t.json                              read + transform invariants, no files, no writes
//   --prepare     --target t.json --run-id ID --out m.json     READ ONLY; writes the local manifest only
//   --verify-only --target t.json --manifest m.json            READ ONLY; source + target equivalence
//   --apply       --target t.json --manifest m.json            one atomic batch through the admin ops route
// Production --apply additionally needs PHASE2E_PRODUCTION_WRITE_APPROVED (never set in Phase 2D.1).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadTarget, read, stats, assertWriteAllowed } from './d1-rest.mjs';
import { prepareBackfill, backfillRows } from './backfill-lib.mjs';
import { observe, guardSource, mismatches, manifestChecksum, MANIFEST_VERSION, SCHEMA_SQL } from '../src/canonical/ops.js';
import { stable, TRANSFORM_VERSION } from '../src/canonical/data.js';

const { values: a } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, prepare: { type: 'boolean' }, 'verify-only': { type: 'boolean' }, apply: { type: 'boolean' }, target: { type: 'string' }, 'run-id': { type: 'string' }, out: { type: 'string' }, manifest: { type: 'string' } } });
const mode = ['dry-run', 'prepare', 'verify-only', 'apply'].filter(m => a[m]);
const fail = (code, extra = {}) => { const e = Error(code); e.code = code; e.extra = extra; throw e; };

async function snapshot(t) {
  const db = t.database_id, tables = new Set((await read(t, db, "SELECT name FROM sqlite_schema WHERE type='table'")).map(r => r.name));
  const state = tables.has('system_state') ? (await read(t, db, 'SELECT mode,generation FROM system_state WHERE id=1'))[0] ?? null : null;
  const reports = await read(t, db, 'SELECT * FROM reports ORDER BY id');
  const sites = tables.has('sites') ? await read(t, db, 'SELECT * FROM sites ORDER BY site_id') : [];
  const schema = await read(t, db, SCHEMA_SQL);
  const canonical = tables.has('checklists');
  const tombstones = canonical ? (await read(t, db, "SELECT target_id FROM audit_log WHERE action='forbidden_content_purged'")).map(r => r.target_id) : [];
  const ledger = t.ledger_database_id ? (await read(t, t.ledger_database_id, 'SELECT source_id FROM purge_events')).map(r => r.source_id) : null;
  return { tables, state, reports, sites, schema, canonical, tombstones, ledger, observed: await observe({ state, schema, reports, sites }) };
}
function refusePurged(s) {
  const purged = new Set([...s.tombstones, ...(s.ledger || [])]);
  const back = s.reports.filter(r => purged.has(r.id)).length;
  if (back) fail('REPORT_PURGED', { resurrected_rows: back });
}
const planFor = (s, m) => prepareBackfill({ reports: s.reports, manifest_sha256: m.source_digest, source_count: m.source_row_count, transform_version: m.transform_version, registry_revision: m.site_registry_revision, captured_at: m.generated_at, run_id: m.run_id });
async function targetState(t, s, m) {
  if (!s.canonical) return 'SCHEMA_NOT_READY';
  const db = t.database_id, runs = await read(t, db, 'SELECT run_id,manifest_checksum,transform_version,source_count,source_revision FROM backfill_runs');
  const found = {};
  for (const [table, key] of [['raw_submissions', 'raw_id'], ['checklists', 'checklist_id'], ['sightings', 'sighting_id']]) found[table] = await read(t, db, `SELECT * FROM ${table} ORDER BY ${key}`);
  if (!runs.length && Object.values(found).every(r => !r.length)) return 'READY_EMPTY';
  const values = await backfillRows(await planFor(s, m));
  if (runs.length !== 1 || stable(runs[0]) !== stable({ run_id: m.run_id, manifest_checksum: m.source_digest, transform_version: m.transform_version, source_count: m.source_row_count, source_revision: m.site_registry_revision })) return 'MANIFEST_OR_PARTIAL_STATE';
  for (const [table, field, key] of [['raw_submissions', 'raw', 'raw_id'], ['checklists', 'checklist', 'checklist_id'], ['sightings', 'sighting', 'sighting_id']])
    if (stable(found[table]) !== stable(values.map(v => v[field]).sort((x, y) => x[key].localeCompare(y[key])))) return 'PARTIAL_OR_DRIFT';
  if ((await read(t, db, 'PRAGMA foreign_key_check')).length) return 'FOREIGN_KEY_ERROR';
  return 'VERIFIED';
}
async function verifySource(t, m) {
  if (m.manifest_version !== MANIFEST_VERSION || m.manifest_checksum !== await manifestChecksum(m)) fail('MANIFEST_INVALID');
  if (m.database_id !== t.database_id) fail('MANIFEST_TARGET_MISMATCH');
  const s = await snapshot(t);
  if (s.observed.freeze_generation === null) fail('FREEZE_REQUIRED');
  const differ = mismatches(m, s.observed);
  if (differ.length) fail('MANIFEST_MISMATCH', { fields: differ });
  guardSource(s.reports); refusePurged(s);
  return s;
}

try {
  if (mode.length !== 1 || !a.target) fail('USAGE');
  const t = loadTarget(a.target);
  let out;
  if (mode[0] === 'dry-run') {
    const s = await snapshot(t);
    guardSource(s.reports); refusePurged(s);
    const plan = await prepareBackfill({ reports: s.reports, manifest_sha256: s.observed.source_digest, source_count: s.reports.length, transform_version: TRANSFORM_VERSION, registry_revision: s.observed.site_registry_revision || 'dry-run', captured_at: new Date().toISOString(), run_id: 'dry-run' });
    const values = await backfillRows(plan);
    out = { source_row_count: plan.source_count, approved: s.observed.approved_count, rejected: s.observed.rejected_count, pending: s.observed.pending_count,
      expected_rows: { raw_submissions: values.length, checklists: values.length, sightings: values.length }, count_one: values.filter(v => v.sighting.count_value === 1).length,
      count_null: values.filter(v => v.sighting.count_value === null).length, site_null: values.filter(v => v.checklist.site_id === null).length,
      multi_species: values.filter(v => v.sighting.interpretation !== 'single').length, frozen: s.observed.freeze_generation !== null, batch_statements: 3 * values.length + 3 };
  } else if (mode[0] === 'prepare') {
    if (!a['run-id'] || !a.out || existsSync(a.out)) fail('USAGE_OR_MANIFEST_EXISTS');
    const s = await snapshot(t);
    if (s.observed.freeze_generation === null) fail('FREEZE_REQUIRED');
    if (!s.canonical || s.observed.site_count === 0 || !s.observed.site_registry_revision) fail('SCHEMA_OR_REGISTRY_NOT_READY');
    guardSource(s.reports); refusePurged(s);
    const m = { manifest_version: MANIFEST_VERSION, database_id: t.database_id, run_id: a['run-id'], generated_at: new Date().toISOString(), ...s.observed };
    await backfillRows(await planFor(s, m));                       // full transform must succeed before a manifest exists
    const again = await snapshot(t);                               // source unchanged across the whole read window
    if (mismatches(m, again.observed).length) fail('SOURCE_CHANGED_DURING_PREPARE');
    m.manifest_checksum = await manifestChecksum(m);
    writeFileSync(a.out, JSON.stringify(m, null, 2) + '\n', { flag: 'wx' });
    out = { manifest: a.out, run_id: m.run_id, source_row_count: m.source_row_count, freeze_generation: m.freeze_generation, target_state: await targetState(t, s, m) };
  } else {
    const m = JSON.parse(readFileSync(a.manifest, 'utf8'));
    const s = await verifySource(t, m);
    if (mode[0] === 'apply') {
      assertWriteAllowed(t, t.database_id);
      const state = await targetState(t, s, m);
      if (state === 'VERIFIED') out = { state: 'verified', added: 0 };
      else if (state !== 'READY_EMPTY') fail(state);
      else {
        const jwt = readFileSync(t.access_jwt_file, 'utf8').trim(), headers = { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt, ...(t.extra_headers_file ? JSON.parse(readFileSync(t.extra_headers_file, 'utf8')) : {}) };
        const r = await fetch(t.ops_url + '/admin/api/ops/backfill', { method: 'POST', headers, body: JSON.stringify(m) });
        const body = await r.json().catch(() => ({}));
        if (r.status !== 200 || body.ok !== true) fail('APPLY_FAILED', { status: r.status, code: body.error?.code, message: body.error?.message });
        out = { state: body.state, added: body.added, statements: body.statements };
      }
      out.after = await targetState(t, await verifySource(t, m), m);
      if (out.after !== 'VERIFIED') fail('POST_APPLY_VERIFY_FAILED', { after: out.after });
    } else out = { source: 'MATCH', target_state: await targetState(t, s, m) };
  }
  console.log(JSON.stringify({ mode: mode[0], target: t.name, ...out, rest: stats }));
} catch (e) {
  console.error(JSON.stringify({ mode: mode[0], error: e.code || 'RUNNER_FAILED', ...(e.extra || {}), ...(e.code ? {} : { message: String(e.message).slice(0, 300) }), rest: stats }));
  process.exitCode = 1;
}
