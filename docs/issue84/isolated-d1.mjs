// Local-only rehearsal. No Wrangler config, account, remote D1, or production data.
// node docs/issue84/isolated-d1.mjs <node_modules> <results.json>
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {splitDDL,installAuthStubs,environments,input,post,adminPost} from '../../reports-api/local-test/helpers.mjs';
import {strictWriterDb,WRITER_FENCE_GUARDS,writerFenceReady} from '../../reports-api/src/writer-fence.js';
import {IDENTITY_GUARDS,confirmedIdentityAction} from '../../reports-api/src/reporter-identity.js';
import {handleRequest as publicHandler} from '../../reports-api/src/public.js';
import {handleRequest as adminHandler} from '../../reports-api/src/admin.js';
import {publicEnv,ORIGIN} from '../../reports-api/test/helpers.mjs';
import {kstDateString} from '../../reports-api/src/shared.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(join(resolve(process.argv[2]),'miniflare'));
const output=resolve(process.argv[3]);
const migration=readFileSync(new URL('../../reports-api/migrations/0007_reporter_identity.sql',import.meta.url),'utf8');
const flags={REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
const evidence={scope:'Node Worker handlers + local Miniflare/workerd D1; synthetic fixtures only; no production access',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:new URL('../..',import.meta.url)}).trim(),node:process.version,miniflare:require(join(resolve(process.argv[2]),'miniflare/package.json')).version,startedAt:new Date().toISOString(),checks:[],observations:[]};
const instances=[];
async function fresh(base=true) {
 const mf=new Miniflare(convertV4MiniflareOptions({name:'issue84-isolated',modules:true,script:'export default {fetch(){return new Response("local-only")}}',compatibilityDate:'2026-09-24',d1Databases:{REPORTS_DB:'issue84-local-only'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
 instances.push(mf);const raw=await mf.getD1Database('REPORTS_DB');
 if(base)for(const file of ['../../reports-api/schema.sql','../long-term-db-phase2a/migrations/0001_core.sql','../long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql'])await raw.batch(splitDDL(readFileSync(new URL(file,import.meta.url),'utf8')).map(sql=>raw.prepare(sql)));
 return {raw,db:strictWriterDb(raw,true)};
}
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const n=async(db,sql)=>(await db.prepare(sql).first()).n;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot(db,all=true,publication=true) {
 const tables=await rows(db,"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
 const data={};for(const {name} of tables)if((all||!name.startsWith('reporter_identity_'))&&(publication||name!=='public_publication_state'))data[name]=await rows(db,`SELECT * FROM "${name}" ORDER BY 1`);
 return hash(data);
}
const schema=db=>rows(db,"SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name");
async function unchanged(db,fn){const before=await snapshot(db);await fn();assert.equal(await snapshot(db),before);}
const check=async(name,fn)=>{await fn();evidence.checks.push({name,result:'PASS'});console.log('PASS '+name);};
const apply=raw=>raw.batch(splitDDL(migration).map(sql=>raw.prepare(sql)));
const confirmation=(db,ids=['b','a'])=>confirmedIdentityAction(db,{action:'confirm',reportIds:ids,confirmedSamePerson:true,reason:'Synthetic identity verification'},'local-admin@example.test');
const revoke=(db,id)=>confirmedIdentityAction(db,{action:'revoke',groupId:id,reason:'Synthetic correction'},'local-admin@example.test');
const pub=(db,on=true)=>publicEnv(db,{REPORTS_PUBLICATION_REQUIRED:'true',...(on?{REPORTS_CONFIRMED_IDENTITIES:'1'}:{})});
const nonce='a'.repeat(32);
async function publicUrl(env,path,params={}){
 const response=await publicHandler(new Request('https://reports.example/reports/public-state?nonce='+nonce,{headers:ORIGIN}),env);
 assert.equal(response.status,200);const state=await response.json();
 return 'https://reports.example'+path+'?'+new URLSearchParams({contract:'publication-v1',nonce,expectedEpoch:state.publication.epoch,expectedRevision:state.publication.revision,...params});
}
async function get(env,path,params={}){const r=await publicHandler(new Request(await publicUrl(env,path,params),{headers:ORIGIN}),env);return {status:r.status,body:await r.json()};}
const stats=(env,id='a',name='동명')=>get(env,'/reports/reporter-stats',{reporter:name,source:'history',reportId:id});
async function insert(db,id,name,species='참새',consent=1){await db.prepare("INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash,note,admin_note,bird_count) VALUES(?,'approved',?,?,?,35.123456,126.654321,'2026-10-02',?,'SECRET-IP',?,'SECRET-NOTE','SECRET-ADMIN',5)").bind(id,species,name,consent,'2026-10-'+String(id.charCodeAt(0)-96).padStart(2,'0')+'T00:00:00Z',id).run();}
let auth;
try {
 const {raw,db}=await fresh();auth=await installAuthStubs();
 const legacyEnv=environments(db);
 await check('canonical submit/approval seeds raw and canonical data without production dependencies',async()=>{
  const body=input(8401,{species:'동박새3 찌르레기2 까치5',observedOn:kstDateString(new Date()),reporter:'정본합성'});
  assert.equal((await post(legacyEnv.pub,body)).status,201);
  assert.equal((await adminPost(legacyEnv.admin,auth.token,body.request_id,{request_id:input(8402).request_id,expected_revision:1,action:'approve'})).status,200);
  assert.equal(await n(db,'SELECT COUNT(*) n FROM raw_submissions'),1);
  assert.equal(await n(db,'SELECT COUNT(*) n FROM sightings'),3);
 });
 for(const [id,name,species,consent] of [['a','동명','동박새3 까치5',1],['b','동 명','저어새2 동박새3',1],['c','동명','박새',1],['d','동명 ','찌르레기',1],['e','동명','참새',1],['z','비공개합성','고니',0]])await insert(db,id,name,species,consent);
 await db.prepare("UPDATE reports SET public_lat=35,public_lon=126 WHERE id='e'").run();
 const beforeData=await snapshot(db,false),beforeSchema=await schema(db),preMigrationRevision=await n(db,'SELECT revision n FROM public_publication_state');
 await check('preconditions: publication state, empty claim, all existing writer guards present',async()=>{
  assert.equal(await writerFenceReady(db),true);assert.equal(await n(db,'SELECT COUNT(*) n FROM publication_writer_claim'),0);
  assert.equal((await rows(db,"SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'writer_fence_%'")).length,WRITER_FENCE_GUARDS.length);
 });
 await check('default OFF works before migration; identity route disabled and ON fails closed',async()=>{
  assert.equal((await stats(pub(db,false))).body.reportCount,3);
  assert.equal((await stats(pub(db))).status,503);
  const response=await adminHandler(new Request('https://admin.example/admin/api/reporter-identities',{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),legacyEnv.admin);assert.equal(response.status,404);
 });
 await check('0007 creates exactly two tables/eight triggers and preserves every old definition/row/revision',async()=>{
  await apply(raw);const after=await schema(db),oldNames=new Set(beforeSchema.map(x=>x.name));
  assert.deepEqual(after.filter(x=>oldNames.has(x.name)),beforeSchema);
  const added=after.filter(x=>!oldNames.has(x.name));assert.equal(added.filter(x=>x.type==='table').length,2);
  assert.deepEqual(added.filter(x=>x.type==='trigger').map(x=>x.name).sort(),[...IDENTITY_GUARDS].sort());
  assert.equal(await snapshot(db,false),beforeData);assert.equal(await n(db,'SELECT revision n FROM public_publication_state'),preMigrationRevision);
  evidence.beforeMigrationHash=beforeData;evidence.afterMigrationHash=await snapshot(db,false);
 });
 await check('repeat application is rejected atomically; schema and data unchanged',async()=>{
  const before=await schema(db);await unchanged(db,()=>assert.rejects(()=>apply(raw),/already exists/));assert.deepEqual(await schema(db),before);
 });
 await check('migration interrupted inside batch rolls back all new DDL; clean retry works',async()=>{
  const isolated=await fresh(),before=await schema(isolated.db),ddl=splitDDL(migration).map(sql=>isolated.raw.prepare(sql));
  ddl.splice(5,0,isolated.raw.prepare('INSERT INTO missing_injected_table VALUES(1)'));
  await assert.rejects(()=>isolated.raw.batch(ddl));assert.deepEqual(await schema(isolated.db),before);await apply(isolated.raw);
 });
 await check('historical schema plus actual 0004b/0005/0006/0007 migration chain stays frozen until explicit local thaw',async()=>{
  const isolated=await fresh(false);
  for(const file of ['../p1-publication-security-implementation/results/server-audit/pre-publication-schema.sql','../long-term-db-phase2a/migrations/0001_core.sql','../long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql','../../reports-api/migrations/0004b_publication_writer_fence.sql','../../reports-api/migrations/0005_publication_security.sql','../../reports-api/migrations/0006_field_visibility.sql'])await isolated.raw.batch(splitDDL(readFileSync(new URL(file,import.meta.url),'utf8')).map(sql=>isolated.raw.prepare(sql)));
  const before=await snapshot(isolated.db);await apply(isolated.raw);
  assert.equal((await isolated.raw.prepare('SELECT write_frozen FROM public_publication_state').first()).write_frozen,1);
  assert.equal(await snapshot(isolated.db,false),before);
  await isolated.raw.prepare('UPDATE public_publication_state SET write_frozen=0,revision=revision+1').run();
  await insert(isolated.db,'a','합성');await insert(isolated.db,'b','합 성');await confirmation(isolated.db);
  assert.equal((await stats(pub(isolated.db),'a','합성')).body.reportCount,2);
 });
 await check('missing prerequisite schema cannot enable feature; migration itself is not a preflight validator',async()=>{
  const isolated=await fresh(false);await apply(isolated.raw);
  await assert.rejects(()=>confirmation(isolated.db));assert.equal(await n(isolated.db,'SELECT COUNT(*) n FROM reporter_identity_groups'),0);
  evidence.observations.push('0007 DDL can create deferred-reference triggers on an empty database. Required preflight must separately verify reports/publication state/writer guards; applying DDL alone does not prove readiness.');
 });
 await check('raw old-writer mutations and direct identity event insertion require a claim',async()=>{
  for(const sql of ["UPDATE reports SET reporter='tamper' WHERE id='a'","INSERT INTO reporter_identity_events(group_id,action,actor,reason,created_at) VALUES('missing','x','x','x','x')","INSERT INTO reporter_identity_groups VALUES('raw','[\"a\",\"b\"]','a',1,'x','x','x',NULL,NULL,NULL)"])await unchanged(db,()=>assert.rejects(()=>raw.prepare(sql).run(),/publication_writer_required/));
 });
 await check('ON requires publication contract; missing writer guard and orphan claim fail closed without automatic repair',async()=>{
  const contract=await publicHandler(new Request('https://reports.example/reports/public-state?nonce='+nonce,{headers:ORIGIN}),publicEnv(db,{REPORTS_CONFIRMED_IDENTITIES:'1'}));assert.equal(contract.status,503);
  const name=WRITER_FENCE_GUARDS[0],definition=await raw.prepare('SELECT sql FROM sqlite_schema WHERE name=?').bind(name).first();
  await raw.prepare('DROP TRIGGER '+name).run();await unchanged(db,()=>assert.rejects(()=>confirmation(db)));
  await raw.prepare(definition.sql).run();
  await raw.prepare('INSERT INTO publication_writer_claim(id,ok) VALUES(1,1)').run();
  await unchanged(db,()=>assert.rejects(()=>confirmation(db)));
  assert.equal((await publicHandler(new Request('https://reports.example/reports/public-state?nonce='+nonce,{headers:ORIGIN}),pub(db))).status,503);
  assert.equal(await n(db,'SELECT COUNT(*) n FROM publication_writer_claim'),1);
  await raw.prepare('DELETE FROM publication_writer_claim').run();
 });
 let group,second;
 const revision=()=>n(db,'SELECT revision n FROM public_publication_state');
 await check('authenticated ON confirmation links only selected IDs; original/canonical data unchanged; revision advances once',async()=>{
  const admin={...legacyEnv.admin,...flags};const before=await snapshot(db,false,false),rev=await revision();
  const response=await adminHandler(new Request('https://admin.example/admin/api/reporter-identities',{method:'POST',headers:{'Cf-Access-Jwt-Assertion':auth.token,'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',reportIds:['b','a'],confirmedSamePerson:true,reason:'Synthetic verification'})}),admin);
  assert.equal(response.status,200);group=(await response.json()).groupId;
  assert.equal(await snapshot(db,false,false),before);
  assert.equal(await revision(),rev+1);assert.equal(await n(db,'SELECT COUNT(*) n FROM publication_writer_claim'),0);
  const saved=await raw.prepare('SELECT * FROM reporter_identity_groups WHERE id=?').bind(group).first();assert.equal(saved.representative_id,'a');assert.deepEqual(JSON.parse(saved.report_ids),['b','a']);
  assert.equal(await n(db,'SELECT COUNT(*) n FROM reporter_identity_events'),1);
  // Publication revision is the only pre-existing row allowed to change.
  evidence.identityConfirmationOriginalDataHash=hash(await rows(db,'SELECT * FROM reports ORDER BY id'));
  assert.equal((await stats(pub(db))).body.reportCount,2);assert.equal((await stats(pub(db))).body.speciesCount,3);
  second=(await confirmation(db,['c','d'])).groupId;
 });
 const adminCall=async(params,token=auth.token)=>{const r=await adminHandler(new Request('https://admin.example/admin/api/stats?'+new URLSearchParams(params),{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}}),{...legacyEnv.admin,...flags});return {status:r.status,body:await r.json(),cache:r.headers.get('Cache-Control')};};
 let groupRow;
 await check('admin same-name groups drill down independently; forged/ambiguous keys rejected; authenticated only',async()=>{
  const listing=await adminCall({view:'reporters'});assert.equal(listing.status,200);assert.equal(listing.cache,'no-store');
  assert.equal(listing.body.rows.filter(x=>x.reporter==='동명').length,3);
  for(const [key,ids] of [['group:'+group,['a','b']],['group:'+second,['c','d']],['name:동명',['e']]]){
   const row=listing.body.rows.find(x=>x.reporter_key===key);if(key==='group:'+group)groupRow=row;
   const detail=await adminCall({view:'list',reporter:row.reporter,reporterKey:key});assert.equal(detail.status,200);assert.deepEqual(detail.body.rows.map(x=>x.id).sort(),ids);
   for(const secret of ['35.123456','126.654321','SECRET','ip_hash','dedupe_hash','admin_note','@example'])assert.ok(!JSON.stringify(detail.body).includes(secret),secret);
  }
  assert.equal((await adminCall({view:'list',reporter:'동명'})).status,400);
  assert.equal((await adminCall({view:'list',reporter:'위조',reporterKey:'group:'+group})).status,404);
  assert.ok([401,403].includes((await adminCall({view:'reporters'},null)).status));
 });
 await check('new same-name submission never auto-joins confirmed IDs; ambiguous public name fails closed',async()=>{
  await insert(db,'f','동명');const detail=await adminCall({view:'list',reporter:groupRow.reporter,reporterKey:groupRow.reporter_key});assert.deepEqual(detail.body.rows.map(x=>x.id).sort(),['a','b']);
  assert.equal((await stats(pub(db),'f')).body.reportCount,2); // Original exact-name aggregation of unlinked e/f.
  assert.equal((await get(pub(db),'/reports/reporter-stats',{reporter:'동명',source:'all'})).status,404);
 });
 await check('actual new canonical same-name POST and approval remain outside confirmed group',async()=>{
  const body=input(8411,{species:'참새',observedOn:kstDateString(new Date()),reporter:'동 명'});
  assert.equal((await post({...legacyEnv.pub,...flags},body)).status,201);
  assert.equal((await adminPost({...legacyEnv.admin,...flags},auth.token,body.request_id,{request_id:input(8412).request_id,expected_revision:1,action:'approve'})).status,200);
  const detail=await adminCall({view:'list',reporter:groupRow.reporter,reporterKey:groupRow.reporter_key});assert.deepEqual(detail.body.rows.map(x=>x.id).sort(),['a','b']);
  assert.equal((await stats(pub(db),body.request_id,'동 명')).body.reportCount,1);
 });
 await check('invalid/missing/duplicate/anonymous/overlapping IDs fail with no partial group/event/revision/claim',async()=>{
  await insert(db,'g','  ');
  for(const ids of [['a','missing'],['a','a'],['e','g'],['b','e']])await unchanged(db,()=>assert.rejects(()=>confirmation(db,ids)));
  await unchanged(db,()=>assert.rejects(()=>confirmedIdentityAction(db,{action:'confirm',reportIds:['e','f'],reason:'no confirmation'},'local-admin')));
 });
 await check('protected species, exact location, private nickname and audit evidence absent from public DTOs',async()=>{
  const species=await get(pub(db),'/reports/reporter-species',{reporter:'동명',source:'history',reportId:'a'});assert.equal(species.status,200);assert.equal(species.body.restricted,true);assert.ok(!JSON.stringify(species.body).includes('저어새'));
  const statsResult=await stats(pub(db));assert.deepEqual(Object.keys(statsResult.body).sort(),['publication','reportCount','serverTime','speciesCount']);
  for(const result of [species,statsResult,await get(pub(db),'/contributors/all'),await get(pub(db),'/contributors/monthly',{month:'2026-10'})])for(const secret of ['비공개합성','35.123456','126.654321','SECRET','Synthetic verification','local-admin','report_ids',group])assert.ok(!JSON.stringify(result.body).includes(secret),secret);
  const map=await get(pub(db),'/reports/approved');assert.ok(!map.body.spots.some(x=>x.id==='b'));assert.ok(!JSON.stringify(map.body).includes('저어새'));
  const hidden=map.body.spots.find(x=>x.id==='e');assert.ok(hidden);assert.equal(hidden.locationHidden,true);assert.equal(hidden.lat,35);assert.equal(hidden.lon,126);assert.ok(!JSON.stringify(map.body).includes('비공개합성'));
 });
 await check('nonrepresentative consent withdrawal excludes only that row and invalidates old revision',async()=>{
  const old=await publicUrl(pub(db),'/reports/reporter-stats',{reporter:'동명',source:'history',reportId:'a'});
  await db.prepare("UPDATE reports SET name_public=0 WHERE id='b'").run();assert.equal((await stats(pub(db))).body.reportCount,1);
  assert.equal((await stats(pub(db),'b','동 명')).status,404);assert.equal((await publicHandler(new Request(old,{headers:ORIGIN}),pub(db))).status,409);
  await db.prepare("UPDATE reports SET name_public=1 WHERE id='b'").run();assert.equal((await stats(pub(db))).body.reportCount,2);
 });
 const unaffected=async()=>{
  const data={};for(const {name} of await rows(db,"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'reporter_identity_%' AND name NOT IN ('reports','public_publication_state') ORDER BY name"))data[name]=await rows(db,`SELECT * FROM "${name}" ORDER BY 1`);return hash(data);
 };
 const beforeRecoveryCanonical=await unaffected(),expectedReports=(await rows(db,'SELECT * FROM reports ORDER BY id')).filter(row=>row.id!=='a');
 await check('consent withdrawal, approval cancellation, deletion advance revision and reject old responses',async()=>{
  for(const sql of ["UPDATE reports SET name_public=0 WHERE id='a'","UPDATE reports SET name_public=1,status='pending' WHERE id='a'","DELETE FROM reports WHERE id='a'"]){
   const old=await publicUrl(pub(db),'/reports/reporter-stats',{reporter:'동명',source:'history',reportId:'a'}),rev=await revision();await db.prepare(sql).run();assert.equal(await revision(),rev+1);
   assert.equal((await publicHandler(new Request(old,{headers:ORIGIN}),pub(db))).status,409);assert.equal((await stats(pub(db))).status,404);
   assert.equal((await stats(pub(db),'b','동 명')).body.reportCount,2); // Unlinked b plus actual subsequent same-name submission.
   const contributors=await get(pub(db),'/contributors/all');
   // With representative unavailable, b must use its original nickname, never group's first nickname.
   assert.ok(contributors.body.contributors.some(x=>x.name==='동 명'&&x.count===2));
  }
 });
 await check('freeze rejects confirm/revoke; thaw restores service; no claim left behind',async()=>{
  await db.prepare('UPDATE public_publication_state SET write_frozen=1,revision=revision+1').run();
  await unchanged(db,()=>assert.rejects(()=>confirmation(db,['e','f'])));await unchanged(db,()=>assert.rejects(()=>revoke(db,group)));
  assert.equal((await stats(pub(db),'b','동 명')).status,200); // Write freeze retains valid public reads.
  await raw.prepare('UPDATE public_publication_state SET write_frozen=0,revision=revision+1').run();assert.equal(await n(db,'SELECT COUNT(*) n FROM publication_writer_claim'),0); // Explicit local operator thaw.
 });
 await check('late transaction fault rolls back group/event/revision and claim; retry succeeds',async()=>{
  const fault={prepare:sql=>raw.prepare(sql),batch:list=>raw.batch([...list.slice(0,-1),raw.prepare("INSERT INTO transaction_assertions(assertion_id,ok) VALUES('injected',0)"),list.at(-1)])};
  await unchanged(db,()=>assert.rejects(()=>confirmation(strictWriterDb(fault,true),['e','f'])));
  const result=await confirmation(db,['e','f']);assert.ok(result.groupId);
  await unchanged(db,()=>assert.rejects(()=>revoke(strictWriterDb(fault,true),result.groupId)));
 });
 await check('OFF restores exact original-name aggregation; revoke invalidates old revision and keeps audit history',async()=>{
  assert.equal((await stats(pub(db,false),'b','동 명')).body.reportCount,2);
  const old=await publicUrl(pub(db),'/reports/reporter-stats',{reporter:'동명',source:'history',reportId:'c'}),rev=await revision();await revoke(db,second);assert.equal(await revision(),rev+1);
  assert.equal((await publicHandler(new Request(old,{headers:ORIGIN}),pub(db))).status,409);
  assert.equal((await stats(pub(db),'c')).body.reportCount,1);
  assert.equal((await adminCall({view:'list',reporter:'동명',reporterKey:'group:'+second})).status,404);
  await unchanged(db,()=>revoke(db,second)); // Repeated revoke does not duplicate history/revision.
  const history=await adminHandler(new Request('https://admin.example/admin/api/reporter-identities',{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),{...legacyEnv.admin,...flags});assert.equal(history.status,200);const body=await history.json();assert.ok(body.events.some(x=>x.action==='revoked'));
  for(const sql of ['DELETE FROM reporter_identity_groups','UPDATE reporter_identity_events SET reason=\'tamper\'','DELETE FROM reporter_identity_events',`UPDATE reporter_identity_groups SET active=1 WHERE id='${second}'`])await unchanged(db,()=>assert.rejects(()=>db.prepare(sql).run(),/identity_immutable/));
 });
 await check('each missing identity trigger fails closed on primary read; restore recovers; existing guards unchanged',async()=>{
  for(const name of IDENTITY_GUARDS){const definition=await raw.prepare("SELECT sql FROM sqlite_schema WHERE name=?").bind(name).first();await raw.prepare('DROP TRIGGER '+name).run();assert.equal((await stats(pub(db),'b','동 명')).status,503);await raw.prepare(definition.sql).run();assert.equal((await stats(pub(db),'b','동 명')).status,200);}
  const oldNames=new Set(beforeSchema.map(x=>x.name));assert.deepEqual((await schema(db)).filter(x=>oldNames.has(x.name)),beforeSchema);
  assert.deepEqual(await rows(raw,'PRAGMA foreign_key_check'),[]);assert.equal(await n(db,'SELECT COUNT(*) n FROM publication_writer_claim'),0);
 });
 await check('recovery preserves every unrelated canonical/raw row and all surviving report values exactly',async()=>{
  assert.equal(await unaffected(),beforeRecoveryCanonical);assert.deepEqual(await rows(db,'SELECT * FROM reports ORDER BY id'),expectedReports);
  evidence.beforeRecoveryCanonicalHash=beforeRecoveryCanonical;evidence.afterRecoveryCanonicalHash=await unaffected();evidence.survivingReportsHash=hash(expectedReports);
 });
 evidence.status='PASS';
}catch(error){evidence.status='FAIL';evidence.error=String(error.stack||error);console.error(evidence.error);process.exitCode=1;}
finally {if(auth)auth.restore();for(const mf of instances)await mf.dispose();evidence.finishedAt=new Date().toISOString();mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');}
