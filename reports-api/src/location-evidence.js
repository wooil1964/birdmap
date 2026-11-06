// Immutable native submissions are the only source of non-breeding evidence.
// Approval, season and caller-supplied flags never establish confirmation.
export function locationEvidenceColumns(env) {
  if (env?.REPORTS_WRITE_MODE !== 'CANONICAL_DUAL_WRITE') return 'NULL AS non_breeding_confirmed, NULL AS location_input';
  const source = `FROM checklists AS location_checklist JOIN raw_submissions AS location_raw ON location_raw.raw_id=location_checklist.raw_id
    WHERE location_checklist.checklist_id=reports.id AND location_checklist.source_type='native'
      AND location_raw.source_type='native_submission' AND location_raw.source_id=reports.id
      AND location_raw.request_id=reports.id AND location_raw.schema_version='quick-v1'
      AND location_raw.policy_version='non-breeding-v1' AND location_raw.non_breeding_confirmed=1`;
  return `(SELECT location_raw.non_breeding_confirmed ${source}) AS non_breeding_confirmed,
    (SELECT json_extract(location_raw.payload_json,'$.input') ${source}) AS location_input`;
}
