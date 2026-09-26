import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,assertRemoteIdentity,queryRead} from './staging-control.mjs';
import {op,success} from './remote-client.mjs';
import {verifyBackfill} from '../../../reports-api/tools/backfill-lib.mjs';
if(process.argv[2]!=='--user-approved-synthetic21')throw Error('SEPARATE_USER_APPROVAL_REQUIRED');
await assertRemoteIdentity();
const file=join(LOCAL,'backfill-remote-results.json');if(existsSync(file))throw Error('INSPECT_EXISTING_RESULTS_BEFORE_REPEAT');
const plan=JSON.parse(readFileSync(join(LOCAL,'synthetic-backfill-plan.json'),'utf8'));
const db={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async all(){return queryRead(sql,params);},async first(){return (await queryRead(sql,params)).results[0]||null;}};}};
const record={status:'RUNNING',at:new Date().toISOString(),manifest:plan.manifest_sha256,tests:[]};
async function test(name,fn){record.in_progress=name;writeFileSync(file,JSON.stringify(record,null,2)+'\n');try{const evidence=await fn();record.tests.push({name,result:'PASS',evidence});record.in_progress=null;console.log('PASS '+name);}catch(e){record.status='FAIL';record.tests.push({name,result:'FAIL',error:String(e.message)});throw e;}finally{writeFileSync(file,JSON.stringify(record,null,2)+'\n');}}
await test('frozen source and registry verifier before apply',async()=>{assert.equal((await verifyBackfill(db,plan,{allowEmpty:true})).state,'ready');return (await success('admin',{op:'state'})).counts;});
await test('remote actual D1 batch synthetic21 backfill',async()=>{const before=await success('admin',{op:'state'});const result=await success('admin',{op:'backfill',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED',plan});assert.equal(result.added,21);assert.equal(result.statements,64);const after=await success('admin',{op:'state'});for(const t of ['raw_submissions','checklists','sightings'])assert.equal(after.counts[t]-before.counts[t],21);assert.equal(after.counts.reports,21);assert.equal(after.counts.reviews,0);assert.equal(after.counts.audit_log,0);assert.equal(after.fk.length,0);return {before:before.counts,after:after.counts,statements:64};});
await test('original whole-value verifier after remote apply',async()=>{const result=await verifyBackfill(db,plan);assert.equal(result.state,'verified');return result;});
await test('same manifest replay inserts zero and preserves complete state',async()=>{const before=await success('admin',{op:'state'});assert.equal((await success('admin',{op:'backfill',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED',plan})).added,0);assert.equal((await success('admin',{op:'state'})).digest,before.digest);return {added:0};});
await test('changed manifest and altered provenance stop before writes',async()=>{const before=await success('admin',{op:'state'});for(const [patch,expected] of [[{manifest_sha256:'0'.repeat(64)},'MANIFEST_CHANGED'],[{captured_at:'2026-09-25T12:00:00.000Z'},'BACKFILL_DRIFT']]){const r=await op('admin',{op:'backfill',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED',plan:{...plan,...patch}});assert.equal(r.body.ok,false);assert.equal(r.body.code==='TEST_FAILED'?r.body.message:r.body.code,expected);}assert.equal((await success('admin',{op:'state'})).digest,before.digest);});
await test('actual incomplete staging canonical state is rejected without automatic repair',async()=>{
  const before=await success('admin',{op:'state'}),sighting=JSON.parse(readFileSync(join(LOCAL,'backfill-values.json'),'utf8'))[0].sighting;
  await success('admin',{op:'partial-probe',phase:'remove',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED'});
  try{const partial=await success('admin',{op:'state'});assert.equal(partial.counts.sightings,20);const r=await op('admin',{op:'backfill',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED',plan});assert.equal(r.body.message,'BACKFILL_DRIFT');assert.equal((await success('admin',{op:'state'})).digest,partial.digest);}
  finally{await success('admin',{op:'partial-probe',phase:'restore',approval:'PHASE2C_SYNTHETIC_BACKFILL_APPROVED',row:sighting});}
  assert.equal((await success('admin',{op:'state'})).digest,before.digest);assert.equal((await verifyBackfill(db,plan)).state,'verified');return {partial_sightings:20,automatic_inserts:0,explicit_fixture_restored:true};
});
await test('legacy21 statuses, site NULL and known count semantics preserved',async()=>{const r=(await queryRead("SELECT COUNT(*) total,SUM(status='approved') approved,SUM(status='rejected') rejected,SUM(site_id IS NULL) site_null,SUM(shared_bird_count=1) count_one,SUM(shared_bird_count IS NULL) count_null FROM checklists")).results[0];assert.deepEqual(r,{total:21,approved:17,rejected:4,site_null:5,count_one:13,count_null:8});const c=(await queryRead("SELECT COUNT(*) total,SUM(count_value=1) count_one,SUM(count_value IS NULL) count_null,SUM(count_accuracy='unknown') accuracy_unknown,SUM(taxon_id IS NULL) taxa_null FROM sightings")).results[0];assert.deepEqual(c,{total:21,count_one:13,count_null:8,accuracy_unknown:21,taxa_null:21});return {checklists:r,sightings:c};});
record.status='PASS';record.finished_at=new Date().toISOString();writeFileSync(file,JSON.stringify(record,null,2)+'\n');
