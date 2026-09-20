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
  approx_lat     REAL,                       -- 승인 전 황색 마커용 대략 좌표. 접수 때 한 번 만들어 고정한다.
  approx_lon     REAL,                       -- 실제 좌표는 관리자만 본다.
  pending_public INTEGER NOT NULL DEFAULT 0, -- 1 이면 승인 전에도 황색 마커로 공개한다.
                                             -- 기본값 0 이라 이 기능 이전에 쌓인 대기 제보는 계속 비공개다.
  observed_on    TEXT NOT NULL,              -- 관찰일 YYYY-MM-DD (KST)
  received_at    TEXT NOT NULL,              -- 접수 시각 ISO8601 UTC
  decided_at     TEXT,                       -- 승인/반려/공개취소 시각
  bird_count     INTEGER,                    -- 선택
  reporter       TEXT,                       -- 선택
  note           TEXT,                       -- 선택
  admin_note     TEXT,                       -- 관리자 전용. 공개 API 는 절대 내보내지 않는다.
  site_id        TEXT,                       -- 선택: 관리자가 연결한 기존 탐조지 ID (표시 규칙은 바꾸지 않음)
  name_public    INTEGER NOT NULL DEFAULT 0, -- 제보자 이름 공개 동의. 기본은 비공개이며, 값이 없는 자료도 비공개로 본다.
  spot_key       TEXT,                       -- 이 제보의 이력이 붙을 지점. NULL=자기 점,
                                             -- "fixed:<siteId>:<n>"=index.html 의 수동 붉은 점, 그 외=다른 제보의 id
  ip_hash        TEXT NOT NULL,              -- SHA-256(IP + REPORT_IP_SALT). 원본 IP 는 저장하지 않는다.
  dedupe_hash    TEXT NOT NULL               -- 같은 종·좌표·관찰일 중복 제출 차단용
);

-- 같은 종을 같은 자리에 같은 날짜로 다시 넣지 못하게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS reports_dedupe ON reports (dedupe_hash);

-- 공개 지도는 승인된 행만 읽는다.
CREATE INDEX IF NOT EXISTS reports_status ON reports (status);

-- 승인 전 황색 마커 목록을 뽑을 때 쓴다.
CREATE INDEX IF NOT EXISTS reports_pending_public ON reports (pending_public, status);

-- 지점별 출현 이력을 모을 때 쓴다.
CREATE INDEX IF NOT EXISTS reports_spot_key ON reports (spot_key);

-- 서버 측 제출 횟수 제한에서 최근 접수 건을 세는 데 쓴다.
CREATE INDEX IF NOT EXISTS reports_ip_recent ON reports (ip_hash, received_at);
