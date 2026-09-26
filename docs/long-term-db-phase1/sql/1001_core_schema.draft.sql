-- PHASE 1 DESIGN ONLY. DO NOT EXECUTE.
-- Add 10 domain/history tables; migration 1001, after reviewed preflight.
-- Runner skips identical applied checksum only after schema verification; partial/drift stops.
-- Verify data-dictionary/schema parity; rollback failed batch, retain successful additive schema.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- Not registered with Wrangler. Future runner: review, hash, prepare each statement,
-- run one atomic D1 batch with ledger row; no exec()/BEGIN/COMMIT wrapper.
-- All timestamps are supplied explicitly; no fabricated legacy timestamps.
-- Data standard v1.1. 10 domain/history tables. reports and _cf_KV are left intact.

CREATE TABLE schema_migrations (
  version INTEGER NOT NULL PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (length(checksum)=64 AND checksum NOT GLOB '*[^0-9a-f]*'),
  applied_at TEXT NOT NULL,
  runner_version TEXT NOT NULL,
  source_manifest_checksum TEXT
);

CREATE TABLE sites (
  site_id TEXT NOT NULL PRIMARY KEY,
  site_name TEXT NOT NULL,
  province TEXT,
  district TEXT,
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90) CHECK (lat IS NULL OR typeof(lat) IN ('integer','real')),
  lon REAL NOT NULL CHECK (lon BETWEEN -180 AND 180) CHECK (lon IS NULL OR typeof(lon) IN ('integer','real')),
  coordinate_uncertainty_m REAL CHECK (coordinate_uncertainty_m IS NULL OR coordinate_uncertainty_m >= 0) CHECK (coordinate_uncertainty_m IS NULL OR typeof(coordinate_uncertainty_m) IN ('integer','real')),
  habitat_type TEXT,
  site_status TEXT NOT NULL DEFAULT 'unknown' CHECK (site_status IN ('active','retired','unknown')),
  registry_source TEXT NOT NULL,
  registry_revision TEXT NOT NULL,
  source_record_json TEXT NOT NULL CHECK (json_valid(source_record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE taxa (
  taxon_id TEXT NOT NULL PRIMARY KEY,
  source_taxon_key TEXT NOT NULL,
  korean_name TEXT,
  scientific_name TEXT,
  english_name TEXT,
  taxon_rank TEXT NOT NULL,
  parent_taxon_id TEXT,
  taxonomy_source TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  taxon_status TEXT NOT NULL CHECK (taxon_status IN ('accepted','synonym','unresolved','deprecated')),
  accepted_taxon_id TEXT,
  source_record_json TEXT CHECK (source_record_json IS NULL OR json_valid(source_record_json)),
  created_at TEXT NOT NULL,
  UNIQUE (taxonomy_source,taxonomy_version,source_taxon_key),
  UNIQUE (taxon_id,taxonomy_source,taxonomy_version),
  CHECK (parent_taxon_id IS NULL OR parent_taxon_id <> taxon_id),
  CHECK (accepted_taxon_id IS NULL OR accepted_taxon_id <> taxon_id),
  CHECK (taxon_status <> 'synonym' OR accepted_taxon_id IS NOT NULL),
  FOREIGN KEY (parent_taxon_id,taxonomy_source,taxonomy_version)
    REFERENCES taxa(taxon_id,taxonomy_source,taxonomy_version) ON DELETE RESTRICT,
  FOREIGN KEY (accepted_taxon_id,taxonomy_source,taxonomy_version)
    REFERENCES taxa(taxon_id,taxonomy_source,taxonomy_version) ON DELETE RESTRICT
);

CREATE TABLE raw_submissions (
  raw_id TEXT NOT NULL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('legacy_reports_snapshot','native_submission')),
  source_id TEXT NOT NULL,
  request_id TEXT UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  submitted_at TEXT,
  submitted_by TEXT,
  schema_version TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint)=64 AND source_fingerprint NOT GLOB '*[^0-9a-f]*'),
  non_breeding_confirmed INTEGER CHECK (non_breeding_confirmed IS NULL OR non_breeding_confirmed = 1),
  policy_version TEXT,
  UNIQUE (source_type,source_id),
  CHECK (
    (source_type='legacy_reports_snapshot' AND non_breeding_confirmed IS NULL AND policy_version IS NULL)
    OR (source_type='native_submission' AND non_breeding_confirmed=1
        AND non_breeding_confirmed IS NOT NULL AND policy_version IS NOT NULL
        AND request_id IS NOT NULL AND submitted_at IS NOT NULL)
  )
);

CREATE TABLE checklists (
  checklist_id TEXT NOT NULL PRIMARY KEY,
  site_id TEXT REFERENCES sites(site_id) ON DELETE RESTRICT,
  raw_id TEXT NOT NULL UNIQUE REFERENCES raw_submissions(raw_id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('legacy_reports','native')),
  source_id TEXT NOT NULL,
  record_mode TEXT NOT NULL CHECK (record_mode IN ('legacy_report','quick_report','complete_checklist')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  observation_date TEXT NOT NULL,
  start_time TEXT,
  timezone TEXT,
  duration_minutes REAL CHECK (duration_minutes IS NULL OR duration_minutes >= 0) CHECK (duration_minutes IS NULL OR typeof(duration_minutes) IN ('integer','real')),
  distance_m REAL CHECK (distance_m IS NULL OR distance_m >= 0) CHECK (distance_m IS NULL OR typeof(distance_m) IN ('integer','real')),
  observer_count INTEGER CHECK (observer_count IS NULL OR (typeof(observer_count)='integer' AND observer_count > 0)),
  protocol TEXT CHECK (protocol IS NULL OR protocol IN ('incidental','stationary','traveling','area','other')),
  complete_list INTEGER CHECK (complete_list IS NULL OR complete_list IN (0,1)),
  actual_lat REAL NOT NULL CHECK (actual_lat BETWEEN -90 AND 90) CHECK (actual_lat IS NULL OR typeof(actual_lat) IN ('integer','real')),
  actual_lon REAL NOT NULL CHECK (actual_lon BETWEEN -180 AND 180) CHECK (actual_lon IS NULL OR typeof(actual_lon) IN ('integer','real')),
  coordinate_uncertainty_m REAL CHECK (coordinate_uncertainty_m IS NULL OR coordinate_uncertainty_m >= 0) CHECK (coordinate_uncertainty_m IS NULL OR typeof(coordinate_uncertainty_m) IN ('integer','real')),
  approx_lat REAL CHECK (approx_lat IS NULL OR approx_lat BETWEEN -90 AND 90) CHECK (approx_lat IS NULL OR typeof(approx_lat) IN ('integer','real')),
  approx_lon REAL CHECK (approx_lon IS NULL OR approx_lon BETWEEN -180 AND 180) CHECK (approx_lon IS NULL OR typeof(approx_lon) IN ('integer','real')),
  public_lat REAL CHECK (public_lat IS NULL OR public_lat BETWEEN -90 AND 90) CHECK (public_lat IS NULL OR typeof(public_lat) IN ('integer','real')),
  public_lon REAL CHECK (public_lon IS NULL OR public_lon BETWEEN -180 AND 180) CHECK (public_lon IS NULL OR typeof(public_lon) IN ('integer','real')),
  coordinate_policy TEXT NOT NULL DEFAULT 'actual'
    CHECK (coordinate_policy IN ('legacy_fallback','actual','explicit','withheld')),
  pending_public INTEGER NOT NULL DEFAULT 0 CHECK (pending_public IN (0,1)),
  name_public INTEGER NOT NULL DEFAULT 0 CHECK (name_public IN (0,1)),
  spot_key TEXT,
  species_text TEXT NOT NULL,
  shared_bird_count INTEGER CHECK (shared_bird_count IS NULL OR (typeof(shared_bird_count)='integer' AND shared_bird_count >= 0)),
  reporter TEXT,
  note TEXT,
  admin_note TEXT,
  received_at TEXT NOT NULL,
  decided_at TEXT,
  compat_ip_hash TEXT,
  compat_dedupe_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision)='integer' AND revision > 0),
  updated_at TEXT NOT NULL,
  UNIQUE (source_type,source_id),
  CHECK (source_type <> 'legacy_reports' OR
    (record_mode='legacy_report' AND checklist_id=source_id)),
  CHECK (record_mode <> 'legacy_report' OR source_type='legacy_reports'),
  CHECK (source_type='legacy_reports' OR
    ((approx_lat IS NULL)=(approx_lon IS NULL) AND (public_lat IS NULL)=(public_lon IS NULL))),
  CHECK (coordinate_policy <> 'explicit' OR (public_lat IS NOT NULL AND public_lon IS NOT NULL))
);

CREATE TABLE sightings (
  sighting_id TEXT NOT NULL PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT,
  source_ordinal INTEGER NOT NULL CHECK (typeof(source_ordinal)='integer' AND source_ordinal > 0),
  species_original TEXT NOT NULL,
  species_identified TEXT,
  interpretation TEXT NOT NULL DEFAULT 'unknown'
    CHECK (interpretation IN ('single','unparsed_multiple','unknown')),
  taxon_id TEXT REFERENCES taxa(taxon_id) ON DELETE RESTRICT,
  count_value INTEGER CHECK (count_value IS NULL OR (typeof(count_value)='integer' AND count_value >= 0)),
  count_accuracy TEXT NOT NULL DEFAULT 'unknown'
    CHECK (count_accuracy IN ('exact','estimated','minimum','unknown')),
  count_source TEXT NOT NULL CHECK (count_source IN ('legacy_single','reported','reviewed','not_recorded','ambiguous_group')),
  interpretation_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (checklist_id,source_ordinal),
  UNIQUE (checklist_id,sighting_id),
  CHECK (count_value IS NOT NULL OR count_accuracy='unknown'),
  CHECK (interpretation='single' OR (taxon_id IS NULL AND count_value IS NULL)),
  CHECK (count_source <> 'ambiguous_group' OR count_value IS NULL)
);

CREATE TABLE reviews (
  review_id TEXT NOT NULL PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (typeof(sequence)='integer' AND sequence > 0),
  decision TEXT NOT NULL CHECK (decision IN ('submitted','approved','corrected','rejected','unpublished','reapproved')),
  sighting_id TEXT,
  validated_taxon_id TEXT REFERENCES taxa(taxon_id) ON DELETE RESTRICT,
  validated_count INTEGER CHECK (validated_count IS NULL OR (typeof(validated_count)='integer' AND validated_count >= 0)),
  validated_count_accuracy TEXT CHECK (validated_count_accuracy IS NULL OR validated_count_accuracy IN ('exact','estimated','minimum','unknown')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('pending','approved','rejected')),
  to_status TEXT NOT NULL CHECK (to_status IN ('pending','approved','rejected')),
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reason_code TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (checklist_id,sequence),
  UNIQUE (request_id,checklist_id),
  FOREIGN KEY (checklist_id,sighting_id) REFERENCES sightings(checklist_id,sighting_id) ON DELETE RESTRICT,
  CHECK (sighting_id IS NOT NULL OR (validated_taxon_id IS NULL AND validated_count IS NULL AND validated_count_accuracy IS NULL)),
  CHECK (validated_count IS NOT NULL OR validated_count_accuracy IS NULL OR validated_count_accuracy='unknown')
);

CREATE TABLE media (
  media_id TEXT NOT NULL PRIMARY KEY,
  sighting_id TEXT NOT NULL REFERENCES sightings(sighting_id) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo','audio','video')),
  storage_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (length(checksum)=64 AND checksum NOT GLOB '*[^0-9a-f]*'),
  photographer TEXT,
  captured_at TEXT,
  rights TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  evidence_flag INTEGER NOT NULL DEFAULT 0 CHECK (evidence_flag IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE environment_snapshots (
  snapshot_id TEXT NOT NULL PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES checklists(checklist_id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('observed','forecast','modeled')),
  target_time TEXT NOT NULL,
  issued_at TEXT,
  retrieved_at TEXT NOT NULL,
  station_id TEXT,
  temperature_c REAL CHECK (temperature_c IS NULL OR typeof(temperature_c) IN ('integer','real')),
  wind_direction REAL CHECK (wind_direction IS NULL OR (wind_direction >= 0 AND wind_direction < 360)) CHECK (wind_direction IS NULL OR typeof(wind_direction) IN ('integer','real')),
  wind_speed REAL CHECK (wind_speed IS NULL OR wind_speed >= 0) CHECK (wind_speed IS NULL OR typeof(wind_speed) IN ('integer','real')),
  precipitation REAL CHECK (precipitation IS NULL OR precipitation >= 0) CHECK (precipitation IS NULL OR typeof(precipitation) IN ('integer','real')),
  period_start TEXT,
  period_end TEXT,
  tide_station_id TEXT,
  tide_height_cm REAL CHECK (tide_height_cm IS NULL OR typeof(tide_height_cm) IN ('integer','real')),
  tide_datum TEXT,
  source_lat REAL CHECK (source_lat IS NULL OR source_lat BETWEEN -90 AND 90) CHECK (source_lat IS NULL OR typeof(source_lat) IN ('integer','real')),
  source_lon REAL CHECK (source_lon IS NULL OR source_lon BETWEEN -180 AND 180) CHECK (source_lon IS NULL OR typeof(source_lon) IN ('integer','real')),
  source_url TEXT,
  variables_json TEXT NOT NULL CHECK (json_valid(variables_json)),
  units_json TEXT NOT NULL CHECK (json_valid(units_json)),
  quality TEXT,
  created_at TEXT NOT NULL,
  CHECK ((source_lat IS NULL)=(source_lon IS NULL))
);

CREATE TABLE audit_log (
  audit_id TEXT NOT NULL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (request_id,action,target_type,target_id),
  CHECK (action<>'forbidden_content_purged' OR (target_type='report' AND before_json IS NULL AND after_json IS NULL))
);

CREATE INDEX taxa_name_lookup ON taxa(taxonomy_source,taxonomy_version,korean_name);
CREATE INDEX taxa_parent ON taxa(parent_taxon_id);
CREATE INDEX taxa_accepted ON taxa(accepted_taxon_id);
CREATE INDEX checklists_site_history ON checklists(site_id,status,observation_date DESC,received_at DESC,checklist_id DESC);
CREATE INDEX checklists_approved_recent ON checklists(status,observation_date DESC,received_at DESC);
CREATE INDEX checklists_pending_public ON checklists(pending_public,status);
CREATE INDEX checklists_spot_key ON checklists(spot_key);
CREATE INDEX checklists_ip_recent ON checklists(compat_ip_hash,received_at);
CREATE INDEX sightings_taxon ON sightings(taxon_id,checklist_id);
CREATE INDEX reviews_chronology ON reviews(checklist_id,created_at DESC,review_id);
CREATE INDEX reviews_sighting ON reviews(sighting_id);
CREATE INDEX reviews_taxon ON reviews(validated_taxon_id);
CREATE INDEX media_sighting ON media(sighting_id);
CREATE INDEX environment_checklist_time ON environment_snapshots(checklist_id,target_time);
CREATE INDEX audit_target_time ON audit_log(target_type,target_id,created_at DESC);
CREATE UNIQUE INDEX audit_purge_tombstone ON audit_log(target_type,target_id) WHERE action='forbidden_content_purged';

-- Ordinary raw/review/audit/taxonomy records cannot be rewritten.
-- Authorized exceptional policy purge uses explicit dependency-ordered DELETE,
-- never blanket CASCADE; it is not implemented or executed in Phase 1.
CREATE TRIGGER raw_submissions_no_update BEFORE UPDATE ON raw_submissions
BEGIN SELECT RAISE(ABORT,'immutable_raw'); END;
CREATE TRIGGER reviews_no_update BEFORE UPDATE ON reviews
BEGIN SELECT RAISE(ABORT,'append_only_review'); END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT,'append_only_audit'); END;
CREATE TRIGGER taxa_no_update BEFORE UPDATE ON taxa
BEGIN SELECT RAISE(ABORT,'versioned_taxon_immutable'); END;

CREATE TRIGGER sightings_source_immutable BEFORE UPDATE OF sighting_id,checklist_id,source_ordinal,species_original ON sightings
WHEN OLD.sighting_id IS NOT NEW.sighting_id OR OLD.checklist_id IS NOT NEW.checklist_id
 OR OLD.source_ordinal IS NOT NEW.source_ordinal OR OLD.species_original IS NOT NEW.species_original
BEGIN SELECT RAISE(ABORT,'permanent_sighting_source'); END;

-- Permanent identity cannot be rewritten even for currently unreferenced records.
CREATE TRIGGER sites_id_immutable BEFORE UPDATE OF site_id ON sites
WHEN OLD.site_id IS NOT NEW.site_id
BEGIN SELECT RAISE(ABORT,'permanent_site_id'); END;
CREATE TRIGGER checklists_source_immutable BEFORE UPDATE OF checklist_id,source_type,source_id,raw_id ON checklists
WHEN OLD.checklist_id IS NOT NEW.checklist_id OR OLD.source_type IS NOT NEW.source_type
 OR OLD.source_id IS NOT NEW.source_id OR OLD.raw_id IS NOT NEW.raw_id
BEGIN SELECT RAISE(ABORT,'permanent_checklist_source'); END;
