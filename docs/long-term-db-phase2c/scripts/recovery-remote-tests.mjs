import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,DB_NAME,WORKERS,STAGING_DB,assertRemoteIdentity,apiRead,wrangler} from './staging-control.mjs';
import {success,http} from './remote-client.mjs';
import {roles,maintenance,dual,deploy,converge,setBoth,auth} from './rollout-lib.mjs';
const file=join(LOCAL,'recovery-remote-tests.json');if(existsSync(file))throw Error('INSPECT_EXISTING_RESULTS_NO_AUTOMATIC_RESTORE_REPLAY');
await assertRemoteIdentity();
for(const name of ['purge-remote-tests.json','turnstile-remote-tests.json'])assert.equal(JSON.parse(readFileSync(join(LOCAL,name),'utf8')).status,'PASS');
const result={status:'RUNNING',at:new Date().toISOString(),scope:'staging only; all other test writers finished; application10tables + schema + migration ledger; Cloudflare internal metadata excluded',tests:[]};
const save=()=>writeFileSync(file,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){result.in_progress=name;save();try{const evidence=await fn();result.tests.push({name,result:'PASS',evidence});console.log('PASS '+name);}catch(e){result.status='FAIL';result.tests.push({name,result:'FAIL',error:e.message});throw e;}finally{save();}}
const state=()=>success('admin',{op:'state'});
const equal=(a,b)=>{for(const key of ['digest','schemaDigest','ledgerDigest'])assert.equal(a[key],b[key]);assert.deepEqual(a.counts,b.counts);assert.deepEqual(a.fk,[]);assert.equal(a.counts.transaction_assertions,0);};
async function maintenanceHttp(){
 for(const role of roles){const r=await http(role,role==='public'?'/reports':'/admin/api/reports/10000000-0000-4000-8000-000000010022',{},role==='admin'?auth():{});assert.equal(r.status,503);assert.equal(r.headers['retry-after'],'60');}
 for(const [role,path] of [['public','/reports/approved'],['admin','/admin/api/reports?status=all']]){const r=await http(role,path,undefined,role==='admin'?auth():{});assert.equal(r.status,200);assert(r.body.ok);}
}
try{
 await converge(Object.fromEntries(roles.map(r=>[r,{mode:maintenance}])));await maintenanceHttp();
 await check('bookmark available at requested creation-plus-one-minute timestamp',async()=>{
   const resources=JSON.parse(readFileSync(join(LOCAL,'resources.json'),'utf8'));
   const timestamp=new Date(Date.parse(resources.created_at)+60000).toISOString();
   const parsed=JSON.parse(wrangler(['d1','time-travel','info',DB_NAME,'--timestamp',timestamp,'--json'],join(LOCAL,'wrangler.admin.json'),'time-travel-early'));
   assert(parsed.bookmark);return {databaseCreated:resources.created_at,requestedTimestamp:timestamp,bookmarkAvailable:true,planRetentionNotInferredFromNewDatabase:true};
 });
 await check('real staging Time Travel restores full application state after one probe',async()=>{
   const baseline=await state();assert.equal(baseline.counts.transaction_assertions,0);assert.deepEqual(baseline.fk,[]);
   const info=JSON.parse(wrangler(['d1','time-travel','info',DB_NAME,'--json'],join(LOCAL,'wrangler.admin.json'),'time-travel-before-probe'));assert(info.bookmark);
   writeFileSync(join(LOCAL,'restore-baseline.json'),JSON.stringify({at:new Date().toISOString(),bookmark:info.bookmark,...baseline},null,2)+'\n');
   await success('admin',{op:'restore-probe',confirmation:'STAGING_TIME_TRAVEL_PROBE'});
   const changed=await state();assert.equal(changed.counts.transaction_assertions,1);assert.equal(changed.assertions[0].assertion_id,'phase2c-time-travel-probe');assert.notEqual(changed.digest,baseline.digest);
   result.restore_requested=true;save();
   const output=wrangler(['d1','time-travel','restore',DB_NAME,'--bookmark',info.bookmark,'--json'],join(LOCAL,'wrangler.admin.json'),'time-travel-restore');
   let restored;try{restored=JSON.parse(output);}catch{throw Error('RESTORE_OUTPUT_NOT_JSON_INSPECT_LOG');}
   result.restore_response=restored;save();const after=await state();equal(after,baseline);
   for(const role of roles){const c=await success(role,{op:'capability'});assert(c.schemaReady&&c.own.ready&&c.peer.ready);}
   const purge=await success('admin',{op:'purge-proof',id:'10000000-0000-4000-8000-000000010040',requestId:'10000000-0000-4000-8000-000000030040'});assert(purge.tombstoneValid);assert.equal(purge.markerRows,0);
   return {before:baseline.counts,after:after.counts,allApplicationDataEqual:true,schemaEqual:true,ledgerEqual:true,probeRows:0,fkErrors:0,purgeTombstonePreserved:true};
 });
 await check('restored purge tombstone still returns410 with dual gate',async()=>{
   const a=await state();await setBoth(dual);
   const r=await http('public','/reports',{request_id:'10000000-0000-4000-8000-000000010040',non_breeding_confirmed:true,species:'합성폐기시험종',lat:37.1,lon:127.1,observedOn:'2026-09-20',birdCount:1,reporter:'합성테스터',namePublic:false,note:'SYNTHETIC_FORBIDDEN_DETAIL',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'});
   assert.equal(r.status,410);assert.equal(r.body.error.code,'REPORT_PURGED');equal(await state(),a);await setBoth(maintenance);return {status:410,dataUnchanged:true};
 });
 await check('both staging Workers rollback to verified maintenance versions',async()=>{
   const baseline=await state(),history=JSON.parse(readFileSync(join(LOCAL,'worker-deployments.json'),'utf8'));
   const targets=Object.fromEntries(roles.map(role=>[role,[...history].reverse().find(d=>d.role===role&&d.mode===maintenance&&!Object.keys(d.extra).length)]));
   assert(roles.every(r=>targets[r]?.version));const configCopies={};
   for(const role of roles){const cfg=JSON.parse(readFileSync(join(LOCAL,`wrangler.${role}.json`),'utf8'));assert(cfg.vars.ACCESS_AUD);assert.equal(cfg.d1_databases[0].database_id,STAGING_DB);configCopies[role]=cfg;}
   for(const role of roles)deploy(role,maintenance,{REPORTS_RELEASE_ID:role+'-rollback-probe'});
   await converge(Object.fromEntries(roles.map(role=>[role,{mode:maintenance,extra:{REPORTS_RELEASE_ID:role+'-rollback-probe'}}])));
   for(const role of roles){const config=join(LOCAL,`rollback.${role}.json`);writeFileSync(config,JSON.stringify(configCopies[role],null,2)+'\n');wrangler(['rollback',targets[role].version,'--yes','--message','Phase2C staging rehearsal'],config,'rollback-'+role);}
   await converge(Object.fromEntries(roles.map(r=>[r,{mode:maintenance}])));
   const deployed={};for(const [i,role] of roles.entries()){
     const d=await apiRead(`/workers/scripts/${WORKERS[i]}/deployments`),latest=d.deployments[0];assert.equal(latest.versions.length,1);assert.equal(latest.versions[0].version_id,targets[role].version);assert.equal(latest.versions[0].percentage,100);
     const settings=await apiRead(`/workers/scripts/${WORKERS[i]}/settings`);assert.equal(settings.bindings.find(b=>b.name==='REPORTS_DB').id,STAGING_DB);assert.equal(settings.bindings.find(b=>b.name==='REPORTS_PEER').service,WORKERS[1-i]);deployed[role]={version:targets[role].version,deployment:latest.id,stagingBindingsConfirmed:true};
     writeFileSync(join(LOCAL,`wrangler.${role}.json`),JSON.stringify(configCopies[role],null,2)+'\n');
   }
   await maintenanceHttp();equal(await state(),baseline);return {deployed,dataUnchanged:true,maintenanceHttpVerified:true};
 });
 result.status='PASS';result.in_progress=null;
}catch(e){result.status='FAIL';result.error=e.message;throw e;}finally{try{if(result.status!=='PASS')await setBoth(maintenance);}catch(e){result.cleanup_error=e.message;result.status='FAIL';throw e;}finally{result.finished_at=new Date().toISOString();save();}}
