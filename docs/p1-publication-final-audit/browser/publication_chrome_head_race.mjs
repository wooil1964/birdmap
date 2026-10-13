import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,'docs/p1-publication-final-audit/browser/preexisting-head-7117733');
mkdirSync(OUT,{recursive:true});
const HTML=process.env.PUBLICATION_TEST_INDEX_REF?execFileSync('git',['show',process.env.PUBLICATION_TEST_INDEX_REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}):readFileSync(join(ROOT,'index.html'),'utf8');
const widths=process.env.PUBLICATION_TEST_WIDTHS?process.env.PUBLICATION_TEST_WIDTHS.split(',').map(Number):[344,375,768,1024,1440];
const allowedCDN=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];
const network={allowedLocal:0,allowedDependencyGet:0,blockedOther:0,operatingRequests:0,externalNonGet:0};
const rows=[],browserErrors=[];
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server=createServer((req,res)=>{
 const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=resolve(ROOT,'.'+(p==='/'?'/index.html':p));
 if(req.method!=='GET'||!(target.startsWith(ROOT+'\\')||target.startsWith(ROOT+'/'))){res.writeHead(403);res.end('blocked');return;}
 try{const body=target===join(ROOT,'index.html')?Buffer.from(HTML,'utf8'):readFileSync(target);res.writeHead(200,{'Content-Type':extname(target)==='.html'?'text/html;charset=utf-8':extname(target)==='.json'?'application/json':'application/octet-stream','Cache-Control':'no-store'});res.end(body);}
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
 window.fetch=(input,options={})=>{
   const u=new URL(String(input),location.href),method=options.method||'GET';
   if(u.hostname.endsWith('workers.dev')){
     m.actions.push({path:u.pathname,method,nonce:u.searchParams.get('nonce'),expectedRevision:u.searchParams.get('expectedRevision'),contract:u.searchParams.get('contract'),cache:options.cache||null});
     if(m.offline)return Promise.reject(new Error('Synthetic network outage'));
     if(u.pathname==='/reports/public-state'){if(m.headHangs)return new Promise(()=>{});const response=reply(data(u,{},m.headOverride));if(m.deferHead)return new Promise(resolve=>(m.deferredHead||(m.deferredHead=[])).push({resolve:()=>response.then(resolve)}));return response;}
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
     if(u.pathname==='/contributors/monthly')return reply(data(u,{contributors:[]}));
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
 async page(width,preset){
  const {targetId}=await this.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
  await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);
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
  return {evaluate,sessionId,targetId,close:()=>this.send('Target.closeTarget',{targetId})};
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
const refresh="Promise.all([loadApprovedReports(),loadPendingReports(),loadRecentSiteSightings(),loadFieldUpdates()])";
const normal="fieldNavChoiceClose();fieldGuideStop();__mock.deferHead=false;__mock.deferredHead=[];__mock.offline=false;__mock.headHangs=false;__mock.headOverride=null;__mock.dataApprovedOverride=null;__mock.dataFieldOverride=null;__mock.headAfterData=null;__mock.deferApproved=false;__mock.deferField=false;__mock.deferredApproved=[];__mock.deferredField=[];__mock.id='11111111-1111-4111-8111-'+String((__mock.testIdSequence||0)+1).padStart(12,'0');__mock.testIdSequence=(__mock.testIdSequence||0)+1;__mock.field=[__mock.upd()];__mock.approved=[__mock.spot()];__mock.pendingSpots=[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}];__mock.revision=String(BigInt(__mock.revision)+1n);publicationInvalidate();";
const noDynamic="Object.keys(reportSpotLayers).length===0&&Object.keys(reportPendingLayers).length===0&&Object.keys(fieldMarkers).length===0&&fieldUpdates.length===0&&Object.keys(reportPublicSpots).length===0&&reportSearchIndex.length===0&&!document.querySelector('a[data-publication-report]')&&!document.getElementById('fieldNavChoice')&&fieldGuide===null";
const noApproved="Object.keys(reportSpotLayers).length===0&&reportSearchIndex.length===0";
const dynamicSnapshot="({approved:Object.keys(reportSpotLayers),pending:Object.keys(reportPendingLayers),fields:Object.keys(fieldMarkers),fieldData:fieldUpdates.map(x=>x.id),publicSpots:Object.keys(reportPublicSpots),search:reportSearchIndex.length,anchors:Array.from(document.querySelectorAll('a[data-publication-report]')).map(x=>({id:x.dataset.publicationReport,visible:!!x.offsetParent,href:x.getAttribute('href'),parent:x.parentElement?.className,popup:!!x.closest('.leaflet-popup')})),choice:!!document.getElementById('fieldNavChoice'),guide:!!fieldGuide,state:{ready:publicationState.ready,generation:publicationState.generation,until:publicationState.until},allowed:publicationAllowed()})";
const routeSnapshot="(function(){var marker=reportSpotLayers['synthetic-approved'];if(!marker)return {exists:false};marker.openPopup();var n=marker.getPopup().getElement();return {exists:true,hidden:n.textContent.includes('대략'),kakao:!!n.querySelector('.spotKakaoRoute'),tmap:!!n.querySelector('.spotTmapRoute'),point:[marker.getLatLng().lat,marker.getLatLng().lng]};})()";
async function scenario(page,width,id,fn){try{const result=await fn(page.evaluate);check(width,id,result.pass,result.evidence||{});}catch(error){check(width,id,false,{error:String(error.message).slice(0,400)});}}
try{
 for(const width of widths){
  let page;
  try{
   page=await browser.page(width);const e=page.evaluate;
   await e(refresh);
   await scenario(page,width,'normal-190-sites-leaflet',async e=>({pass:await e("!!L.version&&siteData.length===190&&!!fieldMap().getContainer()")}));
   await scenario(page,width,'normal-approved-kakao-tmap-dom',async e=>{
    const s=await e(routeSnapshot);return {pass:s.exists&&s.kakao&&s.tmap,evidence:s};
   });
   await scenario(page,width,'normal-static-site-kakao-tmap',async e=>{
    const s=await e("(function(){var s=siteData.find(x=>x.country==='대한민국'&&window[x.markerVar]&&fieldMap().hasLayer(window[x.markerVar])),m=window[s.markerVar];m.openPopup();var n=m.getPopup().getElement();return {kakao:!!n.querySelector('a.kakao'),tmap:!!n.querySelector('a.tmap')};})()");
    return {pass:s.kakao&&s.tmap,evidence:s};
   });
   await scenario(page,width,'normal-field-two-app-chooser',async e=>{
    await e("fieldNavChooser(fieldFind(__mock.id),'합성검증')");
    const s=await e("(function(){var n=document.getElementById('fieldNavChoice');return {kakao:!!n?.querySelector('a[href^=\"https://map.kakao.com/link/to/\"]'),tmap:!!n?.querySelector('a[href^=\"tmap://route\"]')};})()");
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
   await scenario(page,width,'V05-remote-field-delete-then-later-old-cache',async e=>{
    await e(normal+refresh);
    await e("__mock.field=[];__mock.revision=String(BigInt(__mock.revision)+1n);loadFieldUpdates()");
    const oldRevision=await e("String(BigInt(__mock.revision)-1n)");
    await e("__mock.dataFieldOverride={publication:{revision:"+JSON.stringify(oldRevision)+"},updates:[__mock.upd()]};loadFieldUpdates()");
    return {pass:await e("fieldUpdates.length===0&&Object.keys(fieldMarkers).length===0&&fieldGuide===null"),evidence:{tombstone:await e("!!fieldTombstones[__mock.id]")}};
   });
   await scenario(page,width,'V06-refresh-stale-first-field-list',async e=>{
    await e(normal+refresh);
    await e("__mock.field=[];__mock.revision=String(BigInt(__mock.revision)+1n);loadFieldUpdates()");
    const preset=await e("({revision:__mock.revision,epoch:__mock.epoch,field:[],approved:[],pendingSpots:[],dataFieldOverride:{publication:{revision:String(BigInt(__mock.revision)-1n)},updates:[__mock.upd()]}})");
    await e("sessionStorage.setItem('publication-test-preset',"+JSON.stringify(JSON.stringify(preset))+")");
    await browser.send('Page.reload',{ignoreCache:true},page.sessionId);await new Promise(r=>setTimeout(r,1200));
    const evidence=await e("({updates:fieldUpdates.length,markers:Object.keys(fieldMarkers).length,guide:fieldGuide===null,allowed:publicationAllowed()})");
    await e("sessionStorage.removeItem('publication-test-preset')");
    return {pass:evidence.updates===0&&evidence.markers===0&&evidence.guide,evidence};
   });
   await scenario(page,width,'restore-authorized-reapproval-and-unhide',async e=>{
    await e(normal+refresh);
    await e("__mock.approved=[];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    await e("__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    await e("__mock.approved=[__mock.spot()];__mock.revision=String(BigInt(__mock.revision)+1n);loadApprovedReports()");
    const s=await e(routeSnapshot);return {pass:s.exists&&s.kakao&&s.tmap,evidence:s};
   });
   await scenario(page,width,'restore-field-protection-to-authorized-public',async e=>{
    await e(normal+"__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})];"+refresh);
    await e("__mock.field=[__mock.upd()];__mock.revision=String(BigInt(__mock.revision)+1n);loadFieldUpdates()");
    return {pass:await e("fieldFind(__mock.id)?.locationHidden!==true&&!!fieldPublicPoint(fieldFind(__mock.id))")};
   });
   await scenario(page,width,'unknown-network-removes-all-dynamic-location',async e=>{
    await e(normal+refresh);
    await e("__mock.offline=true;loadApprovedReports()");
    const pass=await e(noDynamic),statics=await e("siteData.length===190");return {pass:pass&&statics,evidence:{noDynamic:pass,staticSitesRetained:statics,components:await e(dynamicSnapshot)}};
   });
   await scenario(page,width,'recovery-after-network-error',async e=>{
    await e(normal+refresh);return {pass:await e("!!reportSpotLayers['synthetic-approved']&&!!fieldMarkers[__mock.id]&&publicationAllowed()")};
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
   await scenario(page,width,'late-gps-after-authority-protection',async e=>{
    await e(normal+refresh);
    await e("fieldNewsNavigate(__mock.id)");
    await e(tick);
    const count=await e("__mock.geo.length");
    await e("__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})];__mock.revision=String(BigInt(__mock.revision)+1n);loadFieldUpdates()");
    if(count)await e("__mock.geo[__mock.geo.length-1].ok({coords:{latitude:37,longitude:127,accuracy:1}})");
    return {pass:count>0&&await e("fieldGuide===null&&!document.getElementById('fieldNavChoice')"),evidence:{capturedGps:count}};
   });
   await scenario(page,width,'normal-expiry-does-not-permanently-delete-reappearance',async e=>{
    await e(normal+"__mock.field=[__mock.upd({updatedAt:new Date(Date.now()-4*3600000).toISOString(),expiresAt:new Date(Date.now()-3600000).toISOString()})];"+refresh);
    const expired=await e("Object.keys(fieldMarkers).length===0");
    await e("__mock.field=[__mock.upd({status:'reappeared'})];__mock.revision=String(BigInt(__mock.revision)+1n);loadFieldUpdates()");
    return {pass:expired&&await e("!!fieldMarkers[__mock.id]&&fieldFind(__mock.id).status==='reappeared'"),evidence:{expiredRemoved:expired}};
   });
   await scenario(page,width,'same-revision-different-head-contract-rejected',async e=>{
    await e(normal+refresh);
    await e("__mock.headOverride={projection:'unexpected-projection'};loadFieldUpdates()");
    return {pass:await e(noDynamic)};
   });
   await scenario(page,width,'visibility-return-revalidates',async e=>{
    await e(normal+refresh);
    await e("__mock.offline=true;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
    await e(tick);return {pass:await e(noDynamic)};
   });
   await scenario(page,width,'owner-delete-dom-old-inflight-response',async e=>{
    await e(normal+refresh);
    await e("fieldMineAdd(__mock.id);fieldNewsShow(__mock.id);__mock.deferField=true;window.__oldFieldRequest=loadFieldUpdates();true");
    await e(tick);
    await e("fieldMarkers[__mock.id].marker.getPopup().getElement().querySelector('.fieldDeleteBtn').click()");
    await e(tick);
    const deletePost=await e("__mock.actions.some(x=>x.path.endsWith('/delete')&&x.method==='POST')");
    await e("__mock.deferField=false;__mock.deferredField.forEach(x=>x.resolve());__mock.deferredField=[];__oldFieldRequest");
    await e(refresh);
    return {pass:deletePost&&await e("fieldUpdates.length===0&&Object.keys(fieldMarkers).length===0&&fieldGuide===null"),evidence:{deletePost}};
   });
   await scenario(page,width,'normal-status-and-reappeared-dom',async e=>{
    await e(normal+refresh);
    await e("fieldNewsShow(__mock.id);Array.from(fieldMarkers[__mock.id].marker.getPopup().getElement().querySelectorAll('button')).find(b=>b.textContent==='안 보여요').click();fieldDraft.nickname='합성검증';fieldTurnstileToken='synthetic-token';fieldSubmitStatus()");
    await e(tick);await e(refresh);
    const first=await e("fieldFind(__mock.id)?.status==='not_visible'&&__mock.actions.some(x=>x.path.endsWith('/status')&&x.method==='POST')");
    await e("__mock.field=[__mock.upd({status:'reappeared'})];__mock.revision=String(BigInt(__mock.revision)+1n);"+refresh);
    return {pass:first&&await e("fieldFind(__mock.id)?.status==='reappeared'&&!!fieldMarkers[__mock.id]"),evidence:{notVisiblePost:first}};
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
      await e("__mock.headOverride="+JSON.stringify(bad)+";loadFieldUpdates()");
      return {pass:await e(noDynamic)};
    });
   }
   await scenario(page,width,'public-api-get-request-no-store',async e=>{
     const selected=await e("__mock.actions.filter(x=>x.method==='GET'&&(x.path.startsWith('/reports/public-state')||x.path==='/reports/approved'||x.path==='/reports/pending'||x.path==='/reports/recent-sites'||x.path==='/field-updates'))");
     return {pass:selected.length>0&&selected.every(x=>x.cache==='no-store'),evidence:{requests:selected.length,nonNoStore:selected.filter(x=>x.cache!=='no-store').length}};
   });
   const hiddenAuthorityOnly="__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})];__mock.revision=String(BigInt(__mock.revision)+1n);";
   const gpsBlocked="fieldGuide===null&&!document.getElementById('fieldNavChoice')&&!document.getElementById('fieldGuideBox')&&__mock.watches.size===0&&!fieldUpdates.some(x=>x.id===__mock.id&&x.lat===37&&x.lon===127)&&!Object.values(fieldMarkers).some(x=>x.marker.getLatLng().lat===37&&x.marker.getLatLng().lng===127)";
   for(const outcome of ['ok','error'])await scenario(page,width,'fresh-authority-one-shot-'+outcome,async e=>{
     await e(normal+refresh);const capturedBefore=await e("__mock.geo.length");
     await e("fieldNewsNavigate(__mock.id)");await e(tick);
     const captured=await e("__mock.geo.length>"+capturedBefore);
     await e(hiddenAuthorityOnly);
     const localStillOld=await e("fieldFind(__mock.id)?.locationHidden!==true&&publicationAllowed()&&fieldFind(__mock.id)?.lat===37");
     if(captured)await e(outcome==='ok'?"__mock.geo[__mock.geo.length-1].ok({coords:{latitude:35,longitude:125,accuracy:1}})":"__mock.geo[__mock.geo.length-1].error({code:1})");
     await e(tick);
     return {pass:captured&&localStillOld&&await e(gpsBlocked),evidence:{captured,localStillOld,after:await e(dynamicSnapshot)}};
   });
   if(width<769){
     for(const outcome of ['ok','error'])await scenario(page,width,'fresh-authority-manual-gps-'+outcome,async e=>{
       await e(normal+refresh);const capturedBefore=await e("__mock.geo.length");
       await e("fieldNavManualGuide(__mock.id)");await e(tick);
       const captured=await e("__mock.geo.length>"+capturedBefore);
       await e(hiddenAuthorityOnly);
       const localStillOld=await e("fieldFind(__mock.id)?.locationHidden!==true&&publicationAllowed()&&fieldFind(__mock.id)?.lat===37");
       if(captured)await e(outcome==='ok'?"__mock.geo[__mock.geo.length-1].ok({coords:{latitude:37,longitude:127,accuracy:1}})":"__mock.geo[__mock.geo.length-1].error({code:1})");
       await e(tick);
       return {pass:captured&&localStillOld&&await e(gpsBlocked),evidence:{captured,localStillOld,after:await e(dynamicSnapshot)}};
     });
     for(const outcome of ['ok','error'])await scenario(page,width,'fresh-authority-watch-gps-'+outcome,async e=>{
       await e(normal+refresh);await e("fieldGuideStart(__mock.id)");await e(tick);
       const captured=await e("!!fieldGuide&&__mock.watches.size===1");
       await e("window.__publicationWatch=__mock.watches.values().next().value;"+hiddenAuthorityOnly);
       const localStillOld=await e("fieldFind(__mock.id)?.locationHidden!==true&&publicationAllowed()&&fieldFind(__mock.id)?.lat===37");
       if(captured)await e(outcome==='ok'?"__publicationWatch.ok({coords:{latitude:37,longitude:127,accuracy:1}})":"__publicationWatch.error({code:1})");
       await e(tick);
       return {pass:captured&&localStillOld&&await e(gpsBlocked),evidence:{captured,localStillOld,after:await e(dynamicSnapshot)}};
     });
     await scenario(page,width,'fresh-authority-guide-start-with-old-local-store',async e=>{
       await e(normal+refresh);await e(hiddenAuthorityOnly);
       const localStillOld=await e("fieldFind(__mock.id)?.locationHidden!==true&&publicationAllowed()&&fieldFind(__mock.id)?.lat===37");
       await e("fieldGuideStart(__mock.id)");await e(tick);
       return {pass:localStillOld&&await e(gpsBlocked),evidence:{localStillOld,after:await e(dynamicSnapshot)}};
     });
   }
   await e(normal+refresh);
   await e("fieldNewsShow(__mock.id);new Promise(r=>setTimeout(r,300))");
   await scenario(page,width,'independent-route-rechecks-after-preexisting-head',async e=>{
    await e(normal+refresh);await e(routeSnapshot);
    await e("window.__routeLog=[];window.open=function(initial){var r={initial,assigned:[],closed:false};__routeLog.push(r);return {location:{set href(v){r.assigned.push(v);}},close(){r.closed=true;}};};__mock.deferHead=true;window.__oldPermissionHead=publicationHead();true");await e(tick);
    const captured=await e('__mock.deferredHead.length===1');
    await e("__mock.revision=String(BigInt(__mock.revision)+1n);__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];document.querySelector('a.spotKakaoRoute').click()");await e(tick);
    await e("__mock.deferHead=false;__mock.deferredHead.shift()?.resolve();__oldPermissionHead");await e(tick);
    const log=await e('__routeLog');
    return {pass:captured&&!log.some(x=>(x.assigned||[]).length)&&log.every(x=>x.closed),evidence:{captured,log,components:await e(dynamicSnapshot)}};
   });
   await e(normal+refresh);await e("fieldNewsShow(__mock.id);new Promise(r=>setTimeout(r,300))");
   const popupScreenshot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);
   writeFileSync(join(OUT,'publication-popup-'+width+'.png'),Buffer.from(popupScreenshot.data,'base64'));
   await e("fieldNavChooser(fieldFind(__mock.id),'합성검증');new Promise(r=>setTimeout(r,300))");
   const screenshot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);
   writeFileSync(join(OUT,'publication-normal-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
  }catch(error){check(width,'environment-or-harness',false,{error:String(error.message).slice(0,400)});}
  finally{if(page)await page.close();}
 }
 const pair=[];
 try{
  pair.push(await browser.page(375));pair.push(await browser.page(1440));
  for(const p of pair){await p.evaluate(refresh);await p.evaluate(tick);}
  for(const p of pair)await p.evaluate(normal+"__mock.revision='100';"+refresh);
  const before=await Promise.all(pair.map(p=>p.evaluate("!!reportSpotLayers['synthetic-approved']&&!!fieldMarkers[__mock.id]")));
  check('multi-device','both-independent-clients-normal',before.every(Boolean),{pages:before,components:await Promise.all(pair.map(p=>p.evaluate(dynamicSnapshot)))});
  for(const p of pair)await p.evaluate("__mock.revision='101';__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];__mock.field=[__mock.upd({locationHidden:true,lat:36.9,lon:126.9})]");
  await pair[0].evaluate(refresh);
  await pair[1].evaluate("fieldNewsNavigate(__mock.id)");await pair[1].evaluate(tick);
  const beforeGate=await pair[1].evaluate("!document.getElementById('fieldNavChoice')&&fieldGuide===null");
  await pair[1].evaluate(refresh);
  const hidden=await Promise.all(pair.map(p=>p.evaluate("!fieldPublicPoint(fieldFind(__mock.id))&&!document.getElementById('fieldNavChoice')")));
  check('multi-device','second-device-route-rechecks-current-authority',beforeGate&&hidden.every(Boolean),{routeClosed:beforeGate,pagesProtected:hidden});
  for(const p of pair)await p.evaluate("__mock.revision='102';__mock.field=[];__mock.approved=[];"+refresh);
  const deletion=await Promise.all(pair.map(p=>p.evaluate("fieldUpdates.length===0&&Object.keys(fieldMarkers).length===0&&Object.keys(reportSpotLayers).length===0")));
  check('multi-device','remote-removal-both-current-snapshots',deletion.every(Boolean),{pages:deletion});
  for(const p of pair)await p.evaluate(normal+"__mock.revision='103';"+refresh);
  const restored=await Promise.all(pair.map(p=>p.evaluate("!!fieldPublicPoint(fieldFind(__mock.id))&&!!reportSpotLayers['synthetic-approved']")));
  check('multi-device','new-explicit-authority-restores-both-devices',restored.every(Boolean),{pages:restored});
  const e=pair[0].evaluate;
  await e("__mock.deferApproved=true;window.__olderApproved=loadApprovedReports();true");await e(tick);
  await e("__mock.revision='104';__mock.approved=[__mock.spot({locationHidden:true,lat:36.9,lon:126.9})];window.__newerApproved=loadApprovedReports();true");await e(tick);
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
 sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).trim(),
 sourceInput:process.env.PUBLICATION_TEST_INDEX_REF||'working-tree-snapshot',indexSha256:createHash('sha256').update(HTML).digest('hex'),widths,rows,
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

