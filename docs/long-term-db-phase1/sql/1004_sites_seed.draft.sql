-- PHASE 1 DESIGN ONLY. DO NOT EXECUTE.
-- Seed authoritative runtime registry; migration 1004, after 1003.
-- Verify pinned 190-ID manifest and complete source values; equal existing rows skip outside template.
-- Rollback: retain additive sites and existing runtime sources; no ID renumbering.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- Per-site template, all statements ONE future D1 batch. No real coordinates embedded.
-- :source_record_json = complete record from the pinned index.html siteData manifest.
-- Preserve existing IDs by their canonical runtime string; no new numbering/name merge.
-- Existing matching row => runner verifies every value + manifest, then skips read-only.
-- Existing differing row => stop; never upsert data with a new unreviewed manifest.

INSERT INTO migration_assertions VALUES (:assertion_id,CASE WHEN
  json_valid(:source_record_json)
  AND CAST(json_extract(:source_record_json,'$.id') AS TEXT)=:site_id
  AND json_extract(:source_record_json,'$.name') IS :site_name
  AND json_extract(:source_record_json,'$.lat') IS :site_lat
  AND json_extract(:source_record_json,'$.lon') IS :site_lon
  AND NOT EXISTS(SELECT 1 FROM sites WHERE site_id=:site_id)
THEN 1 ELSE 0 END);
INSERT INTO sites(site_id,site_name,province,district,lat,lon,coordinate_uncertainty_m,habitat_type,site_status,
                  registry_source,registry_revision,source_record_json,created_at,updated_at,retired_at)
VALUES (:site_id,:site_name,NULL,NULL,:site_lat,:site_lon,NULL,NULL,'unknown',
        'index.html:siteData',:git_commit,:source_record_json,:captured_at,:captured_at,NULL);
DELETE FROM migration_assertions WHERE assertion_id=:assertion_id;
-- This does not update index.html, weather registry, tide mapping or public map.
-- Record migration 1004 only after exact ID-set equality and full source-value checks.

-- Administrative divisions/habitat/uncertainty remain NULL until an explicit source-field mapping
-- is verified. The complete registry source_record_json preserves all existing attributes.
