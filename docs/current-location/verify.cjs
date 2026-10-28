/* Local Chrome checks. Public production GETs only; all writes are blocked. Device GPS is synthetic. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.resolve(process.env.GPS_TEST_OUTPUT||path.join(ROOT,'.ci-results/current-location'));
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://local'),f=path.resolve(ROOT,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(ROOT+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));}catch{res.writeHead(404);res.end();}});
const results=[],errors=[],requests=[];let browser;
function check(value,name){assert.ok(value,name);results.push(name);}
async function emit(page,type='fix',extra={}){await page.evaluate(({type,extra})=>{
 const g=window.__testGps,p={coords:{latitude:37.48261942,longitude:126.81234982,accuracy:25,...extra},timestamp:Date.now()};
 if(type==='watch')g.watch.at(-1).ok(p);else if(type==='error')g.once.at(-1).bad(extra);else g.once.at(-1).ok(p);
},{type,extra});}
async function count(page,cls){return page.locator(cls).count();}
async function guideReady(page){await page.waitForSelector('.birdmap-gps-guide');await page.waitForFunction(()=>document.querySelector('#birdmapGpsStatus').textContent.includes('직선거리'));}
async function toolsOpen(page){const b=page.getByRole('button',{name:'위치 도구 열기',exact:true});if(await b.count())await b.click();}
async function site(page,id){await page.evaluate(id=>{const s=siteData.find(s=>s.id===id),l=window[s.markerVar];l.addTo(map_7010a44f6ac2025090f0fe07508ed485);l.openPopup();},id);await page.waitForTimeout(700);}
async function gpsButton(page){await page.waitForTimeout(300);await page.getByRole('button',{name:'내 위치 찾기',exact:true}).click();await page.waitForFunction(()=>__testGps.once.length>__testGps.used);await page.evaluate(()=>__testGps.used=__testGps.once.length);}
async function inView(page){return page.evaluate(()=>{
 const m=map_7010a44f6ac2025090f0fe07508ed485,points=[];m.eachLayer(l=>{if(l.options?.className==='birdmap-gps-guide')points.push(...l.getLatLngs());});
 return points.length===2&&points.every(p=>{const q=m.latLngToContainerPoint(p),s=m.getSize();return q.x>=0&&q.x<=s.x&&q.y>=0&&q.y<=s.y;});
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const [width,height,touch] of [[1440,1000,false],[1024,768,false],[768,1024,true],[320,568,true],[390,844,true],[844,390,true]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:touch,hasTouch:touch}),label=width+'x'+height;let deny=false;
  page.on('pageerror',e=>errors.push(label+': '+e.message));
  await page.addInitScript(()=>{const g=window.__testGps={once:[],watch:[],cleared:[],used:0};Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,bad,options){g.once.push({ok,bad,options});},watchPosition(ok,bad,options){g.watch.push({ok,bad,options});return g.watch.length;},clearWatch(id){g.cleared.push(id);}}});});
  await page.route('**/*',async r=>{const request=r.request(),u=new URL(request.url());requests.push({url:request.url(),method:request.method(),body:request.postData(),blocked:request.method()!=='GET'});
   try{if(request.method()!=='GET')return r.abort();
    if(u.hostname.endsWith('workers.dev')&&!u.pathname.startsWith('/tiles')){
     const response=await r.fetch({headers:{...request.headers(),origin:'https://wooil1964.github.io',referer:'https://wooil1964.github.io/birdmap/'}});
     if(u.pathname==='/reports/search'&&response.ok()&&deny){const body=await response.json();body.reports=body.reports.map(x=>({...x,locationHidden:true,target:undefined}));return r.fulfill({response,body:JSON.stringify(body),headers:{...response.headers(),'access-control-allow-origin':'*'}});}
     return r.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
    }
    // Normal map viewport tile requests are separate from GPS. Never send test locations to tile providers.
    if(u.pathname.startsWith('/tiles')||/tile\.openstreetmap\.org$/.test(u.hostname))return r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
    return r.continue();
   }catch{try{return await r.abort();}catch{}}
  });
  try{
   await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>window.birdmapLocation&&document.querySelectorAll('#recentReportsList .recentReportItem').length>=4);await page.waitForTimeout(800);
   check(await page.evaluate(()=>__testGps.once.length===0),label+' no automatic GPS request');
   check(await page.evaluate(()=>siteData.length===229&&new Set(siteData.map(s=>s.id)).size===229),label+' 229 unique sites');
   check(await page.evaluate(()=>siteData.every(s=>{const l=window[s.markerVar],root=v23PopupContent(s,l.getPopup()._birdmapDesktopContent||l.getPopup().getContent());return root.querySelectorAll('[data-location-site]').length===1&&root.querySelectorAll('a.kakao').length===1;})),label+' every site profile including 189/190/islands has one GPS and one Kakao');
   check(await page.locator('#recentReportsList .recentReportItem').count()===15,label+' recent 15 retained');
   const control=page.locator('#birdmapGpsLocate'),r=await control.boundingBox();check(r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.y+r.height<=height,label+' independent edge GPS visible');
   await control.click();await emit(page);await page.waitForSelector('.birdmap-gps-dot');check(await count(page,'.birdmap-gps-accuracy')===1,label+' standalone blue dot and accuracy');
   await site(page,'195');await gpsButton(page);await emit(page);await guideReady(page);check(await inView(page),label+' site guide endpoints in view');
   check(await page.locator('.birdmap-gps-distance').innerText().then(x=>/직선거리 .* (m|km)/.test(x)),label+' distance label uses m or km');
   check(await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485;let guide;m.eachLayer(l=>{if(l.options?.className==='birdmap-gps-guide')guide=l;});return guide.options.dashArray==='7 8';}),label+' dashed straight guide');
   const tray=await page.locator('#birdmapGps').boundingBox();check(tray.y+tray.height<=height,label+' full GPS tools inside viewport');
   check(await page.evaluate(()=>{const p=map_7010a44f6ac2025090f0fe07508ed485._popup.getElement().getBoundingClientRect();return p.top>=0&&p.bottom<=innerHeight;}),label+' destination popup remains inside viewport');
   check(await page.evaluate(()=>{const sheet=document.querySelector('.birdmap-mobile-popup');if(!sheet||!sheet.getClientRects().length)return true;const a=sheet.getBoundingClientRect(),b=document.querySelector('#birdmapGps').getBoundingClientRect();return b.bottom<=a.top||b.top>=a.bottom||b.right<=a.left||b.left>=a.right;}),label+' compact GPS does not cover site sheet');
   await page.screenshot({path:OUT+'/site-guide-'+label+'.png'});
   const before=await page.evaluate(()=>({center:map_7010a44f6ac2025090f0fe07508ed485.getCenter(),zoom:map_7010a44f6ac2025090f0fe07508ed485.getZoom()}));
   await toolsOpen(page);await page.getByRole('button',{name:'이동 갱신',exact:true}).click();await emit(page,'watch',{latitude:37.49,accuracy:250});
   check(await page.locator('#birdmapGpsStatus').innerText().then(t=>t.includes('오차가 큽니다')),label+' poor accuracy explained');
   check(await page.evaluate(before=>{const m=map_7010a44f6ac2025090f0fe07508ed485,p=m.getCenter();return m.getZoom()===before.zoom&&p.lat===before.center.lat&&p.lng===before.center.lng;},before),label+' tracking preserves manual camera');
   await page.getByRole('button',{name:'안내 종료',exact:true}).click();check(await count(page,'.birdmap-gps-guide')===0&&await count(page,'.birdmap-gps-dot')===1,label+' guide end keeps blue point');
   await page.getByRole('button',{name:'위치 지우기',exact:true}).click();check(await count(page,'.birdmap-gps-dot')===0&&await count(page,'.birdmap-gps-accuracy')===0,label+' clear removes position');
   // The fixed red points were already public static data; attached reports still use exact-row proof.
   await page.evaluate(()=>{const l=siteSpotLayers[0];l.addTo(map_7010a44f6ac2025090f0fe07508ed485);l.openPopup();});await gpsButton(page);await emit(page);await guideReady(page);check(await inView(page),label+' static red-marker GPS');
   await toolsOpen(page);await page.getByRole('button',{name:'안내 종료',exact:true}).click();
   const id=await page.evaluate(()=>{const e=reportSearchIndex.filter(x=>x.date>=kstDateTextBefore(RECENT_REPORT_DAYS))[0];return reporterStatsWitnesses.get(e);});
   check(await page.evaluate(id=>openPublicReportLocation(id,''),id),label+' exact public report opens');
   await gpsButton(page);await emit(page);await guideReady(page);check(await inView(page),label+' exact recent/history guide endpoints in view');
   check(await page.locator('.birdmap-report-location-routes button').count()===3,label+' existing directions beside GPS');await page.screenshot({path:OUT+'/report-guide-'+label+'.png'});
   await page.evaluate(()=>publicationInvalidate('synthetic browser check'));check(await count(page,'.birdmap-gps-guide')===0,label+' publication invalidation clears guide immediately');
   await page.evaluate(()=>publicationRefresh());await page.waitForFunction(()=>publicationAllowed()&&reportSearchIndex.length>0);
   check(await page.evaluate(id=>openPublicReportLocation(id,''),id),label+' report reopens after verified refresh');
   await gpsButton(page);await page.evaluate(()=>publicationInvalidate('cancel pending GPS'));await emit(page);await page.waitForTimeout(150);check(await count(page,'.birdmap-gps-guide')===0,label+' delayed GPS cannot restore revoked guide');
   await page.evaluate(()=>publicationRefresh());await page.waitForFunction(()=>publicationAllowed()&&reportSearchIndex.length>0);
   check(await page.evaluate(id=>openPublicReportLocation(id,''),id),label+' reopen for hidden proof check');const gpsBefore=await page.evaluate(()=>__testGps.once.length);deny=true;
   await page.getByRole('button',{name:'내 위치 찾기',exact:true}).click();await page.waitForFunction(()=>!birdmapLocation.state().guiding);
   check(await page.evaluate(n=>__testGps.once.length===n,gpsBefore),label+' hidden/protected proof never asks for GPS');deny=false;
   if(width===1440){
    await page.locator('#birdmapGpsLocate').click();await emit(page,'fix',{accuracy:500});check(await page.locator('#birdmapGpsStatus').isVisible()&&(await page.locator('#birdmapGpsStatus').innerText()).includes('오차가 큽니다'),label+' poor accuracy warning is visible with tools collapsed');
    await page.locator('#birdmapGpsLocate').click();await emit(page,'error',{code:1});check((await page.locator('#birdmapGpsStatus').innerText()).includes('권한'),label+' denied error visible');
    await page.locator('#birdmapGpsLocate').click();await emit(page,'error',{code:3});check((await page.locator('#birdmapGpsStatus').innerText()).includes('초과'),label+' timeout visible');
   }
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' no horizontal page overflow');
   check(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(s=>s.includes('37.48261942')||s.includes('126.81234982'))),label+' no GPS coordinates in browser storage');
   console.log('PASS '+label);
  }catch(e){await page.screenshot({path:OUT+'/failure-'+label+'.png'});throw e;}finally{await page.close();}
 }
 check(errors.length===0,'no browser JavaScript errors: '+errors.join('; '));
 check(requests.every(r=>![r.url,r.body||''].some(s=>s.includes('37.48261942')||s.includes('126.81234982'))),'no raw GPS coordinates in any network URL or body');
 check(requests.every(r=>r.method==='GET'||r.blocked),'all non-GET requests blocked');
 fs.writeFileSync(OUT+'/result.json',JSON.stringify({passed:results.length,checks:results,errors,requests:requests.length},null,2));console.log('PASS '+results.length+' checks');
})().catch(e=>{console.error(e);fs.writeFileSync(OUT+'/failure.txt',e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
