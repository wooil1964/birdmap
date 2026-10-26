// Read-only public API browser checks. No reports or infrastructure are written.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.resolve(process.env.DIRECTIONS_OUTPUT||path.join(ROOT,'.ci-results/report-directions'));
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://local').pathname);if(name==='/')name='/index.html';const file=path.resolve(ROOT,'.'+name);if(!file.startsWith(ROOT+path.sep))throw Error();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
const results=[],matrix=[],errors=[];let browser;
function check(ok,name){assert.ok(ok,name);results.push({name,pass:true});}
async function bridge(page){
 const state={search:[],deny:false};page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{try{
  if(r.request().method()!=='GET')return r.abort();const u=new URL(r.request().url());
  if(u.hostname.endsWith('workers.dev')){
   const response=await r.fetch({headers:{...r.request().headers(),origin:'https://wooil1964.github.io',referer:'https://wooil1964.github.io/birdmap/'}});
   if(u.pathname==='/reports/search'&&response.ok()){
    const body=await response.json();state.search=body.reports;
    if(state.deny){body.reports=body.reports.map(x=>({...x,locationHidden:true,target:undefined}));return r.fulfill({response,body:JSON.stringify(body),headers:{...response.headers(),'access-control-allow-origin':'*'}});}
   }
   return r.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
  }return r.continue();
 }catch{try{return await r.abort();}catch{}}});return state;
}
async function idle(page){await page.waitForFunction(()=>publicationAllowed()&&reportSearchIndex.length>1);}
async function closeCard(page){const close=page.getByRole('button',{name:'제보 위치 정보 닫기',exact:true});if(await close.count())await close.click();await idle(page);}
async function enterRecent(page,id){
 for(const name of ['최근 출현 제보 펼치기','최근 제보 펼치기']){const expand=page.getByRole('button',{name,exact:true});if(await expand.isVisible()){await expand.click();break;}}
 const index=await page.evaluate(id=>reportSearchIndex.filter(x=>x.date>=kstDateTextBefore(RECENT_REPORT_DAYS)).slice(0,RECENT_REPORT_LIMIT).findIndex(x=>reporterStatsWitnesses.get(x)===id),id);
 assert.ok(index>=0);await page.locator('#recentReportsList .recentReportSpecies').nth(index).click();
}
async function enterHistory(page,id,siteName){
 await page.evaluate(name=>{const site=siteData.find(s=>s.name===name);if(!site)throw Error('missing associated site '+name);const layer=window[site.markerVar],m=map_7010a44f6ac2025090f0fe07508ed485;if(!m.hasLayer(layer))layer.addTo(m);layer.openPopup();},siteName);
 const details=page.locator('.siteHistoryBox:visible');await details.locator('.siteHistoryTitle').click();
 const link=details.locator('.speciesSearchLink[data-report-id="'+id+'"]');
 for(let i=0;i<12&&!await link.count();i++){const more=details.locator('.siteHistoryMoreBtn');if(await more.count())await more.click();await page.waitForTimeout(500);}
 await link.first().click();
}
async function verifyCard(page,id,label){
 await page.waitForSelector('.birdmap-report-location-popup');await page.waitForTimeout(120);
 const actual=await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485,p=m._popup,el=p.getElement(),r=el.getBoundingClientRect(),root=p.getContent(),buttons=[...root.querySelectorAll('[data-birdmap-report-route]')];return{id:root.dataset.publicationEntry,point:p._source.getLatLng(),center:m.getCenter(),centerErrorPixels:m.latLngToContainerPoint(p._source.getLatLng()).distanceTo(m.getSize().divideBy(2)),zoom:m.getZoom(),rect:r.toJSON(),buttons:buttons.map(b=>({text:b.textContent,rect:b.getBoundingClientRect().toJSON(),href:b.getAttribute('href')})),highlight:document.querySelectorAll('.birdmap-report-location-selected').length,photos:root.querySelectorAll('img').length};});
 check(actual.id===id,label+' exact report ID');check(actual.zoom===13&&actual.centerErrorPixels<=1,label+' center matches current public marker '+JSON.stringify({center:actual.center,point:actual.point,zoom:actual.zoom}));
 check(actual.buttons.length===2&&actual.buttons.every(x=>x.rect.height>=44&&!x.href)&&Math.abs(actual.buttons[0].rect.top-actual.buttons[1].rect.top)<1,label+' two adjacent 44px coordinate-free buttons');
 check(actual.rect.width>=200&&actual.rect.width<=246&&actual.rect.height<260&&actual.rect.top>=0&&actual.rect.bottom<=page.viewportSize().height,label+' compact card inside map');
 check(actual.highlight===1&&actual.photos===0,label+' existing marker highlight and no photos');return actual;
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const mobile of [false,true]){
  const device=mobile?'Mobile Chrome emulation':'PC Chrome',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,userAgent:mobile?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36':undefined});
  const kakaoRequests=[];context.on('request',r=>{if(r.url().startsWith('https://map.kakao.com/link/to/'))kakaoRequests.push(r.url());});
  const page=await context.newPage(),state=await bridge(page),session=await context.newCDPSession(page),schemes=[];await session.send('Page.enable');session.on('Page.frameRequestedNavigation',e=>{if(e.url.startsWith('tmap:'))schemes.push(e.url);});
  await page.goto(base+'/index.html',{waitUntil:'load'});await idle(page);await page.waitForFunction(()=>document.querySelectorAll('#recentReportsList .recentReportItem').length>=4);
  // Candidate metadata is public /search output, then every click obtains its own fresh proof again.
  const recent=await page.evaluate(()=>reportSearchIndex.filter(x=>x.date>=kstDateTextBefore(RECENT_REPORT_DAYS)).slice(0,RECENT_REPORT_LIMIT).map(x=>({id:reporterStatsWitnesses.get(x),species:x.species[0]})));
  const candidates=[];
  for(const item of recent){
   await enterRecent(page,item.id);try{await page.waitForSelector('.birdmap-report-location-popup',{timeout:8000});}catch{continue;}
   const proof=state.search.find(x=>x.id===item.id),point=await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485._popup._source.getLatLng());
   if(proof&&proof.siteName&&!candidates.some(x=>x.point.lat===point.lat&&x.point.lng===point.lng))candidates.push({...item,siteName:proof.siteName,point});
   await closeCard(page);if(candidates.length===2)break;
  }
  check(candidates.length===2,device+' two distinct approved public report marker destinations');
  for(const entry of ['Recent 15','Site history'])for(const candidate of candidates){
   const label=device+' / '+entry+' / '+candidate.id;
   const enter=()=>entry==='Recent 15'?enterRecent(page,candidate.id):enterHistory(page,candidate.id,candidate.siteName);
   await enter();let actual=await verifyCard(page,candidate.id,label);await page.screenshot({path:path.join(OUT,(mobile?'mobile':'pc')+'-'+(entry==='Recent 15'?'recent':'history')+'-'+candidate.id+'.png')});
   let desktopMessage='';const before=schemes.length;
   if(!mobile)page.once('dialog',async d=>{desktopMessage=d.message();await d.dismiss();});
   await page.locator('[data-birdmap-report-route="tmap"]').click();
   if(mobile){await page.waitForFunction(()=>!document.querySelector('#birdmapReportLocationStatus')||document.querySelector('#birdmapReportLocationStatus').hidden);await page.waitForTimeout(100);check(schemes.length===before+1,label+' TMAP scheme requested');const u=new URL(schemes.at(-1));check(Number(u.searchParams.get('goalx'))===actual.point.lng&&Number(u.searchParams.get('goaly'))===actual.point.lat,label+' TMAP goal matches public marker');}
   else{await page.waitForFunction(()=>!document.querySelector('#birdmapReportLocationStatus')||document.querySelector('#birdmapReportLocationStatus').hidden);check(desktopMessage.includes('스마트폰')&&schemes.length===before,label+' desktop TMAP explains mobile-only use without scheme');}
   if(!await page.locator('.birdmap-report-location-popup').count())await enter();
   const openedPromise=context.waitForEvent('page');await page.locator('[data-birdmap-report-route="kakao"]').click();const external=await openedPromise;
   await external.waitForURL(u=>u.hostname.includes('kakao.com'),{timeout:15000});const firstUrl=external.url();
   // The first external navigation must include exactly the public marker destination.
   check(kakaoRequests.at(-1)&&decodeURIComponent(kakaoRequests.at(-1)).endsWith(','+actual.point.lat+','+actual.point.lng),label+' Kakao exact public marker coordinates requested');
   let finalUrl='',externalTitle='',externalError='';try{await external.waitForLoadState('domcontentloaded',{timeout:20000});finalUrl=external.url();externalTitle=await external.title();}catch(e){externalError=String(e);}
   check(externalTitle.includes('카카오맵')&&!externalError,label+' Kakao destination page loaded');
   matrix.push({device,entry,popup:{width:actual.rect.width,height:actual.rect.height},id:candidate.id,publicMarker:actual.point,tmap:mobile?'scheme requested; native app unverified':'smartphone-only explanation; no scheme',tmapUrl:mobile?schemes.at(-1):null,kakaoRequested:kakaoRequests.at(-1),kakaoFirstPage:firstUrl,kakaoFinal:finalUrl,kakaoTitle:externalTitle,kakaoError:externalError,physicalDevice:false});
   await external.screenshot({path:path.join(OUT,(mobile?'mobile':'pc')+'-kakao-'+candidate.id+'-'+(entry==='Recent 15'?'recent':'history')+'.png')}).catch(()=>{});await external.close();
   await closeCard(page);
  }
  // Revoke the public projection only in this local read bridge, after a card exists.
  await enterRecent(page,candidates[0].id);await page.waitForSelector('.birdmap-report-location-popup');state.deny=true;let tabs=0;context.on('page',()=>tabs++);const previous=schemes.length;
  await page.locator('[data-birdmap-report-route="kakao"]').click();await page.waitForFunction(()=>document.querySelector('#birdmapReportLocationStatus').textContent.includes('열지 않았습니다'));
  check(tabs===0&&schemes.length===previous,device+' existing buttons blocked by revoked public proof');state.deny=false;
  await closeCard(page);await session.detach();await page.unrouteAll({behavior:'ignoreErrors'});await context.close();console.log('PASS',device);
 }
 check(errors.length===0,'zero page JavaScript errors');fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify({physicalDevice:false,productionWritesBlocked:true,results,matrix,errors},null,2));console.log('PASS',results.length,'checks');
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:String(e),results,matrix,errors},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
