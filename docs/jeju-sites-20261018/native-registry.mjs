import {execFileSync} from 'node:child_process';
// Native local D1 (Miniflare) check of append-registry.sql and rollback-registry.sql on the production table shapes.
// Usage: node docs/jeju-sites-20261018/native-registry.mjs <node_modules dir containing miniflare>
import {createRequire} from 'node:module';import path from 'node:path';
import fs from 'node:fs';import assert from 'node:assert/strict';
import {prepareSiteSeed} from '../../reports-api/tools/sites-seed.mjs';
const require=createRequire(import.meta.url);
if(!process.argv[2])throw Error('Pass the local Miniflare node_modules directory');
const {Miniflare,convertV4MiniflareOptions}=require(path.join(path.resolve(process.argv[2]),'miniflare'));
const sql=fs.readFileSync('docs/jeju-sites-20261018/append-registry.sql','utf8');
const undo=fs.readFileSync('docs/jeju-sites-20261018/rollback-registry.sql','utf8');
const core=fs.readFileSync('docs/long-term-db-phase2e/migrations-main/0001_core.sql','utf8');
const table=name=>core.match(new RegExp('CREATE TABLE '+name+' \\([\\s\\S]*?\\n\\);'))[0];
const plan=await prepareSiteSeed(execFileSync('git',['show','d7214f280be43c2c90657eaf87ee2284df7ca0a9:index.html'],{encoding:'utf8',maxBuffer:20*1024*1024}),{capturedAt:'2026-10-18T00:00:00+09:00',expectedCount:208});
const NEW=['206','207','208','209','210','211','212','213'];
const old=plan.sites.filter(s=>!NEW.includes(s.site_id)),added=plan.sites.filter(s=>NEW.includes(s.site_id));
assert.equal(old.length,200);assert.equal(added.length,8);
const keys=Object.keys(old[0]);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local test")}}',compatibilityDate:'2026-10-01',d1Databases:{DB:'jeju-local-only'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
let checks=0;
try{
 const db=await mf.getD1Database('DB');
 for(const s of [table('sites'),table('raw_submissions'),table('checklists'),
  "CREATE TABLE system_state (id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL CHECK (mode IN ('NORMAL','READ_ONLY_MAINTENANCE')), generation INTEGER NOT NULL CHECK (typeof(generation)='integer' AND generation >= 0), reason TEXT, updated_at TEXT NOT NULL)",
  "CREATE TRIGGER system_state_transition BEFORE UPDATE ON system_state WHEN NEW.id IS NOT OLD.id OR NEW.mode IS OLD.mode OR NEW.generation IS NOT OLD.generation + 1 BEGIN SELECT RAISE(ABORT,'system_state_transition_invalid'); END",
  "INSERT INTO system_state VALUES (1,'NORMAL',14,'synthetic','2026-10-18T00:00:00Z')",
  // Minimal stand-ins for the legacy reports and field news tables: their rows must survive every path.
  "CREATE TABLE reports (id TEXT PRIMARY KEY, site_id TEXT, species TEXT)",
  "CREATE TABLE field_updates (id TEXT PRIMARY KEY, note TEXT)",
  "INSERT INTO reports VALUES ('keep-1','59','동박새')","INSERT INTO field_updates VALUES ('keep-f','현장소식')"])await db.prepare(s).run();
 await db.batch(old.map(s=>db.prepare('INSERT INTO sites ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>s[k]))));
 const dump=async()=>JSON.stringify((await db.prepare('SELECT * FROM sites ORDER BY site_id').all()).results);
 const backup=await dump(); // Logical backup taken before the change.
 const count=async()=>(await db.prepare('SELECT COUNT(*) n FROM sites').first()).n;
 const run=(g,before,rows)=>db.prepare(sql).bind(g,JSON.stringify(before),JSON.stringify(rows)).run();
 // Fail-closed preconditions: stale generation, missing/extra/duplicate/unreviewed ID, drifted snapshot.
 const drift=old.map((s,i)=>i?s:{...s,lat:s.lat+0.001});
 for(const [g,before,rows] of [[13,old,added],[14,old,added.slice(1)],[14,old,[added[0],added[0]]],[14,old,[...added.slice(0,7),{...added[7],site_id:'214'}]],[14,old.slice(1),added],[14,drift,added]]){
  await assert.rejects(()=>run(g,before,rows));assert.equal(await count(),200);checks++;
 }
 await db.prepare("UPDATE system_state SET mode='READ_ONLY_MAINTENANCE',generation=15 WHERE id=1").run();
 await assert.rejects(()=>run(15,old,added));assert.equal(await count(),200);checks++;
 await db.prepare("UPDATE system_state SET mode='NORMAL',generation=16 WHERE id=1").run();
 await run(16,old,added);assert.equal(await count(),208);checks++;
 const rows=(await db.prepare('SELECT * FROM sites ORDER BY site_id').all()).results;
 assert.equal(JSON.stringify(rows.filter(r=>!NEW.includes(r.site_id))),backup);checks++; // Old 200 byte-identical.
 assert.deepEqual(rows.filter(r=>NEW.includes(r.site_id)),added);checks++;
 await assert.rejects(()=>run(16,old,added));assert.equal(await count(),208);checks++; // Replay refused.
 const others=async()=>JSON.stringify([(await db.prepare('SELECT * FROM reports ORDER BY id').all()).results,(await db.prepare('SELECT * FROM field_updates').all()).results,(await db.prepare('SELECT * FROM checklists').all()).results]);
 const othersBefore=await others();
 const back=(g,rows)=>db.prepare(undo).bind(g,JSON.stringify(rows)).run();
 // Selective rollback refuses on stale generation, an edited new row, or a report pointing at a new ID.
 await assert.rejects(()=>back(15,added));assert.equal(await count(),208);checks++;
 await db.prepare("UPDATE sites SET site_name='edited' WHERE site_id='208'").run();
 await assert.rejects(()=>back(16,added));assert.equal(await count(),208);checks++;
 await db.prepare("UPDATE sites SET site_name=? WHERE site_id='208'").bind(added.find(a=>a.site_id==='208').site_name).run();
 await db.prepare("INSERT INTO reports VALUES ('r207','207','원앙')").run();
 await assert.rejects(()=>back(16,added));assert.equal(await count(),208);checks++;
 await db.prepare("DELETE FROM reports WHERE id='r207'").run();
 // Success: exactly 206-210 removed, the old 200 rows and every report/field-news row identical.
 await back(16,added);assert.equal(await dump(),backup);assert.equal(await others(),othersBefore);checks++;
 await back(16,added);assert.equal(await dump(),backup);assert.equal(await others(),othersBefore);checks++; // Replay is a no-op.
 // Once a checklist references 206 the guarded rollback refuses (and the FK would block a raw DELETE too).
 await run(16,old,added);
 const hex='0'.repeat(64);
 await db.prepare("INSERT INTO raw_submissions (raw_id,source_type,source_id,payload_json,schema_version,captured_at,source_fingerprint) VALUES ('r1','legacy_reports_snapshot','c1','{}','1','2026-10-18','"+hex+"')").run();
 await db.prepare("INSERT INTO checklists (checklist_id,site_id,raw_id,source_type,source_id,record_mode,observation_date,species_text,received_at,created_at,updated_at) VALUES ('c1','206','r1','legacy_reports','c1','legacy_report','2026-12-01','원앙','2026-12-01','2026-12-01','2026-12-01')").run();
 await assert.rejects(()=>back(16,added));assert.equal(await count(),208);checks++;
 await assert.rejects(()=>db.prepare("DELETE FROM sites WHERE site_id IN ('206','207','208','209','210','211','212','213')").run());assert.equal(await count(),208);checks++;
 console.log(JSON.stringify({engine:'native local D1 (Miniflare)',checks,fail:0,oldRowsUnchanged:200,added:added.map(s=>s.site_id),selectiveRollback:'exact 206-213 only, reports/field news unchanged; refused when stale, edited or referenced'}));
}finally{await mf.dispose();}
