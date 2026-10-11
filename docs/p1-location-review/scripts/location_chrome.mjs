import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {resolve,join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const OUT=join(ROOT,'docs/p1-location-review/results/browser');
mkdirSync(OUT,{recursive:true});
const HTML=readFileSync(join(ROOT,'index.html'),'utf8');
const widths=[344,375,768,1024,1440];
const allowedCDN=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];
const network={allowedLocal:0,allowedDependencyGet:0,blockedOther:0,operatingRequests:0,externalNonGet:0};
const rows=[],risks=[],browserErrors=[];
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server=createServer((req,res)=>{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path==='/')path='/index.html';
  const target=resolve(ROOT,'.'+path);
  if(req.method!=='GET'||!target.startsWith(ROOT+ '\\')&&!target.startsWith(ROOT+'/')){res.writeHead(403);res.end('blocked');return;}
  try{const body=readFileSync(target);res.writeHead(200,{'Content-Type':extname(target)==='.html'?'text/html;charset=utf-8':extname(target)==='.json'?'application/json':'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
function hook(){
  const realFetch=window.fetch.bind(window),fine=window.matchMedia.bind(window);
  const id='11111111-1111-4111-8111-111111111111';
  const upd=(extra={})=>Object.assign({id,species:'직박구리',count:1,status:'visible',lat:37,lon:127,nickname:'합성검증',note:'',updatedAt:new Date().toISOString(),firstSeenAt:new Date().toISOString(),lastConfirmedAt:null,confirmCount:0,history:[]},extra);
  window.__mock={id,upd,field:[upd()],deferField:false,pending:[],actions:[],geo:[],watches:new Map(),watchSeq:0,approved:[{id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[{species:['직박구리'],date:new Date().toISOString().slice(0,10),reporter:'합성검증'}],locationHidden:false}],pendingSpots:[{id:'synthetic-pending',lat:37.01,lon:127.01,species:['직박구리'],date:new Date().toISOString().slice(0,10)}]};
  const reply=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
  window.fetch=(input,options={})=>{
    const u=new URL(String(input),location.href),method=options.method||'GET';
    if(u.hostname.endsWith('workers.dev')){
      const m=window.__mock;m.actions.push({path:u.pathname,method});
      if(u.pathname==='/field-updates'&&method==='GET'){
        const body={ok:true,updates:m.field,serverTime:new Date().toISOString(),ttlHours:3};
        if(m.deferField)return new Promise(resolve=>m.pending.push(body=>reply(body).then(resolve)));
        return reply(body);
      }
      if(/\/field-updates\/[^/]+\/delete$/.test(u.pathname)){m.field=[];return reply({ok:true});}
      if(/\/field-updates\/[^/]+\/(status|confirm)$/.test(u.pathname)){
        const payload=JSON.parse(options.body||'{}'),u=upd({status:payload.status||'visible',confirmCount:1});
        m.field=[u];return reply({ok:true,update:u});
      }
      if(u.pathname==='/reports/approved')return reply({ok:true,spots:m.approved,fixedSpots:{}});
      if(u.pathname==='/reports/pending')return reply({ok:true,spots:m.pendingSpots});
      if(u.pathname==='/reports/recent-sites')return reply({ok:true,sites:[]});
      if(u.pathname.startsWith('/reports/site/'))return reply({ok:true,history:[],total:0});
      if(u.pathname==='/contributors/monthly')return reply({ok:true,contributors:[]});
      if(u.pathname==='/reports/capabilities')return reply({ok:true,capabilities:{pendingPublic:true}});
      return reply({ok:true});
    }
    if(u.origin===location.origin&&method==='GET')return realFetch(input,options);
    return Promise.reject(new Error('Blocked non-local fetch in synthetic review'));
  };
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition:(ok,error)=>window.__mock.geo.push({ok,error}),
    watchPosition:(ok,error)=>{const id=++window.__mock.watchSeq;window.__mock.watches.set(id,{ok,error});return id;},
    clearWatch:id=>window.__mock.watches.delete(id)
  }});
  window.matchMedia=query=>query.includes('pointer:fine')?{matches:innerWidth>768,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:fine(query);
  Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true});
  window.confirm=()=>true;
  window.turnstile={render:(host,options)=>{setTimeout(()=>options.callback('synthetic-token'),0);return 'synthetic-widget';},reset(){}};
}
class CDP{
 constructor(proc,socket,profile){this.proc=proc;this.socket=socket;this.profile=profile;this.seq=0;this.pending=new Map();this.events=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else{for(const h of this.events)h(m);}});}
 send(method,params={},sessionId){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
 async page(width){
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
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:'('+hook.toString()+')()'},sessionId);
  const evaluate=async expression=>{const r=await this.send('Runtime.evaluate',{expression:'(async function(){var v=await eval('+JSON.stringify(expression)+');try{return JSON.parse(JSON.stringify(v));}catch{return null;}})()',awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').split('\n')[0]);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/index.html'},sessionId);
  const until=Date.now()+35000;let ready=false;
  while(Date.now()<until){if(await evaluate("typeof L!=='undefined'&&typeof fieldMarkers!=='undefined'&&Object.keys(fieldMarkers).length>0&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'").catch(()=>false)){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error('Actual Leaflet/page initialization unavailable');
  return {evaluate,sessionId,targetId,close:()=>this.send('Target.closeTarget',{targetId})};
 }
 async dispose(){try{this.socket.close();}catch{}this.proc.kill();await new Promise(r=>setTimeout(r,250));try{rmSync(this.profile,{recursive:true,force:true});}catch{}}
}
const profile=mkdtempSync(join(tmpdir(),'birdmap-location-cdp-'));
const proc=spawn(chrome,['--headless=new','--remote-debugging-port=0','--disable-gpu','--hide-scrollbars','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='';
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome DevTools unavailable')),30000);proc.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/ws:\/\/\S+/);if(m){clearTimeout(timer);resolve(m[0]);}});proc.on('error',reject);});
const ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r));
const browser=new CDP(proc,ws,profile);
function check(width,id,pass,evidence={}){rows.push({width,id,pass:pass===true,evidence});}
const reset="fieldNavChoiceClose();fieldGuideStop();fieldTombstones={};fieldProtectedIds={};fieldRequestSeq=0;fieldAppliedSeq=0;fieldBarrierSeq=0;__mock.deferField=false;__mock.pending=[];__mock.geo=[];__mock.field=[__mock.upd()];fieldUpdates=__mock.field;fieldAvailable=true;fieldBusy=false;renderFieldMarkers();";
try{
 for(const width of widths){
  let page;
  try{
   page=await browser.page(width);const e=page.evaluate;
   check(width,'map-real-leaflet-and-sites',await e("!!L.version&&siteData.length===190&&!!fieldMap().getContainer()"));
   const site=await e("(function(){var s=siteData.find(function(x){return x.country==='대한민국';});var p=window[s.markerVar].getPopup();window[s.markerVar].openPopup();var n=p.getElement();return {kakao:!!n.querySelector('a.kakao'),tmap:!!n.querySelector('a.tmap'),visible:n.getBoundingClientRect().width>0};})()");
   check(width,'normal-site-kakao-tmap-dom',site.kakao&&site.tmap&&site.visible,site);
   check(width,'pending-and-recent-approved-list',await e("!!reportPendingLayers['synthetic-pending']&&document.querySelectorAll('#recentReportsList .recentReportItem').length===1"));
   const approved=await e("(function(){var marker=reportSpotLayers['synthetic-approved'];marker.openPopup();var n=marker.getPopup().getElement(),k=n.querySelector('.spotKakaoRoute'),t=n.querySelector('.spotTmapRoute');return {kakao:!!k,tmap:!!t,sameRow:k&&t&&Math.abs(k.getBoundingClientRect().top-t.getBoundingClientRect().top)<2};})()");
   check(width,'normal-approved-kakao-tmap-side-by-side',approved.kakao&&approved.tmap&&approved.sameRow,approved);
   await e("renderApprovedReports([{id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[],locationHidden:true}]);reportSpotLayers['synthetic-approved'].openPopup()");
   check(width,'protected-approved-no-routes',await e("(function(){var n=reportSpotLayers['synthetic-approved'].getPopup().getElement();return !!n&&!n.querySelector('.spotKakaoRoute,.spotTmapRoute');})()"));
   await e(reset+"fieldNavChooser(fieldFind(__mock.id),'합성검증')");
   const chooser=await e("(function(){var n=document.getElementById('fieldNavChoice');return {kakao:!!n.querySelector('a[href^=\"https://map.kakao.com/link/to/\"]'),tmap:!!n.querySelector('a[href^=\"tmap://route\"]'),id:n.dataset.fieldId===__mock.id};})()");
   check(width,'normal-field-kakao-tmap-chooser',chooser.kakao&&chooser.tmap&&chooser.id,chooser);
   await e("fieldNewsShow(__mock.id)");
   check(width,'field-popup-mine-delete-dom',await e("fieldMineAdd(__mock.id);fieldMarkers[__mock.id].marker.getPopup().setContent(fieldPopupNode(fieldFind(__mock.id)));!!fieldMarkers[__mock.id].marker.getPopup().getElement().querySelector('.fieldDeleteBtn')"));
   const screenshot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);
   writeFileSync(join(OUT,'synthetic-field-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
   await e("__mock.deferField=true;window.__old=loadFieldUpdates();fieldMarkers[__mock.id].marker.getPopup().getElement().querySelector('.fieldDeleteBtn').click()");
   await e("new Promise(r=>setTimeout(r,40))");
   await e("__mock.pending[0]({ok:true,updates:[__mock.upd()],serverTime:new Date().toISOString()});__mock.pending[1]({ok:true,updates:[__mock.upd()],serverTime:new Date().toISOString()});__old");
   const deletion=await e("({updates:fieldUpdates.length,markers:Object.keys(fieldMarkers).length,tombstone:fieldTombstones[__mock.id]===true,localMockDelete:__mock.actions.some(x=>x.path.endsWith('/delete')&&x.method==='POST')})");
   check(width,'delete-old-get-and-post-delete-local',deletion.updates===0&&deletion.markers===0&&deletion.tombstone&&deletion.localMockDelete,deletion);
   await e(reset+"fieldNewsShow(__mock.id);fieldNavChooser(fieldFind(__mock.id),'合成');fieldReplace(__mock.upd({locationHidden:true}));");
   const hidden=await e("(function(){var p=fieldMarkers[__mock.id].marker.getPopup(),n=p.getElement();return {hidden:fieldFind(__mock.id).locationHidden===true,note:n&&n.textContent.includes('대략적인'),guideButton:!!(n&&n.querySelector('.fieldGuideBtn')),chooser:!!document.getElementById('fieldNavChoice'),publicPoint:fieldPublicPoint(fieldFind(__mock.id))===null};})()");
   check(width,'hidden-same-coordinates-popup-refresh',hidden.hidden&&hidden.note&&!hidden.guideButton&&!hidden.chooser&&hidden.publicPoint,hidden);
   await e(reset+"fieldNewsNavigate(__mock.id);fieldReplace(__mock.upd({locationHidden:true}));__mock.geo[0].ok({coords:{latitude:37,longitude:127,accuracy:1}})");
   check(width,'late-one-shot-gps-after-hidden-stopped',await e("fieldGuide===null&&!document.getElementById('fieldNavChoice')"));
   if(width<769){
    await e(reset+"fieldGuideStart(__mock.id);window.__watch=__mock.watches.values().next().value;fieldReplace(__mock.upd({locationHidden:true}));__watch.ok({coords:{latitude:37,longitude:127,accuracy:1}})");
    check(width,'late-watch-gps-after-hidden-stopped',await e("fieldGuide===null&&__mock.watches.size===0&&!document.getElementById('fieldGuideBox')"));
   }else check(width,'desktop-guide-not-offered',await e(reset+"fieldGuideStart(__mock.id);fieldGuide===null"));
   await e(reset+"fieldNewsShow(__mock.id);Array.from(fieldMarkers[__mock.id].marker.getPopup().getElement().querySelectorAll('button')).find(b=>b.textContent==='안 보여요').click();fieldDraft.nickname='합성검증';fieldTurnstileToken='synthetic-token';fieldSubmitStatus();");
   await e("new Promise(r=>setTimeout(r,40))");
   await e("fieldNewsShow(__mock.id)");
   const status=await e("(function(){var n=fieldMarkers[__mock.id].marker.getPopup().getElement();return {status:fieldFind(__mock.id).status,localPost:__mock.actions.some(x=>x.path.endsWith('/status')&&x.method==='POST'),popup:n&&n.textContent.includes(FIELD_STATUS_LABEL.not_visible),newsHidden:document.getElementById('fieldNewsBox').hidden};})()");
   check(width,'field-status-local-post-and-dom',status.status==='not_visible'&&status.localPost&&status.popup&&status.newsHidden,status);
   await e(reset+"__mock.deferField=true;window.__old=loadFieldUpdates();window.__new=loadFieldUpdates();__mock.pending[1]({ok:true,updates:[__mock.upd({locationHidden:true})],serverTime:new Date().toISOString()});__new");
   await e("__mock.pending[0]({ok:true,updates:[__mock.upd()],serverTime:new Date().toISOString()});__old");
   check(width,'hidden-old-get-retained',await e("fieldFind(__mock.id).locationHidden===true&&fieldPublicPoint(fieldFind(__mock.id))===null"));
   await e("__mock.deferField=false;__mock.field=[__mock.upd()];loadFieldUpdates()");
   check(width,'later-request-old-server-cache-protected',await e("fieldFind(__mock.id).locationHidden===true&&fieldPublicPoint(fieldFind(__mock.id))===null"));
   check(width,'mobile-or-pc-field-news-visible',await e("!document.getElementById('fieldNewsBox').hidden&&document.getElementById('fieldNewsBox').getBoundingClientRect().width>0"));
   await e(reset+"__mock.approved=[];loadApprovedReports()");
   await e("__mock.approved=[{id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[],locationHidden:false}];loadApprovedReports()");
   const reportResurrection=await e("!!reportSpotLayers['synthetic-approved']");
   risks.push({width,id:'approved-later-request-stale-server-cache',observedUnsafe:reportResurrection,scope:'A later successful request can restore a withdrawn approved report; request ordering alone does not establish server publication freshness.'});
   await e("__mock.approved=[{id:'synthetic-approved',lat:36.9,lon:126.9,species:['직박구리'],history:[],locationHidden:true}];loadApprovedReports()");
   await e("__mock.approved=[{id:'synthetic-approved',lat:37,lon:127,species:['직박구리'],history:[],locationHidden:false}];loadApprovedReports()");
   await e("reportSpotLayers['synthetic-approved'].openPopup()");
   const reportUnhide=await e("!!reportSpotLayers['synthetic-approved'].getPopup().getElement().querySelector('.spotKakaoRoute,.spotTmapRoute')");
   risks.push({width,id:'approved-later-request-old-cache-unhides-route',observedUnsafe:reportUnhide,scope:'A later request with an older unhidden server snapshot can restore routes for a protected approved report.'});
   await e(reset+"fieldRemoveLocal(__mock.id);__mock.deferField=false;__mock.field=[__mock.upd()]");
   await browser.send('Page.reload',{ignoreCache:true},page.sessionId);
   await new Promise(r=>setTimeout(r,1800));
   const refreshResurrection=await e("fieldUpdates.some(x=>x.id===__mock.id)&&!!fieldMarkers[__mock.id]");
   risks.push({width,id:'refresh-deleted-tombstone-lost',observedUnsafe:refreshResurrection,scope:'A full refresh clears in-memory tombstones; a stale server list can restore a locally deleted location.'});
  }catch(error){rows.push({width,id:'environment-or-harness',pass:false,evidence:{error:String(error.message).slice(0,280)}});}
  finally{if(page)await page.close();}
 }
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={checkedAt:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),indexSha256:createHash('sha256').update(HTML).digest('hex'),networkPolicy:'Local GET files and whitelisted CDN GET only; all Workers endpoints intercepted by synthetic in-page API; no operating mutation or Worker GET intended.',rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0,notRun:0},separateSecurityLedger:risks,network,browserErrors,limits:['External Kakao/TMAP applications were not opened. Link DOM and platform handler contracts were checked.','Synthetic coordinates only. No operating user report or D1 mutation.','Freshness of server responses across a full browser refresh is not enforced by this client-only patch.']};
writeFileSync(join(OUT,'location_chrome.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,network,separateSecurityLedger:risks,browserErrors,resultPath:join(OUT,'location_chrome.json')},null,2));
process.exitCode=result.summary.fail?1:0;
