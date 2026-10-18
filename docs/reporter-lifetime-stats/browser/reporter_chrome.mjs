import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,process.env.PUBLICATION_TEST_OUTPUT||'docs/reporter-lifetime-stats/browser/baseline'); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
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
 const spot=(extra={})=>Object.assign({id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[{id:'11111111-1111-4111-8111-111111111111',species:['직박구리'],date:new Date().toISOString().slice(0,10),reporter:'합성검증'}],locationHidden:false},extra);
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
     m.actions.push({path:u.pathname,search:u.search,method,nonce:u.searchParams.get('nonce'),expectedRevision:u.searchParams.get('expectedRevision'),contract:u.searchParams.get('contract'),cache:options.cache||null});
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
     if(u.pathname.startsWith('/reports/site/')){const b=data(u,{ok:true,history:[{id,reporter:'합성검증',species:['직박구리'],date:new Date().toISOString().slice(0,10)}],total:1});if(m.deferHistory)return new Promise(resolve=>(m.deferredHistory||(m.deferredHistory=[])).push(()=>reply(b).then(resolve)));return reply(b);}
     if(u.pathname==='/contributors/monthly')return reply(data(u,m.monthly||{month:'2026-10',approvedReports:0,publicContributors:0,contributors:[]}));
     if(u.pathname==='/reports/reporter-stats'){const b=data(u,m.statsBody||{speciesCount:3,reportCount:2},m.statsPub);delete b.ok;if(m.statsFail)return reply({error:'unavailable'},404);if(m.deferStats)return new Promise(resolve=>(m.deferredStats||(m.deferredStats=[])).push(()=>reply(b).then(resolve)));return reply(b);}
     if(u.pathname==='/reports/reporter-species'){if(m.speciesFail)return reply({error:'unavailable'},404);const b=data(u,m.speciesBody||{species:['참새','가마우지','까치'],restricted:true});delete b.ok;return reply(b);}
     if(u.pathname==='/contributors/all'){
       const list=m.allContributors||[{name:'합성검증',count:5}],limit=Number(u.searchParams.get('limit')),offset=Number(u.searchParams.get('offset'));
       const b=data(u,m.allBody||{scope:'all',approvedReports:list.reduce((n,x)=>n+x.count,0)+3,publicContributors:list.length,offset,limit,contributors:list.slice(offset,offset+limit)});delete b.ok;return reply(b);
     }
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
    if(u.hostname.endsWith('workers.dev')){network.operatingRequests++;allowed=false;}
    if(method!=='GET'&&u.origin!==origin)network.externalNonGet++;
    if(allowed){u.origin===origin?network.allowedLocal++:network.allowedDependencyGet++;await this.send('Fetch.continueRequest',{requestId:m.params.requestId},sessionId).catch(()=>{});}
    else{network.blockedOther++;await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
   }
   if(m.method==='Runtime.exceptionThrown')browserErrors.push({width,text:m.params.exceptionDetails.text,description:String(m.params.exceptionDetails.exception?.description||'').split('\n')[0]});
  });
  const pre=preset?'sessionStorage.setItem("publication-test-preset",'+JSON.stringify(JSON.stringify(preset))+');':'';
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:pre+'('+hook.toString()+')()'},sessionId);
  const evaluate=async expression=>{if(/\bawait\b/.test(expression))expression='(async()=>{'+expression+'})()';const r=await this.send('Runtime.evaluate',{expression:'(async function(){var v=await eval('+JSON.stringify(expression)+');try{return JSON.parse(JSON.stringify(v));}catch{return null;}})()',awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').split('\n')[0]);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/index.html'},sessionId);
  const until=Date.now()+40000;let ready=false;
  while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof publicationFetch==='function'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===205").catch(()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error('Actual Leaflet/publication page initialization unavailable');
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
const noDynamic="Object.keys(reportSpotLayers).length===0&&Object.keys(reportPendingLayers).length===0&&Object.keys(reportPublicSpots).length===0&&reportSearchIndex.length===0&&!document.querySelector('a[data-publication-report]')";
const noApproved="Object.keys(reportSpotLayers).length===0&&reportSearchIndex.length===0";
const dynamicSnapshot="({approved:Object.keys(reportSpotLayers),pending:Object.keys(reportPendingLayers),publicSpots:Object.keys(reportPublicSpots),search:reportSearchIndex.length,anchors:Array.from(document.querySelectorAll('a[data-publication-report]')).map(x=>({id:x.dataset.publicationReport,visible:!!x.offsetParent,href:x.getAttribute('href'),parent:x.parentElement?.className,popup:!!x.closest('.leaflet-popup')})),state:{ready:publicationState.ready,generation:publicationState.generation,until:publicationState.until},allowed:publicationAllowed()})";
const routeSnapshot="(function(){var marker=reportSpotLayers['synthetic-approved'];if(!marker)return {exists:false};marker.openPopup();var n=marker.getPopup().getElement();return {exists:true,hidden:n.textContent.includes('대략'),kakao:!!n.querySelector('.spotKakaoRoute'),tmap:!!n.querySelector('.spotTmapRoute'),point:[marker.getLatLng().lat,marker.getLatLng().lng]};})()";
async function scenario(page,width,id,fn){try{const result=await fn(page.evaluate);check(width,id,result.pass,result.evidence||{});}catch(error){check(width,id,false,{error:String(error.message).slice(0,400)});}}

try{
 for(const width of widths){let page;try{
  page=await browser.page(width);const e=page.evaluate;await e(refresh);
  await e("__mock.monthly={month:'2026-10',approvedReports:2,publicContributors:1,contributors:[{name:'합성검증',count:2}]};");
  await scenario(page,width,'static-history-purge',async e=>{
   await e("window.__site=siteData.find(x=>x.country==='대한민국'&&window[x.markerVar]&&map_7010a44f6ac2025090f0fe07508ed485.hasLayer(window[x.markerVar]));window[__site.markerVar].openPopup();");await e(tick);
   const before=await e("document.querySelector('.siteHistoryBox')?.textContent.includes('합성검증')");
   await e("window.__box=document.querySelector('.siteHistoryBox');publicationInvalidate('independent barrier');");
   const s=await e("({name:!!__box?.textContent.includes('합성검증'),button:!!__box?.querySelector('.reporterStatsLink'),loaded:!!__box?._birdmapLoaded?.length,staticSites:siteData.length})");
   return {pass:before&&!s.name&&!s.button&&!s.loaded&&s.staticSites===205,evidence:{before,...s}};
  });
  if(process.env.REPORTER_BASELINE_ONLY==='1')continue;
  await e(refresh);
  await scenario(page,width,'history-counts-dialog',async e=>{
   await e("reportSpotLayers['synthetic-approved'].openPopup();");await e(tick);
   const before=await e("!!document.querySelector('.leaflet-popup .reporterStatsLink')");
   await e("document.querySelector('.leaflet-popup .reporterStatsLink').click()");await e(tick);
   const s=await e("({text:reporterStatsContent.textContent,fields:reporterStatsContent.querySelectorAll('dt').length,nums:[...reporterStatsContent.querySelectorAll('dd')].map(x=>x.textContent),focus:document.activeElement.id,private:!!reporterStatsContent.querySelector('a'),width:reporterStatsModal.querySelector('.monthTideDialog').getBoundingClientRect().width})");
   return {pass:before&&s.fields===2&&s.nums.join(',')==='3종,2건'&&s.focus==='reporterStatsClose'&&!s.private&&s.width<=width,evidence:s};
  });
  await scenario(page,width,'escape-focus-owner',async e=>{const s=await e("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));({closed:reporterStatsModal.style.display==='none',cleared:reporterStatsContent.textContent==='',focus:document.activeElement.classList.contains('reporterStatsLink')})");return {pass:s.closed&&s.cleared&&s.focus,evidence:s};});
  await scenario(page,width,'recent-search-native-sibling-controls',async e=>{
   await e("buildReportSearchIndex(__mock.approved);renderRecentReports();renderReportResults(searchResults,reportSearchIndex);");
   const s=await e("({recent:!!recentReportsList.querySelector('button.reporterStatsLink'),search:!!searchResults.querySelector('button.reporterStatsLink'),nested:document.querySelectorAll('.recentReportItem button button,.resultItem.reportResult button button,button [role=button]').length,mapControls:document.querySelectorAll('button.reporterMapOpen').length})");
   await e("recentReportsList.querySelector('.reporterStatsLink').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));");await e(tick);
   return {pass:s.recent&&s.search&&s.nested===0&&s.mapControls>=2&&await e("reporterStatsContent.querySelectorAll('dt').length===2"),evidence:s};
  });
  await scenario(page,width,'monthly-parent-modal-kept',async e=>{
   await e("closeReporterStats(false);await loadContributors();openContributorsModal();");await e(tick);
   await e("document.querySelector('#contributorsModal .reporterStatsLink').click();");await e(tick);
   const s=await e("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));({parent:contributorsModal.style.display,child:reporterStatsModal.style.display,parentClass:document.body.classList.contains('monthTideOpen')})");return {pass:s.parent==='flex'&&s.child==='none'&&s.parentClass,evidence:s};
  });
  await e("closeContributorsModal();");
  await scenario(page,width,'two-replies-race-and-close',async e=>{
   await e("__mock.deferStats=true;__mock.deferredStats=[];__mock.approved[0].history.push({id:'22222222-2222-4222-8222-222222222222',reporter:'합성검증B',species:['까치'],date:new Date().toISOString().slice(0,10)});buildReportSearchIndex(__mock.approved);renderRecentReports();searchResults.innerHTML='';renderReportResults(searchResults,reportSearchIndex);window.__triggers=[recentReportsList.querySelectorAll('.reporterStatsLink')[0],searchResults.querySelectorAll('.reporterStatsLink')[1]];window.__a=openReporterStats(__triggers[0]);true");await e(tick);
   await e("window.__b=openReporterStats(__triggers[1]);true");await e(tick);
   const n=await e("__mock.deferredStats.length");
   if(n!==2)return {pass:false,evidence:{n}};
   await e("__mock.deferredStats[1]();__b");await e("closeReporterStats(false);__mock.deferredStats[0]();__a");
   return {pass:await e("reporterStatsData===null&&reporterStatsContent.textContent===''&&reporterStatsModal.style.display==='none'"),evidence:{n}};
  });
  await e("__mock.deferStats=false;");
  await scenario(page,width,'bad-body-fail-closed',async e=>{
   await e("__mock.statsBody={speciesCount:'3',reportCount:2,reporter:'unexpected'};await openReporterStats(__triggers[0]);");const s=await e("({empty:reporterStatsData===null,text:reporterStatsContent.textContent,fields:reporterStatsContent.querySelectorAll('dt').length})");await e("__mock.statsBody=null;closeReporterStats(false)");return {pass:s.empty&&s.fields===0&&!s.text.includes('unexpected')&&!s.text.includes('합성검증'),evidence:s};
  });
  await scenario(page,width,'zero-counts-valid',async e=>{await e("__mock.statsBody={speciesCount:0,reportCount:0};await openReporterStats(__triggers[0]);");const pass=await e("[...reporterStatsContent.querySelectorAll('dd')].map(x=>x.textContent).join(',')==='0종,0건'");await e("__mock.statsBody=null;closeReporterStats(false)");return {pass};});
  await scenario(page,width,'removed-owner-closes',async e=>{await e("await openReporterStats(__triggers[0]);__triggers[0].remove();");await e(tick);return {pass:await e("reporterStatsOwner===null&&reporterStatsData===null&&reporterStatsContent.textContent===''&&reporterStatsModal.style.display==='none'")};});
  await e(refresh);
  await scenario(page,width,'late-history-cannot-reinsert',async e=>{
   await e("map_7010a44f6ac2025090f0fe07508ed485.closePopup();__mock.deferHistory=true;__mock.deferredHistory=[];window[__site.markerVar].openPopup();");await e(tick);
   await e("window.__lateBox=document.querySelector('.siteHistoryBox');publicationInvalidate('late history test');__mock.deferredHistory.forEach(fn=>fn());__mock.deferHistory=false;");await e(tick);
   return {pass:await e("!__lateBox?.textContent.includes('합성검증')&&!__lateBox?._birdmapLoaded?.length&&!__lateBox?.querySelector('.reporterStatsLink')")};
  });
  await e(refresh);
  await scenario(page,width,'hidden-barrier-and-late-stats',async e=>{
   await e("renderReportResults(searchResults,reportSearchIndex);__mock.deferStats=true;__mock.deferredStats=[];window.__late=openReporterStats(searchResults.querySelector('.reporterStatsLink'));true");await e(tick);
   await e("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));__mock.deferredStats.forEach(fn=>fn());");await e(tick);
   const s=await e("({data:reporterStatsData,owner:!!reporterStatsOwner,text:reporterStatsContent.textContent,visible:reporterStatsModal.style.display})");await e("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));__mock.deferStats=false;");return {pass:s.data===null&&!s.owner&&s.text===''&&s.visible==='none',evidence:s};
  });
  await e(refresh);
  await scenario(page,width,'expiry-clears-dialog',async e=>{
   await e("renderReportResults(searchResults,reportSearchIndex);await openReporterStats(searchResults.querySelector('.reporterStatsLink'));publicationState.until=Date.now()-1;publicationState.checkedMono=performance.now()-5001;publicationAllowed();");
   return {pass:await e("reporterStatsData===null&&reporterStatsContent.textContent===''&&reporterStatsModal.style.display==='none'")};
  });
  await e(refresh);
  await scenario(page,width,'offline-and-recovery',async e=>{
   await e("renderReportResults(searchResults,reportSearchIndex);__mock.offline=true;await openReporterStats(searchResults.querySelector('.reporterStatsLink'));");const closed=await e("reporterStatsData===null&&!reporterStatsContent.querySelector('dd')");await e("__mock.offline=false;await publicationRefresh();renderReportResults(searchResults,reportSearchIndex);await openReporterStats(searchResults.querySelector('.reporterStatsLink'));");return {pass:closed&&await e("reporterStatsContent.querySelectorAll('dd').length===2")};
  });

  // ── 누적 출현종 이름 목록 ──────────────────────────────────────
  await e(refresh);
  await scenario(page,width,'species-list-dedupe-sort-search',async e=>{
   await e("closeReporterStats(false);__mock.speciesBody=null;__mock.actions.length=0;buildReportSearchIndex(__mock.approved);renderRecentReports();await openReporterStats(recentReportsList.querySelector('.reporterStatsLink'));");
   const button=await e("!!document.getElementById('reporterSpeciesOpen')&&document.getElementById('reporterSpeciesOpen').textContent==='3종'");
   await e("document.getElementById('reporterSpeciesOpen').click();");await e("new Promise(r=>setTimeout(r,300))");
   const s=await e("({opened:{...recentReportsList.querySelector('.reporterStatsLink').dataset},names:[...document.querySelectorAll('#reporterSpeciesList li')].map(x=>x.textContent),restricted:!!document.querySelector('#reporterSpeciesBox .reporterSpeciesNote:last-child')&&reporterSpeciesBox.textContent.includes('보호종'),req:__mock.actions.filter(a=>a.path==='/reports/reporter-species').map(a=>{const q=new URLSearchParams(a.search);return [q.get('reporter'),q.get('source'),q.get('reportId'),q.get('contract')];}).pop(),focus:document.activeElement.id,dialogW:reporterStatsModal.querySelector('.monthTideDialog').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,coords:/37|127|lat|lon/.test(reporterSpeciesBox.textContent)})");
   await e("reporterSpeciesSearch.value='까';renderReporterSpecies();");
   const searched=await e("[...document.querySelectorAll('#reporterSpeciesList li')].map(x=>x.textContent)");
   await e("reporterSpeciesSearch.value='없는종';renderReporterSpecies();");
   const none=await e("({items:document.querySelectorAll('#reporterSpeciesList li').length,text:reporterSpeciesCount.textContent})");
   const tab=await e("reporterSpeciesSearch.focus();reporterStatsModal.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));reporterStatsModal.contains(document.activeElement)");
   const pass=button&&s.names.join(',')==='가마우지,까치,참새'&&s.restricted&&s.req&&s.req[0]===s.opened.reporter&&s.req[1]==='history'&&s.req[2]===s.opened.reporterReport&&s.req[3]==='publication-v1'&&s.focus==='reporterSpeciesSearch'&&s.dialogW<=width&&!s.overflow&&!s.coords&&searched.join(',')==='까치'&&none.items===0&&none.text.includes('검색 결과가 없습니다')&&tab;
   return {pass,evidence:{button,...s,searched,none,tab}};
  });
  for(const [label,body] of [['duplicate',"{species:['까치','까치'],restricted:false}"],['extra-field',"{species:['까치'],restricted:false,lat:37}"],['bad-flag',"{species:['까치'],restricted:'no'}"],['control-char',"{species:['까\\u0007치'],restricted:false}"]]){
   await scenario(page,width,'species-bad-body-fail-closed-'+label,async e=>{
    await e("closeReporterStats(false);__mock.speciesBody="+body+";await openReporterStats(recentReportsList.querySelector('.reporterStatsLink'));document.getElementById('reporterSpeciesOpen').click();");await e("new Promise(r=>setTimeout(r,300))");
    const s=await e("({items:document.querySelectorAll('#reporterSpeciesList li').length,data:reporterSpeciesData,text:reporterSpeciesBox.textContent})");
    await e("__mock.speciesBody=null;");
    return {pass:s.items===0&&s.data===null&&s.text.includes('확인할 수 없습니다')&&!s.text.includes('까치'),evidence:s};
   });
  }
  await scenario(page,width,'species-unavailable-no-list',async e=>{
   await e("closeReporterStats(false);__mock.speciesFail=true;await openReporterStats(recentReportsList.querySelector('.reporterStatsLink'));document.getElementById('reporterSpeciesOpen').click();");await e("new Promise(r=>setTimeout(r,300))");
   const s=await e("({items:document.querySelectorAll('#reporterSpeciesList li').length,data:reporterSpeciesData})");await e("__mock.speciesFail=false;");
   return {pass:s.items===0&&s.data===null,evidence:s};
  });
  await e(refresh);
  await scenario(page,width,'species-list-cleared-on-expiry',async e=>{
   await e("buildReportSearchIndex(__mock.approved);renderRecentReports();await openReporterStats(recentReportsList.querySelector('.reporterStatsLink'));document.getElementById('reporterSpeciesOpen').click();");await e("new Promise(r=>setTimeout(r,300))");
   const before=await e("document.querySelectorAll('#reporterSpeciesList li').length");
   await e("publicationState.until=Date.now()-1;publicationState.checkedMono=performance.now()-5001;publicationAllowed();");
   const s=await e("({items:document.querySelectorAll('#reporterSpeciesList li').length,data:reporterSpeciesData,modal:reporterStatsModal.style.display,text:reporterStatsContent.textContent})");
   return {pass:before===3&&s.items===0&&s.data===null&&s.modal==='none'&&s.text==='',evidence:{before,...s}};
  });
  // ── 이번 달 / 전체 기여자 ─────────────────────────────────────
  await e(refresh);
  await scenario(page,width,'contributors-scope-search-paging',async e=>{
   await e("closeReporterStats(false);closeContributorsModal();__mock.allBody=null;__mock.allContributors=Array.from({length:205},(_,i)=>({name:'기여'+String(i).padStart(3,'0'),count:300-i}));__mock.monthly={month:'2026-10',approvedReports:2,publicContributors:1,contributors:[{name:'합성검증',count:2}]};clearContributors();selectRecentTab('contributors');await loadContributors();");
   const summaryButton=await e("!!recentContributors.querySelector('.contribMore')");
   await e("recentContributors.querySelector('.contribMore').click();");await e("new Promise(r=>setTimeout(r,300))");
   const month=await e("({title:contributorsTitle.textContent,rows:contributorsContent.querySelectorAll('.contribRow').length,source:contributorsContent.querySelector('.reporterStatsLink')?.dataset.reporterSource,selected:contributorsScopeMonth.getAttribute('aria-selected')})");
   await e("contributorsScopeAll.click();");await e("new Promise(r=>setTimeout(r,400))");
   const all1=await e("({title:contributorsTitle.textContent,rows:contributorsContent.querySelectorAll('.contribRow').length,more:!!contributorsContent.querySelector('.contribMore'),meta:contributorsMeta.textContent,source:contributorsContent.querySelector('.reporterStatsLink')?.dataset.reporterSource,month:contributorsContent.querySelector('.reporterStatsLink')?.dataset.reporterMonth||null,req:__mock.actions.filter(a=>a.path==='/contributors/all').map(a=>new URLSearchParams(a.search).get('offset'))})");
   await e("contributorsContent.querySelector('.contribMore').click();");await e("new Promise(r=>setTimeout(r,400))");
   const all2=await e("({rows:contributorsContent.querySelectorAll('.contribRow').length,more:!!contributorsContent.querySelector('.contribMore'),last:[...contributorsContent.querySelectorAll('.contribName')].pop().textContent,req:__mock.actions.filter(a=>a.path==='/contributors/all').map(a=>new URLSearchParams(a.search).get('offset'))})");
   await e("contributorsSearch.value='기여20';renderContributorsModal();");
   const search=await e("[...contributorsContent.querySelectorAll('.contribName')].map(x=>x.textContent)");
   await e("contributorsSearch.value='없는닉네임';renderContributorsModal();");
   const none=await e("contributorsContent.textContent.includes('검색 결과가 없습니다')");
   await e("contributorsSearch.value='';contributorsScopeMonth.click();");
   const back=await e("({title:contributorsTitle.textContent,rows:contributorsContent.querySelectorAll('.contribRow').length})");
   await e("contributorsScopeAll.click();__mock.actions.length=0;contributorsContent.querySelector('.reporterStatsLink').click();");await e("new Promise(r=>setTimeout(r,300))");
   const stat=await e("({req:__mock.actions.filter(a=>a.path==='/reports/reporter-stats').map(a=>{const q=new URLSearchParams(a.search);return [q.get('source'),q.get('month'),q.get('reportId')];}).pop(),nums:[...reporterStatsContent.querySelectorAll('dd')].map(x=>x.textContent),parent:contributorsModal.style.display,overflow:document.documentElement.scrollWidth>innerWidth,dialogW:contributorsModal.querySelector('.monthTideDialog').getBoundingClientRect().width})");
   await e("closeReporterStats(false);closeContributorsModal();");
   const pass=summaryButton&&month.title==='2026년 10월 기여자'&&month.rows===1&&month.source==='monthly'&&month.selected==='true'&&all1.title==='전체 누적 기여자'&&all1.rows===200&&all1.more&&all1.source==='all'&&all1.month===null&&all1.meta.includes('공개 기여자 205명')&&all1.req.join(',')==='0'&&all2.rows===205&&!all2.more&&all2.last==='기여204'&&all2.req.join(',')==='0,200'&&search.join(',')==='기여200,기여201,기여202,기여203,기여204'&&none&&back.rows===1&&back.title==='2026년 10월 기여자'&&stat.req&&stat.req[0]==='all'&&stat.req[1]===null&&stat.req[2]===null&&stat.nums.join(',')==='3종,2건'&&stat.parent==='flex'&&!stat.overflow&&stat.dialogW<=width;
   return {pass,evidence:{summaryButton,month,all1,all2,search,none,back,stat}};
  });
  for(const [label,body] of [['zero-count',"{scope:'all',approvedReports:1,publicContributors:1,offset:0,limit:200,contributors:[{name:'가',count:0}]}"],['bad-name',"{scope:'all',approvedReports:1,publicContributors:1,offset:0,limit:200,contributors:[{name:'',count:1}]}"],['wrong-offset',"{scope:'all',approvedReports:1,publicContributors:1,offset:5,limit:200,contributors:[{name:'가',count:1}]}"],['more-than-total',"{scope:'all',approvedReports:2,publicContributors:1,offset:0,limit:200,contributors:[{name:'가',count:1},{name:'나',count:1}]}"]]){
   await scenario(page,width,'contributors-all-bad-body-'+label,async e=>{
    await e("clearContributors();__mock.allBody="+body+";await loadContributors();openContributorsModal(true);contributorsScopeAll.click();");await e("new Promise(r=>setTimeout(r,300))");
    const s=await e("({rows:contributorsContent.querySelectorAll('.contribRow').length,text:contributorsContent.textContent,data:contributorsAll})");
    await e("__mock.allBody=null;closeContributorsModal();");
    return {pass:s.rows===0&&s.data===null&&s.text.includes('불러오지 못했습니다'),evidence:s};
   });
  }
  await e(refresh);
  await scenario(page,width,'contributors-all-cleared-on-expiry',async e=>{
   await e("clearContributors();__mock.allContributors=[{name:'합성검증',count:5},{name:'둘째',count:1}];await loadContributors();openContributorsModal(true);contributorsScopeAll.click();");await e("new Promise(r=>setTimeout(r,300))");
   const before=await e("contributorsContent.querySelectorAll('.contribRow').length");
   await e("publicationState.until=Date.now()-1;publicationState.checkedMono=performance.now()-5001;publicationAllowed();");
   const s=await e("({rows:contributorsContent.querySelectorAll('.contribRow').length,data:contributorsAll,month:contributorsData,modal:contributorsModal.style.display,names:document.body.innerText.includes('둘째')})");
   return {pass:before===2&&s.rows===0&&s.data===null&&s.month===null&&s.modal==='none'&&!s.names,evidence:{before,...s}};
  });
  // ── PC 전용 필터 패널 닫기 ────────────────────────────────────
  await scenario(page,width,'filter-panel-pc-close-keeps-filters',async e=>{
   const pc=width>700;
   await e("setBirdmapPanelOpen(false);togglePanelBtn.click();");
   const opened=await e("getComputedStyle(birdmapPanel).display!=='none'");
   const closeVisible=await e("birdmapPanelClose.getClientRects().length>0");
   await e("window.__cb=[...birdmapPanel.querySelectorAll('input[type=checkbox]')][0];window.__cbBefore=__cb.checked;__cb.click();searchBox.value='천수만';");
   if(pc){await e("birdmapPanelClose.click();");}else{await e("togglePanelBtn.click();");}
   const closed=await e("({hidden:getComputedStyle(birdmapPanel).display==='none',label:togglePanelBtn.innerText.trim(),expanded:togglePanelBtn.getAttribute('aria-expanded'),focus:document.activeElement.id})");
   await e("togglePanelBtn.click();");
   const kept=await e("({checkbox:__cb.checked!==__cbBefore,search:searchBox.value})");
   await e("__cb.click();searchBox.value='';setBirdmapPanelOpen(false);");
   const pass=opened&&closeVisible===pc&&closed.hidden&&closed.label==='☰ 필터 열기'&&closed.expanded==='false'&&(!pc||closed.focus==='togglePanelBtn')&&kept.checkbox&&kept.search==='천수만';
   return {pass,evidence:{pc,opened,closeVisible,closed,kept}};
  });
 }catch(error){check(width,'harness-or-product',false,{error:String(error.message).slice(0,400)});}finally{if(page)await page.close();}}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={checkoutSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),indexSha256:createHash('sha256').update(HTML).digest('hex'),widths,rows,network,browserErrors,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0}};
writeFileSync(join(OUT,'reporter_chrome.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.summary.fail||network.operatingRequests||browserErrors.length?1:0;
