import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=process.argv[2], root=process.argv[3];
fs.mkdirSync(out,{recursive:true});
const account=JSON.parse(fs.readFileSync(path.join(root,'reports-api/.wrangler/cache/wrangler-account.json'),'utf8')).account.id, worker='birdmap-reports';
const ids=['494b97d1-69ab-40f7-bbbf-e8c6e3c5effc','16dae92a-4bd7-4fda-ba90-d5075604d4db'];
let token=/^oauth_token\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'))?.[1];
if(!token)throw Error('Existing authentication unavailable');
const sha=x=>createHash('sha256').update(x).digest('hex');
const result={startedAt:new Date().toISOString(),worker,requests:[],versions:[],source:null,onlyGET:true,rawSourcePersisted:false,credentialValuesPersisted:false,secretValuesRead:false};
const allowed=new Set(['deployments','content/v2',...ids.map(id=>'versions/'+id)]);
async function get(sub){
 if(!allowed.has(sub))throw Error('Endpoint not permitted');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker+'/'+sub,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
 const bytes=new Uint8Array(await r.arrayBuffer());
 const row={sub,httpStatus:r.status,contentType:r.headers.get('content-type'),responseBytes:bytes.length,responseSHA256:sha(bytes)};
 result.requests.push(row);
 if(!r.ok){try{row.errorCodes=JSON.parse(new TextDecoder().decode(bytes)).errors?.map(e=>e.code);}catch{}return null;}
 return {bytes,headers:r.headers,json:()=>JSON.parse(new TextDecoder().decode(bytes))};
}
function dep(data){return (data?.result?.deployments||data?.result||[]).map(d=>({id:d.id,created_on:d.created_on,versions:d.versions}));}
const before=await get('deployments');result.beforeDeployments=dep(before?.json());
for(const id of ids){const r=await get('versions/'+id);if(!r)continue;const v=r.json().result;result.versions.push({id:v.id,created_on:v.metadata?.created_on,annotationsKeys:Object.keys(v.annotations||{}),resourcesKeys:Object.keys(v.resources||{}),script:v.resources?.script?Object.fromEntries(Object.entries(v.resources.script).filter(([k])=>['etag','handlers','last_deployed_from','startup_time_ms','language'].includes(k))):null});}
const r=await get('content/v2');
if(r){
 const ct=r.headers.get('content-type')||'';
 let parts=[];
 if(ct.includes('multipart/')){const form=await new Response(r.bytes,{headers:{'content-type':ct}}).formData();for(const [key,val] of form){if(typeof val==='string')parts.push({key,text:val});else parts.push({key,name:val.name,text:await val.text()});}}
 else parts=[{key:'script',text:new TextDecoder().decode(r.bytes)}];
 result.source={parts:parts.map(p=>({key:p.key,name:p.name,bytes:Buffer.byteLength(p.text),sha256:sha(p.text),functionNames:p.text.match(/(?:async )?function\s+([A-Za-z_$][\w$]*)\(/g)?.map(t=>/function\s+([A-Za-z_$][\w$]*)/.exec(t)[1])||[],S1RIdentifierPresent:p.text.includes('isProtectedSpeciesToken'),sourceMappingURLPresent:p.text.includes('sourceMappingURL')}))};
 // Raw source stays in this process. Source comparison extension is written separately before a rerun.
}
const after=await get('deployments');result.afterDeployments=dep(after?.json());token=null;
result.endedAt=new Date().toISOString();
fs.writeFileSync(path.join(out,'worker_source_metadata.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({requests:result.requests.map(r=>({sub:r.sub,status:r.httpStatus,errorCodes:r.errorCodes})),versions:result.versions,source:result.source?.parts.map(p=>({key:p.key,name:p.name,bytes:p.bytes,sha256:p.sha256,S1RIdentifierPresent:p.S1RIdentifierPresent,functionCount:p.functionNames.length})),before:result.beforeDeployments?.[0],after:result.afterDeployments?.[0]}));
