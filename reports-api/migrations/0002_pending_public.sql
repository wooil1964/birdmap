-- 승인 전 제보를 황색 마커로 공개하기 위한 추가 열.
-- 기존 행은 pending_public=0 으로 남으므로, 이 마이그레이션만으로는 어떤 대기 제보도 공개되지 않는다.
--
--   npx wrangler d1 execute birdmap-reports --remote --file=migrations/0002_pending_public.sql
--
ALTER TABLE reports ADD COLUMN approx_lat REAL;
ALTER TABLE reports ADD COLUMN approx_lon REAL;
ALTER TABLE reports ADD COLUMN pending_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS reports_pending_public ON reports (pending_public, status);
