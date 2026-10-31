-- One atomic append, no schema changes and no UPDATE/DELETE.
-- DRAFT, NOT EXECUTED. ?1: inspected system_state generation, ?2: exact inspected 229 sites,
-- ?3: 11 reviewed new site rows (235-238, 240-245, 247; 239 and 246 reserved, never inserted) prepared from index.html.
WITH checked AS (
 SELECT json(CASE WHEN
  EXISTS (SELECT 1 FROM system_state WHERE id=1 AND mode='NORMAL' AND generation=?1)
  AND (SELECT COUNT(*) FROM sites)=229
  AND json_array_length(?2)=229
  AND (SELECT COUNT(DISTINCT json_extract(value,'$.site_id')) FROM json_each(?2))=229
  AND (SELECT COUNT(*) FROM sites s JOIN json_each(?2) e
   ON s.site_id=json_extract(e.value,'$.site_id')
   AND s.site_name IS json_extract(e.value,'$.site_name')
   AND s.lat IS json_extract(e.value,'$.lat')
   AND s.lon IS json_extract(e.value,'$.lon')
   AND s.registry_source IS json_extract(e.value,'$.registry_source')
   AND s.registry_revision IS json_extract(e.value,'$.registry_revision')
   AND s.source_record_json IS json_extract(e.value,'$.source_record_json')
   AND s.created_at IS json_extract(e.value,'$.created_at')
   AND s.retired_at IS json_extract(e.value,'$.retired_at'))=229
  AND json_array_length(?3)=11
  AND (SELECT COUNT(DISTINCT json_extract(value,'$.site_id')) FROM json_each(?3))=11
  AND NOT EXISTS (SELECT 1 FROM json_each(?3)
   WHERE json_extract(value,'$.site_id') NOT IN ('235','236','237','238','240','241','242','243','244','245','247'))
  AND NOT EXISTS (SELECT 1 FROM sites s JOIN json_each(?3) a ON s.site_id=json_extract(a.value,'$.site_id'))
 THEN '{}' ELSE 'REGISTRY_PRECONDITION_FAILED' END) AS proof
)
INSERT INTO sites (site_id,site_name,lat,lon,registry_source,registry_revision,source_record_json,created_at,retired_at)
SELECT json_extract(a.value,'$.site_id'),json_extract(a.value,'$.site_name'),
 json_extract(a.value,'$.lat'),json_extract(a.value,'$.lon'),
 json_extract(a.value,'$.registry_source'),json_extract(a.value,'$.registry_revision'),
 json_extract(a.value,'$.source_record_json'),json_extract(a.value,'$.created_at'),json_extract(a.value,'$.retired_at')
FROM json_each(?3) a CROSS JOIN checked
WHERE json_extract(checked.proof,'$.unused') IS NULL;
