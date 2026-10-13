-- Approved two-gate activation, one atomic file while paired Worker maintenance remains active.
UPDATE system_state SET mode='NORMAL',generation=generation+1,reason='Approved P1 publication activation',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1 AND mode='READ_ONLY_MAINTENANCE' AND generation=3;
INSERT INTO transaction_assertions(assertion_id,ok) VALUES('p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-sys',CASE WHEN changes()=1 THEN 1 ELSE 0 END);
UPDATE public_publication_state SET write_frozen=0,revision=revision+1 WHERE id=1 AND epoch='d062b1684fedee0da8ca30fa8364e635' AND revision=0 AND write_frozen=1;
INSERT INTO transaction_assertions(assertion_id,ok) VALUES('p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-pub',CASE WHEN changes()=1 THEN 1 ELSE 0 END);
INSERT INTO transaction_assertions(assertion_id,ok) VALUES('p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-both',CASE WHEN (SELECT mode='NORMAL' AND generation=4 FROM system_state WHERE id=1) AND (SELECT write_frozen=0 AND revision=1 FROM public_publication_state WHERE id=1) AND (SELECT count(*) FROM publication_writer_claim)=0 THEN 1 ELSE 0 END);
DELETE FROM transaction_assertions WHERE assertion_id IN('p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-sys','p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-pub','p1-thaw-11f35f4cd5f9438db1ae3765fa4394f8-both');
