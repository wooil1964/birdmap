-- PHASE 1 DESIGN ONLY. DO NOT EXECUTE.
-- Add missing legacy site index; migration 1002, after 1001.
-- Idempotence requires same-name exact index_xinfo; verify query plan in Phase 2.
-- Rollback: retain index for old-reader fallback; no reports data changes.
-- Named :parameters are template syntax: future runner compiles to ordered ?n bindings.
-- Never execute this file as an unbound script. See ../README.md sections N/O/AC/T.
-- Future runner first checks existing sqlite_schema + index_xinfo.
-- If absent, create. If exactly this shape exists, mark verified adoption.
-- A same-name different definition MUST stop; IF NOT EXISTS alone is insufficient.
CREATE INDEX IF NOT EXISTS reports_site_history
  ON reports(site_id,status,observed_on DESC,received_at DESC,id DESC);
-- Add schema_migrations version 1002 with script checksum in the same future batch.
