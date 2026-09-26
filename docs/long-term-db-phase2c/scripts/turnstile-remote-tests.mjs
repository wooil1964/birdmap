import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,assertRemoteIdentity} from './staging-control.mjs';
import {success} from './remote-client.mjs';
import {dual,maintenance,setBoth} from './rollout-lib.mjs';
const file=join(LOCAL,'turnstile-remote-tests.json');if(existsSync(file))throw Error('INSPECT_EXISTING_RESULTS');
await assertRemoteIdentity();const result={status:'RUNNING',at:new Date().toISOString(),scope:'official pass/fail/already-spent testing secrets; actual Siteverify; actual D1; synthetic test IP; not browser-minted real single-use token',tests:[]};
const state=()=>success('admin',{op:'state'}),uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const body=n=>({request_id:uuid(n),non_breeding_confirmed:true,species:'합성캡차'+n,lat:37.1,lon:127.1,observedOn:'2026-09-20',birdCount:1,reporter:'합성테스터',namePublic:false,note:'합성 CAPTCHA',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'});
const call=(n,captchaScenario)=>success('public',{op:'quick-injected',syntheticIp:'203.0.113.150',body:body(n),captchaScenario});
const save=()=>writeFileSync(file,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){result.in_progress=name;save();try{const evidence=await fn();result.tests.push({name,result:'PASS',evidence});console.log('PASS '+name);}catch(e){result.status='FAIL';result.tests.push({name,result:'FAIL',error:e.message});throw e;}finally{save();}}
try{
 await setBoth(dual);
 for(const [n,scenario] of [[10050,'fail'],[10051,'spent']])await check('official '+scenario+' rejects before write',async()=>{const a=await state(),r=await call(n,scenario);assert.equal(r.status,403);assert.equal(r.body.error.code,'CAPTCHA_FAILED');assert.equal((await state()).digest,a.digest);return {status:r.status,code:r.body.error.code,unchanged:true};});
 await check('concurrent pass and already-spent request commit once; retry replays',async()=>{
   const a=await state(),r=await Promise.all([call(10052),call(10052,'spent')]);assert.equal(r[0].status,201);assert([201,403].includes(r[1].status));if(r[1].status===403)assert.equal(r[1].body.error.code,'CAPTCHA_FAILED');
   const b=await state();for(const t of ['reports','raw_submissions','checklists','sightings'])assert.equal(b.counts[t]-a.counts[t],1);
   const retry=await call(10052,'spent');assert.equal(retry.status,201);assert.deepEqual(retry.body,r[0].body);assert.equal((await state()).digest,b.digest);
   return {concurrentStatuses:r.map(v=>v.status),replayStatus:retry.status,insertedReports:1};
 });
 result.status='PASS';result.in_progress=null;
}finally{await setBoth(maintenance);result.finished_at=new Date().toISOString();save();}
