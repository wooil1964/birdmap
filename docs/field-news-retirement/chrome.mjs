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
   if(u.pathname.startsWith('/field-updates'))return reply({ok:false,error:{code:'FIELD_NEWS_RETIRED'}},410);
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
  while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof publicationFetch==='function'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===206").catch(()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
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
const refresh="Promise.all([loadApprovedReports(),loadPendingReports(),loadRecentSiteSightings()])";
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
  await scenario(page,width,'retired-no-field-UI-functions-requests-or-GPS',async e=>{
   const s=await e("({nodes:document.querySelectorAll('#fieldToggleBtn,#fieldPanel,#fieldNewsBox,#fieldGuideBox,#reportFieldNotice,#reportFieldLocationConfirm').length,functions:[typeof openFieldPanel,typeof fieldViewerLocate,typeof fieldReportDraft,typeof initFieldUpdates],requests:__mock.actions.filter(x=>x.path.startsWith('/field-updates')).length,gps:__mock.geo.length,watches:__mock.watches.size})");
   return {pass:s.nodes===0&&s.functions.every(x=>x==='undefined')&&s.requests===0&&s.gps===0&&s.watches===0,evidence:s};
  });
  await scenario(page,width,'lifecycle-refresh-cannot-revive-retired-feature',async e=>{
   await e("localStorage.setItem('birdmapFieldMine',JSON.stringify(['33333333-3333-4333-8333-000000000001']));window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));__mock.hidden=true;document.dispatchEvent(new Event('visibilitychange'));__mock.hidden=false;document.dispatchEvent(new Event('visibilitychange'));");await e(refresh);await e(settle);
   const s=await e("({requests:__mock.actions.filter(x=>x.path.startsWith('/field-updates')).length,gps:__mock.geo.length,nodes:document.querySelectorAll('[id^=field]').length,reports:__mock.reports.length,sites:siteData.length,unique:new Set(siteData.map(x=>x.id)).size,map:!!map_7010a44f6ac2025090f0fe07508ed485.getContainer()})");
   return {pass:s.requests===0&&s.gps===0&&s.nodes===0&&s.reports===0&&s.sites===206&&s.unique===206&&s.map,evidence:s};
  });
  await scenario(page,width,'ordinary-report-cancel-does-not-submit',async e=>{
   await e("openReportModal();closeReportModal()");const s=await e("({reports:__mock.reports.length,fieldLink:!!document.getElementById('reportFieldNotice'),species:!!document.getElementById('reportSpecies')})");return {pass:s.reports===0&&!s.fieldLink&&s.species,evidence:s};
  });
  await scenario(page,width,'ordinary-report-retains-nonbreeding-captcha-and-singleflight',async e=>{
   await e("openReportModal();setReportLocation(37.1,127.1);document.getElementById('reportSpecies').value='직박구리';document.getElementById('reportNonBreedingConfirmed').checked=false;reportTurnstileToken='synthetic-token';submitReport()");
   const breeding=await e("__mock.reports.length===0&&document.getElementById('reportMessage').textContent.includes('번식')");
   await e("document.getElementById('reportNonBreedingConfirmed').checked=true;reportTurnstileToken='';submitReport()");const captcha=await e("__mock.reports.length===0&&document.getElementById('reportMessage').textContent.includes('자동 등록')");
   await e("reportTurnstileToken='synthetic-token';__mock.deferReports=true;submitReport();submitReport()");await e(settle);const s=await e("({count:__mock.reports.length,busy:reportSubmitting,pending:__mock.reportReplies.length,nonbreeding:__mock.reports[0]?.non_breeding_confirmed,request:!!__mock.reports[0]?.request_id})");
   await e("__mock.reportReplies.splice(0).forEach(r=>r());__mock.deferReports=false");await waitEval(e,'!reportSubmitting');await e('closeReportModal()');return {pass:breeding&&captcha&&s.count===1&&s.busy&&s.pending===1&&s.nonbreeding&&s.request,evidence:{breeding,captcha,...s}};
  });
  await scenario(page,width,'report-and-map-layout-fit-after-removal',async e=>{
   const s=await e("({overflow:document.documentElement.scrollWidth>innerWidth,report:!!document.getElementById('reportToggleBtn'),retiredRequests:__mock.actions.filter(x=>x.path.startsWith('/field-updates')).length,fieldHTML:document.body.innerText.includes('현장소식')})");await snap(page,'retired-current-'+width);return {pass:!s.overflow&&s.report&&s.retiredRequests===0&&!s.fieldHTML,evidence:s};
  });
  const added=JSON.parse(readFileSync(join(ROOT,'data/central-birding-sites-20261018.json'),'utf8')).records;
  for(const record of added){const expected=record.site;
   await scenario(page,width,'central-site-'+expected.id+'-search-popup-links',async e=>{
    const state=await e('('+function(expected){
     resetFilters();document.getElementById('searchBox').value=expected.name;searchSite();
     const site=siteData.find(s=>s.id===expected.id),marker=window[site.markerVar],map=map_7010a44f6ac2025090f0fe07508ed485;
     marker.openPopup();const box=marker.getPopup().getElement(),point=marker.getLatLng();
     const links=box?Array.from(box.querySelectorAll('a'),a=>a.href):[];
     return {search:sitePasses(site)&&document.getElementById('searchResults').textContent.includes(site.name),visible:map.hasLayer(marker),point:point.lat===expected.lat&&point.lng===expected.lon,
      birds:!!box&&expected.birds.split(',').every(b=>box.textContent.includes(b.trim())),scope:!!box&&box.textContent.includes('현재 출현을 뜻하지 않습니다'),
      links:[site.naverMapUrl,site.kakaoMapUrl,site.windyUrl].every(url=>links.includes(url)),overflow:document.documentElement.scrollWidth>innerWidth};
    }.toString()+')('+JSON.stringify(expected)+')');
    await new Promise(r=>setTimeout(r,400));
    if(expected.id==='203')await snap(page,'central-hwangguji-'+width);
    await e('map_7010a44f6ac2025090f0fe07508ed485.closePopup();resetFilters()');
    return {pass:state.search&&state.visible&&state.point&&state.birds&&state.scope&&state.links&&!state.overflow,evidence:state};
   });
  }
 }catch(error){check(width,'environment-or-harness',false,{error:String(error.stack)});}finally{if(page)await page.close();}}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'field-retirement-current-chrome-v1',at:new Date().toISOString(),indexSha256:createHash('sha256').update(HTML).digest('hex'),widths,rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0},network,browserErrors,scope:'Actual current index.html in installed Chrome with actual CDN Leaflet; synthetic API and GPS only. No production D1 or user data. Current app only: retired field feature must make no requests or GPS calls. Actual server retirement is tested separately.'};
writeFileSync(join(OUT,'ISSUE28_CHROME.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary:result.summary,network,browserErrors,failures:rows.filter(x=>!x.pass)},null,2));process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
