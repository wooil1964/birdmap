// Local proof only: not imported by either production Worker, no production bindings.
import { createHash } from 'node:crypto';
import { NOW } from './fixture.mjs';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
export const insert = (db, table, values) => db.prepare(`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`).bind(...Object.values(values));
export const legacyProjection = `SELECT checklist_id AS id,status,species_text AS species,
 actual_lat AS lat,actual_lon AS lon,public_lat,public_lon,approx_lat,approx_lon,pending_public,
 observation_date AS observed_on,received_at,decided_at,shared_bird_count AS bird_count,
 reporter,note,admin_note,site_id,name_public,spot_key,compat_ip_hash AS ip_hash,compat_dedupe_hash AS dedupe_hash
 FROM checklists WHERE record_mode IN ('legacy_report','quick_report') AND actual_lat IS NOT NULL AND actual_lon IS NOT NULL`;
// Keeps the current serializers and SQL predicates unchanged for a DTO comparison.
// This proof wrapper supports SELECT only. It is not a production query layer.
export function adapter(db) {
  return { prepare(sql) {
    if (!/^\s*SELECT\b/i.test(sql)) throw Error('read_only_adapter');
    return db.prepare(sql.replace(/\bFROM reports\b/g, `FROM (${legacyProjection}) AS reports`));
  } };
}
export function transformed(r, native = false) {
  // Multiple/ambiguous strings stay one unparsed source unit. No species/count distribution.
  const multiple = /[·,;\n/]/.test(r.species);
  const raw = {
    raw_id: `raw:${r.id}`, source_type: native ? 'native_submission' : 'legacy_reports_snapshot',
    source_id: r.id, request_id: native ? `submit:${r.id}` : null,
    payload_json: stable(r), submitted_at: native ? r.received_at : null, submitted_by: null,
    schema_version: 'phase2a-v1', captured_at: NOW, source_fingerprint: hash(r),
    non_breeding_confirmed: native ? 1 : null, policy_version: native ? 'non-breeding-v1' : null,
  };
  const checklist = {
    checklist_id: r.id, site_id: r.site_id, raw_id: raw.raw_id,
    source_type: native ? 'native' : 'legacy_reports', source_id: r.id,
    record_mode: native ? 'quick_report' : 'legacy_report', status: r.status,
    observation_date: r.observed_on, start_time: null, timezone: null,
    duration_minutes: null, distance_m: null, observer_count: null, protocol: null, complete_list: null,
    actual_lat: r.lat, actual_lon: r.lon, coordinate_uncertainty_m: null,
    approx_lat: r.approx_lat, approx_lon: r.approx_lon, public_lat: r.public_lat, public_lon: r.public_lon,
    coordinate_policy: native ? 'actual' : 'legacy_fallback', pending_public: r.pending_public,
    name_public: r.name_public, spot_key: r.spot_key, species_text: r.species,
    shared_bird_count: r.bird_count, reporter: r.reporter, note: r.note, admin_note: r.admin_note,
    received_at: r.received_at, decided_at: r.decided_at,
    compat_ip_hash: r.ip_hash, compat_dedupe_hash: r.dedupe_hash, created_at: NOW, revision: 1, updated_at: NOW,
  };
  const sighting = {
    sighting_id: `sighting:${r.id}:1`, checklist_id: r.id, source_ordinal: 1,
    species_original: r.species, species_identified: null,
    interpretation: multiple ? 'unparsed_multiple' : 'single', taxon_id: null,
    count_value: multiple ? null : r.bird_count, count_accuracy: 'unknown',
    count_source: multiple ? 'ambiguous_group' : (r.bird_count === null ? 'not_recorded' : (native ? 'reported' : 'legacy_single')),
    interpretation_note: null, created_at: NOW, updated_at: NOW,
  };
  return { raw, checklist, sighting };
}
export function migrationStatements(db, r, native = false) {
  const t = transformed(r, native);
  return [insert(db, 'raw_submissions', t.raw), insert(db, 'checklists', t.checklist), insert(db, 'sightings', t.sighting)];
}
export async function backfill(db, rows, runId = 'synthetic-21') {
  const manifest = hash({ version: 'phase2a-v1', rows: [...rows].sort((a,b) => a.id.localeCompare(b.id)) });
  const existing = await all(db, 'SELECT * FROM backfill_runs WHERE run_id=?', runId);
  if (existing.length) {
    if (existing[0].manifest_checksum !== manifest || existing[0].transform_version !== 'phase2a-v1') throw Error('manifest_drift');
    for (const r of rows) {
      const t = transformed(r);
      for (const [table, expected, key] of [['raw_submissions', t.raw, 'raw_id'], ['checklists', t.checklist, 'checklist_id'], ['sightings', t.sighting, 'sighting_id']]) {
        const got = await all(db, `SELECT * FROM ${table} WHERE ${key}=?`, expected[key]);
        if (stable(got[0]) !== stable(expected)) throw Error('partial_or_changed_backfill');
      }
    }
    return { added: 0, manifest };
  }
  // A tiny frozen snapshot fits one batch here. Production runner must preflight batch limits.
  const statements = rows.flatMap(r => migrationStatements(db, r));
  statements.push(insert(db, 'backfill_runs', { run_id: runId, manifest_checksum: manifest, transform_version: 'phase2a-v1', source_count: rows.length, completed_at: NOW, source_revision: 'synthetic-only' }));
  await db.batch(statements);
  return { added: rows.length, manifest };
}
export function validateQuick(body) {
  if (body.non_breeding_confirmed !== true) throw Error('non_breeding_confirmation_required');
  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90 ||
      typeof body.lon !== 'number' || !Number.isFinite(body.lon) || body.lon < -180 || body.lon > 180) throw Error('actual_coordinates_required');
}
export async function submitQuick(db, r, confirmation) {
  validateQuick({ ...r, non_breeding_confirmed: confirmation });
  // Synthetic proof payload includes explicit confirmation; never infer it from species/date.
  const canonical = transformed(r, true);
  canonical.raw.payload_json = stable({ ...r, non_breeding_confirmed: true });
  canonical.raw.source_fingerprint = hash({ ...r, non_breeding_confirmed: true });
  await db.batch([insert(db, 'reports', r), insert(db, 'raw_submissions', canonical.raw), insert(db, 'checklists', canonical.checklist), insert(db, 'sightings', canonical.sighting)]);
}
function assertion(db, key) {
  return db.prepare('INSERT INTO transaction_assertions(assertion_id,ok) VALUES (?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(key);
}
export async function reviewBatch(db, { id, requestId, expectedRevision, status, events, failMiddle = false }) {
  const meaning = { id, requestId, expectedRevision, status, events };
  const fingerprint = hash(meaning);
  const prior = await all(db, "SELECT * FROM audit_log WHERE request_id=? AND action='review' AND target_id=?", requestId, id);
  if (prior.length) {
    const saved = await all(db, 'SELECT * FROM reviews WHERE request_id=? ORDER BY event_index', requestId);
    if (prior[0].request_fingerprint !== fingerprint || saved.length !== events.length || saved.some((r,i) => r.sighting_id !== events[i].sightingId || r.validated_count !== events[i].count || r.validated_count_accuracy !== events[i].accuracy)) throw Error('idempotency_conflict');
    return { replay: true };
  }
  const before = (await all(db, 'SELECT status FROM checklists WHERE checklist_id=?', id))[0];
  const seq = (await all(db, 'SELECT COALESCE(MAX(sequence),0) AS n FROM reviews WHERE checklist_id=?', id))[0].n;
  const key = `cas:${requestId}`;
  const statements = [
    db.prepare('UPDATE checklists SET status=?,revision=revision+1,updated_at=? WHERE checklist_id=? AND revision=?').bind(status,NOW,id,expectedRevision),
    assertion(db,key), // MUST be immediately after CAS. D1 changes() is tested across batch statements.
    db.prepare('DELETE FROM transaction_assertions WHERE assertion_id=?').bind(key),
    db.prepare('UPDATE reports SET status=? WHERE id=?').bind(status,id), assertion(db,`${key}:report`),
    db.prepare('DELETE FROM transaction_assertions WHERE assertion_id=?').bind(`${key}:report`),
  ];
  if (failMiddle) statements.push(insert(db, 'transaction_assertions', { assertion_id: 'deliberate-failure', ok: 0 }));
  events.forEach((e,i) => {
    statements.push(db.prepare('UPDATE sightings SET count_value=?,count_accuracy=?,count_source=\'reviewed\',updated_at=? WHERE checklist_id=? AND sighting_id=?').bind(e.count,e.accuracy,NOW,id,e.sightingId));
    statements.push(assertion(db,`${key}:${i}`));
    statements.push(db.prepare('DELETE FROM transaction_assertions WHERE assertion_id=?').bind(`${key}:${i}`));
    statements.push(insert(db, 'reviews', {
      review_id: `review:${requestId}:${i}`, checklist_id: id, sequence: seq+i+1, decision: 'corrected',
      sighting_id: e.sightingId, validated_taxon_id: null, validated_count: e.count, validated_count_accuracy: e.accuracy,
      from_status: before?.status ?? null, to_status: status, actor_id: 'synthetic-admin', request_id: requestId,
      event_index: i, reason_code: 'synthetic_test', note: null, created_at: NOW,
    }));
  });
  statements.push(insert(db, 'audit_log', { audit_id: `audit:${requestId}`, actor_id: 'synthetic-admin', action: 'review', target_type: 'checklist', target_id: id, request_id: requestId, request_fingerprint: fingerprint, event_count: events.length, created_at: NOW }));
  await db.batch(statements);
  return { replay: false };
}
