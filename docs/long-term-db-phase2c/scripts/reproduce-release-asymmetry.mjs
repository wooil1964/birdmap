import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT,LOCAL,assertRemoteIdentity} from './staging-control.mjs';
import {op,success} from './remote-client.mjs';
const converged=process.argv[2]==='--converged';
const file=join(LOCAL,converged?'release-asymmetry-converged.json':'release-asymmetry-before-fix.json');if(existsSync(file))throw Error('ALREADY_REPRODUCED_DO_NOT_REPEAT');
await assertRemoteIdentity();const before=await success('admin',{op:'state'});
function deploy(role,mode,extra){const p=spawnSync(process.execPath,[join(ROOT,'docs/long-term-db-phase2c/scripts/deploy-staging.mjs'),'deploy',role,mode,JSON.stringify(extra||{})],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error('DEPLOY_FAILED '+p.stderr);console.log(p.stdout.trim());}
const evidence={at:new Date().toISOString(),purpose:'reproduce asymmetric expected-release handshake; read-only gate checks, no report mutations',before:before.counts};
try {
  if(converged){deploy('public','CANONICAL_DUAL_WRITE');deploy('admin','CANONICAL_DUAL_WRITE');}
  deploy('admin','CANONICAL_DUAL_WRITE',{REPORTS_RELEASE_ID:'admin-phase2c-v2-mismatch',PHASE2C_EXTERNAL_FREEZE:'true'});
  if(converged){
    evidence.observations=[];let observed=false;
    for(let i=0;i<12;i++) {
      const p=await success('public',{op:'capability'}),a=await success('admin',{op:'capability'});
      evidence.observations.push({at:new Date().toISOString(),public:p,admin:a});
      if(p.own.mode==='CANONICAL_DUAL_WRITE'&&a.own.mode==='CANONICAL_DUAL_WRITE'&&a.own.release==='admin-phase2c-v2-mismatch'&&p.peer.release===a.own.release){observed=true;break;}
      await new Promise(r=>setTimeout(r,3000));
    }
    assert(observed,'deployed release not yet observed at both HTTP and peer paths');
  }
  evidence.public=await op('public',{op:'gate'});evidence.admin=await op('admin',{op:'gate'});
  evidence.reproduced=evidence.public.status===503&&evidence.public.body.code==='ROLLOUT_NOT_READY'&&evidence.admin.status===200&&evidence.admin.body.value.dual===true;
  evidence.after=(await success('admin',{op:'state'})).counts;assert.equal((await success('admin',{op:'state'})).digest,before.digest);assert(evidence.reproduced);
} finally {
  deploy('public','READ_ONLY_MAINTENANCE');deploy('admin','READ_ONLY_MAINTENANCE');
  evidence.finished_at=new Date().toISOString();writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify({defect:'ASYMMETRIC_EXPECTED_RELEASE',reproduced:evidence.reproduced,data_unchanged:true,final_mode:'READ_ONLY_MAINTENANCE'}));
