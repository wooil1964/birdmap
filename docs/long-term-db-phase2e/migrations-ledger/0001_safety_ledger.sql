-- External forbidden-content safety ledger. Lives in its own D1 database, outside the
-- Time Travel restore domain of the main reports database.
-- Holds no observation content: no coordinates, species, notes, names, photos or content hashes.
-- source_id is the random report UUID (crypto.randomUUID / client request UUID) and reveals nothing by itself.
CREATE TABLE purge_events (
  purge_event_id TEXT NOT NULL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('legacy_report','native_report')),
  source_id TEXT NOT NULL UNIQUE CHECK (length(source_id) = 36 AND source_id NOT GLOB '*[^0-9a-f-]*'),
  reason_code TEXT NOT NULL CHECK (reason_code = 'forbidden_breeding_content'),
  policy_version TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('intent','completed')),
  intent_at TEXT NOT NULL,
  purged_at TEXT,
  CHECK ((state = 'completed') = (purged_at IS NOT NULL))
);
-- Append-only except the single intent -> completed transition.
CREATE TRIGGER purge_events_no_delete BEFORE DELETE ON purge_events
BEGIN SELECT RAISE(ABORT,'ledger_append_only'); END;
CREATE TRIGGER purge_events_complete_only BEFORE UPDATE ON purge_events
WHEN OLD.state <> 'intent' OR NEW.state <> 'completed'
  OR NEW.purge_event_id IS NOT OLD.purge_event_id OR NEW.source_type IS NOT OLD.source_type
  OR NEW.source_id IS NOT OLD.source_id OR NEW.reason_code IS NOT OLD.reason_code
  OR NEW.policy_version IS NOT OLD.policy_version OR NEW.actor_ref IS NOT OLD.actor_ref
  OR NEW.intent_at IS NOT OLD.intent_at
BEGIN SELECT RAISE(ABORT,'ledger_append_only'); END;
