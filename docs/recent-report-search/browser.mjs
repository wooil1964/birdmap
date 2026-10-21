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
const results=[],errors=[];
try{
  for(const width of [375,768,1440]){
    const db=fakeDb(Array.from({length:43},(_,i)=>({id:'archive-'+String(i).padStart(2,'0'),status:'approved',
      species:i===41?'저어새':['까치','참새','직박구리','흰뺨검둥오리'][i%4],lat:37+i*.001,lon:127+i*.001,
      public_lat:i===42?36:null,public_lon:i===42?126:null,site_id:'1',
      observed_on:i===0?'2026-10-20':'2020-01-'+String(1+i%28).padStart(2,'0'),received_at:'2026-10-01T00:00:00Z',
      reporter:i===40?'비공개이름토큰':'합성 제보자 '+(i+1),name_public:i===40?0:1})));
    await db.prepare("INSERT INTO sites(site_id,site_name,registry_source,registry_revision,source_record_json,created_at) VALUES('1','합성 공개 탐조지','index.html:siteData','test',?, '2026-10-21')").bind(JSON.stringify({region:'합성 공개 지역'})).run();
    const env=publicEnv(db,{REPORTS_PUBLICATION_REQUIRED:'true'});
    let failSearch=false;const requests=[];
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<769,hasTouch:width<769});
    const page=await context.newPage();page.on('pageerror',e=>errors.push({width,error:e.message}));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.hostname==='birdmap-reports.wooil-birdmap.workers.dev'){
        requests.push(url.pathname);
        if(failSearch&&url.pathname==='/reports/search')return route.abort('failed');
        if(request.method()!=='GET')return route.abort('blockedbyclient');
        const response=await handleRequest(new Request(url,{headers:ORIGIN}),env);
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
    await page.getByRole('button',{name:'20건 더 보기',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.reports.length===40);
    await page.getByRole('button',{name:'20건 더 보기',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.reports.length===43);
    await page.locator('#reportArchiveSearch').fill('합성 공개 지역');await page.waitForFunction(()=>reportArchiveData?.total===41);
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
    await db.prepare("UPDATE reports SET status='pending' WHERE id='archive-00'").run();
    await page.evaluate(()=>publicationRecheck());
    assert.equal(await page.evaluate(()=>reportArchiveData),null);assert.ok(!(await page.locator('#reportArchiveContent').innerText()).includes('합성 제보자'));
    await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.total===42);
    failSearch=true;await page.locator('#reportArchiveSearch').fill('실패검증');await page.waitForFunction(()=>reportArchiveState==='failed');
    assert.match(await page.locator('#reportArchiveContent').innerText(),/다시 시도/);failSearch=false;
    await page.getByRole('button',{name:'초기화',exact:true}).click();await page.waitForFunction(()=>reportArchiveData?.total===42);
    await page.getByRole('button',{name:'닫기',exact:true}).last().click();assert.equal(await page.locator('#reportArchiveModal').isVisible(),false);
    results.push({width,pass:true,checks:['20/20/3 pagination','public region search','private name exclusion','sensitive no map','reset','ESC/focus','existing marker','approval revision invalidation','error/retry','viewport fit'],apiRequests:requests.length});
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(resolve(out,'results.json'),JSON.stringify({results,errors},null,2));}
console.log(JSON.stringify({results,errors},null,2));
