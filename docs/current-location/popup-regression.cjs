/* Actual Leaflet/mobile-sheet regression with synthetic publication, GPS and tiles.
 * Run: PLAYWRIGHT_MODULE=... CHROME_PATH=... POPUP_DEPENDENCY_CACHE=... node docs/current-location/popup-regression.cjs
 * POPUP_DEPENDENCY_CACHE contains original dependency bytes named sha256(URL).
 * No external request is continued; missing cached dependencies fail the run. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(process.env.POPUP_TEST_ROOT || path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.POPUP_TEST_OUTPUT || path.join(ROOT, '.ci-results/popup-regression'));
const CACHE = process.env.POPUP_DEPENDENCY_CACHE;
assert.ok(CACHE && fs.statSync(CACHE).isDirectory(), 'POPUP_DEPENDENCY_CACHE must name an existing URL-hash cache');
fs.mkdirSync(OUT, { recursive: true });
// Reuse the existing synthetic public-state fixture without executing its browser runner.
const harness = fs.readFileSync(path.join(ROOT, 'docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs'), 'utf8');
const hook = harness.match(/function hook\(\)\{[\s\S]*?\r?\n\}\r?\n\r?\nclass CDP/);
assert.ok(hook, 'existing publication fixture is available');
const fixture = hook[0].replace(/\r?\n\r?\nclass CDP$/, '');
const checks = [], errors = [], network = { local: 0, cached: 0, syntheticTiles: 0, blocked: 0, continuedExternal: 0, missingCache: [] };
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const CDN = new Set(['cdn.jsdelivr.net', 'code.jquery.com', 'cdnjs.cloudflare.com', 'netdna.bootstrapcdn.com']);
const mime = p => ({ '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' })[path.extname(p)] || 'application/octet-stream';
let browser;
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://local'), file = path.resolve(ROOT, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
    if (req.method !== 'GET' || !file.startsWith(ROOT + path.sep)) throw Error('blocked');
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
function check(value, name, evidence) { assert.ok(value, name + (evidence ? ': ' + JSON.stringify(evidence) : '')); checks.push({ name, ...(evidence ? { evidence } : {}) }); }
function syntheticReportFixture() {
  const old = window.fetch.bind(window), m = window.__mock;
  m.approved = [m.spot({ history: [{ id: 'popup-report', species: ['직박구리'], date: new Date().toISOString().slice(0, 10), reporter: '합성검증' }] })];
  window.fetch = (input, options = {}) => {
    const u = new URL(String(input), location.href);
    if (u.hostname.endsWith('workers.dev') && u.pathname === '/reports/search') {
      const offset = Number(u.searchParams.get('offset') || 0), reports = offset ? [] : [{ id: 'popup-report', species: ['직박구리'], date: new Date().toISOString().slice(0, 10), reporter: '합성검증', locationHidden: false, target: { kind: 'spot', spotId: 'synthetic-approved' } }];
      return Promise.resolve(new Response(JSON.stringify({ ok: true, serverTime: new Date().toISOString(), offset, limit: 20, total: 1, hasMore: false, reports, publication: { contract: 'publication-v1', epoch: m.epoch, revision: m.revision, projection: 'legacy-public-v1', nonce: u.searchParams.get('nonce') } }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    return old(input, options);
  };
}
async function snapshot(page) {
  return page.evaluate(() => {
    const p = window.__popup, node = p.getElement(), r = node && node.getBoundingClientRect(), descriptor = Object.getOwnPropertyDescriptor(p.options, 'autoPan');
    return { own: !!descriptor, descriptor: descriptor || null, value: p.options.autoPan, gps: !!node && node.classList.contains('birdmap-gps-popup'), sheet: !!node && node.classList.contains('birdmap-mobile-popup'), width: r && r.width, height: r && r.height, top: r && r.top, bottom: r && r.bottom };
  });
}
function sameOptions(actual, expected) { return actual.own === expected.own && actual.value === expected.value && JSON.stringify(actual.descriptor) === JSON.stringify(expected.descriptor) && actual.gps === expected.gps; }
async function openSite(page, siteId = '195') {
  await page.evaluate(siteId => {
    birdmapLocation.clear();
    const s = siteData.find(s => s.id === siteId), marker = window[s.markerVar], map = map_7010a44f6ac2025090f0fe07508ed485;
    marker.addTo(map); map.setView(marker.getLatLng(), 13, { animate: false }); marker.openPopup();
    window.__popup = marker.getPopup(); window.__marker = marker;
  }, siteId);
  await page.waitForTimeout(450);
}
async function start(page, pending = false, position = null) {
  const before = await page.evaluate(() => __mock.geo.length);
  await page.getByRole('button', { name: '내 위치 찾기', exact: true }).click();
  await page.waitForFunction(n => __mock.geo.length > n, before);
  if (pending) return;
  await page.evaluate(position => { const p = __popup._source.getLatLng(); __mock.geo.at(-1).ok({ coords: position || { latitude: p.lat + 0.002, longitude: p.lng + 0.002, accuracy: 25 }, timestamp: Date.now() }); }, position);
  await page.waitForSelector('.birdmap-gps-guide');
  await page.waitForTimeout(100);
}
async function stopButton(page) {
  const more = page.getByRole('button', { name: '위치 도구 열기', exact: true });
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: '안내 종료', exact: true }).click();
}
async function restored(page, name, baseline) {
  const state = await snapshot(page);
  check(sameOptions(state, baseline), name + ' restores exact own descriptor and GPS class', { before: baseline, after: state });
  check(await page.evaluate(() => !birdmapLocation.state().guiding && !document.querySelector('.birdmap-gps-guide')), name + ' ends guidance');
}
async function layout(page, name) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' no horizontal page overflow');
  const state = await snapshot(page);
  if (state.sheet) check(state.top >= -1 && state.bottom <= await page.evaluate(() => innerHeight + 1), name + ' sheet remains within viewport', state);
  check(await page.evaluate(() => { const r = document.querySelector('#birdmapGpsLocate').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth; }), name + ' GPS control remains usable');
}
async function compactAndSparkle(page, label, baseline) {
  const state = await page.evaluate(() => {
    const sheet = __popup.getElement(), dot = document.querySelector('.birdmap-gps-dot'), toggle = sheet.querySelector('.birdmap-popup-actions button:first-child');
    return { compact: sheet.classList.contains('birdmap-gps-compact'), height: sheet.getBoundingClientRect().height, reopen: toggle?.textContent, animation: getComputedStyle(dot).animationName, running: dot.getAnimations().some(a => a.playState === 'running') };
  });
  check(state.animation === 'birdmapGpsSparkle' && state.running, label + ' current location visibly sparkles', state);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.birdmap-gps-dot')).animationName === 'none'), label + ' reduced motion stops sparkle');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check(state.compact === baseline.sheet, label + ' only mobile guidance compacts the sheet', state);
  if (baseline.sheet) {
    check(state.height === 64 && state.reopen === '펼치기', label + ' mobile guide leaves a 64px reopen bar', state);
    await page.getByRole('button', { name: '상세정보 펼치기', exact: true }).click();
    const reopened = await snapshot(page);
    check(await page.evaluate(() => !__popup.getElement().classList.contains('birdmap-gps-compact') && birdmapLocation.state().guiding), label + ' user reopen preserves the live guide');
    check(Math.abs(reopened.height - baseline.height) <= 2, label + ' user reopen restores previous sheet height', { before: baseline, after: reopened });
  }
}
async function desktopBounds(page, name, panel = false) {
  await page.waitForTimeout(450);
  const bounds = await page.evaluate(() => {
    const p = __popup.getElement().getBoundingClientRect(), g = document.querySelector('#birdmapGps').getBoundingClientRect(), n = document.querySelector('#birdmapPanel'), r = n.getClientRects().length && getComputedStyle(n).display !== 'none' ? n.getBoundingClientRect() : null;
    const area = (a, b) => b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
    return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, width: innerWidth, height: innerHeight, panelOverlap: area(p, r), toolOverlap: area(p, g) };
  });
  check(bounds.top >= -1 && bounds.bottom <= bounds.height + 1 && bounds.left >= -1 && bounds.right <= bounds.width + 1, name + ' popup stays in viewport', bounds);
  if (panel) check(bounds.panelOverlap <= 1, name + ' popup clears filter panel', bounds);
  check(bounds.toolOverlap <= 1, name + ' GPS tools clear ordinary popup', bounds);
  return bounds;
}
// Pin the original reported route, rather than relying on the general site-195 fixture.
async function madoRegressions(page, label, width) {
  if (width !== 1280 && width !== 1024) return;
  await openSite(page, '114');
  const destination = await page.evaluate(() => {
    const site = siteData.find(s => s.id === '114'), node = __popup.getElement(), point = __marker.getLatLng();
    return { id: site.id, name: site.name, title: node.querySelector('h4')?.textContent, buttonId: node.querySelector('[data-location-site]')?.dataset.locationSite, lat: point.lat, lon: point.lng, expectedLat: site.lat, expectedLon: site.lon };
  });
  check(destination.id === '114' && destination.name === '마도' && destination.title === '마도' && destination.buttonId === '114' && destination.lat === destination.expectedLat && destination.lon === destination.expectedLon, label + ' exact Mado 114 destination and marker', destination);
  await page.evaluate(() => setBirdmapPanelOpen(true));
  check(await page.locator('#birdmapPanel').isVisible(), label + ' Mado regression filter panel is open');
  const baseline = await snapshot(page), busan = { latitude: 35.1796, longitude: 129.0756, accuracy: 25 };
  await start(page, false, busan);
  await desktopBounds(page, label + ' Busan to Mado guidance', true);
  await stopButton(page);
  await restored(page, label + ' Busan to Mado stop', baseline);
  const stopped = await desktopBounds(page, label + ' Busan to Mado stopped', true);
  check(stopped.top >= 0, label + ' Busan to Mado stopped top is nonnegative', stopped);
  await page.screenshot({ path: path.join(OUT, 'stopped-mado-' + label + '.png') });
  await start(page, false, busan);
  await page.evaluate(() => { birdmapLocation.setTracking(true); __mock.watches.get(__mock.watchSeq).error({ code: 2 }); });
  const failed = await desktopBounds(page, label + ' Busan to Mado GPS failure', true);
  check(failed.top >= 0, label + ' Busan to Mado GPS failure top is nonnegative', failed);
  await page.evaluate(() => { birdmapLocation.clear(); setBirdmapPanelOpen(false); });
}
async function landscapeToolsRegression(page, label, width) {
  if (width !== 844) return;
  await openSite(page, '114');
  await start(page, false, { latitude: 35.1796, longitude: 129.0756, accuracy: 25 });
  // A verified GPS guide should keep the public marker live while reducing the bottom sheet.
  await page.getByRole('button', { name: '위치 도구 열기', exact: true }).click();
  await page.waitForTimeout(100);
  const bounds = await page.evaluate(() => {
    const sheet = __popup.getElement(), g = document.querySelector('#birdmapGps').getBoundingClientRect(), s = sheet.getBoundingClientRect(), details = document.querySelector('.birdmap-gps-details'), button = sheet.querySelector('.birdmap-popup-actions button:first-child');
    return { toolTop: g.top, toolBottom: g.bottom, sheetTop: s.top, sheetBottom: s.bottom, sheetHeight: s.height, compact: sheet.classList.contains('birdmap-gps-compact'), reopen: button && button.textContent === '펼치기', detailsWidth: details.getBoundingClientRect().width, scrollWidth: details.scrollWidth, clientWidth: details.clientWidth, scrollHeight: details.scrollHeight, clientHeight: details.clientHeight, overflow: getComputedStyle(details).overflowY };
  });
  check(bounds.toolTop >= 0 && bounds.toolBottom <= bounds.sheetTop - 8 && bounds.sheetBottom <= 390, label + ' expanded GPS tools clear compact Mado sheet and viewport', bounds);
  check(bounds.compact && bounds.sheetHeight >= 58 && bounds.sheetHeight <= 72 && bounds.reopen, label + ' Mado bottom sheet is compact with reopen control', bounds);
  check(bounds.clientHeight > 0 && bounds.overflow === 'auto', label + ' landscape GPS details allow scrolling when necessary', bounds);
  check(bounds.detailsWidth >= 260 && bounds.scrollWidth <= bounds.clientWidth, label + ' landscape GPS details retain full width without horizontal scrolling', bounds);
  await page.screenshot({ path: path.join(OUT, 'expanded-tools-mado-' + label + '.png') });
  await page.getByRole('button', { name: '상세정보 펼치기', exact: true }).click();
  check(await page.evaluate(() => !__popup.getElement().classList.contains('birdmap-gps-compact') && birdmapLocation.state().guiding), label + ' manual reopen preserves GPS guide');
  await page.evaluate(() => birdmapCollapseMobilePopupForGps(__popup));
  await page.getByRole('button', { name: '안내 종료', exact: true }).click();
  check(await page.evaluate(() => !birdmapLocation.state().guiding && !!document.querySelector('.birdmap-gps-dot')), label + ' scrolled stop button ends guide and keeps position');
  await page.getByRole('button', { name: '위치 도구 열기', exact: true }).click();
  await page.getByRole('button', { name: '위치 지우기', exact: true }).click();
  check(await page.evaluate(() => !birdmapLocation.state().located && !document.querySelector('.birdmap-gps-dot')), label + ' scrolled clear button removes position');
}
async function followupRegressions(page, label, width) {
  if (width !== 1440 && width !== 1024) return;
  await openSite(page);
  await page.evaluate(() => setBirdmapPanelOpen(true));
  const far = { latitude: 35.1796, longitude: 129.0756, accuracy: 25 };
  await start(page, false, far);
  await desktopBounds(page, label + ' northwestern destination guidance', true);
  await stopButton(page);
  await desktopBounds(page, label + ' far destination stopped', true);
  await page.screenshot({ path: path.join(OUT, 'stopped-northwest-' + label + '.png') });
  await start(page, false, far);
  await page.evaluate(() => { birdmapLocation.setTracking(true); __mock.watches.get(__mock.watchSeq).error({ code: 2 }); });
  await desktopBounds(page, label + ' far destination GPS failure', true);
  await page.evaluate(() => { birdmapLocation.clear(); setBirdmapPanelOpen(false); });
  // Drive the same animated tile style churn as a drag, without real map requests.
  const work = await page.evaluate(async () => {
    const m = map_7010a44f6ac2025090f0fe07508ed485, node = m.getContainer(), original = node.getBoundingClientRect;
    let reads = 0; node.getBoundingClientRect = function () { reads++; return original.call(this); };
    const tile = document.querySelector('.leaflet-tile') || document.querySelector('.leaflet-tile-pane');
    for (let i = 0; i < 120; i++) { tile.style.transform = 'translate(' + i + 'px,0)'; await Promise.resolve(); }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    node.getBoundingClientRect = original;
    return reads;
  });
  check(work <= 4, label + ' tile drag churn does not recalculate GPS placement per mutation', { containerReads: work, tileMutations: 120 });
  await openSite(page);
  await page.evaluate(() => {
    birdmapLocation.locate();
    __mock.geo.at(-1).ok({ coords: { latitude: 35.1796, longitude: 129.0756, accuracy: 25 }, timestamp: Date.now() });
    const p = __marker.getLatLng(), target = { layer: __marker, point: { lat: p.lat, lng: p.lng }, label: '합성 공개 목적지' };
    let first = true;
    window.__guidePending = birdmapLocation.guide(() => first ? (first = false, new Promise(resolve => window.__releaseDestination = () => resolve(target))) : target, __popup);
  });
  await page.waitForFunction(() => typeof __releaseDestination === 'function');
  await page.evaluate(() => birdmapLocation.setTracking(true));
  check(await page.evaluate(() => birdmapLocation.state().guiding && !birdmapLocation.state().tracking && /확인이 끝난 뒤/.test(document.querySelector('#birdmapGpsStatus').textContent)), label + ' pending destination tracking gives a wait message without cancelling guide');
  await page.evaluate(async () => { __releaseDestination(); await __guidePending; __mock.geo.at(-1).ok({ coords: { latitude: 35.1796, longitude: 129.0756, accuracy: 25 }, timestamp: Date.now() }); });
  await page.waitForSelector('.birdmap-gps-guide');
  check(await page.evaluate(() => birdmapLocation.state().guiding && !/공개 위치를 확인할 수 없어/.test(document.querySelector('#birdmapGpsStatus').textContent)), label + ' original destination proof completes after tracking race');
  await page.evaluate(() => birdmapLocation.clear());
  // Every public fixed point must behave identically when first created by search.
  await page.evaluate(() => publicationRefresh());
  await page.waitForFunction(() => publicationAllowed());
  const fixed = await page.evaluate(() => {
    map_7010a44f6ac2025090f0fe07508ed485.closePopup();
    return siteSpotData.map((s, i) => {
      if (siteSpotLayers[i]) map_7010a44f6ac2025090f0fe07508ed485.removeLayer(siteSpotLayers[i]);
      delete siteSpotLayers[i];
      openReportEntry({ kind: 'fixed', spotId: s.id, lat: s.lat, lon: s.lon }, true);
      const node = siteSpotLayers[i].getPopup().getElement();
      return { id: s.id, kakao: !!node.querySelector('a[href*="kakao"]'), tmap: !!node.querySelector('a[href*="tmap"]'), gps: !!node.querySelector('[data-location-fixed]'), buttons: node.querySelector('.spotRouteButtons')?.outerHTML };
    });
  });
  for (const row of fixed) check(row.kakao && row.tmap && row.gps, label + ' search-created fixed point has all public destination buttons', row);
  await openSite(page);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const widths = process.env.POPUP_TEST_WIDTHS && process.env.POPUP_TEST_WIDTHS.split(',').map(Number);
  for (const [width, height, touch] of [[1440, 1000, false], [1280, 720, false], [1024, 768, false], [768, 1024, true], [320, 568, true], [390, 844, true], [844, 390, true]].filter(([w]) => !widths || widths.includes(w))) {
    const label = width + 'x' + height, page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    page.on('pageerror', error => errors.push(label + ': ' + error.message));
    await page.addInitScript({ content: '(' + fixture + ')();(' + syntheticReportFixture.toString() + ')();' });
    await page.route('**/*', async route => {
      const request = route.request(), u = new URL(request.url());
      if (request.method() !== 'GET') { network.blocked++; return route.abort(); }
      if (u.origin === origin) { network.local++; return route.continue(); }
      if (u.pathname.startsWith('/tiles/') || /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname)) { network.syntheticTiles++; return route.fulfill({ status: 200, contentType: 'image/png', body: tile }); }
      if (CDN.has(u.hostname)) {
        const file = path.join(CACHE, createHash('sha256').update(u.href).digest('hex'));
        if (fs.existsSync(file)) { network.cached++; return route.fulfill({ status: 200, contentType: mime(u.pathname), body: fs.readFileSync(file) }); }
        network.missingCache.push(u.href);
      }
      network.blocked++; return route.abort();
    });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(() => window.birdmapLocation && window.L && Object.keys(markerRegistry).length === 229 && publicationAllowed());
      await page.evaluate(() => {
        window.__popupEvents = [];
        map_7010a44f6ac2025090f0fe07508ed485.on('popupopen popupclose', e => __popupEvents.push({ type: e.type, report: !!e.popup._birdmapReportLocation, at: performance.now() }));
        const status = document.querySelector('#birdmapGpsStatus');
        new MutationObserver(() => __popupEvents.push({ type: 'GPS status', text: status.textContent, at: performance.now() })).observe(status, { childList: true });
      });
      check(await page.evaluate(() => L.version === '1.9.3' && siteData.length === 229 && __mock.geo.length === 0), label + ' actual Leaflet, 229 sites and no automatic GPS');
      const desktop = await page.evaluate(() => {
        const p = window[siteData.find(s => s.id === '195').markerVar].getPopup(), d = Object.getOwnPropertyDescriptor(p.options, 'autoPan');
        return { own: !!d, descriptor: d || null, value: p.options.autoPan, gps: false };
      });
      await openSite(page); const baseline = await snapshot(page);
      await start(page); let held = await snapshot(page);
      check(held.value === false && held.gps, label + ' guidance temporarily suppresses autoPan and adds GPS class', held);
      await compactAndSparkle(page, label, baseline);
      await stopButton(page); await restored(page, label + ' stop button', baseline);
      const ended = await snapshot(page);
      check(Math.abs(ended.width - baseline.width) <= 2 && Math.abs(ended.height - baseline.height) <= 2, label + ' original popup dimensions restored', { before: baseline, after: ended });
      check(await page.evaluate(() => !!document.querySelector('.birdmap-gps-dot')), label + ' stopping guidance retains blue point');
      await layout(page, label + ' stopped');
      await start(page); await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.closePopup());
      // Closing a mobile sheet also releases its independent autoPan suppression.
      const closed = await snapshot(page);
      check(!closed.sheet && sameOptions(closed, desktop), label + ' close releases GPS and mobile-sheet holds', { before: desktop, after: closed });
      await openSite(page); check(sameOptions(await snapshot(page), baseline), label + ' reopening preserves original popup settings');
      if (width === 1440) {
        await page.evaluate(() => {
          const m = map_7010a44f6ac2025090f0fe07508ed485; m.closePopup();
          const p = m.latLngToContainerPoint(__marker.getLatLng()), size = m.getSize();
          m.panBy([p.x - (size.x - 10), p.y - (size.y - 10)], { animate: false });
          window.__autoPanStarts = 0; m.on('autopanstart', () => __autoPanStarts++); __marker.openPopup();
        });
        await page.waitForTimeout(700);
        const edge = await snapshot(page);
        check(await page.evaluate(() => __autoPanStarts > 0), label + ' reopened popup fires Leaflet autopanstart at viewport edge');
        check(edge.top >= -1 && edge.bottom <= height + 1, label + ' restored autoPan brings edge popup inside viewport', edge);
      }
      await start(page); await page.evaluate(() => birdmapLocation.clear()); await restored(page, label + ' clear', baseline);
      await start(page, true); await page.evaluate(() => { birdmapLocation.stopGuide(); __mock.geo.at(-1).ok({ coords: { latitude: 37.48261942, longitude: 126.81234982, accuracy: 25 }, timestamp: Date.now() }); });
      await page.waitForTimeout(80); await restored(page, label + ' pending GPS cancellation', baseline);
      await start(page); await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.removeLayer(__marker));
      check(!(await snapshot(page)).gps && !await page.evaluate(() => birdmapLocation.state().guiding), label + ' removed destination ends hold');
      await openSite(page); await start(page); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
      await restored(page, label + ' visibility cleanup', baseline);
      await start(page); await page.evaluate(() => dispatchEvent(new Event('pagehide'))); await restored(page, label + ' pagehide cleanup', baseline);
      if (width === 1440 || width === 390) {
        const other = width === 1440 ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
        await openSite(page); await start(page); await page.setViewportSize(other); await page.waitForTimeout(250);
        held = await snapshot(page); check(held.value === false && held.gps, label + ' resize retains GPS hold');
        await stopButton(page); const resized = await snapshot(page);
        check(!resized.gps && (other.width < 700 ? resized.sheet && resized.value === false : !resized.sheet && sameOptions(resized, desktop)), label + ' resized stop restores current sheet/desktop state', resized);
        await page.setViewportSize({ width, height }); await page.waitForTimeout(250);
        check(sameOptions(await snapshot(page), baseline), label + ' round-trip viewport restores original descriptor');
        await layout(page, label + ' resized');
      }
      await followupRegressions(page, label, width);
      await madoRegressions(page, label, width);
      await landscapeToolsRegression(page, label, width);
      await page.evaluate(() => { publicationInvalidate(); return publicationRefresh(); });
      const reportOpened = await page.evaluate(() => openPublicReportLocation('popup-report', '직박구리'));
      check(reportOpened, label + ' real report popup opens through synthetic exact-ID proof', reportOpened ? undefined : await page.evaluate(() => ({ state: publicationState, allowed: publicationAllowed(), canonical: reportPublicSpots, index: reportSearchIndex.map(e => ({ ...e, witness: reporterStatsWitnesses.get(e) })), calls: __mock.actions.slice(-12), status: document.querySelector('#birdmapReportLocationStatus')?.textContent })));
      await page.evaluate(() => { window.__popup = map_7010a44f6ac2025090f0fe07508ed485._popup; __popup.on('remove', () => __popupEvents.push({ type: 'report removal stack', stack: new Error().stack })); }); await page.waitForTimeout(100);
      const reportBefore = await snapshot(page); check(reportBefore.own && reportBefore.value === false, label + ' report popup originally owns false');
      await start(page);
      check(await page.evaluate(() => birdmapLocation.state().guiding), label + ' report guidance remains active', await page.evaluate(() => __popupEvents.slice(-8)));
      await stopButton(page); await restored(page, label + ' report stop preserves false', reportBefore);
      await start(page); await page.evaluate(() => publicationInvalidate('synthetic popup regression'));
      check(!await page.evaluate(() => birdmapLocation.state().guiding) && sameOptions(await snapshot(page), reportBefore), label + ' publication invalidation restores report popup');
      await openSite(page); await start(page); await page.screenshot({ path: path.join(OUT, 'guide-' + label + '.png') });
      await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.remove());
      const unloaded = await snapshot(page);
      check(sameOptions(unloaded, desktop), label + ' map unload releases all popup options', { before: desktop, after: unloaded });
      check(!await page.evaluate(() => birdmapLocation.state().located || birdmapLocation.state().guiding), label + ' map unload destroys GPS state');
      console.log('PASS ' + label);
    } catch (error) { await page.screenshot({ path: path.join(OUT, 'failure-' + label + '.png') }).catch(() => {}); fs.writeFileSync(path.join(OUT, 'failure-state-' + label + '.json'), JSON.stringify(await page.evaluate(() => ({ events: window.__popupEvents, state: window.birdmapLocation?.state(), publication: window.publicationState })).catch(() => ({})), null, 2)); throw error; }
    finally { await page.close(); }
  }
  check(errors.length === 0, 'no browser JavaScript errors', errors);
  check(network.missingCache.length === 0 && network.continuedExternal === 0, 'all dependencies cached; no external requests continued', network);
})().catch(error => { errors.push(error.stack); process.exitCode = 1; console.error(error); }).finally(async () => {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ passed: checks.length, failed: errors.length, checks, errors, network, scope: 'Real Leaflet and current mobile-sheet source; synthetic public API, GPS, tiles; no external requests or deployments' }, null, 2));
  if (browser) await browser.close(); server.close(); console.log('PASS checks: ' + checks.length + '; errors: ' + errors.length);
});
