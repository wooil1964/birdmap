import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,STAGING_DB,WORKERS,assertRemoteIdentity,apiRead} from './staging-control.mjs';
import {success,http} from './remote-client.mjs';
import {auth} from './rollout-lib.mjs';
await assertRemoteIdentity();const workers=[];
for(const [i,role] of ['public','admin'].entries()){
 const settings=await apiRead(`/workers/scripts/${WORKERS[i]}/settings`),deployments=await apiRead(`/workers/scripts/${WORKERS[i]}/deployments`),c=await success(role,{op:'capability'});
 const db=settings.bindings.find(b=>b.name==='REPORTS_DB'),peer=settings.bindings.find(b=>b.name==='REPORTS_PEER');
 assert.equal(db.id,STAGING_DB);assert.equal(peer.service,WORKERS[1-i]);assert.equal(c.own.mode,'READ_ONLY_MAINTENANCE');assert(c.schemaReady&&c.own.ready&&c.peer.ready);
 const read=await http(role,role==='public'?'/reports/approved':'/admin/api/reports?status=all',undefined,role==='admin'?auth():{});assert.equal(read.status,200);assert(read.body.ok);
 const denied=await http(role,role==='public'?'/reports':'/admin/api/reports/10000000-0000-4000-8000-000000010022',{},role==='admin'?auth():{});assert.equal(denied.status,503);assert.equal(denied.headers['retry-after'],'60');
 workers.push({name:WORKERS[i],activeVersions:deployments.deployments[0].versions,stagingBinding:db.id===STAGING_DB,stagingPeer:peer.service===WORKERS[1-i],mode:c.own.mode,build:c.own.build,readStatus:200,writeStatus:503,retryAfter:60});
}
const state=await success('admin',{op:'state'});assert.deepEqual(state.fk,[]);assert.equal(state.counts.transaction_assertions,0);
const result={at:new Date().toISOString(),workers,state};writeFileSync(join(LOCAL,'final-staging-state.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({at:result.at,workers,counts:state.counts,fk:0,assertions:0}));
