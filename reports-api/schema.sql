-- 출현종 제보 저장소 (Cloudflare D1).
-- 이 데이터베이스는 비공개다. 승인 대기 제보와 관리자 메모는 GitHub 저장소에 들어가지 않는다.
--
--   npx wrangler d1 execute birdmap-reports --remote --file=schema.sql
--
CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,           -- 고유 ID (crypto.randomUUID)
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  species        TEXT NOT NULL,              -- 종명을 ' · ' 로 이어 붙인 문자열
  lat            REAL NOT NULL,              -- 제보자가 지도에서 찍은 실제 좌표
  lon            REAL NOT NULL,
  public_lat     REAL,                       -- 민감지 보호용 공개 좌표(비면 lat/lon 을 그대로 공개)
  public_lon     REAL,
  observed_on    TEXT NOT NULL,              -- 관찰일 YYYY-MM-DD (KST)
  received_at    TEXT NOT NULL,              -- 접수 시각 ISO8601 UTC
  decided_at     TEXT,                       -- 승인/반려/공개취소 시각
  bird_count     INTEGER,                    -- 선택
  reporter       TEXT,                       -- 선택
  note           TEXT,                       -- 선택
  admin_note     TEXT,                       -- 관리자 전용. 공개 API 는 절대 내보내지 않는다.
  site_id        TEXT,                       -- 선택: 관리자가 연결한 기존 탐조지 ID (표시 규칙은 바꾸지 않음)
  merged_into    TEXT,                       -- 기존 지점에 종을 합친 경우 그 지점의 report id
  ip_hash        TEXT NOT NULL,              -- SHA-256(IP + REPORT_IP_SALT). 원본 IP 는 저장하지 않는다.
  dedupe_hash    TEXT NOT NULL               -- 같은 종·좌표·관찰일 중복 제출 차단용
);

-- 같은 종을 같은 자리에 같은 날짜로 다시 넣지 못하게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS reports_dedupe ON reports (dedupe_hash);

-- 공개 지도는 승인된 행만 읽는다.
CREATE INDEX IF NOT EXISTS reports_status ON reports (status);

-- 서버 측 제출 횟수 제한에서 최근 접수 건을 세는 데 쓴다.
CREATE INDEX IF NOT EXISTS reports_ip_recent ON reports (ip_hash, received_at);
