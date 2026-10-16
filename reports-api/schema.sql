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

-- 탐조지별 출현 이력(/reports/site/<id>)의 조회·정렬 모양을 그대로 따른다.
CREATE INDEX IF NOT EXISTS reports_site_history
  ON reports (site_id, status, observed_on DESC, received_at DESC, id DESC);

-- 서버 측 제출 횟수 제한에서 최근 접수 건을 세는 데 쓴다.
CREATE INDEX IF NOT EXISTS reports_ip_recent ON reports (ip_hash, received_at);

-- ── 현장소식(migrations/0004_field_updates.sql 과 같은 내용) ──
-- 한 마리(한 무리)의 현장소식 한 건. 현재 상태와 최초 관찰시간을 갖는다.
CREATE TABLE IF NOT EXISTS field_updates (
  id               TEXT PRIMARY KEY,           -- UUID
  species          TEXT NOT NULL,              -- 종명 하나
  visibility_radius TEXT NOT NULL DEFAULT 'all' CHECK(typeof(visibility_radius)='text' AND visibility_radius IN ('5','10','20','all')),
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
  row_revision     INTEGER NOT NULL DEFAULT 1 CHECK(typeof(row_revision)='integer' AND row_revision>=1),
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

-- Publication contract and database guards (same definitions as migration0005).
-- Additive publication permission state. Local rehearsal first; production requires separate approval.
CREATE TABLE public_publication_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 epoch TEXT NOT NULL CHECK(typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=0 AND revision<=9223372036854775807),
 write_frozen INTEGER NOT NULL DEFAULT 0 CHECK(typeof(write_frozen)='integer' AND write_frozen IN(0,1))
);
INSERT INTO public_publication_state VALUES(1,lower(hex(randomblob(16))),0,0);
CREATE TRIGGER publication_state_permanent BEFORE DELETE ON public_publication_state
BEGIN SELECT RAISE(ABORT,'publication_state_permanent'); END;
CREATE TRIGGER publication_state_transition BEFORE UPDATE ON public_publication_state
WHEN NEW.id IS NOT OLD.id OR NEW.epoch IS NOT OLD.epoch OR typeof(NEW.revision)<>'integer' OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'publication_state_transition'); END;
CREATE TRIGGER publication_reports_insert AFTER INSERT ON reports
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER publication_reports_update AFTER UPDATE ON reports
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER publication_reports_delete AFTER DELETE ON reports
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER publication_field_updates_insert_scoped AFTER INSERT ON field_updates
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER publication_field_updates_update AFTER UPDATE ON field_updates
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER publication_field_updates_delete AFTER DELETE ON field_updates
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER field_deleted_terminal BEFORE UPDATE ON field_updates
WHEN OLD.status='deleted' AND NOT(NEW.row_revision=OLD.row_revision+1 AND NEW.id IS OLD.id AND NEW.species IS OLD.species AND NEW.bird_count IS OLD.bird_count AND NEW.status IS OLD.status AND NEW.lat IS OLD.lat AND NEW.lon IS OLD.lon AND NEW.public_lat IS OLD.public_lat AND NEW.public_lon IS OLD.public_lon AND NEW.location_hidden IS OLD.location_hidden AND NEW.nickname IS OLD.nickname AND NEW.note IS OLD.note AND NEW.location_source IS OLD.location_source AND NEW.gps_accuracy IS OLD.gps_accuracy AND NEW.created_at IS OLD.created_at AND NEW.updated_at IS OLD.updated_at AND NEW.last_confirmed_at IS OLD.last_confirmed_at AND NEW.last_activity_at IS OLD.last_activity_at AND NEW.user_hash IS OLD.user_hash AND NEW.ip_hash IS OLD.ip_hash)
BEGIN SELECT RAISE(ABORT,'field_deleted_terminal'); END;
CREATE TRIGGER field_revision_valid BEFORE UPDATE ON field_updates
WHEN typeof(NEW.row_revision)<>'integer' OR OLD.row_revision>=9223372036854775807 OR NEW.row_revision NOT IN(OLD.row_revision,OLD.row_revision+1)
BEGIN SELECT RAISE(ABORT,'field_revision_invalid'); END;
CREATE TRIGGER field_revision_advance AFTER UPDATE ON field_updates
WHEN NEW.row_revision=OLD.row_revision
BEGIN UPDATE field_updates SET row_revision=OLD.row_revision+1 WHERE id=NEW.id AND row_revision=OLD.row_revision; END;
CREATE TRIGGER field_event_live BEFORE INSERT ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM field_updates WHERE id=NEW.field_update_id AND (status<>'deleted' OR NEW.status='deleted'))
BEGIN SELECT RAISE(ABORT,'field_deleted_terminal'); END;
CREATE TRIGGER field_confirmation_live BEFORE INSERT ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM field_updates WHERE id=NEW.field_update_id AND status<>'deleted')
BEGIN SELECT RAISE(ABORT,'field_deleted_terminal'); END;

CREATE INDEX idx_field_updates_visibility_activity ON field_updates(visibility_radius,last_activity_at DESC);
CREATE TRIGGER field_visibility_immutable BEFORE UPDATE ON field_updates
WHEN NEW.visibility_radius IS NOT OLD.visibility_radius
BEGIN SELECT RAISE(ABORT,'field_visibility_immutable'); END;

CREATE TRIGGER field_freeze_field_updates_insert BEFORE INSERT ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_updates_update BEFORE UPDATE ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_updates_delete BEFORE DELETE ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_events_insert BEFORE INSERT ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_events_update BEFORE UPDATE ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_events_delete BEFORE DELETE ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_confirmations_insert BEFORE INSERT ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_confirmations_update BEFORE UPDATE ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

CREATE TRIGGER field_freeze_field_update_confirmations_delete BEFORE DELETE ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;

-- Atomic pre-barrier: install before publication migration and keep on rollback.
-- Stops already-running legacy Workers, including requests resumed after thaw.
-- Claim is temporary and exists only inside the current writer's atomic D1.batch.
CREATE TABLE IF NOT EXISTS publication_writer_claim (
 id INTEGER PRIMARY KEY CHECK(id=1),
 ok INTEGER NOT NULL CONSTRAINT publication_writer_ready CHECK(typeof(ok)='integer' AND ok=1)
);
CREATE TRIGGER IF NOT EXISTS writer_fence_reports_insert BEFORE INSERT ON reports
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_reports_update BEFORE UPDATE ON reports
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_reports_delete BEFORE DELETE ON reports
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_updates_insert BEFORE INSERT ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_updates_update BEFORE UPDATE ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_updates_delete BEFORE DELETE ON field_updates
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_events_insert BEFORE INSERT ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_events_update BEFORE UPDATE ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_events_delete BEFORE DELETE ON field_update_events
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_confirmations_insert BEFORE INSERT ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_confirmations_update BEFORE UPDATE ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;

CREATE TRIGGER IF NOT EXISTS writer_fence_field_update_confirmations_delete BEFORE DELETE ON field_update_confirmations
WHEN NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1)
BEGIN SELECT RAISE(ABORT,'publication_writer_required'); END;
