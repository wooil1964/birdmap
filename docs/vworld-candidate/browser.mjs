// Real Chrome/Edge + current HTML/Leaflet; credentials, tiles and workers are synthetic.
// Run: VWORLD_QA_OUTPUT=<directory> CHROME_PATH=<optional Chromium path> node docs/vworld-candidate/browser.mjs
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname,extname,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=resolve(process.env.VWORLD_QA_OUTPUT||join(ROOT,'.ci-results/vworld-browser'));
const HTML=readFileSync(join(ROOT,'index.html'),'utf8');
const WIDTHS=[320,344,375,768,1024,1440], ENDPOINT='https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles';
const SAFE_CONFIG=readFileSync(join(ROOT,'assets/map-runtime-config.js'),'utf8');
const EXPECTED=`/* Deployment-time browser configuration. Never commit a credential here.
 * The reviewed source and downloadable candidate intentionally contain no key.
 * A separately approved deployment may supply this object before initialization.
 */
window.BIRDMAP_MAP_CONFIG = window.BIRDMAP_MAP_CONFIG || { vworldMode: 'worker', vworldTileEndpoint: '', vworldKey: '' };`;
if(SAFE_CONFIG.replace(/\r\n/g,'\n').trim()!==EXPECTED)throw Error('Reviewed keyless runtime template required');
const CONFIGURED=SAFE_CONFIG.replace("vworldTileEndpoint: ''","vworldTileEndpoint: '"+ENDPOINT+"'" );
const CDN=new Set(['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com']);
const LOCAL=new Set(['/index.html','/weather_today.json','/weather_week.json','/tide_today.json','/tide_month.json','/notices.json','/weather_rules.json','/assets/birdmap-basemap.css','/assets/map-runtime-config.js','/assets/birdmap-basemap.js','/assets/birdmap-basemap-init.js']);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTioAAAAASUVORK5CYII=','base64').toString('base64');
const network={localGet:0,dependencyGet:0,osmSynthetic:0,vworldSynthetic:0,blocked:0,operatingRequests:0,externalNonGet:0,directVworldRequests:0};
const rows=[],browserErrors=[];
mkdirSync(OUT,{recursive:true});
const server=createServer((req,res)=>{
 let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
 if(req.method!=='GET'||!LOCAL.has(path)){res.writeHead(403);res.end();return;}
 // Use only the exact, validated keyless on-disk template above.
 if(path==='/assets/map-runtime-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(SAFE_CONFIG);return;}
 try{const data=readFileSync(join(ROOT,path.slice(1))),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};res.writeHead(200,{'Content-Type':(mime[extname(path)]||'application/json')+';charset=utf-8','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;

function mockBeforeLoad(){
 const realFetch=window.fetch.bind(window),qa=window.__vworldQA={writes:0,beacons:0,geo:0,reads:0,bootId:Math.random()};
 if(new URLSearchParams(location.search).has('qaFresh')){localStorage.removeItem('birdmap.basemap.preference');history.replaceState(null,'',location.pathname);}
 const reply=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
 window.fetch=(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url,location.href),method=String(options.method||input?.method||'GET').toUpperCase();
  if(u.hostname.endsWith('workers.dev')){
   if(method!=='GET'){qa.writes++;return reply({ok:false,error:{code:'QA_WRITE_BLOCKED'}},403);}qa.reads++;
   const at=new Date(Date.now()-1000).toISOString(),publication={contract:'publication-v1',epoch:'11111111111141118111111111111111',revision:'1',projection:'legacy-public-v1',nonce:u.searchParams.get('nonce')},body={ok:true,serverTime:new Date().toISOString(),publication};
   if(u.pathname==='/weather')return reply({ok:true,siteId:u.searchParams.get('siteId'),generatedAt:at,observation:{dataTime:at,temperature:20,windSpeed:2,windDirection:'북풍',windDirectionDegrees:0,rain:0,humidity:60,weatherText:'맑음'},forecast:{},tomorrow:{}});
   if(u.pathname==='/reports/capabilities')return reply({ok:true,quickReport:{nonBreedingConfirmation:true,hideLocation:true}});
   if(u.pathname==='/reports/approved')return reply({...body,spots:[],fixedSpots:{}});
   if(u.pathname==='/reports/pending')return reply({...body,spots:[]});
   if(u.pathname==='/reports/recent-sites')return reply({...body,sites:[]});
   if(u.pathname.startsWith('/reports/site/'))return reply({...body,history:[],total:0,limit:5,offset:0});
   if(u.pathname.startsWith('/contributors/'))return reply({...body,approvedReports:0,publicContributors:0,contributors:[]});
   return reply(body);
  }
  if(u.origin===location.origin&&method==='GET')return realFetch(input,options);
  return Promise.reject(Error('QA blocked external fetch'));
 };
 Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>{qa.beacons++;return true;}});
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){qa.geo++;},watchPosition(){qa.geo++;return 1;},clearWatch(){}}});
 window.turnstile={render:()=> 'synthetic-widget',reset(){}};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(e,expression,timeout=6000){const until=Date.now()+timeout;while(Date.now()<until){if(await e(expression).catch(()=>false))return;await delay(100);}throw Error('QA condition timed out');}
class CDP{
 constructor(proc,socket,profile){Object.assign(this,{proc,socket,profile,seq:0,pending:new Map(),events:[]});socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error('CDP command failed')):p.resolve(m.result);}}else for(const h of this.events)h(m);});}
 send(method,params={},sessionId){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
 async page(width,{configured=false}={}){
  const {targetId}=await this.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
  const page={sessionId,targetId,mode:'success',held:[],width,configured};
  await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);
  await this.resize(page,width);
  await this.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
  const handler=async m=>{
   if(m.sessionId!==sessionId)return;
   if(m.method==='Runtime.exceptionThrown'){browserErrors.push({width,kind:'uncaught-browser-exception'});return;}
   if(m.method!=='Fetch.requestPaused')return;
   const {requestId,request}=m.params;let u;try{u=new URL(request.url);}catch{await this.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});return;}
   const get=request.method==='GET',osm=/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(u.hostname),workerTile=u.hostname==='birdmap-vworld-tiles.wooil-birdmap.workers.dev'&&u.pathname.startsWith('/tiles/'),vworld=workerTile;
   if(u.hostname==='api.vworld.kr')network.directVworldRequests++;
   const fulfill=(responseCode,body,type)=>this.send('Fetch.fulfillRequest',{requestId,responseCode,responseHeaders:[{name:'Content-Type',value:type},{name:'Cache-Control',value:'no-store'}],body},sessionId).catch(()=>{});
   if(u.hostname.endsWith('workers.dev')&&!workerTile)network.operatingRequests++;
   if(!get&&u.origin!==origin)network.externalNonGet++;
   if(get&&(osm||vworld)){
    network[osm?'osmSynthetic':'vworldSynthetic']++;
    if(vworld&&page.mode==='timeout'){page.held.push(requestId);return;}
    if(vworld&&page.mode==='offline'){await this.send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'},sessionId).catch(()=>{});return;}
    if(vworld&&(['401','403','429','502'].includes(page.mode))){await fulfill(Number(page.mode),Buffer.from('Synthetic authorization failure').toString('base64'),'text/plain');return;}
    if(vworld&&page.mode==='xml'){await fulfill(200,Buffer.from('<ExceptionReport>Synthetic failure</ExceptionReport>').toString('base64'),'application/xml');return;}
    await fulfill(200,PNG,'image/png');return;
   }
   if(get&&u.origin===origin&&u.pathname==='/assets/map-runtime-config.js'){
    network.localGet++;await fulfill(200,Buffer.from(configured?CONFIGURED:SAFE_CONFIG).toString('base64'),'text/javascript');return;
   }
   const local=get&&u.origin===origin&&LOCAL.has(u.pathname),dependency=get&&u.protocol==='https:'&&CDN.has(u.hostname);
   if(local||dependency){network[local?'localGet':'dependencyGet']++;await this.send('Fetch.continueRequest',{requestId},sessionId).catch(()=>{});}
   else{network.blocked++;await this.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
  };
  this.events.push(handler);
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mockBeforeLoad.toString()+')()'},sessionId);
  page.evaluate=async expression=>{const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails){const err=Error('Browser assertion evaluation failed');err.safeType=r.exceptionDetails.exception?.className||'BrowserEvaluation';throw err;}return r.result.value;};
  page.ready=()=>waitFor(page.evaluate,"typeof L!=='undefined'&&typeof birdmapBasemap!=='undefined'&&birdmapBasemap!==null&&typeof markerRegistry!=='undefined'&&Object.keys(markerRegistry).length===229",45000);
  page.close=async()=>{this.events=this.events.filter(h=>h!==handler);await this.send('Target.closeTarget',{targetId});};
  await this.send('Page.navigate',{url:origin+'/index.html?qaFresh=1'},sessionId);await page.ready();return page;
 }
 async resize(page,width){await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=700},page.sessionId);await this.send('Emulation.setTouchEmulationEnabled',{enabled:width<=700},page.sessionId);}
 async mode(page,mode){page.mode=mode;for(const requestId of page.held.splice(0))await this.send('Fetch.failRequest',{requestId,errorReason:'Aborted'},page.sessionId).catch(()=>{});}
 async screenshot(page,name){const shot=await this.send('Page.captureScreenshot',{format:'png'},page.sessionId);writeFileSync(join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));}
 async dispose(){this.socket.close();this.proc.kill();await delay(300);const checked=resolve(this.profile),base=resolve(tmpdir());if(dirname(checked)!==base||!basename(checked).startsWith('birdmap-vworld-qa-')||!checked.startsWith(base+sep))throw Error('Unsafe profile cleanup target');rmSync(checked,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
}
const profile=mkdtempSync(join(tmpdir(),'birdmap-vworld-qa-'));
const proc=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--disable-gpu','--hide-scrollbars','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='';const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chromium startup failed')),30000);proc.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/ws:\/\/\S+/);if(match){clearTimeout(timer);resolve(match[0]);}});proc.on('error',()=>reject(Error('Chromium executable unavailable')));});
const socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r));const browser=new CDP(proc,socket,profile);
function check(width,name,pass,evidence={}){rows.push({width,name,pass:pass===true,evidence});console.log(JSON.stringify({width,check:name,pass:pass===true}));}
async function scenario(page,name,fn){try{const r=await fn(page.evaluate);check(page.width,name,r.pass,r.evidence);}catch(error){check(page.width,name,false,{failure:'Harness condition or browser evaluation failed; details intentionally suppressed',type:error.safeType||'HarnessCondition'});}}
async function enter(page){for(const type of ['keyDown','keyUp'])await browser.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{}},page.sessionId);}
const STATE='birdmapBasemap.getState()',MAP='map_7010a44f6ac2025090f0fe07508ed485';
const setSynthetic="birdmapBasemap.updateConfig({vworldMode:'worker',vworldTileEndpoint:"+JSON.stringify(ENDPOINT)+'})';
try{
 for(const width of WIDTHS){let page;try{
  page=await browser.page(width);const e=page.evaluate;
  await scenario(page,'keyless-default-OSM-and-initial-Korea-framing',async()=>{
   const s=await e(`(()=>{const s=${STATE},m=${MAP},bounds=L.latLngBounds(KOREA_VIEW_BOUNDS),top=document.getElementById('topUiWrap').getBoundingClientRect().bottom,north=m.latLngToContainerPoint(bounds.getNorthWest()).y,south=m.latLngToContainerPoint(bounds.getSouthEast()).y;return {state:s,markers:Object.keys(markerRegistry).length,top,north,south,height:innerHeight,framed:innerWidth>700||(north>=top&&south<=innerHeight),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
   return {pass:s.state.active==='osm'&&s.state.reason==='no_config'&&s.markers===229&&s.framed&&!s.overflow,evidence:s};
  });
  await scenario(page,'synthetic-VWorld-ready-default-and-status',async()=>{
   const before=network.vworldSynthetic;
   await e(`${MAP}.setView([36.1,126],11,{animate:false});${setSynthetic};birdmapBasemap.setPreference('vworld')`);await waitFor(e,`${STATE}.active==='vworld'&&${STATE}.reason==='ready'`);
   const s=await e(`({state:${STATE},status:document.querySelector('.birdmap-basemap__status').textContent,globalConfigRemoved:!Object.prototype.hasOwnProperty.call(window,'BIRDMAP_MAP_CONFIG'),stored:localStorage.getItem('birdmap.basemap.preference')})`);
   const requests=network.vworldSynthetic-before;return {pass:s.state.active==='vworld'&&!s.state.loading&&s.status.includes('표시 중')&&s.globalConfigRemoved&&s.stored==='vworld'&&requests>0,evidence:{...s,syntheticRequests:requests}};
  });
  await scenario(page,'switch-preserves-markers-coordinates-popup-search-and-report-point',async()=>{
   const s=await e(`(()=>{let stage='search';try{const m=${MAP};m.closePopup();document.getElementById('searchBox').value='어청도';searchSite();stage='popup';const site=siteData.find(s=>s.id==='1'),marker=window[site.markerVar];m.setView([site.lat,site.lon],11,{animate:false});marker.addTo(m).openPopup();stage='report';setReportLocation(36.111111,126.222222);startReportPicking();stage='snapshot';const before=siteData.map(s=>{const marker=window[s.markerVar],ll=marker.getLatLng();return {name:s.markerVar,marker,lat:ll.lat,lng:ll.lng,onMap:m.hasLayer(marker)}}),data=JSON.stringify(siteData),popup=marker.getPopup(),point=reportPickMarker,pointOnMap=m.hasLayer(point),coord=JSON.stringify(reportPicked),camera=JSON.stringify({center:m.getCenter(),zoom:m.getZoom()}),terms=JSON.stringify(activeTerms),search=document.getElementById('searchBox').value,links=[...popup.getElement().querySelectorAll('a')].map(a=>a.href);stage='switch';birdmapBasemap.setPreference('osm');birdmapBasemap.setPreference('vworld');stage='verify';return {markers:before.every(x=>{const current=window[x.name],ll=current.getLatLng();return current===x.marker&&ll.lat===x.lat&&ll.lng===x.lng&&m.hasLayer(current)===x.onMap}),siteData:data===JSON.stringify(siteData),camera:camera===JSON.stringify({center:m.getCenter(),zoom:m.getZoom()}),popup:marker.getPopup()===popup&&m.hasLayer(popup),links:JSON.stringify(links)===JSON.stringify([...popup.getElement().querySelectorAll('a')].map(a=>a.href)),search:search===document.getElementById('searchBox').value&&terms===JSON.stringify(activeTerms),report:reportPicking&&reportPickMarker===point&&m.hasLayer(point)===pointOnMap&&coord===JSON.stringify(reportPicked),count:before.length};}catch(error){return {qaError:error.name,stage};}})()`);
   await e('stopReportPicking();clearReportPick();'+MAP+'.closePopup();void 0');return {pass:Object.entries(s).every(([k,v])=>k==='count'?v===229:v===true),evidence:s};
  });
  await scenario(page,'controls-keyboard-touch-size-reachability-and-no-overflow',async()=>{
   await e('resetFilters();'+MAP+'.closePopup();document.querySelectorAll(".birdmap-basemap__choice")[1].focus()');await enter(page);
   const keyboard=await e(`${STATE}.preference==='osm'`);
   const p=await e("(()=>{const r=document.querySelector('.birdmap-basemap__choice').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
   if(width<=700){for(const type of ['touchStart','touchEnd'])await browser.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchStart'?[{...p,id:1}]:[]},page.sessionId);}
   else for(const type of ['mousePressed','mouseReleased'])await browser.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1},page.sessionId);
   const s=await e(`(()=>{const root=document.querySelector('.birdmap-basemap'),buttons=[...root.querySelectorAll('button')].filter(b=>!b.hidden);return {keyboard:${keyboard},activated:${STATE}.preference==='vworld',docked:innerWidth<=700?root.parentNode.id==='topBtnRow':root.parentNode.classList.contains('leaflet-bottom'),sizes:buttons.map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {w:r.width,h:r.height,reachable:!!hit&&(hit===b||b.contains(hit))};}),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
   return {pass:s.keyboard&&s.activated&&s.docked&&!s.overflow&&s.sizes.every(r=>r.w>=44&&r.h>=44&&r.reachable),evidence:s};
  });
  await scenario(page,'resize-docking-and-dynamic-header-metrics',async()=>{
   const other=width<=700?1024:375;await browser.resize(page,other);await delay(150);
   const first=await e("(()=>{const r=document.querySelector('.birdmap-basemap');return innerWidth<=700?r.parentNode.id==='topBtnRow':r.parentNode.classList.contains('leaflet-bottom');})()");
   await browser.resize(page,width);await delay(150);
   const s=await e("(()=>{const r=document.querySelector('.birdmap-basemap');return {docked:innerWidth<=700?r.parentNode.id==='topBtnRow':r.parentNode.classList.contains('leaflet-bottom'),metric:parseFloat(document.documentElement.style.getPropertyValue('--birdmapTopUiH'))||0,bottom:document.getElementById('topUiWrap').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth};})()");
   return {pass:first&&s.docked&&!s.overflow&&(width>700||s.metric>=s.bottom),evidence:{otherDocked:first,...s}};
  });
  await scenario(page,'zoom-bounds-fallback-return-and-OSM-preference',async()=>{
   const s=await e(`(()=>{const m=${MAP};m.setView([36,127],4,{animate:false});const zoom=${STATE}.reason;m.setView([51,0],8,{animate:false});const outside=${STATE}.reason;m.setView([36,127],10,{animate:false});const back=${STATE}.active;birdmapBasemap.setPreference('osm');m.setView([36.2,127.2],12,{animate:false});return {zoom,outside,back,preference:${STATE}.preference,active:${STATE}.active};})()`);
   return {pass:s.zoom==='zoom_out'&&s.outside==='outside_view'&&s.back==='vworld'&&s.preference==='osm'&&s.active==='osm',evidence:s};
  });
  await scenario(page,'OSM-preference-persists-after-real-page-reload',async()=>{
   const boot=await e('__vworldQA.bootId');await browser.send('Page.reload',{ignoreCache:true},page.sessionId);await waitFor(e,`typeof __vworldQA!=='undefined'&&__vworldQA.bootId!==${boot}`);await page.ready();await e(`${MAP}.setView([36,127],10,{animate:false});${setSynthetic}`);
   const s=await e(STATE);return {pass:s.preference==='osm'&&s.active==='osm',evidence:{state:s}};
  });
  if(width===375||width===1440)await browser.screenshot(page,'vworld-keyless-or-osm-'+width);
 }catch{check(width,'environment-or-harness',false,{failure:'Chromium page failed to initialize; no URL or exception text recorded'});if(!page)break;}finally{if(page)await page.close();}}
 let page;try{
  page=await browser.page(375,{configured:true});const e=page.evaluate;
  await scenario(page,'synthetic-config-default-without-saved-preference',async()=>{await e(`${MAP}.setView([36,127],10,{animate:false});void 0`);const before=await e(STATE);if(before.preference==='vworld'&&before.active==='vworld')await waitFor(e,`${STATE}.reason==='ready'`);const s=await e(STATE);return {pass:s.preference==='vworld'&&s.active==='vworld'&&s.reason==='ready',evidence:{before,state:s}};});
  for(const mode of ['401','403','429','502','xml','offline','timeout'])await scenario(page,'actual-tile-'+mode+'-fallback-lock-and-explicit-retry',async()=>{
   await e("birdmapBasemap.setPreference('osm')");await browser.mode(page,mode);const before=network.vworldSynthetic,at=Date.now();
   await e("birdmapBasemap.setPreference('vworld',{retry:true})");await waitFor(e,`${STATE}.active==='osm'&&${STATE}.locked`,mode==='timeout'?15000:6000);
   const failed=await e(STATE),elapsed=Date.now()-at,after=network.vworldSynthetic;
   await e(`${MAP}.panBy([15,0],{animate:false});birdmapBasemap.setPreference('osm');birdmapBasemap.setPreference('vworld')`);await delay(200);const lockedNoRequests=network.vworldSynthetic===after;
   await browser.mode(page,'success');await e("birdmapBasemap.setPreference('vworld',{retry:true})");await waitFor(e,`${STATE}.active==='vworld'&&${STATE}.reason==='ready'`);
   const retried=await e(STATE);return {pass:after>before&&failed.reason===(mode==='timeout'?'tile_timeout':'tile_error')&&failed.locked&&lockedNoRequests&&retried.active==='vworld'&&!retried.locked&&(mode!=='timeout'||elapsed>=11500),evidence:{failed,elapsedMs:elapsed,syntheticRequests:after-before,lockedNoRequests,retried}};
  });
  await browser.screenshot(page,'vworld-synthetic-ready-375');
 }catch{check(375,'error-environment-or-harness',false,{failure:'Failure scenario initialization failed; details suppressed'});}finally{if(page)await page.close();}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'vworld-worker-chromium-synthetic-v2',at:new Date().toISOString(),indexSha256:createHash('sha256').update(HTML).digest('hex'),widths:WIDTHS,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length},network,browserErrors,rows,scope:'Actual current HTML and Leaflet in headless Chromium. All OSM/VWorld images and credentials are synthetic; worker fetches are mocked before application load. External non-GET and unapproved destinations are blocked. This does not establish real VWorld tiles, registered-domain authentication, real phones, GPS, pinch gestures or external app launches.'};
writeFileSync(join(OUT,'BROWSER_QA.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,network,browserErrors,failures:rows.filter(x=>!x.pass)},null,2));
process.exitCode=result.summary.fail||network.operatingRequests||network.directVworldRequests||network.externalNonGet||browserErrors.length?1:0;
