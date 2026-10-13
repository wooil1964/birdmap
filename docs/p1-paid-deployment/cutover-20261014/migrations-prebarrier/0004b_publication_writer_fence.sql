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
