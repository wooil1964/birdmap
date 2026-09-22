-- 탐조지별 출현 이력 조회용 복합 인덱스.
--
-- /reports/site/<id> 는 아래 모양으로만 읽는다.
--   WHERE status = 'approved' AND site_id = ?
--   ORDER BY observed_on DESC, received_at DESC, id DESC
-- 기존 인덱스에는 site_id 가 없어 이 조회는 전체 훑기로 처리된다.
--
-- 지금은 행이 수십 건이라 이 인덱스가 있으나 없으나 체감 차이가 없다.
-- 제보가 쌓여 한 탐조지에 수백 건이 붙기 시작할 때를 위한 대비다.
-- 읽기 전용 구조 변경이라 기존 행과 값은 그대로 남는다.
--
--   npx wrangler d1 execute birdmap-reports --remote -c wrangler.public.toml \
--     --file=migrations/0003_site_history_index.sql
--
CREATE INDEX IF NOT EXISTS reports_site_history
  ON reports (site_id, status, observed_on DESC, received_at DESC, id DESC);
