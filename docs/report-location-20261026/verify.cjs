const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const ROOT=path.resolve(process.env.REPORT_UI_ROOT||path.join(__dirname,'../..')),OUT=path.resolve(process.env.REPORT_UI_OUTPUT||path.join(ROOT,'.ci-results/report-location'));
fs.mkdirSync(OUT,{recursive:true});
const original={};for(const f of ['assets/birdmap-basemap.css','assets/birdmap-basemap-init.js','assets/birdmap-species-search.css','assets/birdmap-species-search.js'])original[f]=cp.execFileSync('git',['show',(process.env.REPORT_UI_BASE||'5ebae1eb43d55995678fd402bcd509228e81522e')+':'+f],{cwd:ROOT});
const server=http.createServer((req,res)=>{try{let url=decodeURIComponent(new URL(req.url,'http://local').pathname),baseline=url.startsWith('/baseline/');if(baseline)url=url.slice(9);if(url==='/')url='/index.html';const target=path.resolve(ROOT,'.'+url);if(!target.startsWith(ROOT+path.sep))throw Error();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(baseline&&original[url.slice(1)]?original[url.slice(1)]:fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
const results=[],errors=[];let browser;
function check(ok,name){assert.ok(ok,name);results.push({name,pass:true});}
async function readBridge(page){
  const state={search:[],deny:false};page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async r=>{try{
    if(r.request().method()!=='GET')return r.abort();
    const u=new URL(r.request().url());
    if(u.hostname.endsWith('workers.dev')){
      const response=await r.fetch({headers:{...r.request().headers(),origin:'https://wooil1964.github.io',referer:'https://wooil1964.github.io/birdmap/'}});
      if(u.pathname==='/reports/search'&&response.ok()){
        const body=await response.json();state.search=body.reports;
        if(state.deny){body.reports=body.reports.map(x=>({...x,locationHidden:true,target:undefined}));return r.fulfill({response,body:JSON.stringify(body),headers:{...response.headers(),'access-control-allow-origin':'*'}});}
      }
      return r.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
    }return r.continue();
  }catch{try{return await r.abort();}catch{}}});
  return state;
}
async function ready(page,url){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelectorAll('#recentReportsList .recentReportItem').length>=4&&typeof openPublicReportLocation==='function');await page.waitForTimeout(400);}
async function drag(page,locator,dy){
  const r=await locator.boundingBox(),session=await page.context().newCDPSession(page),x=r.x+r.width/2,y=r.y+r.height/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8,id:1}]});await page.waitForTimeout(20);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await page.waitForTimeout(120);
}
async function four(page){return page.evaluate(()=>{
  const list=document.querySelector('#recentReportsList').getBoundingClientRect(),r=[...document.querySelectorAll('#recentReportsList .recentReportItem')].slice(0,5).map(x=>x.getBoundingClientRect());
  return r[0].top===r[1].top&&r[2].top===r[3].top&&r[0].left===r[2].left&&r.slice(0,4).every(x=>x.top>=list.top-1&&x.bottom<=list.bottom+1)&&r[4].top>=list.bottom-1;
});}
async function first(page){return page.evaluate(()=>{const e=reportSearchIndex.filter(x=>x.date>=kstDateTextBefore(RECENT_REPORT_DAYS))[0];const l=e.kind==='spot'?reportSpotLayers[e.spotId]:siteSpotLayers[siteSpotData.findIndex(s=>s.id===e.spotId)];return{id:reporterStatsWitnesses.get(e),point:l.getLatLng()};});}
async function siteOpen(page,name){return page.evaluate(name=>{
  const s=siteData.find(x=>x.name===name)||siteData[0],l=window[s.markerVar];if(!map_7010a44f6ac2025090f0fe07508ed485.hasLayer(l))l.addTo(map_7010a44f6ac2025090f0fe07508ed485);l.openPopup();return s.name;
},name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const [width,height] of [[320,568],[375,812],[390,844],[430,932],[640,360],[844,390],[932,430]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1}),bridge=await readBridge(page);const label=width+'x'+height;
  try{
   await ready(page,origin+'/index.html');
   check(await page.locator('#birdmapExploreMenuToggle').getAttribute('aria-expanded')==='true',label+' right menu initially expanded');
   check(await page.locator('#noticeToggleBtn').isVisible()&&await page.locator('#todayToggleBtn').isVisible()&&await page.locator('#reportToggleBtn').isVisible(),label+' original three buttons visible');
   check(await page.locator('#recentReportsBox').evaluate(n=>n.classList.contains('birdmap-sheet-collapsed')),label+' recent initially collapsed');
   check((await page.locator('#recentReportsBox').boundingBox()).height<=54&&!await page.locator('#recentReportsList').isVisible(),label+' compact title bar only');
   check((await page.locator('#recentReportsCount').innerText())==='15건',label+' actual report count visible');
   check(await page.locator('.birdmap-basemap-toggle').getAttribute('aria-expanded')===String(height>=700),label+' original left menu initial state');
   check(await page.evaluate(()=>[...document.querySelectorAll('#topBtnRow button')].filter(n=>n.getClientRects().length).every(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.height>=44&&(hit===n||n.contains(hit));})),label+' initial menu touch targets unobstructed');
   await page.screenshot({path:OUT+'/initial-'+label+'.png'});
   await page.locator('#birdmapExploreMenuToggle').click();
   check(!await page.locator('#noticeToggleBtn').isVisible()&&!await page.locator('#todayToggleBtn').isVisible()&&!await page.locator('#reportToggleBtn').isVisible(),label+' fold right three buttons');
   await page.locator('#birdmapExploreMenuToggle').click();
   check(await page.locator('#noticeToggleBtn').isVisible(),label+' restore right menu');
   await page.getByRole('button',{name:'최근 출현 제보 펼치기',exact:true}).click();await page.waitForTimeout(100);
   check(await four(page),label+' expand exactly four reports in two columns');
   check(await page.locator('#reportArchiveOpen').isVisible()&&await page.getByRole('tab',{name:'이번 달 기여자',exact:true}).isVisible(),label+' archive and contributors preserved');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&![...document.querySelectorAll('#recentReportsList .recentReportSpecies,#recentReportsList .recentReportMeta')].some(n=>n.scrollWidth>n.clientWidth+1)&&!document.querySelector('#recentReportsList img')),label+' no horizontal clipping or photos');
   await page.screenshot({path:OUT+'/expanded-'+label+'.png'});
   const before=await first(page),search=await page.locator('#searchBox').inputValue();
   await page.locator('#recentReportsList .recentReportSpecies').first().click();await page.waitForSelector('.birdmap-report-location-popup');
   await page.waitForTimeout(800);
   const route=await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485,n=document.querySelector('.birdmap-report-location-popup'),r=n.getBoundingClientRect();return{id:n.querySelector('[data-publication-entry]').getAttribute('data-publication-entry'),zoom:m.getZoom(),center:m.getCenter(),width:r.width,top:r.top,bottom:r.bottom,big:!!document.querySelector('.birdmap-mobile-popup'),highlight:document.querySelectorAll('.birdmap-report-location-selected').length};});
   check(route.id===before.id&&route.zoom===13&&Math.abs(route.center.lat-before.point.lat)<1e-7&&Math.abs(route.center.lng-before.point.lng)<1e-7,label+' exact report ID and stable public marker destination');
   check(route.width>=200&&route.width<=240&&route.top>=0&&route.bottom<=height&&!route.big,label+' small readable report popup');
   check(route.highlight===1&&await page.locator('#searchBox').inputValue()===search&&!await page.locator('#reportArchiveModal').isVisible(),label+' existing marker highlighted without search UI');
   check(await page.locator('#recentReportsBox').evaluate(n=>n.classList.contains('birdmap-sheet-collapsed')),label+' report popup temporarily collapses list');
   const info=bridge.search.find(x=>x.id===before.id);check(!!info,label+' exact server proof found');
   await page.screenshot({path:OUT+'/small-'+label+'.png'});
   await page.getByRole('button',{name:'제보 위치 정보 닫기',exact:true}).click();
   check(await page.locator('#recentReportsBox').evaluate(n=>n.classList.contains('birdmap-sheet-expanded')),label+' prior expanded state restored');
   const normalHeight=(await page.locator('#recentReportsBox').boundingBox()).height;
   await drag(page,page.locator('#recentReportsBox>.birdmap-sheet-handle'),-80);
   check((await page.locator('#recentReportsBox').boundingBox()).height<=normalHeight+3&&await four(page),label+' recent height capped at four items');
   await drag(page,page.locator('#recentReportsBox>.birdmap-sheet-handle'),45);
   const savedHeight=(await page.locator('#recentReportsBox').boundingBox()).height;
   check(savedHeight<normalHeight-20,label+' recent touch drag down');
   await siteOpen(page,info.siteName);await page.waitForSelector('.birdmap-mobile-popup');
   check(!await page.locator('#recentReportsBox').isVisible(),label+' site details temporarily suppress list');
   const old=(await page.locator('.birdmap-mobile-popup').boundingBox()).height;
   await drag(page,page.locator('.birdmap-mobile-popup .birdmap-sheet-handle'),-40);
   check((await page.locator('.birdmap-mobile-popup').boundingBox()).height>old+20,label+' large site detail drag retained');
   check(await page.locator('.birdmap-mobile-popup a.kakao').count()===1&&await page.locator('.birdmap-mobile-popup .siteHistoryBox').count()===1,label+' site directions and history retained');
   await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();
   check(Math.abs((await page.locator('#recentReportsBox').boundingBox()).height-savedHeight)<=2,label+' restore user dragged height');
   await page.getByRole('button',{name:'최근 제보 접기',exact:true}).click();
   await siteOpen(page,info.siteName);await page.waitForSelector('.birdmap-mobile-popup');await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();
   check((await page.locator('#recentReportsBox').boundingBox()).height<=54,label+' collapsed state restored after site details');
   await page.getByRole('button',{name:'최근 제보 펼치기',exact:true}).click();await page.getByRole('button',{name:'최근 제보 패널 닫기',exact:true}).click();
   check(!await page.locator('#recentReportsBox').isVisible()&&await page.locator('#birdmapRecentReopen').isVisible(),label+' close differs from collapse');
   await siteOpen(page,info.siteName);await page.waitForSelector('.birdmap-mobile-popup');await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();
   check(!await page.locator('#recentReportsBox').isVisible(),label+' closed state restored after site details');
   await page.locator('#birdmapRecentReopen').click();check(await four(page),label+' reopen previous expanded state');
   await page.getByRole('tab',{name:'이번 달 기여자',exact:true}).click();await page.getByRole('button',{name:'최근 제보 접기',exact:true}).click();
   check(await page.locator('#recentReportsCount').isVisible(),label+' count visible when collapsed from contributors');
   await page.getByRole('button',{name:'최근 제보 펼치기',exact:true}).click();await page.getByRole('tab',{name:'최근 제보',exact:true}).click();
   if(width===390){
    await siteOpen(page,info.siteName);await page.waitForSelector('.birdmap-mobile-popup .siteHistoryBox');
    await page.locator('.birdmap-mobile-popup .siteHistoryTitle').click();await page.waitForSelector('.birdmap-mobile-popup .speciesSearchLink');
    const link=page.locator('.birdmap-mobile-popup .speciesSearchLink').first(),id=await link.getAttribute('data-report-id');
    await link.click();await page.waitForSelector('.birdmap-report-location-popup');await page.waitForTimeout(200);
    check(await page.locator('.birdmap-report-location-popup [data-publication-entry]').getAttribute('data-publication-entry')===id,'history species routes by its exact report ID');
    const stats=page.locator('.birdmap-report-location-popup .reporterStatsLink').first();if(await stats.count()){await stats.click();await page.waitForFunction(()=>document.querySelector('#reporterStatsContent').textContent.includes('승인 제보 건수'));await page.waitForTimeout(800);check(await page.locator('#reporterStatsModal').isVisible(),'mini popup reporter statistics retained');await page.locator('#reporterStatsClose').click();}
    await page.getByRole('button',{name:'제보 위치 정보 닫기',exact:true}).click();
    bridge.deny=true;const camera=await page.evaluate(()=>({z:map_7010a44f6ac2025090f0fe07508ed485.getZoom(),c:map_7010a44f6ac2025090f0fe07508ed485.getCenter()}));
    await page.locator('#recentReportsList .recentReportSpecies').first().click();await page.waitForFunction(()=>document.querySelector('#birdmapReportLocationStatus').textContent.includes('표시하지 않습니다'));
    check(await page.locator('.birdmap-report-location-popup').count()===0&&await page.evaluate(a=>{const m=map_7010a44f6ac2025090f0fe07508ed485,c=m.getCenter();return a.z===m.getZoom()&&a.c.lat===c.lat&&a.c.lng===c.lng;},camera),'hidden report proof never moves or opens popup');
    bridge.deny=false;
    await page.locator('#reportArchiveOpen').click();await page.waitForSelector('#reportArchiveModal',{state:'visible'});
    await page.locator('#reportArchiveSearch').fill(info.species[0]);await page.locator('#reportArchiveSearch').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('#reportArchiveContent .recentReportItem').length>0);
    check(true,'full archive search preserved');await page.locator('#reportArchiveModal .monthTideHeader button').click();
   }
   // Leave both choices changed, then prove reload resets the requested initial state.
   await page.getByRole('button',{name:'최근 제보 패널 닫기',exact:true}).click();await page.locator('#birdmapExploreMenuToggle').click();
   await ready(page,origin+'/index.html');
   check(await page.locator('#birdmapExploreMenuToggle').getAttribute('aria-expanded')==='true'&&(await page.locator('#recentReportsBox').boundingBox()).height<=54,label+' reload resets right expanded and recent collapsed');
   await page.getByRole('button',{name:'최근 제보 펼치기',exact:true}).click();await page.getByRole('button',{name:'최근 제보 패널 닫기',exact:true}).click();
   let toggle=page.locator('.birdmap-basemap-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
   for(let i=0;i<4;i++){const b=page.locator('.birdmap-basemap__choice').nth(i);await b.click();check(await b.getAttribute('aria-pressed')==='true',label+' map choice '+i);}
   console.log('PASS',label);
  }finally{await page.unrouteAll({behavior:'ignoreErrors'});await page.close();}
 }
 for(const width of [1024,1440]){
  const states=[];for(const prefix of ['/baseline','']){const page=await browser.newPage({viewport:{width,height:1000}});await readBridge(page);try{
    await page.goto(origin+prefix+'/index.html',{waitUntil:'load'});await page.waitForFunction(()=>document.querySelectorAll('#recentReportsList .recentReportItem').length>=4);await page.locator('.birdmap-basemap__choice').last().click();await page.waitForTimeout(250);
    states.push(await page.evaluate(()=>['#mapTitleBox','#togglePanelBtn','#noticeToggleBtn','#todayToggleBtn','#recentReportsBox','.birdmap-basemap'].map(s=>{const n=document.querySelector(s);return{s,rect:n.getBoundingClientRect().toJSON(),text:n.innerText};})));
    if(!prefix){check(!await page.locator('#birdmapExploreMenuToggle').isVisible(),width+' PC menu unchanged');await page.screenshot({path:OUT+'/pc-'+width+'.png'});const f=await first(page);await page.locator('#recentReportsList .recentReportSpecies').first().click();await page.waitForSelector('.birdmap-report-location-popup');check(await page.locator('.birdmap-report-location-popup [data-publication-entry]').getAttribute('data-publication-entry')===f.id,width+' PC exact report route');}
   }finally{await page.unrouteAll({behavior:'ignoreErrors'});await page.close();}}
  assert.deepEqual(states[1],states[0]);check(true,width+' desktop geometry and text unchanged');
 }
 check(errors.length===0,'zero JavaScript page errors');
 fs.writeFileSync(path.join(OUT,'validation.json'),JSON.stringify({base:'5ebae1eb43d55995678fd402bcd509228e81522e',physicalDevice:false,productionWritesBlocked:true,results,errors},null,2));console.log('PASS',results.length,'checks');
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:String(e),results,errors},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
