import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,DB_NAME,assertRemoteIdentity,queryRead,wrangler} from './staging-control.mjs';
import {stable} from '../../../reports-api/src/canonical/data.js';
import {success,http} from './remote-client.mjs';
import {dual,maintenance,setBoth,auth} from './rollout-lib.mjs';
const file=join(LOCAL,'cutover-rehearsal.json');if(existsSync(file))throw Error('INSPECT_EXISTING_RESULTS');
await assertRemoteIdentity();const result={status:'RUNNING',at:new Date().toISOString(),scope:'existing staging schema; prior applied schema/seed/backfill verified, never overwritten; external test wrapper freeze; synthetic observations only',steps:[]};
const save=()=>writeFileSync(file,JSON.stringify(result,null,2)+'\n');
async function step(n,name,fn){result.in_progress=n;save();try{const evidence=await fn();result.steps.push({n,name,result:'PASS',evidence});console.log('PASS cutover '+n+' '+name);}catch(e){result.status='FAIL';result.steps.push({n,name,result:'FAIL',error:e.message});throw e;}finally{save();}}
const frozen={public:{PHASE2C_EXTERNAL_FREEZE:'true'},admin:{PHASE2C_EXTERNAL_FREEZE:'true'}};
const id='10000000-0000-4000-8000-000000010060',body={request_id:id,non_breeding_confirmed:true,species:'합성전환시험종',lat:37.1,lon:127.1,observedOn:'2026-09-20',birdCount:null,reporter:'합성테스터',namePublic:false,note:'합성 cutover',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'};
const mutation={request_id:'10000000-0000-4000-8000-000000030060',expected_revision:1,action:'approve',adminNote:'합성 전환 검토'};
const baseline=await success('admin',{op:'state'});
try{
 await step(1,'external writer freeze',async()=>{await setBoth(maintenance,frozen);for(const role of ['public','admin']){const r=await http(role,role==='public'?'/reports':'/admin/api/reports/'+id,{},role==='admin'?auth():{});assert.equal(r.status,503);assert.equal(r.body.error.code,'STAGING_EXTERNAL_FREEZE');}return {boundary:'staging wrapper, not production firewall'};});
 await step(2,'maintenance capability convergence',async()=>{for(const role of ['public','admin']){const c=await success(role,{op:'capability'});assert.equal(c.own.mode,maintenance);assert.equal(c.peer.mode,maintenance);}});
 await step(3,'legacy GET remains healthy',async()=>{assert.equal((await http('public','/reports/approved')).status,200);assert.equal((await http('admin','/admin/api/reports?status=all',undefined,auth())).status,200);});
 await step(4,'official migration already applied no-op',async()=>{const before=await success('admin',{op:'state'});wrangler(['d1','migrations','apply',DB_NAME,'--remote'],join(LOCAL,'wrangler.migration.json'),'cutover-migrations-noop');const after=await success('admin',{op:'state'});assert.equal(after.schemaDigest,before.schemaDigest);assert.equal(after.ledgerDigest,before.ledgerDigest);assert.equal(after.digest,before.digest);return {newMigrations:0};});
 await step(5,'sites seed exact replay',async()=>{const plan=JSON.parse(readFileSync(join(LOCAL,'sites-plan.json'),'utf8'));assert.equal((await success('admin',{op:'seed',sites:plan.sites})).added,0);return {sites:190,newRows:0};});
 const plan=JSON.parse(readFileSync(join(LOCAL,'synthetic-backfill-plan.json'),'utf8'));
 await step(6,'frozen synthetic legacy21 source still exact',async()=>{const source=(await queryRead("SELECT * FROM reports WHERE id LIKE '00000000-0000-4000-8000-%' ORDER BY id")).results;assert.equal(stable(source),stable(plan.reports));return {sourceRows:21,manifest:plan.manifest_sha256};});
 await step(7,'already completed backfill cohort exact verification',async()=>{
   const values=JSON.parse(readFileSync(join(LOCAL,'backfill-values.json'),'utf8'));
   for(const [table,field,key] of [['raw_submissions','raw','raw_id'],['checklists','checklist','checklist_id'],['sightings','sighting','sighting_id']]){
     const all=(await queryRead(`SELECT * FROM ${table} ORDER BY ${key}`)).results,keys=new Set(values.map(v=>v[field][key])),found=all.filter(v=>keys.has(v[key])),expected=values.map(v=>v[field]).sort((a,b)=>a[key].localeCompare(b[key]));assert.equal(stable(found),stable(expected));
   }return {cohortRows:21,newInserts:0,method:'cohort full-value verification, not rerunning whole-database backfill after native writes'};
 });
 await step(8,'integrity and schema readiness',async()=>{const s=await success('admin',{op:'state'});assert.deepEqual(s.fk,[]);assert.equal(s.counts.transaction_assertions,0);assert((await success('admin',{op:'capability'})).schemaReady);});
 await step(9,'both new builds deployed under external freeze',()=>setBoth(dual,frozen).then(()=>({build:'phase2c-dual-v3'})));
 await step(10,'reciprocal gate ready',async()=>{for(const r of ['public','admin'])assert.equal((await success(r,{op:'gate'})).dual,true);});
 await step(11,'shadow read before external reopening',async()=>{for(const r of await success('public',{op:'read-compare',paths:['/reports/approved','/reports/pending','/reports/site/1']})){assert(r.ok);assert.equal(r.status,200);assert.equal(r.canonicalStatus,200);assert.deepEqual(r.categories,[]);assert.deepEqual(r.shadowLogs,[]);}});
 await step(12,'dual writes enabled while ordinary HTTP stays frozen',async()=>{for(const r of ['public','admin']){assert.equal((await success(r,{op:'capability'})).own.mode,dual);const response=await http(r,r==='public'?'/reports':'/admin/api/reports/'+id,{},r==='admin'?auth():{});assert.equal(response.status,503);}});
 await step(13,'internal synthetic smoke under freeze',async()=>{const q=await success('public',{op:'quick-injected',body,syntheticIp:'203.0.113.160'});assert.equal(q.status,201);const a=await success('admin',{op:'admin-persistence',id,body:mutation});assert(a.ok);assert((await success('admin',{op:'record',id})).projectionEqual);return {scope:'real handler/D1, synthetic IP/actor internal test boundary'};});
 await step(14,'reopen actual HTTP and authenticated admin smoke',async()=>{await setBoth(dual);const beforeReplay=await success('admin',{op:'state'});assert.equal((await http('public','/reports',body)).status,201);assert.equal((await success('admin',{op:'state'})).digest,beforeReplay.digest);
   // A new real Access actor operation, not a replay of the internal synthetic actor.
   const r=await http('admin','/admin/api/reports/'+id,{request_id:'10000000-0000-4000-8000-000000030061',expected_revision:2,action:'consent',namePublic:false},auth());assert.equal(r.status,200);const record=await success('admin',{op:'record',id});assert(record.projectionEqual);assert.equal(record.revision,3);
   const final=await success('admin',{op:'state'});assert.deepEqual(final.fk,[]);assert.equal(final.counts.transaction_assertions,0);for(const t of Object.keys(baseline.counts)){const delta=['reports','raw_submissions','checklists','sightings'].includes(t)?1:['reviews','audit_log'].includes(t)?2:0;assert.equal(final.counts[t]-baseline.counts[t],delta,t);}
   assert.equal(stable((await queryRead("SELECT * FROM reports WHERE id LIKE '00000000-0000-4000-8000-%' ORDER BY id")).results),stable(plan.reports));return {quickReplay:201,actualAccessMutation:200,revision:3,exactExpectedCounts:true,legacy21Unchanged:true};});
 result.status='PASS';result.in_progress=null;
}finally{try{await setBoth(maintenance);}catch(e){result.cleanup_error=e.message;result.status='FAIL';throw e;}finally{result.finished_at=new Date().toISOString();save();}}
