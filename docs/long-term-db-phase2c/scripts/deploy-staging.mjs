import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join,relative} from 'node:path';
import {ACCOUNT,STAGING_DB,DB_NAME,WORKERS,ROOT,LOCAL,state,assertRemoteIdentity,apiRead,wrangler} from './staging-control.mjs';
const action=process.argv[2];
if(!['bootstrap','deploy'].includes(action))throw Error('MODE_REQUIRED');
state();await assertRemoteIdentity();
const registryPath=join(LOCAL,'worker-deployments.json');
const history=existsSync(registryPath)?JSON.parse(readFileSync(registryPath,'utf8')):[];
const role=process.argv[3];
const mode=process.argv[4]||'READ_ONLY_MAINTENANCE';
if(!['NORMAL','READ_ONLY_MAINTENANCE','CANONICAL_DUAL_WRITE'].includes(mode))throw Error('MODE_INVALID');
const secretsPath=join(LOCAL,'staging-secrets.json');
function config(role,peer,mode,extra={}) {
  const i=role==='public'?0:1;
  const cfg={name:WORKERS[i],account_id:ACCOUNT,main:relative(LOCAL,join(ROOT,'docs/long-term-db-phase2c/scripts/staging-worker.mjs')).replaceAll('\\','/'),compatibility_date:'2026-09-24',workers_dev:true,preview_urls:false,routes:[],
    d1_databases:[{binding:'REPORTS_DB',database_name:DB_NAME,database_id:STAGING_DB}],
    vars:{ENVIRONMENT:'staging',PHASE2C_DATABASE_ID:STAGING_DB,PHASE2C_ROLE:role,REPORTS_WRITE_MODE:mode,REPORTS_DUAL_WRITE_ENABLED:mode==='NORMAL'?'false':'true',REPORTS_CONFIRMATION_REQUIRED:'true',REPORTS_SCHEMA_VERSION:'phase2a-0001',REPORTS_ACTIVATION_ID:'phase2c-staging-20260926',REPORTS_RELEASE_ID:role+'-phase2c-v1',REPORTS_PEER_RELEASE_ID:(i===0?'admin':'public')+'-phase2c-v1',REPORTS_PENDING_PUBLIC:'1',...extra}};
  if(peer)cfg.services=[{binding:'REPORTS_PEER',service:WORKERS[1-i]}];
  if(extra.PHASE2C_PEER_DISCONNECTED==='true')delete cfg.services;
  if(extra.PHASE2C_BUILD_V1==='true')cfg.main='old-v1/docs/long-term-db-phase2c/scripts/staging-worker.mjs';
  const accessPath=join(LOCAL,'staging-access.json');
  if(existsSync(accessPath)){const access=JSON.parse(readFileSync(accessPath,'utf8'));Object.assign(cfg.vars,{ACCESS_TEAM_DOMAIN:access.team_domain,ACCESS_AUD:access.aud,ADMIN_EMAILS:access.admin_email});}
  const path=join(LOCAL,`wrangler.${role}.json`);writeFileSync(path,JSON.stringify(cfg,null,2)+'\n');return path;
}
async function deploy(role,peer,mode,extra={}) {
  const cfg=config(role,peer,mode,extra),label=`deploy-${history.length}-${role}-${mode}`;
  const output=wrangler(['deploy'],cfg,label);
  const version=/Current Version ID:\s*([0-9a-f-]+)/i.exec(output)?.[1];
  const settings=await apiRead(`/workers/scripts/${WORKERS[role==='public'?0:1]}/settings`);
  const bindings=settings.bindings||[];
  if(bindings.find(b=>b.name==='REPORTS_DB')?.id!==STAGING_DB||bindings.filter(b=>b.type==='service').some(b=>!WORKERS.includes(b.service)))throw Error('DEPLOYED_BINDING_MISMATCH');
  history.push({at:new Date().toISOString(),worker:WORKERS[role==='public'?0:1],role,mode,version,peer,extra,binding_confirmed:true,production_changed:false});
  writeFileSync(registryPath,JSON.stringify(history,null,2)+'\n');console.log(JSON.stringify(history.at(-1)));return cfg;
}
if(action==='bootstrap') {
  if(history.length)throw Error('ALREADY_BOOTSTRAPPED');
  const scripts=await apiRead('/workers/scripts');if(scripts.some(s=>WORKERS.includes(s.id)))throw Error('WORKER_COLLISION');
  if(!existsSync(secretsPath))writeFileSync(secretsPath,JSON.stringify({PHASE2C_TEST_TOKEN:randomBytes(32).toString('hex'),REPORTS_GATE_TOKEN:randomBytes(32).toString('hex'),REPORT_IP_SALT:randomBytes(32).toString('hex'),TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'}));
  // Closed bootstrap before tokens exist. Circular service bindings are then installed sequentially.
  const pub=await deploy('public',false,'READ_ONLY_MAINTENANCE');
  const admin=await deploy('admin',true,'READ_ONLY_MAINTENANCE');
  for(const [name,cfg] of [['public',pub],['admin',admin]])wrangler(['secret','bulk',secretsPath],cfg,'secrets-'+name);
  await deploy('public',true,'READ_ONLY_MAINTENANCE');
} else {
  if(!['public','admin'].includes(role)||!history.length)throw Error('BOOTSTRAP_REQUIRED');
  const extra=process.argv[5]?JSON.parse(process.argv[5]):{};
  const allowed=['REPORTS_RELEASE_ID','REPORTS_PEER_RELEASE_ID','REPORTS_ACTIVATION_ID','REPORTS_SCHEMA_VERSION','REPORTS_SHADOW_READ','REPORTS_DUAL_WRITE_ENABLED','PHASE2C_EXTERNAL_FREEZE','PHASE2C_PEER_DISCONNECTED','PHASE2C_BUILD_V1'];
  if(Object.keys(extra).some(k=>!allowed.includes(k)))throw Error('OVERRIDE_FORBIDDEN');
  await deploy(role,true,mode,extra);
}
