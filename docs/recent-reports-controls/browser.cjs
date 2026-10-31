/* PC recent-report box (− / × / 최근 제보) and the 산이면 dining note: actual Chrome on the current index.html.
 * Run: PLAYWRIGHT_MODULE=... CHROME_PATH=... POPUP_DEPENDENCY_CACHE=... node docs/recent-reports-controls/browser.cjs
 * Synthetic publication API (existing fixture, 15 approved reports), synthetic tiles; no external request continues.
 * RECENT_BASE_REF=<git ref> also opens each width with that ref's two basemap assets ("before") for screenshots and
 * an exact phone-geometry comparison. RECENT_SHOTS=<dir> saves screenshots. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.RECENT_OUTPUT || path.join(ROOT, '.ci-results/recent-reports-controls'));
const SHOTS = process.env.RECENT_SHOTS && path.resolve(process.env.RECENT_SHOTS);
const CACHE = process.env.POPUP_DEPENDENCY_CACHE;
assert.ok(CACHE && fs.statSync(CACHE).isDirectory(), 'POPUP_DEPENDENCY_CACHE must name an existing URL-hash cache');
fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ASSETS = ['/assets/birdmap-basemap-init.js', '/assets/birdmap-basemap.css'];
const base = process.env.RECENT_BASE_REF && Object.fromEntries(ASSETS.map(a => [a, cp.execFileSync('git', ['show', process.env.RECENT_BASE_REF + ':' + a.slice(1)], { cwd: ROOT })]));
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
  const row = i => ({ id: 'synthetic-' + i, species: [i % 3 ? '노랑부리저어새' : '흰꼬리수리'], date: day(i), reporter: '합성제보' + (i % 4) });
  __mock.approved = Array.from({ length: 15 }, (_, i) => __mock.spot({ id: 'synthetic-' + i, lat: 34.5 + i * 0.1, lon: 126.5 + i * 0.1, species: row(i).species, history: [row(i)] }));
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

const rect = (page, selector) => page.evaluate(s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(), c = getComputedStyle(n); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, visible: c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }, selector);
const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
const inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
const state = page => page.evaluate(() => {
  const box = document.getElementById('recentReportsBox'), expand = box.querySelector('.birdmap-sheet-actions button'), reopen = document.getElementById('birdmapRecentReopen');
  const shown = s => { const n = document.querySelector(s); return !!n && n.getClientRects().length > 0 && getComputedStyle(n).display !== 'none'; };
  return { cls: box.className, box: shown('#recentReportsBox'), list: shown('#recentReportsList'), tabs: shown('#recentTabs'), contributors: shown('#recentContributors'),
    archive: shown('#reportArchiveOpen'), reopen: shown('#birdmapRecentReopen'), expandText: expand.textContent, expandLabel: expand.getAttribute('aria-label'),
    expanded: expand.getAttribute('aria-expanded'), focus: document.activeElement === expand ? 'expand' : document.activeElement === reopen ? 'reopen' : document.activeElement && document.activeElement.tagName,
    message: document.getElementById('recentReportsMessage').textContent, count: document.getElementById('recentReportsCount').textContent,
    items: document.querySelectorAll('#recentReportsList .recentReportItem').length };
});
const PHONE_PARTS = ['#recentReportsBox', '#recentReportsTitle', '.birdmap-sheet-actions', '#recentReportsMessage', '#birdmapRecentReopen', '#recentReportsList'];
const phoneGeometry = async page => Object.fromEntries(await Promise.all(PHONE_PARTS.map(async s => [s, await rect(page, s)])));

async function openPage(browser, origin, width, height, touch, before) {
  const label = width + 'x' + height + (before ? '-before' : '');
  const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  await page.addInitScript({ content: '(' + fixture + ')();(' + fifteenReports.toString() + ')();' });
  await page.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (request.method() !== 'GET') { network.blocked++; return route.abort(); }
    if (u.origin === origin && before && base[u.pathname]) { network.local++; return route.fulfill({ status: 200, contentType: mime(u.pathname), body: base[u.pathname] }); }
    if (u.origin === origin) { network.local++; return route.continue(); }
    if (u.pathname.startsWith('/tiles/') || /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname)) { network.syntheticTiles++; return route.fulfill({ status: 200, contentType: 'image/png', body: tile }); }
    if (CDN.has(u.hostname)) {
      const file = path.join(CACHE, createHash('sha256').update(u.href).digest('hex'));
      if (fs.existsSync(file)) { network.cached++; return route.fulfill({ status: 200, contentType: mime(u.pathname), body: fs.readFileSync(file) }); }
      network.missingCache.push(u.href);
    }
    network.blocked++; return route.abort();
  });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.L && Object.keys(markerRegistry).length === 240 && publicationAllowed()
    && document.querySelectorAll('#recentReportsList .recentReportItem').length === 15 && document.querySelector('#recentReportsBox .birdmap-sheet-actions'));
  return { page, label };
}
async function shot(page, label, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label + '-' + name + '.png') }); }
const press = (page, selector, touch) => touch ? page.tap(selector) : page.click(selector);
const EXPAND = '#recentReportsBox .birdmap-sheet-actions button:first-child', CLOSE = '#recentReportsBox .birdmap-sheet-actions button:last-child', REOPEN = '#birdmapRecentReopen';

// Site 138's profile gets exactly one dining line linking to the verified Kakao place; other sites get none.
async function dining(page, label, touch) {
  const site = await page.evaluate(() => { const s = siteData.find(x => x.id === '138'); return { name: s.name, lat: s.lat, lon: s.lon }; });
  check(site.name === '산이면' && site.lat === 34.64470277777778 && site.lon === 126.48733888888889, label + ' site 138 marker coordinates unchanged', site);
  const open = id => page.evaluate(id => {
    const s = siteData.find(x => x.id === id), m = map_7010a44f6ac2025090f0fe07508ed485, marker = markerRegistry[markerKey(s)];
    m.closePopup(); m.setView(marker.getLatLng(), 11, { animate: false }); marker.openPopup();
  }, id);
  await open('138');
  await page.waitForSelector('.leaflet-popup .popup-profile-info');
  const note = await page.evaluate(() => {
    const links = document.querySelectorAll('.leaflet-popup .birdmap-dining a'), a = links[0];
    return { count: links.length, inProfile: !!(a && a.closest('details.popup-profile-info .v24ProfileGrid')), text: a && a.textContent, href: a && a.href,
      target: a && a.target, rel: a && a.rel, label: a && a.getAttribute('aria-label'), line: a && a.parentElement.textContent };
  });
  check(note.count === 1 && note.inProfile && note.text === '맛집추천 전원식당 061-532-4320' && note.line === note.text, label + ' 산이면 profile shows the one-line dining note', note);
  check(note.href === 'https://place.map.kakao.com/23941157' && note.target === '_blank' && /noopener/.test(note.rel) && /noreferrer/.test(note.rel), label + ' dining note opens the verified Kakao place in a new tab', note);
  // Scroll only inside the popup (scrollIntoView would also scroll the Leaflet container).
  await page.evaluate(() => {
    const d = document.querySelector('.leaflet-popup details.popup-profile-info'); d.open = true;
    for (let n = d.parentElement; n && !n.classList.contains('leaflet-popup'); n = n.parentElement)
      if (n.scrollHeight > n.clientHeight + 1) { n.scrollTop += d.getBoundingClientRect().top - n.getBoundingClientRect().top - 8; break; }
  });
  const line = await rect(page, '.leaflet-popup .birdmap-dining'), popup = await rect(page, '.leaflet-popup');
  check(line.visible && line.h <= 40 && line.right <= popup.right + 0.5 && line.left >= popup.left - 0.5, label + ' dining note is a small line inside the popup', { line, popup });
  await page.waitForTimeout(400); await shot(page, label, 'sanimyeon-profile');
  await open('23');
  await page.waitForSelector('.leaflet-popup .popup-profile-info');
  check(await page.evaluate(() => document.querySelectorAll('.leaflet-popup .birdmap-dining').length === 0), label + ' other sites have no dining note');
  await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.closePopup());
}

async function pc(page, label) {
  let s = await state(page);
  check(/birdmap-desktop(\s|$)/.test(s.cls) && s.box && s.list && s.tabs && !s.reopen && s.expandText === '−' && s.expandLabel === '최근 제보 줄이기' && s.expanded === 'true'
    && s.message === '당신의 제보가 지도가 됩니다!' && s.count === '15건' && s.items === 15, label + ' default: open box with − and × and the participation message', s);
  const title = await rect(page, '#recentReportsTitle'), box = await rect(page, '#recentReportsBox');
  const parts = { expand: await rect(page, EXPAND), close: await rect(page, CLOSE), label: await rect(page, '#recentReportsLabel'), message: await rect(page, '#recentReportsMessage'), hint: await rect(page, '#recentReportsHint') };
  check(inside(parts.expand, title) && inside(parts.close, title) && inside(title, box) && apart(parts.expand, parts.close)
    && ['label', 'message', 'hint'].every(k => apart(parts[k], parts.expand) && apart(parts[k], parts.close)), label + ' buttons sit inside the title without covering its text', { title, ...parts });
  check(parts.expand.w >= 24 && parts.expand.h >= 24 && parts.close.w >= 24 && parts.close.h >= 24, label + ' buttons are at least 24px targets', parts);
  check(await page.evaluate(s => document.querySelector(s).getAttribute('aria-label'), CLOSE) === '최근 제보 패널 닫기', label + ' × has an accessible name');
  await shot(page, label, '1-default');

  await page.click(EXPAND); s = await state(page);
  const mini = await rect(page, '#recentReportsBox');
  check(s.box && !s.list && !s.tabs && !s.archive && /birdmap-desktop-collapsed/.test(s.cls) && s.expandText === '+' && s.expandLabel === '최근 제보 펼치기' && s.expanded === 'false'
    && s.message === '당신의 제보가 지도가 됩니다!' && mini.h < 90 && Math.abs(mini.bottom - box.bottom) < 1, label + ' − minimizes to the title row in the same corner', { s, mini });
  await shot(page, label, '2-minimized');
  await page.click(EXPAND); s = await state(page);
  check(s.list && s.tabs && s.expanded === 'true' && s.expandLabel === '최근 제보 줄이기', label + ' + expands again', s);
  await shot(page, label, '3-expanded');

  await page.click(CLOSE); s = await state(page);
  const reopen = await rect(page, REOPEN), zoom = await rect(page, '.leaflet-control-zoom'), attribution = await rect(page, '.leaflet-control-attribution');
  check(!s.box && s.reopen && s.focus === 'reopen' && await page.evaluate(() => document.getElementById('birdmapRecentReopen').textContent === '최근 제보'), label + ' × hides the box; 최근 제보 takes focus', s);
  check(reopen.right <= await page.evaluate(() => innerWidth) && reopen.bottom <= await page.evaluate(() => innerHeight) && reopen.h >= 24
    && (!zoom || apart(reopen, zoom)) && (!attribution || !attribution.visible || apart(reopen, attribution)), label + ' 최근 제보 button is visible and clear of map controls', { reopen, zoom, attribution });
  check(await page.evaluate(() => document.getElementById('birdmapRecentReopen').getAttribute('aria-label')) === '최근 출현 제보 패널 열기', label + ' 최근 제보 has an accessible name');
  await shot(page, label, '4-closed');
  await page.click(REOPEN); s = await state(page);
  check(s.box && s.list && !s.reopen && s.focus === 'expand', label + ' 최근 제보 reopens the box open and focuses −', s);

  await page.click(EXPAND); await page.click(CLOSE); await page.click(REOPEN); s = await state(page);
  check(s.box && !s.list && s.expanded === 'false', label + ' minimized → closed → reopened comes back minimized', s);
  await page.click(EXPAND);
  for (let i = 0; i < 3; i++) { await page.click(EXPAND); await page.click(EXPAND); await page.click(CLOSE); await page.click(REOPEN); }
  s = await state(page);
  check(s.box && s.list && !s.reopen && s.expanded === 'true', label + ' repeated minimize/expand/close/reopen ends open', s);

  // Keyboard: Enter and Space on −, Enter on × and on 최근 제보.
  await page.focus(EXPAND); await page.keyboard.press('Enter'); s = await state(page);
  check(!s.list && s.focus === 'expand', label + ' Enter on − minimizes and keeps focus', s);
  await page.keyboard.press('Space'); s = await state(page);
  check(s.list && s.focus === 'expand', label + ' Space on + expands', s);
  await page.keyboard.press('Tab');
  check(await page.evaluate(s => document.activeElement === document.querySelector(s), CLOSE), label + ' Tab moves from − to ×');
  await page.keyboard.press('Enter'); s = await state(page);
  check(!s.box && s.focus === 'reopen', label + ' Enter on × closes and focuses 최근 제보', s);
  await page.keyboard.press('Enter'); s = await state(page);
  check(s.box && s.list && s.focus === 'expand', label + ' Enter on 최근 제보 reopens', s);

  // Tabs survive minimize/expand.
  await page.click('#recentTabContributors');
  await page.waitForFunction(() => document.getElementById('recentReportsBox').classList.contains('contribMode'));
  s = await state(page); check(s.contributors && !s.list, label + ' 이번 달 기여자 tab still opens', s);
  await page.click(EXPAND); s = await state(page); check(!s.contributors && !s.tabs, label + ' minimize also hides the contributors tab', s);
  await page.click(EXPAND); s = await state(page); check(s.contributors && s.tabs, label + ' expand returns to the contributors tab', s);
  await page.click('#recentTabReports'); s = await state(page); check(s.list && !s.contributors, label + ' 최근 제보 tab returns', s);

  // Report click moves the map; reporter link opens the statistics.
  const centerBefore = await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.getCenter());
  await page.click('#recentReportsList .recentReportItem:nth-child(3) .recentReportSpecies');
  await page.waitForFunction(c => { const m = map_7010a44f6ac2025090f0fe07508ed485.getCenter(); return Math.abs(m.lat - c.lat) + Math.abs(m.lng - c.lng) > 0.01; }, centerBefore);
  const moved = await page.evaluate(() => { const c = map_7010a44f6ac2025090f0fe07508ed485.getCenter(); return { lat: c.lat, lng: c.lng, popup: !!document.querySelector('.leaflet-popup') }; });
  check(Math.abs(moved.lat - 34.7) < 0.3 && Math.abs(moved.lng - 126.7) < 0.3, label + ' clicking a report moves the map to it', moved);
  await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.closePopup());
  await page.click('#recentReportsList .recentReportItem:first-child .reporterStatsLink');
  await page.waitForFunction(() => document.getElementById('reporterStatsModal').style.display === 'flex' && /누적 출현종 수/.test(document.getElementById('reporterStatsContent').textContent));
  check(true, label + ' reporter name opens the cumulative statistics');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('reporterStatsModal').style.display !== 'flex');
}

// Phone sheet: the existing ⌃ / × / 최근 제보 behaviour, untouched by the PC state.
async function phone(page, label, touch) {
  let s = await state(page);
  check(!/birdmap-desktop/.test(s.cls) && /birdmap-sheet-collapsed/.test(s.cls) && s.expandText === '⌃' && s.expandLabel === '최근 제보 펼치기' && !s.list && !s.reopen,
    label + ' phone starts with the existing collapsed sheet', s);
  await shot(page, label, '1-default');
  await press(page, EXPAND, touch); s = await state(page);
  check(/birdmap-sheet-expanded/.test(s.cls) && s.list && s.expandText === '⌄' && s.expandLabel === '최근 제보 접기', label + ' ⌃ expands the sheet', s);
  await shot(page, label, '2-expanded');
  await press(page, CLOSE, touch); s = await state(page);
  check(!s.box && s.reopen, label + ' × closes the sheet and shows 최근 제보', s);
  await shot(page, label, '3-closed');
  await press(page, REOPEN, touch); s = await state(page);
  check(s.box && /birdmap-sheet-expanded/.test(s.cls) && !s.reopen, label + ' 최근 제보 restores the sheet as it was', s);
  await press(page, EXPAND, touch); s = await state(page);
  check(/birdmap-sheet-collapsed/.test(s.cls) && !s.list, label + ' ⌄ folds the sheet again', s);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, height] of [[1024, 768], [1440, 900]]) {
      if (base) { const b = await openPage(browser, origin, width, height, false, true); await shot(b.page, b.label, '1-default'); await b.page.close(); }
      const { page, label } = await openPage(browser, origin, width, height, false);
      try {
        await pc(page, label);
        await dining(page, label, false);
        // Mixing with the phone sheet: PC closed, phone layout keeps its own state, PC state returns on widening.
        await page.click(CLOSE);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => !document.getElementById('recentReportsBox').classList.contains('birdmap-desktop'));
        let s = await state(page);
        check(s.box && /birdmap-sheet-collapsed/.test(s.cls) && !s.reopen && s.expandText === '⌃', label + ' PC close does not carry into the phone layout', s);
        await page.click(EXPAND); s = await state(page);
        check(/birdmap-sheet-expanded/.test(s.cls) && s.list, label + ' phone fold still works after PC changes', s);
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => document.getElementById('recentReportsBox').classList.contains('birdmap-desktop'));
        s = await state(page);
        check(!s.box && s.reopen && s.expandText === '+', label + ' widening back keeps the PC closed state', s);
        await page.click(REOPEN); s = await state(page);
        check(s.box && s.list && s.expanded === 'true', label + ' PC reopens after the phone round trip', s);
        console.log('PASS ' + label);
      } catch (error) { await page.screenshot({ path: path.join(OUT, 'failure-' + label + '.png') }).catch(() => {}); throw error; }
      finally { await page.close(); }
    }
    for (const [width, height] of [[320, 640], [360, 740], [390, 844]]) {
      let before = null;
      if (base) {
        const b = await openPage(browser, origin, width, height, true, true);
        before = await phoneGeometry(b.page); await shot(b.page, b.label, '1-default'); await b.page.close();
      }
      const { page, label } = await openPage(browser, origin, width, height, true);
      try {
        if (before) check(JSON.stringify(await phoneGeometry(page)) === JSON.stringify(before), label + ' phone layout is pixel-identical to ' + process.env.RECENT_BASE_REF, before);
        await phone(page, label, true);
        await dining(page, label, true);
        console.log('PASS ' + label);
      } catch (error) { await page.screenshot({ path: path.join(OUT, 'failure-' + label + '.png') }).catch(() => {}); throw error; }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
  check(errors.length === 0, 'no browser JavaScript errors', errors);
  check(network.missingCache.length === 0, 'all dependencies cached; no external requests continued', network);
})().catch(error => { errors.push(error.stack); process.exitCode = 1; console.error(error); }).finally(() => {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ passed: checks.length, failed: errors.length, checks, errors, network, scope: 'Actual Chrome and Leaflet; synthetic report API and tiles; no external requests' }, null, 2));
  server.close(); console.log('PASS checks: ' + checks.length + '; errors: ' + errors.length);
});
