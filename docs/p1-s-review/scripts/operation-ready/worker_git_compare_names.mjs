import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const [out,root]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const account=JSON.parse(fs.readFileSync(path.join(root,'reports-api/.wrangler/cache/wrangler-account.json'),'utf8')).account.id,worker='birdmap-reports',ids=['494b97d1-69ab-40f7-bbbf-e8c6e3c5effc','16dae92a-4bd7-4fda-ba90-d5075604d4db'];
let token=/^oauth_token\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'))?.[1];if(!token)throw Error('Authentication unavailable');
const sha=x=>createHash('sha256').update(x).digest('hex');
const result={startedAt:new Date().toISOString(),requests:[],builds:[],source:null,rawSourceSaved:false,onlyGET:true};
const allowed=new Set(['content/v2','deployments',...ids.map(id=>'versions/'+id)]);
async function get(sub){if(!allowed.has(sub))throw Error('Endpoint denied');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker+'/'+sub,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});const bytes=new Uint8Array(await r.arrayBuffer());result.requests.push({sub,status:r.status,bytes:bytes.length,sha256:sha(bytes)});if(!r.ok)return null;return{bytes,headers:r.headers,json:()=>JSON.parse(new TextDecoder().decode(bytes))};}
const before=await get('deployments');result.beforeDeployment=before?.json().result?.deployments?.[0];
const metadata=[];for(const id of ids){const r=await get('versions/'+id);if(r){const d=r.json().result;metadata.push({id:d.id,etag:d.resources?.script?.etag,created_on:d.metadata?.created_on});}}result.versionFingerprints=metadata;
const r=await get('content/v2');if(!r)throw Error('Current source GET failed');
const form=await new Response(r.bytes,{headers:{'content-type':r.headers.get('content-type')}}).formData();const file=[...form.values()].find(x=>typeof x!=='string'&&x.name==='public.js');if(!file)throw Error('Source module unavailable');const text=await file.text();
const norm=s=>s.replace(/\r\n/g,'\n').replace(/^\/\/# sourceMappingURL=.*$/mg,'').trimEnd();
result.source={sha256:sha(text),normalizedSHA256:sha(norm(text)),bytes:Buffer.byteLength(text),mapReferenceKind:text.match(/sourceMappingURL=(.*)/)?.[1]?.startsWith('data:')?'inline':'external-or-none'};
const candidates=['41650e4','840b3a4','068cd7b','18171613923ae5cf0a72512eae805c0005037115','dc6f0e58a709e82d689e36ce2dc4b857e285821e','b12e20c1b6d856a021898a0c1c9221b30393a221'];
const req=createRequire(import.meta.url);
const esbuild=req('C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/esbuild');
const reportRoot=path.join(root,'reports-api');
for(const ref of candidates){const gitsha=execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim();
 const plugins=[{name:'read-git',setup(build){build.onResolve({filter:/^\.|^[A-Za-z]:[\\/]/},args=>({path:path.isAbsolute(args.path)?args.path:path.resolve(args.resolveDir||path.dirname(args.importer),args.path)}));build.onLoad({filter:/.*/},args=>{const relative=path.relative(reportRoot,args.path).replaceAll('\\','/');if(relative.startsWith('..'))throw Error('Outside reports-api');return {contents:execFileSync('git',['show',gitsha+':reports-api/'+relative],{cwd:root,encoding:'utf8'}),loader:'js',resolveDir:path.dirname(args.path)};});}}];
 try{const b=await esbuild.build({entryPoints:['src/public.js'],absWorkingDir:reportRoot,outfile:'public.js',write:false,bundle:true,format:'esm',platform:'neutral',target:'es2022',conditions:['workerd','worker','browser'],sourcemap:'external',legalComments:'none',keepNames:true,plugins,metafile:true});
 const code=b.outputFiles.find(f=>f.path.endsWith('/public.js')||f.path.endsWith('\\public.js')).text;
 result.builds.push({ref,gitsha,esbuildVersion:esbuild.version,sha256:sha(code),normalizedSHA256:sha(norm(code)),byteEqual:code===text,normalizedEqual:norm(code)===norm(text),bytes:Buffer.byteLength(code),sourceBlobIds:Object.fromEntries(Object.keys(b.metafile.inputs).map(p=>[p,execFileSync('git',['rev-parse',gitsha+':reports-api/'+p],{cwd:root,encoding:'utf8'}).trim()]))});
 }catch(e){result.builds.push({ref,gitsha,errorType:e.name,error:'LOCAL_BUILD_FAILED'});}
}
function functionText(code,name){const pos=code.indexOf('function '+name+'(');if(pos<0)return null;let start=code.indexOf('{',pos),depth=0;for(let i=start;i<code.length;i++){if(code[i]==='{')depth++;else if(code[i]==='}'&&--depth===0)return code.slice(pos,i+1);}return null;}
const sensitive=functionText(text,'isSensitiveReport'), normalize=functionText(text,'normalizeSpecies');
result.source.protectionFunctionHashes={isSensitiveReport:sensitive?sha(sensitive):null,normalizeSpecies:normalize?sha(normalize):null};
try {const m=await import('data:text/javascript;base64,'+Buffer.from(text+'\nexport {isSensitiveReport, normalizeSpecies};').toString('base64'));
result.source.syntheticProtectionCases=['저어새','저어새1','저어새 1','저어새 2마리','흰꼬리수리1','매1','갈매기','알락오리','알락할미새','동박새','한국동박새','직박구리\n저어새1','직박구리/저어새1'].map(species=>({input:species,sensitive:m.isSensitiveReport({species})}));}catch(e){result.source.syntheticErrorType=e.name;}
const after=await get('deployments');result.afterDeployment=after?.json().result?.deployments?.[0];token=null;
for(const k of ['beforeDeployment','afterDeployment'])if(result[k])result[k]={id:result[k].id,created_on:result[k].created_on,versions:result[k].versions};
result.endedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'worker_git_source_comparison_names.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({builds:result.builds.map(({sourceBlobIds,...b})=>b),source:result.source,requests:result.requests.map(({sha256,...r})=>r)}));
