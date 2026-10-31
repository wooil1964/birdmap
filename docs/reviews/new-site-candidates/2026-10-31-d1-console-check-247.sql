-- 운영 D1(birdmap-reports) 웹 Console에서 실행할 읽기 전용 확인 쿼리. SELECT만 사용한다.
-- 목적: 신규 ID 247(대흥사 장춘숲길) 충돌·참조 여부와 신규 범위 235~247 전체 상태 재확인.
-- 기대값: total_sites=229, active_sites=229, site_247=0, new_range_rows=0,
--         report_refs_247=0, checklist_refs_247=0, fixed_spot_refs_247=0, mode='NORMAL'.
-- 하나라도 다르면 D1 등록을 진행하지 말고 결과를 그대로 보고한다.
SELECT
  (SELECT COUNT(*) FROM sites) AS total_sites,
  (SELECT COUNT(*) FROM sites WHERE retired_at IS NULL) AS active_sites,
  (SELECT COUNT(*) FROM sites WHERE site_id = '247') AS site_247,
  (SELECT COUNT(*) FROM sites WHERE site_id IN ('235','236','237','238','239','240','241','242','243','244','245','246','247')) AS new_range_rows,
  (SELECT COUNT(*) FROM reports WHERE CAST(site_id AS TEXT) = '247') AS report_refs_247,
  (SELECT COUNT(*) FROM checklists WHERE site_id = '247') AS checklist_refs_247,
  (SELECT COUNT(*) FROM reports WHERE spot_key LIKE 'fixed:247:%') AS fixed_spot_refs_247,
  (SELECT mode FROM system_state WHERE id = 1) AS mode,
  (SELECT generation FROM system_state WHERE id = 1) AS generation;
