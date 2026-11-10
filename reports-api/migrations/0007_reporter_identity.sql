-- Issue #84. Additive, no report/canonical/raw row is rewritten. Apply only after approval.
CREATE TABLE reporter_identity_groups (
 id TEXT PRIMARY KEY,
 report_ids TEXT NOT NULL CHECK(json_valid(report_ids) AND json_type(report_ids)='array' AND json_array_length(report_ids) BETWEEN 2 AND 200),
 representative_id TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 confirmed_by TEXT NOT NULL CHECK(length(confirmed_by)>0),
 evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 500),
 created_at TEXT NOT NULL,
 revoked_by TEXT, revoked_reason TEXT, revoked_at TEXT
);
CREATE TABLE reporter_identity_events (
 event_id INTEGER PRIMARY KEY, group_id TEXT NOT NULL REFERENCES reporter_identity_groups(id),
 action TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER identity_groups_insert BEFORE INSERT ON reporter_identity_groups BEGIN
 SELECT RAISE(ABORT,'identity_invalid') WHERE NEW.active<>1 OR NEW.revoked_by IS NOT NULL OR NEW.revoked_reason IS NOT NULL OR NEW.revoked_at IS NOT NULL
  OR (SELECT COUNT(DISTINCT value) FROM json_each(NEW.report_ids))<>json_array_length(NEW.report_ids)
  OR EXISTS(SELECT 1 FROM json_each(NEW.report_ids) j LEFT JOIN reports r ON r.id=j.value WHERE j.type<>'text' OR r.id IS NULL OR TRIM(COALESCE(r.reporter,''))='')
  OR NEW.representative_id IS NOT (SELECT r.id FROM reports r JOIN json_each(NEW.report_ids) j ON j.value=r.id ORDER BY r.received_at,r.id LIMIT 1)
  OR EXISTS(SELECT 1 FROM reporter_identity_groups g,json_each(g.report_ids) a,json_each(NEW.report_ids) b WHERE g.active=1 AND a.value=b.value);
 SELECT RAISE(ABORT,'reports_write_frozen') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0);
 SELECT RAISE(ABORT,'publication_writer_required') WHERE NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1);
END;
CREATE TRIGGER identity_groups_update BEFORE UPDATE ON reporter_identity_groups BEGIN
 SELECT RAISE(ABORT,'identity_immutable') WHERE OLD.active<>1 OR NEW.active<>0 OR NEW.id IS NOT OLD.id OR NEW.report_ids IS NOT OLD.report_ids
  OR NEW.representative_id IS NOT OLD.representative_id OR NEW.confirmed_by IS NOT OLD.confirmed_by OR NEW.evidence IS NOT OLD.evidence OR NEW.created_at IS NOT OLD.created_at
  OR NEW.revoked_by IS NULL OR length(NEW.revoked_by)=0 OR NEW.revoked_reason IS NULL OR length(NEW.revoked_reason) NOT BETWEEN 1 AND 500 OR NEW.revoked_at IS NULL;
 SELECT RAISE(ABORT,'reports_write_frozen') WHERE NOT EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0);
 SELECT RAISE(ABORT,'publication_writer_required') WHERE NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1);
END;
CREATE TRIGGER identity_groups_delete BEFORE DELETE ON reporter_identity_groups BEGIN SELECT RAISE(ABORT,'identity_immutable'); END;
CREATE TRIGGER identity_groups_created AFTER INSERT ON reporter_identity_groups BEGIN
 INSERT INTO reporter_identity_events(group_id,action,actor,reason,created_at) VALUES(NEW.id,'confirmed',NEW.confirmed_by,NEW.evidence,NEW.created_at);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER identity_groups_revoked AFTER UPDATE ON reporter_identity_groups BEGIN
 INSERT INTO reporter_identity_events(group_id,action,actor,reason,created_at) VALUES(NEW.id,'revoked',NEW.revoked_by,NEW.revoked_reason,NEW.revoked_at);
 UPDATE public_publication_state SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER identity_events_insert BEFORE INSERT ON reporter_identity_events BEGIN
 SELECT RAISE(ABORT,'publication_writer_required') WHERE NOT EXISTS(SELECT 1 FROM publication_writer_claim WHERE id=1 AND ok=1);
END;
CREATE TRIGGER identity_events_update BEFORE UPDATE ON reporter_identity_events BEGIN SELECT RAISE(ABORT,'identity_immutable'); END;
CREATE TRIGGER identity_events_delete BEFORE DELETE ON reporter_identity_events BEGIN SELECT RAISE(ABORT,'identity_immutable'); END;
