-- Additive Issue #28 migration. Freeze writes, install, deploy the new public
-- Worker, verify both read paths and guards, then explicitly thaw. Do not enable
-- restricted submissions while an old public Worker version is serving traffic.
-- Existing rows retain their previous all-public visibility; new application
-- submissions explicitly supply '10'. No coordinates or report rows change.
ALTER TABLE field_updates ADD COLUMN visibility_radius TEXT NOT NULL DEFAULT 'all'
  CHECK(typeof(visibility_radius)='text' AND visibility_radius IN ('5','10','20','all'));
CREATE INDEX idx_field_updates_visibility_activity ON field_updates(visibility_radius,last_activity_at DESC);

-- No API changes the scope of an existing row. This also covers the new column
-- without weakening the established deleted-terminal trigger or writer fence.
CREATE TRIGGER field_visibility_immutable BEFORE UPDATE ON field_updates
WHEN NEW.visibility_radius IS NOT OLD.visibility_radius
BEGIN SELECT RAISE(ABORT,'field_visibility_immutable'); END;

-- Permission-generation fence: previous Workers require the old trigger name
-- in every publication snapshot and therefore fail closed after this migration.
-- Restoring an old Worker cannot publish the newly restricted rows.
CREATE TRIGGER publication_field_updates_insert_scoped AFTER INSERT ON field_updates
BEGIN
 SELECT RAISE(ABORT,'publication_state_unavailable') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND typeof(revision)='integer' AND revision>=0 AND revision<9223372036854775807);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
DROP TRIGGER publication_field_updates_insert;

UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
