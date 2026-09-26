import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT,LOCAL} from './staging-control.mjs';
import {success} from './remote-client.mjs';
export const roles=['public','admin'];
export const maintenance='READ_ONLY_MAINTENANCE',dual='CANONICAL_DUAL_WRITE';
export function deploy(role,mode,extra={}) {
  const p=spawnSync(process.execPath,[join(ROOT,'docs/long-term-db-phase2c/scripts/deploy-staging.mjs'),'deploy',role,mode,JSON.stringify(extra)],{encoding:'utf8',windowsHide:true,timeout:180000});
  if(p.status!==0)throw Error('STAGING_DEPLOY_FAILED '+p.stderr);console.log(p.stdout.trim());
}
export function auth() {const token=readFileSync(join(LOCAL,'staging-access-jwt.txt'),'utf8').trim();return {'Cf-Access-Jwt-Assertion':token,Cookie:'CF_Authorization='+token};}
export async function converge(spec) {
  const expected=(role,c)=>{const s=spec[role],e=s.extra||{},peerRelease=e.REPORTS_PEER_RELEASE_ID===undefined?(role==='public'?'admin':'public')+'-phase2c-v1':e.REPORTS_PEER_RELEASE_ID||null;return c.role===role&&c.mode===s.mode&&c.build===(e.PHASE2C_BUILD_V1==='true'?'phase2b-dual-v1':'phase2c-dual-v3')&&c.release===(e.REPORTS_RELEASE_ID??role+'-phase2c-v1')&&c.activation===(e.REPORTS_ACTIVATION_ID??'phase2c-staging-20260926')&&c.ready===(s.mode!=='NORMAL'&&e.REPORTS_DUAL_WRITE_ENABLED!=='false'&&e.REPORTS_SCHEMA_VERSION!=='wrong'&&e.REPORTS_PEER_RELEASE_ID!==''&&e.PHASE2C_PEER_DISCONNECTED!=='true')&&(c.build==='phase2b-dual-v1'||c.peerRelease===peerRelease);};
  for(let i=0;i<20;i++) {
    const observations=Object.fromEntries(await Promise.all(roles.map(async role=>[role,await success(role,{op:'capability'})])));
    if(roles.every(role=>expected(role,observations[role].own)&&(spec[role].extra?.PHASE2C_PEER_DISCONNECTED==='true'?observations[role].peer===null:expected(role==='public'?'admin':'public',observations[role].peer))))return observations;
    await new Promise(r=>setTimeout(r,2000));
  }
  assert.fail('DEPLOYMENT_CAPABILITIES_DID_NOT_CONVERGE');
}
export async function setBoth(mode,extra={}) {for(const role of roles)deploy(role,mode,extra[role]||{});return converge(Object.fromEntries(roles.map(role=>[role,{mode,extra:extra[role]||{}}])));}
