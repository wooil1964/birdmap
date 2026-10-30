/* Report-location panel with place search: actual Chrome on the current index.html.
 * Run: PLAYWRIGHT_MODULE=... CHROME_PATH=... POPUP_DEPENDENCY_CACHE=... node docs/report-pick-search/browser.cjs
 * Synthetic publication API, GPS and tiles (existing fixture); Nominatim is answered locally; no external request continues. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.REPORT_PICK_OUTPUT || path.join(ROOT, '.ci-results/report-pick-search'));
const SHOTS = process.env.REPORT_PICK_SCREENSHOTS && path.resolve(process.env.REPORT_PICK_SCREENSHOTS);
const CACHE = process.env.POPUP_DEPENDENCY_CACHE;
assert.ok(CACHE && fs.statSync(CACHE).isDirectory(), 'POPUP_DEPENDENCY_CACHE must name an existing URL-hash cache');
fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
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

// Runs in the page after the publication fixture: Nominatim answers and a controllable visual viewport (keyboard).
function nominatimAndKeyboard() {
  const old = window.fetch, rows = {
    '주남저수지': [
      { name: '주남저수지', display_name: '주남저수지, 의창구, 창원시, 경상남도, 대한민국', lat: '35.3141', lon: '128.6740' },
      { name: '주남저수지', display_name: '주남저수지, 주남로101번길, 의창구, 창원시, 경상남도, 51116, 대한민국', lat: '35.3182', lon: '128.6753' },
      { name: '주남저수지', display_name: '주남저수지, 의창구, 창원시, 경상남도, 대한민국', lat: '35.3141', lon: '128.6740' },
      { name: '주남저수지', display_name: '주남저수지, 주남로, 의창구, 창원시, 경상남도, 51116, 대한민국', lat: '35.3100', lon: '128.6800' },
      { name: '주남저수지 람사르문화관', display_name: '주남저수지 람사르문화관, 주남로, 의창구, 창원시, 경상남도, 대한민국', lat: '35.3090', lon: '128.6810' }],
    '없는장소': []
  };
  window.__nominatim = [];
  window.fetch = (input, options = {}) => {
    const u = new URL(String(input), location.href);
    if (u.hostname === 'nominatim.openstreetmap.org') {
      const q = u.searchParams.get('q');
      window.__nominatim.push({ at: performance.now(), q, params: Object.fromEntries(u.searchParams), credentials: options.credentials });
      if (q === '오류') return Promise.resolve(new Response('busy', { status: 503 }));
      return Promise.resolve(new Response(JSON.stringify(rows[q] || []), { headers: { 'Content-Type': 'application/json' } }));
    }
    return old(input, options);
  };
  const vv = new EventTarget(); vv.offsetTop = 0; vv.height = innerHeight;
  addEventListener('resize', () => { if (!vv.keyboard) vv.height = innerHeight; });
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
}

const rect = (page, selector) => page.evaluate(s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(), c = getComputedStyle(n); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, visible: c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }, selector);
const state = page => page.evaluate(() => {
  const m = map_7010a44f6ac2025090f0fe07508ed485, c = m.getCenter();
  return { picking: document.body.classList.contains('reportPicking'), picked: reportPicked, source: reportLocationSource, lat: c.lat, lon: c.lng, zoom: m.getZoom(),
    note: document.querySelector('.rpsNote').textContent, results: document.querySelectorAll('.rpsResults button').length, listHidden: document.querySelector('.rpsResults').hidden,
    confirm: !document.getElementById('reportConfirmBtn').hidden, status: document.getElementById('reportPickStatus').textContent, gps: document.getElementById('reportGpsPickBtn').textContent,
    input: document.querySelector('.rpsForm input').value, requests: __nominatim.length };
});
async function search(page, text) {
  const input = page.locator('.rpsForm input');
  await input.fill(text); await input.press('Enter');
  await page.waitForFunction(() => document.querySelector('.rpsNote').textContent !== '검색 중…', null, { timeout: 5000 });
}
async function shot(page, label, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label + '-' + name + '.png') }); }

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, height, touch] of [[1440, 900, false], [1280, 720, false], [1024, 768, false], [390, 844, true], [360, 800, true], [320, 568, true], [844, 390, true]]) {
      const label = width + 'x' + height, page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
      page.on('pageerror', error => errors.push(label + ': ' + error.message));
      await page.addInitScript({ content: '(' + fixture + ')();(' + nominatimAndKeyboard.toString() + ')();' });
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
        await page.waitForFunction(() => window.L && Object.keys(markerRegistry).length === 229 && publicationAllowed() && !document.getElementById('reportToggleBtn').hidden);
        await page.click('#reportToggleBtn');
        await page.waitForSelector('#reportPickPanel.rpsCompact', { state: 'visible' });
        await shot(page, label, '1-panel');

        // Layout: two rows, small, GPS and search side by side, × at the right end, no cancel button.
        const panel = await rect(page, '#reportPickPanel'), title = await rect(page, '.rpsHead strong'), close = await rect(page, '.rpsClose');
        const gps = await rect(page, '#reportGpsPickBtn'), input = await rect(page, '.rpsForm input');
        check(panel.w <= 248 && panel.w >= Math.min(248, width - 16) - 1, label + ' panel is at most 248px wide', panel);
        check(panel.h <= (touch ? 108 : 96), label + ' panel is two short rows', panel);
        check(panel.left >= 0 && panel.right <= width && panel.bottom <= height, label + ' panel inside the viewport', panel);
        check(close.visible && close.right <= panel.right && close.left > title.right && Math.abs((close.top + close.bottom) - (title.top + title.bottom)) < 8, label + ' title left, × right on the first row', { title, close });
        check(gps.visible && input.visible && gps.bottom <= input.bottom + 1 && gps.top >= input.top - 1 && gps.right < input.left && gps.top > title.bottom - 2, label + ' GPS left and search right on the second row', { gps, input });
        check(!touch || (gps.h >= 44 && input.h >= 44 && close.w >= 40), label + ' touch targets stay large enough', { gps, input, close });
        check(!(await rect(page, '#reportCancelBtn')).visible && !(await rect(page, '#reportPickStatus')).visible && !(await rect(page, '.reportPickPanelBtns')).visible, label + ' no cancel button, hint or empty button row');
        check(await page.evaluate(() => document.querySelector('.rpsForm input').placeholder === '주소·장소명 검색' && document.getElementById('reportGpsPickBtn').textContent === '현재 위치'), label + ' labels');
        check(await page.evaluate(() => { const i = document.querySelector('.rpsForm input'); return i.scrollWidth <= i.clientWidth + 1; }), label + ' placeholder is not clipped');

        // Search: Enter only, at most three de-duplicated results, Korean request parameters.
        const center = await state(page);
        await page.locator('.rpsForm input').fill('주남저수지');
        check((await state(page)).requests === 0, label + ' typing alone sends no request (no autocomplete)');
        await page.locator('.rpsForm input').press('Enter');
        await page.waitForSelector('.rpsResults button');
        let s = await state(page);
        const request = await page.evaluate(() => __nominatim[0]);
        check(s.requests === 1 && request.q === '주남저수지' && request.params.countrycodes === 'kr' && request.params['accept-language'] === 'ko' && request.params.format === 'jsonv2' && request.credentials === 'omit', label + ' one Korean Nominatim request on Enter', request);
        const rows = await page.$$eval('.rpsResults button', list => list.map(b => ({ name: b.querySelector('b').textContent, address: (b.querySelector('span') || {}).textContent })));
        check(rows.length === 3 && rows[0].address === '경상남도 창원시 의창구' && rows[1].address === '경상남도 창원시 의창구 주남로101번길' && rows[2].address === '경상남도 창원시 의창구 주남로', label + ' three de-duplicated results with name and short address', rows);
        check(await page.evaluate(() => !!document.querySelector('.rpsCredit') && document.querySelector('.rpsCredit').textContent.includes('OpenStreetMap')), label + ' OpenStreetMap credit shown with results');
        const results = await rect(page, '.rpsResults');
        check(results.bottom <= height && (await rect(page, '#reportPickPanel')).top >= 0, label + ' results fit on screen', results);
        await shot(page, label, '2-results');
        check(!s.picked && s.picking, label + ' results do not set a location', s);

        // Choosing a result only moves the map.
        await page.locator('.rpsResults button').nth(1).click();
        s = await state(page);
        check(Math.abs(s.lat - 35.3182) < 1e-4 && Math.abs(s.lon - 128.6753) < 1e-4 && s.zoom === 16 && (s.lat !== center.lat), label + ' result moves the map to its coordinates', s);
        check(!s.picked && !s.confirm && s.picking && s.listHidden && s.note === '지도를 눌러 발견 지점을 지정하세요.', label + ' result closes the list without confirming a location', s);
        await shot(page, label, '3-moved');

        // Zoom control while picking does not place a point.
        const zoomBefore = s.zoom;
        await page.click('.leaflet-control-zoom-out');
        await page.waitForFunction(z => map_7010a44f6ac2025090f0fe07508ed485.getZoom() === z, zoomBefore - 1, { timeout: 3000 }).catch(() => {});
        s = await state(page);
        check(s.zoom === zoomBefore - 1 && !s.picked && s.picking, label + ' zoom control still zooms and does not pick', s);

        // The actual point comes from a map tap.
        const map = await rect(page, '#' + await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.getContainer().id));
        const tapX = Math.round(map.x + map.w / 2 + 23), tapY = Math.round(map.y + Math.min(map.h / 2, (await rect(page, '#reportPickPanel')).top - 60));
        const expected = await page.evaluate(([x, y]) => { const ll = map_7010a44f6ac2025090f0fe07508ed485.containerPointToLatLng([x, y]); return { lat: ll.lat, lon: ll.lng }; }, [tapX - map.x, tapY - map.y]);
        if (touch) await page.touchscreen.tap(tapX, tapY); else await page.mouse.click(tapX, tapY);
        await page.waitForFunction(() => !!reportPicked);
        s = await state(page);
        check(Math.abs(s.picked.lat - expected.lat) < 1e-4 && Math.abs(s.picked.lon - expected.lon) < 1e-4 && s.source === 'map', label + ' map tap sets the report location', { picked: s.picked, expected });
        check(s.picking && s.confirm && s.status === '지도에서 선택한 위치' && s.note === '' && (await rect(page, '#reportPickStatus')).visible, label + ' picked state shows status and confirm button, hint cleared', s);
        await shot(page, label, '4-picked');

        // Cached repeat sends nothing; no-result and failure show short messages; calls stay ≥1.1 s apart.
        await search(page, '주남저수지');
        check((await state(page)).requests === 1 && (await state(page)).results === 3, label + ' repeated query served from memory');
        await search(page, '없는장소'); s = await state(page);
        check(s.note === '검색 결과가 없습니다.' && s.results === 0 && s.listHidden, label + ' no result message', s);
        await search(page, '오류'); s = await state(page);
        check(s.note === '검색하지 못했습니다. 지도에서 직접 지정해 주세요.' && s.listHidden, label + ' failure message', s);
        const gaps = await page.evaluate(() => __nominatim.slice(1).map((r, i) => r.at - __nominatim[i].at));
        check(gaps.every(g => g >= 1090), label + ' requests at most one per 1.1 s', gaps);
        check(!!(await state(page)).picked, label + ' searching never clears a picked location');

        // GPS keeps working from the moved button.
        await page.click('#reportGpsPickBtn');
        check((await state(page)).gps === '확인 중…' && await page.evaluate(() => document.getElementById('reportGpsPickBtn').disabled), label + ' GPS busy label');
        await page.evaluate(() => __mock.geo.at(-1).ok({ coords: { latitude: 35.0961, longitude: 128.9488, accuracy: 25 }, timestamp: Date.now() }));
        s = await state(page);
        check(s.picked.lat === 35.0961 && s.picked.lon === 128.9488 && s.source === 'gps' && s.gps === '다시 찾기' && s.status === '현재 위치 · 오차 약 25m' && s.picking, label + ' GPS sets the location as before', s);
        await page.evaluate(() => __mock.geo.length = 0);
        await page.click('#reportGpsPickBtn');
        await page.evaluate(() => __mock.geo.at(-1).error({ code: 1 }));
        check((await page.textContent('#reportPickWarn')).includes('권한') && (await state(page)).gps === '다시 찾기', label + ' GPS denial message unchanged');
        await shot(page, label, '5-gps');

        // Confirm opens the existing report form; its GPS button keeps its own label.
        await page.click('#reportConfirmBtn');
        check(await page.evaluate(() => document.getElementById('reportModal').style.display === 'flex' && document.querySelector('#reportModal .reportGpsBtn').textContent === '현재 위치 사용' && !document.body.classList.contains('reportPicking')), label + ' confirm opens the unchanged report form');
        await page.evaluate(() => closeReportModal());

        // × closes the picker and clears everything.
        await page.click('#reportToggleBtn'); await search(page, '주남저수지');
        await page.click('.rpsClose');
        s = await state(page);
        check(!s.picking && !s.picked && s.input === '' && s.listHidden && s.note === '' && !(await rect(page, '#reportPickPanel')).visible && !await page.evaluate(() => document.getElementById('reportToggleBtn').hidden), label + ' × closes and clears the picker', s);

        // Keyboard: the panel and its results rise above the on-screen keyboard.
        if (touch) {
          await page.click('#reportToggleBtn');
          await page.locator('.rpsForm input').focus();
          const keyboard = Math.round(height * 0.42);
          await page.evaluate(k => { const vv = visualViewport; vv.keyboard = true; vv.height = innerHeight - k; vv.dispatchEvent(new Event('resize')); }, keyboard);
          let p = await rect(page, '#reportPickPanel');
          check(p.bottom <= height - keyboard - 4 && p.top >= 0, label + ' panel above the keyboard', { panel: p, keyboard });
          await page.locator('.rpsForm input').fill('주남저수지');
          await page.locator('.rpsForm input').press('Enter');
          await page.waitForSelector('.rpsResults button');
          p = await rect(page, '#reportPickPanel');
          check(p.bottom <= height - keyboard - 4 && p.top >= 0, label + ' results above the keyboard', { panel: p, keyboard });
          await shot(page, label, '6-keyboard');
          await page.locator('.rpsResults button').first().click();
          await page.evaluate(() => { const vv = visualViewport; vv.keyboard = false; vv.height = innerHeight; vv.dispatchEvent(new Event('resize')); });
          await page.waitForTimeout(50);
          check(await page.evaluate(() => document.getElementById('reportPickPanel').style.bottom === ''), label + ' panel returns to its place when the keyboard closes');
          await page.click('.rpsClose');
        }
        console.log('PASS ' + label);
      } catch (error) { await page.screenshot({ path: path.join(OUT, 'failure-' + label + '.png') }).catch(() => {}); throw error; }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
  check(errors.length === 0, 'no browser JavaScript errors', errors);
  check(network.missingCache.length === 0, 'all dependencies cached; no external requests continued', network);
})().catch(error => { errors.push(error.stack); process.exitCode = 1; console.error(error); }).finally(() => {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ passed: checks.length, failed: errors.length, checks, errors, network, scope: 'Actual Chrome and Leaflet; synthetic report API, GPS, tiles, Nominatim and keyboard; no external requests' }, null, 2));
  server.close(); console.log('PASS checks: ' + checks.length + '; errors: ' + errors.length);
});
