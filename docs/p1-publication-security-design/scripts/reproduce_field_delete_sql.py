# Analysis-only in-memory SQL ordering model. No Worker/D1/real-user writes.
from pathlib import Path
import sqlite3,re,json,hashlib,sys
root=Path(__file__).resolve().parents[3]
source=(root/'reports-api/src/field-updates.js').read_text(encoding='utf-8')
schema=(root/'reports-api/schema.sql').read_text(encoding='utf-8')
status_sql=re.search(r'"(UPDATE field_updates SET status = \?2, updated_at = \?3, last_activity_at = \?3 WHERE id = \?1)"',source).group(1)
delete_sql=re.search(r'"(UPDATE field_updates SET status = \?2 WHERE id = \?1 AND user_hash = \?3 AND status <> \?2)"',source).group(1)
def fixture():
 d=sqlite3.connect(':memory:'); d.executescript(schema)
 d.execute("INSERT INTO field_updates (id,species,status,lat,lon,public_lat,public_lon,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",('synthetic-id','synthetic ordinary bird','not_visible',37,127,37,127,'synthetic','2026-10-12T01:00:00Z','2026-10-12T01:00:00Z','2026-10-12T01:00:00Z','synthetic-owner','synthetic-iphash'))
 d.commit(); return d
rows=[]
d=fixture(); before=d.execute('SELECT status FROM field_updates').fetchone()[0]
d.execute(delete_sql,('synthetic-id','deleted','synthetic-owner')); d.commit(); deleted=d.execute('SELECT status FROM field_updates').fetchone()[0]
d.execute(status_sql,('synthetic-id','reappeared','2026-10-12T01:01:00Z')); d.commit(); after=d.execute('SELECT status FROM field_updates').fetchone()[0]
public_count=d.execute("SELECT COUNT(*) FROM field_updates WHERE last_activity_at>=? AND status<>'deleted'",('2026-10-11T22:01:00Z',)).fetchone()[0]
rows.append({'id':'existing-sql-delete-then-late-status','before':before,'deleteCommitted':deleted,'afterLateOriginalUpdate':after,'publicListEligibleCount':public_count,'terminalPropertyHolds':after=='deleted','classification':'existing product SQL ordering defect reproduced; not full authenticated API concurrency test'})
d=fixture(); d.executescript("CREATE TRIGGER design_deleted_terminal BEFORE UPDATE ON field_updates WHEN OLD.status='deleted' BEGIN SELECT RAISE(ABORT,'design_deleted_terminal'); END;")
d.execute(delete_sql,('synthetic-id','deleted','synthetic-owner')); d.commit()
try:d.execute(status_sql,('synthetic-id','reappeared','2026-10-12T01:01:00Z')); blocked=False
except sqlite3.IntegrityError:d.rollback(); blocked=True
rows.append({'id':'proposed-terminal-guard-model','lateUpdateAborted':blocked,'after':d.execute('SELECT status FROM field_updates').fetchone()[0],'classification':'design-only model, guard not implemented in product'})
assert rows[0]['terminalPropertyHolds']==False and rows[0]['publicListEligibleCount']==1
assert rows[1]['lateUpdateAborted'] and rows[1]['after']=='deleted'
out={'analysisOnly':True,'sourceCommit':'245298981e27f88ac26bad8b46d819a7df899c86','sqliteVersion':sqlite3.sqlite_version,'statusSqlSha256':hashlib.sha256(status_sql.encode()).hexdigest(),'deleteSqlSha256':hashlib.sha256(delete_sql.encode()).hexdigest(),'rows':rows,'limits':['Only SQL ordering modeled; no Turnstile/authentication/full handler execution','No remote D1, network, production coordinates or user data','Proposed guard is not implementation acceptance evidence']}
print(json.dumps(out,ensure_ascii=False,indent=2))
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
