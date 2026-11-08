/* 자동 공개 제보 화면 연결(실제 Chrome, 현재 index.html): 붉은 출현 마커, 최근 출현 제보 목록 통합(관찰일 순·15건 제한),
 * 클릭 이동·팝업, 제보자 이름 비노출, 관리자 공개 중지 뒤 제거, 승인 전환 시 중복 없음. PC(1366)와 모바일(375, touch).
 * Run: PLAYWRIGHT_MODULE=... CHROME_PATH=... POPUP_DEPENDENCY_CACHE=... node docs/pending-ui/browser.cjs
 * 합성 공개 API(기존 publication 고정물)만 쓰고, 외부 요청은 계속하지 않는다. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SITE_COUNT = require('../site-data-guard/guard.cjs').expected().siteData.length;
const ROOT = path.resolve(path.join(__dirname, '../..'));
const OUT = path.resolve(process.env.PENDING_UI_OUTPUT || path.join(ROOT, '.ci-results/pending-ui'));
const SHOTS = process.env.PENDING_UI_SHOTS && path.resolve(process.env.PENDING_UI_SHOTS);
const CACHE = process.env.POPUP_DEPENDENCY_CACHE;
assert.ok(CACHE && fs.statSync(CACHE).isDirectory(), 'POPUP_DEPENDENCY_CACHE must name an existing URL-hash cache');
fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const harness = fs.readFileSync(path.join(ROOT, 'docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs'), 'utf8');
const hook = harness.match(/function hook\(\)\{[\s\S]*?\r?\n\}\r?\n\r?\nclass CDP/);
assert.ok(hook, 'existing publication fixture is available');
const fixture = hook[0].replace(/\r?\n\r?\nclass CDP$/, '');
const checks = [], errors = [];
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

// 승인 3건(관찰일 2·5·9일 전)과 자동 공개 16건(0·1·3·4·6·7·8·10~18일 전). 합쳐서 최근 60일 안 19건 → 목록은 상위 15건.
function seed() {
  const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  window.__day = day;
  const approvedDays = [2, 5, 9], pendingDays = [0, 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  __mock.approved = approvedDays.map(n => __mock.spot({ id: 'approved-' + n, lat: 34.5 + n * 0.1, lon: 126.5 + n * 0.1, species: ['흰꼬리수리'], history: [{ id: 'h' + n, species: ['흰꼬리수리'], date: day(n), reporter: '공개이름' + n }] }));
  __mock.pendingSpots = pendingDays.map(n => Object.assign({ id: 'auto-' + n, verified: false, lat: 35.2 + n * 0.05, lon: 127.2 + n * 0.05, species: ['노랑부리저어새'], date: day(n), reporter: '비공개이름' + n },
    n === 1 ? { locationHidden: true, approximate: true } : {}));
  // 서버가 verified:false 로 표시하지 않은 대기 자료(과거 정책·잘못 온 응답)는 지도에도 목록에도 들어가면 안 된다.
  // 전체 제보 검색(보관함) 응답: 승인 제보 이력을 공개 계약에 맞게 돌려준다(승인 건 클릭 때 위치 카드가 이 응답으로 확인한다).
  const fixtureFetch = window.fetch;
  window.fetch = (input, options) => {
    const u = new URL(String(input), location.href);
    if (u.hostname.endsWith('workers.dev') && u.pathname === '/reports/search') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, serverTime: new Date().toISOString(), offset: Number(u.searchParams.get('offset') || 0), limit: 20, total: __mock.approved.length, hasMore: false, reports: Number(u.searchParams.get('offset') || 0) ? [] : __mock.approved.map(sp => Object.assign({}, sp.history[0], { locationHidden: false, target: { kind: 'spot', spotId: sp.id } })),
        publication: { contract: 'publication-v1', epoch: __mock.epoch, revision: __mock.revision, projection: 'nonbreeding-location-v2-autopublic-v1', nonce: u.searchParams.get('nonce') } }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    }
    return fixtureFetch(input, options);
  };
  __mock.pendingSpots.push({ id: 'not-allowed', lat: 36.9, lon: 128.9, species: ['직박구리'], date: day(0) });
}

async function openPage(browser, origin, width, height, touch) {
  const label = width + 'x' + height;
  const page = await browser.newPage({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
  page.on('pageerror', error => errors.push(label + ': ' + error.message));
  await page.addInitScript({ content: '(' + fixture + ')();(' + seed.toString() + ')();' });
  await page.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (request.method() !== 'GET') return route.abort();
    if (u.origin === origin) return route.continue();
    if (u.pathname.startsWith('/tiles/') || /(^|\.)tile\.openstreetmap\.org$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'image/png', body: tile });
    if (CDN.has(u.hostname)) {
      const file = path.join(CACHE, createHash('sha256').update(u.href).digest('hex'));
      if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: mime(u.pathname), body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(count => window.L && Object.keys(markerRegistry).length === count && publicationAllowed()
    && Object.keys(reportPendingLayers).length === 16 && recentReportEntries().filter(e => e.kind === 'pending').length === 16
    && document.querySelectorAll('#recentReportsList .recentReportItem').length === 15 && document.querySelectorAll('#recentReportsList .recentReportSpecies').length === 15, SITE_COUNT, { timeout: 30000 });
  return { page, label };
}
// 모바일 팝업은 화면 아래를 덮으므로 다음 줄을 누르기 전에 사용자가 하듯 팝업을 닫는다.
const press = async (page, selector, touch) => {
  await page.evaluate(() => map_7010a44f6ac2025090f0fe07508ed485.closePopup());
  await page.waitForTimeout(200);
  return touch ? page.tap(selector, { timeout: 8000 }) : page.click(selector, { timeout: 8000 });
};
const items = page => page.evaluate(() => [...document.querySelectorAll('#recentReportsList .recentReportItem')].map(n => ({
  species: n.querySelector('.recentReportSpecies').textContent, meta: (n.querySelector('.recentReportMeta') || {}).textContent || '',
  date: (n.querySelector('.recentReportMeta') && n.querySelector('.recentReportMeta').lastChild || {}).textContent || '' })));
const popupState = page => page.evaluate(() => {
  const m = map_7010a44f6ac2025090f0fe07508ed485, p = m._popup, c = m.getCenter(), src = p && p._source;
  const find = o => Object.keys(o).find(k => o[k] === src);
  return { open: !!p && m.hasLayer(p), pending: src ? find(reportPendingLayers) : null, approved: src ? find(reportSpotLayers) : null,
    center: [c.lat, c.lng], text: p && p.getContent ? String(p.getContent()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160) : '' };
});
// recentReportDateText 와 같은 형식(올해면 M/D, 아니면 YYYY. M. D.)
const dateText = (page, n) => page.evaluate(n => { const d = new Date(__day(n) + 'T00:00:00Z'), y = Number(kstDateText().slice(0, 4));
  return d.getUTCFullYear() === y ? (d.getUTCMonth() + 1) + '/' + d.getUTCDate() : d.getUTCFullYear() + '. ' + (d.getUTCMonth() + 1) + '. ' + d.getUTCDate() + '.'; }, n);
const openPopupOf = (page, id) => page.waitForFunction(id => { const m = map_7010a44f6ac2025090f0fe07508ed485, p = m._popup; return p && m.hasLayer(p) && (p._source === reportPendingLayers[id] || p._source === reportSpotLayers[id]); }, id, { timeout: 8000 });

async function scenario(page, label, touch) {
  // 모바일은 최근 제보 시트가 접힌 채 시작하므로 사용자가 하듯 먼저 펼친다.
  if (touch && (await page.getAttribute('#recentReportsBox .birdmap-sheet-actions button:first-child', 'aria-expanded')) !== 'true') {
    await page.tap('#recentReportsBox .birdmap-sheet-actions button:first-child');
    await page.waitForFunction(() => document.querySelector('#recentReportsBox .birdmap-sheet-actions button:first-child').getAttribute('aria-expanded') === 'true');
    await page.waitForTimeout(400);
  }
  // 1) 마커: 자동 공개 점이 승인 점과 같은 붉은 출현 점 스타일이다(황색 아님).
  const style = await page.evaluate(() => { const o = l => ({ color: l.options.color, fill: l.options.fillColor, op: l.options.fillOpacity, r: l.options.radius, kind: l.options.birdmapMarkerKind });
    return { approved: o(reportSpotLayers['approved-2']), pending: o(reportPendingLayers['auto-0']) }; });
  check(style.pending.color === '#d32f2f' && style.pending.fill === '#d32f2f' && JSON.stringify(style.pending) === JSON.stringify(style.approved) && style.pending.kind === 'report', label + ' 자동 공개 마커 = 승인 마커와 같은 붉은 스타일', style);
  check(await page.evaluate(() => !reportPendingLayers['not-allowed'] && Object.keys(reportPendingLayers).length === 16), label + ' verified:false 가 아닌 자료는 그리지 않는다');
  // 2) 최근 목록: 승인 + 자동 공개, 관찰일 최신순, 15건.
  const list = await items(page);
  const expectedDates = []; for (let n = 0; n <= 14; n++) expectedDates.push(await dateText(page, n));
  const gotDates = list.map(i => i.date);
  check(list.length === 15 && JSON.stringify(gotDates) === JSON.stringify(expectedDates), label + ' 최근 목록: 승인+자동 공개 합쳐 관찰일 최신순 15건', { gotDates, expectedDates, list: list.map(i => i.species + '|' + i.meta), html: null });
  const speciesCounts = list.reduce((a, i) => (a[i.species] = (a[i.species] || 0) + 1, a), {});
  check(speciesCounts['흰꼬리수리'] === 3 && speciesCounts['노랑부리저어새'] === 12 && !list.some(i => i.species.includes('직박구리')), label + ' 승인 3건·자동 공개 12건, 허용되지 않은 자료는 제외', speciesCounts);
  check((await page.evaluate(() => document.getElementById('recentReportsCount').textContent)) === '15건', label + ' 건수 표시 15건');
  const text = await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('.leaflet-tooltip')].map(n => n.textContent).join());
  check(!/비공개이름/.test(text), label + ' 자동 공개 제보의 제보자 이름은 표시하지 않는다(응답에 있어도)');
  // 3) 클릭 이동(종명 글자를 누르면 기존처럼 종 검색이 열리므로 행의 날짜·이름 줄을 누른다): 가장 최근 자동 공개 건(첫 줄).
  await press(page, '#recentReportsList .recentReportItem:nth-child(1) .recentReportMeta', touch);
  await openPopupOf(page, 'auto-0');
  let st = await popupState(page);
  check(st.open && st.pending === 'auto-0' && Math.abs(st.center[0] - 35.2) < 0.01 && Math.abs(st.center[1] - 127.2) < 0.01, label + ' 목록 클릭 → 해당 자동 공개 마커로 이동하고 팝업 열림', st);
  check(/노랑부리저어새/.test(st.text) && /미검증|자동 공개/.test(st.text), label + ' 팝업 내용: 출현종과 기존 자동 공개 표시', st.text);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label + '-pending-open.png') });
  // 위치 가림 건(2번째 줄): 공개된 대략점으로 이동한다.
  await press(page, '#recentReportsList .recentReportItem:nth-child(2) .recentReportMeta', touch);
  await openPopupOf(page, 'auto-1');
  st = await popupState(page);
  check(st.pending === 'auto-1' && Math.abs(st.center[0] - 35.25) < 0.01 && /대략/.test(st.text), label + ' 위치 가림 건은 공개된 대략 위치로 이동', st);
  // 승인 건(3번째 줄)은 기존 동작(공개 제보 위치 카드)을 그대로 쓴다: 지도가 그 제보 위치로 이동한다.
  await press(page, '#recentReportsList .recentReportItem:nth-child(3) .recentReportMeta', touch);
  await page.waitForFunction(() => { const c = map_7010a44f6ac2025090f0fe07508ed485.getCenter(); return Math.abs(c.lat - 34.7) < 0.5 && Math.abs(c.lng - 126.7) < 0.5; }, null, { timeout: 8000 });
  check(true, label + ' 승인 건 클릭은 기존처럼 동작(해당 위치로 이동)');
  // 4) 관리자 공개 중지: 대기 목록에서 빠지면 마커·목록에서 사라지고 열린 팝업도 닫힌다.
  await press(page, '#recentReportsList .recentReportItem:nth-child(1) .recentReportMeta', touch);
  await openPopupOf(page, 'auto-0');
  await page.evaluate(async () => { __mock.pendingSpots = __mock.pendingSpots.filter(s => s.id !== 'auto-0'); __mock.revision = String(BigInt(__mock.revision) + 1n); await loadApprovedReports(); await loadPendingReports(); });
  const after = await page.evaluate(() => ({ layer: !!reportPendingLayers['auto-0'], popup: !!(map_7010a44f6ac2025090f0fe07508ed485._popup && map_7010a44f6ac2025090f0fe07508ed485.hasLayer(map_7010a44f6ac2025090f0fe07508ed485._popup)),
    count: document.querySelectorAll('#recentReportsList .recentReportItem').length, pendingLayers: Object.keys(reportPendingLayers).length, entries: recentReportEntries().filter(e => e.spotId === 'auto-0').length }));
  check(!after.layer && !after.popup && after.count === 15 && after.pendingLayers === 15 && after.entries === 0, label + ' 공개 중지 → 마커·팝업·목록에서 제거(다음 건이 목록을 채움)', after);
  // 5) 승인으로 전환되면 같은 제보가 목록에 두 번 나오지 않는다(붉은 승인 점 하나만).
  await page.evaluate(async () => {
    __mock.approved = __mock.approved.concat([__mock.spot({ id: 'auto-3', lat: 35.35, lon: 127.35, species: ['노랑부리저어새'], history: [{ id: 'h-auto-3', species: ['노랑부리저어새'], date: __day(3), reporter: '' }] })]);
    __mock.revision = String(BigInt(__mock.revision) + 1n); await loadApprovedReports(); await loadPendingReports();
  });
  const promoted = await page.evaluate(() => ({ pendingLayer: !!reportPendingLayers['auto-3'], approvedLayer: !!reportSpotLayers['auto-3'],
    entries: recentReportEntries().filter(e => e.spotId === 'auto-3').length, total: document.querySelectorAll('#recentReportsList .recentReportItem').length }));
  check(!promoted.pendingLayer && promoted.approvedLayer && promoted.entries === 1 && promoted.total === 15, label + ' 승인 전환 시 중복 없이 한 건만', promoted);
  // 6) 자동 공개가 모두 내려가면 승인 건만 남는다.
  await page.evaluate(async () => { __mock.pendingSpots = []; __mock.revision = String(BigInt(__mock.revision) + 1n); await loadApprovedReports(); await loadPendingReports(); });
  const rest = await page.evaluate(() => ({ pending: Object.keys(reportPendingLayers).length, items: document.querySelectorAll('#recentReportsList .recentReportItem').length }));
  check(rest.pending === 0 && rest.items === 4, label + ' 자동 공개가 모두 내려가면 승인 건만 남는다', rest);
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const [w, h, touch] of [[1366, 800, false], [375, 812, true]]) {
      const { page, label } = await openPage(browser, origin, w, h, touch);
      await scenario(page, label, touch);
      await page.close();
    }
    check(errors.length === 0, '페이지 오류 없음', errors);
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(OUT, 'pending-ui.json'), JSON.stringify({ pass: checks.length, checks }, null, 1));
  console.log(JSON.stringify({ pass: checks.length, fail: 0 }));
})().catch(e => { console.error(String(e.stack).split(String.fromCharCode(10)).slice(0, 5).join(' | ')); try { fs.writeFileSync(path.join(OUT, 'pending-ui.json'), JSON.stringify({ pass: checks.length, failed: e.message, checks, errors }, null, 1)); } catch {} process.exit(1); });
