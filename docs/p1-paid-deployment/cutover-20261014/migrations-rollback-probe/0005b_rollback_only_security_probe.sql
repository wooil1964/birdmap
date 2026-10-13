-- Operating synthetic rollback-only probe. Whole file MUST fail at terminal guard.
-- No real user ID or coordinate. Dedicated failed migration must leave ledger unchanged.
CREATE TABLE __p1_security_probe (name TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
UPDATE public_publication_state SET write_frozen=0,revision=revision+1 WHERE id=1 AND write_frozen=1 AND revision=0;
INSERT INTO __p1_security_probe VALUES('temporary-unfreeze',CASE WHEN (SELECT write_frozen FROM public_publication_state WHERE id=1)=0 THEN 1 ELSE 0 END);
INSERT INTO publication_writer_claim VALUES(1,1);
INSERT INTO field_updates (id,species,bird_count,status,lat,lon,public_lat,public_lon,location_hidden,nickname,note,location_source,gps_accuracy,created_at,updated_at,last_confirmed_at,last_activity_at,user_hash,ip_hash,row_revision)
VALUES('3f1f0000-0000-4000-8000-000000000017','SYNTHETIC_NONBIRD',1,'visible',0,0,0,0,0,'SYNTHETIC_AUDIT','rollback-only synthetic','map',NULL,'2026-10-14T00:00:00Z','2026-10-14T00:00:00Z',NULL,'2026-10-14T00:00:00Z','synthetic-no-owner','synthetic-no-ip',1);
UPDATE field_updates SET status='not_visible',row_revision=row_revision+1 WHERE id='3f1f0000-0000-4000-8000-000000000017' AND row_revision=999;
INSERT INTO __p1_security_probe VALUES('wrong-CAS-rejected',CASE WHEN (SELECT status='visible' AND row_revision=1 FROM field_updates WHERE id='3f1f0000-0000-4000-8000-000000000017') THEN 1 ELSE 0 END);
UPDATE field_updates SET status='not_visible',row_revision=row_revision+1 WHERE id='3f1f0000-0000-4000-8000-000000000017' AND row_revision=1;
INSERT INTO __p1_security_probe VALUES('valid-CAS-updated',CASE WHEN (SELECT status='not_visible' AND row_revision=2 FROM field_updates WHERE id='3f1f0000-0000-4000-8000-000000000017') THEN 1 ELSE 0 END);
UPDATE field_updates SET status='deleted',row_revision=row_revision+1 WHERE id='3f1f0000-0000-4000-8000-000000000017' AND row_revision=2;
INSERT INTO __p1_security_probe VALUES('deleted-accepted',CASE WHEN (SELECT status='deleted' AND row_revision=3 FROM field_updates WHERE id='3f1f0000-0000-4000-8000-000000000017') THEN 1 ELSE 0 END);
UPDATE field_updates SET status='reappeared',row_revision=row_revision+1 WHERE id='3f1f0000-0000-4000-8000-000000000017' AND row_revision=3;
-- Reaching this check means terminal guard failed. Different error must NOT pass the probe.
INSERT INTO __p1_security_probe VALUES('terminal-guard-missing',0);
