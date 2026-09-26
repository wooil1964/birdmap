import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {localDb,environments,uuid} from '../../../reports-api/local-test/helpers.mjs';
import {assertWriteGate,capability} from '../../../reports-api/src/canonical/control.js';
import {purgeForbidden} from '../../../reports-api/src/canonical/purge.js';
import {LOCAL} from './staging-control.mjs';
const local=await localDb(process.argv[2]),results=[];
async function check(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}
const closed=e=>assert.rejects(()=>assertWriteGate(e,e.REPORTS_RELEASE_ID.startsWith('public')?'public':'admin'),{code:'ROLLOUT_NOT_READY',status:503});
try{
 await check('aligned reciprocal release',async()=>{const e=environments(local.db);assert(await assertWriteGate(e.pub,'public'));assert(await assertWriteGate(e.admin,'admin'));});
 for(const [name,mutate] of [['admin release',e=>e.admin.REPORTS_RELEASE_ID='admin-new'],['public release',e=>e.pub.REPORTS_RELEASE_ID='public-new'],['expected peer',e=>e.admin.REPORTS_PEER_RELEASE_ID='wrong'],['missing expected',e=>delete e.admin.REPORTS_PEER_RELEASE_ID]])await check(name+' closes both',async()=>{const e=environments(local.db);mutate(e);await closed(e.pub);await closed(e.admin);});
 await check('mutually updated release pair',async()=>{const e=environments(local.db);e.pub.REPORTS_RELEASE_ID='public-new';e.admin.REPORTS_PEER_RELEASE_ID='public-new';assert(await assertWriteGate(e.pub,'public'));assert(await assertWriteGate(e.admin,'admin'));});
 for(const role of ['pub','admin'])for(const field of ['REPORTS_PEER','REPORTS_GATE_TOKEN'])await check(role+' missing '+field+' closes both',async()=>{const e=environments(local.db);delete e[role][field];await closed(e.pub);await closed(e.admin);});
 for(const field of ['build','schema'])await check('old '+field+' denied in both roles',async()=>{for(const role of ['pub','admin']){const e=environments(local.db),own=e[role],other=e[role==='pub'?'admin':'pub'];own.REPORTS_PEER={fetch:async()=>Response.json({...await capability(other,role==='pub'?'admin':'public'),[field]:'old'})};await closed(own);}});
 await check('purge reciprocal release fails before database mutation',async()=>{const e=environments(local.db);for(const v of Object.values(e))v.REPORTS_WRITE_MODE='READ_ONLY_MAINTENANCE';Object.assign(e.admin,{REPORTS_PURGE_ENABLED:'true',REPORTS_PURGE_ADMINS:'test@example.test',REPORTS_RELEASE_ID:'admin-new'});await assert.rejects(()=>purgeForbidden(e.admin,{email:'test@example.test'},{id:uuid(1),request_id:uuid(2),expected_revision:1,confirmation:'PURGE_FORBIDDEN_CONTENT',reason_code:'forbidden_breeding_content'}),{code:'PURGE_NOT_READY',status:503});assert.equal((await local.db.prepare('SELECT COUNT(*) n FROM audit_log').first()).n,0);});
 writeFileSync(join(LOCAL,'gate-local-regression.json'),JSON.stringify({at:new Date().toISOString(),status:'PASS',tests:results},null,2)+'\n');
}finally{await local.close();}
