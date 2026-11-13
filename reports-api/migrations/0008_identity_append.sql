-- Additive migration: keep existing group IDs and report rows intact.
-- DO NOT apply to production without independent review and operator approval.
ALTER TABLE reporter_identity_groups ADD COLUMN append_actor TEXT;
ALTER TABLE reporter_identity_groups ADD COLUMN append_reason TEXT;
ALTER TABLE reporter_identity_groups ADD COLUMN append_at TEXT;
ALTER TABLE reporter_identity_events ADD COLUMN added_report_ids TEXT;
DROP TRIGGER identity_groups_update;
CREATE TRIGGER identity_groups_update BEFORE UPDATE ON reporter_identity_groups BEGIN
 SELECT RAISE(ABORT,'identity_immutable') WHERE OLD.active<>1
  OR NEW.id IS NOT OLD.id OR NEW.representative_id IS NOT OLD.representative_id
  OR NEW.confirmed_by IS NOT OLD.confirmed_by OR NEW.evidence IS NOT OLD.evidence
  OR NEW.created_at IS NOT OLD.created_at
  OR NOT COALESCE((
   (NEW.active=0 AND NEW.report_ids IS OLD.report_ids
    AND NEW.append_actor IS OLD.append_actor AND NEW.append_reason IS OLD.append_reason
    AND NEW.append_at IS OLD.append_at
    AND NEW.revoked_by IS NOT NULL AND LENGTH(NEW.revoked_by)>0
    AND NEW.revoked_reason IS NOT NULL AND LENGTH(NEW.revoked_reason) BETWEEN 1 AND 500
    AND NEW.revoked_at IS NOT NULL)
   OR
   (NEW.active=1 AND NEW.report_ids IS NOT OLD.report_ids
    AND NEW.revoked_by IS OLD.revoked_by AND NEW.revoked_reason IS OLD.revoked_reason
    AND NEW.revoked_at IS OLD.revoked_at
    AND NEW.append_actor IS NOT NULL AND LENGTH(TRIM(NEW.append_actor)) BETWEEN 1 AND 128
    AND NEW.append_reason IS NOT NULL AND LENGTH(TRIM(NEW.append_reason)) BETWEEN 1 AND 500
    AND NEW.append_at IS NOT NULL AND LENGTH(NEW.append_at)>0
    AND json_array_length(NEW.report_ids)>json_array_length(OLD.report_ids)
    AND (SELECT COUNT(DISTINCT value) FROM json_each(NEW.report_ids))=json_array_length(NEW.report_ids)
    AND NOT EXISTS(SELECT 1 FROM json_each(OLD.report_ids) o
      WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.report_ids) n WHERE n.value=o.value))
    AND NOT EXISTS(SELECT 1 FROM json_each(NEW.report_ids) n
      LEFT JOIN reports r ON r.id=n.value WHERE n.type<>'text' OR r.id IS NULL OR TRIM(COALESCE(r.reporter,''))='')
    AND NOT EXISTS(SELECT 1 FROM reporter_identity_groups g,json_each(g.report_ids) a,json_each(NEW.report_ids) b
      WHERE g.active=1 AND g.id<>NEW.id AND a.value=b.value))
  ),0);
 SELECT RAISE(ABORT,'reports_write_frozen') WHERE NOT EXISTS(
  SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0);
 SELECT RAISE(ABORT,'publication_writer_required') WHERE NOT EXISTS(
  SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1);
END;
DROP TRIGGER identity_groups_revoked;
CREATE TRIGGER identity_groups_revoked AFTER UPDATE OF active ON reporter_identity_groups
WHEN OLD.active=1 AND NEW.active=0 BEGIN
 INSERT INTO reporter_identity_events(group_id,action,actor,reason,created_at)
 VALUES(NEW.id,'revoked',NEW.revoked_by,NEW.revoked_reason,NEW.revoked_at);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER identity_groups_appended AFTER UPDATE OF report_ids ON reporter_identity_groups
WHEN OLD.active=1 AND NEW.active=1 AND NEW.report_ids IS NOT OLD.report_ids BEGIN
 INSERT INTO reporter_identity_events(group_id,action,actor,reason,created_at,added_report_ids)
 VALUES(NEW.id,'appended',NEW.append_actor,NEW.append_reason,NEW.append_at,
 (SELECT json_group_array(n.value) FROM json_each(NEW.report_ids) n
  WHERE NOT EXISTS(SELECT 1 FROM json_each(OLD.report_ids) o WHERE o.value=n.value)));
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
