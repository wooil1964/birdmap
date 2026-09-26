import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localDb,installAuthStubs,environments,input,post,adminPost,failingBinding,uuid,ADMIN,ORIGIN } from './helpers.mjs';
import { rows,first,insert,fingerprint,stable,canonicalProjection,canonicalReadDb,applicationDb,TRANSFORM_VERSION,initialSighting } from '../src/canonical/data.js';
import { schemaReady } from '../src/canonical/control.js';
import { compareShadow,shadowRead } from '../src/canonical/shadow.js';
import { purgeForbidden } from '../src/canonical/purge.js';
import { handleRequest as publicHandler,handleLegacyRequest } from '../src/public.js';
import { handleRequest as adminHandler } from '../src/admin.js';
import { prepareBackfill,verifyBackfill,applyBackfillLocally } from '../tools/backfill-lib.mjs';
import { prepareSiteSeed,seedSitesLocally } from '../tools/sites-seed.mjs';
import { baseline } from '../../docs/long-term-db-phase2a/proof/fixture.mjs';

const toolchain=process.argv[2];if(!toolchain)throw Error('Pass the installed node_modules toolchain directory');
const out=new URL('../../docs/long-term-db-phase2b/.local/',import.meta.url);mkdirSync(out,{recursive:true});
const evidence={started_at:new Date().toISOString(),scope:'local D1 only; synthetic observations; production calls 0',tests:[]};
const check=async(name,fn)=>{await fn();evidence.tests.push({name,result:'PASS'});console.log('PASS '+name);};
let local,auth;
try {
  local=await localDb(toolchain);const db=local.db;auth=await installAuthStubs();const env=environments(db);
  const snapshot=async()=>fingerprint(await Promise.all(['reports','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions'].map(t=>rows(db,`SELECT * FROM ${t} ORDER BY 1`))));
  const unchanged=async fn=>{const before=await snapshot();await fn();assert.equal(await snapshot(),before);};
  const requireError=async(response,code)=>{assert(response.status>=400);const b=await response.json();if(code)assert.equal(b.error.code,code);};
  const currentRevision=async id=>(await first(db,'SELECT revision FROM checklists WHERE checklist_id=?',id)).revision;
  const projectionEqual=async id=>assert.deepEqual(await first(db,canonicalProjection+' AND checklist_id=?',id),await first(db,'SELECT * FROM reports WHERE id=?',id));
  let sitePlan,backfillPlan;
  await check('schema contract matches exact Phase 2A tables/indexes/triggers',async()=>assert.equal(await schemaReady(db),true));
  await check('sites seed preserves 190 IDs and exact registry coordinates',async()=>{
    sitePlan=await prepareSiteSeed(readFileSync(new URL('../../index.html',import.meta.url),'utf8'),{capturedAt:evidence.started_at});
    assert.equal(sitePlan.source_count,190);assert.equal(new Set(sitePlan.sites.map(s=>s.site_id)).size,190);
    assert.equal((await seedSitesLocally(db,sitePlan,{scope:'local-test'})).added,190);
    assert.equal((await seedSitesLocally(db,sitePlan,{scope:'local-test'})).added,0);
    assert.deepEqual(await rows(db,'SELECT site_id,lat,lon FROM sites ORDER BY site_id'),sitePlan.sites.map(({site_id,lat,lon})=>({site_id,lat,lon})).sort((a,b)=>a.site_id.localeCompare(b.site_id)));
  });
  await check('backfill dry-run/preparation preserves known 21-row semantics, no fabricated history',async()=>{
    await db.batch(baseline.map(r=>insert(db,'reports',r)));
    const payload={reports:baseline,manifest_sha256:await fingerprint({reports:baseline}),source_count:21,transform_version:TRANSFORM_VERSION,registry_revision:sitePlan.registry_revision,captured_at:evidence.started_at,run_id:'phase2b-synthetic21'};
    backfillPlan=await prepareBackfill(payload);
    assert.equal((await verifyBackfill(db,backfillPlan,{allowEmpty:true})).state,'ready');
    const file=new URL('synthetic-snapshot.json',out);writeFileSync(file,JSON.stringify(payload));
    for(const mode of ['--dry-run','--prepare-apply']) {
      const p=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/prepare-backfill.mjs',import.meta.url)),mode,fileURLToPath(file)],{encoding:'utf8'});
      assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).apply_enabled,false);
    }
    assert.equal((await applyBackfillLocally(db,backfillPlan,{scope:'local-test',writeFrozen:true})).added,21);
    const result=await first(db,"SELECT COUNT(*) total,SUM(status='approved') approved,SUM(status='rejected') rejected,SUM(site_id IS NULL) site_null,SUM(shared_bird_count=1) count_one,SUM(shared_bird_count IS NULL) count_null FROM checklists");
    assert.deepEqual(result,{total:21,approved:17,rejected:4,site_null:5,count_one:13,count_null:8});
    assert.equal((await first(db,"SELECT COUNT(*) n FROM sightings WHERE count_accuracy='unknown'")).n,21);
    assert.equal((await first(db,'SELECT COUNT(*) n FROM reviews')).n,0);assert.equal((await first(db,'SELECT COUNT(*) n FROM audit_log')).n,0);
    assert.equal((await verifyBackfill(db,backfillPlan)).state,'verified');
    assert.equal((await applyBackfillLocally(db,backfillPlan,{scope:'local-test',writeFrozen:true})).added,0);
    evidence.synthetic21=result;
  });
  await check('backfill changed manifest and partial state are explicit errors',async()=>{
    await unchanged(()=>assert.rejects(()=>prepareBackfill({...backfillPlan,reports:baseline.map((r,i)=>i?r:{...r,species:'다른문자열'})})));
    await unchanged(()=>assert.rejects(()=>verifyBackfill(db,{...backfillPlan,manifest_sha256:'0'.repeat(64)})));
    const old=await first(db,'SELECT updated_at FROM checklists WHERE checklist_id=?',baseline[0].id);
    await db.prepare('UPDATE checklists SET updated_at=? WHERE checklist_id=?').bind('synthetic-drift',baseline[0].id).run();
    await assert.rejects(()=>verifyBackfill(db,backfillPlan));
    await db.prepare('UPDATE checklists SET updated_at=? WHERE checklist_id=?').bind(old.updated_at,baseline[0].id).run();
  });
  await check('backfill rejects invalid dates and mismatched/incomplete registry without correction',async()=>{
    for(const patch of [{observed_on:'2026-02-30'},{received_at:'nonsense'},{decided_at:'2026-09-20T25:00:00Z'}]) {
      const reports=baseline.map((r,i)=>i?r:{...r,...patch});
      const checksum=await fingerprint({reports});
      await unchanged(()=>assert.rejects(()=>prepareBackfill({...backfillPlan,reports,manifest_sha256:checksum}),{code:'SOURCE_DATE_INVALID'}));
    }
    await unchanged(()=>assert.rejects(()=>verifyBackfill(db,{...backfillPlan,registry_revision:'wrong'})));
    const site=sitePlan.sites.find(s=>s.site_id==='190')||sitePlan.sites.at(-1);
    await db.prepare('UPDATE sites SET registry_revision=? WHERE site_id=?').bind('wrong',site.site_id).run();
    await assert.rejects(()=>verifyBackfill(db,backfillPlan));
    await db.prepare('UPDATE sites SET registry_revision=? WHERE site_id=?').bind(sitePlan.registry_revision,site.site_id).run();
    const omitSite={prepare(sql){if(sql==='SELECT * FROM sites ORDER BY site_id')return {bind(){return this;},all:async()=>({results:sitePlan.sites.slice(1)})};return db.prepare(sql);}};
    await assert.rejects(()=>verifyBackfill(omitSite,backfillPlan),{code:'REGISTRY_DRIFT'});
  });
  await check('confirmation missing/false/wrong type and missing coordinates cause zero writes',async()=>{
    for(const flag of [undefined,false,null,0,1,'true'])await unchanged(async()=>requireError(await post(env.pub,input(100,{non_breeding_confirmed:flag})),'NON_BREEDING_CONFIRMATION_REQUIRED'));
    for(const lat of [undefined,null,'',NaN])await unchanged(async()=>requireError(await post(env.pub,input(100,{lat}))));
  });
  await check('quick POST creates reports/raw/checklist/sighting atomically; NULL/0/1 distinct',async()=>{
    for(const [n,count] of [[101,null],[102,0],[103,1]]) {
      const response=await post(env.pub,input(n,{birdCount:count}));assert.equal(response.status,201);
      await projectionEqual(uuid(n));
      const s=await first(db,'SELECT count_value,count_accuracy FROM sightings WHERE checklist_id=?',uuid(n));assert.deepEqual(s,{count_value:count,count_accuracy:'unknown'});
    }
    const raw=await first(db,'SELECT * FROM raw_submissions WHERE request_id=?',uuid(103));assert.equal(raw.non_breeding_confirmed,1);assert(!raw.payload_json.includes('synthetic-token'));
  });
  await check('quick same request replays original accepted response; changed payload conflicts',async()=>{
    const body=input(104);const a=await(await post(env.pub,body)).json();const before=await snapshot();
    const b=await(await post(env.pub,{...body,turnstileToken:'replacement-token'})).json();assert.deepEqual(a,b);assert.equal(await snapshot(),before);
    await unchanged(async()=>requireError(await post(env.pub,{...body,note:'다른합성메모'}),'IDEMPOTENCY_CONFLICT'));
  });
  await check('concurrent successful submit is replayed after single-use CAPTCHA failure',async()=>{
    const oldFetch=globalThis.fetch,body=input(125);let first=true;
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('turnstile')&&first){first=false;assert.equal((await post(env.pub,body)).status,201);return Response.json({success:false,'error-codes':['timeout-or-duplicate']});}
      return oldFetch(url,options);
    };
    try{assert.equal((await post(env.pub,body)).status,201);assert.equal((await firstRowCount()).n,1);}finally{globalThis.fetch=oldFetch;}
    async function firstRowCount(){return (await rows(db,'SELECT COUNT(*) n FROM raw_submissions WHERE request_id=?',body.request_id))[0];}
  });
  await check('quick batch middle/late failures roll back every table',async()=>{
    for(const index of [3,5])await unchanged(async()=>requireError(await post({...env.pub,REPORTS_DB:failingBinding(db,index)},input(105+index))));
  });
  await check('multiple species shared count is preserved without allocation',async()=>{
    assert.equal((await post(env.pub,input(110,{species:'합성갑 · 합성을',birdCount:7}))).status,201);
    const s=await first(db,'SELECT count_value,count_accuracy,interpretation FROM sightings WHERE checklist_id=?',uuid(110));assert.deepEqual(s,{count_value:null,count_accuracy:'unknown',interpretation:'unparsed_multiple'});
    assert.equal((await first(db,'SELECT shared_bird_count FROM checklists WHERE checklist_id=?',uuid(110))).shared_bird_count,7);
  });
  const target=uuid(120);assert.equal((await post(env.pub,input(120))).status,201);
  const actions=[['approve',{species:'검토합성종',siteId:'1',publicLat:null,namePublic:false}],['reject',{}],['unpublish',{}],['visibility',{public:true}],['site',{siteId:'2'}],['consent',{namePublic:true}],['link',{spotKey:target}],['unlink',{}]];
  let actionNo=200;
  for(const [action,extra] of actions)await check('admin '+action+' preserves legacy meaning and canonical projection',async()=>{
    const id=uuid(103),before=await first(db,'SELECT * FROM reports WHERE id=?',id);
    const body={request_id:uuid(actionNo++),expected_revision:await currentRevision(id),action,adminNote:'합성검토메모',...extra};
    const response=await adminPost(env.admin,auth.token,id,body);assert.equal(response.status,200);const result=await response.json();assert.equal(result.ok,true);
    await projectionEqual(id);const after=await first(db,'SELECT * FROM reports WHERE id=?',id);
    for(const k of ['bird_count','reporter','note','received_at','ip_hash','dedupe_hash'])assert.equal(after[k],before[k]);
    if(['reject','unpublish'].includes(action))assert.equal(after.pending_public,0);
    if(['approve','link'].includes(action))assert.equal(after.pending_public,before.pending_public);
    if(action==='visibility')assert.equal(after.status,'pending');
    const saved=await snapshot();const replay=await adminPost(env.admin,auth.token,id,body);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),result);assert.equal(await snapshot(),saved);
  });
  await check('quick replay respects reject, unpublish and pending visibility withdrawal',async()=>{
    for(const [n,action,extra] of [[130,'reject',{}],[131,'unpublish',{}],[132,'visibility',{public:false}]]) {
      const body=input(n);assert((await(await post(env.pub,body)).json()).spot);
      assert.equal((await adminPost(env.admin,auth.token,uuid(n),{request_id:uuid(n+1000),expected_revision:1,action,...extra})).status,200);
      await unchanged(async()=>{const response=await post(env.pub,body);assert.equal(response.status,201);const receipt=await response.json();assert.equal(receipt.spot,undefined);assert.equal(receipt.status,action==='reject'?'rejected':'pending');assert.notEqual(receipt.publicVisibility,'approximate');});
    }
  });
  await check('admin listing reads editable values and revisions in one snapshot without parameter expansion',async()=>{
    let calls=0;
    const reportList=Array.from({length:190},(_,i)=>({id:uuid(i+2000),revision:3}));
    const binding={prepare(sql){if(sql.includes('sqlite_schema'))return {bind(){return this;},first:async()=>({name:'checklists'})};assert(sql.includes('reports.*,(SELECT revision FROM checklists WHERE checklist_id=reports.id) AS revision'));calls++;return {all:async()=>({results:reportList})};}};
    const response=await adminHandler(new Request('https://admin.example/admin/api/reports?status=all',{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),{...env.admin,REPORTS_DB:binding});
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.reports.length,190);assert(result.reports.every(r=>r.revision===3));assert.equal(calls,1);
  });
  await check('CAS stale revision and injected admin failure roll back all state',async()=>{
    const id=uuid(103),rev=await currentRevision(id);
    await unchanged(async()=>requireError(await adminPost(env.admin,auth.token,id,{request_id:uuid(300),expected_revision:rev-1,action:'reject'}),'REVISION_CONFLICT'));
    await unchanged(async()=>requireError(await adminPost({...env.admin,REPORTS_DB:failingBinding(db,5)},auth.token,id,{request_id:uuid(301),expected_revision:rev,action:'reject'})));
    assert.equal((await first(db,'SELECT COUNT(*) n FROM transaction_assertions')).n,0);
  });
  await check('admin request conflict covers changed payload, action and target',async()=>{
    const request_id=uuid(310),id=uuid(103),expected_revision=await currentRevision(id);
    const payload={request_id,expected_revision,action:'consent',namePublic:false};assert.equal((await adminPost(env.admin,auth.token,id,payload)).status,200);
    for(const change of [{namePublic:true},{action:'reject'}])await unchanged(async()=>requireError(await adminPost(env.admin,auth.token,id,{...payload,...change}),'IDEMPOTENCY_CONFLICT'));
    await unchanged(async()=>requireError(await adminPost(env.admin,auth.token,uuid(102),payload),'IDEMPOTENCY_CONFLICT'));
  });
  await check('one admin request reviews multiple sightings, sequence and event identity',async()=>{
    const id=uuid(120),s=await first(db,'SELECT * FROM sightings WHERE checklist_id=?',id);
    await insert(db,'sightings',{...s,sighting_id:'second:'+id,source_ordinal:2,species_original:'합성둘째종',count_value:null,count_source:'not_recorded'}).run();
    const body={request_id:uuid(320),expected_revision:await currentRevision(id),action:'approve',sightingReviews:[{sighting_id:s.sighting_id,count_value:0,count_accuracy:'exact'},{sighting_id:'second:'+id,count_value:1,count_accuracy:'unknown'}]};
    const response=await adminPost(env.admin,auth.token,id,body);assert.equal(response.status,200);const success=await response.json();
    const events=await rows(db,'SELECT * FROM reviews WHERE request_id=? ORDER BY event_index',body.request_id);assert.equal(events.length,3);assert.deepEqual(events.map(e=>e.event_index),[0,1,2]);assert.deepEqual(events.map(e=>e.sequence),[1,2,3]);
    assert.deepEqual(await(await adminPost(env.admin,auth.token,id,body)).json(),success);
    await unchanged(async()=>requireError(await adminPost(env.admin,auth.token,id,{...body,sightingReviews:[{...body.sightingReviews[0],count_value:4},body.sightingReviews[1]]}),'IDEMPOTENCY_CONFLICT'));
    await unchanged(()=>assert.rejects(()=>insert(db,'reviews',{...events[1],review_id:'collision',sequence:99}).run()));
    await unchanged(()=>assert.rejects(()=>insert(db,'reviews',{...events[1],review_id:'wrong-parent',sequence:99,request_id:uuid(321),sighting_id:`sighting:${uuid(101)}:1`}).run()));
  });
  await check('append-only SQL updates and ordinary application deletes rejected',async()=>{
    await unchanged(()=>assert.rejects(()=>db.prepare("UPDATE reviews SET reason_code='changed'").run()));
    await unchanged(()=>assert.rejects(()=>db.prepare("UPDATE audit_log SET action='changed'").run()));
    for(const table of ['reviews','audit_log','raw_submissions','reports'])assert.throws(()=>applicationDb(db).prepare('DELETE FROM '+table));
  });
  await check('invalid site FK fails without changing either projection',async()=>{
    await unchanged(async()=>requireError(await adminPost(env.admin,auth.token,uuid(103),{request_id:uuid(330),expected_revision:await currentRevision(uuid(103)),action:'site',siteId:'unknown'}),'SITE_ID_UNKNOWN'));
  });
  await check('canonical GET DTO equals legacy for approved/pending/site/status/pagination',async()=>{
    const paths=['/reports/approved','/reports/pending','/reports/site/1','/reports/site/1?limit=2&offset=1','/reports/site/1?offset=999',`/reports/${uuid(103)}/status`,`/reports/${uuid(999)}/status`];
    for(const path of paths){const req=()=>new Request('https://reports.example'+path,{headers:{Origin:ORIGIN}});const a=await publicHandler(req(),env.pub),b=await handleLegacyRequest(req(),{...env.pub,REPORTS_DB:canonicalReadDb(db)});assert.equal(a.status,b.status);assert.deepEqual([...a.headers],[...b.headers]);const x=await a.json(),y=await b.json();delete x.generatedAt;delete y.generatedAt;assert.deepEqual(x,y);}
  });
  await check('shadow comparison reports categories only; legacy response remains authoritative',async()=>{
    assert(compareShadow({spots:[{lat:1,species:['a']}]},{spots:[{lat:2,species:['b']}]}).includes('lat'));
    const req=new Request('https://reports.example/reports/approved',{headers:{Origin:ORIGIN}}),logs=[];
    const a=await publicHandler(req,env.pub);assert.deepEqual(await shadowRead(req,env.pub,a,handleLegacyRequest,e=>logs.push(e)),[]);assert.deepEqual(logs,[]);
    const altered=await publicHandler(req,env.pub);await shadowRead(req,env.pub,altered,async()=>Response.json({secret:'should-never-log'}),e=>logs.push(e));
    assert(logs.length>0);assert(!JSON.stringify(logs).includes('should-never-log'));assert(!JSON.stringify(logs).includes('10000000'));
    assert.equal((await publicHandler(req,{...env.pub,REPORTS_SHADOW_READ:'true'})).status,200);
  });
  await check('maintenance blocks both mutations with Retry-After and keeps GET/admin list',async()=>{
    for(const e of [env.pub,env.admin])e.REPORTS_WRITE_MODE='READ_ONLY_MAINTENANCE';
    await unchanged(async()=>{const r=await post(env.pub,input(400));assert.equal(r.status,503);assert.equal(r.headers.get('Retry-After'),'60');});
    await unchanged(async()=>assert.equal((await adminPost(env.admin,auth.token,uuid(103),{action:'reject'})).status,503));
    assert.equal((await publicHandler(new Request('https://reports.example/reports/approved',{headers:{Origin:ORIGIN}}),env.pub)).status,200);
    assert.equal((await adminHandler(new Request('https://admin.example/admin/api/reports',{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),env.admin)).status,200);
    for(const e of [env.pub,env.admin])e.REPORTS_WRITE_MODE='CANONICAL_DUAL_WRITE';
  });
  await check('mixed-version/mode/unready peer fail closed without legacy fallback',async()=>{
    const previous=env.admin.REPORTS_WRITE_MODE;env.admin.REPORTS_WRITE_MODE='NORMAL';await unchanged(async()=>requireError(await post(env.pub,input(401)),'ROLLOUT_NOT_READY'));env.admin.REPORTS_WRITE_MODE=previous;
    await unchanged(async()=>requireError(await post({...env.pub,REPORTS_PEER_RELEASE_ID:'old'},input(401)),'ROLLOUT_NOT_READY'));
    await unchanged(async()=>requireError(await post({...env.pub,ENVIRONMENT:'production'},input(401)),'ROLLOUT_NOT_READY'));
  });
  await check('purge privilege, dependencies, atomic failure and data-free tombstone',async()=>{
    const body=input(410,{note:'SYNTHETIC_FORBIDDEN_DETAIL'});assert.equal((await post(env.pub,body)).status,201);
    assert.equal((await adminPost(env.admin,auth.token,uuid(410),{request_id:uuid(411),expected_revision:1,action:'approve',adminNote:'SYNTHETIC_FORBIDDEN_DETAIL'})).status,200);
    const req={id:uuid(410),request_id:uuid(412),expected_revision:2,confirmation:'PURGE_FORBIDDEN_CONTENT',reason_code:'forbidden_breeding_content'};
    await unchanged(()=>assert.rejects(()=>purgeForbidden(env.admin,{email:ADMIN},req)));
    for(const e of [env.pub,env.admin])e.REPORTS_WRITE_MODE='READ_ONLY_MAINTENANCE';
    const purgeEnv={...env.admin,REPORTS_PURGE_ENABLED:'true',REPORTS_PURGE_ADMINS:ADMIN};
    await unchanged(()=>assert.rejects(()=>purgeForbidden(purgeEnv,{email:'not-admin@example.test'},req)));
    await unchanged(()=>assert.rejects(()=>purgeForbidden({...purgeEnv,REPORTS_DB:failingBinding(db,8)},{email:ADMIN},req)));
    await db.prepare('UPDATE reports SET spot_key=? WHERE id=?').bind(uuid(410),uuid(101)).run();
    await assert.rejects(()=>purgeForbidden(purgeEnv,{email:ADMIN},req));
    await db.prepare('UPDATE reports SET spot_key=NULL WHERE id=?').bind(uuid(101)).run();
    assert.equal((await purgeForbidden(purgeEnv,{email:ADMIN},req)).purged,true);
    for(const [table,key] of [['reports','id'],['raw_submissions','source_id'],['checklists','checklist_id'],['sightings','checklist_id'],['reviews','checklist_id']])assert.equal((await first(db,`SELECT COUNT(*) n FROM ${table} WHERE ${key}=?`,req.id)).n,0);
    const audit=await rows(db,'SELECT * FROM audit_log WHERE target_id=?',req.id);assert.equal(audit.length,1);assert.equal(audit[0].action,'forbidden_content_purged');assert.equal(audit[0].request_fingerprint,null);assert.equal(audit[0].event_count,0);assert(!stable(audit).includes('SYNTHETIC_FORBIDDEN_DETAIL'));
    assert.equal((await purgeForbidden(purgeEnv,{email:ADMIN},req)).purged,true);
    for(const e of [env.pub,env.admin])e.REPORTS_WRITE_MODE='CANONICAL_DUAL_WRITE';
    await unchanged(async()=>requireError(await post(env.pub,body),'REPORT_PURGED'));
  });
  await check('legacy 21 source rows unchanged and final FK/assertion checks clean',async()=>{
    const current=await rows(db,'SELECT * FROM reports WHERE id IN ('+baseline.map(()=>'?').join(',')+') ORDER BY id',...baseline.map(r=>r.id));assert.deepEqual(current,baseline);
    assert.deepEqual(await rows(db,'PRAGMA foreign_key_check'),[]);assert.equal((await first(db,'SELECT COUNT(*) n FROM transaction_assertions')).n,0);
  });
  evidence.status='PASS';
}catch(error){evidence.status='FAIL';evidence.error=String(error?.stack||error);console.error(evidence.error);process.exitCode=1;}
finally {if(auth)auth.restore();if(local)await local.close();evidence.finished_at=new Date().toISOString();writeFileSync(new URL('phase2b-local-results.json',out),JSON.stringify(evidence,null,2)+'\n');console.log('Local evidence saved');}
