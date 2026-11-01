/* Actual Chrome/Leaflet marker visibility, input, lifecycle and finite-animation regression.
 * Synthetic publication/GPS; reviewed CDN cache; offline tiles by default.
 * MARKER_REAL_TILES=1 reads only public OSM/VWorld tiles, cached locally for comparison screenshots.
 * See README.md for reproduction and the pinned baseline. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.MARKER_OUTPUT || path.join(ROOT, '.ci-results/marker-visibility'));
const SHOTS = process.env.MARKER_SHOTS && path.resolve(process.env.MARKER_SHOTS);
const CACHE = process.env.POPUP_DEPENDENCY_CACHE;
assert.ok(CACHE && fs.statSync(CACHE).isDirectory(), 'POPUP_DEPENDENCY_CACHE must name an existing URL-hash cache');
fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ASSETS = ['/index.html', '/assets/birdmap-species-search.css'];
const base = process.env.MARKER_AFTER_ONLY ? {} : Object.fromEntries(ASSETS.map(a => [a, cp.execFileSync('git', ['show', (process.env.MARKER_BASE_REF || 'df900110bb21be678e096fa3ded905359105b7ea') + ':' + a.slice(1)], { cwd: ROOT, maxBuffer: 8*1024*1024 })]));
const harness = fs.readFileSync(path.join(ROOT, 'docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs'), 'utf8');
const hook = harness.match(/function hook\(\)\{[\s\S]*?\r?\n\}\r?\n\r?\nclass CDP/);
assert.ok(hook, 'existing publication fixture is available');
const fixture = hook[0].replace(/\r?\n\r?\nclass CDP$/, '');
const checks = [], errors = [], network = { local: 0, cached: 0, syntheticTiles: 0, blocked: 0, missingCache: [] };
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const CDN = new Set(['cdn.jsdelivr.net', 'code.jquery.com', 'cdnjs.cloudflare.com', 'netdna.bootstrapcdn.com']);
const mime = p => ({ '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(p)] || 'application/octet-stream';
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://local'), file = path.resolve(ROOT, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
    if (req.method !== 'GET' || !file.startsWith(ROOT + path.sep)) throw Error('blocked');
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
function check(value, name, evidence) { assert.ok(value, name + (evidence ? ': ' + JSON.stringify(evidence) : '')); checks.push({ name, ...(evidence ? { evidence } : {}) }); }

// After the fixture: 15 approved reports from different reporters and a reporter-statistics answer.
function fifteenReports() {
  const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  // Real /reports/approved spots use the root report ID, which is also in their history (as in popup-regression.cjs).
  const row = i => ({ id: 'synthetic-' + i, species: [i % 3 ? '직박구리' : '왜가리'], date: day(i), reporter: '합성제보' + (i % 4) });
  __mock.approved = Array.from({ length: 15 }, (_, i) => __mock.spot({ id: 'synthetic-' + i, lat: 37.566 + i * 0.0005, lon: 126.898 + i * 0.0005, species: row(i).species, history: [row(i)] }));
  const fixtureFetch = window.fetch;
  window.fetch = (input, options) => {
    const u = new URL(String(input), location.href);
    if (u.hostname.endsWith('workers.dev') && u.pathname === '/reports/search') {
      const offset = Number(u.searchParams.get('offset') || 0), reports = offset ? [] : Array.from({ length: 15 }, (_, i) => Object.assign(row(i), { locationHidden: false, target: { kind: 'spot', spotId: 'synthetic-' + i } }));
      return Promise.resolve(new Response(JSON.stringify({ ok: true, serverTime: new Date().toISOString(), offset, limit: 20, total: 15, hasMore: false, reports,
        publication: { contract: 'publication-v1', epoch: __mock.epoch, revision: __mock.revision, projection: 'legacy-public-v1', nonce: u.searchParams.get('nonce') } }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    if (u.hostname.endsWith('workers.dev') && u.pathname === '/reports/reporter-stats') {
      return Promise.resolve(new Response(JSON.stringify({ speciesCount: 2, reportCount: 4, serverTime: new Date().toISOString(),
        publication: { contract: 'publication-v1', epoch: __mock.epoch, revision: __mock.revision, projection: 'legacy-public-v1', nonce: u.searchParams.get('nonce') } }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    return fixtureFetch(input, options);
  };
}

async function openPage(browser, origin, width, height, touch, before) {
  const label = width + 'x' + height + (before ? '-before' : '');
  const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  page.on('response',r=>{if(r.status()>=400)console.error('HTTP',r.status(),new URL(r.url()).pathname);});
  
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  await page.addInitScript({ content: '(' + fixture + ')();(' + fifteenReports.toString() + ')();' });
  await page.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (request.method() !== 'GET') { network.blocked++; return route.abort(); }
    if (u.origin === origin && before && base[u.pathname]) { network.local++; return route.fulfill({ status: 200, contentType: mime(u.pathname), body: base[u.pathname] }); }
    if (u.origin === origin) { network.local++; const file=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname)); if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:mime(file),body:fs.readFileSync(file)}); }
    if (u.pathname.startsWith('/tiles/') || /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname)) { network.syntheticTiles++; return mapTile(route); }
    if (CDN.has(u.hostname)) {
      const file = path.join(CACHE, createHash('sha256').update(u.href).digest('hex'));
      if (fs.existsSync(file)) { network.cached++; return route.fulfill({ status: 200, contentType: mime(u.pathname), body: fs.readFileSync(file) }); }
      network.missingCache.push(u.href);
    }
    network.blocked++; return route.abort();
  });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.L && Object.keys(markerRegistry).length === 240 && publicationAllowed()
    && document.querySelectorAll('#recentReportsList .recentReportItem').length === 15 && document.querySelector('#recentReportsBox .birdmap-sheet-actions')).catch(async error=>{console.error(await page.evaluate(()=>({sites:siteData.length,markers:Object.keys(markerRegistry).length,allowed:publicationAllowed(),items:document.querySelectorAll('#recentReportsList .recentReportItem').length,sheet:!!document.querySelector('#recentReportsBox .birdmap-sheet-actions'),message:document.getElementById('recentReportsList').textContent.slice(0,100),publication:publicationState.status})));await page.screenshot({path:path.join(OUT,'readiness-failure.png')});throw error;});
  return { page, label };
}

const tileCache=path.join(ROOT,'.ci-results/marker-map-tiles');fs.mkdirSync(tileCache,{recursive:true});
const realTileStats={downloaded:0,cached:0,failures:0};
async function mapTile(route){
  if(!process.env.MARKER_REAL_TILES)return route.fulfill({status:200,contentType:'image/png',body:tile});
  const u=new URL(route.request().url()),key=createHash('sha256').update(u.href).digest('hex'),file=path.join(tileCache,key);
  let bytes;
  if(fs.existsSync(file)){bytes=fs.readFileSync(file);realTileStats.cached++;}
  else{
    const response=await route.fetch({timeout:20000,headers:{...route.request().headers(),origin:'https://wooil1964.github.io',referer:'https://wooil1964.github.io/birdmap/'}});
    if(!response.ok()){realTileStats.failures++;return route.abort();}
    bytes=await response.body();fs.writeFileSync(file,bytes);realTileStats.downloaded++;
  }
  return route.fulfill({status:200,contentType:u.pathname.endsWith('.jpeg')?'image/jpeg':'image/png',body:bytes});
}
async function settle(page){await page.waitForTimeout(800);if(process.env.MARKER_REAL_TILES){await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].every(n=>n.complete),{},{timeout:25000});}await page.waitForFunction(()=>!map_7010a44f6ac2025090f0fe07508ed485._animatingZoom);}
async function shot(page,label){if(SHOTS)await page.screenshot({path:path.join(SHOTS,label+'.png')});}
async function siteView(page){await page.evaluate(()=>{
  const m=map_7010a44f6ac2025090f0fe07508ed485,s=siteData.find(s=>s.id==='195');setBirdmapPanelOpen(false);m.closePopup();m.setView([s.lat,s.lon],14,{animate:false});window.__site=window[s.markerVar];window.__report=reportSpotLayers['synthetic-0'];
});await settle(page);}
async function ringState(page){return page.evaluate(()=>({rings:document.querySelectorAll('.birdmap-marker-ring').length,pulses:document.querySelectorAll('.birdmap-marker-pulse').length,radius:__report.getRadius(),selected:__report.getElement().classList.contains('birdmap-report-emphasized')}));}
async function closePopup(page){await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.closePopup());}
async function pressSite(page,touch){
  const p=await page.evaluate(()=>{const r=__site.getElement().getBoundingClientRect();return{x:r.x+22,y:r.y+22};});
  if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>map_7010a44f6ac2025090f0fe07508ed485._popup?._source===__site);
}
async function testPage(page,label,touch,width,height){
  await siteView(page);
  check(await page.evaluate(()=>siteData.length===240&&new Set(siteData.map(s=>s.id)).size===240&&siteData.every(s=>window[s.markerVar].getLatLng().lat===s.lat&&window[s.markerVar].getLatLng().lng===s.lon)),label+' all 240 marker coordinates and unique IDs preserved');
  check(await page.evaluate(()=>Object.values(markerRegistry).every(m=>m.getElement()?.classList.contains('birdmap-site-marker')&&m.options.icon.options.iconSize[0]===44)),label+' every original and supplemental site has 44px target');
  check((await ringState(page)).rings===0,label+' no idle ring');await shot(page,label+'-site-idle');
  await pressSite(page,touch);check((await ringState(page)).rings===1,label+' real click/tap selects site');await shot(page,label+'-site-selected');
  await page.setViewportSize({width:height,height:width});await settle(page);check((await ringState(page)).rings===1,label+' selection survives orientation resize');
  await page.setViewportSize({width,height});await settle(page);await closePopup(page);check((await ringState(page)).rings===0,label+' site close clears ring');
  await siteView(page);
  await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485,p=m.latLngToContainerPoint(__site.getLatLng());const point=m.containerPointToLatLng([p.x+12,p.y]);window.__adjacent=birdmapSpotMarker(point.lat,point.lng,'입력 검증',['직박구리'],[],false,false,null).addTo(m);});
  const adjacent=await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485,p=m.latLngToContainerPoint(__adjacent.getLatLng());return{x:p.x,y:p.y};});
  if(touch)await page.touchscreen.tap(adjacent.x,adjacent.y);else await page.mouse.click(adjacent.x,adjacent.y);
  check(await page.evaluate(()=>__adjacent.getRadius()===5.5),label+' report inside 44px site target receives real click/tap');
  await closePopup(page);await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.removeLayer(__adjacent));
  await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485;m.setView(__report.getLatLng(),14,{animate:false});});await settle(page);
  const p=await page.evaluate(()=>map_7010a44f6ac2025090f0fe07508ed485.latLngToContainerPoint(__report.getLatLng()));
  if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>__report.getRadius()===5.5);
  let state=await ringState(page);check(state.rings===1&&state.pulses===1&&state.selected,label+' direct report gets dark stroke, bright ring and 10% radius');
  check(await page.evaluate(()=>{const p=document.querySelector('.birdmap-marker-pulse'),c=getComputedStyle(p);return c.animationIterationCount==='2'&&c.animationDuration==='0.9s'&&getComputedStyle(document.querySelector('.birdmap-marker-ring')).pointerEvents==='none';}),label+' exactly 2 compositor pulses and noninteractive ring');
  const motion=await page.evaluate(async()=>{
    const node=document.querySelector('.birdmap-marker-pulse'),animation=node.getAnimations()[0],events=[],samples=[];
    node.addEventListener('animationiteration',e=>events.push({type:e.type,elapsed:e.elapsedTime}));
    node.addEventListener('animationend',e=>events.push({type:e.type,elapsed:e.elapsedTime}));
    const ended=new Promise(resolve=>node.addEventListener('animationend',()=>requestAnimationFrame(resolve),{once:true}));
    await animation.ready;
    const started=animation.startTime;
    // Observe real elapsed animation time, including the rendered SVG stroke.
    for(const at of [225,1125]){
      await new Promise(resolve=>{function frame(){if(document.timeline.currentTime-started>=at)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
      const css=getComputedStyle(node);
      samples.push({at:document.timeline.currentTime-started,connected:node.isConnected,opacity:Number(css.opacity),strokeOpacity:Number(css.strokeOpacity),bounds:node.getBoundingClientRect().width,sourceBounds:__report.getElement().getBoundingClientRect().width,sourcePath:__report.getElement().getAttribute('d'),sourceEmpty:__report._empty(),transform:css.transform,path:node.getAttribute('d')});
    }
    await ended;
    return{events,samples,removed:!node.isConnected,elapsed:document.timeline.currentTime-started};
  });
  // Small landscape's existing popup auto-pan can cull the source and pulse together.
  // Never excuse a transparent stroke; require expanded geometry whenever the source renders.
  check(motion.samples.every(s=>s.connected&&s.opacity*s.strokeOpacity>0.05&&Number(s.transform.split('(')[1]?.split(',')[0])>1&&(s.bounds>23||(s.bounds===0&&s.sourceBounds===0&&s.sourceEmpty&&s.sourcePath==='M0 0'&&s.path==='M0 0'))),label+' SVG stroke paints and scales in both cycles; geometry follows rendered source',motion.samples);
  check(motion.events.length===2&&motion.events[0].type==='animationiteration'&&Math.abs(motion.events[0].elapsed-.9)<.01&&motion.events[1].type==='animationend'&&Math.abs(motion.events[1].elapsed-1.8)<.01,label+' first cycle emits iteration; end occurs only after 1800ms',motion);
  state=await ringState(page);check(motion.removed&&state.pulses===0&&state.rings===1,label+' pulses stop and are removed; persistent ring remains');await shot(page,label+'-report-selected');
  await page.evaluate(()=>__site.openPopup());check((await ringState(page)).radius===5&&(await ringState(page)).rings===1,label+' other selection restores report');await closePopup(page);
  const expand=page.locator('#recentReportsBox .birdmap-sheet-actions button:first-child');if(await expand.getAttribute('aria-expanded')==='false')await expand.click();
  const first=page.locator('#recentReportsList .recentReportItem').first();await first.locator('.recentReportSpecies').click();await page.waitForFunction(()=>document.querySelector('.birdmap-report-location-selected')&&__report.getRadius()===5.5);
  check((await ringState(page)).rings===1,label+' recent 15 uses verified ID and same emphasis');await shot(page,label+'-recent-selected');
  await page.locator('.birdmap-report-location-popup .leaflet-popup-close-button').click();check((await ringState(page)).radius===5&&(await ringState(page)).rings===0,label+' real card close clears all emphasis');
  await page.evaluate(()=>{__report.openPopup();map_7010a44f6ac2025090f0fe07508ed485.removeLayer(__report);});check((await ringState(page)).radius===5&&(await ringState(page)).rings===0,label+' layer removal clears ring and radius');
  await page.evaluate(()=>{__report.addTo(map_7010a44f6ac2025090f0fe07508ed485);__report.openPopup();renderApprovedReports(__mock.approved);});check(await page.evaluate(()=>!document.querySelector('.birdmap-marker-ring,.birdmap-marker-pulse')&&__report.getRadius()===5),label+' data refresh replacement clears old selection');
  await page.evaluate(()=>{__site.openPopup();map_7010a44f6ac2025090f0fe07508ed485.removeLayer(__site);});check((await ringState(page)).rings===0,label+' filtered site removal clears ring');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' no horizontal overflow');
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const sizes=[[1440,900,false],[1440,1100,false],[320,568,true],[360,740,true],[390,844,true],[568,320,true],[740,360,true],[844,390,true]];
 for(const [width,height,touch] of sizes.filter(s=>!process.env.MARKER_SIZE||s[0]+'x'+s[1]===process.env.MARKER_SIZE)){for(const provider of ['osm','hybrid']){
   const name=width+'x'+height+'-'+provider;
   for(const before of [true,false].filter(before=>!process.env.MARKER_AFTER_ONLY||!before)){
    const {page}=await openPage(browser,origin,width,height,touch,before);
    try{
      await page.evaluate(provider=>birdmapBasemap.setPreference(provider),provider);await siteView(page);await settle(page);
      const mapState=await page.evaluate(()=>birdmapBasemap.getState());check(mapState.active===provider,name+' '+(before?'before':'after')+' active basemap',mapState);
      if(before){await shot(page,name+'-before-site-idle');await page.evaluate(()=>__site.openPopup());await settle(page);await shot(page,name+'-before-site-selected');await closePopup(page);await page.evaluate(()=>__report.openPopup());await settle(page);await shot(page,name+'-before-report-selected');await closePopup(page);await page.evaluate(()=>openPublicReportLocation('synthetic-0','왜가리'));await page.waitForSelector('.birdmap-report-location-selected');await settle(page);await shot(page,name+'-before-recent-selected');}
      else if(process.env.MARKER_CAPTURE_ONLY){await shot(page,name+'-site-idle');await page.evaluate(()=>__site.openPopup());await settle(page);await shot(page,name+'-site-selected');await closePopup(page);await page.evaluate(()=>__report.openPopup());await settle(page);await shot(page,name+'-report-selected');await closePopup(page);await page.evaluate(()=>openPublicReportLocation('synthetic-0','왜가리'));await page.waitForSelector('.birdmap-report-location-selected');await settle(page);await shot(page,name+'-recent-selected');}else await testPage(page,name,touch,width,height);
      console.log('PASS '+name+' '+(before?'before':'after'));
    }catch(error){await page.screenshot({path:path.join(OUT,'failure-'+name+'.png')}).catch(()=>{});throw error;}finally{await page.close();}
   }
 }}
 const {page}=await openPage(browser,origin,390,844,true,false);await siteView(page);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>__report.openPopup());
 check((await ringState(page)).pulses===0&&(await ringState(page)).rings===1&&(await ringState(page)).radius===5.5,'reduced motion keeps static emphasis without pulse');await shot(page,'390x844-reduced-motion');
 await closePopup(page);await page.emulateMedia({reducedMotion:'no-preference'});
 const perf=await page.evaluate(()=>{const m=map_7010a44f6ac2025090f0fe07508ed485,count=Object.keys(m._layers).length,requests=__mock.actions.length,start=performance.now();for(let i=0;i<100;i++){__report.openPopup();m.closePopup();}return{cycles:100,ms:performance.now()-start,beforeLayers:count,afterLayers:Object.keys(m._layers).length,rings:document.querySelectorAll('.birdmap-marker-ring,.birdmap-marker-pulse').length,newRequests:__mock.actions.length-requests};});
 check(perf.beforeLayers===perf.afterLayers&&perf.rings===0&&perf.newRequests===0,'100 rapid selections leave no layers/animations',perf);
 await page.evaluate(()=>{__report.openPopup();publicationInvalidate('marker-test');});check((await ringState(page)).rings===0,'publication invalidation clears emphasis synchronously');await page.close();
 check(errors.length===0,'no JavaScript errors',errors);check(network.missingCache.length===0,'no missing dependency',network);
 fs.writeFileSync(path.join(OUT,'performance.json'),JSON.stringify(perf,null,2));
 }finally{await browser.close();}
})().catch(error=>{errors.push(error.stack);process.exitCode=1;console.error(error);}).finally(()=>{fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify({passed:checks.length,failed:errors.length,checks,errors,network,realTileStats,scope:process.env.MARKER_REAL_TILES?'Synthetic report API/GPS; read-only real OSM/VWorld tiles (cached)':'Offline synthetic API/GPS/tiles'},null,2));server.close();console.log('PASS checks: '+checks.length+'; errors: '+errors.length);});
