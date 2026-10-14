import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';import{join,resolve}from'node:path';import{spawn}from'node:child_process';import{tmpdir}from'node:os';
const OUT=resolve(process.argv[2]||'docs/reporter-lifetime-stats/operating-browser');mkdirSync(OUT,{recursive:true});const origin='https://wooil1964.github.io';const allowedCDN=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';const browserErrors=[],network={allowedLocal:0,allowedDependencyGet:0,blockedOther:0,operatingRequests:0,externalNonGet:0};
function hook(){Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true});const real=window.fetch.bind(window);window.fetch=(url,options={})=>{if(options.method&&options.method!=='GET')return Promise.reject(new Error('READONLY_ONLY'));return real(url,options);};}
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
    let allowed=method==='GET'&&(u.origin===origin||allowedCDN.includes(u.hostname)||u.hostname==='birdmap-reports.wooil-birdmap.workers.dev'||u.hostname==='birdmap-weather-proxy.wooil-birdmap.workers.dev');
    if(u.hostname.endsWith('workers.dev'))network.operatingRequests++;
    if(method!=='GET'&&u.origin!==origin)network.externalNonGet++;
    if(allowed){u.origin===origin?network.allowedLocal++:network.allowedDependencyGet++;await this.send('Fetch.continueRequest',{requestId:m.params.requestId},sessionId).catch(()=>{});}
    else{network.blockedOther++;await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
   }
   if(m.method==='Runtime.exceptionThrown')browserErrors.push({width,text:m.params.exceptionDetails.text,description:'redacted'});
  });
  const pre=preset?'sessionStorage.setItem("publication-test-preset",'+JSON.stringify(JSON.stringify(preset))+');':'';
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:pre+'('+hook.toString()+')()'},sessionId);
  const evaluate=async expression=>{if(/\bawait\b/.test(expression))expression='(async()=>{'+expression+'})()';const r=await this.send('Runtime.evaluate',{expression:'(async function(){var v=await eval('+JSON.stringify(expression)+');try{return JSON.parse(JSON.stringify(v));}catch{return null;}})()',awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+String(r.exceptionDetails.exception?.description||'').split('\n')[0]);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/birdmap/index.html?issue21='+Date.now()},sessionId);
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

const rows=[];function check(width,id,pass){rows.push({width,id,pass:pass===true});}
async function until(e,expr){const end=Date.now()+10000;while(Date.now()<end){if(await e(expr))return true;await new Promise(r=>setTimeout(r,100));}return false;}
try{for(const width of [344,375,768,1024,1440]){let page;try{
 page=await browser.page(width);const e=page.evaluate;
 check(width,'actual-deployed-feature-source',await e("typeof reporterStatsCounts==='function'&&typeof clearRenderedSiteHistories==='function'&&siteData.length===190"));
 await e("Promise.all([publicationRefresh(),loadContributors()])");
 const ready=await until(e,"publicationAllowed()&&contributorsCurrent()&&contributorsData.contributors.length>0");check(width,'current-public-authority-and-contributors',ready);
 if(!ready)continue;
 await e("openContributorsModal();true");await until(e,"contributorsModal.style.display==='flex'&&!!contributorsModal.querySelector('.reporterStatsLink')");
 await e("contributorsModal.querySelector('.reporterStatsLink').click();true");
 const ok=await until(e,"reporterStatsContent.querySelectorAll('dd').length===2");
 check(width,'real-worker-counts-on-page',ok&&await e("reporterStatsContent.querySelectorAll('dt').length===2&&reporterStatsData!==null&&!reporterStatsContent.querySelector('a')"));
 check(width,'mobile-dialog-fit-keyboard-focus',await e("reporterStatsModal.querySelector('.monthTideDialog').getBoundingClientRect().width<=innerWidth&&document.activeElement===reporterStatsClose"));
 await e("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
 check(width,'escape-closes-only-child',await e("reporterStatsModal.style.display==='none'&&reporterStatsContent.textContent===''&&contributorsModal.style.display==='flex'"));
 await e("contributorsModal.querySelector('.reporterStatsLink').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true");await until(e,"reporterStatsData!==null");
 check(width,'keyboard-enter-real-stats',await e("reporterStatsContent.querySelectorAll('dd').length===2"));
 await e("publicationState.until=Date.now()-1;publicationState.checkedMono=performance.now()-5001;publicationAllowed();true");
 check(width,'operating-expiry-purges-local-statistics',await e("reporterStatsData===null&&reporterStatsOwner===null&&reporterStatsContent.textContent===''&&reporterStatsModal.style.display==='none'"));
 await e("publicationRefresh()");
 check(width,'readonly-recovery',await e("publicationAllowed()&&Object.keys(markerRegistry).length===190"));
 }catch{check(width,'browser-or-product-error',false);}finally{if(page)await page.close();}}
}finally{await browser.dispose();}
const result={at:new Date().toISOString(),rows,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,skip:0},network,browserErrors,realUserWrites:0,privatePayloadPersisted:false,limits:['Real GPS/native maps and real user mutations not performed.','No actual names, IDs, coordinates or response payloads stored.']};writeFileSync(join(OUT,'READONLY_CHROME.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.summary.fail||browserErrors.length||network.externalNonGet?1:0;
