const fs=require('node:fs'); const path=require('node:path'); const http=require('node:http'); const cp=require('node:child_process'); const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'../..'), out=path.resolve(process.env.MOBILE_UI_OUTPUT||path.join(repo,'.ci-results/mobile-ui')); fs.mkdirSync(out,{recursive:true});
const before={};for(const f of ['assets/birdmap-basemap.css','assets/birdmap-basemap-init.js'])before[f]=cp.execFileSync('git',['show',(process.env.MOBILE_BASE_REF||'b3fe082e20f1433b40bd3e0e0e2b768e0277eb34')+':'+f],{cwd:repo});
const server=http.createServer((req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),base=p.startsWith('/baseline/');if(base)p=p.slice(9);if(p==='/'||!p)p='/index.html';const file=path.resolve(repo,'.'+p);if(!file.startsWith(repo+path.sep))throw Error();const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[ext]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(base&&before[p.slice(1)]?before[p.slice(1)]:fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
const assert=require('node:assert/strict');
const results=[],errors=[];let browser;
async function bridge(page) {
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    if(route.request().method()!=='GET')return route.abort();
    if(new URL(route.request().url()).hostname.endsWith('workers.dev')){
      try{const response=await route.fetch({headers:{...route.request().headers(),origin:'https://wooil1964.github.io',referer:'https://wooil1964.github.io/birdmap/'}});
        return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
      }catch{return route.abort();}
    }
    return route.continue();
  });
}
async function drag(page,locator,dy){
  const box=await locator.boundingBox(),cdp=await page.context().newCDPSession(page);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8,id:1}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();await page.waitForTimeout(150);
}
function check(condition,label){assert.ok(condition,label);results.push({check:label,pass:true});}
async function layout(page){return page.evaluate(()=>{
  const r=x=>{const n=document.querySelector(x);return n?n.getBoundingClientRect().toJSON():null;};
  const list=r('#recentReportsList'),rows=[...document.querySelectorAll('#recentReportsList .recentReportItem')].slice(0,5).map(x=>x.getBoundingClientRect().toJSON());
  return{list,rows,recent:r('#recentReportsBox'),scroll:document.documentElement.scrollWidth,inner:innerWidth,selector:r('.birdmap-basemap'),buttons:[...document.querySelectorAll('#topBtnRow button')].filter(x=>x.getClientRects().length).map(x=>({id:x.id,r:x.getBoundingClientRect().toJSON()})),overflow:[...document.querySelectorAll('#recentReportsList .recentReportSpecies,#recentReportsList .recentReportMeta')].some(x=>x.scrollWidth>x.clientWidth+1)};
});}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const [width,height] of [[320,568],[375,812],[390,844],[430,932]]){
    const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});await bridge(page);
    await page.goto(origin+'/index.html',{waitUntil:'load'});await page.waitForFunction(()=>document.querySelectorAll('#recentReportsList .recentReportItem').length>=4);
    await page.waitForTimeout(750);let l=await layout(page);await page.screenshot({path:out+'/mobile-'+width+'.png'});
    check(l.recent.x===0&&l.recent.width===width&&l.recent.bottom===height,width+' full width sheet');
    check(l.rows[0].x===l.rows[2].x&&l.rows[1].x===l.rows[3].x&&l.rows[0].y===l.rows[1].y&&l.rows[2].y===l.rows[3].y,width+' 2 columns x 2 rows');
    check(l.rows.slice(0,4).every(r=>r.top>=l.list.top-1&&r.bottom<=l.list.bottom+1)&&l.rows[4].top>=l.list.bottom-1,width+' exactly 4 complete reports');
    check(!l.overflow&&l.scroll<=width,width+' no horizontal text clipping');
    check((await page.locator('#recentReportsList img').count())===0,width+' no photos');
    check(l.buttons.every(x=>x.r.height>=44&&x.r.left>=0&&x.r.right<=width),width+' function button touch targets');
    check(l.buttons.every((a,i)=>l.buttons.every((b,j)=>i===j||a.r.right<=b.r.left||b.r.right<=a.r.left||a.r.bottom<=b.r.top||b.r.bottom<=a.r.top)),width+' no function button overlap');
    check(await page.evaluate(()=>[...document.querySelectorAll('.leaflet-control-zoom a')].every(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit);})),width+' zoom and fullscreen controls reachable');
    await page.screenshot({path:out+'/mobile-'+width+'.png'});
    await page.locator('#togglePanelBtn').click();check(!await page.locator('#recentReportsBox').isVisible(),width+' filter remains unobstructed');await page.locator('#searchBox').fill('철원');await page.locator('#birdmapPanel button').filter({hasText:/^검색$/}).click();check((await page.locator('#searchResults .resultItem').count())>0,width+' site search preserved');await page.locator('#togglePanelBtn').click();check(await page.locator('#recentReportsBox').isVisible(),width+' recent returns after filter');
    const initial=l.recent.height;
    await drag(page,page.locator('#recentReportsBox > .birdmap-sheet-handle'),-75);
    check((await page.locator('#recentReportsBox').boundingBox()).height>initial+50,width+' real touch drag recent up');
    await drag(page,page.locator('#recentReportsBox > .birdmap-sheet-handle'),55);
    check((await page.locator('#recentReportsBox').boundingBox()).height<initial+50,width+' real touch drag recent down');
    await page.getByRole('button',{name:'최근 제보 펼치기',exact:true}).click();let expanded=(await page.locator('#recentReportsBox').boundingBox()).height;
    await page.getByRole('button',{name:'최근 제보 접기',exact:true}).click();
    check((await page.locator('#recentReportsBox').boundingBox()).height<expanded,width+' separate expand/collapse');
    await page.getByRole('button',{name:'최근 제보 패널 닫기',exact:true}).click();check(!await page.locator('#recentReportsBox').isVisible(),width+' close sheet');
    await page.getByRole('button',{name:'최근 출현 제보 패널 열기',exact:true}).click();check(await page.locator('#recentReportsBox').isVisible(),width+' reopen sheet');
    let toggle=page.locator('.birdmap-basemap-toggle');if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
    check(!await page.locator('.birdmap-basemap__choices').isVisible(),width+' collapse map selector');await toggle.click();
    check(await page.locator('.birdmap-basemap__choices').isVisible(),width+' expand map selector');
    for(let i=0;i<4;i++){const choice=page.locator('.birdmap-basemap__choice').nth(i);await choice.click();check(await choice.getAttribute('aria-pressed')==='true',width+' map choice '+i);}
    await page.locator('.birdmap-basemap__choice').first().click();await toggle.click();
    await page.locator('#recentReportsList .recentReportSpecies').first().click();await page.waitForSelector('.birdmap-mobile-popup');
    check(!await page.locator('#recentReportsBox').isVisible(),width+' detail replaces recent sheet');
    const detail=page.locator('.birdmap-mobile-popup');const db=await detail.boundingBox();check(db.x===0&&db.width===width&&db.y+db.height===height,width+' detail full width');
    await drag(page,detail.locator('.birdmap-sheet-handle'),-60);check((await detail.boundingBox()).height>db.height+40,width+' real touch drag detail');
    await page.getByRole('button',{name:'상세정보 펼치기',exact:true}).click();await page.waitForTimeout(200);
    check(await detail.locator('.spotRouteButtons a').count()>=1,width+' report directions preserved');
    const stat=detail.locator('.reporterStatsLink').first();if(await stat.count()){await stat.click();await page.waitForFunction(()=>document.querySelector('#reporterStatsContent').textContent.includes('승인 제보 건수'));check(true,width+' reporter statistics');await page.locator('#reporterStatsClose').click();}
    await page.screenshot({path:out+'/mobile-'+width+'-detail.png'});
    await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();
    check(await page.locator('#recentReportsBox').isVisible(),width+' recent returns after detail');
    await page.evaluate(()=>{resetFilters();window[siteData[0].markerVar].openPopup();});await page.waitForSelector('.birdmap-mobile-popup .siteHistoryBox');
    check(await page.locator('.birdmap-mobile-popup .siteHistoryBox').count()>0,width+' site history preserved');
    check(await page.locator('.birdmap-mobile-popup a.kakao').count()===1,width+' site Kakao link preserved');
    await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(200);
    check(await page.locator('.birdmap-mobile-popup').count()===0&&await page.locator('.leaflet-popup-pane .leaflet-popup').count()===1,width+' desktop restores actual popup');
    await page.setViewportSize({width,height});await page.waitForTimeout(200);check(await detail.count()===1,width+' mobile popup restored after resize');
    await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();
    await page.getByRole('tab',{name:'이번 달 기여자',exact:true}).click();await page.getByRole('button',{name:'최근 제보 펼치기',exact:true}).click();
    check((await page.locator('#recentReportsBox').boundingBox()).height>200,width+' contributor sheet expands');
    await page.getByRole('tab',{name:'최근 제보',exact:true}).click();await page.getByRole('button',{name:'최근 제보 접기',exact:true}).click();
    await page.evaluate(()=>{map_7010a44f6ac2025090f0fe07508ed485.stop();map_7010a44f6ac2025090f0fe07508ed485.setView([36,127],7,{animate:false});});await page.waitForTimeout(250);const zoom=await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.getZoom());await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(500);
    check(await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.getZoom())===zoom+1,width+' map zoom works');
    if(width===390){await page.locator('.leaflet-control-zoom a').last().click();await page.waitForTimeout(500);await page.evaluate(()=>window[siteData[0].markerVar].openPopup());await page.waitForSelector('.birdmap-mobile-popup');check(await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.getContainer().contains(document.querySelector('.birdmap-mobile-popup'))),'fullscreen details stay inside map subtree');check(await page.locator('.birdmap-mobile-popup').isVisible(),'fullscreen details visible');await page.getByRole('button',{name:'탐조지 상세정보 닫기',exact:true}).click();await page.locator('.leaflet-control-zoom a').last().click();}
    await page.close();console.log('PASS width',width);
  }
  for(const width of [1024,1440]){
    const snapshots=[];
    for(const prefix of ['/baseline','']){
      const page=await browser.newPage({viewport:{width,height:1000}});await bridge(page);await page.goto(origin+prefix+'/index.html',{waitUntil:'load'});await page.waitForFunction(()=>document.querySelectorAll('#recentReportsList .recentReportItem').length>=4);await page.locator('.birdmap-basemap__choice').last().click();await page.waitForTimeout(500);
      snapshots.push(await page.evaluate(()=>['#mapTitleBox','#togglePanelBtn','#noticeToggleBtn','#todayToggleBtn','#recentReportsBox','.birdmap-basemap'].map(s=>({s,rect:document.querySelector(s).getBoundingClientRect().toJSON(),text:document.querySelector(s).innerText}))));
      await page.screenshot({path:out+'/desktop-'+width+(prefix?'-before':'-after')+'.png'});await page.close();
    }
    assert.deepEqual(snapshots[1],snapshots[0]);check(true,width+' unchanged desktop control geometry and text');
  }
  check(errors.length===0,'no JavaScript page errors');
  fs.writeFileSync(out+'/mobile-validation.json',JSON.stringify({date:new Date().toISOString(),physicalDevice:false,source:'Existing production public GET responses only; test-only Origin/CORS bridge. All external writes blocked.',results,errors},null,2));
  console.log('PASS',results.length,'checks');
})().catch(e=>{console.error(e);fs.writeFileSync(out+'/mobile-validation-failure.json',JSON.stringify({results,errors,error:String(e)},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
