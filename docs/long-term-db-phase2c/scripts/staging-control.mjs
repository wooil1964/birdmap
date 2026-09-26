import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
export const ACCOUNT='1d697c22a32447b386b9fac6a3538597';
export const STAGING_DB='f2c65357-47fc-4f09-82c6-ad0d28f8314f';
export const PRODUCTION_DB='b48201cc-0abd-4a64-bb61-9dd2a7813d21';
export const DB_NAME='birdmap-reports-staging';
export const WORKERS=['birdmap-reports-staging-public','birdmap-reports-staging-admin'];
export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const LOCAL=fileURLToPath(new URL('../.local/',import.meta.url));
export function state() {
  const value=JSON.parse(readFileSync(join(LOCAL,'resources.json'),'utf8'));
  if(value.account_id!==ACCOUNT||value.database_id!==STAGING_DB||value.database_id===PRODUCTION_DB||value.database_name!==DB_NAME||value.public_worker!==WORKERS[0]||value.admin_worker!==WORKERS[1]||value.routes.length||value.custom_domains.length)throw Error('STAGING_ISOLATION_GUARD');
  return value;
}
export function headers() {
  const auth=readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
  const token=/^oauth_token\s*=\s*"([^"]+)"/m.exec(auth)?.[1];if(!token)throw Error('LOGIN_REQUIRED');
  return {Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
}
export async function apiRead(path) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{headers:headers()});
  const value=await response.json();if(!response.ok||!value.success)throw Error('READ_FAILED '+response.status+' '+JSON.stringify(value.errors));return value.result;
}
export async function assertRemoteIdentity() {
  state();const remote=await apiRead(`/d1/database/${STAGING_DB}`);
  if(remote.uuid!==STAGING_DB||remote.name!==DB_NAME)throw Error('REMOTE_IDENTITY_MISMATCH');return remote;
}
export async function queryRead(sql,params=[]) {
  state();if(!/^\s*(SELECT|PRAGMA (table_xinfo|index_list|index_xinfo|foreign_key_list|foreign_key_check)\b)/i.test(sql)||/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|ATTACH)\b/i.test(sql.replace(/'[^']*'/g,"''")))throw Error('READ_ONLY_SQL_GUARD');
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${STAGING_DB}/query`,{method:'POST',headers:headers(),body:JSON.stringify({sql,params})});
  const value=await r.json();if(!r.ok||!value.success||value.result.some(v=>!v.success))throw Error('STAGING_READ_FAILED '+r.status+' '+JSON.stringify(value.errors));return value.result[0];
}
export function migrationConfig() {
  state();const migrations=join(LOCAL,'migrations');mkdirSync(migrations,{recursive:true});
  copyFileSync(join(ROOT,'reports-api/schema.sql'),join(migrations,'0000_legacy.sql'));
  copyFileSync(join(ROOT,'docs/long-term-db-phase2a/migrations/0001_core.sql'),join(migrations,'0001_core.sql'));
  const config={name:WORKERS[1],account_id:ACCOUNT,compatibility_date:'2026-07-03',workers_dev:false,routes:[],d1_databases:[{binding:'REPORTS_DB',database_name:DB_NAME,database_id:STAGING_DB,migrations_dir:'migrations'}]};
  const path=join(LOCAL,'wrangler.migration.json');writeFileSync(path,JSON.stringify(config,null,2)+'\n');return path;
}
export function wrangler(args,config,logName) {
  const cfg=JSON.parse(readFileSync(config,'utf8'));
  state();
  if(cfg.account_id!==ACCOUNT||!WORKERS.includes(cfg.name)||cfg.routes?.length||cfg.d1_databases?.length!==1||cfg.d1_databases[0].database_id!==STAGING_DB||cfg.d1_databases[0].database_name!==DB_NAME||cfg.services?.some(s=>!WORKERS.includes(s.service)))throw Error('WRANGLER_STAGING_GUARD');
  const exact=v=>JSON.stringify(args)===JSON.stringify(v);
  let allowed=exact(['deploy'])||exact(['secret','bulk',join(LOCAL,'staging-secrets.json')])||exact(['d1','migrations','apply',DB_NAME,'--remote'])||exact(['d1','time-travel','info',DB_NAME,'--json'])||exact(['deployments','list','--json']);
  if(args.length===7&&args.slice(0,4).join('|')===['d1','time-travel','info',DB_NAME].join('|')&&args[4]==='--timestamp'&&/^2026-09-26T\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(args[5])&&args[6]==='--json')allowed=true;
  if(args.length===7&&args.slice(0,4).join('|')===['d1','time-travel','restore',DB_NAME].join('|')&&args[4]==='--bookmark'&&/^[0-9a-f-]{20,100}$/.test(args[5])&&args[6]==='--json')allowed=true;
  if(args.length===5&&args[0]==='rollback'&&args[2]==='--yes'&&args[3]==='--message'&&args[4]==='Phase2C staging rehearsal') {
    const history=JSON.parse(readFileSync(join(LOCAL,'worker-deployments.json'),'utf8'));
    allowed=history.some(v=>v.worker===cfg.name&&v.version===args[1]&&v.mode==='READ_ONLY_MAINTENANCE'&&v.peer===true&&v.binding_confirmed);
  }
  if(!allowed)throw Error('COMMAND_NOT_IN_STAGING_ALLOWLIST');
  const binary=join(process.env.LOCALAPPDATA,'npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js');
  const result=spawnSync(process.execPath,[binary,...args,'--config',config],{cwd:ROOT,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(LOCAL,logName+'.debug.log')},input:'y\n',encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});
  writeFileSync(join(LOCAL,logName+'.log'),(result.stdout||'')+(result.stderr||''));
  if(result.status!==0)throw Error('WRANGLER_FAILED '+logName+': '+(result.stderr||'').slice(-1600));return result.stdout;
}
