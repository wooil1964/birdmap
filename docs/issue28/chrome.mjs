import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(process.env.ISSUE28_ROOT||join(dirname(fileURLToPath(import.meta.url)),'../..'));
const OUT=resolve(process.env.ISSUE28_OUTPUT||join(ROOT,'.ci-results/issue28-chrome')); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
mkdirSync(OUT,{recursive:true});
const HTML=process.env.PUBLICATION_TEST_INDEX_REF?execFileSync('git',['show',process.env.PUBLICATION_TEST_INDEX_REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}):readFileSync(join(ROOT,'index.html'),'utf8');
const widths=process.env.PUBLICATION_TEST_WIDTHS?process.env.PUBLICATION_TEST_WIDTHS.split(',').map(Number):[344,375,1024,1440];
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
 const mk=(id,radius,extra={})=>Object.assign({id,species:'직박구리',count:1,status:'visible',lat:37.1,lon:127.1,nickname:'합성검증',note:'',updatedAt:new Date().toISOString(),firstSeenAt:new Date().toISOString(),lastConfirmedAt:null,confirmCount:0,history:[],rowRevision:'1',expiresAt:new Date(Date.now()+8*3600000).toISOString(),visibilityRadius:radius,locationHidden:false},extra);
 const m=window.__mock={revision:'1',epoch:'11111111111141118111111111111111',actions:[],geo:[],watches:new Map(),watchSeq:0,fieldSeq:100,reports:[],draftProtected:false,deferred:[],deferRead:false,deferReports:false,reportReplies:[],hidden:false};
 m.nativeMedia=query=>fine(query).matches;
 try{const preset=JSON.parse(sessionStorage.getItem('publication-test-preset')||'null');if(preset?.blockStorage)Object.defineProperty(window,'localStorage',{configurable:true,get:()=>{throw Error('Synthetic storage denied');}});}catch{}
 m.all=mk('11111111-1111-4111-8111-111111111111','all',{species:'참새'});m.near=mk('22222222-2222-4222-8222-222222222222','10',{species:'박새'});m.fields=[m.all,m.near];
 const pub=u=>({contract:'publication-v1',epoch:m.epoch,revision:m.revision,projection:'legacy-public-v1',nonce:u.searchParams.get('nonce')});
 const reply=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
 const data=(u,body)=>Object.assign({ok:true,serverTime:new Date().toISOString(),publication:pub(u)},body);
 m.fix=(accuracy=15,age=0)=>({coords:{latitude:37.1,longitude:127.1,accuracy},timestamp:Date.now()-age});
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>m.hidden});
 window.fetch=(input,options={})=>{
  const u=new URL(String(input),location.href),method=options.method||'GET';
  if(u.hostname.endsWith('workers.dev')){
   const payload=options.body?JSON.parse(options.body):null;m.actions.push({path:u.pathname,method,payload});
   if(u.pathname==='/reports/public-state')return reply(data(u,{}));
   if(u.searchParams.has('expectedRevision')&&u.searchParams.get('expectedRevision')!==m.revision)return reply({ok:false,error:{code:'PUBLICATION_CHANGED'}},409);
   if(u.pathname==='/reports/capabilities')return reply({ok:true,quickReport:{nonBreedingConfirmation:true,hideLocation:true}});
   if(u.pathname==='/field-updates'&&method==='GET')return reply(data(u,{fieldIntegrationVersion:'radius-report-v1',ttlHours:8,updates:m.fields.filter(x=>x.visibilityRadius==='all')}));
   if(u.pathname==='/field-updates/read'){
    const body=data(u,{...(m.oldWorker?{}:{fieldIntegrationVersion:'radius-report-v1'}),ttlHours:8,updates:payload&&payload.viewer?m.fields:m.fields.filter(x=>x.visibilityRadius==='all')});
    if(m.deferRead)return new Promise(resolve=>m.deferred.push(()=>reply(body).then(resolve)));
    return reply(body);
   }
   if(u.pathname==='/field-updates'&&method==='POST'){
    const id='33333333-3333-4333-8333-'+String(++m.fieldSeq).padStart(12,'0');
    const item=mk(id,payload.visibilityRadius,{species:payload.species,status:payload.status,lat:payload.lat,lon:payload.lon});m.fields.push(item);m.created=item;m.revision=String(BigInt(m.revision)+1n);return reply({ok:true,id,status:item.status},201);
   }
   if(u.pathname.endsWith('/report-draft')){
    const id=u.pathname.split('/')[2],row=m.fields.find(x=>x.id===id)||m.created;
    if(m.draftProtected)return reply(data(u,{draft:{id,species:'저어새',firstSeenAt:row.firstSeenAt,locationHidden:true,lat:null,lon:null}}));
    return reply(data(u,{draft:{id,species:row.species,firstSeenAt:row.firstSeenAt,locationHidden:false,lat:row.lat,lon:row.lon}}));
   }
   if(u.pathname==='/reports'&&method==='POST'){
    m.reports.push(payload);const respond=()=>reply({ok:true,id:payload.request_id,status:'pending'},201);
    if(m.deferReports)return new Promise(resolve=>m.reportReplies.push(()=>respond().then(resolve)));return respond();
   }
   if(u.pathname==='/reports/approved')return reply(data(u,{spots:[],fixedSpots:{}}));
   if(u.pathname==='/reports/pending')return reply(data(u,{spots:[]}));
   if(u.pathname==='/reports/recent-sites')return reply(data(u,{sites:[]}));
   if(u.pathname.startsWith('/reports/site/'))return reply(data(u,{history:[],total:0}));
   if(u.pathname.startsWith('/contributors/'))return reply(data(u,{month:'2026-10',approvedReports:0,publicContributors:0,contributors:[]}));
   return reply({ok:true});
  }
  if(u.origin===location.origin&&method==='GET')return realFetch(input,options);
  return Promise.reject(new Error('Blocked non-local fetch'));
 };
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(ok,error,options)=>m.geo.push({ok,error,options}),watchPosition:(ok,error)=>{const id=++m.watchSeq;m.watches.set(id,{ok,error});return id;},clearWatch:id=>m.watches.delete(id)}});
 m.permission={state:'granted',onchange:null};Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>m.permission}});
 window.matchMedia=query=>query.includes('pointer:fine')?{matches:innerWidth>768,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:fine(query);
 Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true});window.confirm=()=>true;
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
const normal="fieldNavChoiceClose();fieldGuideStop();__mock.headDelayMs=0;__mock.deferHead=false;__mock.deferredHead=[];__mock.offline=false;__mock.headHangs=false;__mock.headOverride=null;__mock.dataApprovedOverride=null;__mock.dataFieldOverride=null;__mock.headAfterData=null;__mock.deferApproved=false;__mock.deferField=false;__mock.deferredApproved=[];__mock.deferredField=[];__mock.id='11111111-1111-4111-8111-'+String((__mock.testIdSequence||0)+1).padStart(12,'0');__mock.testIdSequence=(__mock.testIdSequence||0)+1;__mock.field=[__mock.upd()];__mock.approved=[__mock.spot()];__mock.pendingSpots=[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}];__mock.revision=String(BigInt(__mock.revision)+1n);publicationInvalidate();";
const noDynamic="Object.keys(reportSpotLayers).length===0&&Object.keys(reportPendingLayers).length===0&&Object.keys(fieldMarkers).length===0&&fieldUpdates.length===0&&Object.keys(reportPublicSpots).length===0&&reportSearchIndex.length===0&&!document.querySelector('a[data-publication-report]')&&!document.getElementById('fieldNavChoice')&&fieldGuide===null";
const noApproved="Object.keys(reportSpotLayers).length===0&&reportSearchIndex.length===0";
const dynamicSnapshot="({approved:Object.keys(reportSpotLayers),pending:Object.keys(reportPendingLayers),fields:Object.keys(fieldMarkers),fieldData:fieldUpdates.map(x=>x.id),publicSpots:Object.keys(reportPublicSpots),search:reportSearchIndex.length,anchors:Array.from(document.querySelectorAll('a[data-publication-report]')).map(x=>({id:x.dataset.publicationReport,visible:!!x.offsetParent,href:x.getAttribute('href'),parent:x.parentElement?.className,popup:!!x.closest('.leaflet-popup')})),choice:!!document.getElementById('fieldNavChoice'),guide:!!fieldGuide,state:{ready:publicationState.ready,generation:publicationState.generation,until:publicationState.until},allowed:publicationAllowed()})";
const routeSnapshot="(function(){var marker=reportSpotLayers['synthetic-approved'];if(!marker)return {exists:false};marker.openPopup();var n=marker.getPopup().getElement();return {exists:true,hidden:n.textContent.includes('대략'),kakao:!!n.querySelector('.spotKakaoRoute'),tmap:!!n.querySelector('.spotTmapRoute'),point:[marker.getLatLng().lat,marker.getLatLng().lng]};})()";
async function scenario(page,width,id,fn){try{const result=await fn(page.evaluate);check(width,id,result.pass,result.evidence||{});}catch(error){check(width,id,false,{error:String(error.message).slice(0,400)});}}

const settle="new Promise(r=>setTimeout(r,140))";
async function snap(page,name){const shot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);writeFileSync(join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));}
async function waitEval(e,expr){const until=Date.now()+5000;while(Date.now()<until){if(await e(expr))return;await new Promise(r=>setTimeout(r,60));}throw Error('timeout '+expr);}
const fresh="__mock.hidden=false;fieldViewerClear(false);publicationInvalidate('test reset');publicationRefresh()";
const locate="fieldViewerLocate();__mock.geo.at(-1).ok(__mock.fix());";
try{
 for(const width of widths){let page;try{
  page=await browser.page(width);const e=page.evaluate;await e(refresh);await e(settle);
  await scenario(page,width,'field-news-mobile-only-PC-hidden-wide-touch-kept',async e=>{
   const inspect="(function(){closeFieldPanel();renderFieldNews();var boxDisplay=getComputedStyle(document.getElementById('fieldNewsBox')).display;openFieldPanel();var marker=Object.values(fieldMarkers)[0]?.marker;if(marker)marker.openPopup();return {fine:__mock.nativeMedia('(pointer:fine)'),coarse:__mock.nativeMedia('(pointer:coarse)'),box:boxDisplay,panel:getComputedStyle(document.getElementById('fieldPanel')).display,marker:marker?getComputedStyle(marker.getElement()).display:null,popup:document.querySelector('.fieldPop')?getComputedStyle(document.querySelector('.fieldPop')).display:null};})()";
   const initial=await e(inspect);
   await snap(page,'mobile-only-initial-'+width);
   if(width>=769){await browser.send('Emulation.setTouchEmulationEnabled',{enabled:true},page.sessionId);await e(settle);}
   const touch=await e(inspect);await snap(page,'mobile-only-touch-'+width);await e('fieldMap().closePopup();closeFieldPanel()');
   return {pass:(width<769?initial.coarse&&initial.box!=='none'&&initial.marker!=='none':initial.fine&&initial.box==='none'&&initial.panel==='none'&&initial.marker==='none'&&initial.popup==='none')&&touch.coarse&&touch.box!=='none'&&touch.panel!=='none'&&touch.marker!=='none'&&touch.popup!=='none',evidence:{initial,touch}};
  });
  await scenario(page,width,'no-GPS-only-all-public-no-auto-permission',async e=>{
   const s=await e("({ids:fieldUpdates.map(x=>x.id),geo:__mock.geo.length,reads:__mock.actions.filter(x=>x.path==='/field-updates/read').length})");return {pass:s.ids.length===1&&s.ids[0].startsWith('1111')&&s.geo===0&&s.reads===0,evidence:s};
  });
  await scenario(page,width,'radius-default10-options5-10-20-all',async e=>{
   await e("openFieldPanel();fieldStartForm('visible');");
   const s=await e("({value:document.getElementById('fieldVisibilityRadius').value,options:Array.from(document.getElementById('fieldVisibilityRadius').options).map(x=>x.value),geo:__mock.geo.length})");
   await snap(page,'radius-'+width);return {pass:s.value==='10'&&JSON.stringify(s.options)==='[\"5\",\"10\",\"20\",\"all\"]'&&s.geo===1,evidence:s};
  });
  await scenario(page,width,'radius-create-optin-cancel-zero-report-writes',async e=>{
   await e("__mock.oldWorker=true;__mock.geo.at(-1).ok(__mock.fix());fieldDraft.species='직박구리';fieldTurnstileToken='synthetic-token';fieldSubmitCreate();");await waitEval(e,'!fieldBusy');
   const blockedOldWorker=await e("__mock.actions.filter(x=>x.path==='/field-updates'&&x.method==='POST').length===0&&document.getElementById('fieldMsg').textContent.includes('중지')");await e('__mock.oldWorker=false');
   await e("__mock.geo.at(-1).ok(__mock.fix());fieldDraft.species='직박구리';fieldDraft.visibilityRadius='20';document.getElementById('fieldVisibilityRadius').value='20';fieldTurnstileToken='synthetic-token';fieldSubmitCreate();");await waitEval(e,"!fieldBusy&&fieldStepName==='created'");
   const s=await e("({create:__mock.actions.filter(x=>x.path==='/field-updates'&&x.method==='POST').at(-1),reports:__mock.reports.length,button:Array.from(document.querySelectorAll('#fieldBody button')).some(x=>x.textContent==='출현종 제보로 남기기'),mine:fieldIsMine(__mock.created.id),viewer:fieldViewer,publicHasCreated:fieldUpdates.some(x=>x.id===__mock.created.id),receipt:document.getElementById('fieldBody').textContent})");
   await snap(page,'created-optin-'+width);return {pass:blockedOldWorker&&s.create.payload.visibilityRadius==='20'&&s.reports===0&&s.button&&s.mine&&s.viewer===null&&!s.publicHasCreated&&s.receipt.includes('20km 공개')&&s.receipt.includes('현재 GPS')&&s.receipt.includes('내 주변 소식 확인'),evidence:{blockedOldWorker,...s}};
  });
  await scenario(page,width,'created-receipt-explicit-GPS-fetches-own-news-no-optimistic-content',async e=>{
   const before=await e('__mock.geo.length');
   await e("__mock.deferRead=true;Array.from(document.querySelectorAll('#fieldBody button')).find(x=>x.textContent==='내 주변 소식 확인').click()");
   const pending=await e("({closed:document.getElementById('fieldPanel').hidden,geo:__mock.geo.length,busy:fieldViewerBusy,buttonDisabled:document.querySelector('.fieldNewsLocate')?.disabled,own:fieldUpdates.some(x=>x.id===__mock.created.id)})");
   await e("__mock.geo.at(-1).ok(__mock.fix())");await e(settle);const beforeResponse=await e('fieldUpdates.some(x=>x.id===__mock.created.id)');
   await e("__mock.deferRead=false;__mock.deferred.splice(0).forEach(r=>r())");await waitEval(e,'fieldUpdates.some(x=>x.id===__mock.created.id)');
   const s=await e("({shown:document.querySelector('#fieldNewsBox .fieldNewsList')?.textContent.includes(__mock.created.species),request:__mock.actions.filter(x=>x.path==='/field-updates/read').at(-1),reports:__mock.reports.length,buttonsFit:Array.from(document.querySelectorAll('#fieldNewsBox button')).every(x=>x.scrollWidth<=x.clientWidth+1)})");
   await snap(page,'own-news-after-GPS-'+width);return {pass:pending.closed&&pending.geo===before+1&&pending.busy&&pending.buttonDisabled&&!pending.own&&!beforeResponse&&s.shown&&!!s.request.payload.viewer&&s.reports===0&&s.buttonsFit,evidence:{pending,beforeResponse,...s}};
  });
  await scenario(page,width,'map-created5-does-not-borrow-location-outside-hidden-nearby-shown',async e=>{
   await e("fieldViewerClear(true);openFieldPanel();fieldStartForm('visible');fieldDraft.species='직박구리';fieldDraft.source='map';fieldDraft.lat=37.1;fieldDraft.lon=127.1;fieldDraft.visibilityRadius='5';document.getElementById('fieldVisibilityRadius').value='5';fieldTurnstileToken='synthetic-token';fieldSubmitCreate();");await waitEval(e,"!fieldBusy&&fieldStepName==='created'");
   const saved=await e("({source:__mock.actions.filter(x=>x.path==='/field-updates'&&x.method==='POST').at(-1).payload.locationSource,viewer:fieldViewer,receipt:document.getElementById('fieldBody').textContent,shown:fieldUpdates.some(x=>x.id===__mock.created.id)})");
   await e("Array.from(document.querySelectorAll('#fieldBody button')).find(x=>x.textContent==='내 주변 소식 확인').click();var far=__mock.fix();far.coords.latitude=36;__mock.geo.at(-1).ok(far)");await e(settle);await e('loadFieldUpdates()');
   const far=await e("({found:fieldFind(__mock.created.id)!==null,marker:!!fieldMarkers[__mock.created.id],inBox:document.getElementById('fieldNewsBox').textContent.includes('직박구리')})");
   await e("document.querySelector('.fieldNewsLocate').click();__mock.geo.at(-1).ok(__mock.fix())");await waitEval(e,'fieldUpdates.some(x=>x.id===__mock.created.id)');
   const near=await e('!!fieldMarkers[__mock.created.id]&&fieldNewsList().some(x=>x.id===__mock.created.id)');return {pass:saved.source==='map'&&saved.viewer===null&&!saved.shown&&saved.receipt.includes('5km 공개')&&!far.found&&!far.marker&&!far.inBox&&near,evidence:{saved,far,near}};
  });
  await scenario(page,width,'own-card-prefill-cancel-no-auto-submit',async e=>{
   await e(locate);await e(settle);await e('publicationRefresh()');await e(settle);
   await e("fieldReportDraft(__mock.created.id)");await waitEval(e,"document.getElementById('reportModal').style.display==='flex'");
   const s=await e("({species:document.getElementById('reportSpecies').value,date:document.getElementById('reportObservedOn').value,note:document.getElementById('reportNote').value,pick:reportPicked,confirmed:reportFieldSource.locationConfirmed,nonbreeding:document.getElementById('reportNonBreedingConfirmed').checked,consent:document.getElementById('reportNamePublic').checked,notice:document.getElementById('reportFieldNotice').textContent,reports:__mock.reports.length})");
   await snap(page,'report-prefill-'+width);await e("closeReportModal()");return {pass:s.species==='직박구리'&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.note.includes('현장소식 최초 관찰')&&s.pick&&s.pick.lat===37.1&&!s.confirmed&&!s.nonbreeding&&!s.consent&&s.notice.includes('반경')&&s.reports===0,evidence:s};
  });
  await scenario(page,width,'final-submit-only-after-point-nonbreeding-captcha-singleflight',async e=>{
   await e("fieldReportDraft(__mock.created.id)");await waitEval(e,"document.getElementById('reportModal').style.display==='flex'");await e(settle);
   await e("reportTurnstileToken='synthetic-token';submitReport();");const pointGate=await e("__mock.reports.length===0&&document.getElementById('reportMessage').textContent.includes('관찰 위치')");
   await e("document.getElementById('reportFieldLocationConfirm').click();submitReport();");const breedGate=await e("__mock.reports.length===0&&document.getElementById('reportMessage').textContent.includes('번식')");
   await e("document.getElementById('reportNonBreedingConfirmed').checked=true;reportTurnstileToken='';submitReport();");const captchaGate=await e("__mock.reports.length===0&&document.getElementById('reportMessage').textContent.includes('자동 등록')");
   await e("reportTurnstileToken='synthetic-token';__mock.deferReports=true;document.getElementById('reportSubmitBtn').click();submitReport();");await e(settle);
   const s=await e("({reports:__mock.reports.length,payload:__mock.reports[0],busy:reportSubmitting,request:__mock.reportReplies.length})");
   await e("__mock.reportReplies.splice(0).forEach(r=>r());__mock.deferReports=false;");await waitEval(e,"!reportSubmitting");await e("closeReportModal()");
   return {pass:pointGate&&breedGate&&captchaGate&&s.reports===1&&s.busy&&s.request===1&&s.payload.non_breeding_confirmed===true&&s.payload.namePublic===false&&!!s.payload.request_id,evidence:{pointGate,breedGate,captchaGate,...s}};
  });
  await scenario(page,width,'protected-draft-never-transfers-coordinate',async e=>{
   await e("__mock.draftProtected=true;fieldReportDraft(__mock.created.id)");await waitEval(e,"document.getElementById('reportModal').style.display==='flex'");
   const s=await e("({pick:reportPicked,confirmHidden:document.getElementById('reportFieldLocationConfirm').hidden,notice:document.getElementById('reportFieldNotice').textContent,reports:__mock.reports.length})");await e("closeReportModal();__mock.draftProtected=false;");return {pass:s.pick===null&&s.confirmHidden&&s.notice.includes('보호 위치')&&s.reports===1,evidence:s};
  });
  await scenario(page,width,'viewer-one-shot-and-body-not-query-no-persistence',async e=>{
   await e(fresh);const before=await e('__mock.geo.length');await e(locate);await e(settle);
   const s=await e("({ids:fieldUpdates.map(x=>x.id),geo:__mock.geo.length,watches:__mock.watches.size,action:__mock.actions.filter(x=>x.path==='/field-updates/read').at(-1),store:Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]).filter(x=>/viewer|capturedAt|latitude|longitude/.test(x.join(' ')))})");
   return {pass:s.ids.includes('22222222-2222-4222-8222-222222222222')&&s.geo===before+1&&s.watches===0&&s.action.method==='POST'&&s.action.payload.viewer.accuracy===15&&s.store.length===0,evidence:s};
  });
  await scenario(page,width,'viewer-error-or-poor-or-old-GPS-only-all',async e=>{
   const states=[];for(const mode of ['error','accuracy','stale']){await e('fieldViewerClear(false);fieldViewerLocate();');await e(mode==='error'?"__mock.geo.at(-1).error({code:1})":mode==='accuracy'?"__mock.geo.at(-1).ok(__mock.fix(1001))":"__mock.geo.at(-1).ok(__mock.fix(15,31000))");await e(settle);states.push(await e("({viewer:fieldViewer,ids:fieldUpdates.map(x=>x.id)})"));}
   return {pass:states.every(s=>s.viewer===null&&s.ids.length===1&&s.ids[0].startsWith('1111')),evidence:{states}};
  });
  await scenario(page,width,'viewer-clear-blocks-late-GPS-and-delayed-nearby-response',async e=>{
   await e("fieldViewerLocate();window.__oldFix=__mock.geo.at(-1);fieldViewerClear(false);__oldFix.ok(__mock.fix());");const late=await e('fieldViewer===null');
   await e("__mock.deferRead=true;"+locate);await e(settle);const queued=await e('__mock.deferred.length');await e("fieldViewerClear(true);__mock.deferRead=false;__mock.deferred.splice(0).forEach(r=>r());");await e(settle);
   const s=await e("({viewer:fieldViewer,ids:fieldUpdates.map(x=>x.id),markers:Object.keys(fieldMarkers),guide:fieldGuide})");return {pass:late&&queued>0&&s.viewer===null&&!s.ids.some(x=>x.startsWith('2222'))&&!s.markers.some(x=>x.startsWith('2222'))&&s.guide===null,evidence:{late,queued,...s}};
  });
  await scenario(page,width,'viewer30sec-expiry-hidden-blur-pageshow-clear',async e=>{
   const states=[];for(const mode of ['age','hidden','blur','pageshow','permission']){await e(locate);await e(settle);if(mode==='age')await e('fieldViewer.started-=30001;fieldViewerPayload()');if(mode==='hidden')await e("__mock.hidden=true;document.dispatchEvent(new Event('visibilitychange'));__mock.hidden=false;");if(mode==='blur')await e("window.dispatchEvent(new Event('blur'))");if(mode==='pageshow')await e("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");if(mode==='permission')await e("__mock.permission.state='denied';__mock.permission.onchange()");await e(settle);states.push(await e("({viewer:fieldViewer,near:fieldUpdates.some(x=>x.id.startsWith('2222')),guide:fieldGuide})"));}
   const renewal=await e("({visible:!document.getElementById('fieldNewsBox').hidden,button:!!document.querySelector('.fieldNewsLocate'),ownContent:document.querySelector('#fieldNewsBox .fieldNewsList')?.textContent.includes('직박구리')||false})");
   return {pass:states.every(s=>s.viewer===null&&!s.near&&s.guide===null)&&renewal.visible&&renewal.button&&!renewal.ownContent,evidence:{states,renewal}};
  });
  await scenario(page,width,'empty-and-folded-box-GPS-denial-and-authority-loss',async e=>{
   await e('window.__savedFields=__mock.fields;__mock.fields=[];fieldViewerClear(false);publicationInvalidate("empty test");');await e(refresh);await e(settle);
   const before=await e('__mock.geo.length');const empty=await e("({visible:!document.getElementById('fieldNewsBox').hidden,text:document.getElementById('fieldNewsBox').textContent,button:!!document.querySelector('.fieldNewsLocate')})");
   await e("fieldNewsOpen=false;renderFieldNews();document.querySelector('.fieldNewsLocate').click();document.querySelector('.fieldNewsLocate').click();");
   const pending=await e("({geo:__mock.geo.length,disabled:document.querySelector('.fieldNewsLocate').disabled})");
   await e('__mock.geo.at(-1).error({code:1});fieldNewsOpen=true;renderFieldNews()');await e(settle);
   const failed=await e("({text:document.getElementById('fieldNewsBox').textContent,visible:!document.getElementById('fieldNewsBox').hidden,disabled:document.querySelector('.fieldNewsLocate')?.disabled,viewer:fieldViewer,ids:fieldUpdates.map(x=>x.id),rect:document.getElementById('fieldNewsBox').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth})");
   await snap(page,'empty-GPS-denied-'+width);await e('publicationInvalidate("authority test")');const hidden=await e('document.getElementById("fieldNewsBox").hidden');
   await e('__mock.fields=__savedFields;');await e(refresh);await e(settle);
   return {pass:empty.visible&&empty.button&&empty.text.includes('0건')&&!empty.text.includes('직박구리')&&pending.geo===before+1&&pending.disabled&&failed.visible&&!failed.disabled&&failed.viewer===null&&failed.ids.length===0&&failed.text.includes('권한이 거부')&&failed.rect.left>=0&&failed.rect.right<=width&&!failed.overflow&&hidden,evidence:{empty,pending,failed,hidden}};
  });
  await scenario(page,width,'monotonic-GPS-expiry-closes-route-even-before-timer',async e=>{
   await e(locate);await e(settle);const s=await e("(function(){var u=fieldFind('22222222-2222-4222-8222-222222222222');clearTimeout(fieldViewerTimer);fieldViewer.started-=30001;var scope=fieldScopeAllowed(u),point=fieldPublicPoint(u),found=fieldFind(u.id);return {scope,point,found,viewer:fieldViewer};})()");return {pass:s.scope===false&&s.point===null&&s.found===null&&s.viewer===null,evidence:s};
  });
  await scenario(page,width,'own-receipt-menu-later-optin-with-no-GPS-no-public-content',async e=>{
   await e('fieldViewerClear(true)');await e(settle);await e('openFieldPanel()');
   const s=await e("(function(){var box=Array.from(document.querySelectorAll('#fieldBody details')).find(x=>x.textContent.includes('내가 등록한 소식'));return {found:!!box,text:box?.textContent,publicHasCreated:fieldUpdates.some(x=>x.id===__mock.created.id),gps:fieldViewer,reports:__mock.reports.length};})()");
   await e("Array.from(document.querySelectorAll('#fieldBody details button')).find(x=>x.textContent==='출현종 제보로 남기기').click()");await waitEval(e,"document.getElementById('reportModal').style.display==='flex'");const opened=await e("document.getElementById('reportSpecies').value==='직박구리'&&__mock.reports.length===1");await e('closeReportModal()');return {pass:s.found&&!s.publicHasCreated&&s.gps===null&&!s.text.includes('직박구리')&&!s.text.includes('37.1')&&opened,evidence:{...s,opened}};
  });
  await scenario(page,width,'navigation-new-far-GPS-or-error-clears-reader-and-route',async e=>{
   const states=[];for(const mode of ['far','error']){await e(locate);await e(settle);await e("fieldNewsNavigate('22222222-2222-4222-8222-222222222222',true)");await e(mode==='far'?"var far=__mock.fix();far.coords.latitude=36;__mock.geo.at(-1).ok(far);":"__mock.geo.at(-1).error({code:1})");await e(settle);states.push(await e("({viewer:fieldViewer,near:fieldUpdates.some(x=>x.id.startsWith('2222')),guide:fieldGuide,chooser:!!document.getElementById('fieldNavChoice')})"));}
   return {pass:states.every(x=>x.viewer===null&&!x.near&&x.guide===null&&!x.chooser),evidence:{states}};
  });
  await scenario(page,width,'movement-during-empty-pending-read-rejects-old-location-without-renewal',async e=>{
   await e(locate);await e(settle);const lease=await e('({started:fieldViewer.started,capturedAt:fieldViewer.capturedAt,generation:fieldViewerRequest})');
   await e("fieldUpdates=[];__mock.deferRead=true;window.__pendingMovement=loadFieldUpdates();");await e(settle);await e("var moved=__mock.fix();moved.coords.latitude=36;fieldViewerObservePosition(moved);var old=__mock.fix();old.timestamp=fieldViewer.capturedAt-1;fieldViewerObservePosition(old);__mock.deferRead=false;__mock.deferred.splice(0).forEach(r=>r());");await e('__pendingMovement');await e(settle);
   const s=await e("({viewer:fieldViewer,near:fieldUpdates.some(x=>x.id.startsWith('2222')),generation:fieldViewerRequest})");return {pass:s.viewer.lat===36&&s.viewer.started===lease.started&&s.viewer.capturedAt===lease.capturedAt&&s.generation>lease.generation&&!s.near,evidence:{lease,...s}};
  });
  await scenario(page,width,'owner-receipt-storage-updates-and-write-denied-fallback',async e=>{
   const s=await e("(function(){var own=__mock.created.id;localStorage.setItem(FIELD_MINE_KEY,JSON.stringify([own]));fieldMineIds();var other='44444444-4444-4444-8444-444444444444';localStorage.setItem(FIELD_MINE_KEY,JSON.stringify([own,other]));var cross=fieldMineIds().includes(other);var real=Storage.prototype.setItem;try{Storage.prototype.setItem=function(){throw Error('Synthetic write denied')};fieldMineSave([own]);var fallback=fieldMineIds().includes(own)&&!fieldMineIds().includes(other);return {cross,fallback,dirty:fieldMemoryMineDirty};}finally{Storage.prototype.setItem=real;fieldMineSave([own]);}})()");return {pass:s.cross&&s.fallback&&s.dirty,evidence:s};
  });
  if(width<769)await scenario(page,width,'watch-GPS-does-not-renew-reader-and-exit-stops-tracking',async e=>{
   await e(locate);await e(settle);const lease=await e('fieldViewer.started');await e("fieldGuideStart('22222222-2222-4222-8222-222222222222',true)");await e(settle);await e("Array.from(__mock.watches.values()).at(-1).ok(__mock.fix())");await e(settle);const sameLease=await e('fieldViewer&&fieldViewer.started==='+lease);
   await e("var far=__mock.fix();far.coords.latitude=36;Array.from(__mock.watches.values()).at(-1).ok(far)");await e(settle);const s=await e("({viewer:fieldViewer,guide:fieldGuide,watches:__mock.watches.size,near:fieldUpdates.some(x=>x.id.startsWith('2222'))})");return {pass:sameLease&&s.viewer===null&&s.guide===null&&s.watches===0&&!s.near,evidence:{sameLease,...s}};
  });
  await scenario(page,width,'mobile-PC-panel-within-viewport',async e=>{
   await e("openFieldPanel();fieldStartForm('visible');");const s=await e("(function(){var p=document.getElementById('fieldPanel').getBoundingClientRect(),v=document.getElementById('fieldVisibilityRadius').getBoundingClientRect();return {viewport:innerWidth,panel:{left:p.left,right:p.right},select:{left:v.left,right:v.right},overflow:document.documentElement.scrollWidth>innerWidth};})()");await snap(page,'final-form-'+width);return {pass:s.panel.left>=-1&&s.panel.right<=width+1&&s.select.left>=0&&s.select.right<=width+1&&!s.overflow,evidence:s};
  });
 }catch(error){check(width,'environment-or-harness',false,{error:String(error.stack)});}finally{if(page)await page.close();}
 let isolated;try{isolated=await browser.page(width,{blockStorage:true});const e=isolated.evaluate;await e(refresh);await e("openFieldPanel();fieldStartForm('visible');__mock.geo.at(-1).ok(__mock.fix());fieldDraft.species='어치';fieldTurnstileToken='synthetic-token';fieldSubmitCreate();");await waitEval(e,"!fieldBusy&&fieldStepName==='created'");await e("Array.from(document.querySelectorAll('#fieldBody button')).find(x=>x.textContent==='출현종 제보로 남기기').click()");await waitEval(e,"document.getElementById('reportModal').style.display==='flex'");const s=await e("({mine:fieldIsMine(__mock.created.id),species:document.getElementById('reportSpecies').value,reports:__mock.reports.length,createDevice:__mock.actions.find(x=>x.path==='/field-updates'&&x.method==='POST').payload.deviceId,draftDevice:__mock.actions.find(x=>x.path.endsWith('/report-draft')).payload.deviceId})");check(width,'storage-denied-immediate-optin-keeps-owner-device',s.mine&&s.species==='어치'&&s.reports===0&&s.createDevice===s.draftDevice,s);}catch(error){check(width,'storage-denied-immediate-optin',false,{error:String(error.stack)});}finally{if(isolated)await isolated.close();}}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'issue28-actual-chrome-v1',at:new Date().toISOString(),indexSha256:createHash('sha256').update(HTML).digest('hex'),widths,rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0},network,browserErrors,scope:'Actual current index.html in installed Chrome with actual CDN Leaflet; synthetic API and GPS only. No production D1 or user data. Browser tests do not assert server range enforcement; real handler/D1 tests cover it separately.'};
writeFileSync(join(OUT,'ISSUE28_CHROME.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary:result.summary,network,browserErrors,failures:rows.filter(x=>!x.pass)},null,2));process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
