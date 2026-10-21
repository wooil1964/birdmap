// Local synthetic API/SQLite only. CDN libraries may be read; production APIs are blocked.
// BIRDMAP_PLAYWRIGHT: installed playwright/index.mjs; CHROME_PATH: installed Chrome.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { handleRequest } from '../../reports-api/src/public.js';
import { fakeDb, publicEnv, ORIGIN } from '../../reports-api/test/helpers.mjs';
const {chromium}=await import(process.env.BIRDMAP_PLAYWRIGHT?pathToFileURL(process.env.BIRDMAP_PLAYWRIGHT).href:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(process.env.REPORT_SEARCH_OUTPUT||resolve(root,'../../outputs/report-search-browser'));
mkdirSync(out,{recursive:true});
const html=readFileSync(resolve(root,'index.html'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const results=[],errors=[],pagination=[];
const observePagination=process.env.REPORT_ARCHIVE_OBSERVE==='1';
try{
  for(const width of [375,768,1440]){
    const db=fakeDb(Array.from({length:43},(_,i)=>({id:'archive-'+String(i).padStart(2,'0'),status:'approved',
      species:i===41?'저어새':['까치','참새','직박구리','흰뺨검둥오리'][i%4],lat:37+i*.001,lon:127+i*.001,
      public_lat:i===42?36:null,public_lon:i===42?126:null,site_id:'1',
      observed_on:i===0?'2026-10-20':'2020-01-'+String(1+i%28).padStart(2,'0'),received_at:'2026-10-01T00:00:00Z',
      reporter:i===40?'비공개이름토큰':'합성 제보자 '+(i+1),name_public:i===40?0:1})));
    await db.prepare("INSERT INTO sites(site_id,site_name,registry_source,registry_revision,source_record_json,created_at) VALUES('1','합성 공개 탐조지','index.html:siteData','test',?, '2026-10-21')").bind(JSON.stringify({region:'합성 공개 지역'})).run();
    const env=publicEnv(db,{REPORTS_PUBLICATION_REQUIRED:'true'});
    let failSearch=false,moreRequests=0,holdMore=false;const requests=[],pendingPages=[];
    async function pendingPage(){const deadline=Date.now()+10000;while(!pendingPages.length){if(Date.now()>deadline)throw Error('Deferred page did not arrive');await new Promise(resolve=>setTimeout(resolve,10));}}
    function releasePages(){holdMore=false;pendingPages.splice(0).forEach(resolve=>resolve());}
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<769,hasTouch:width<769});
    const page=await context.newPage();page.on('pageerror',e=>errors.push({width,error:e.message}));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.hostname==='birdmap-reports.wooil-birdmap.workers.dev'){
        requests.push(url.pathname);if(url.pathname==='/reports/search'&&Number(url.searchParams.get('offset'))>0)moreRequests++;
        if(failSearch&&url.pathname==='/reports/search')return route.abort('failed');
        if(request.method()!=='GET')return route.abort('blockedbyclient');
        const response=await handleRequest(new Request(url,{headers:ORIGIN}),env);
        if(holdMore&&url.pathname==='/reports/search'&&Number(url.searchParams.get('offset'))>0)await new Promise(resolve=>pendingPages.push(resolve));
        return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':'http://birdmap.test'},body:await response.text()});
      }
      if(url.hostname==='birdmap.test'){
        const target=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
        if(!target.startsWith(resolve(root)))return route.abort();
        try{return route.fulfill({contentType:extname(target)==='.html'?'text/html; charset=utf-8':extname(target)==='.json'?'application/json':'application/octet-stream',body:target===resolve(root,'index.html')?html:readFileSync(target)});}catch{return route.fulfill({status:404,body:''});}
      }
      if(request.method()==='GET'&&['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'].includes(url.hostname))return route.continue();
      return route.abort('blockedbyclient');
    });
    await page.goto('http://birdmap.test/',{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>typeof map_7010a44f6ac2025090f0fe07508ed485!=='undefined'&&publicationAllowed()&&reportSearchIndex.length===43,{},{timeout:30000});
    await page.locator('#reportArchiveOpen').click();
    await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    assert.equal(await page.locator('#reportArchiveContent .recentReportItem').count(),20);
    await page.screenshot({path:resolve(out,`archive-${width}.png`)});
    const fit=await page.locator('#reportArchiveModal .monthTideDialog').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});assert.ok(fit);
    async function morePage(expected){
      const more=page.getByRole('button',{name:'20건 더 보기',exact:true});
      await more.scrollIntoViewIfNeeded();await more.focus();
      const before=await page.evaluate(()=>{
        const content=document.getElementById('reportArchiveContent');
        window.__archiveBefore={rows:Array.from(content.querySelectorAll('.recentReportItem')),more:document.activeElement,scroll:content.scrollTop,query:reportArchiveSearch.value};
        return {scroll:content.scrollTop,count:__archiveBefore.rows.length,query:__archiveBefore.query};
      });
      const requestCount=moreRequests;holdMore=true;
      await more.press('Enter');await page.waitForFunction(()=>reportArchiveState==='loading');
      await pendingPage();
      await page.evaluate(()=>{__archiveBefore.more.click();__archiveBefore.more.click();});
      const snapshot=()=>page.evaluate(()=>{
        const content=document.getElementById('reportArchiveContent'),rows=Array.from(content.querySelectorAll('.recentReportItem'));
        return {scroll:content.scrollTop,count:rows.length,query:reportArchiveSearch.value,
          sameRows:__archiveBefore.rows.every((node,i)=>node===rows[i]),sameFocus:document.activeElement===__archiveBefore.more,
          moreConnected:__archiveBefore.more.isConnected};
      });
      const loading=await snapshot();
      releasePages();
      await page.waitForFunction(n=>reportArchiveData?.reports.length===n&&reportArchiveState==='idle',expected);
      const after=await snapshot(),pass=loading.count===before.count&&after.count===expected&&[loading,after].every(s=>Math.abs(s.scroll-before.scroll)<=1&&s.query===before.query&&s.sameRows&&s.sameFocus&&s.moreConnected);
      assert.equal(moreRequests,requestCount+1,'Repeated activation must not duplicate the pending page');
      pagination.push({width,before,loading,after,expected,pass});
      if(!observePagination)assert.ok(pass,JSON.stringify(pagination.at(-1)));
    }
    await morePage(40);await morePage(43);
    await page.locator('#reportArchiveSearch').fill('합성 공개 지역');await page.waitForFunction(()=>reportArchiveData?.total===41);
    await morePage(40);await morePage(41);
    await page.keyboard.press('Tab');assert.equal(await page.locator('#reportArchiveModal .monthTideHeader button').evaluate(node=>node===document.activeElement),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'모두 불러왔습니다.',exact:true}).evaluate(node=>node===document.activeElement),true);
    // A new query, ESC and a closed modal must discard delayed appended responses.
    await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    const oldPage=page.waitForResponse(response=>new URL(response.url()).pathname==='/reports/search'&&new URL(response.url()).searchParams.get('offset')==='20');
    holdMore=true;await page.getByRole('button',{name:'20건 더 보기',exact:true}).click();await page.waitForFunction(()=>reportArchiveState==='loading');await pendingPage();
    await page.locator('#reportArchiveSearch').fill('저어새');await page.waitForFunction(()=>reportArchiveData?.total===1);releasePages();await oldPage;
    await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>reportArchiveData.reports.length),1);assert.equal(await page.locator('#reportArchiveSearch').inputValue(),'저어새');
    await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    const closingPage=page.waitForResponse(response=>new URL(response.url()).pathname==='/reports/search'&&new URL(response.url()).searchParams.get('offset')==='20');
    holdMore=true;await page.getByRole('button',{name:'20건 더 보기',exact:true}).click();await page.waitForFunction(()=>reportArchiveState==='loading');await pendingPage();await page.keyboard.press('Escape');releasePages();await closingPage;await page.waitForTimeout(100);
    assert.equal(await page.locator('#reportArchiveModal').isVisible(),false);assert.equal(await page.evaluate(()=>reportArchiveData===null&&reportArchiveContent._reportArchiveView===null&&reportArchiveContent.textContent===''),true);
    await page.locator('#reportArchiveOpen').click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    await page.locator('#reportArchiveSearch').fill('비공개이름토큰');await page.waitForFunction(()=>reportArchiveData?.total===0);
    assert.match(await page.locator('#reportArchiveContent').innerText(),/검색 결과가 없습니다/);
    await page.locator('#reportArchiveSearch').fill('저어새');await page.waitForFunction(()=>reportArchiveData?.total===1);
    assert.equal(await page.locator('#reportArchiveContent button').count(),0);assert.match(await page.locator('#reportArchiveContent').innerText(),/위치 비공개/);
    await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    assert.equal(await page.locator('#reportArchiveSearch').inputValue(),'');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#reportArchiveModal').isVisible(),false);assert.equal(await page.locator('#reportArchiveOpen').evaluate(n=>n===document.activeElement),true);
    await page.locator('#reportArchiveOpen').click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    await page.locator('#reportArchiveContent .reporterMapOpen').first().click();await page.waitForFunction(()=>reportArchiveModal.style.display==='none');
    assert.equal(await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.getZoom()),13);
    // Approval withdrawal while an archive is open destroys the old visible payload.
    await page.locator('#reportArchiveOpen').click();await page.waitForFunction(()=>reportArchiveData?.reports.length===20);
    const revokedPage=page.waitForResponse(response=>new URL(response.url()).pathname==='/reports/search'&&new URL(response.url()).searchParams.get('offset')==='20');
    holdMore=true;await page.getByRole('button',{name:'20건 더 보기',exact:true}).click();await page.waitForFunction(()=>reportArchiveState==='loading');await pendingPage();
    await db.prepare("UPDATE reports SET status='pending' WHERE id='archive-00'").run();
    await page.evaluate(()=>publicationRecheck());
    assert.equal(await page.evaluate(()=>reportArchiveData),null);assert.ok(!(await page.locator('#reportArchiveContent').innerText()).includes('합성 제보자'));
    releasePages();await revokedPage;await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>reportArchiveData===null&&reportArchiveContent._reportArchiveView===null),true);
    await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.total===42);
    failSearch=true;await page.locator('#reportArchiveSearch').fill('실패검증');await page.waitForFunction(()=>reportArchiveState==='failed');
    assert.match(await page.locator('#reportArchiveContent').innerText(),/다시 시도/);failSearch=false;
    await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.total===42);
    await page.getByRole('button',{name:'닫기',exact:true}).last().click();assert.equal(await page.locator('#reportArchiveModal').isVisible(),false);
    results.push({width,pass:true,checks:['20/20/3 pagination','scroll/focus/query/row identity during append','duplicate activation','last-page keyboard loop','query and ESC races','public region search','private name exclusion','sensitive no map','reset','ESC/focus','existing marker','approval revision invalidation','error/retry','viewport fit'],apiRequests:requests.length});
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(resolve(out,'results.json'),JSON.stringify({results,errors,pagination},null,2));}
console.log(JSON.stringify({results,errors,pagination},null,2));
