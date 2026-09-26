-- Phase 2D.1 freeze gate. Additive; installed with mode NORMAL so existing writers keep working.
-- The gate lives inside the database, so it binds every writer that uses this D1:
-- current and old Worker versions, preview URLs, and new dual-write builds alike.
-- Applying this file to Production is itself a Production DDL write (Phase 2E, user confirmation).
CREATE TABLE system_state (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('NORMAL','READ_ONLY_MAINTENANCE')),
  generation INTEGER NOT NULL CHECK (typeof(generation)='integer' AND generation >= 0),
  reason TEXT,
  updated_at TEXT NOT NULL
);
INSERT INTO system_state (id,mode,generation,reason,updated_at)
VALUES (1,'NORMAL',0,'installed',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- Every transition must flip the mode and advance generation by exactly one.
CREATE TRIGGER system_state_transition BEFORE UPDATE ON system_state
WHEN NEW.id IS NOT OLD.id OR NEW.mode IS OLD.mode OR NEW.generation IS NOT OLD.generation + 1
BEGIN SELECT RAISE(ABORT,'system_state_transition_invalid'); END;
CREATE TRIGGER system_state_permanent BEFORE DELETE ON system_state
BEGIN SELECT RAISE(ABORT,'system_state_permanent'); END;
-- Fail closed: a missing row counts as frozen.
-- Every application mutation (legacy and dual-write) inserts or updates reports in the same
-- statement/batch, so the whole mutation aborts. DELETE is not gated: no application path
-- deletes reports; the operator-only forbidden-content purge must run while frozen.
CREATE TRIGGER reports_freeze_insert BEFORE INSERT ON reports
WHEN NOT EXISTS (SELECT 1 FROM system_state WHERE id = 1 AND mode = 'NORMAL')
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;
CREATE TRIGGER reports_freeze_update BEFORE UPDATE ON reports
WHEN NOT EXISTS (SELECT 1 FROM system_state WHERE id = 1 AND mode = 'NORMAL')
BEGIN SELECT RAISE(ABORT,'reports_write_frozen'); END;
