import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,assertRemoteIdentity,queryRead} from './staging-control.mjs';
import {op,success,base} from './remote-client.mjs';
import {verifyBackfill} from '../../../reports-api/tools/backfill-lib.mjs';
await assertRemoteIdentity();
const path=join(LOCAL,'initial-remote-tests.json');if(existsSync(path))throw Error('REVIEW_EXISTING_RESULTS_BEFORE_REPEAT');
const results={at:new Date().toISOString(),tests:[]};
async function test(name,fn){try{const evidence=await fn();results.tests.push({name,result:'PASS',evidence});console.log('PASS '+name);}catch(e){results.tests.push({name,result:'FAIL',error:String(e.message)});throw e;}finally{writeFileSync(path,JSON.stringify(results,null,2)+'\n');}}
await test('internet requests without staging secret rejected',async()=>{for(const role of ['public','admin'])assert.equal((await fetch(base(role)+'/reports/approved')).status,404);});
await test('both Workers actual D1 schema and reciprocal service binding',async()=>{const evidence=[];for(const role of ['public','admin']){const c=await success(role,{op:'capability'});assert(c.schemaReady&&c.own.ready&&c.peer.ready);assert.equal(c.own.mode,'READ_ONLY_MAINTENANCE');assert.notEqual(c.own.role,c.peer.role);evidence.push(c);}return evidence;});
await test('site registry190 atomic seed and exact replay',async()=>{const sites=JSON.parse(readFileSync(join(LOCAL,'sites-plan.json'),'utf8'));const before=await success('admin',{op:'state'});assert.equal(before.counts.sites,0);const a=await success('admin',{op:'seed',sites:sites.sites});assert.equal(a.added,190);assert.equal((await success('admin',{op:'seed',sites:sites.sites})).added,0);const after=await success('admin',{op:'state'});assert.equal(after.counts.sites,190);assert.equal(after.fk.length,0);return {before:before.counts,after:after.counts,registry_revision:sites.registry_revision,statements:a.statements};});
await test('load synthetic legacy21 only',async()=>{const plan=JSON.parse(readFileSync(join(LOCAL,'synthetic-backfill-plan.json'),'utf8'));assert.equal((await success('admin',{op:'legacy-fixture',reports:plan.reports})).added,21);return (await success('admin',{op:'state'})).counts;});
const db={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async all(){return queryRead(sql,params);},async first(){return (await queryRead(sql,params)).results[0]||null;}};}};
await test('original backfill verifier dry-run on remote frozen synthetic source',async()=>{const plan=JSON.parse(readFileSync(join(LOCAL,'synthetic-backfill-plan.json'),'utf8'));const v=await verifyBackfill(db,plan,{allowEmpty:true});assert.equal(v.state,'ready');return v;});
