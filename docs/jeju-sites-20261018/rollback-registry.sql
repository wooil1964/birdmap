-- Selective rollback of the Jeju append: one atomic DELETE of exactly sites 206-210, nothing else.
-- ?1: inspected system_state generation, ?2: the five rows exactly as appended (same JSON as the append's ?3).
-- Refuses (no change) unless all five rows are still byte-identical and no report or checklist points at them,
-- so existing sightings, field news and the other 200 sites are never touched.
WITH checked AS (
 SELECT json(CASE WHEN
  EXISTS (SELECT 1 FROM system_state WHERE id=1 AND mode='NORMAL' AND generation=?1)
  AND (SELECT COUNT(*) FROM sites)=205
  AND json_array_length(?2)=5
  AND (SELECT COUNT(DISTINCT json_extract(value,'$.site_id')) FROM json_each(?2))=5
  AND NOT EXISTS (SELECT 1 FROM json_each(?2)
   WHERE json_extract(value,'$.site_id') NOT IN ('206','207','208','209','210'))
  AND (SELECT COUNT(*) FROM sites s JOIN json_each(?2) e
   ON s.site_id=json_extract(e.value,'$.site_id')
   AND s.site_name IS json_extract(e.value,'$.site_name')
   AND s.lat IS json_extract(e.value,'$.lat')
   AND s.lon IS json_extract(e.value,'$.lon')
   AND s.registry_source IS json_extract(e.value,'$.registry_source')
   AND s.registry_revision IS json_extract(e.value,'$.registry_revision')
   AND s.source_record_json IS json_extract(e.value,'$.source_record_json')
   AND s.created_at IS json_extract(e.value,'$.created_at')
   AND s.retired_at IS json_extract(e.value,'$.retired_at'))=5
  AND NOT EXISTS (SELECT 1 FROM checklists WHERE site_id IN ('206','207','208','209','210'))
  AND NOT EXISTS (SELECT 1 FROM reports WHERE CAST(site_id AS TEXT) IN ('206','207','208','209','210'))
 THEN '{}' ELSE 'ROLLBACK_PRECONDITION_FAILED' END) AS proof
)
DELETE FROM sites
WHERE (SELECT json_extract(proof,'$.unused') FROM checked) IS NULL
 AND site_id IN (SELECT json_extract(value,'$.site_id') FROM json_each(?2));
