import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(process.env.BIRDMAP_LOAD_REPO||'C:/Users/김진호/.codex/worktrees/p1-free-capacity/birdmap');
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
 m.reportTimers=[];const actualInterval=window.setInterval.bind(window);window.setInterval=function(callback,ms,...args){if(ms===600000&&String(callback).includes('loadApprovedReports'))m.reportTimers.push({callback,ms,source:String(callback)});return actualInterval(callback,ms,...args);};m.requestLog=[];m.phase='bootstrap';m.rttMs=75;m.visibilityLog=[];m.samples=[];m.invalidations=[];
 document.addEventListener('visibilitychange',()=>m.visibilityLog.push({at:performance.now(),state:document.visibilityState,hidden:document.hidden,phase:m.phase}));
 window.fetch=(input,options={})=>{
  const u=new URL(String(input),location.href);if(!u.hostname.endsWith('workers.dev'))return productFetch(input,options);
  const row={ordinal:m.requestLog.length+1,at:performance.now(),phase:m.phase,path:u.pathname,method:options.method||'GET',visibility:document.visibilityState,hidden:document.hidden,cache:options.cache||null};m.requestLog.push(row);
  const delay=m.rttPattern?m.rttPattern[(row.ordinal-1)%m.rttPattern.length]:m.rttMs;row.configuredRttMs=delay;
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





const sourceSha=process.env.PUBLICATION_TEST_INDEX_REF;
if(!/^[a-f0-9]{40}$/.test(sourceSha||''))throw new Error('Exact source SHA required');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[],checks=[],supplementary=[];
const evidenceExpr=`(function(){
 const popup=map_7010a44f6ac2025090f0fe07508ed485._popup;
 const reportText=String((popup&&popup.getElement()&&popup.getElement().textContent)||'');
 const dynamic=[];map_7010a44f6ac2025090f0fe07508ed485.eachLayer(function(layer){if(layer.options&&layer.options.publicationDynamic&&layer.getLatLng)dynamic.push(layer.getLatLng());});
 return {hidden:document.hidden,ready:publicationState.ready,ageMs:performance.now()-publicationState.checkedMono,approved:Object.keys(reportSpotLayers).length,pending:Object.keys(reportPendingLayers).length,fields:Object.keys(fieldMarkers).length,
 publicSpots:Object.values(reportPublicSpots).map(s=>({lat:s.lat,lon:s.lon,reporters:(s.history||[]).map(h=>h.reporter)})),
 fieldItems:fieldUpdates.map(s=>({lat:s.lat,lon:s.lon,nickname:s.nickname})),dynamicMapPoints:dynamic,
 dynamicLinks:document.querySelectorAll('a[data-publication-report],#fieldNavChoice a').length,choice:!!document.getElementById('fieldNavChoice'),guide:!!fieldGuide,
 fieldCardText:document.getElementById('fieldBody').textContent,reportPopupText:reportText,
 containsReporter:document.body.textContent.includes(__mock.reviewReporter),containsNickname:document.body.textContent.includes(__mock.reviewNickname),
 siteCount:Object.keys(markerRegistry).length,requests:__mock.requestLog.length,revision:publicationState.anchor&&publicationState.anchor.revision};
 })()`;
const closedLocations=s=>s.approved===0&&s.pending===0&&s.fields===0&&s.publicSpots.length===0&&s.fieldItems.length===0&&s.dynamicMapPoints.length===0;
const closedUi=s=>s.dynamicLinks===0&&!s.choice&&!s.guide&&!s.containsReporter&&!s.containsNickname;
async function waitFor(page,expression,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){if(await page.evaluate(expression))return true;await pause(75);}return false;}
try{
 for(const width of widths){
  const context=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});let page;
  try{
   page=await browser.page(width,null,context.browserContextId);
   if(!await waitFor(page,'!document.hidden&&publicationAllowed()&&!publicationHeadPromise&&!publicationRefreshPromise&&Object.keys(publicationState.pending||{}).length===0'))throw new Error('Normal visible authority did not settle');
   await page.evaluate(`(async function(){
    __mock.reviewReporter='EXPIRE_REPORTER_${width}';__mock.reviewNickname='EXPIRE_NICKNAME_${width}';
    __mock.approved=[__mock.spot({history:[{species:['직박구리'],date:new Date().toISOString().slice(0,10),reporter:__mock.reviewReporter}]})];
    __mock.field=[__mock.upd({nickname:__mock.reviewNickname})];
    await publicationRefresh();return true;
   })()`);
   if(!await waitFor(page,'publicationAllowed()&&Object.keys(reportSpotLayers).length===1&&Object.keys(fieldMarkers).length===1&&!publicationHeadPromise&&!publicationRefreshPromise&&Object.keys(publicationState.pending||{}).length===0'))throw new Error('Updated normal synthetic data did not settle');
   const before=await page.evaluate(`(async function(){
    await publicationRouteCheck(function(){fieldGuideStart(__mock.id,true);return true;});
    fieldNavChooser(fieldFind(__mock.id),'독립 합성 만료 시험');
    fieldEl('fieldPanel').hidden=false;fieldStartThreads('not_visible');
    reportSpotLayers['synthetic-approved'].openPopup();
    __mock.reviewLateGps=Array.from(__mock.watches.values())[0]?.ok||null;
    await publicationRouteCheck(function(){return true;});
    __mock.headHangs=true;
    return ${evidenceExpr};
   })()`);
   const prepared=!before.hidden&&before.ready&&before.approved===1&&before.fields===1&&before.siteCount===190&&before.dynamicLinks>0&&before.containsReporter&&before.containsNickname;
   checks.push({width,id:'E1-visible-normal-data-is-public-before-expiry',pass:prepared,evidence:before});
   writeFileSync(join(OUT,'visible-before-'+width+'.json'),JSON.stringify(before,null,2)+'\n');
   if(!prepared)console.error(JSON.stringify(before,null,2));
   if(!prepared)throw new Error('Required actual public DOM precondition missing');
   // Original timers and the 5000ms cap stay unchanged. Delay timer dispatch
   // until the first access after the real lease deadline; detect-time purge.
   const expiry=await page.evaluate(`(function(){
    var started=performance.now(),deadline=publicationState.checkedMono+PUBLICATION_MAX_AGE+3;
    while(performance.now()<deadline){}
    var allowed=publicationAllowed();
    var snapshot=${evidenceExpr};
    return {allowed,snapshot,busyMs:performance.now()-started,productMaxAge:PUBLICATION_MAX_AGE,productPollMs:PUBLICATION_POLL_MS};
   })()`);
   checks.push({width,id:'E2-expiry-detection-synchronously-erases-location-stores-and-map',pass:expiry.allowed===false&&expiry.snapshot.ageMs>=5000&&closedLocations(expiry.snapshot),evidence:expiry});
   checks.push({width,id:'E3-expiry-detection-synchronously-erases-popup-card-personal-data-and-routes',pass:expiry.allowed===false&&closedUi(expiry.snapshot),evidence:expiry.snapshot});
   const gps=await page.evaluate(`(function(){if(__mock.reviewLateGps)__mock.reviewLateGps({coords:{latitude:36.123456,longitude:126.123456}});return {hadCapturedGps:!!__mock.reviewLateGps,snapshot:${evidenceExpr}};})()`);
   supplementary.push({width,id:'late-gps-callback-cannot-reopen-expired-data',pass:closedLocations(gps.snapshot)&&closedUi(gps.snapshot),evidence:gps});
   await page.evaluate(`__mock.offline=true;__mock.headHangs=false;true`);
   const unknown=await page.evaluate(`(async function(){var executed=false;await publicationRouteCheck(function(){executed=true;return true;});return {executed,snapshot:${evidenceExpr}};})()`);
   supplementary.push({width,id:'failed-fresh-permission-route-check-stays-closed',pass:!unknown.executed&&closedLocations(unknown.snapshot)&&closedUi(unknown.snapshot),evidence:unknown});
   await page.evaluate(`__mock.offline=false;__mock.headHangs=false;__mock.revision=String(BigInt(__mock.revision)+1n);true`);
   await page.evaluate(`publicationRecheck().then(function(){return true;})`);
   const recovered=await waitFor(page,'!document.hidden&&publicationAllowed()&&Object.keys(reportSpotLayers).length===1&&Object.keys(fieldMarkers).length===1');
   const recovery=await page.evaluate(evidenceExpr);
   checks.push({width,id:'E4-newly-verified-current-permission-recovers-normal-markers',pass:recovered&&recovery.siteCount===190&&recovery.publicSpots.length===1&&recovery.fields===1,evidence:recovery});
   results.push({width,before,expiry,gps,unknown,recovery});
   writeFileSync(join(OUT,'visible-expiry-'+width+'-raw.json'),JSON.stringify(results.at(-1),null,2)+'\n');
  }finally{if(page)await page.close().catch(()=>{});await browser.send('Target.disposeBrowserContext',{browserContextId:context.browserContextId}).catch(()=>{});}
 }
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={sourceSha,indexSha256:createHash('sha256').update(HTML).digest('hex'),harnessSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),checks,supplementary,
summary:{pass:checks.filter(x=>x.pass).length,fail:checks.filter(x=>!x.pass).length,skip:0,total:checks.length},
supplementarySummary:{pass:supplementary.filter(x=>x.pass).length,fail:supplementary.filter(x=>!x.pass).length,skip:0,total:supplementary.length},
network,browserErrors,method:'Real Chrome and Leaflet; visible normal authorized data; real 5s request-start cap; synchronous busy task crosses deadline then actual publicationAllowed evaluated before queued timer cleanup. Original product timers/constants and assertions unchanged between SHAs.',
limits:['Controlled event-loop busy task delays cleanup; detection-time result is not an idle cleanup bound.','Independent 8-condition suite, not historical old8 whose expiry branch depended on hidden timer recovery.','Synthetic reporter/location; no production API requests or disclosure incident claimed.','Desktop has no GPS watch; mobile verifies captured late GPS callback.']};
writeFileSync(join(OUT,'VISIBLE_EXPIRY_MANIFEST.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSha,summary:result.summary,supplementarySummary:result.supplementarySummary,network,browserErrors},null,2));
process.exitCode=result.summary.fail||result.supplementarySummary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
