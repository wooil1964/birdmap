// Actual Chrome, local files, and mocked operating APIs only. CDN dependencies are read-only GETs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=resolve(process.env.JEJU_OUTPUT||join(ROOT,'../jeju-browser'));
const packages=process.argv[2];assert.ok(packages,'Pass the installed Node packages directory');
const {chromium}=createRequire(join(resolve(packages),'package.json'))('playwright');
mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.js':'text/javascript','.css':'text/css'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
 if(req.method!=='GET'||!file.startsWith(ROOT+'\\')||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const rows=[],errors=[],network={mockedOperating:0,externalMutations:0,dependencyGets:0,blocked:0};
const deps=['cdn.jsdelivr.net','code.jquery.com','cdnjs.cloudflare.com','netdna.bootstrapcdn.com'];
try{
 for(const width of [375,1440]){
  const context=await browser.newContext({viewport:{width,height:950},deviceScaleFactor:1,isMobile:width<769,hasTouch:width<769});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin&&request.method()==='GET')return route.continue();
   if(url.hostname.endsWith('workers.dev')){network.mockedOperating++;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":{"code":"LOCAL_PREVIEW"}}'});}
   if(request.method()==='GET'&&deps.includes(url.hostname)){network.dependencyGets++;return route.continue();}
   if(request.method()!=='GET')network.externalMutations++;
   network.blocked++;return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push({width,message:e.message}));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof markerRegistry!=='undefined'&&Object.keys(markerRegistry).length===208,{timeout:40000});
  for(const [id,word,spring,winter,bird] of [['206','북촌',false,true,'원앙'],['207','천지연',false,true,'원앙'],['208','한라생태숲',true,true,'곤줄박이'],['209','곶자왈도립공원',true,true,'동박새'],['210','비자림',true,false,'직박구리'],['211','종달리',true,true,'괭이갈매기'],['212','종남마을',false,true,'검은멧새'],['213','송당곶자왈',false,true,'검은멧새']]){
   const result=await page.evaluate(({id,word})=>{
    const site=siteData.find(s=>s.id===id),mk=window[site.markerVar];
    document.getElementById('searchBox').value=word;searchSite();
    const search=document.getElementById('searchResults').textContent;
    const filter=season=>{document.querySelectorAll('.seasonFilter').forEach(x=>{x.checked=x.value===season;});applyFilters(false);return map_7010a44f6ac2025090f0fe07508ed485.hasLayer(mk);};
    const springVisible=filter('봄'),winterVisible=filter('겨울');
    document.querySelectorAll('.seasonFilter').forEach(x=>{x.checked=true;});applyFilters(false);
    closeBirdmapPanelFromPanel();moveToSite(site);
    return {id,count:siteData.length,unique:new Set(siteData.map(s=>s.id)).size,marker:[mk.getLatLng().lat,mk.getLatLng().lng],
     expected:[site.lat,site.lon],search, springVisible,winterVisible,
     label:v25EnvironmentLabel(site),profile:siteProfileHtml(site,document.createElement('div'),''),
     kakao:site.kakaoMapUrl,windy:site.windyUrl};
   },{id,word});
   await page.waitForFunction(()=>document.querySelector('.leaflet-popup')?.textContent.includes('탐조 팁'));
   result.popup=await page.locator('.leaflet-popup').innerHTML();
   assert.equal(result.count,208);assert.equal(result.unique,208);
   assert.deepEqual(result.marker,result.expected);assert.ok(result.search.includes(word));
   assert.equal(result.springVisible,spring,id);assert.equal(result.winterVisible,winter,id);
   assert.ok(result.profile.includes('제주'));assert.ok(result.profile.includes(bird),id);
   assert.ok(result.popup.includes('현재 출현'));assert.ok(result.popup.includes('드론'));
   assert.ok(!result.popup.includes('출항지'));
   assert.ok(result.popup.includes(result.kakao));assert.ok(result.popup.includes(result.windy));
   await page.waitForTimeout(250);
   const layout=await page.evaluate(()=>{const e=document.querySelector('.leaflet-popup');const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,view:innerWidth,bodyScroll:document.body.scrollWidth};});
   assert.ok(layout.left>=-1&&layout.right<=width+1,JSON.stringify(layout));
   await page.screenshot({path:join(OUT,`${width}-${id}.png`)});
   rows.push({width,...result,layout});
  }
  await page.goto(origin+'/?site=206',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.leaflet-popup')?.textContent.includes('북촌'));
  rows.push({width,sharedSite206:true});
  await context.close();
 }
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(network.externalMutations,0);
}finally{
 writeFileSync(join(OUT,'results.json'),JSON.stringify({rows,errors,network},null,2));
 await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
console.log(JSON.stringify({checks:rows.length,errors,network,output:OUT},null,2));
