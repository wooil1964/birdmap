// Usage: node benchmark.mjs <Miniflare node_modules> <output directory> [repeat count=20]
// Ephemeral local workerd + native D1 only. No production database, credentials or deployment.
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const modules=resolve(process.argv[2]),out=resolve(process.argv[3]),repeats=Number(process.argv[4]||20);
assert.ok(Number.isSafeInteger(repeats)&&repeats>=1);mkdirSync(out,{recursive:true});
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(join(modules,'miniflare')),{build}=require(join(modules,'esbuild'));
const bundle=(await build({entryPoints:[fileURLToPath(new URL('./benchmark-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks']})).outputFiles[0].text;
const hash=value=>createHash('sha256').update(value).digest('hex');
function nativeProcessIds(){
  if(process.platform!=='win32')return [];
  const command="@((Get-CimInstance Win32_Process -Filter \"ParentProcessID = "+process.pid+" AND Name = 'workerd.exe'\").ProcessId) | ConvertTo-Json -Compress";
  const value=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:10000}).trim()||'[]');
  return Array.isArray(value)?value:[value];
}
function nativeMemory(ids){
  if(ids.length!==1)return {unavailable:'Expected one direct child workerd process; found '+ids.length};
  const command='Get-Process -Id '+Number(ids[0])+' | Select-Object WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress';
  return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:10000}));
}
const report={environment:{node:process.version,miniflare:require(join(modules,'miniflare/package.json')).version,workerd:require(join(modules,'workerd/package.json')).version,
  os:os.platform()+' '+os.release(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),
  compatibilityDate:'2026-07-03',compatibilityFlags:['nodejs_compat'],concurrency:1,sites:229,repeats,
  sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),reportSearchSha256:hash(readFileSync(new URL('../../reports-api/src/report-search.js',import.meta.url))),bundleSha256:hash(bundle)},
  scope:'Actual local workerd Worker isolate and native Miniflare D1; ephemeral synthetic data. Not production Cloudflare latency, CPU, billing or memory limit evidence.',
  timing:'body-consumed host wall time; anchor requests excluded. First request means first use of that query/offset in the already-started isolate. Repeats are sequential and not cached.',
  memory:'Native child workerd whole-process working set/private bytes at scenario endpoints, including Worker+D1+runtime; not per-request isolate heap or in-flight peak. Node controller heap/RSS reported separately. Optional inspector heap snapshots/GC are enabled only by REPORT_SEARCH_INSPECTOR=1; otherwise no forced GC. Memory probes excluded from response timing.',
  d1:'Native local D1 meta rows_read/rows_written/duration. duration may be zero at local millisecond resolution; never substitute a fabricated value.',samples:[],scenarios:[],failures:[]};
function ddl(input){
  const sql=input.replace(/--[^\n]*/g,''),list=[];let start=0,trigger=false,depth=0;
  for(const t of sql.matchAll(/'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_]\w*|;/g)){
    const word=t[0].toUpperCase();if(word==='TRIGGER'&&/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(sql.slice(start,t.index+word.length)))trigger=true;
    if(trigger&&(word==='BEGIN'||word==='CASE'))depth++;if(trigger&&word==='END')depth--;
    if(word===';'&&(!trigger||depth===0)){list.push(sql.slice(start,t.index+1).trim());start=t.index+1;trigger=false;depth=0;}
  }assert.equal(sql.slice(start).trim(),'');return list.filter(Boolean);
}
async function inspector(mf){
  const address=await mf.getInspectorURL(),listing=new URL('/json',address);listing.protocol='http:';
  const targets=await(await fetch(listing)).json(),target=targets.find(t=>t.title.includes('archive-benchmark'))||targets[0];
  assert.ok(target?.webSocketDebuggerUrl,'Worker inspector target unavailable');
  const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
  let seq=0;const pending=new Map();socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  function send(method){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector timeout: '+method));},5000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method}));});}
  await send('Runtime.enable');await send('HeapProfiler.enable');
  return {heap:()=>send('Runtime.getHeapUsage'),gc:()=>send('HeapProfiler.collectGarbage'),close:()=>socket.close()};
}
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];};
function range(values){values=values.filter(v=>typeof v==='number');return values.length?{min:Math.min(...values),p50:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)}:null;}
let sequence=0;
for(const count of [100,1000,10000]){
  const mf=new Miniflare(convertV4MiniflareOptions({name:'archive-benchmark',modules:true,script:bundle,compatibilityDate:'2026-07-03',compatibilityFlags:['nodejs_compat'],...(process.env.REPORT_SEARCH_INSPECTOR==='1'?{inspectorPort:0}:{}),
    d1Databases:{REPORTS_DB:'synthetic-archive-benchmark-'+count},bindings:{ENVIRONMENT:'production',REPORTS_PUBLICATION_REQUIRED:'true',FIELD_NEWS_RETIRED:'true'},d1Persist:false,host:'127.0.0.1',port:0,cf:false}));
  let inspect=null;
  try{
    const db=await mf.getD1Database('REPORTS_DB');
    const schema=readFileSync(new URL('../../reports-api/schema.sql',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../long-term-db-phase2a/migrations/0001_core.sql',import.meta.url),'utf8');
    await db.batch(ddl(schema).map(sql=>db.prepare(sql)));
    await db.batch(Array.from({length:229},(_,i)=>db.prepare("INSERT INTO sites(site_id,site_name,registry_source,registry_revision,source_record_json,created_at) VALUES(?,?,'index.html:siteData','synthetic',?,'2026-10-21')")
      .bind(String(i+1),'합성 탐조지 '+(i+1),JSON.stringify({region:'합성 공개 지역 '+i%10,description:'합성 공개 설명 '.repeat(150)}))));
    for(let start=0;start<count;start+=250){
      const statements=[db.prepare('INSERT INTO publication_writer_claim(id,ok) VALUES(1,1)')];
      for(let i=start;i<Math.min(count,start+250);i++)statements.push(db.prepare("INSERT INTO reports(id,status,species,lat,lon,public_lat,public_lon,observed_on,received_at,reporter,name_public,site_id,note,ip_hash,dedupe_hash) VALUES(?,'approved',?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind('synthetic-'+String(i).padStart(5,'0'),i%2?'직박구리':i%20?'참새 · 까치':'저어새 · 참새',37,127,i%10?null:36,i%10?null:126,'2020-01-'+String(i%28+1).padStart(2,'0'),'2026-10-01T00:00:00Z',i%3?'합성 공개 제보자 '+i:'합성 비공개 제보자 '+i,i%3?1:0,String(i%229+1),i%50?null:'합성 둥지 메모','synthetic-ip','synthetic-dedupe-'+i));
      statements.push(db.prepare('DELETE FROM publication_writer_claim WHERE id=1'));await db.batch(statements);
    }
    const nativeIds=nativeProcessIds();
    const request=async(path)=>{
      const nonce=(++sequence).toString(16).padStart(32,'0'),response=await mf.dispatchFetch('https://synthetic.test'+path+(path.includes('?')?'&':'?')+'nonce='+nonce,{headers:{Origin:'https://wooil1964.github.io'}});
      return {response,body:await response.json()};
    };
    const anchor=(await request('/reports/public-state')).body.publication;assert.ok(anchor);
    if(process.env.REPORT_SEARCH_INSPECTOR==='1'){
      try{inspect=await inspector(mf);await inspect.heap();report.environment.workerHeapAvailable=true;}catch(error){inspect?.close();inspect=null;(report.unavailableMeasurements??=[]).push({count,measurement:'Worker inspector heap',message:error.message});}
    }else report.environment.workerHeapAvailable=false;
    for(const query of ['', '참새', '없는합성종'])for(const offset of [0,20]){
      // workerd services the requested GC when it next receives a fetch. This auxiliary
      // head is outside the measured request and cannot change publication permissions.
      if(inspect)try{const gc=inspect.gc();await request('/reports/public-state');await gc;}catch(error){(report.unavailableMeasurements??=[]).push({count,measurement:'Inspector GC',message:error.message});}
      const processMemoryBefore=nativeMemory(nativeIds),begin=report.samples.length;
      for(let iteration=0;iteration<=repeats;iteration++){
        const heapBefore=inspect?await inspect.heap():null,nodeBefore=process.memoryUsage();
        const start=performance.now();
        const {response,body}=await request('/reports/search?limit=20&offset='+offset+'&q='+encodeURIComponent(query)+'&contract=publication-v1&expectedEpoch='+anchor.epoch+'&expectedRevision='+anchor.revision);
        const elapsedMs=performance.now()-start,nodeAfter=process.memoryUsage(),heapAfter=inspect?await inspect.heap():null;
        const metrics=JSON.parse(response.headers.get('X-Synthetic-Metrics')||'null');
        assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.total,query===''?count:query==='참새'?count/2:0);assert.equal(body.reports.length,Math.min(20,Math.max(0,body.total-offset)));
        assert.deepEqual(metrics.primarySessions,['first-primary']);assert.ok(metrics.queries.every(q=>q.rowsWritten===0&&typeof q.rowsRead==='number'));
        const sample={count,query:query||'(none)',offset,iteration,phase:iteration===0?'first':'repeat',elapsedMs,total:body.total,returned:body.reports.length,queries:metrics.queries,
          rowsRead:metrics.queries.reduce((n,q)=>n+q.rowsRead,0),d1DurationMs:metrics.queries.every(q=>typeof q.durationMs==='number')?metrics.queries.reduce((n,q)=>n+q.durationMs,0):null,
          workerHeapUsedBefore:heapBefore?.usedSize??null,workerHeapUsedAfter:heapAfter?.usedSize??null,workerHeapDelta:heapAfter&&heapBefore?heapAfter.usedSize-heapBefore.usedSize:null,
          nodeControllerHeapBefore:nodeBefore.heapUsed,nodeControllerHeapAfter:nodeAfter.heapUsed,nodeControllerRssAfter:nodeAfter.rss};
        report.samples.push(sample);
      }
      const samples=report.samples.slice(begin),repeated=samples.slice(1);
      report.scenarios.push({count,query:query||'(none)',offset,nativeProcessMemory:{before:processMemoryBefore,after:nativeMemory(nativeIds)},first:samples[0],repeat:{requests:repeated.length,elapsedMs:range(repeated.map(s=>s.elapsedMs)),rowsRead:range(repeated.map(s=>s.rowsRead)),
        d1DurationMs:range(repeated.map(s=>s.d1DurationMs)),workerHeapUsedAfter:range(repeated.map(s=>s.workerHeapUsedAfter)),workerHeapDelta:range(repeated.map(s=>s.workerHeapDelta)),nodeControllerRssAfter:range(repeated.map(s=>s.nodeControllerRssAfter))}});
      console.log(JSON.stringify({count,query:query||'(none)',offset,firstMs:samples[0].elapsedMs,repeatMs:report.scenarios.at(-1).repeat.elapsedMs,rowsRead:samples[0].rowsRead,heap:report.scenarios.at(-1).repeat.workerHeapUsedAfter}));
    }
  }catch(error){report.failures.push({count,measurement:'benchmark',message:error.message});process.exitCode=1;}
  finally{inspect?.close();await mf.dispose();writeFileSync(join(out,'native-d1-benchmark.json'),JSON.stringify(report,null,2));}
}
console.log(JSON.stringify({scenarios:report.scenarios.length,samples:report.samples.length,failures:report.failures}));
