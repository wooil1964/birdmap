import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {strictWriterDb,writerFenceReady,WRITER_FENCE_GUARDS} from '../src/writer-fence.js';
import {publicationAnchor} from '../src/publication.js';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const fence=readFileSync(new URL('../migrations/0004b_publication_writer_fence.sql',import.meta.url),'utf8');
function fixture(install=true) {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema.split('-- Atomic pre-barrier:')[0]);
 sqlite.exec("CREATE TABLE transaction_assertions(assertion_id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))");
 sqlite.exec("INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES('r','approved','synthetic',37,127,'2026-10-13','x','x','x')");
 sqlite.exec("INSERT INTO field_updates(id,species,status,lat,lon,public_lat,public_lon,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES('f','synthetic','not_visible',37,127,37.1,127.1,'synthetic','x','x','x','x','x')");
 sqlite.exec("INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('e','f','not_visible','synthetic','x','x','x')");
 sqlite.exec("INSERT INTO field_update_confirmations(id,field_update_id,user_hash,ip_hash,created_at) VALUES('c','f','x','x','x')");
 if(install)sqlite.exec(fence);
 const batches=[];let sessions=0;
 const raw={
  prepare(sql){let params=[];const st={sql,
   bind(...p){params=p;return st;},
   execute(){const s=sqlite.prepare(sql),returns=s.columns().length>0;
    const rows=returns?s.all(...params).map(r=>({...r})):[];if(!returns)s.run(...params);
    return {success:true,results:rows,meta:{changes:/^\s*SELECT\b/i.test(sql)?0:Number(sqlite.prepare('SELECT changes() AS n').get().n)}};
   },
   async all(){return st.execute();},async run(){return st.execute();},
   async first(column){const row=st.execute().results[0]??null;if(column!==undefined&&row){if(!Object.hasOwn(row,column))throw Error('D1_COLUMN_NOTFOUND');return row[column];}return row;},
   async raw(){return st.execute().results.map(Object.values);}
  };return st;},
  async batch(list){batches.push(list.map(s=>s.sql));sqlite.exec('BEGIN');try{const out=list.map(s=>s.execute());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
  withSession(mode){assert.equal(mode,'first-primary');sessions++;return raw;}
 };
 const db=strictWriterDb(raw,true);
 return {sqlite,raw,db,batches,get sessions(){return sessions;}};
}
const row=s=>({...s.prepare("SELECT * FROM field_updates WHERE id='f'").get()});
const claims=s=>s.prepare('SELECT count(*) AS n FROM publication_writer_claim').get().n;
const version=s=>s.prepare('SELECT CAST(revision AS TEXT) AS v FROM public_publication_state').get().v;
const late="UPDATE field_updates SET status='reappeared',updated_at='late',last_activity_at='late' WHERE id='f'";

test('writer fence: reproduces legacy nonterminal overwrite before barrier and blocks exact SQL after thaw',async()=>{
 const old=fixture(false);await old.raw.prepare(late).run();assert.equal(row(old.sqlite).status,'reappeared');
 const f=fixture();const before=row(f.sqlite),rev=version(f.sqlite);
 await assert.rejects(f.raw.prepare(late).run(),/publication_writer_required/);
 assert.deepEqual(row(f.sqlite),before);assert.equal(version(f.sqlite),rev);assert.equal(claims(f.sqlite),0);
 await f.db.prepare("UPDATE field_updates SET status='reappeared',row_revision=row_revision+1 WHERE id='f' AND row_revision=?").bind(before.row_revision).run();
 assert.equal(row(f.sqlite).status,'reappeared');assert.equal(claims(f.sqlite),0);
});

test('writer fence: separately committed prebarrier survives failed publication migration exactly',()=>{
 const s=new DatabaseSync(':memory:');
 const base=new URL('../../docs/p1-publication-security-implementation/results/server-audit/pre-publication-schema.sql',import.meta.url);
 s.exec(readFileSync(base,'utf8'));s.exec(fence);
 const objects=()=>JSON.stringify(s.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
 const before=objects();
 s.exec('BEGIN');try{s.exec(readFileSync(new URL('../migrations/0005_publication_security.sql',import.meta.url),'utf8'));s.exec('INSERT INTO absent_injected_failure VALUES(1)');assert.fail('injected failure must throw');}catch(e){s.exec('ROLLBACK');assert.match(String(e),/absent_injected_failure/);}
 assert.equal(objects(),before);
 assert.equal(s.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE 'writer_fence_%'").get().n,12);
 assert.equal(s.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='public_publication_state'").get().n,0);
 assert.throws(()=>s.exec("INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES('late','pending','synthetic',37,127,'x','x','x','late')"),/publication_writer_required/);
 assert.equal(claims(s),0);
});

const insertSql={
 reports:"INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES('r2','approved','synthetic',37,127,'x','x','x','r2')",
 field_updates:"INSERT INTO field_updates(id,species,status,lat,lon,public_lat,public_lon,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES('f2','synthetic','visible',37,127,37,127,'synthetic','x','x','x','x','x')",
 field_update_events:"INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES('e2','f','visible','synthetic','x','x','x')",
 field_update_confirmations:"INSERT INTO field_update_confirmations(id,field_update_id,user_hash,ip_hash,created_at) VALUES('c2','f','y','x','x')"
};
for(const table of Object.keys(insertSql))for(const action of ['insert','update','delete'])test('writer fence: unclaimed '+table+' '+action+' rejected',async()=>{
 const f=fixture(),ids={reports:'r',field_updates:'f',field_update_events:'e',field_update_confirmations:'c'};
 const sql=action==='insert'?insertSql[table]:action==='delete'?"DELETE FROM "+table+" WHERE id='"+ids[table]+"'":"UPDATE "+table+" SET id=id WHERE id='"+ids[table]+"'";
 const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM '+table).all()),rev=version(f.sqlite);
 await assert.rejects(f.raw.prepare(sql).run(),/publication_writer_required/);
 assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM '+table).all()),before);assert.equal(version(f.sqlite),rev);assert.equal(claims(f.sqlite),0);
});

test('writer fence: current batch preserves body order and meta.changes without public read claims',async()=>{
 const f=fixture();assert.equal(await writerFenceReady(f.raw),true);
 const result=await f.db.batch([f.db.prepare("UPDATE reports SET name_public=0 WHERE id='r'"),f.db.prepare("SELECT id FROM reports WHERE id='r'")]);
 assert.equal(result.length,2);assert.equal(result[0].meta.changes,1);assert.equal(result[1].results[0].id,'r');assert.equal(claims(f.sqlite),0);
 const anchor=await publicationAnchor(f.db,{nonce:'a'.repeat(32)});
 assert.equal(anchor.contract,'publication-v1');assert.equal(f.sessions,1);
 const last=f.batches.length;await f.db.batch([f.db.prepare("SELECT id FROM reports")]);
 assert.equal(f.batches[last].length,1);assert.equal(claims(f.sqlite),0);
});

test('writer fence: middle and suffix failures roll back body, version and ephemeral claim',async()=>{
 const f=fixture(),before=version(f.sqlite);
 await assert.rejects(f.db.batch([f.db.prepare("UPDATE reports SET name_public=1 WHERE id='r'"),f.db.prepare("INSERT INTO transaction_assertions VALUES('fail',0)")]),/CHECK constraint failed/);
 assert.equal(f.sqlite.prepare("SELECT name_public FROM reports WHERE id='r'").get().name_public,0);assert.equal(version(f.sqlite),before);assert.equal(claims(f.sqlite),0);
 f.sqlite.exec("CREATE TRIGGER injected_claim_delete BEFORE DELETE ON publication_writer_claim BEGIN SELECT RAISE(ABORT,'injected_suffix'); END;");
 await assert.rejects(f.db.prepare("UPDATE reports SET name_public=1 WHERE id='r'").run(),/injected_suffix/);
 assert.equal(f.sqlite.prepare("SELECT name_public FROM reports WHERE id='r'").get().name_public,0);assert.equal(version(f.sqlite),before);assert.equal(claims(f.sqlite),0);
});

test('writer fence: orphan, frozen state and missing barrier fail closed without automatic repair',async()=>{
 for(const mode of ['orphan','frozen','missing']){
  const f=fixture(),before=row(f.sqlite);
  if(mode==='orphan')f.sqlite.exec('INSERT INTO publication_writer_claim VALUES(1,1)');
  if(mode==='frozen')f.sqlite.exec('UPDATE public_publication_state SET write_frozen=1,revision=revision+1');
  if(mode==='missing')f.sqlite.exec('DROP TRIGGER '+WRITER_FENCE_GUARDS[0]);
  assert.equal(await writerFenceReady(f.raw),false);
  await assert.rejects(f.db.prepare(late).run(),e=>e.code==='WRITE_MAINTENANCE'&&e.status===503);
  assert.deepEqual(row(f.sqlite),before);
  if(mode==='orphan')await assert.rejects(publicationAnchor(f.raw,{nonce:'a'.repeat(32)}),e=>e.code==='PUBLICATION_UNAVAILABLE');
  assert.equal(claims(f.sqlite),mode==='orphan'?1:0);
 }
});

test('writer fence: RETURNING first(column) preserves missing/empty-column behavior and raw writes close',async()=>{
 const f=fixture();
 assert.equal(await f.db.prepare("UPDATE reports SET name_public=1 WHERE id='r' RETURNING name_public AS value").first('value'),1);
 assert.equal(await f.db.prepare('UPDATE reports SET name_public=0 WHERE id=\'r\' RETURNING name_public AS ""').first(''),0);
 await assert.rejects(f.db.prepare("UPDATE reports SET name_public=1 WHERE id='r' RETURNING name_public").first('missing'),/D1_COLUMN_NOTFOUND/);
 assert.throws(()=>f.db.prepare(late).raw(),e=>e.code==='WRITE_MAINTENANCE');
 assert.equal(claims(f.sqlite),0);
});

test('writer fence: 20 simultaneous current batches cannot borrow or leak a claim',async()=>{
 const f=fixture();
 const outcomes=await Promise.all(Array.from({length:20},(_,i)=>f.db.prepare("UPDATE reports SET bird_count=? WHERE id='r'").bind(i).run()));
 assert.equal(outcomes.filter(x=>x.success&&x.meta.changes===1).length,20);assert.equal(claims(f.sqlite),0);
 assert.equal(strictWriterDb(f.raw,true),f.db);assert.equal(strictWriterDb(f.db,true),f.db);
 await assert.rejects(f.raw.prepare(late).run(),/publication_writer_required/);
});

test('writer fence: read-only statistics CTE does not allocate a writer claim',async()=>{const f=fixture();const before=f.batches.length;const r=await f.db.prepare("WITH grouped AS(SELECT id FROM reports) SELECT id FROM grouped").all();assert.equal(r.results[0].id,'r');assert.equal(f.batches.length,before);assert.equal(claims(f.sqlite),0);});
