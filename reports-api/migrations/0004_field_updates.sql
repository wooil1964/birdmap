-- 현장소식(실시간 탐조 현장 공유) 전용 테이블. 기존 reports 테이블과 섞지 않는다.
--
-- 순수하게 새 테이블·인덱스만 만든다. 기존 테이블, 행, 인덱스는 건드리지 않는다.
--
--   npx wrangler d1 execute birdmap-reports --remote -c wrangler.public.toml \
--     --file=migrations/0004_field_updates.sql
--
-- 운영 DB 에 올리기 전에는 /field-updates 가 "no such table" 로 실패한다.
-- 프런트는 GET /field-updates 가 성공할 때만 '현장소식' 버튼을 보여 주므로 화면은 그대로다.

-- 한 마리(한 무리)의 현장소식 한 건. 현재 상태와 최초 관찰시간을 갖는다.
CREATE TABLE IF NOT EXISTS field_updates (
  id               TEXT PRIMARY KEY,           -- UUID
  species          TEXT NOT NULL,              -- 종명 하나
  bird_count       INTEGER,                    -- 모르면 NULL
  status           TEXT NOT NULL,              -- 현재 상태: visible | searching | not_visible | reappeared
  lat              REAL NOT NULL,              -- 사용자가 확인한 실제 좌표. 공개 API 는 이 값을 내보내지 않는다.
  lon              REAL NOT NULL,
  public_lat       REAL NOT NULL,              -- 공개 좌표. 일반 종은 실제 좌표와 같고, 민감종은 대략 좌표(등록 때 한 번 만들어 고정)
  public_lon       REAL NOT NULL,
  location_hidden  INTEGER NOT NULL DEFAULT 0, -- 1 이면 공개 좌표가 실제와 다른 대략 좌표
  nickname         TEXT NOT NULL,              -- 표시명(입력 닉네임, 없으면 '익명')
  note             TEXT,                       -- 짧은 메모(최대 100자)
  location_source  TEXT,                       -- gps | map
  gps_accuracy     INTEGER,                    -- GPS 로 잡았을 때 오차(m). 위치 추적용이 아니라 등록 시점 진단용
  created_at       TEXT NOT NULL,              -- 최초 등록(관찰) 시각. 절대 덮어쓰지 않는다.
  updated_at       TEXT NOT NULL,              -- 마지막 상태 변경 시각
  last_confirmed_at TEXT,                      -- 마지막 '확인' 시각(없으면 NULL)
  last_activity_at TEXT NOT NULL,              -- max(updated_at, last_confirmed_at). 만료(TTL) 판단 기준
  user_hash        TEXT NOT NULL,              -- SHA-256(솔트 + 브라우저 식별값). 원본 식별값은 저장하지 않는다.
  ip_hash          TEXT NOT NULL               -- 제출 횟수 제한용. 원본 IP 는 저장하지 않는다.
);

-- 상태 변경 이력. 한 번 쌓은 이벤트는 지우거나 고치지 않는다('안 보여요'도 새 이벤트다).
CREATE TABLE IF NOT EXISTS field_update_events (
  id               TEXT PRIMARY KEY,
  field_update_id  TEXT NOT NULL,
  status           TEXT NOT NULL,
  nickname         TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  user_hash        TEXT NOT NULL,
  ip_hash          TEXT NOT NULL
);

-- 다른 회원의 '확인'. 같은 소식을 같은 브라우저가 두 번 확인하지 못한다.
CREATE TABLE IF NOT EXISTS field_update_confirmations (
  id               TEXT PRIMARY KEY,
  field_update_id  TEXT NOT NULL,
  user_hash        TEXT NOT NULL,
  ip_hash          TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE (field_update_id, user_hash)
);

-- 지도에 올릴 유효한 소식을 최근 활동순으로 읽는다.
CREATE INDEX IF NOT EXISTS field_updates_activity ON field_updates (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS field_update_events_parent ON field_update_events (field_update_id, created_at);
CREATE INDEX IF NOT EXISTS field_update_events_ip ON field_update_events (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS field_update_confirmations_parent ON field_update_confirmations (field_update_id);
CREATE INDEX IF NOT EXISTS field_update_confirmations_ip ON field_update_confirmations (ip_hash, created_at);
