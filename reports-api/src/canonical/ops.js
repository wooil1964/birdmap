// Operator-only cutover steps (seed, backfill). Reachable only through the Access-protected admin
// Worker when REPORTS_OPS_ENABLED='true'. Every write batch re-checks, inside the same D1 transaction,
// that the database is frozen at the manifest's freeze generation.
// Query count is constant in N (D1 per-invocation query limit), the write is one atomic db.batch().
import { rows, first, fail, stable, fingerprint, insert, assertion, clearAssertion, TRANSFORM_VERSION } from './data.js';
import { prepareBackfill, backfillRows } from '../../tools/backfill-lib.mjs';

export const MANIFEST_VERSION = 'phase2d1-backfill-v1';
const MULTI = /[·,;\n/]/;
export const SCHEMA_SQL = "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name";
const COUNTS_SQL = 'SELECT (SELECT COUNT(*) FROM raw_submissions) raw_submissions,(SELECT COUNT(*) FROM checklists) checklists,(SELECT COUNT(*) FROM sightings) sightings,(SELECT COUNT(*) FROM backfill_runs) backfill_runs';
const MANIFEST_FIELDS = ['source_row_count','approved_count','rejected_count','pending_count','max_received_at','max_decided_at','source_digest','schema_fingerprint','site_registry_revision','site_registry_checksum','site_count','transform_version','freeze_generation'];

// Legacy "several species + one shared count" has no approved migration policy: never split, copy or null it.
export function guardSource(reports) {
  const shared = reports.filter(r => MULTI.test(String(r.species)) && r.bird_count !== null).length;
  if (shared) fail('LEGACY_SHARED_MULTI_SPECIES_COUNT', `여러 종+공유 수량 legacy ${shared}건: 운영자 정책 승인 전 중단합니다.`, 409);
}
// Everything a manifest pins, computed from rows read in one consistent state. No payload values leave here.
export async function observe({ state, schema, reports, sites }) {
  const sorted = [...reports].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const max = key => sorted.reduce((m, r) => (r[key] !== null && r[key] > m ? r[key] : m), null);
  const revisions = [...new Set(sites.map(s => s.registry_revision))];
  return {
    source_row_count: sorted.length,
    approved_count: sorted.filter(r => r.status === 'approved').length,
    rejected_count: sorted.filter(r => r.status === 'rejected').length,
    pending_count: sorted.filter(r => r.status === 'pending').length,
    max_received_at: max('received_at'), max_decided_at: max('decided_at'),
    source_digest: await fingerprint({ reports: sorted }),
    schema_fingerprint: await fingerprint(schema),
    site_registry_revision: revisions.length === 1 ? revisions[0] : null,
    site_registry_checksum: await fingerprint([...sites].sort((a, b) => a.site_id.localeCompare(b.site_id))),
    site_count: sites.length,
    transform_version: TRANSFORM_VERSION,
    freeze_generation: state?.mode === 'READ_ONLY_MAINTENANCE' ? state.generation : null,
  };
}
export const manifestChecksum = m => fingerprint(Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'manifest_checksum')));
export function mismatches(manifest, observed) { return MANIFEST_FIELDS.filter(k => stable(manifest[k]) !== stable(observed[k])); }

function verifyRegistry(sites, revision) {
  const source = sites.map(s => {
    let raw; try { raw = JSON.parse(s.source_record_json); } catch { fail('REGISTRY_DRIFT', 'registry 원본을 확인해야 합니다.'); }
    if (raw.id !== s.site_id || raw.name !== s.site_name || (raw.lat ?? null) !== s.lat || (raw.lon ?? null) !== s.lon || s.retired_at !== null || s.registry_revision !== revision) fail('REGISTRY_DRIFT', 'registry 원본과 현재 값이 다릅니다.');
    return raw;
  });
  return fingerprint(source.sort((a, b) => a.id.localeCompare(b.id)));
}
const frozenGuard = (db, key, generation, sourceCount) => assertion(db, key,
  "EXISTS (SELECT 1 FROM system_state WHERE id=1 AND mode='READ_ONLY_MAINTENANCE' AND generation=?) AND (SELECT COUNT(*) FROM reports)=?", [generation, sourceCount]);

async function equivalence(db, plan, values) {
  const runs = await rows(db, 'SELECT run_id,manifest_checksum,transform_version,source_count,source_revision FROM backfill_runs');
  const counts = await first(db, COUNTS_SQL);
  if (runs.length !== 1 || stable(runs[0]) !== stable({ run_id: plan.run_id, manifest_checksum: plan.manifest_sha256, transform_version: plan.transform_version, source_count: plan.source_count, source_revision: plan.registry_revision }))
    fail('MANIFEST_OR_PARTIAL_STATE', 'manifest 변경 또는 부분 상태입니다. 자동 덮어쓰지 않습니다.');
  for (const [table, field, key] of [['raw_submissions', 'raw', 'raw_id'], ['checklists', 'checklist', 'checklist_id'], ['sightings', 'sighting', 'sighting_id']]) {
    if (counts[table] !== plan.source_count) fail('PARTIAL_STATE', 'backfill 행 수가 다릅니다.');
    const found = await rows(db, `SELECT * FROM ${table} ORDER BY ${key}`), expected = values.map(v => v[field]).sort((a, b) => a[key].localeCompare(b[key]));
    if (stable(found) !== stable(expected)) fail('BACKFILL_DRIFT', 'backfill 전체 동등성 검증에 실패했습니다.');
  }
  if ((await rows(db, 'PRAGMA foreign_key_check')).length) fail('FOREIGN_KEY_ERROR', '참조 무결성 오류가 있습니다.');
}

export async function applyBackfill(db, manifest) {
  if (manifest?.manifest_version !== MANIFEST_VERSION || !manifest.run_id || !manifest.generated_at || manifest.manifest_checksum !== await manifestChecksum(manifest)) fail('MANIFEST_INVALID', 'prepared manifest가 필요합니다.', 400);
  const state = await first(db, 'SELECT mode,generation FROM system_state WHERE id=1');
  const schema = await rows(db, SCHEMA_SQL), reports = await rows(db, 'SELECT * FROM reports ORDER BY id'), sites = await rows(db, 'SELECT * FROM sites ORDER BY site_id');
  const observed = await observe({ state, schema, reports, sites });
  if (observed.freeze_generation === null) fail('FREEZE_REQUIRED', 'system_state가 READ_ONLY_MAINTENANCE가 아닙니다.', 409);
  const differ = mismatches(manifest, observed);
  if (differ.length) fail('MANIFEST_MISMATCH', 'frozen source가 manifest와 다릅니다: ' + differ.join(','), 409);
  guardSource(reports);
  if (await verifyRegistry(sites, manifest.site_registry_revision) !== manifest.site_registry_revision) fail('REGISTRY_DRIFT', 'registry checksum이 다릅니다.');
  const known = new Set(sites.map(s => s.site_id));
  if (reports.some(r => r.site_id !== null && !known.has(r.site_id))) fail('SITE_ID_UNKNOWN', '기존 site_id가 registry에 없습니다.');
  const purged = new Set((await rows(db, "SELECT target_id FROM audit_log WHERE action='forbidden_content_purged'")).map(a => a.target_id));
  if (reports.some(r => purged.has(r.id))) fail('REPORT_PURGED', '폐기된 자료가 source에 다시 나타났습니다.');
  const plan = await prepareBackfill({ reports, manifest_sha256: manifest.source_digest, source_count: manifest.source_row_count, transform_version: manifest.transform_version, registry_revision: manifest.site_registry_revision, captured_at: manifest.generated_at, run_id: manifest.run_id });
  const values = await backfillRows(plan);
  const counts = await first(db, COUNTS_SQL);
  if (Object.values(counts).some(n => n !== 0)) { await equivalence(db, plan, values); return { state: 'verified', added: 0, source_count: plan.source_count }; }
  const key = `backfill:${plan.run_id}`, statements = [frozenGuard(db, key, manifest.freeze_generation, plan.source_count), clearAssertion(db, key)];
  for (const v of values) statements.push(insert(db, 'raw_submissions', v.raw), insert(db, 'checklists', v.checklist), insert(db, 'sightings', v.sighting));
  statements.push(insert(db, 'backfill_runs', { run_id: plan.run_id, manifest_checksum: plan.manifest_sha256, transform_version: plan.transform_version, source_count: plan.source_count, completed_at: new Date().toISOString(), source_revision: plan.registry_revision }));
  await db.batch(statements);
  await equivalence(db, plan, values);
  return { state: 'applied', added: plan.source_count, statements: statements.length };
}

// Registry seed from the operator's prepared plan (tools/prepare-sites.mjs), frozen, one batch.
export async function applySeed(db, plan) {
  const sites = plan?.sites;
  if (!Array.isArray(sites) || sites.length !== plan.source_count || new Set(sites.map(s => s.site_id)).size !== sites.length) fail('REGISTRY_INVALID', '탐조지 seed plan을 확인해야 합니다.', 400);
  if (await verifyRegistry(sites, plan.registry_revision) !== plan.registry_revision) fail('REGISTRY_INVALID', 'registry checksum이 다릅니다.', 400);
  const state = await first(db, 'SELECT mode,generation FROM system_state WHERE id=1');
  if (state?.mode !== 'READ_ONLY_MAINTENANCE') fail('FREEZE_REQUIRED', 'system_state가 READ_ONLY_MAINTENANCE가 아닙니다.', 409);
  const expected = stable([...sites].sort((a, b) => a.site_id.localeCompare(b.site_id)));
  const current = await rows(db, 'SELECT * FROM sites ORDER BY site_id');
  if (current.length) { if (stable(current) !== expected) fail('REGISTRY_DRIFT', '기존 registry가 다릅니다. ID를 수정/병합하지 않습니다.'); return { state: 'verified', added: 0 }; }
  const key = `seed:${plan.registry_revision}`;
  await db.batch([assertion(db, key, "EXISTS (SELECT 1 FROM system_state WHERE id=1 AND mode='READ_ONLY_MAINTENANCE' AND generation=?) AND NOT EXISTS (SELECT 1 FROM sites)", [state.generation]), clearAssertion(db, key), ...sites.map(s => insert(db, 'sites', s))]);
  if (stable(await rows(db, 'SELECT * FROM sites ORDER BY site_id')) !== expected) fail('SEED_VERIFY_FAILED', 'seed 검증에 실패했습니다.');
  return { state: 'applied', added: sites.length };
}
