import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module'; import {execFileSync} from 'node:child_process'; import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const repo=resolve(process.argv[2]),out=resolve(process.argv[3]),modules=resolve(process.argv[4]);
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(join(modules,'miniflare'));
const pinnedBasis='c025d75f964ab36f6f2eae541a99461f6de59b70'; const sourceBytes=readFileSync(join(repo,'reports-api/src/publication.js')); assert.equal(sourceBytes.toString().replace(/\r\n/g,"\n"),execFileSync('git', ['show',pinnedBasis+':reports-api/src/publication.js'],{cwd:repo,encoding:'utf8'})); const {PUBLICATION_GUARDS,publicationStateStatement}=await import(pathToFileURL(join(repo,'reports-api/src/publication.js')));
mkdirSync(out,{recursive:true});
const result={basis:'c025d75f964ab36f6f2eae541a99461f6de59b70',scope:'synthetic local workerd D1; product and production untouched',sourcePublicationSha256:createHash('sha256').update(sourceBytes).digest('hex'),checks:[],samples:[]};
const mf=new Miniflare(convertV4MiniflareOptions({name:'synthetic-schema-rowid-review',modules:true,script:'export default {fetch(){return new Response("local-only")}}',compatibilityDate:'2026-09-24',d1Databases:{DB:'synthetic-schema-review'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
function statements(input){const sql=input.replace(/--[^\n]*/g,''),list=[];let start=0,trigger=false,depth=0;for(const t of sql.matchAll(/'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_]\w*|;/g)){const w=t[0].toUpperCase();if(w==='TRIGGER'&&/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(sql.slice(start,t.index+w.length)))trigger=true;if(trigger&&(w==='BEGIN'||w==='CASE'))depth++;if(trigger&&w==='END')depth--;if(w===';'&&(!trigger||depth===0)){list.push(sql.slice(start,t.index+1).trim());start=t.index+1;trigger=false;depth=0;}}assert.equal(sql.slice(start).trim(),'');return list.filter(Boolean);}
async function check(id,fn){await fn();result.checks.push({id,status:'pass'});}
try{
 const db=await mf.getD1Database('DB');
 const pre=JSON.parse(readFileSync(join(repo,'docs/p1-publication-final-audit/operations/preflight-readonly.json'),'utf8'));
 const definitions=pre.database.schema.filter(s=>s.sql&&!['_cf_KV','sqlite_sequence','d1_migrations'].includes(s.name));
 assert.equal(definitions.length,48);
 const sql=['table','index','trigger'].flatMap(type=>definitions.filter(x=>x.type===type)).map(x=>x.sql+';').join('\n')+'\n'+pre.database.schema.find(s=>s.name==='d1_migrations').sql+';\n'+readFileSync(join(repo,'reports-api/migrations/0005_publication_security.sql'),'utf8');
 await db.batch(statements(sql).map(s=>db.prepare(s)));
 const scan=await db.prepare('SELECT rowid,name,sql FROM sqlite_schema WHERE type=? AND name IN ('+PUBLICATION_GUARDS.map(()=>'?').join(',')+')').bind('trigger',...PUBLICATION_GUARDS).all();
 assert.equal(scan.results.length,22);
 const names=PUBLICATION_GUARDS,hints=names.map(n=>scan.results.find(r=>r.name===n).rowid);
 const optim="SELECT epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revision_type,(SELECT COUNT(*) FROM sqlite_schema WHERE rowid IN ("+hints.map(()=>'?').join(',')+") AND type='trigger' AND name IN ("+names.map(()=>'?').join(',')+")) AS guards FROM public_publication_state WHERE id=1";
 const scalarSql=() => "SELECT epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revision_type,("+names.map(()=>"(SELECT COUNT(*) FROM sqlite_schema WHERE rowid=? AND type='trigger' AND name=?)").join("+")+") AS guards FROM public_publication_state WHERE id=1"; const scalarBinds=()=>names.flatMap((n,i)=>[hints[i],n]); const scalar=()=>db.prepare(scalarSql()).bind(...scalarBinds()).all(); const query=()=>db.prepare(optim).bind(...hints,...names).all();
 const base=await publicationStateStatement(db).all(),fast=await query();
 result.samples.push({id:'baseline',meta:base.meta,guardCount:base.results[0].guards});
 result.samples.push({id:'rowid lookup hints only',meta:fast.meta,guardCount:fast.results[0].guards});
 result.samples.push({id:'cold locator scan',meta:scan.meta});
 await check('S01 same state and guard count primary single-query snapshot',async()=>assert.deepEqual(fast.results,base.results));
 await check('S02 indexed rowid IN lookup measured 45 reads and zero writes',async()=>{assert.equal(fast.meta.rows_read,45);assert.equal(fast.meta.rows_written,0);assert.equal(fast.meta.changed_db,false);});
 const cold=await db.prepare("SELECT epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revision_type,(SELECT json_group_array(json_object('name',name,'rowid',rowid)) FROM sqlite_schema WHERE type='trigger' AND name IN ("+names.map(()=>'?').join(',')+")) AS guardLocators FROM public_publication_state WHERE id=1").bind(...names).all(); result.samples.push({id:'cold state plus locators same snapshot',meta:cold.meta,locators:JSON.parse(cold.results[0].guardLocators)}); await check('S01b same-query cold locator discovery costs103 reads writes0',async()=>{assert.equal(cold.meta.rows_read,103);assert.equal(cold.meta.rows_written,0);const loc=JSON.parse(cold.results[0].guardLocators);assert.equal(loc.length,22);assert.deepEqual(loc.map(r=>r.name).sort(),names.slice().sort());}); const scalarFirst=await scalar(); result.samples.push({id:"scalar rowid/name",meta:scalarFirst.meta,guardCount:scalarFirst.results[0].guards}); await check("S02b scalar rowid/name exactly23 reads writes0",async()=>{assert.equal(scalarFirst.meta.rows_read,23);assert.equal(scalarFirst.meta.rows_written,0);assert.deepEqual(scalarFirst.results,base.results);}); const eqp=await db.prepare('EXPLAIN QUERY PLAN '+optim).bind(...hints,...names).all();result.queryPlan=eqp.results;
 await check('S03 query plan uses INTEGER PRIMARY KEY for catalog',async()=>assert.ok(eqp.results.some(r=>/SEARCH sqlite_schema USING INTEGER PRIMARY KEY/.test(r.detail))));
 for(const entry of scan.results){
  await db.prepare('DROP TRIGGER "'+entry.name+'"').run();
  const a=await query();assert.equal((await scalar()).results[0].guards,21);await check('S04 drop '+entry.name+' immediate count fail-closed',async()=>assert.equal(a.results[0].guards,21));
  await db.prepare(entry.sql).run();
  const stale=await query(),full=await publicationStateStatement(db).all();
  assert.equal(full.results[0].guards,22);
  result.samples.push({id:'restored '+entry.name,staleHintGuards:stale.results[0].guards,fullScanGuards:full.results[0].guards});
  const renewed=await db.prepare('SELECT rowid,name FROM sqlite_schema WHERE type=? AND name IN ('+names.map(()=>'?').join(',')+')').bind('trigger',...names).all();
  for(let n=0;n<hints.length;n++)hints[n]=renewed.results.find(r=>r.name===names[n]).rowid;
  await check('S05 refresh only after full validated scan '+entry.name,async()=>assert.equal((await query()).results[0].guards,22));
 }
 await db.prepare("CREATE TABLE unrelated_synthetic_table (id INTEGER PRIMARY KEY, value TEXT)").run();
 await check('S06 unrelated schema changes do not invalidate intact trigger names',async()=>assert.equal((await query()).results[0].guards,22));
 const location=await db.prepare("SELECT rowid,sql FROM sqlite_schema WHERE name='publication_reports_delete'").first();
 await db.prepare('DROP TRIGGER publication_reports_delete').run();
 await db.prepare("CREATE TRIGGER wrong_synthetic_name AFTER DELETE ON reports BEGIN SELECT 1; END").run();
 await check('S07 reused rowid with wrong name cannot satisfy allowlist',async()=>assert.equal((await query()).results[0].guards,21));
 await db.prepare('DROP TRIGGER wrong_synthetic_name').run();
 await db.prepare(location.sql).run();
 try{const pragma=await db.prepare('PRAGMA schema_version').all();result.samples.push({id:'PRAGMA schema_version',rows:pragma.results,meta:pragma.meta});}catch(e){result.pragmaError=e.message;}
 try{const x=await db.prepare('SELECT schema_version FROM pragma_schema_version').all();result.samples.push({id:'table-valued pragma',rows:x.results,meta:x.meta});}catch(e){result.tableValuedPragmaError=e.message;}
 result.sql={optimized:optim,scalar:scalarSql(),hintsUse:'Lookup locators only; every read verifies primary schema existence/type/name and singleton state; no positive guard-proof cache'};
 result.total={pass:result.checks.length,fail:0,skip:0};
}catch(e){result.error={message:e.message,stack:e.stack};result.total={pass:result.checks.length,fail:1,skip:0};process.exitCode=1;}
finally{await mf.dispose();writeFileSync(join(out,'ROWID_LOOKUP_PROBE.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.total));}






