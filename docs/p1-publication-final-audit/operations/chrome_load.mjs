import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,process.env.PUBLICATION_TEST_OUTPUT||'docs/p1-publication-final-audit/operations/chrome-load'); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
mkdirSync(OUT,{recursive:true});
const HTML=process.env.PUBLICATION_TEST_INDEX_REF?execFileSync('git',['show',process.env.PUBLICATION_TEST_INDEX_REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}):readFileSync(join(ROOT,'index.html'),'utf8');
const widths=process.env.PUBLICATION_TEST_WIDTHS?process.env.PUBLICATION_TEST_WIDTHS.split(',').map(Number):[344,375,768,1024,1440];
const allowedCDN=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];
const network={allowedLocal:0,allowedDependencyGet:0,blockedOther:0,operatingRequests:0,externalNonGet:0};
const rows=[],browserErrors=[];
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server=createServer((req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=resolve(ASSET_ROOT,'.'+(p==='/'?'/index.html':p));
 if(req.method!=='GET'||!(target.startsWith(ASSET_ROOT+'\\')||target.startsWith(ASSET_ROOT+'/'))){res.writeHead(403);res.end('blocked');return;}
 try{const body=target===join(ASSET_ROOT,'index.html')?Buffer.from(HTML,'utf8'):readFileSync(target);res.writeHead(200,{'Content-Type':extname(target)==='.html'?'text/html;charset=utf-8':extname(target)==='.json'?'application/json':'application/octet-stream','Cache-Control':'no-store'});res.end(body);}
 catch{res.writeHead(404);res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;

function hook(){
 const realFetch=window.fetch.bind(window),fine=window.matchMedia.bind(window);
 const id='11111111-1111-4111-8111-111111111111';
 const upd=(extra={})=>Object.assign({id:(window.__mock&&window.__mock.id)||id,species:'직박구리',count:1,status:'visible',lat:37,lon:127,nickname:'합성검증',note:'',updatedAt:new Date().toISOString(),firstSeenAt:new Date().toISOString(),lastConfirmedAt:null,confirmCount:0,history:[],rowRevision:'1',expiresAt:new Date(Date.now()+3*3600000).toISOString()},extra);
 const spot=(extra={})=>Object.assign({id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[{species:['직박구리'],date:new Date().toISOString().slice(0,10),reporter:'합성검증'}],locationHidden:false},extra);
 const m=window.__mock={
   id,upd,spot,revision:'1',epoch:'11111111111141118111111111111111',field:[upd()],approved:[spot()],
   pendingSpots:[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}],
   actions:[],geo:[],watches:new Map(),watchSeq:0,offline:false,
   headOverride:null,headHangs:false,dataApprovedOverride:null,dataFieldOverride:null,
   headAfterData:null,deferApproved:false,deferredApproved:[],deferField:false,deferredField:[],
 };
 try{const preset=JSON.parse(sessionStorage.getItem('publication-test-preset')||'null');if(preset)Object.assign(m,preset);}catch{}
 const pub=(u,override)=>Object.assign({contract:'publication-v1',epoch:m.epoch,revision:m.revision,projection:'legacy-public-v1',nonce:u.searchParams.get('nonce')},override||{});
 const reply=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
 const data=(u,body,override)=>Object.assign({ok:true,serverTime:new Date().toISOString()},body,{publication:pub(u,override)});
 const productFetch=(input,options={})=>{
   const u=new URL(String(input),location.href),method=options.method||'GET';
   if(u.hostname.endsWith('workers.dev')){
     m.actions.push({path:u.pathname,method,nonce:u.searchParams.get('nonce'),expectedRevision:u.searchParams.get('expectedRevision'),contract:u.searchParams.get('contract'),cache:options.cache||null});
     if(m.offline)return Promise.reject(new Error('Synthetic network outage'));
     if(u.pathname==='/reports/public-state'){if(m.headHangs)return new Promise(()=>{});const response=reply(data(u,{},m.headOverride));if(m.deferHead)return new Promise(resolve=>(m.deferredHead||(m.deferredHead=[])).push({resolve:()=>response.then(resolve)}));return m.headDelayMs?new Promise(resolve=>setTimeout(()=>response.then(resolve),m.headDelayMs)):response;}
     if(method==='GET'&&u.searchParams.has('expectedRevision')&&(u.searchParams.get('expectedRevision')!==m.revision||u.searchParams.get('expectedEpoch')!==m.epoch))return reply({ok:false,error:'PUBLICATION_CHANGED'},409);
     const after=()=>{if(m.headAfterData){Object.assign(m,m.headAfterData);m.headAfterData=null;}};
     if(u.pathname==='/field-updates'&&method==='GET'){
       const o=m.dataFieldOverride,b=data(u,{updates:o?o.updates:m.field,ttlHours:3},o?o.publication:null);
       after();if(m.deferField)return new Promise(resolve=>m.deferredField.push({body:b,resolve:body=>reply(body||b).then(resolve)}));return reply(b);
     }
     if(/\/field-updates\/[^/]+\/delete$/.test(u.pathname)){m.field=[];m.revision=String(BigInt(m.revision)+1n);return reply({ok:true});}
     if(/\/field-updates\/[^/]+\/(status|confirm)$/.test(u.pathname)){
       const payload=JSON.parse(options.body||'{}');
       const prev=m.field[0];if(!prev)return reply({ok:false,error:'not found'},404);
       const next=upd(Object.assign({},prev,{status:payload.status||prev.status,confirmCount:prev.confirmCount+1,rowRevision:String(BigInt(prev.rowRevision||'1')+1n)}));
       m.field=[next];m.revision=String(BigInt(m.revision)+1n);return reply({ok:true,id:next.id,status:next.status});
     }
     if(u.pathname==='/reports/approved'){
       const o=m.dataApprovedOverride,b=data(u,{spots:o?o.spots:m.approved,fixedSpots:{}},o?o.publication:null);
       after();if(m.deferApproved)return new Promise(resolve=>m.deferredApproved.push({body:b,resolve:body=>reply(body||b).then(resolve)}));return reply(b);
     }
     if(u.pathname==='/reports/pending')return reply(data(u,{spots:m.pendingSpots}));
     if(u.pathname==='/reports/recent-sites')return reply(data(u,{sites:[]}));
     if(u.pathname.startsWith('/reports/site/'))return reply(data(u,{history:[],total:0}));
     if(u.pathname==='/contributors/monthly')return reply(data(u,m.monthly||{month:'2026-10',approvedReports:0,publicContributors:0,contributors:[]}));
     if(u.pathname==='/reports/capabilities')return reply({ok:true,capabilities:{pendingPublic:true}});
     return reply({ok:true});
   }
   if(u.origin===location.origin&&method==='GET')return realFetch(input,options);
   return Promise.reject(new Error('Blocked non-local fetch'));
 };
 m.requestLog=[];m.phase='bootstrap';m.rttMs=75;m.visibilityLog=[];m.samples=[];m.invalidations=[];
 document.addEventListener('visibilitychange',()=>m.visibilityLog.push({at:performance.now(),state:document.visibilityState,hidden:document.hidden,phase:m.phase}));
 window.fetch=(input,options={})=>{
  const u=new URL(String(input),location.href);if(!u.hostname.endsWith('workers.dev'))return productFetch(input,options);
  const row={ordinal:m.requestLog.length+1,at:performance.now(),phase:m.phase,path:u.pathname,method:options.method||'GET',visibility:document.visibilityState,hidden:document.hidden,cache:options.cache||null};m.requestLog.push(row);
  const delay=m.rttMs;
  return productFetch(input,options).then(r=>new Promise(resolve=>setTimeout(()=>{row.completedAt=performance.now();row.status=r.status;resolve(r);},delay)),error=>new Promise((resolve,reject)=>setTimeout(()=>{row.completedAt=performance.now();row.error=String(error.message);reject(error);},delay)));
 };
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
   getCurrentPosition:(ok,error)=>m.geo.push({ok,error}),
   watchPosition:(ok,error)=>{const id=++m.watchSeq;m.watches.set(id,{ok,error});return id;},
   clearWatch:id=>m.watches.delete(id)
 }});
 window.matchMedia=query=>query.includes('pointer:fine')?{matches:innerWidth>768,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:fine(query);
 Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true});
 window.confirm=()=>true;
 window.turnstile={render:(host,options)=>{setTimeout(()=>options.callback('synthetic-token'),0);return 'synthetic-widget';},reset(){}};
}

class CDP{
 constructor(proc,socket,profile){this.proc=proc;this.socket=socket;this.profile=profile;this.seq=0;this.pending=new Map();this.events=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else for(const h of this.events)h(m);});}
 send(method,params={},sessionId){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
 async page(width,preset,browserContextId){
  const {targetId}=await this.send('Target.createTarget',{url:'about:blank',browserContextId,background:false});
  const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
  await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);await this.send('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
  await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<769},sessionId);
  await this.send('Emulation.setTouchEmulationEnabled',{enabled:width<769},sessionId);
  await this.send('Network.setUserAgentOverride',{userAgent:width<769?'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36'},sessionId);
  await this.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
  this.events.push(async m=>{
   if(m.sessionId!==sessionId)return;
   if(m.method==='Fetch.requestPaused'){
    const u=new URL(m.params.request.url),method=m.params.request.method;
    let allowed=method==='GET'&&(u.origin===origin||allowedCDN.includes(u.hostname));
    if(u.hostname.endsWith('workers.dev')){network.operatingRequests++;allowed=false;}
    if(method!=='GET'&&u.origin!==origin)network.externalNonGet++;
    if(allowed){u.origin===origin?network.allowedLocal++:network.allowedDependencyGet++;await this.send('Fetch.continueRequest',{requestId:m.params.requestId},sessionId).catch(()=>{});}
    else{network.blockedOther++;await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
   }
   if(m.method==='Runtime.exceptionThrown')browserErrors.push({width,text:m.params.exceptionDetails.text,description:String(m.params.exceptionDetails.exception?.description||'').split('\n')[0]});
  });
  const pre=preset?'sessionStorage.setItem("publication-test-preset",'+JSON.stringify(JSON.stringify(preset))+');':'';
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:pre+'('+hook.toString()+')()'},sessionId);
  const evaluate=async expression=>{const r=await this.send('Runtime.evaluate',{expression:'(async function(){var v=await eval('+JSON.stringify(expression)+');try{return JSON.parse(JSON.stringify(v));}catch{return null;}})()',awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').split('\n')[0]);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/index.html'},sessionId);
  const until=Date.now()+40000;let ready=false;
  while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof fieldMarkers!=='undefined'&&typeof publicationFetch==='function'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===190").catch(()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error('Actual Leaflet/publication page initialization unavailable');
  return {evaluate,sessionId,targetId,browserContextId,close:()=>this.send('Target.closeTarget',{targetId})};
 }
 async dispose(){try{this.socket.close();}catch{}this.proc.kill();await new Promise(r=>setTimeout(r,250));try{const checked=resolve(this.profile),prefix=resolve(tmpdir(),'birdmap-publication-cdp-');if(checked!==this.profile||!checked.startsWith(prefix))throw new Error('Temporary profile path outside approved prefix');rmSync(checked,{recursive:true,force:true});}catch{}}
}
const profile=mkdtempSync(join(tmpdir(),'birdmap-publication-cdp-'));
const proc=spawn(chrome,['--headless=new','--remote-debugging-port=0','--disable-gpu','--hide-scrollbars','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='';
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome DevTools unavailable')),30000);proc.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/ws:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0]);}});proc.on('error',reject);});
const ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r));
const browser=new CDP(proc,ws,profile);

// Product timers and policy constants remain unchanged. Only API responses are mocked with a measured 75 ms RTT.
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const cohorts=[],safety=[];
const sourceSha=process.env.PUBLICATION_TEST_INDEX_REF||'working-tree';
const snapshotExpr="({at:performance.now(),visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus(),ready:publicationState.ready,allowed:publicationAllowed(),approved:Object.keys(reportSpotLayers).length,pending:Object.keys(reportPendingLayers).length,fields:Object.keys(fieldMarkers).length,fieldData:fieldUpdates.length,siteCount:siteData.length,headInFlight:!!publicationHeadPromise,generation:publicationState.generation})";
const check=(cohort,id,passed,evidence)=>safety.push({cohort,id,pass:passed===true,evidence});
async function parallel(pages,expr){return Promise.all(pages.map(p=>p.evaluate(expr)));}
async function phase(pages,name){return parallel(pages,"__mock.phase="+JSON.stringify(name)+";performance.now()");}
async function observe(pages,name,milliseconds){
 const start=await phase(pages,name),wallStart=new Date().toISOString();await pause(milliseconds);
 const snapshots=await parallel(pages,snapshotExpr),end=snapshots.map(x=>x.at);return {name,wallStart,wallEnd:new Date().toISOString(),start,end,durationMs:end.map((x,i)=>x-start[i]),snapshots};
}
async function collect(pages){return parallel(pages,"({requests:__mock.requestLog,samples:__mock.samples,invalidations:__mock.invalidations,visibilityChanges:__mock.visibilityLog})");}
function summarize(records,phases,n){
 const phaseRows={};for(const p of phases){const entries=records.flatMap((r,index)=>r.requests.filter(x=>x.phase===p.name).map(x=>({...x,client:index}))),endpoints={};for(const x of entries){const k=x.path;endpoints[k]=(endpoints[k]||0)+1;}
 const avgDuration=p.durationMs.reduce((a,b)=>a+b,0)/n,perUser=entries.length/n;
 phaseRows[p.name]={durationMsMean:avgDuration,durationMsMin:Math.min(...p.durationMs),durationMsMax:Math.max(...p.durationMs),requests:entries.length,endpoints,perUser,allRequestVisibility:entries.every(x=>!x.hidden&&x.visibility==='visible'),hiddenRequestCount:entries.filter(x=>x.hidden).length,completed:entries.filter(x=>x.completedAt!==undefined).length,errors:entries.filter(x=>x.error).length,statuses:entries.reduce((a,x)=>{const k=x.error?'network-error':String(x.status||'pending');a[k]=(a[k]||0)+1;return a;},{}),measuredRttMsMean:entries.filter(x=>x.completedAt!==undefined).reduce((a,x)=>a+x.completedAt-x.at,0)/Math.max(1,entries.filter(x=>x.completedAt!==undefined).length),workerRequestsPerUserHour:perUser*3600000/avgDuration,workerRequestsPerUserContinuousDay:perUser*86400000/avgDuration};
 }
 const startup=records.map(r=>r.requests.filter(x=>x.phase==='bootstrap')),allBootstrap=startup.flat(),initialEndpoints={};for(const x of allBootstrap)initialEndpoints[x.path]=(initialEndpoints[x.path]||0)+1;
 return {phaseRows,bootstrap:{total:allBootstrap.length,perUserMean:allBootstrap.length/n,perUserCounts:startup.map(r=>r.length),endpoints:initialEndpoints},waitingOtherClientsRequests:records.reduce((a,r)=>a+r.requests.filter(x=>x.phase==='waiting-other-clients').length,0),invalidations:records.reduce((a,r)=>{for(const x of r.invalidations)a[x.reason]=(a[x.reason]||0)+1;return a;},{}),steadySamples:records.flatMap((r,index)=>r.samples.filter(x=>x.phase==='steady-foreground').map(x=>({...x,client:index}))),runtimeEndpointsAll:records.flatMap(r=>r.requests).reduce((a,x)=>{a[x.path]=(a[x.path]||0)+1;return a;},{})};
}
try{
 for(const count of [10,20]){
  const pages=[],contexts=[],phases=[],backgroundTabs=[];console.log('START cohort '+count+' '+new Date().toISOString());
  try{
   // Separate incognito browser contexts give each synthetic user its own storage, page, timers and authority cache.
   for(let offset=0;offset<count;offset+=4){await Promise.all(Array.from({length:Math.min(4,count-offset)},(_,j)=>(async()=>{
    const context=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});contexts.push(context.browserContextId);
    const page=await browser.page((offset+j)%2?375:1440,null,context.browserContextId);page.client=offset+j;pages.push(page);
    const until=Date.now()+12000;let ready=false;while(Date.now()<until){ready=await page.evaluate("publicationState.ready&&Object.keys(reportSpotLayers).length===1&&Object.keys(fieldMarkers).length===1&&!publicationRefreshPromise");if(ready)break;await pause(75);}
    if(!ready)throw new Error('Bootstrap authorization never became ready');
    await page.evaluate("(function(){var old=publicationInvalidate;publicationInvalidate=function(reason){__mock.invalidations.push({at:performance.now(),reason:reason||null,phase:__mock.phase});return old.apply(this,arguments);};__mock.sampleTimer=setInterval(function(){__mock.samples.push({at:performance.now(),phase:__mock.phase,visibility:document.visibilityState,hidden:document.hidden,ready:publicationState.ready,allowed:publicationAllowed(),approved:Object.keys(reportSpotLayers).length,fields:Object.keys(fieldMarkers).length});},250);__mock.phase='waiting-other-clients';return true;})()");
   })()));}
   pages.sort((a,b)=>a.client-b.client);
   const initial=await parallel(pages,snapshotExpr);check(count,'isolated-contexts-visible-190-normal',new Set(pages.map(x=>x.browserContextId)).size===count&&initial.every(x=>x.siteCount===190&&!x.hidden&&x.visibility==='visible'&&x.focus),initial);
   phases.push(await observe(pages,'steady-foreground',65000));console.log('STEADY complete '+count+' '+new Date().toISOString());
   // Deactivate the focus override and activate a real sibling tab in each context. Read document.hidden; do not fake the property.
   await phase(pages,'background');for(const p of pages){await browser.send('Emulation.setFocusEmulationEnabled',{enabled:false},p.sessionId);const tab=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:p.browserContextId,background:false});backgroundTabs.push(tab.targetId);await browser.send('Target.activateTarget',{targetId:tab.targetId});}
   const backgroundInitial=await parallel(pages,snapshotExpr);check(count,'actual-background-document-state',backgroundInitial.every(x=>x.hidden&&x.visibility==='hidden'),backgroundInitial);
   phases.push(await observe(pages,'background',12000));const backgroundCounts=await parallel(pages,"__mock.requestLog.filter(x=>x.phase==='background').length");check(count,'background-stops-publication-requests',backgroundCounts.every(x=>x===0),backgroundCounts);
   await phase(pages,'visibility-return');await Promise.all(pages.map(p=>browser.send('Emulation.setFocusEmulationEnabled',{enabled:true},p.sessionId)));phases.push(await observe(pages,'visibility-return',12000));
   const returned=await parallel(pages,snapshotExpr);check(count,'visibility-return-revalidates',returned.every(x=>!x.hidden&&x.visibility==='visible'&&x.allowed&&x.approved===1&&x.fields===1),returned);
   await phase(pages,'interaction-contributors-history');await parallel(pages,"Promise.all([loadContributors(),fetchSiteHistory(siteData[0],0)])");phases.push(await observe(pages,'interaction-contributors-history',1500));
   await phase(pages,'latency-lease-expiry');await parallel(pages,"__mock.rttMs=1500;true");phases.push(await observe(pages,'latency-lease-expiry',11000));
   await parallel(pages,"__mock.rttMs=75;true");
   await phase(pages,'authority-hide');await parallel(pages,"__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})];true");phases.push(await observe(pages,'authority-hide',6500));
   const hidden=await parallel(pages,"({approvedExact:reportSearchIndex.some(x=>x.lat===37&&x.lon===127),fieldPoint:!!fieldPublicPoint(fieldFind(__mock.id)),guide:!!fieldGuide,choice:!!document.getElementById('fieldNavChoice')})");check(count,'hide-no-exact-navigation',hidden.every(x=>!x.approvedExact&&!x.fieldPoint&&!x.guide&&!x.choice),hidden);
   await phase(pages,'authority-delete');await parallel(pages,"__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[];__mock.field=[];__mock.pendingSpots=[];true");phases.push(await observe(pages,'authority-delete',6500));
   const deleted=await parallel(pages,"Object.keys(reportSpotLayers).length===0&&Object.keys(fieldMarkers).length===0&&fieldUpdates.length===0");check(count,'delete-remains-closed',deleted.every(Boolean),deleted);
   await phase(pages,'normal-restore');await parallel(pages,"__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[__mock.spot()];__mock.field=[__mock.upd()];true");phases.push(await observe(pages,'normal-restore',6500));
   const normal=await parallel(pages,snapshotExpr);check(count,'explicit-authority-restores',normal.every(x=>x.approved===1&&x.fields===1&&x.allowed),normal);
   await phase(pages,'network-failure');await parallel(pages,"__mock.offline=true;true");phases.push(await observe(pages,'network-failure',6500));const failed=await parallel(pages,snapshotExpr);check(count,'network-failure-closes-all-dynamic',failed.every(x=>!x.allowed&&x.approved===0&&x.fields===0),failed);
   await phase(pages,'network-recovery');await parallel(pages,"__mock.offline=false;__mock.revision=String(BigInt(__mock.revision)+1n);true");phases.push(await observe(pages,'network-recovery',6500));const recovered=await parallel(pages,snapshotExpr);check(count,'network-recovery-restores',recovered.every(x=>x.approved===1&&x.fields===1&&x.allowed),recovered);
   const records=await collect(pages),summary=summarize(records,phases,count);
   const cohort={users:count,actualDistinctContexts:new Set(pages.map(x=>x.browserContextId)).size,phaseBounds:phases,records,summary};cohorts.push(cohort);
   writeFileSync(join(OUT,'cohort-'+count+'.json'),JSON.stringify(cohort,null,2)+'\n');console.log(JSON.stringify({users:count,summary:{bootstrap:summary.bootstrap,phases:summary.phaseRows,invalidations:summary.invalidations},safety:safety.filter(x=>x.cohort===count).map(x=>({id:x.id,pass:x.pass}))},null,2));
  }catch(error){check(count,'environment-or-harness',false,{error:String(error.stack)});const records=await collect(pages).catch(()=>[]);writeFileSync(join(OUT,'cohort-'+count+'-failed.json'),JSON.stringify({error:String(error.stack),usersStarted:pages.length,records},null,2)+'\n');}
  finally{for(const p of pages)await p.close().catch(()=>{});for(const id of backgroundTabs)await browser.send('Target.closeTarget',{targetId:id}).catch(()=>{});for(const id of contexts)await browser.send('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});}
 }
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'birdmap-publication-concurrency-load-v1',sourceInput:sourceSha,assetsInput:process.env.PUBLICATION_TEST_ASSET_REF,indexSha256:createHash('sha256').update(HTML).digest('hex'),checkedAt:new Date().toISOString(),method:'10 and 20 isolated actual Chrome contexts with CDP virtual focus making real document.visibilityState visible; API RTT 75ms; product timers unchanged; >=65 seconds steady per cohort',baselineUserProvided:{periodHours:24,d1Queries:1230,d1RowsRead:58000,d1RowsWritten:496,databaseMB:1.44,workerPlan:'Free',note:'User-provided aggregate; D1 queries are not Worker HTTP requests. No observed increase may be equated directly with this query count.'},cohortSummaries:cohorts.map(x=>({users:x.users,summary:x.summary,phaseBounds:x.phaseBounds})),safety,summary:{pass:safety.filter(x=>x.pass).length,fail:safety.filter(x=>!x.pass).length},network,browserErrors,limits:['No operating API requests or production D1 operations.','CDP visibility emulation isolates simultaneous foreground behavior; this is not a measured fleet of physical devices.','Native app launch and physical GPS remain mocked.','Measured Worker endpoint requests need actual per-endpoint D1 SQL metrics before calculating D1 row-read cost.','Continuous hour/day figures extrapolate 65 seconds, exclude ten-minute refresh boundary and user interactions; they are scenarios, not observed traffic.']};
writeFileSync(join(OUT,'LOAD_MANIFEST.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceSha,resultPath:join(OUT,'LOAD_MANIFEST.json'),summary:result.summary,network,browserExceptions:browserErrors.length},null,2));process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
