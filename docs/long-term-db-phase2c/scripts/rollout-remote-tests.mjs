import assert from 'node:assert/strict';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,assertRemoteIdentity} from './staging-control.mjs';
import {op,success,http} from './remote-client.mjs';
import {roles,maintenance,dual,deploy,converge,setBoth,auth} from './rollout-lib.mjs';
const file=join(LOCAL,'rollout-v3-remote-tests.json'),resume=process.argv[2]==='--resume';if(existsSync(file)&&!resume)throw Error('INSPECT_EXISTING_RESULTS');
await assertRemoteIdentity();const baseline=await success('admin',{op:'state'}),result=resume?JSON.parse(readFileSync(file,'utf8')):{status:'RUNNING',at:new Date().toISOString(),tests:[]};
if(resume){if(result.status==='PASS')throw Error('ALREADY_COMPLETE');result.attempts=[...(result.attempts||[]),...result.tests.filter(t=>t.result==='FAIL')];result.tests=result.tests.filter(t=>t.result==='PASS');result.status='RUNNING';await setBoth(dual);}
const save=()=>writeFileSync(file,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){if(result.tests.some(t=>t.name===name&&t.result==='PASS'))return;result.in_progress=name;save();try{const evidence=await fn();result.tests.push({name,result:'PASS',evidence});console.log('PASS '+name);}catch(e){result.status='FAIL';result.tests.push({name,result:'FAIL',error:e.message});throw e;}finally{save();}}
const gates=async(open=false)=>{const out=[];for(const role of roles){const r=await op(role,{op:'gate'});assert.equal(r.status,open?200:503);if(open)assert.equal(r.body.value.dual,true);else assert.equal(r.body.code,'ROLLOUT_NOT_READY');out.push({role,status:r.status,code:r.body.code});}return out;};
try {
 await check('aligned v3 reciprocal gate opens',async()=>{await setBoth(dual);return gates(true);});
 for(const [name,role,extra] of [
  ['admin release changed','admin',{REPORTS_RELEASE_ID:'admin-mismatch'}],
  ['public release changed','public',{REPORTS_RELEASE_ID:'public-mismatch'}],
  ['expected peer release changed','admin',{REPORTS_PEER_RELEASE_ID:'wrong'}],
  ['expected peer release missing','admin',{REPORTS_PEER_RELEASE_ID:''}],
  ['new public old admin','admin',{PHASE2C_BUILD_V1:'true'}],
  ['old public new admin','public',{PHASE2C_BUILD_V1:'true'}],
  ['activation mismatch','admin',{REPORTS_ACTIVATION_ID:'wrong'}],
  ['schema version invalid','admin',{REPORTS_SCHEMA_VERSION:'wrong'}],
  ['public peer disconnected','public',{PHASE2C_PEER_DISCONNECTED:'true'}],
  ['admin peer disconnected','admin',{PHASE2C_PEER_DISCONNECTED:'true'}]
 ])await check(name+' closes both',async()=>{
   deploy(role,dual,extra);await converge(Object.fromEntries(roles.map(r=>[r,{mode:dual,extra:r===role?extra:{}}])));
   const observed=await gates();deploy(role,dual);await converge(Object.fromEntries(roles.map(r=>[r,{mode:dual}])));return observed;
 });
 for(const oldRole of roles)await check('NORMAL '+oldRole+' writer requires external freeze',async()=>{
   const extra={PHASE2C_BUILD_V1:'true',PHASE2C_EXTERNAL_FREEZE:'true'};deploy(oldRole,'NORMAL',extra);
   await converge(Object.fromEntries(roles.map(r=>[r,{mode:r===oldRole?'NORMAL':dual,extra:r===oldRole?extra:{}}])));
   const newRole=oldRole==='public'?'admin':'public';assert.equal((await op(newRole,{op:'gate'})).status,503);
   assert.equal((await success(oldRole,{op:'gate'})).dual,false);
   for(const r of roles){const response=await http(r,r==='public'?'/reports':'/admin/api/reports/10000000-0000-4000-8000-000000010022',{},r==='admin'?auth():{});assert.equal(response.status,503);assert.equal(response.headers['retry-after'],'60');}
   deploy(oldRole,dual);await converge(Object.fromEntries(roles.map(r=>[r,{mode:dual}])));return {oldCodeHasNoPeerGate:true,externalFreezeRequired:true};
 });
 await check('maintenance permits reads and denies actual authenticated writes',async()=>{
   await setBoth(maintenance);
   for(const role of roles){const r=await http(role,role==='public'?'/reports':'/admin/api/reports/10000000-0000-4000-8000-000000010022',{},role==='admin'?auth():{});assert.equal(r.status,503);assert.equal(r.headers['retry-after'],'60');}
   const read=await http('public','/reports/approved');assert.equal(read.status,200);assert(read.body.ok);
   const admin=await http('admin','/admin/api/reports?status=all',undefined,auth());assert.equal(admin.status,200);assert(admin.body.ok&&Array.isArray(admin.body.reports));
   const final=await success('admin',{op:'state'});assert.equal(final.digest,baseline.digest);assert.equal(final.schemaDigest,baseline.schemaDigest);return {dataUnchanged:true};
 });
 result.status='PASS';result.in_progress=null;
}finally{if(result.status!=='PASS')await setBoth(maintenance);result.finished_at=new Date().toISOString();save();}
