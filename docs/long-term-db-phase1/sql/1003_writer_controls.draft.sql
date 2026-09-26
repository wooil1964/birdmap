-- PHASE 1 DESIGN ONLY. DO NOT EXECUTE.
-- Add 3 support tables and inactive guards; migration 1003, after 1002.
-- Skip only verified same checksum/schema; test epoch, mixed writers and zero residual permits.
-- Rollback: readers only after activation; do not disable pair writes/guards.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- Operational support only; no report payload may remain in permits after commit.
-- Install guards disabled, deploy both guard-aware writers, then activate atomically.
-- DDL and initial control row must be one future D1 batch.

CREATE TABLE migration_control (
  singleton INTEGER NOT NULL PRIMARY KEY CHECK (singleton=1),
  writer_epoch INTEGER NOT NULL CHECK (typeof(writer_epoch)='integer' AND writer_epoch > 0),
  writer_mode TEXT NOT NULL CHECK (writer_mode IN ('reports_only','pair')),
  guards_enabled INTEGER NOT NULL CHECK (guards_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
INSERT INTO migration_control VALUES (1,1,'reports_only',0,:applied_at);

CREATE TABLE mutation_permits (
  request_id TEXT NOT NULL PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  writer_epoch INTEGER NOT NULL CHECK (typeof(writer_epoch)='integer' AND writer_epoch > 0),
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  non_breeding_confirmed INTEGER CHECK (non_breeding_confirmed IS NULL OR non_breeding_confirmed=1),
  policy_version TEXT,
  CHECK ((operation='insert' AND before_json IS NULL AND after_json IS NOT NULL
          AND non_breeding_confirmed IS NOT NULL AND non_breeding_confirmed=1 AND policy_version IS NOT NULL)
      OR (operation='update' AND before_json IS NOT NULL AND after_json IS NOT NULL)
      OR (operation='delete' AND before_json IS NOT NULL AND after_json IS NULL))
);

CREATE TABLE migration_assertions (
  assertion_id TEXT NOT NULL PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok=1)
);

CREATE TRIGGER reports_permit_insert BEFORE INSERT ON reports
WHEN COALESCE((SELECT guards_enabled FROM migration_control WHERE singleton=1),1)=1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mutation_permits p JOIN migration_control c ON c.singleton=1
    WHERE p.report_id=NEW.id
      AND p.operation='insert'
      AND p.writer_epoch=c.writer_epoch
      AND c.singleton=1
      AND c.writer_mode='pair'
      AND (json_type(p.after_json)='object' AND (SELECT COUNT(*) FROM json_each(p.after_json))=22
      AND json_type(p.after_json,'$.id') IS NOT NULL AND json_extract(p.after_json,'$.id') IS NEW.id
      AND json_type(p.after_json,'$.status') IS NOT NULL AND json_extract(p.after_json,'$.status') IS NEW.status
      AND json_type(p.after_json,'$.species') IS NOT NULL AND json_extract(p.after_json,'$.species') IS NEW.species
      AND json_type(p.after_json,'$.lat') IS NOT NULL AND json_extract(p.after_json,'$.lat') IS NEW.lat
      AND json_type(p.after_json,'$.lon') IS NOT NULL AND json_extract(p.after_json,'$.lon') IS NEW.lon
      AND json_type(p.after_json,'$.public_lat') IS NOT NULL AND json_extract(p.after_json,'$.public_lat') IS NEW.public_lat
      AND json_type(p.after_json,'$.public_lon') IS NOT NULL AND json_extract(p.after_json,'$.public_lon') IS NEW.public_lon
      AND json_type(p.after_json,'$.approx_lat') IS NOT NULL AND json_extract(p.after_json,'$.approx_lat') IS NEW.approx_lat
      AND json_type(p.after_json,'$.approx_lon') IS NOT NULL AND json_extract(p.after_json,'$.approx_lon') IS NEW.approx_lon
      AND json_type(p.after_json,'$.pending_public') IS NOT NULL AND json_extract(p.after_json,'$.pending_public') IS NEW.pending_public
      AND json_type(p.after_json,'$.observed_on') IS NOT NULL AND json_extract(p.after_json,'$.observed_on') IS NEW.observed_on
      AND json_type(p.after_json,'$.received_at') IS NOT NULL AND json_extract(p.after_json,'$.received_at') IS NEW.received_at
      AND json_type(p.after_json,'$.decided_at') IS NOT NULL AND json_extract(p.after_json,'$.decided_at') IS NEW.decided_at
      AND json_type(p.after_json,'$.bird_count') IS NOT NULL AND json_extract(p.after_json,'$.bird_count') IS NEW.bird_count
      AND json_type(p.after_json,'$.reporter') IS NOT NULL AND json_extract(p.after_json,'$.reporter') IS NEW.reporter
      AND json_type(p.after_json,'$.note') IS NOT NULL AND json_extract(p.after_json,'$.note') IS NEW.note
      AND json_type(p.after_json,'$.admin_note') IS NOT NULL AND json_extract(p.after_json,'$.admin_note') IS NEW.admin_note
      AND json_type(p.after_json,'$.site_id') IS NOT NULL AND json_extract(p.after_json,'$.site_id') IS NEW.site_id
      AND json_type(p.after_json,'$.name_public') IS NOT NULL AND json_extract(p.after_json,'$.name_public') IS NEW.name_public
      AND json_type(p.after_json,'$.spot_key') IS NOT NULL AND json_extract(p.after_json,'$.spot_key') IS NEW.spot_key
      AND json_type(p.after_json,'$.ip_hash') IS NOT NULL AND json_extract(p.after_json,'$.ip_hash') IS NEW.ip_hash
      AND json_type(p.after_json,'$.dedupe_hash') IS NOT NULL AND json_extract(p.after_json,'$.dedupe_hash') IS NEW.dedupe_hash)
  ) THEN RAISE(ABORT,'writer_fence_or_stale_report') END;
END;

CREATE TRIGGER reports_consume_insert AFTER INSERT ON reports
BEGIN
  DELETE FROM mutation_permits WHERE report_id=NEW.id AND operation='insert';
END;

CREATE TRIGGER reports_id_immutable BEFORE UPDATE OF id ON reports
WHEN OLD.id IS NOT NEW.id
BEGIN SELECT RAISE(ABORT,'permanent_report_id'); END;

CREATE TRIGGER reports_permit_update BEFORE UPDATE ON reports
WHEN COALESCE((SELECT guards_enabled FROM migration_control WHERE singleton=1),1)=1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mutation_permits p JOIN migration_control c ON c.singleton=1
    WHERE p.report_id=NEW.id
      AND p.operation='update'
      AND p.writer_epoch=c.writer_epoch
      AND c.singleton=1
      AND c.writer_mode='pair'
      AND (json_type(p.before_json)='object' AND (SELECT COUNT(*) FROM json_each(p.before_json))=22
      AND json_type(p.before_json,'$.id') IS NOT NULL AND json_extract(p.before_json,'$.id') IS OLD.id
      AND json_type(p.before_json,'$.status') IS NOT NULL AND json_extract(p.before_json,'$.status') IS OLD.status
      AND json_type(p.before_json,'$.species') IS NOT NULL AND json_extract(p.before_json,'$.species') IS OLD.species
      AND json_type(p.before_json,'$.lat') IS NOT NULL AND json_extract(p.before_json,'$.lat') IS OLD.lat
      AND json_type(p.before_json,'$.lon') IS NOT NULL AND json_extract(p.before_json,'$.lon') IS OLD.lon
      AND json_type(p.before_json,'$.public_lat') IS NOT NULL AND json_extract(p.before_json,'$.public_lat') IS OLD.public_lat
      AND json_type(p.before_json,'$.public_lon') IS NOT NULL AND json_extract(p.before_json,'$.public_lon') IS OLD.public_lon
      AND json_type(p.before_json,'$.approx_lat') IS NOT NULL AND json_extract(p.before_json,'$.approx_lat') IS OLD.approx_lat
      AND json_type(p.before_json,'$.approx_lon') IS NOT NULL AND json_extract(p.before_json,'$.approx_lon') IS OLD.approx_lon
      AND json_type(p.before_json,'$.pending_public') IS NOT NULL AND json_extract(p.before_json,'$.pending_public') IS OLD.pending_public
      AND json_type(p.before_json,'$.observed_on') IS NOT NULL AND json_extract(p.before_json,'$.observed_on') IS OLD.observed_on
      AND json_type(p.before_json,'$.received_at') IS NOT NULL AND json_extract(p.before_json,'$.received_at') IS OLD.received_at
      AND json_type(p.before_json,'$.decided_at') IS NOT NULL AND json_extract(p.before_json,'$.decided_at') IS OLD.decided_at
      AND json_type(p.before_json,'$.bird_count') IS NOT NULL AND json_extract(p.before_json,'$.bird_count') IS OLD.bird_count
      AND json_type(p.before_json,'$.reporter') IS NOT NULL AND json_extract(p.before_json,'$.reporter') IS OLD.reporter
      AND json_type(p.before_json,'$.note') IS NOT NULL AND json_extract(p.before_json,'$.note') IS OLD.note
      AND json_type(p.before_json,'$.admin_note') IS NOT NULL AND json_extract(p.before_json,'$.admin_note') IS OLD.admin_note
      AND json_type(p.before_json,'$.site_id') IS NOT NULL AND json_extract(p.before_json,'$.site_id') IS OLD.site_id
      AND json_type(p.before_json,'$.name_public') IS NOT NULL AND json_extract(p.before_json,'$.name_public') IS OLD.name_public
      AND json_type(p.before_json,'$.spot_key') IS NOT NULL AND json_extract(p.before_json,'$.spot_key') IS OLD.spot_key
      AND json_type(p.before_json,'$.ip_hash') IS NOT NULL AND json_extract(p.before_json,'$.ip_hash') IS OLD.ip_hash
      AND json_type(p.before_json,'$.dedupe_hash') IS NOT NULL AND json_extract(p.before_json,'$.dedupe_hash') IS OLD.dedupe_hash)
      AND (json_type(p.after_json)='object' AND (SELECT COUNT(*) FROM json_each(p.after_json))=22
      AND json_type(p.after_json,'$.id') IS NOT NULL AND json_extract(p.after_json,'$.id') IS NEW.id
      AND json_type(p.after_json,'$.status') IS NOT NULL AND json_extract(p.after_json,'$.status') IS NEW.status
      AND json_type(p.after_json,'$.species') IS NOT NULL AND json_extract(p.after_json,'$.species') IS NEW.species
      AND json_type(p.after_json,'$.lat') IS NOT NULL AND json_extract(p.after_json,'$.lat') IS NEW.lat
      AND json_type(p.after_json,'$.lon') IS NOT NULL AND json_extract(p.after_json,'$.lon') IS NEW.lon
      AND json_type(p.after_json,'$.public_lat') IS NOT NULL AND json_extract(p.after_json,'$.public_lat') IS NEW.public_lat
      AND json_type(p.after_json,'$.public_lon') IS NOT NULL AND json_extract(p.after_json,'$.public_lon') IS NEW.public_lon
      AND json_type(p.after_json,'$.approx_lat') IS NOT NULL AND json_extract(p.after_json,'$.approx_lat') IS NEW.approx_lat
      AND json_type(p.after_json,'$.approx_lon') IS NOT NULL AND json_extract(p.after_json,'$.approx_lon') IS NEW.approx_lon
      AND json_type(p.after_json,'$.pending_public') IS NOT NULL AND json_extract(p.after_json,'$.pending_public') IS NEW.pending_public
      AND json_type(p.after_json,'$.observed_on') IS NOT NULL AND json_extract(p.after_json,'$.observed_on') IS NEW.observed_on
      AND json_type(p.after_json,'$.received_at') IS NOT NULL AND json_extract(p.after_json,'$.received_at') IS NEW.received_at
      AND json_type(p.after_json,'$.decided_at') IS NOT NULL AND json_extract(p.after_json,'$.decided_at') IS NEW.decided_at
      AND json_type(p.after_json,'$.bird_count') IS NOT NULL AND json_extract(p.after_json,'$.bird_count') IS NEW.bird_count
      AND json_type(p.after_json,'$.reporter') IS NOT NULL AND json_extract(p.after_json,'$.reporter') IS NEW.reporter
      AND json_type(p.after_json,'$.note') IS NOT NULL AND json_extract(p.after_json,'$.note') IS NEW.note
      AND json_type(p.after_json,'$.admin_note') IS NOT NULL AND json_extract(p.after_json,'$.admin_note') IS NEW.admin_note
      AND json_type(p.after_json,'$.site_id') IS NOT NULL AND json_extract(p.after_json,'$.site_id') IS NEW.site_id
      AND json_type(p.after_json,'$.name_public') IS NOT NULL AND json_extract(p.after_json,'$.name_public') IS NEW.name_public
      AND json_type(p.after_json,'$.spot_key') IS NOT NULL AND json_extract(p.after_json,'$.spot_key') IS NEW.spot_key
      AND json_type(p.after_json,'$.ip_hash') IS NOT NULL AND json_extract(p.after_json,'$.ip_hash') IS NEW.ip_hash
      AND json_type(p.after_json,'$.dedupe_hash') IS NOT NULL AND json_extract(p.after_json,'$.dedupe_hash') IS NEW.dedupe_hash)
  ) THEN RAISE(ABORT,'writer_fence_or_stale_report') END;
END;

CREATE TRIGGER reports_consume_update AFTER UPDATE ON reports
BEGIN
  DELETE FROM mutation_permits WHERE report_id=NEW.id AND operation='update';
END;

CREATE TRIGGER reports_permit_delete BEFORE DELETE ON reports
WHEN COALESCE((SELECT guards_enabled FROM migration_control WHERE singleton=1),1)=1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mutation_permits p JOIN migration_control c ON c.singleton=1
    WHERE p.report_id=OLD.id
      AND p.operation='delete'
      AND p.writer_epoch=c.writer_epoch
      AND c.singleton=1
      AND c.writer_mode='pair'
      AND (json_type(p.before_json)='object' AND (SELECT COUNT(*) FROM json_each(p.before_json))=22
      AND json_type(p.before_json,'$.id') IS NOT NULL AND json_extract(p.before_json,'$.id') IS OLD.id
      AND json_type(p.before_json,'$.status') IS NOT NULL AND json_extract(p.before_json,'$.status') IS OLD.status
      AND json_type(p.before_json,'$.species') IS NOT NULL AND json_extract(p.before_json,'$.species') IS OLD.species
      AND json_type(p.before_json,'$.lat') IS NOT NULL AND json_extract(p.before_json,'$.lat') IS OLD.lat
      AND json_type(p.before_json,'$.lon') IS NOT NULL AND json_extract(p.before_json,'$.lon') IS OLD.lon
      AND json_type(p.before_json,'$.public_lat') IS NOT NULL AND json_extract(p.before_json,'$.public_lat') IS OLD.public_lat
      AND json_type(p.before_json,'$.public_lon') IS NOT NULL AND json_extract(p.before_json,'$.public_lon') IS OLD.public_lon
      AND json_type(p.before_json,'$.approx_lat') IS NOT NULL AND json_extract(p.before_json,'$.approx_lat') IS OLD.approx_lat
      AND json_type(p.before_json,'$.approx_lon') IS NOT NULL AND json_extract(p.before_json,'$.approx_lon') IS OLD.approx_lon
      AND json_type(p.before_json,'$.pending_public') IS NOT NULL AND json_extract(p.before_json,'$.pending_public') IS OLD.pending_public
      AND json_type(p.before_json,'$.observed_on') IS NOT NULL AND json_extract(p.before_json,'$.observed_on') IS OLD.observed_on
      AND json_type(p.before_json,'$.received_at') IS NOT NULL AND json_extract(p.before_json,'$.received_at') IS OLD.received_at
      AND json_type(p.before_json,'$.decided_at') IS NOT NULL AND json_extract(p.before_json,'$.decided_at') IS OLD.decided_at
      AND json_type(p.before_json,'$.bird_count') IS NOT NULL AND json_extract(p.before_json,'$.bird_count') IS OLD.bird_count
      AND json_type(p.before_json,'$.reporter') IS NOT NULL AND json_extract(p.before_json,'$.reporter') IS OLD.reporter
      AND json_type(p.before_json,'$.note') IS NOT NULL AND json_extract(p.before_json,'$.note') IS OLD.note
      AND json_type(p.before_json,'$.admin_note') IS NOT NULL AND json_extract(p.before_json,'$.admin_note') IS OLD.admin_note
      AND json_type(p.before_json,'$.site_id') IS NOT NULL AND json_extract(p.before_json,'$.site_id') IS OLD.site_id
      AND json_type(p.before_json,'$.name_public') IS NOT NULL AND json_extract(p.before_json,'$.name_public') IS OLD.name_public
      AND json_type(p.before_json,'$.spot_key') IS NOT NULL AND json_extract(p.before_json,'$.spot_key') IS OLD.spot_key
      AND json_type(p.before_json,'$.ip_hash') IS NOT NULL AND json_extract(p.before_json,'$.ip_hash') IS OLD.ip_hash
      AND json_type(p.before_json,'$.dedupe_hash') IS NOT NULL AND json_extract(p.before_json,'$.dedupe_hash') IS OLD.dedupe_hash)
  ) THEN RAISE(ABORT,'writer_fence_or_stale_report') END;
END;

CREATE TRIGGER reports_consume_delete AFTER DELETE ON reports
BEGIN
  DELETE FROM mutation_permits WHERE report_id=OLD.id AND operation='delete';
END;

-- Future activation (NOT an instruction to run this file):
-- One separate reviewed batch asserts both writers' readiness, then changes
-- writer_mode='pair', guards_enabled=1 and increments writer_epoch.
-- Backfill starts only after this barrier. Revert reader only, not writer_mode.
-- Assertion idiom (batch member, never a standalone transaction):
-- INSERT INTO migration_assertions VALUES
--   (:request_id,CASE WHEN <epoch/revision/projection/purge checks all pass> THEN 1 ELSE 0 END);
-- DELETE FROM migration_assertions WHERE assertion_id=:request_id;
-- A SELECT returning 0 rows or UPDATE changing 0 rows does NOT abort a D1 batch.
-- No globally reusable bypass flag. Database credential holders remain privileged.
