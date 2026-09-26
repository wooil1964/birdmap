-- PHASE 1 DESIGN ONLY. NOT EXECUTED.
-- Inventory and new baseline counts; execution order: before all migrations.
-- Requires existing reports plus runtime manifests; reruns are read-only.
-- Verify results against current source; rollback: none (SELECT only).
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- READ-ONLY inventory for a separately authorized future Phase 2 measurement.
-- Bind :site_ids_json (190 runtime ID strings), :fixed_spot_keys_json,
-- :measured_at (UTC ISO instant). Output counts/definitions only, never payloads.

SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name;
SELECT m.name AS table_name,p.cid,p.name,p.type,p."notnull",p.dflt_value,p.pk
FROM sqlite_schema m JOIN pragma_table_info(m.name) p
WHERE m.type='table' ORDER BY m.name,p.cid;
SELECT m.name AS table_name,i.name AS index_name,i."unique",i.origin,i.partial,
       x.seqno,x.cid,x.name AS column_name,x."desc",x.coll,x.key
FROM sqlite_schema m JOIN pragma_index_list(m.name) i JOIN pragma_index_xinfo(i.name) x
WHERE m.type='table' ORDER BY m.name,i.name,x.seqno;
SELECT m.name AS table_name,f.* FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
WHERE m.type='table';
SELECT name FROM sqlite_schema WHERE type='table' AND
  (name LIKE '%migration%' OR name='_cf_KV');
-- Inventory internal tables only; never alter, seed or treat _cf_KV as user data.

SELECT COUNT(*) AS reports_total FROM reports;
SELECT status,COUNT(*) AS n FROM reports GROUP BY status;
SELECT COUNT(*) AS site_null FROM reports WHERE site_id IS NULL;
SELECT COUNT(*) AS invalid_site FROM reports r WHERE r.site_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM json_each(:site_ids_json) j WHERE CAST(j.value AS TEXT)=r.site_id);
SELECT COUNT(*) AS spot_null FROM reports WHERE spot_key IS NULL;
SELECT COUNT(*) AS orphan_report_spot FROM reports r
WHERE r.spot_key IS NOT NULL AND r.spot_key NOT LIKE 'fixed:%'
AND NOT EXISTS(SELECT 1 FROM reports p WHERE p.id=r.spot_key);
SELECT COUNT(*) AS orphan_fixed_spot FROM reports r WHERE r.spot_key LIKE 'fixed:%'
AND NOT EXISTS(SELECT 1 FROM json_each(:fixed_spot_keys_json) j WHERE j.value=r.spot_key);
SELECT COUNT(*) AS self_or_chained_spot FROM reports r
LEFT JOIN reports p ON p.id=r.spot_key
WHERE r.spot_key=r.id OR (r.spot_key IS NOT NULL AND p.spot_key IS NOT NULL);
SELECT COUNT(*) AS approved_attached_to_nonapproved_parent FROM reports r
JOIN reports p ON p.id=r.spot_key WHERE r.status='approved' AND p.status<>'approved';

SELECT
 COUNT(*) FILTER(WHERE public_lat IS NULL AND public_lon IS NULL) AS public_both_null,
 COUNT(*) FILTER(WHERE (public_lat IS NULL)<>(public_lon IS NULL)) AS public_partial,
 COUNT(*) FILTER(WHERE approx_lat IS NULL AND approx_lon IS NULL) AS approx_both_null,
 COUNT(*) FILTER(WHERE (approx_lat IS NULL)<>(approx_lon IS NULL)) AS approx_partial,
 COUNT(*) FILTER(WHERE status='approved' AND (public_lat IS NULL OR public_lon IS NULL)) AS approved_actual_any_axis,
 COUNT(*) FILTER(WHERE status='approved' AND public_lat IS NULL AND public_lon IS NULL) AS approved_actual_both_axes
FROM reports;
SELECT COUNT(*) AS bad_coordinate_rows FROM reports WHERE
 lat IS NULL OR lon IS NULL OR typeof(lat) NOT IN ('integer','real') OR typeof(lon) NOT IN ('integer','real')
 OR lat NOT BETWEEN -90 AND 90 OR lon NOT BETWEEN -180 AND 180
 OR (public_lat IS NOT NULL AND (typeof(public_lat) NOT IN ('integer','real') OR public_lat NOT BETWEEN -90 AND 90))
 OR (public_lon IS NOT NULL AND (typeof(public_lon) NOT IN ('integer','real') OR public_lon NOT BETWEEN -180 AND 180))
 OR (approx_lat IS NOT NULL AND (typeof(approx_lat) NOT IN ('integer','real') OR approx_lat NOT BETWEEN -90 AND 90))
 OR (approx_lon IS NOT NULL AND (typeof(approx_lon) NOT IN ('integer','real') OR approx_lon NOT BETWEEN -180 AND 180));

SELECT
 COUNT(*) FILTER(WHERE instr(species,' · ')>0) AS canonical_multi_candidates,
 COUNT(*) FILTER(WHERE instr(species,' · ')>0 AND bird_count IS NOT NULL) AS shared_count_multi_candidates,
 COUNT(*) FILTER(WHERE instr(species,',')>0 OR instr(species,';')>0 OR instr(species,char(10))>0 OR instr(species,'/')>0) AS ambiguous_separator_candidates,
 COUNT(*) FILTER(WHERE bird_count IS NULL) AS bird_count_null,
 COUNT(*) FILTER(WHERE bird_count IS NOT NULL AND (typeof(bird_count)<>'integer' OR bird_count<0)) AS bird_count_invalid
FROM reports;
-- Separators identify candidates, not a biological taxon determination.
SELECT pending_public,status,COUNT(*) AS n FROM reports GROUP BY pending_public,status;
SELECT name_public,typeof(name_public) AS storage_type,COUNT(*) AS n FROM reports GROUP BY name_public,typeof(name_public);
SELECT
 COUNT(*) FILTER(WHERE observed_on IS NULL OR length(observed_on)<>10 OR date(observed_on,'+0 days') IS NULL
   OR date(observed_on,'+0 days')<>observed_on OR observed_on>date(:measured_at,'+9 hours')) AS invalid_observed,
 COUNT(*) FILTER(WHERE received_at IS NULL OR julianday(received_at) IS NULL
   OR julianday(received_at)>julianday(:measured_at)) AS invalid_received,
 COUNT(*) FILTER(WHERE decided_at IS NOT NULL AND
   (julianday(decided_at) IS NULL OR julianday(decided_at)<julianday(received_at)
    OR julianday(decided_at)>julianday(:measured_at))) AS invalid_decided,
 COUNT(*) FILTER(WHERE status IN ('approved','rejected') AND decided_at IS NULL) AS decision_time_missing
FROM reports;
SELECT COUNT(*) AS duplicate_dedupe_groups FROM
 (SELECT dedupe_hash FROM reports GROUP BY dedupe_hash HAVING COUNT(*)>1);
SELECT COUNT(*) AS malformed_hash_rows FROM reports WHERE
 ip_hash IS NULL OR dedupe_hash IS NULL OR length(ip_hash)<>64 OR length(dedupe_hash)<>64
 OR ip_hash GLOB '*[^0-9a-f]*' OR dedupe_hash GLOB '*[^0-9a-f]*';
-- Dedupe semantic recomputation requires the pinned JavaScript hash function.
-- Never replace/normalize hashes. IP hash cannot be reconstructed without original IP.
-- Date canonical timezone/format and UUID semantics also require strict app validators.

-- Contract-domain checks are distinct from scientific world-range checks.
SELECT COUNT(*) AS outside_current_api_region FROM reports
WHERE lat NOT BETWEEN 33 AND 39 OR lon NOT BETWEEN 124 AND 132;
SELECT COUNT(*) AS outside_current_api_count_limits FROM reports
WHERE bird_count IS NOT NULL AND (bird_count<1 OR bird_count>100000);
