// Phase2D fixed SELECT/GET allowlist. No deploy, mutation, export or restore path.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareSiteSeed} from '../../../reports-api/tools/sites-seed.mjs';
import {fingerprint} from '../../../reports-api/src/canonical/data.js';
const ACCOUNT='1d697c22a32447b386b9fac6a3538597',DB='b48201cc-0abd-4a64-bb61-9dd2a7813d21';
const workers=['birdmap-reports','birdmap-reports-admin'],label=process.argv[2]||'start';if(!['start','predestructive','end'].includes(label))throw Error('LABEL');
const root=process.cwd(),out=join(root,'docs/long-term-db-phase2d1/.local');
const git=args=>execFileSync('git',args,{encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
const getGitHub=async p=>{const r=await fetch('https://api.github.com/repos/wooil1964/birdmap/'+p,{headers:{'User-Agent':'phase2d1-readonly'}});if(!r.ok)throw Error('GITHUB_'+r.status);return r.json();};
const head=git(['rev-parse','HEAD']),latest=(await getGitHub('commits/main')).sha,c=await getGitHub(`compare/${head}...${latest}`);
const allowed=new Set(['weather_today.json','weather_week.json','tide_today.json','tide_month.json','tide_health.json']);
const drift={checked_at:new Date().toISOString(),head,remote_main:latest,ahead:c.ahead_by,behind:c.behind_by,files:c.files.map(f=>f.filename)};drift.unexpected=drift.files.filter(p=>!allowed.has(p));
writeFileSync(join(out,'remote-'+label+'.json'),JSON.stringify(drift,null,2)+'\n');
if(drift.unexpected.length){console.log(JSON.stringify({status:'PHASE_2D1_NO_GO_CODE_DRIFT',drift}));process.exit(2);}
const token=/^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'))?.[1];assert(token,'LOGIN_REQUIRED');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
async function get(p){assert(p.startsWith('/'));const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`+p,{headers});const j=await r.json();return {status:r.status,success:j.success,result:j.result,errors:j.errors?.map(e=>({code:e.code,message:e.message}))};}
async function select(sql,params=[]){assert(/^SELECT\b/i.test(sql.trim()));const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});const j=await r.json();if(!r.ok||!j.success)throw Error('SELECT_FAILED '+r.status+' '+JSON.stringify(j.errors));for(const v of j.result){assert(v.success);assert.equal(v.meta.rows_written,0);assert.equal(v.meta.changed_db,false);}return j.result[0];}
const registry=await prepareSiteSeed(readFileSync('index.html','utf8'),{capturedAt:new Date().toISOString()});
const queries={
 total:"SELECT COUNT(*) total,SUM(status='approved') approved,SUM(status='rejected') rejected,SUM(status='pending') pending,SUM(status NOT IN ('approved','rejected','pending') OR status IS NULL) unexpected_status,SUM(site_id IS NULL) site_null,MIN(received_at) first_received_at,MAX(received_at) last_received_at FROM reports",
 statuses:'SELECT status,COUNT(*) n FROM reports GROUP BY status ORDER BY status',
 site_invalid:['SELECT site_id,COUNT(*) n FROM reports WHERE site_id IS NOT NULL AND site_id NOT IN (SELECT value FROM json_each(?)) GROUP BY site_id ORDER BY site_id',[JSON.stringify(registry.sites.map(s=>s.site_id))]],
 species:"SELECT COUNT(*) total,SUM(species IS NULL) null_count,SUM(trim(species)='') empty_count,SUM(instr(species,',')>0 OR instr(species,'·')>0 OR instr(species,'/')>0 OR instr(species,';')>0 OR instr(species,char(10))>0) delimiter_candidates,MAX(length(species)) max_chars,SUM((instr(species,',')>0 OR instr(species,'·')>0 OR instr(species,'/')>0 OR instr(species,';')>0 OR instr(species,char(10))>0) AND bird_count IS NOT NULL) candidate_with_shared_count FROM reports",
 bird_count:"SELECT typeof(bird_count) storage_type,bird_count,COUNT(*) n FROM reports GROUP BY typeof(bird_count),bird_count ORDER BY bird_count",
 coordinates:"SELECT COUNT(*) total,SUM(public_lat IS NULL AND public_lon IS NULL) public_both_null,SUM((public_lat IS NULL)!=(public_lon IS NULL)) public_partial,SUM(approx_lat IS NULL AND approx_lon IS NULL) approx_both_null,SUM((approx_lat IS NULL)!=(approx_lon IS NULL)) approx_partial,SUM((lat IS NULL)!=(lon IS NULL)) actual_partial,SUM(lat IS NULL AND lon IS NULL) actual_both_null,SUM(status='approved' AND (public_lat IS NULL OR public_lon IS NULL)) approved_actual_fallback,SUM((public_lat IS NOT NULL AND abs(public_lat)>90) OR (public_lon IS NOT NULL AND abs(public_lon)>180) OR abs(lat)>90 OR abs(lon)>180) invalid_coordinate_range FROM reports",
 consent:'SELECT name_public,pending_public,COUNT(*) n FROM reports GROUP BY name_public,pending_public ORDER BY name_public,pending_public',
 spot:"SELECT COUNT(*) total,SUM(spot_key IS NULL) null_count,SUM(spot_key IS NOT NULL) nonnull_count,SUM(spot_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM reports p WHERE p.id=r.spot_key)) orphan_count,SUM(spot_key=id) self_links FROM reports r",
 dates:"SELECT SUM(observed_on IS NULL OR date(observed_on) IS NULL OR date(observed_on)!=observed_on) observed_invalid,SUM(received_at IS NULL OR julianday(received_at) IS NULL) received_invalid,SUM(decided_at IS NOT NULL AND julianday(decided_at) IS NULL) decided_invalid,SUM(decided_at IS NOT NULL AND julianday(decided_at)<julianday(received_at)) decided_before_received FROM reports",
 schema:"SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
 columns:"SELECT cid,name,type,\"notnull\" AS is_not_null,dflt_value,pk FROM pragma_table_info('reports') ORDER BY cid",
 migration_tables:"SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE '%migration%' OR name='d1_migrations') ORDER BY name"
};
const aggregate={};for(const [name,q] of Object.entries(queries)){const [sql,params]=Array.isArray(q)?q:[q,[]];aggregate[name]=await select(sql,params);}
const workerInfo={};for(const w of workers){const settings=await get(`/workers/scripts/${w}/settings`),deployments=await get(`/workers/scripts/${w}/deployments`),subdomain=await get(`/workers/scripts/${w}/subdomain`);assert(settings.success&&deployments.success);workerInfo[w]={settings_status:settings.status,bindings:settings.result.bindings.map(b=>({name:b.name,type:b.type,...(b.type==='d1'?{database_id:b.id}:{}),...(b.type==='service'?{service:b.service}:{}),...(b.type==='plain_text'&&!/EMAIL|AUD|TOKEN|SECRET|SALT|KEY/i.test(b.name)?{value:b.text}:{} )})),observability:settings.result.observability??null,deployments:deployments.result,subdomain};}
const domains=await get('/workers/domains'),database=await get(`/d1/database/${DB}`),subscription=await get('/subscriptions');
const value={at:new Date().toISOString(),scope:'production aggregate SELECT and resource GET only, no observation coordinate values/names/notes/IP hashes queried',drift,registry:{count:registry.source_count,revision:registry.registry_revision},aggregate,workers:workerInfo,domains:domains.success?domains.result.filter(d=>workers.includes(d.service)): {status:domains.status},database:database.success?Object.fromEntries(['uuid','name','created_at','version','file_size','num_tables'].filter(k=>k in database.result).map(k=>[k,database.result[k]])):{status:database.status},subscription:subscription.success?subscription.result.map(s=>({id:s.id,rate_plan:s.rate_plan?.public_name||s.rate_plan?.id,status:s.state})): {status:subscription.status},schema_fingerprint:await fingerprint(aggregate.schema.results)};
if(aggregate.migration_tables.results.some(t=>t.name==='d1_migrations'))value.migrations=await select('SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
writeFileSync(join(out,'production-'+label+'.json'),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({at:value.at,drift,counts:aggregate.total.results,registry:value.registry,columns:aggregate.columns.results.length,schemaTables:aggregate.schema.results.filter(r=>r.type==='table').map(r=>r.name),queryWrites:0,productionChanged:false}));
