-- PHASE 1 DESIGN ONLY. NOT EXECUTED.
-- Aggregate integrity verification; order: after 1005 and during shadow-read.
-- Requires target schema/manifests. Read-only rerun; expected zero except documented baseline counts.
-- Rollback: no DB mutation; on mismatch halt cutover and use old reader.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- READ-ONLY future verification after schema/seed/backfill; bind manifest parameters.
-- Run in same consistent read batch; compare counts only, never select private values.
-- :site_ids_json, :fixed_spot_keys_json, :cohort_ids_json contain pinned source manifests.

SELECT COUNT(*) AS fk_violation_count FROM pragma_foreign_key_check;
SELECT COUNT(*) AS missing_sites FROM json_each(:site_ids_json) j
WHERE NOT EXISTS(SELECT 1 FROM sites s WHERE s.site_id=CAST(j.value AS TEXT));
SELECT COUNT(*) AS extra_initial_sites FROM sites s
WHERE NOT EXISTS(SELECT 1 FROM json_each(:site_ids_json) j WHERE CAST(j.value AS TEXT)=s.site_id);
SELECT COUNT(*) AS missing_cohort_checklists FROM json_each(:cohort_ids_json) j
WHERE NOT EXISTS(SELECT 1 FROM checklists c WHERE c.source_type='legacy_reports' AND c.source_id=j.value);
-- A known policy-purged cohort ID is a separately reviewed exception, never silently omitted.
SELECT COUNT(*) AS reports_without_mirror FROM reports r
WHERE NOT EXISTS(SELECT 1 FROM checklists c WHERE c.checklist_id=r.id);
SELECT COUNT(*) AS mirrors_without_reports FROM checklists c
WHERE NOT EXISTS(SELECT 1 FROM reports r WHERE r.id=c.checklist_id);
-- Applies only while all accepted modes must be legacy-representable.
SELECT COUNT(*) AS current_22_field_mismatches FROM reports r
JOIN checklists c ON c.checklist_id=r.id WHERE
  c.checklist_id IS NOT r.id
  OR c.status IS NOT r.status
  OR c.species_text IS NOT r.species
  OR c.actual_lat IS NOT r.lat
  OR c.actual_lon IS NOT r.lon
  OR c.public_lat IS NOT r.public_lat
  OR c.public_lon IS NOT r.public_lon
  OR c.approx_lat IS NOT r.approx_lat
  OR c.approx_lon IS NOT r.approx_lon
  OR c.pending_public IS NOT r.pending_public
  OR c.observation_date IS NOT r.observed_on
  OR c.received_at IS NOT r.received_at
  OR c.decided_at IS NOT r.decided_at
  OR c.shared_bird_count IS NOT r.bird_count
  OR c.reporter IS NOT r.reporter
  OR c.note IS NOT r.note
  OR c.admin_note IS NOT r.admin_note
  OR c.site_id IS NOT r.site_id
  OR c.name_public IS NOT r.name_public
  OR c.spot_key IS NOT r.spot_key
  OR c.compat_ip_hash IS NOT r.ip_hash
  OR c.compat_dedupe_hash IS NOT r.dedupe_hash;
SELECT source_type,status,COUNT(*) AS n FROM checklists GROUP BY source_type,status;
SELECT COUNT(*) AS invalid_site_fk FROM checklists c WHERE site_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM sites s WHERE s.site_id=c.site_id);
SELECT COUNT(*) AS missing_raw_or_wrong_source FROM checklists c
LEFT JOIN raw_submissions r ON r.raw_id=c.raw_id WHERE r.raw_id IS NULL OR r.source_id<>c.source_id
 OR (c.source_type='legacy_reports' AND r.source_type<>'legacy_reports_snapshot')
 OR (c.source_type='native' AND r.source_type<>'native_submission');
SELECT COUNT(*) AS invented_legacy_effort FROM checklists WHERE source_type='legacy_reports' AND revision=1
AND (start_time IS NOT NULL OR timezone IS NOT NULL OR duration_minutes IS NOT NULL
 OR distance_m IS NOT NULL OR observer_count IS NOT NULL OR protocol IS NOT NULL OR complete_list IS NOT NULL);
SELECT COUNT(*) AS false_legacy_confirmation FROM raw_submissions
WHERE source_type='legacy_reports_snapshot' AND (non_breeding_confirmed IS NOT NULL OR policy_version IS NOT NULL);
SELECT COUNT(*) AS missing_native_confirmation FROM raw_submissions
WHERE source_type='native_submission' AND (non_breeding_confirmed IS NOT 1 OR policy_version IS NULL);
SELECT COUNT(*) AS duplicate_source_groups FROM
 (SELECT source_type,source_id FROM checklists GROUP BY source_type,source_id HAVING COUNT(*)<>1);
SELECT COUNT(*) AS missing_or_extra_initial_sightings FROM checklists c
WHERE source_type='legacy_reports' AND revision=1
AND (SELECT COUNT(*) FROM sightings s WHERE s.checklist_id=c.checklist_id)<>1;
SELECT COUNT(*) AS initial_species_loss FROM checklists c JOIN sightings s ON s.checklist_id=c.checklist_id
WHERE c.source_type='legacy_reports' AND c.revision=1 AND s.species_original IS NOT c.species_text;
SELECT COUNT(*) AS initial_count_or_taxon_errors FROM checklists c JOIN sightings s ON s.checklist_id=c.checklist_id
WHERE c.source_type='legacy_reports' AND c.revision=1 AND
 (s.taxon_id IS NOT NULL OR s.species_identified IS NOT NULL OR s.count_accuracy<>'unknown'
 OR (s.interpretation='single' AND s.count_value IS NOT c.shared_bird_count)
 OR (s.interpretation<>'single' AND s.count_value IS NOT NULL));
SELECT COUNT(*) AS initial_raw_projection_mismatch FROM checklists c JOIN raw_submissions raw ON raw.raw_id=c.raw_id
WHERE c.source_type='legacy_reports' AND c.revision=1 AND (
 json_extract(raw.payload_json,'$.id') IS NOT c.checklist_id
 OR json_extract(raw.payload_json,'$.status') IS NOT c.status
 OR json_extract(raw.payload_json,'$.species') IS NOT c.species_text
 OR json_extract(raw.payload_json,'$.lat') IS NOT c.actual_lat
 OR json_extract(raw.payload_json,'$.lon') IS NOT c.actual_lon
 OR json_extract(raw.payload_json,'$.public_lat') IS NOT c.public_lat
 OR json_extract(raw.payload_json,'$.public_lon') IS NOT c.public_lon
 OR json_extract(raw.payload_json,'$.approx_lat') IS NOT c.approx_lat
 OR json_extract(raw.payload_json,'$.approx_lon') IS NOT c.approx_lon
 OR json_extract(raw.payload_json,'$.pending_public') IS NOT c.pending_public
 OR json_extract(raw.payload_json,'$.observed_on') IS NOT c.observation_date
 OR json_extract(raw.payload_json,'$.received_at') IS NOT c.received_at
 OR json_extract(raw.payload_json,'$.decided_at') IS NOT c.decided_at
 OR json_extract(raw.payload_json,'$.bird_count') IS NOT c.shared_bird_count
 OR json_extract(raw.payload_json,'$.reporter') IS NOT c.reporter
 OR json_extract(raw.payload_json,'$.note') IS NOT c.note
 OR json_extract(raw.payload_json,'$.admin_note') IS NOT c.admin_note
 OR json_extract(raw.payload_json,'$.site_id') IS NOT c.site_id
 OR json_extract(raw.payload_json,'$.name_public') IS NOT c.name_public
 OR json_extract(raw.payload_json,'$.spot_key') IS NOT c.spot_key
 OR json_extract(raw.payload_json,'$.ip_hash') IS NOT c.compat_ip_hash
 OR json_extract(raw.payload_json,'$.dedupe_hash') IS NOT c.compat_dedupe_hash
);
SELECT COUNT(*) AS orphan_spot FROM checklists c WHERE c.spot_key IS NOT NULL AND
 ((c.spot_key NOT LIKE 'fixed:%' AND NOT EXISTS(SELECT 1 FROM checklists p WHERE p.checklist_id=c.spot_key))
  OR (c.spot_key LIKE 'fixed:%' AND NOT EXISTS(SELECT 1 FROM json_each(:fixed_spot_keys_json) j WHERE j.value=c.spot_key)));
SELECT COUNT(*) AS self_or_chain_spot FROM checklists c LEFT JOIN checklists p ON p.checklist_id=c.spot_key
WHERE c.spot_key=c.checklist_id OR (c.spot_key IS NOT NULL AND p.spot_key IS NOT NULL);
SELECT
 COUNT(*) FILTER(WHERE public_lat IS NULL AND public_lon IS NULL) AS public_both_null,
 COUNT(*) FILTER(WHERE (public_lat IS NULL)<>(public_lon IS NULL)) AS public_partial,
 COUNT(*) FILTER(WHERE approx_lat IS NULL AND approx_lon IS NULL) AS approx_both_null,
 COUNT(*) FILTER(WHERE (approx_lat IS NULL)<>(approx_lon IS NULL)) AS approx_partial,
 COUNT(*) FILTER(WHERE status='approved' AND coordinate_policy='legacy_fallback'
                  AND public_lat IS NULL AND public_lon IS NULL) AS legacy_approved_actual_pair,
 COUNT(*) FILTER(WHERE status='approved' AND pending_public=1) AS approved_pending_flag_retained
FROM checklists;
SELECT name_public,COUNT(*) AS n FROM checklists GROUP BY name_public;
SELECT COUNT(*) AS leftover_permits FROM mutation_permits;
SELECT COUNT(*) AS leftover_assertions FROM migration_assertions;
SELECT COUNT(*) AS resurrected_purged_reports FROM audit_log a
WHERE a.action='forbidden_content_purged' AND a.target_type='report'
AND (EXISTS(SELECT 1 FROM reports r WHERE r.id=a.target_id)
 OR EXISTS(SELECT 1 FROM checklists c WHERE c.checklist_id=a.target_id)
 OR EXISTS(SELECT 1 FROM raw_submissions raw WHERE raw.source_id=a.target_id));
SELECT COUNT(*) AS legacy_backfill_fake_reviews FROM reviews v JOIN checklists c ON c.checklist_id=v.checklist_id
WHERE c.source_type='legacy_reports' AND c.revision=1;
-- No audit rows should be generated by the backfill runner; verify request/run IDs separately.
SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version;
SELECT name,sql FROM sqlite_schema WHERE name IN ('reports_site_history','checklists_site_history');
-- Index performance: future EXPLAIN QUERY PLAN with synthetic/sanitized workload, not executed here.
-- Verify JSON response parity in memory with current adapters; aggregate diffs only.
-- Verify date formats, SHA-256 fingerprints, JSON key-presence (missing vs null),
-- taxonomy cycles/split-merge provenance and strict UTC/timezone through the future runner.

SELECT COUNT(*) AS review_sighting_parent_mismatch FROM reviews v
WHERE v.sighting_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM sightings s WHERE s.sighting_id=v.sighting_id AND s.checklist_id=v.checklist_id);
SELECT COUNT(*) AS invented_initial_uncertainty FROM checklists
WHERE source_type='legacy_reports' AND revision=1 AND coordinate_uncertainty_m IS NOT NULL;
SELECT COUNT(*) AS invented_original_submission_time FROM raw_submissions
WHERE source_type='legacy_reports_snapshot' AND (submitted_at IS NOT NULL OR submitted_by IS NOT NULL);
