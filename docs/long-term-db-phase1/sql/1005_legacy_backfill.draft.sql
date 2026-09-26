-- PHASE 1 DESIGN ONLY. DO NOT EXECUTE.
-- Import one existing report; migration 1005, after 1004 AND both guarded pair writers.
-- Existing source identities must be validated then skipped; this is first-import branch only.
-- Verify 1090 and API shadow parity; rollback failed row batch, keep reports/new data.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- PARAMETERIZED PER-REPORT TEMPLATE; submit ALL statements as ONE D1 batch.
-- This is the first-import branch only. Existing identities are verified and skipped
-- by the future runner; NEVER append ON CONFLICT DO UPDATE/REPLACE.
-- Bind :report_id, :expected_report_json (all 22 fields in schema order),
-- :source_fingerprint (SHA-256 of canonical expected JSON), :captured_at UTC,
-- :writer_epoch, :assertion_id, :interpretation ('single'/'unparsed_multiple'/'unknown').
-- :interpretation is determined by reviewed preflight, never a taxon guess.
-- Preflight multi/ambiguous string remains ONE unresolved sighting with full original.
-- Runner MUST check independently retained purge tombstones before dispatch.

INSERT INTO migration_assertions(assertion_id,ok)
VALUES (:assertion_id,CASE WHEN
  EXISTS (SELECT 1 FROM migration_control WHERE singleton=1 AND guards_enabled=1
          AND writer_mode='pair' AND writer_epoch=:writer_epoch)
  AND EXISTS (SELECT 1 FROM reports r WHERE r.id=:report_id AND (json_type(:expected_report_json)='object' AND (SELECT COUNT(*) FROM json_each(:expected_report_json))=22
      AND json_type(:expected_report_json,'$.id') IS NOT NULL AND json_extract(:expected_report_json,'$.id') IS r.id
      AND json_type(:expected_report_json,'$.status') IS NOT NULL AND json_extract(:expected_report_json,'$.status') IS r.status
      AND json_type(:expected_report_json,'$.species') IS NOT NULL AND json_extract(:expected_report_json,'$.species') IS r.species
      AND json_type(:expected_report_json,'$.lat') IS NOT NULL AND json_extract(:expected_report_json,'$.lat') IS r.lat
      AND json_type(:expected_report_json,'$.lon') IS NOT NULL AND json_extract(:expected_report_json,'$.lon') IS r.lon
      AND json_type(:expected_report_json,'$.public_lat') IS NOT NULL AND json_extract(:expected_report_json,'$.public_lat') IS r.public_lat
      AND json_type(:expected_report_json,'$.public_lon') IS NOT NULL AND json_extract(:expected_report_json,'$.public_lon') IS r.public_lon
      AND json_type(:expected_report_json,'$.approx_lat') IS NOT NULL AND json_extract(:expected_report_json,'$.approx_lat') IS r.approx_lat
      AND json_type(:expected_report_json,'$.approx_lon') IS NOT NULL AND json_extract(:expected_report_json,'$.approx_lon') IS r.approx_lon
      AND json_type(:expected_report_json,'$.pending_public') IS NOT NULL AND json_extract(:expected_report_json,'$.pending_public') IS r.pending_public
      AND json_type(:expected_report_json,'$.observed_on') IS NOT NULL AND json_extract(:expected_report_json,'$.observed_on') IS r.observed_on
      AND json_type(:expected_report_json,'$.received_at') IS NOT NULL AND json_extract(:expected_report_json,'$.received_at') IS r.received_at
      AND json_type(:expected_report_json,'$.decided_at') IS NOT NULL AND json_extract(:expected_report_json,'$.decided_at') IS r.decided_at
      AND json_type(:expected_report_json,'$.bird_count') IS NOT NULL AND json_extract(:expected_report_json,'$.bird_count') IS r.bird_count
      AND json_type(:expected_report_json,'$.reporter') IS NOT NULL AND json_extract(:expected_report_json,'$.reporter') IS r.reporter
      AND json_type(:expected_report_json,'$.note') IS NOT NULL AND json_extract(:expected_report_json,'$.note') IS r.note
      AND json_type(:expected_report_json,'$.admin_note') IS NOT NULL AND json_extract(:expected_report_json,'$.admin_note') IS r.admin_note
      AND json_type(:expected_report_json,'$.site_id') IS NOT NULL AND json_extract(:expected_report_json,'$.site_id') IS r.site_id
      AND json_type(:expected_report_json,'$.name_public') IS NOT NULL AND json_extract(:expected_report_json,'$.name_public') IS r.name_public
      AND json_type(:expected_report_json,'$.spot_key') IS NOT NULL AND json_extract(:expected_report_json,'$.spot_key') IS r.spot_key
      AND json_type(:expected_report_json,'$.ip_hash') IS NOT NULL AND json_extract(:expected_report_json,'$.ip_hash') IS r.ip_hash
      AND json_type(:expected_report_json,'$.dedupe_hash') IS NOT NULL AND json_extract(:expected_report_json,'$.dedupe_hash') IS r.dedupe_hash))
  AND NOT EXISTS (SELECT 1 FROM checklists WHERE checklist_id=:report_id OR (source_type='legacy_reports' AND source_id=:report_id))
  AND NOT EXISTS (SELECT 1 FROM raw_submissions WHERE source_type='legacy_reports_snapshot' AND source_id=:report_id)
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_type='report' AND target_id=:report_id)
  AND :interpretation IN ('single','unparsed_multiple','unknown')
  AND (:interpretation<>'single' OR instr(json_extract(:expected_report_json,'$.species'),' · ')=0)
THEN 1 ELSE 0 END);

INSERT INTO raw_submissions(raw_id,source_type,source_id,request_id,payload_json,captured_at,
                            source_fingerprint,non_breeding_confirmed,policy_version,submitted_at,submitted_by,schema_version)
SELECT 'legacy:'||id||':snapshot','legacy_reports_snapshot',id,NULL,
       json_object('id',r.id,'status',r.status,'species',r.species,'lat',r.lat,'lon',r.lon,'public_lat',r.public_lat,'public_lon',r.public_lon,'approx_lat',r.approx_lat,'approx_lon',r.approx_lon,'pending_public',r.pending_public,'observed_on',r.observed_on,'received_at',r.received_at,'decided_at',r.decided_at,'bird_count',r.bird_count,'reporter',r.reporter,'note',r.note,'admin_note',r.admin_note,'site_id',r.site_id,'name_public',r.name_public,'spot_key',r.spot_key,'ip_hash',r.ip_hash,'dedupe_hash',r.dedupe_hash),:captured_at,:source_fingerprint,NULL,NULL,NULL,NULL,'legacy-reports-row-v1'
FROM reports r WHERE id=:report_id;

INSERT INTO checklists(
  checklist_id,site_id,raw_id,source_type,source_id,record_mode,status,
  observation_date,start_time,timezone,duration_minutes,distance_m,observer_count,protocol,complete_list,
  actual_lat,actual_lon,approx_lat,approx_lon,public_lat,public_lon,coordinate_policy,
  pending_public,name_public,spot_key,species_text,shared_bird_count,reporter,note,admin_note,
  received_at,decided_at,compat_ip_hash,compat_dedupe_hash,revision,created_at,updated_at)
SELECT
  source_id,json_extract(payload_json,'$.site_id'),raw_id,'legacy_reports',source_id,'legacy_report',
  json_extract(payload_json,'$.status'),json_extract(payload_json,'$.observed_on'),
  NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  json_extract(payload_json,'$.lat'),json_extract(payload_json,'$.lon'),
  json_extract(payload_json,'$.approx_lat'),json_extract(payload_json,'$.approx_lon'),
  json_extract(payload_json,'$.public_lat'),json_extract(payload_json,'$.public_lon'),'legacy_fallback',
  json_extract(payload_json,'$.pending_public'),json_extract(payload_json,'$.name_public'),
  json_extract(payload_json,'$.spot_key'),json_extract(payload_json,'$.species'),
  json_extract(payload_json,'$.bird_count'),json_extract(payload_json,'$.reporter'),
  json_extract(payload_json,'$.note'),json_extract(payload_json,'$.admin_note'),
  json_extract(payload_json,'$.received_at'),json_extract(payload_json,'$.decided_at'),
  json_extract(payload_json,'$.ip_hash'),json_extract(payload_json,'$.dedupe_hash'),1,:captured_at,:captured_at
FROM raw_submissions WHERE source_type='legacy_reports_snapshot' AND source_id=:report_id;

INSERT INTO sightings(
  sighting_id,checklist_id,source_ordinal,species_original,interpretation,taxon_id,
  count_value,count_accuracy,count_source,interpretation_note,created_at,updated_at)
SELECT 'legacy:'||checklist_id||':1',checklist_id,1,species_text,:interpretation,NULL,
       CASE WHEN :interpretation='single' THEN shared_bird_count ELSE NULL END,
       'unknown',
       CASE WHEN :interpretation<>'single' THEN 'ambiguous_group'
            WHEN shared_bird_count IS NULL THEN 'not_recorded' ELSE 'legacy_single' END,
       NULL,:captured_at,:captured_at
FROM checklists WHERE checklist_id=:report_id;

INSERT INTO migration_assertions(assertion_id,ok)
VALUES (:assertion_id||':after',CASE WHEN
  EXISTS (SELECT 1 FROM checklists c JOIN reports r ON r.id=c.checklist_id
          WHERE c.checklist_id=:report_id AND (c.checklist_id IS r.id AND c.status IS r.status AND c.species_text IS r.species AND c.actual_lat IS r.lat AND c.actual_lon IS r.lon AND c.public_lat IS r.public_lat AND c.public_lon IS r.public_lon AND c.approx_lat IS r.approx_lat AND c.approx_lon IS r.approx_lon AND c.pending_public IS r.pending_public AND c.observation_date IS r.observed_on AND c.received_at IS r.received_at AND c.decided_at IS r.decided_at AND c.shared_bird_count IS r.bird_count AND c.reporter IS r.reporter AND c.note IS r.note AND c.admin_note IS r.admin_note AND c.site_id IS r.site_id AND c.name_public IS r.name_public AND c.spot_key IS r.spot_key AND c.compat_ip_hash IS r.ip_hash AND c.compat_dedupe_hash IS r.dedupe_hash))
  AND (SELECT COUNT(*) FROM sightings WHERE checklist_id=:report_id)=1
  AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_type='report' AND target_id=:report_id)
THEN 1 ELSE 0 END);
DELETE FROM migration_assertions WHERE assertion_id IN (:assertion_id,:assertion_id||':after');

-- Do not create historical reviews/audit, taxa matches, media or environment rows.
-- Stop on assertion/FK/type failure. Re-read on revision races; do not repair source.
-- Only after all cohort IDs are present and validations pass may the runner record
-- version 1005 in schema_migrations. Retry of an applied identical checksum is read-only.
