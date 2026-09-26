import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,assertRemoteIdentity} from './staging-control.mjs';
import {op,success,http} from './remote-client.mjs';
import {roles,maintenance,dual,deploy,converge,setBoth,auth} from './rollout-lib.mjs';
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const body={request_id:uuid(10040),non_breeding_confirmed:true,species:'합성폐기시험종',lat:37.1,lon:127.1,observedOn:'2026-09-20',birdCount:1,reporter:'합성테스터',namePublic:false,note:'SYNTHETIC_FORBIDDEN_DETAIL',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'};
const file=join(LOCAL,'purge-remote-tests.json');if(existsSync(file))throw Error('INSPECT_EXISTING_RESULTS');
await assertRemoteIdentity();const result={status:'RUNNING',at:new Date().toISOString(),scope:'synthetic native only; actual quick/admin HTTP; purge via privileged internal staging harness',tests:[]};
const save=()=>writeFileSync(file,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){result.in_progress=name;save();try{const evidence=await fn();result.tests.push({name,result:'PASS',evidence});console.log('PASS '+name);}catch(e){result.status='FAIL';result.tests.push({name,result:'FAIL',error:e.message});throw e;}finally{save();}}
const state=()=>success('admin',{op:'state'});
const input={id:uuid(10040),request_id:uuid(30040),expected_revision:2,confirmation:'PURGE_FORBIDDEN_CONTENT',reason_code:'forbidden_breeding_content'};
const purge=(patch={},extra={})=>op('admin',{op:'purge',input:{...input,...patch},...extra});
async function denied(patch,extra,status,code){const a=await state(),r=await purge(patch,extra);assert.equal(r.status,status);assert.equal(r.body.code,code);const b=await state();assert.equal(b.digest,a.digest);assert.equal(b.schemaDigest,a.schemaDigest);assert.equal(b.ledgerDigest,a.ledgerDigest);return {status,code,unchanged:true};}
try{
 await check('real HTTP synthetic native and Access approve fixture',async()=>{await setBoth(dual);assert.equal((await http('public','/reports',body)).status,201);const r=await http('admin','/admin/api/reports/'+input.id,{request_id:uuid(30041),expected_revision:1,action:'approve',adminNote:'SYNTHETIC_FORBIDDEN_DETAIL'},auth());assert.equal(r.status,200);const a=await success('admin',{op:'record',id:input.id});assert.equal(a.revision,2);assert(a.reviews.length>0&&a.auditCount>0);});
 await check('purge requires maintenance',()=>denied({}, {},403,'PURGE_FORBIDDEN'));
 await setBoth(maintenance);
 for(const [name,patch,extra,status,code] of [
  ['authorized actor',{}, {unauthorized:true},403,'PURGE_FORBIDDEN'],
  ['confirmation',{confirmation:undefined},{},403,'PURGE_FORBIDDEN'],
  ['revision',{expected_revision:undefined},{},400,'REVISION_REQUIRED'],
  ['stale revision',{expected_revision:1},{},409,'PURGE_CONFLICT'],
  ['legacy explicit decision',{id:'00000000-0000-4000-8000-000000000001',expected_revision:1},{},409,'PURGE_LEGACY_DECISION_REQUIRED'],
  ['middle batch rollback',{}, {failIndex:8},409,'PURGE_CONFLICT'],
  ['tombstone insert rollback',{}, {failIndex:14},409,'PURGE_CONFLICT']
 ])await check(name,()=>denied(patch,extra,status,code));
 await check('purge reciprocal peer readiness',async()=>{deploy('admin',maintenance,{REPORTS_RELEASE_ID:'admin-purge-mismatch'});await converge({public:{mode:maintenance},admin:{mode:maintenance,extra:{REPORTS_RELEASE_ID:'admin-purge-mismatch'}}});const r=await denied({}, {},503,'PURGE_NOT_READY');deploy('admin',maintenance);await converge(Object.fromEntries(roles.map(r=>[r,{mode:maintenance}])));return r;});
 await check('purge deletes all target payload and preserves unrelated rows',async()=>{
   const before=await success('admin',{op:'purge-proof',id:input.id});assert(before.markerRows>0);assert(before.originalIds.reviews.length>0&&before.originalIds.audit_log.length>0);
   const r=await purge();assert.equal(r.status,200);assert(r.body.value.purged);
   const after=await success('admin',{op:'purge-proof',id:input.id,originalIds:before.originalIds,requestId:input.request_id});
   assert.equal(after.unrelatedDigest,before.unrelatedDigest);assert.equal(after.markerRows,0);assert(Object.values(after.targetCounts).every(n=>n===0));assert(Object.values(after.originalResidue).every(n=>n===0));assert(after.tombstoneValid);assert.equal(after.auditRows,1);
   return {targetCounts:after.targetCounts,originalResidue:after.originalResidue,markerRows:0,tombstoneValid:true,unrelatedRowsUnchanged:true};
 });
 await check('same purge replay and different operation conflict',async()=>{const a=await state();assert.equal((await purge()).status,200);assert.equal((await state()).digest,a.digest);return denied({request_id:uuid(30042)},{},410,'REPORT_PURGED');});
 await check('purged original quick request returns410',async()=>{await setBoth(dual);const a=await state(),r=await http('public','/reports',body);assert.equal(r.status,410);assert.equal(r.body.error.code,'REPORT_PURGED');assert.equal((await state()).digest,a.digest);await setBoth(maintenance);return {status:410};});
 result.status='PASS';result.in_progress=null;
}finally{try{if(result.status!=='PASS')await setBoth(maintenance);}catch(e){result.cleanup_error=e.message;result.status='FAIL';throw e;}finally{result.finished_at=new Date().toISOString();save();}}
