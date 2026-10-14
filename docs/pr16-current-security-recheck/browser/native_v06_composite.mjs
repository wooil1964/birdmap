import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,process.env.PUBLICATION_TEST_OUTPUT||'docs/pr16-current-security-recheck/v06-composite-final'); const ASSET_ROOT=resolve(process.env.PUBLICATION_TEST_ROOT||ROOT);
mkdirSync(OUT,{recursive:true});
const HTML=process.env.PUBLICATION_TEST_INDEX_REF?execFileSync('git',['show',process.env.PUBLICATION_TEST_INDEX_REF+':index.html'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}):readFileSync(join(ROOT,'index.html'),'utf8');
const widths=process.env.PUBLICATION_TEST_WIDTHS?process.env.PUBLICATION_TEST_WIDTHS.split(',').map(Number):[344,375,768,1024,1440];
const allowedCDN=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];
const network={allowedLocal:0,allowedDependencyGet:0,blockedOther:0,operatingRequests:0,externalNonGet:0};
const rows=[],browserErrors=[];
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';

const {localDb,installAuthStubs,environments,input,post,adminPost,uuid,ORIGIN}=await import('../../../reports-api/local-test/helpers.mjs');
const {handleRequest:actualPublic}=await import('../../../reports-api/src/public.js');
const modules=process.env.PR16_LOCAL_MODULES||'C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules';
const local=await localDb(modules),db=local.db,auth=await installAuthStubs(),envs=environments(db);envs.pub.REPORTS_PUBLICATION_REQUIRED='true';envs.admin.REPORTS_PUBLICATION_REQUIRED='true';
const apiEvidence=[];let seq=10000,ip=0;
const readPubRev=()=>db.prepare('SELECT CAST(revision AS TEXT) r FROM public_publication_state WHERE id=1').first('r');
async function seedReport(){const n=++seq,data=input(n,{species:'참새',lat:36+(n-10000)*0.01,lon:126+(n-10000)*0.01,observedOn:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),reporter:'합성제보'+n,namePublic:true});const res=await post(envs.pub,data);if(res.status!==201)throw Error('actual seed report status '+res.status);const review=await adminPost(envs.admin,auth.token,data.request_id,{request_id:uuid(++seq),expected_revision:1,action:'approve'});if(review.status!==200)throw Error('actual approve status '+review.status);const row=await db.prepare('SELECT lat,lon FROM reports WHERE id=?').bind(data.request_id).first();return {id:data.request_id,...row};}
const owner='synthetic-owner-device-aaaaaaaa';
async function fieldCall(id,action,body){return actualPublic(new Request('https://local.synthetic/field-updates'+(id?'/'+id+'/'+action:''),{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.'+(++ip%200+1)},body:JSON.stringify(body)}),envs.pub);}
async function seedField(){const n=++seq,res=await fieldCall(null,null,{species:'합성시험필드'+n,status:'visible',lat:37+n/1000000,lon:127+n/1000000,nickname:'합성현장'+n,deviceId:owner,turnstileToken:'synthetic-only'});const body=await res.json();if(res.status!==201)throw Error('actual seed field status '+res.status+' '+JSON.stringify(body));return {id:body.id,lat:37+n/1000000,lon:127+n/1000000};}
async function change(input){const before=await readPubRev();let res;
 if(input.kind==='hide'||input.kind==='withdraw'||input.kind==='unhide'||input.kind==='reapprove'){
 const rev=await db.prepare('SELECT revision FROM checklists WHERE checklist_id=?').bind(input.id).first('revision');const action={hide:'hide',withdraw:'unpublish',unhide:'hide',reapprove:'approve'}[input.kind];res=await adminPost(envs.admin,auth.token,input.id,{request_id:uuid(++seq),expected_revision:rev,action,...(action==='hide'?{hide:input.kind==='hide'}:{})});
 }else if(input.kind==='field-hide'){const row=await db.prepare('SELECT row_revision FROM field_updates WHERE id=?').bind(input.id).first();const result=await db.prepare('UPDATE field_updates SET location_hidden=1,public_lat=?,public_lon=?,row_revision=row_revision+1 WHERE id=? AND row_revision=?').bind(36.5,126.5,input.id,row.row_revision).run();const current=await db.prepare('SELECT row_revision,location_hidden,public_lat,public_lon FROM field_updates WHERE id=?').bind(input.id).first();if(!current||current.row_revision!==row.row_revision+1||current.location_hidden!==1||current.public_lat!==36.5||current.public_lon!==126.5)throw Error('local protected fixture CAS invariants failed');apiEvidence.push({type:'fixture-CAS-metadata',changes:result.meta.changes,rowsWritten:result.meta.rows_written,expectedBeforeRevision:row.row_revision,actualAfterRevision:current.row_revision,allMaskAndRevisionInvariantsVerified:true});res=new Response('{}',{status:200});}else if(input.kind==='delete')res=await fieldCall(input.id,'delete',{deviceId:owner});
 else throw Error('unknown synthetic control');
 const after=await readPubRev();apiEvidence.push({type:'actual-mutation',kind:input.kind,status:res.status,before,after});if(res.status!==200||BigInt(after)<=BigInt(before))throw Error('actual authority mutation failed');return {before,after,status:res.status};
}

const server=createServer(async(req,res)=>{
 const parsed=new URL(req.url,'http://localhost');
 if(parsed.pathname==='/__control'){
  try{let body='';for await(const chunk of req)body+=chunk;const result=await change(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
 }
 if(parsed.pathname.startsWith('/__api/')){
  try{let body='';for await(const chunk of req)body+=chunk;const path=parsed.pathname.slice('/__api'.length)+parsed.search;const response=await actualPublic(new Request('https://local.synthetic'+path,{method:req.method,headers:{Origin:ORIGIN,'Content-Type':'application/json'},...(req.method==='GET'?{}:{body})}),envs.pub);const raw=await response.text();const obj=JSON.parse(raw);apiEvidence.push({type:'actual-api',path:parsed.pathname.slice('/__api'.length),status:response.status,nonce:obj.publication?.nonce,revision:obj.publication?.revision,noStore:response.headers.get('Cache-Control')==='no-store'});res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(raw);}catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
 }

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
 let preset={};try{preset=JSON.parse(sessionStorage.getItem('publication-test-preset')||'{}');}catch{}
 const m=window.__bridge={...preset,actions:[],old:preset.old||{},attack:preset.attack||null,replaceNonce:true,afterData:null,geo:[],watches:new Map(),watchSeq:0};
 const rpc=async(path,options)=>realFetch('/__api'+path,options);
 const control=async body=>{const r=await realFetch('/__control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error('local control failed');return v;};
 m.control=control;
 window.fetch=async(input,options={})=>{
  const u=new URL(String(input),location.href),method=options.method||'GET';
  if(u.hostname.endsWith('workers.dev')){
   if(method!=='GET')throw Error('Browser user mutations prohibited');
   const r=await rpc(u.pathname+u.search,{...options,method:'GET'});const b=await r.json();
   m.actions.push({path:u.pathname,nonce:u.searchParams.get('nonce'),expectedRevision:u.searchParams.get('expectedRevision'),revision:b.publication?.revision,status:r.status,noStore:r.headers.get('Cache-Control')==='no-store'});
   let result=b, injected=false;
   if(r.ok&&(u.pathname==='/reports/approved'||u.pathname==='/field-updates')){
    if(m.attack===u.pathname&&m.old[u.pathname]){result=JSON.parse(JSON.stringify(m.old[u.pathname]));injected=true;if(m.replaceNonce)result.publication.nonce=u.searchParams.get('nonce');}
    else m.old[u.pathname]=JSON.parse(JSON.stringify(b));
    if(m.afterData&&m.afterData.path===u.pathname){const x=m.afterData;m.afterData=null;await control(x);}
   }
   m.actions[m.actions.length-1].injected=injected;m.actions[m.actions.length-1].returnedRevision=result.publication?.revision;m.actions[m.actions.length-1].returnedNonce=result.publication?.nonce;return new Response(JSON.stringify(result),{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(u.origin===location.origin&&method==='GET')return realFetch(input,options);
  throw Error('external or browser-write blocked');
 };
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(ok,error)=>m.geo.push({ok,error}),watchPosition:(ok,error)=>{const id=++m.watchSeq;m.watches.set(id,{ok,error});return id;},clearWatch:id=>m.watches.delete(id)}});
 window.matchMedia=q=>q.includes('pointer:fine')?{matches:innerWidth>768,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:fine(q);
 Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true});window.confirm=()=>true;window.turnstile={render:(host,options)=>{setTimeout(()=>options.callback('synthetic-token'),0);return 'synthetic-widget';},reset(){}};
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
    let allowed=(u.origin===origin)||(method==='GET'&&allowedCDN.includes(u.hostname));
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
  while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof fieldMarkers!=='undefined'&&typeof publicationFetch==='function'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===190").catch(()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
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
const refresh="Promise.all([loadApprovedReports(),loadPendingReports(),loadRecentSiteSightings(),loadFieldUpdates()])";
const normal="fieldNavChoiceClose();fieldGuideStop();__mock.headDelayMs=0;__mock.deferHead=false;__mock.deferredHead=[];__mock.offline=false;__mock.headHangs=false;__mock.headOverride=null;__mock.dataApprovedOverride=null;__mock.dataFieldOverride=null;__mock.headAfterData=null;__mock.deferApproved=false;__mock.deferField=false;__mock.deferredApproved=[];__mock.deferredField=[];__mock.id='11111111-1111-4111-8111-'+String((__mock.testIdSequence||0)+1).padStart(12,'0');__mock.testIdSequence=(__mock.testIdSequence||0)+1;__mock.field=[__mock.upd()];__mock.approved=[__mock.spot()];__mock.pendingSpots=[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}];__mock.revision=String(BigInt(__mock.revision)+1n);publicationInvalidate();";
const noDynamic="Object.keys(reportSpotLayers).length===0&&Object.keys(reportPendingLayers).length===0&&Object.keys(fieldMarkers).length===0&&fieldUpdates.length===0&&Object.keys(reportPublicSpots).length===0&&reportSearchIndex.length===0&&!document.querySelector('a[data-publication-report]')&&!document.getElementById('fieldNavChoice')&&fieldGuide===null";
const noApproved="Object.keys(reportSpotLayers).length===0&&reportSearchIndex.length===0";
const dynamicSnapshot="({approved:Object.keys(reportSpotLayers),pending:Object.keys(reportPendingLayers),fields:Object.keys(fieldMarkers),fieldData:fieldUpdates.map(x=>x.id),publicSpots:Object.keys(reportPublicSpots),search:reportSearchIndex.length,anchors:Array.from(document.querySelectorAll('a[data-publication-report]')).map(x=>({id:x.dataset.publicationReport,visible:!!x.offsetParent,href:x.getAttribute('href'),parent:x.parentElement?.className,popup:!!x.closest('.leaflet-popup')})),choice:!!document.getElementById('fieldNavChoice'),guide:!!fieldGuide,state:{ready:publicationState.ready,generation:publicationState.generation,until:publicationState.until},allowed:publicationAllowed()})";
const routeSnapshot="(function(){var marker=reportSpotLayers['synthetic-approved'];if(!marker)return {exists:false};marker.openPopup();var n=marker.getPopup().getElement();return {exists:true,hidden:n.textContent.includes('대략'),kakao:!!n.querySelector('.spotKakaoRoute'),tmap:!!n.querySelector('.spotTmapRoute'),point:[marker.getLatLng().lat,marker.getLatLng().lng]};})()";
async function scenario(page,width,id,fn){try{const result=await fn(page.evaluate);check(width,id,result.pass,result.evidence||{});}catch(error){check(width,id,false,{error:String(error.message).slice(0,400)});}}


const extra=[];
try{for(const width of widths){let page;try{
 const deleted=await seedField(),protectedField=await seedField();page=await browser.page(width,null,true);const e=page.evaluate;
 await e('publicationRefresh()');
 const baseline=await e('!!fieldFind('+JSON.stringify(deleted.id)+')&&!!fieldFind('+JSON.stringify(protectedField.id)+')&&publicationAllowed()');
 await e('fieldNavChooser(fieldFind('+JSON.stringify(deleted.id)+'),"합성 초기 안내");');
 const chooserBefore=await e("({kakao:!!document.querySelector('#fieldNavChoice a[data-publication-app=kakao]'),tmap:!!document.querySelector('#fieldNavChoice a[data-publication-app=tmap]')})");
 const old=await e('__bridge.old["/field-updates"]');const hide=await change({kind:'field-hide',id:protectedField.id}),remove=await change({kind:'delete',id:deleted.id});
 await e('publicationRefresh()');const closedAfterAuthority=await e('!document.getElementById("fieldNavChoice")&&fieldGuide===null');
 await page.close();page=await browser.page(width,{old:{'/field-updates':old},attack:'/field-updates'},true);await page.evaluate('publicationRefresh()');
 const noRestore=await page.evaluate('({deleted:!!fieldFind('+JSON.stringify(deleted.id)+'),hidden:!!fieldFind('+JSON.stringify(protectedField.id)+'),deletedMarker:!!fieldMarkers['+JSON.stringify(deleted.id)+'],rawHidden:fieldUpdates.some(x=>x.id==='+JSON.stringify(protectedField.id)+'&&x.lat==='+protectedField.lat+'&&x.lon==='+protectedField.lon+'),route:!!document.querySelector("#fieldNavChoice a[data-publication-app]"),guide:fieldGuide!==null,tombstone:!!fieldTombstones['+JSON.stringify(deleted.id)+']})');
 const injected=await page.evaluate('__bridge.actions.some(x=>x.path==="/field-updates"&&x.injected&&x.returnedRevision==='+JSON.stringify(old.publication.revision)+')');
 await page.evaluate('__bridge.attack=null;publicationRefresh()');
 const recovered=await page.evaluate('({deleted:!!fieldFind('+JSON.stringify(deleted.id)+'),hidden:fieldFind('+JSON.stringify(protectedField.id)+')?.locationHidden===true,routeAllowed:!!fieldPublicPoint(fieldFind('+JSON.stringify(protectedField.id)+')),allowed:publicationAllowed()})');
 const evidence={baseline,chooserBefore,hide,remove,oldRevision:old.publication.revision,closedAfterAuthority,noRestore,injected,recovered};
 check(width,'V06-composite-deleted-and-protected-fresh-context',baseline&&chooserBefore.kakao&&chooserBefore.tmap&&closedAfterAuthority&&injected&&!noRestore.deleted&&!noRestore.deletedMarker&&!noRestore.rawHidden&&!noRestore.route&&!noRestore.guide&&!noRestore.tombstone&&!recovered.deleted&&recovered.hidden&&!recovered.routeAllowed&&recovered.allowed,evidence);
}catch(error){check(width,'V06-composite-deleted-and-protected-fresh-context',false,{error:error.message});}finally{if(page)await page.close();}}}
finally{await browser.dispose();await new Promise(r=>server.close(r));auth.restore();await local.close();}
const result={productSha:'399b2f3ac579e365bd48e611465fb5624ce5d9c4',checkoutSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0,notRun:0},apiEvidence,network,browserErrors,scope:'Actual product + native local D1. Protected field transition is a privileged synthetic fixture CAS through strict writer; deletion is actual field handler. Fresh independent browser holds no tombstone. No product/API policy changes.'};writeFileSync(join(OUT,'V06_COMPOSITE.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
