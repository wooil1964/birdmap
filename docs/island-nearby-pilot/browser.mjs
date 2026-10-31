// Actual Chrome QA. Local application files and public map dependencies only;
// worker responses are synthetic and no report is submitted.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const ROOT=resolve(join(dirname(fileURLToPath(import.meta.url)),'../..'));
const OUT=resolve(process.env.ISLAND_PILOT_OUTPUT||join(ROOT,'.ci-results/island-pilot'));
const HTML=readFileSync(join(ROOT,'index.html'),'utf8');
const WIDTHS=[320,344,375,768,1024,1440];
const OSM_TILES=process.env.ISLAND_PILOT_OSM_TILES!=='0';
const CDN=new Set(['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com']);
const LOCAL=new Set(['/index.html','/weather_today.json','/weather_week.json','/tide_today.json','/tide_month.json','/notices.json','/weather_rules.json']);
// Exercise the current UI, including the mobile sheet and its overlay handling.
// The previous JSON-only allowlist silently blocked every local CSS/JS asset.
for(const [,url]of HTML.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/g)){
 const u=new URL(url,'http://localhost/');
 if(u.origin==='http://localhost'&&/^\/assets\/[\w.-]+\.(?:css|js)$/.test(u.pathname))LOCAL.add(u.pathname);
}
const PILOT=[['어청도','전북 군산 어청도',['1','101','102','103']],['외연도','충남 보령 외연도',['2','104','105','106']],['흑산도','전남 신안 흑산도',['63','127','128','129','130']],['백령도','인천 옹진 백령도',['4','117','118','119']],['소청도','인천 옹진 소청도',['110','111']],['홍도','전남 신안 홍도',['64']]];
const network={localGet:0,dependencyGet:0,osmGet:0,syntheticTiles:0,blocked:0,operatingRequests:0,externalNonGet:0};
const TILE='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const rows=[],browserErrors=[];
mkdirSync(OUT,{recursive:true});
const server=createServer((req,res)=>{
 let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
 if(req.method!=='GET'||!LOCAL.has(pathname)){res.writeHead(403);res.end('blocked');return;}
 try{const body=readFileSync(join(ROOT,pathname.slice(1)));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[extname(pathname)]||'application/octet-stream')+';charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;

function mockBeforeLoad(){
 const realFetch=window.fetch.bind(window);
 const qa=window.__pilotQA={actions:[],writes:0,beacons:0,geo:0};
 // Use one timestamp: two clock reads can put observation after generation by 1ms.
 qa.weather=id=>{const at=new Date(Date.now()-1000).toISOString();return {ok:true,siteId:String(id),generatedAt:at,observation:{dataTime:at,temperature:20,windSpeed:2,windDirection:'북풍',windDirectionDegrees:0,rain:0,humidity:60,weatherText:'맑음'},forecast:{},tomorrow:{}};};
 const reply=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
 window.fetch=(input,options={})=>{
  const u=new URL(typeof input==='string'?input:input.url,location.href),method=String(options.method||'GET').toUpperCase();
  if(u.hostname.endsWith('workers.dev')){
   qa.actions.push({path:u.pathname,method});
   if(method!=='GET'){qa.writes++;return reply({ok:false,error:{code:'QA_WRITE_BLOCKED'}},403);}
   const publication={contract:'publication-v1',epoch:'11111111111141118111111111111111',revision:'1',projection:'legacy-public-v1',nonce:u.searchParams.get('nonce')};
   const body={ok:true,serverTime:new Date().toISOString(),publication};
   if(u.pathname==='/weather')return reply(qa.weather(u.searchParams.get('siteId')));
   if(u.pathname==='/reports/public-state')return reply(body);
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

class CDP{
 constructor(proc,socket,profile){this.proc=proc;this.socket=socket;this.profile=profile;this.seq=0;this.pending=new Map();this.events=[];
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else for(const handler of this.events)handler(m);});}
 send(method,params={},sessionId){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
 async page(width){
  const {targetId}=await this.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});
  await this.send('Page.enable',{},sessionId);await this.send('Runtime.enable',{},sessionId);
  await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=700},sessionId);
  await this.send('Emulation.setTouchEmulationEnabled',{enabled:width<=700},sessionId);
  await this.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
  this.events.push(async m=>{
   if(m.sessionId!==sessionId)return;
   if(m.method==='Fetch.requestPaused'){
    const request=m.params.request,u=new URL(request.url),get=request.method==='GET';
    const local=get&&u.origin===origin&&LOCAL.has(u.pathname),dependency=get&&u.protocol==='https:'&&CDN.has(u.hostname),osm=OSM_TILES&&get&&u.protocol==='https:'&&/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(u.hostname);
    // Loading the actual basemap UI must not contact its operating tile relay.
    if(get&&u.protocol==='https:'&&(u.pathname.startsWith('/tiles/')||(!OSM_TILES&&/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(u.hostname)))){
     network.syntheticTiles++;await this.send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:TILE},sessionId).catch(()=>{});return;
    }
    if(u.hostname.endsWith('workers.dev'))network.operatingRequests++;
    if(!get&&u.origin!==origin)network.externalNonGet++;
    if(local||dependency||osm){network[local?'localGet':dependency?'dependencyGet':'osmGet']++;await this.send('Fetch.continueRequest',{requestId:m.params.requestId},sessionId).catch(()=>{});}
    else{network.blocked++;await this.send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'},sessionId).catch(()=>{});}
   }
   if(m.method==='Runtime.exceptionThrown')browserErrors.push({width,error:String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).split('\n')[0]});
  });
  await this.send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mockBeforeLoad.toString()+')()'},sessionId);
  const evaluate=async expression=>{const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await this.send('Page.navigate',{url:origin+'/index.html'},sessionId);
  await waitFor(evaluate,"typeof L!=='undefined'&&typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&Object.keys(markerRegistry).length===240&&typeof PINNED_BIRDING_ISSUES!=='undefined'&&typeof birdmapLocation==='object'",40000);
  await evaluate('Promise.all([loadTideMonth(),loadWeatherWeek(),loadRecommendationWeatherRules()])');
  return {evaluate,sessionId,close:()=>this.send('Target.closeTarget',{targetId})};
 }
 async dispose(){this.socket.close();this.proc.kill();await new Promise(r=>setTimeout(r,300));const checked=resolve(this.profile),base=resolve(tmpdir());if(dirname(checked)!==base||!checked.startsWith(base+sep+'birdmap-island-qa-'))throw Error('Unsafe Chrome profile cleanup target');rmSync(checked,{recursive:true,force:true,maxRetries:3,retryDelay:150});}
}
async function waitFor(evaluate,expression,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+expression);}
const profile=mkdtempSync(join(tmpdir(),'birdmap-island-qa-'));
const proc=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--disable-gpu','--hide-scrollbars','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='';const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup failed')),30000);proc.stderr.on('data',data=>{stderr+=data;const match=stderr.match(/ws:\/\/\S+/);if(match){clearTimeout(timer);resolve(match[0]);}});proc.on('error',reject);});
const socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r));const browser=new CDP(proc,socket,profile);
function check(width,name,pass,evidence={}){rows.push({width,name,pass:pass===true,evidence});}
async function scenario(page,width,name,fn){try{const value=await fn(page.evaluate);check(width,name,value.pass,value.evidence);}catch(error){check(width,name,false,{error:String(error.stack).slice(0,1600)});}}
async function key(page){for(const type of ['keyDown','keyUp'])await browser.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{}},page.sessionId);}
async function screenshot(page,name){const shot=await browser.send('Page.captureScreenshot',{format:'png'},page.sessionId);writeFileSync(join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));}

// scrollIntoView can move the popup while Leaflet is still finishing autoPan or a
// live-weather update. Dispatch real input only at a stable, uncovered target;
// a persistent overlay still fails with its actual hit target in the evidence.
async function actionPoint(page,selector,index=0){
 return page.evaluate(`(async()=>{
  const target=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
  if(!target)throw Error('Missing action target: '+${JSON.stringify(selector)});
  target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  const end=performance.now()+5000;let previous=null,stable=0,last;
  do{
   await new Promise(requestAnimationFrame);
   const r=target.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y),map=map_7010a44f6ac2025090f0fe07508ed485;
   last={x,y,width:r.width,height:r.height,reachable:!!hit&&(hit===target||target.contains(hit)),hit:hit?.id||hit?.className||hit?.tagName,panning:!!map._panAnim?._inProgress,mapScrollTop:map.getContainer().scrollTop,mapScrollLeft:map.getContainer().scrollLeft};
   stable=previous&&Math.abs(x-previous.x)<.5&&Math.abs(y-previous.y)<.5&&r.width===previous.width&&r.height===previous.height?stable+1:0;
   if(stable>=3&&last.reachable&&!last.panning&&!last.mapScrollTop&&!last.mapScrollLeft&&r.width>0&&r.height>0)return last;
   previous=last;
  }while(performance.now()<end);
  throw Error('Action target did not become stable and uncovered: '+JSON.stringify(last));
 })()`);
}

try{
 for(const width of WIDTHS){let page;try{
  page=await browser.page(width);const e=page.evaluate;
  await scenario(page,width,'all-240-real-markers-and-only-20-pilot-records',async e=>{
   const s=await e(`(()=>{const ids=${JSON.stringify(PILOT.flatMap(x=>x[2]))},sites=siteData;return {sites:sites.length,unique:new Set(sites.map(s=>s.id)).size,markers:sites.filter(s=>window[s.markerVar]&&markerRegistry[markerKey(s)]===window[s.markerVar]).length,pilot:sites.filter(s=>islandNearbySearchHtml(s)).map(s=>s.id).sort(),expected:ids.sort(),overflow:document.documentElement.scrollWidth>innerWidth};})()`);
   return {pass:s.sites===240&&s.unique===240&&s.markers===240&&JSON.stringify(s.pilot)===JSON.stringify(s.expected)&&!s.overflow,evidence:s};
  });
  await scenario(page,width,'actual-popups-six-islands-four-official-search-links',async e=>{
   const s=await e(`(()=>{const failures=[],checked=[];for(const [name,query,ids]of ${JSON.stringify(PILOT)})for(const id of ids){const site=siteData.find(s=>s.id===id),map=map_7010a44f6ac2025090f0fe07508ed485,marker=window[site.markerVar];map.setView([site.lat,site.lon],11,{animate:false});marker.addTo(map).openPopup();const root=marker.getPopup().getElement(),details=root.querySelector('.island-nearby-search'),links=details?[...details.querySelectorAll('a')]:[],terms=links.map(a=>decodeURIComponent(new URL(a.href).pathname.split('/search/')[1]||''));if(!details||details.open||links.length!==4||terms.filter(t=>t===query+' 음식점').length!==2||terms.filter(t=>t===query+' 숙박').length!==2||links.some(a=>a.target!=='_blank'||!a.rel.includes('noopener'))||root.querySelectorAll('a.ksa').length!==1||root.querySelectorAll('a.kakao').length!==1||root.querySelectorAll('a.naver').length!==1||!root.querySelector('a.tmap')||!root.querySelector('a.windy'))failures.push(id);checked.push(id);}return {checked:checked.length,failures};})()`);
   return {pass:s.checked===20&&s.failures.length===0,evidence:s};
  });
  if(width===1440)await scenario(page,width,'all-240-actual-popups-preserve-pilot-boundary',async e=>{
   const s=await e(`(()=>{const ids=new Set(${JSON.stringify(PILOT.flatMap(x=>x[2]))}),bad=[];for(const site of siteData){const marker=window[site.markerVar];marker.addTo(map_7010a44f6ac2025090f0fe07508ed485).openPopup();if(!!marker.getPopup().getElement().querySelector('.island-nearby-search')!==ids.has(site.id))bad.push(site.id);}return {checked:siteData.length,bad};})()`);return {pass:s.checked===240&&!s.bad.length,evidence:s};
  });
  await scenario(page,width,'native-details-click-keyboard-touch-layout-and-live-update',async e=>{
   await e("(()=>{const site=siteData.find(s=>s.id==='1'),map=map_7010a44f6ac2025090f0fe07508ed485;map.closePopup();map.setView([site.lat,site.lon],11,{animate:false});window[site.markerVar].addTo(map).openPopup();})()");
   await new Promise(r=>setTimeout(r,750));
   if(width===375||width===1440)await screenshot(page,'island-pilot-collapsed-'+width);
   const initial=await e("!document.querySelector('.leaflet-popup .island-nearby-search').open");
   const point=await actionPoint(page,'.leaflet-popup .island-nearby-search summary');
   if(width<=700){
    await browser.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]},page.sessionId);
    await browser.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},page.sessionId);
   }else for(const type of ['mousePressed','mouseReleased'])await browser.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},page.sessionId);
   const clicked=await e("document.querySelector('.leaflet-popup .island-nearby-search').open");
   await e("document.querySelector('.leaflet-popup .island-nearby-search summary').focus()");await key(page);
   const closedByKeyboard=await e("!document.querySelector('.leaflet-popup .island-nearby-search').open");await key(page);
   const s=await e("(()=>{const site=siteData.find(s=>s.id==='1'),popup=window[site.markerVar].getPopup(),d=popup.getElement().querySelector('.island-nearby-search'),wasOpen=d.open;popup.update();const applied=applyLiveWeatherToPopup(site,popup,__pilotQA.weather('1'),false),links=[...d.querySelectorAll('a')],sizes=[d.querySelector('summary'),...links].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})),content=popup.getElement().querySelector('.leaflet-popup-content');d.scrollIntoView({block:'center'});return {wasOpen,open:d.open,same:d===popup.getElement().querySelector('.island-nearby-search'),applied,sizes,overflow:document.documentElement.scrollWidth>innerWidth,popupOverflow:content.scrollWidth>content.clientWidth+1,links:links.length};})()");
   if(width===375||width===1440)await screenshot(page,'island-pilot-'+width);
   const links=await e("[...document.querySelectorAll('.leaflet-popup .nearby-search-link,.leaflet-popup a.ksa,.leaflet-popup a.naver,.leaflet-popup a.kakao,.leaflet-popup a.tmap,.leaflet-popup a.windy')].map(a=>({label:a.textContent.trim(),className:a.className}))");
   const hits=[];
   for(let i=0;i<links.length;i++){
    const selector='.leaflet-popup :is(.nearby-search-link,a.ksa,a.naver,a.kakao,a.tmap,a.windy)';
    hits.push({...links[i],...await actionPoint(page,selector,i)});
   }
   s.linkHits=hits;s.allLinksReachable=hits.every(x=>x.reachable);
   return {pass:initial&&clicked&&closedByKeyboard&&s.wasOpen&&s.open&&s.same&&s.applied&&s.links===4&&s.allLinksReachable&&s.sizes.every(x=>x.height>=44&&x.width>=44)&&!s.overflow&&!s.popupOverflow,evidence:{initial,input:width<=700?'touch':'mouse',point,clicked,closedByKeyboard,...s}};
  });
  await scenario(page,width,'search-weekly-tide-and-report-cancel-preserved',async e=>{
   const s=await e("(async()=>{const map=map_7010a44f6ac2025090f0fe07508ed485;map.closePopup();resetFilters();document.getElementById('searchBox').value='어청도';searchSite();const search=document.getElementById('searchResults').textContent.includes('어청도');toggleTodayPanel(true);const weekly=document.getElementById('todayPanel').style.display==='block'&&document.getElementById('todayPanelBody').textContent.length>0;toggleTodayPanel(false);const site=siteData.find(s=>s.id==='14'),marker=window[site.markerVar];map.setView([site.lat,site.lon],11,{animate:false});marker.addTo(map).openPopup();const tide=!!marker.getPopup().getElement().querySelector('.monthTideButton');await openMonthTideModal('14');const month=document.getElementById('monthTideModal').style.display==='flex';closeMonthTideModal();openReportModal();const report=document.getElementById('reportModal').style.display==='flex'&&!!document.getElementById('reportSpecies');closeReportModal();return {search,weekly,tide,month,report,cancel:document.getElementById('reportModal').style.display==='none',writes:__pilotQA.writes,geo:__pilotQA.geo};})()");
   return {pass:s.search&&s.weekly&&s.tide&&s.month&&s.report&&s.cancel&&s.writes===0&&s.geo===0,evidence:s};
  });
 }catch(error){check(width,'environment-or-harness',false,{error:String(error.stack)});}finally{if(page)await page.close();}}
}finally{await browser.dispose();await new Promise(r=>server.close(r));}
const result={schema:'island-nearby-actual-chrome-v1',at:new Date().toISOString(),indexSha256:createHash('sha256').update(HTML).digest('hex'),widths:WIDTHS,osmTiles:OSM_TILES,summary:{pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length},network,browserErrors,rows,scope:'Actual current index.html and Leaflet; optional public OpenStreetMap tiles. All worker reads are synthetic before application load; worker writes and external non-GET are blocked. Official business search links are inspected, never opened.'};
writeFileSync(join(OUT,'BROWSER_QA.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({summary:result.summary,network,browserErrors,failures:rows.filter(x=>!x.pass)},null,2));
process.exitCode=result.summary.fail||network.operatingRequests||network.externalNonGet||browserErrors.length?1:0;
