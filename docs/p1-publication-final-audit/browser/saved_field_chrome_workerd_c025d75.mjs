import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,process.env.PUBLICATION_TEST_OUTPUT||'docs/p1-publication-final-audit/browser/c025d75-saved-protected'); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
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
     if(method==='POST'&&u.pathname.startsWith('/field-updates/')&&m.apiSteps&&m.apiSteps.length){const action=u.pathname.split('/').at(-1),step=m.apiSteps.shift();if(step.action!==action)return reply({ok:false,error:{message:'fixture action mismatch'}},409);const payload=JSON.parse(options.body||'{}');if(step.status&&payload.status!==step.status)return reply({ok:false,error:{message:'fixture status mismatch'}},409);m.mutationReceipts=(m.mutationReceipts||[]).concat([{path:u.pathname,payload,response:step.receipt}]);m.field=step.afterDto?[step.afterDto]:[];m.revision=String(BigInt(m.revision)+1n);return reply(step.receipt.body,step.receipt.status);}
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

const FIXTURE_PATH=process.env.SAVED_FIELD_FIXTURE_PATH||join(OUT,'actual_api_fixture.json');
const fixture=JSON.parse(readFileSync(FIXTURE_PATH,'utf8'));
if(fixture.sourceSha!=='c025d75f964ab36f6f2eae541a99461f6de59b70')throw Error('API fixture source mismatch');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function check(width,id,pass,evidence={}){rows.push({width,id,pass:pass===true,evidence});}
async function scenario(p,w,id,fn){try{const result=await fn(p.evaluate);check(w,id,result.pass,result.evidence||{});}catch(error){check(w,id,false,{error:String(error.stack).slice(0,1000)});}}
async function install(e,dto){await e("fieldNavChoiceClose();fieldGuideStop();closeFieldPanel();__mock.apiSteps=[];__mock.mutationReceipts=[];__mock.revision=String(BigInt(__mock.revision)+1n);__mock.field="+JSON.stringify(dto?[dto]:[])+";__mock.approved=[];__mock.pendingSpots=[];publicationInvalidate();loadFieldUpdates()");}
const launchSetup="window.__routeLog=[];window.open=function(initial){var r={kind:'window',initial,assigned:[],closed:false};__routeLog.push(r);return {opener:window,location:{set href(v){r.assigned.push(v);}},close:function(){r.closed=true;}};};window.__actualTmap=tmapNavigationUrl;tmapNavigationUrl=function(dest,label){var url=__actualTmap(dest,label);__routeLog.push({kind:'tmap-url',dest:dest,url:url});return url;};openTmapNavigation=function(){__routeLog.push({kind:'tmap-attempt'});return false;};";
const fieldSnapshot="(function(){return {updates:fieldUpdates.map(x=>({id:x.id,species:x.species,lat:x.lat,lon:x.lon,hidden:x.locationHidden,status:x.status})),markers:Object.keys(fieldMarkers).map(id=>({id,point:[fieldMarkers[id].marker.getLatLng().lat,fieldMarkers[id].marker.getLatLng().lng]})),popup:fieldMap()._popup?.getElement()?.textContent||'',chooser:!!document.getElementById('fieldNavChoice'),routeAnchors:Array.from(document.querySelectorAll('#fieldNavChoice a')).map(x=>({app:x.dataset.publicationApp,href:x.getAttribute('href')})),guide:!!fieldGuide,geoCount:__mock.geo.length};})()";
try{
 for(const width of widths){let page;try{
  page=await browser.page(width);const e=page.evaluate;await e(launchSetup);
  for(const item of fixture.cases.filter(x=>x.kind==='unverified-protected')){
   await scenario(page,width,'stored-'+item.label+'-withheld-state',async e=>{await install(e,item.dto);const s=await e(fieldSnapshot),privatePoint=fixture.syntheticSqlRowProof.find(x=>x.id===item.id).privateSyntheticPoint;const residual=s.updates.some(x=>x.id===item.id)||s.markers.some(x=>x.id===item.id)||s.popup.includes(String(privatePoint.lat))||s.popup.includes(String(privatePoint.lon));return {pass:item.dto.locationHidden===true&&item.dto.lat===null&&item.dto.lon===null&&!residual,evidence:{apiDto:item.dto,product:s,receiptFilteredByCoordinateRequirement:!s.updates.some(x=>x.id===item.id)}};});
   await scenario(page,width,'stored-'+item.label+'-no-navigation',async e=>{await e("__routeLog=[];fieldNewsNavigate("+JSON.stringify(item.id)+");fieldGuideStart("+JSON.stringify(item.id)+");new Promise(r=>setTimeout(r,120))");const s=await e(fieldSnapshot),log=await e('__routeLog');return {pass:!s.chooser&&!s.guide&&!s.routeAnchors.length&&!log.some(x=>x.kind==='tmap-attempt'||x.assigned?.length),evidence:{product:s,log}};});
  }
  const masked=fixture.cases.find(x=>x.kind==='verified-masked');
  await scenario(page,width,'stored-masked-proof-approx-marker-no-directions',async e=>{await install(e,masked.dto);await e("fieldNewsShow("+JSON.stringify(masked.id)+");fieldNewsNavigate("+JSON.stringify(masked.id)+");new Promise(r=>setTimeout(r,120))");const s=await e(fieldSnapshot),privatePoint=fixture.syntheticSqlRowProof.find(x=>x.id===masked.id).privateSyntheticPoint;const marker=s.markers.find(x=>x.id===masked.id);return {pass:!!marker&&marker.point[0]===masked.dto.lat&&marker.point[1]===masked.dto.lon&&(marker.point[0]!==privatePoint.lat||marker.point[1]!==privatePoint.lon)&&s.popup.includes('대략')&&!s.routeAnchors.length&&!s.guide&&!s.chooser,evidence:{apiDto:masked.dto,product:s}};});
  const protectedShot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);writeFileSync(join(OUT,'saved-masked-popup-'+width+'.png'),Buffer.from(protectedShot.data,'base64'));
  for(const item of fixture.cases.filter(x=>x.kind==='normal')){
   await scenario(page,width,'normal-'+item.label+'-marker-and-route-chooser',async e=>{await install(e,item.dto);await e("fieldNavChooser(fieldFind("+JSON.stringify(item.id)+"),'합성 API DTO');");const s=await e(fieldSnapshot),marker=s.markers.find(x=>x.id===item.id);return {pass:!!marker&&marker.point[0]===item.dto.lat&&marker.point[1]===item.dto.lon&&s.routeAnchors.some(x=>x.app==='kakao'&&x.href==='#')&&s.routeAnchors.some(x=>x.app==='tmap'&&x.href==='#'),evidence:{apiDto:item.dto,product:s}};});
   for(const app of ['kakao','tmap'])await scenario(page,width,'normal-'+item.label+'-'+app+'-fresh-launch-target',async e=>{await e("fieldNavChooser(fieldFind("+JSON.stringify(item.id)+"),'합성 API DTO');__routeLog=[];document.querySelector('#fieldNavChoice a[data-publication-app=\""+app+"\"]').click();new Promise(r=>setTimeout(r,120))");const log=await e('__routeLog'),url=app==='kakao'?log.flatMap(x=>x.assigned||[])[0]:log.find(x=>x.kind==='tmap-url')?.url;return {pass:typeof url==='string'&&url.includes(String(item.dto.lat))&&url.includes(String(item.dto.lon)),evidence:{log,url}};});
  }
  const owner=fixture.createdOwner;
  await scenario(page,width,'stored-protected-owner-marker-and-delete-button',async e=>{await install(e,owner.initialDto);await e("localStorage.setItem('birdmapFieldDevice',"+JSON.stringify(owner.ownerDevice||'publication-owner-aaaaaaaa')+");fieldMineAdd("+JSON.stringify(owner.id)+");fieldNewsShow("+JSON.stringify(owner.id)+");new Promise(r=>setTimeout(r,120))");const s=await e(fieldSnapshot),button=await e("!!document.querySelector('.fieldDeleteBtn')");return {pass:s.markers.some(x=>x.id===owner.id)&&owner.initialDto.locationHidden===true&&button&&!s.guide&&!s.routeAnchors.length,evidence:{apiDto:owner.initialDto,product:s,deleteButton:button}};});
  for(const step of owner.steps.filter(x=>x.action==='status'))await scenario(page,width,'stored-protected-owner-'+step.status+'-actual-receipt',async e=>{await e("__mock.apiSteps="+JSON.stringify([step])+";fieldStatusStart("+JSON.stringify(owner.id)+","+JSON.stringify(step.status)+");fieldTurnstileToken='synthetic-token';fieldSubmitStatus();true");const until=Date.now()+3000;let state;while(Date.now()<until){state=await e("({busy:fieldBusy,current:fieldFind("+JSON.stringify(owner.id)+"),receipts:__mock.mutationReceipts})");if(!state.busy&&state.current?.status===step.status)break;await wait(75);}return {pass:!state.busy&&state.current?.status===step.status&&state.current?.locationHidden===true&&state.current?.lat===step.afterDto.lat&&state.current?.lon===step.afterDto.lon&&state.receipts.at(-1)?.response.status===201,evidence:{expectedReceipt:step.receipt,product:state}};});
  await scenario(page,width,'stored-protected-owner-delete-actual-receipt',async e=>{await e("__mock.apiSteps="+JSON.stringify(owner.steps.filter(x=>x.action==='delete'))+";fieldNewsShow("+JSON.stringify(owner.id)+");document.querySelector('.fieldDeleteBtn').click();true");const until=Date.now()+3000;let state;while(Date.now()<until){state=await e("({busy:fieldBusy,current:fieldFind("+JSON.stringify(owner.id)+"),mine:fieldIsMine("+JSON.stringify(owner.id)+"),marker:!!fieldMarkers["+JSON.stringify(owner.id)+"],tombstone:!!fieldTombstones["+JSON.stringify(owner.id)+"],receipts:__mock.mutationReceipts})");if(!state.busy&&state.current===null&&state.marker===false)break;await wait(75);}return {pass:!state.busy&&state.current===null&&!state.mine&&!state.marker&&state.tombstone&&state.receipts.at(-1)?.response.status===200,evidence:state};});
 }catch(error){check(width,'environment-or-harness',false,{error:String(error.stack).slice(0,1000)});}finally{if(page)await page.close();}}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'birdmap-saved-field-api-chrome-v1',sourceSha:process.env.PUBLICATION_TEST_INDEX_REF,sourceTree:process.env.PUBLICATION_TEST_ASSET_REF,indexSha256:createHash('sha256').update(HTML).digest('hex'),apiFixtureSchema:fixture.schema,apiFixtureSource:fixture.sourceSha,apiFixtureSha256:createHash('sha256').update(readFileSync(FIXTURE_PATH)).digest('hex'),checkedAt:new Date().toISOString(),widths,rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0,notRun:0},network,browserErrors,limitations:['Actual DTO/receipt generation uses pinned product handleRequest with real SQL in SQLite; in-page transport replays those responses with synthetic publication heads.','Legacy withheld-null rows are intentionally filtered by current fieldValidUpdate and cannot be selected in the map owner UI; API metadata and known-ID owner status/delete receipts remain separate.','No physical GPS, native navigation app, operating API or user data access.']};
writeFileSync(join(OUT,'SAVED_FIELD_CHROME.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceSha:result.sourceSha,summary:result.summary,network,browserErrors,result:join(OUT,'SAVED_FIELD_CHROME.json')},null,2));process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
