-- 탐조지도 기능 이용 통계(별도 D1: birdmap-events). 운영 제보 DB(birdmap-reports)와 완전히 분리한다.
-- 개별 클릭·시각·사용자·세션·IP·User-Agent 원문·좌표는 저장하지 않는다. 날짜(KST)별 합계만 남긴다.
--
-- 값이 없는 차원은 NULL 대신 '' 로 둔다. SQLite 는 기본키 안의 NULL 을 서로 다른 값으로 보므로
-- NULL 을 쓰면 ON CONFLICT 가 걸리지 않아 같은 조합이 행을 계속 늘린다.
--
--   npx wrangler d1 execute birdmap-events --remote -c wrangler.toml --file=schema.sql
--
CREATE TABLE IF NOT EXISTS daily_usage (
  day           TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),  -- KST YYYY-MM-DD
  event         TEXT NOT NULL,
  site_id       TEXT NOT NULL DEFAULT '',   -- siteData.id. 탐조지 이름은 저장하지 않는다.
  source        TEXT NOT NULL DEFAULT '',
  device_type   TEXT NOT NULL CHECK (device_type IN ('mobile', 'desktop', 'tablet', 'other')),
  link_type     TEXT NOT NULL DEFAULT '',
  result_bucket TEXT NOT NULL DEFAULT '',
  count         INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (day, event, site_id, source, device_type, link_type, result_bucket)
);
