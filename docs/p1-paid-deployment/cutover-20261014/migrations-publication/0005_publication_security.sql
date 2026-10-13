-- Additive publication permission state. Local rehearsal first; production requires separate approval.
CREATE TABLE public_publication_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 epoch TEXT NOT NULL CHECK(typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=0 AND revision<=9223372036854775807),
 write_frozen INTEGER NOT NULL DEFAULT 0 CHECK(typeof(write_frozen)='integer' AND write_frozen IN(0,1))
);
INSERT INTO public_publication_state VALUES(1,lower(hex(randomblob(16))),0,1);
ALTER TABLE field_updates ADD COLUMN row_revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(row_revision)='integer' AND row_revision>=1);
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
CREATE TRIGGER publication_field_updates_insert AFTER INSERT ON field_updates
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
