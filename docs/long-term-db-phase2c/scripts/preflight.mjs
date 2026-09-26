// Read-only Cloudflare preflight. Never creates, updates, deletes, exports or restores resources.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const ACCOUNT='1d697c22a32447b386b9fac6a3538597';
export const PRODUCTION_DB='b48201cc-0abd-4a64-bb61-9dd2a7813d21';
const productionWorkers=['birdmap-reports','birdmap-reports-admin'];
const auth=readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
const token=/^oauth_token\s*=\s*"([^"]+)"/m.exec(auth)?.[1];
if(!token)throw Error('Cloudflare login required; never print credentials');
async function read(path,query) {
  if(!path.startsWith('/'))throw Error('Invalid read path');
  // This one fixed POST is semantically read-only. No arbitrary SQL or account mutations accepted.
  if(query&&path!==`/d1/database/${PRODUCTION_DB}/query`)throw Error('Read-only guard');
  const sql="SELECT COUNT(*) total,SUM(status='approved') approved,SUM(status='rejected') rejected,SUM(status='pending') pending FROM reports";
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`,{method:query?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:query?JSON.stringify({sql}):undefined});
  const data=await r.json();return {http_status:r.status,success:data.success,result:data.result,errors:(data.errors||[]).map(e=>({code:e.code,message:e.message})),result_info:data.result_info};
}
const named=(result,mapper)=>({...result,result:result.success?(result.result||[]).map(mapper):undefined});
const databaseInfo=await read('/d1/database?per_page=100');
const scripts=await read('/workers/scripts');
const access=await read('/access/apps?per_page=100');
const subdomain=await read('/workers/subdomain');
const production={database:await read(`/d1/database/${PRODUCTION_DB}`),counts:await read(`/d1/database/${PRODUCTION_DB}/query`,true),workers:{}};
for(const name of productionWorkers) {
  const settings=await read(`/workers/scripts/${name}/settings`),deployments=await read(`/workers/scripts/${name}/deployments`);
  const binding=(settings.result?.bindings||[]).map(b=>({name:b.name,type:b.type,...(b.type==='d1'?{database_id:b.id}:{}),...(b.type==='service'?{service:b.service,environment:b.environment}:{} )}));
  production.workers[name]={settings_http:settings.http_status,bindings:binding,deployments};
}
const output={checked_at:new Date().toISOString(),account_id:ACCOUNT,
  databases:named(databaseInfo,d=>({uuid:d.uuid,name:d.name,created_at:d.created_at})),
  scripts:named(scripts,s=>({id:s.id,modified_on:s.modified_on})),
  access:{http_status:access.http_status,success:access.success,errors:access.errors,app_count:access.success?access.result.length:null,staging_apps:access.success?access.result.filter(a=>/staging|phase2c/i.test(a.name||'')).map(a=>({id:a.id,name:a.name,domain:a.domain})):[]},
  subdomain,production};
// Avoid persisting database internals other than resource metadata and aggregate counts.
if(production.database.success)production.database.result=Object.fromEntries(['uuid','name','created_at','version','num_tables','file_size','running_in_region'].filter(k=>production.database.result[k]!==undefined).map(k=>[k,production.database.result[k]]));
const outputDir=new URL('../.local/',import.meta.url);mkdirSync(outputDir,{recursive:true});
const followup=process.argv[2];if(followup&&!['resume','end'].includes(followup))throw Error('INVALID_EVIDENCE_LABEL');
writeFileSync(new URL(followup?`cloudflare-${followup}.json`:'cloudflare-preflight.json',outputDir),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({checked_at:output.checked_at,account_id:ACCOUNT,production_counts:production.counts.result,production_worker_versions:Object.fromEntries(Object.entries(production.workers).map(([name,w])=>[name,w.deployments.result?.deployments?.[0]?.versions||w.deployments.result?.[0]?.versions||null])),output_file:followup?`cloudflare-${followup}.json`:'cloudflare-preflight.json'},null,2));
