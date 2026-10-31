import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,process.env.PUBLICATION_TEST_OUTPUT||'docs/p1-publication-final-audit/browser/final-source'); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
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
/* The page is usable only after every blocking CDN asset and inline script ran. A fixed sleep after
   Page.reload failed on a slow CI runner (ReferenceError on the half-parsed page, CI run 38569301560),
   so both the first load and the reload wait for this same condition (max 40s, then fail). */
async function pageReady(evaluate){
 const until=Date.now()+40000;
 while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof publicationFetch==='function'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===240").catch(()=>false))return true;await new Promise(r=>setTimeout(r,200));}
 return false;
}
// Test-only knob to reproduce a slow CDN (delays allowed dependency GETs). Default 0.
const dependencyDelayMs=Number(process.env.PUBLICATION_TEST_DEPENDENCY_DELAY_MS||0);

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
 window.fetch=(input,options={})=>{
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
 async page(width,preset,independentVisible=false){
  const browserContextId=independentVisible?(await this.send('Target.createBrowserContext',{})).browserContextId:null;
  const {targetId}=await this.send('Target.createTarget',{url:'about:blank',...(browserContextId?{browserContextId}: {})});
  const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
  await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);
  if(independentVisible)await this.send('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);
  await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<769},sessionId);
  await this.send('Emulation.setTouchEmulationEnabled',{enabled:width<769},sessionId);
  await this.send('Network.setUserAgentOverride',{userAgent:width<769?'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36'},sessionId);
  await this.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
  this.events.push(async m=>{
   if(m.sessionId!==sessionId)return;
   if(m.method==='Fetch.requestPaused'){
    const u=new URL(m.params.request.url),method=m.params.request.method;
    let allowed=method==='GET'&&(u.origin===origin||allowedCDN.includes(u.hostname));
    if(u.hostname.endsWith('workers.dev')){if(method==='GET'&&u.hostname==='birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev'&&u.pathname.startsWith('/tiles/'))network.basemapTileRequestsBlocked=(network.basemapTileRequestsBlocked||0)+1;else network.operatingRequests++;allowed=false;}
    if(method!=='GET'&&u.origin!==origin)network.externalNonGet++;
    if(allowed){u.origin===origin?network.allowedLocal++:network.allowedDependencyGet++;if(dependencyDelayMs&&u.origin!==origin)await new Promise(r=>setTimeout(r,dependencyDelayMs));await this.send('Fetch.continueRequest',{requestId:m.params.requestId},sessionId).catch(()=>{});}
    else{network.blockedOther++;await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
   }
   if(m.method==='Runtime.exceptionThrown')browserErrors.push({width,text:m.params.exceptionDetails.text,description:String(m.params.exceptionDetails.exception?.description||'').split('\n')[0]});
  });
  const pre=preset?'sessionStorage.setItem("publication-test-preset",'+JSON.stringify(JSON.stringify(preset))+');':'';
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:pre+'('+hook.toString()+')()'},sessionId);
  const evaluate=async expression=>{const r=await this.send('Runtime.evaluate',{expression:'(async function(){var v=await eval('+JSON.stringify(expression)+');try{return JSON.parse(JSON.stringify(v));}catch{return null;}})()',awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').split('\n')[0]);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/index.html'},sessionId);
  if(!await pageReady(evaluate))throw new Error('Actual Leaflet/publication page initialization unavailable');
  return {evaluate,sessionId,targetId,browserContextId,close:async()=>{await this.send('Target.closeTarget',{targetId});if(browserContextId)await this.send('Target.disposeBrowserContext',{browserContextId});}};
 }
 async dispose(){try{this.socket.close();}catch{}this.proc.kill();await new Promise(r=>setTimeout(r,250));try{const checked=resolve(this.profile),prefix=resolve(tmpdir(),'birdmap-publication-cdp-');if(checked!==this.profile||!checked.startsWith(prefix))throw new Error('Temporary profile path outside approved prefix');rmSync(checked,{recursive:true,force:true});}catch{}}
}
const profile=mkdtempSync(join(tmpdir(),'birdmap-publication-cdp-'));
const proc=spawn(chrome,['--headless=new','--remote-debugging-port=0','--disable-gpu','--hide-scrollbars','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='';
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome DevTools unavailable')),30000);proc.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/ws:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0]);}});proc.on('error',reject);});
const ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r));
const browser=new CDP(proc,ws,profile);
function check(width,id,pass,evidence={}){rows.push({width,id,pass:pass===true,evidence});}
const tick="new Promise(r=>setTimeout(r,80))";
const refresh="Promise.all([loadApprovedReports(),loadPendingReports(),loadRecentSiteSightings()])";
const normal="__mock.headDelayMs=0;__mock.deferHead=false;__mock.deferredHead=[];__mock.offline=false;__mock.headHangs=false;__mock.headOverride=null;__mock.dataApprovedOverride=null;__mock.dataFieldOverride=null;__mock.headAfterData=null;__mock.deferApproved=false;__mock.deferField=false;__mock.deferredApproved=[];__mock.deferredField=[];__mock.id='11111111-1111-4111-8111-'+String((__mock.testIdSequence||0)+1).padStart(12,'0');__mock.testIdSequence=(__mock.testIdSequence||0)+1;__mock.field=[__mock.upd()];__mock.approved=[__mock.spot()];__mock.pendingSpots=[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}];__mock.revision=String(BigInt(__mock.revision)+1n);publicationInvalidate();";
const noDynamic="Object.keys(reportSpotLayers).length===0&&Object.keys(reportPendingLayers).length===0&&Object.keys(reportPublicSpots).length===0&&reportSearchIndex.length===0&&!document.querySelector('a[data-publication-report]')&&!document.querySelector('a.spotKakaoRoute')";
const noApproved="Object.keys(reportSpotLayers).length===0&&reportSearchIndex.length===0";
const dynamicSnapshot="({approved:Object.keys(reportSpotLayers),pending:Object.keys(reportPendingLayers),publicSpots:Object.keys(reportPublicSpots),search:reportSearchIndex.length,anchors:Array.from(document.querySelectorAll('a[data-publication-report]')).map(x=>({id:x.dataset.publicationReport,visible:!!x.offsetParent,href:x.getAttribute('href'),parent:x.parentElement?.className,popup:!!x.closest('.leaflet-popup')})),state:{ready:publicationState.ready,generation:publicationState.generation,until:publicationState.until},allowed:publicationAllowed()})";
const routeSnapshot="(function(){var marker=reportSpotLayers['synthetic-approved'];if(!marker)return {exists:false};marker.openPopup();var n=marker.getPopup().getElement();return {exists:true,hidden:n.textContent.includes('대략'),kakao:!!n.querySelector('.spotKakaoRoute'),tmap:!!n.querySelector('.spotTmapRoute'),point:[marker.getLatLng().lat,marker.getLatLng().lng]};})()";
async function scenario(page,width,id,fn){try{const result=await fn(page.evaluate);check(width,id,result.pass,result.evidence||{});}catch(error){check(width,id,false,{error:String(error.message).slice(0,400)});}}
try{
 for(const width of widths){
  let page;
  try{
   page=await browser.page(width);const e=page.evaluate;
   await e(refresh);
   await scenario(page,width,'normal-202-sites-leaflet',async e=>({pass:await e("!!L.version&&siteData.length===240&&!!map_7010a44f6ac2025090f0fe07508ed485.getContainer()")}));
   await scenario(page,width,'normal-approved-kakao-tmap-dom',async e=>{
    const s=await e(routeSnapshot);return {pass:s.exists&&s.kakao&&s.tmap,evidence:s};
   });
   await scenario(page,width,'normal-static-site-kakao-tmap',async e=>{
    const s=await e("(function(){var s=siteData.find(x=>x.country==='대한민국'&&window[x.markerVar]&&map_7010a44f6ac2025090f0fe07508ed485.hasLayer(window[x.markerVar])),m=window[s.markerVar];m.openPopup();var n=m.getPopup().getElement();return {kakao:!!n.querySelector('a.kakao'),tmap:!!n.querySelector('a.tmap')};})()");
    return {pass:s.kakao&&s.tmap,evidence:s};
   });

   await scenario(page,width,'normal-pending-list',async e=>({pass:await e("!!reportPendingLayers['synthetic-pending']")}));
   await scenario(page,width,'V03-protected-then-later-old-approved-cache',async e=>{
    await e(normal+"__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];"+refresh);
    const oldRevision=await e("String(BigInt(__mock.revision)-1n)");
    await e("__mock.dataApprovedOverride={publication:{revision:"+JSON.stringify(oldRevision)+"},spots:[__mock.spot()]};loadApprovedReports()");
    const s=await e(routeSnapshot);
    const rawSearch=await e("reportSearchIndex.some(x=>x.lat===37&&x.lon===127)");
    return {pass:(!s.exists||(!s.kakao&&!s.tmap&&s.point[0]!==37))&&!rawSearch,evidence:{...s,rawSearch}};
   });
   await scenario(page,width,'V04-withdrawal-then-later-old-approved-cache',async e=>{
    await e(normal+"__mock.approved=[];"+refresh);
    const oldRevision=await e("String(BigInt(__mock.revision)-1n)");
    await e("__mock.dataApprovedOverride={publication:{revision:"+JSON.stringify(oldRevision)+"},spots:[__mock.spot()]};loadApprovedReports()");
    return {pass:await e(noApproved),evidence:{exactCoordinatesRestored:await e("Object.keys(reportSpotLayers).length>0")}};
   });


   await scenario(page,width,'restore-authorized-reapproval-and-unhide',async e=>{
    await e(normal+refresh);
    await e("__mock.approved=[];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    await e("__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    await e("__mock.approved=[__mock.spot()];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    const s=await e(routeSnapshot);return {pass:s.exists&&s.kakao&&s.tmap,evidence:s};
   });

   await scenario(page,width,'unknown-network-removes-all-dynamic-location',async e=>{
    await e(normal+refresh);
    await e("__mock.offline=true;loadApprovedReports()");
    const pass=await e(noDynamic),statics=await e("siteData.length===240");return {pass:pass&&statics,evidence:{noDynamic:pass,staticSitesRetained:statics,components:await e(dynamicSnapshot)}};
   });
   await scenario(page,width,'recovery-after-network-error',async e=>{
    await e(normal+refresh);return {pass:await e("!!reportSpotLayers['synthetic-approved']&&publicationAllowed()")};
   });
   await scenario(page,width,'preflight-data-postflight-authority-change',async e=>{
    await e(normal+refresh);
    await e("__mock.headAfterData={revision:String(BigInt(__mock.revision)+1n),approved:[]};loadApprovedReports()");
    return {pass:await e(noApproved)};
   });
   await scenario(page,width,'bad-nonce-fails-closed',async e=>{
    await e(normal+refresh);
    await e("__mock.headOverride={nonce:'00000000000000000000000000000000'};loadApprovedReports()");
    return {pass:await e(noDynamic),evidence:await e(dynamicSnapshot)};
   });
   await scenario(page,width,'old-epoch-payload-fails-closed',async e=>{
    await e(normal+refresh);
    await e("__mock.dataApprovedOverride={publication:{epoch:'22222222222242228222222222222222'},spots:[__mock.spot()]};loadApprovedReports()");
    return {pass:await e(noDynamic),evidence:await e(dynamicSnapshot)};
   });
   await scenario(page,width,'bigint-revision-rounding-not-used',async e=>{
    await e(normal+"__mock.revision='9007199254740993';"+refresh);
    const first=await e("!!reportSpotLayers['synthetic-approved']");
    await e("__mock.dataApprovedOverride={publication:{revision:'9007199254740992'},spots:[__mock.spot()]};loadApprovedReports()");
    return {pass:first&&await e(noApproved),evidence:{validLargeRevision:first,rejectAdjacentOld:await e(noApproved)}};
   });


   await scenario(page,width,'same-revision-different-head-contract-rejected',async e=>{
    await e(normal+refresh);
    await e("__mock.headOverride={projection:'unexpected-projection'};loadApprovedReports()");
    return {pass:await e(noDynamic)};
   });
   await scenario(page,width,'visibility-return-revalidates',async e=>{
    await e(normal+refresh);
    await e("__mock.offline=true;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
    await e(tick);return {pass:await e(noDynamic)};
   });


   if(width===375){
    await scenario(page,width,'head-timeout-fails-closed',async e=>{
      await e(normal+refresh);await e("__mock.headHangs=true;loadApprovedReports()");
      return {pass:await e(noDynamic),evidence:await e(dynamicSnapshot)};
    });
    await scenario(page,width,'permission-lease-expires-while-offline',async e=>{
      await e(normal+refresh);await e("__mock.offline=true;new Promise(r=>setTimeout(r,5400))");
      return {pass:await e(noDynamic),evidence:await e(dynamicSnapshot)};
    });
   }
   if(width===375){
    await scenario(page,width,'monotonic-lease-survives-os-clock-rollback',async e=>{
      await e(normal+refresh);
      await e("window.__publicationRealNow=Date.now;__mock.offline=true;Date.now=function(){return __publicationRealNow()-86400000;};new Promise(r=>setTimeout(r,5400))");
      await e("Date.now=__publicationRealNow");
      return {pass:await e(noDynamic),evidence:{clockRollbackMs:86400000,components:await e(dynamicSnapshot)}};
    });
   }
   if(width===375){
    const malformed=[['epoch-null',{epoch:null}],['epoch-array',{epoch:[]}],['revision-number',{revision:1}],['revision-null',{revision:null}],['revision-array',{revision:['1']}],['revision-leading-zero',{revision:'01'}],['revision-negative',{revision:'-1'}],['revision-overflow',{revision:'9223372036854775808'}],['projection-boolean',{projection:false}],['contract-null',{contract:null}],['nonce-null',{nonce:null}],['nonce-array',{nonce:[]}]];
    for(const [id,bad] of malformed)await scenario(page,width,'strict-head-'+id,async e=>{
      await e(normal+refresh);
      await e("__mock.headOverride="+JSON.stringify(bad)+";loadApprovedReports()");
      return {pass:await e(noDynamic)};
    });
   }
   await scenario(page,width,'public-api-get-request-no-store',async e=>{
     const selected=await e("__mock.actions.filter(x=>x.method==='GET'&&(x.path.startsWith('/reports/public-state')||x.path==='/reports/approved'||x.path==='/reports/pending'||x.path==='/reports/recent-sites'||x.path==='/field-updates'))");
     return {pass:selected.length>0&&selected.every(x=>x.cache==='no-store'),evidence:{requests:selected.length,nonNoStore:selected.filter(x=>x.cache!=='no-store').length}};
   });
   for(const app of ['kakao','tmap'])await scenario(page,width,'independent-approved-'+app+'-auxclick-no-authority-bypass',async e=>{
    await e(normal+refresh);await e(routeSnapshot);
    await e("__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.revision=String(BigInt(__mock.revision)+1n)");
    const result=await e("(function(){var a=document.querySelector('a."+(app==='kakao'?'spotKakaoRoute':'spotTmapRoute')+"');var before=__mock.actions.filter(x=>x.path==='/reports/public-state').length;var event=new MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1});var url=a?.getAttribute('href')||'';a?.dispatchEvent(event);return {url,prevented:event.defaultPrevented,headCalls:__mock.actions.filter(x=>x.path==='/reports/public-state').length-before};})()");
    return {pass:result.prevented||!/(?:goalx|goaly|map[.]kakao[.]com|tmap:)/i.test(result.url),evidence:result};
   });
   if(width===375)await scenario(page,width,'independent-head-transit-counts-in-five-second-lease',async e=>{
    await e(normal+refresh);
    const result=await e("(async function(){__mock.headDelayMs=2000;var started=performance.now();await publicationRecheck();var elapsed=performance.now()-started,allowed=publicationAllowed(),remaining=Math.max(0,publicationState.until-Date.now()),requestAge=performance.now()-publicationState.checkedMono;__mock.headDelayMs=0;return {elapsed,remaining,requestAge,totalAgeBudget:requestAge+remaining,allowed,closed:!Object.keys(reportSpotLayers).length&&!Object.keys(reportPendingLayers).length,privateName:document.body.innerText.includes('합성검증')};})()");
    // Compound renew + full refresh can span multiple leases. Each current lease remains request-start bounded.
    return {pass:result.allowed?result.totalAgeBudget<=5005:result.remaining===0&&result.closed&&!result.privateName,evidence:result};
   });
   await e(normal+refresh);await e("reportSpotLayers['synthetic-approved']?.openPopup();new Promise(r=>setTimeout(r,300))");
   const launchSetup="window.__routeLog=[];window.open=function(initial){var r={kind:'window',initial:initial,assigned:[],closed:false};__routeLog.push(r);return {opener:window,location:{set href(v){r.assigned.push(v);}},close:function(){r.closed=true;}};};window.__originalTmapUrl=window.__originalTmapUrl||tmapNavigationUrl;tmapNavigationUrl=function(dest,label){var url=__originalTmapUrl(dest,label);__routeLog.push({kind:'tmap-url',url:url});return url;};openTmapNavigation=function(){__routeLog.push({kind:'tmap-attempt'});return false;};";
   for(const source of ['approved'])for(const app of ['kakao','tmap'])await scenario(page,width,'independent-normal-'+source+'-'+app+'-verified-launch-url',async e=>{
    await e(normal+refresh);await e(launchSetup);
    await e(routeSnapshot);
    const selector='a.'+(app==='kakao'?'spotKakaoRoute':'spotTmapRoute');
    const before=await e("__mock.actions.filter(x=>x.path==='/reports/public-state').length");
    const placeholder=await e("document.querySelector("+JSON.stringify(selector)+")?.getAttribute('href')");
    await e("__routeLog=[];document.querySelector("+JSON.stringify(selector)+").click()");await e(tick);
    const result=await e("({headCalls:__mock.actions.filter(x=>x.path==='/reports/public-state').length-"+before+",log:__routeLog})");
    const url=app==='kakao'?result.log.flatMap(x=>x.assigned||[]).find(Boolean):result.log.find(x=>x.kind==='tmap-url')?.url;
    return {pass:placeholder==='#'&&result.headCalls>0&&!!url&&(app==='kakao'?/map[.]kakao[.]com\/link\/to\/[^,]+,37,127$/.test(url):url.includes('goalx=127')&&url.includes('goaly=37'))&&(app==='kakao'||result.log.some(x=>x.kind==='tmap-attempt')),evidence:{placeholder,url,...result}};
   });
   for(const source of ['approved'])for(const app of ['kakao','tmap'])await scenario(page,width,'independent-protected-'+source+'-'+app+'-launch-blocked',async e=>{
    await e(normal+refresh);await e(launchSetup);
    await e(routeSnapshot);
    const selector='a.'+(app==='kakao'?'spotKakaoRoute':'spotTmapRoute');
    await e("__routeLog=[];__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})];document.querySelector("+JSON.stringify(selector)+").click()");await e(tick);
    const log=await e('__routeLog');
    return {pass:!log.some(x=>x.kind==='tmap-attempt'||(x.assigned||[]).length)&&log.filter(x=>x.kind==='window').every(x=>x.initial==='about:blank'&&x.closed),evidence:{log}};
   });
   await scenario(page,width,'independent-route-rechecks-after-preexisting-head',async e=>{
    await e(normal+refresh);await e(launchSetup);await e(routeSnapshot);
    await e("__routeLog=[];__mock.deferHead=true;window.__oldPermissionHead=publicationHead();true");await e(tick);
    const captured=await e('__mock.deferredHead.length===1');
    await e("__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];document.querySelector('a.spotKakaoRoute').click()");await e(tick);
    await e("__mock.deferHead=false;__mock.deferredHead.shift()?.resolve();__oldPermissionHead");await e(tick);
    const log=await e('__routeLog');
    return {pass:captured&&!log.some(x=>(x.assigned||[]).length)&&log.filter(x=>x.kind==='window').every(x=>x.closed),evidence:{captured,log,components:await e(dynamicSnapshot)}};
   });
   await e(normal+refresh);await e("reportSpotLayers['synthetic-approved']?.openPopup();new Promise(r=>setTimeout(r,300))");
   for(const reason of ['revision-change','network-unknown'])await scenario(page,width,'independent-contributor-consent-cache-'+reason,async e=>{
    await e(normal+refresh);
    await e("contributorsData=null;contributorsLoading=false;__mock.monthly={month:'2026-10',approvedReports:1,publicContributors:1,contributors:[{name:'합성공개닉네임',count:1}]};loadContributors()");
    await e("selectRecentTab('contributors');openContributorsModal()");await e(tick);
    const initial=await e("document.getElementById('contributorsContent')?.textContent.includes('합성공개닉네임')===true");
    if(reason==='revision-change')await e("__mock.monthly={month:'2026-10',approvedReports:0,publicContributors:0,contributors:[]};__mock.revision=String(BigInt(__mock.revision)+1n);publicationHead()");
    else await e("__mock.offline=true;publicationHead().catch(()=>false)");
    const after=await e("({cache:contributorsData,visibleName:!!document.getElementById('recentContributors')?.textContent.includes('합성공개닉네임'),modalName:!!document.getElementById('contributorsContent')?.textContent.includes('합성공개닉네임')})");
    return {pass:initial&&after.cache===null&&!after.visibleName&&!after.modalName,evidence:{initial,after}};
   });
   await e(normal+refresh);await e("closeContributorsModal();selectRecentTab('reports');reportSpotLayers['synthetic-approved']?.openPopup();new Promise(r=>setTimeout(r,300))");
   const popupScreenshot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);
   writeFileSync(join(OUT,'publication-popup-'+width+'.png'),Buffer.from(popupScreenshot.data,'base64'));
   await e("reportSpotLayers['synthetic-approved']?.openPopup();new Promise(r=>setTimeout(r,300))");
   const screenshot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);
   writeFileSync(join(OUT,'publication-normal-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
  }catch(error){check(width,'environment-or-harness',false,{error:String(error.message).slice(0,400)});}
  finally{if(page)await page.close();}
 }
 const pair=[];
 try{
  pair.push(await browser.page(375,undefined,true));pair.push(await browser.page(1440,undefined,true));
  const visible=await Promise.all(pair.map(p=>p.evaluate('!document.hidden&&document.visibilityState==="visible"')));
  check('multi-device','independent-visible-context-preconditions',new Set(pair.map(p=>p.browserContextId)).size===2&&visible.every(Boolean),{visible,contexts:pair.map(p=>p.browserContextId)});
  if(!visible.every(Boolean))throw new Error('Independent device visibility premise not satisfied');
  for(const p of pair){await p.evaluate(refresh);await p.evaluate(tick);}
  for(const p of pair)await p.evaluate(normal+"__mock.revision='100';"+refresh);
  const before=await Promise.all(pair.map(p=>p.evaluate("!!reportSpotLayers['synthetic-approved']")));
  check('multi-device','both-independent-clients-normal',before.every(Boolean),{pages:before,components:await Promise.all(pair.map(p=>p.evaluate(dynamicSnapshot)))});
  for(const p of pair)await p.evaluate("__mock.revision='101';__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})]");
  await pair[0].evaluate(refresh);
  await pair[1].evaluate("reportSpotLayers['synthetic-approved']?.openPopup();document.querySelector('a.spotKakaoRoute')?.click()");await pair[1].evaluate(tick);
  const beforeGate=await pair[1].evaluate("!document.querySelector('a.spotKakaoRoute')");
  await pair[1].evaluate(refresh);
  const hidden=await Promise.all(pair.map(p=>p.evaluate("!document.querySelector('a.spotKakaoRoute')&&!document.querySelector('a.spotTmapRoute')")));
  check('multi-device','second-device-route-rechecks-current-authority',beforeGate&&hidden.every(Boolean),{routeClosed:beforeGate,pagesProtected:hidden});
  for(const p of pair)await p.evaluate("__mock.revision='102';__mock.field=[];__mock.approved=[];"+refresh);
  const deletion=await Promise.all(pair.map(p=>p.evaluate("Object.keys(reportSpotLayers).length===0")));
  check('multi-device','remote-removal-both-current-snapshots',deletion.every(Boolean),{pages:deletion});
  for(const p of pair)await p.evaluate(normal+"__mock.revision='103';"+refresh);
  const restored=await Promise.all(pair.map(p=>p.evaluate("!!reportSpotLayers['synthetic-approved']")));
  check('multi-device','new-explicit-authority-restores-both-devices',restored.every(Boolean),{pages:restored});
  const e=pair[0].evaluate;
  await e("__mock.deferApproved=true;window.__olderApproved=loadApprovedReports();true");await e(tick);
  await e("__mock.revision='104';__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];publicationInvalidate('synthetic remote authority barrier');window.__newerApproved=publicationRefresh();true");await e(tick);
  const calls=await e("__mock.deferredApproved.length");
  if(calls>=2){
   await e("__mock.deferredApproved[1].resolve();__newerApproved");
   await e("__mock.deferApproved=false;__mock.deferredApproved[0].resolve();__olderApproved");
   const s=await e(routeSnapshot),search=await e("reportSearchIndex.some(x=>x.lat===37&&x.lon===127)");
   check('concurrency','earlier-request-arrives-after-new-protected-snapshot',(!s.exists||(!s.kakao&&!s.tmap&&s.point[0]!==37))&&!search,{...s,rawSearch:search});
  }else check('concurrency','earlier-request-arrives-after-new-protected-snapshot',false,{expectedDeferredRequests:2,actual:calls});
 }catch(error){check('multi-device','environment-or-harness',false,{error:String(error.message).slice(0,400)});}
 finally{for(const p of pair)await p.close();}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={
 schema:'birdmap-publication-browser-security-v1',checkedAt:new Date().toISOString(),
 checkoutSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).trim(),
 assetsRoot:ASSET_ROOT,assetsInput:process.env.PUBLICATION_TEST_ASSET_REF||'checkout-assets',sourceInput:process.env.PUBLICATION_TEST_INDEX_REF||'working-tree-snapshot',indexSha256:createHash('sha256').update(HTML).digest('hex'),widths,rows,
 summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0,notRun:0},
 previousChrome15:rows.filter(x=>['V03-protected-then-later-old-approved-cache','V04-withdrawal-then-later-old-approved-cache','V06-refresh-stale-first-field-list'].includes(x.id)),
 network,browserErrors,
 limits:['Synthetic in-page API emulates the publication protocol; actual D1 atomicity is tested separately.',
 'All dynamic coordinates and reports are synthetic. Static190 public sites are loaded from the product.',
 'Two independent Chrome pages are coordinated with the same mock authority revisions; distributed production POP consistency is not certified.',
 'No external Kakao/TMAP application or physical GPS device was opened.',
 'Foreground permission lease and polling operational values require separate operating approval.',
 'Synthetic authority changes are observed at fetch/postflight boundaries; zero-ms revocation is not guaranteed.']
};
writeFileSync(join(OUT,'publication_chrome.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,oldChrome15:{total:result.previousChrome15.length,unsafe:result.previousChrome15.filter(x=>!x.pass).length},network,browserErrors,resultPath:join(OUT,'publication_chrome.json')},null,2));
process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
