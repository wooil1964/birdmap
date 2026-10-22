// Genuine Pages document + reviewed candidate modules in memory. No deployment.
// Keys are entered in the browser and never read from files or environment.
// node docs/vworld-candidate/pages-candidate-check.mjs [--self-test] [--output path]
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, sep, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE = 'https://wooil1964.github.io/birdmap/';
const ORIGIN = 'https://wooil1964.github.io';
const MAP = 'map_7010a44f6ac2025090f0fe07508ed485';
const OSM = 'tile_layer_62315ff8219cb818078bbef8d2f68bcb';
const STATE = '__birdmapCandidateBrowserCheck';
const BINDING = '__birdmapCandidateBrowserCheckEvent';
const BUDGET = 32;
const TTL_MS = 600000;
const CDN = new Set(['cdn.jsdelivr.net', 'code.jquery.com', 'cdnjs.cloudflare.com', 'netdna.bootstrapcdn.com']);
const FILES = new Set(['index.html', 'weather_today.json', 'weather_week.json', 'weather_rules.json', 'tide_today.json', 'tide_month.json', 'notices.json', 'birdmap-user-guide.png', 'assets/birdmap-basemap.js', 'assets/birdmap-basemap-init.js', 'assets/birdmap-basemap.css', 'assets/map-runtime-config.js']);
// The credential segment is never captured or decoded. Only tile coordinates
// are read after checking the complete fixed HTTPS URL shape.
const TILE = /^https:\/\/api\.vworld\.kr\/req\/wmts\/1\.0\.0\/(?:[A-Za-z0-9._~!'()*-]|%[0-9A-Fa-f]{2})+\/Base\/(\d+)\/(\d+)\/(\d+)\.png$/;
const EVENTS = new Set(['started', 'ready', 'partial_error', 'fallback', 'map_confirmed', 'map_not_confirmed', 'cancelled', 'controller_error']);
const args = process.argv.slice(2);
let SELF_TEST = false, OUTPUT = join(ROOT, '.ci-results/vworld-pages-candidate/result.json'), validArgs = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--self-test') SELF_TEST = true;
  else if (args[i] === '--output' && args[i + 1] && !args[i + 1].startsWith('--')) OUTPUT = resolve(args[++i]);
  else validArgs = false;
}
if (!validArgs) { console.log(JSON.stringify({ event: 'finished', status: 'invalid_arguments' })); process.exit(1); }
const delay = ms => new Promise(done => setTimeout(done, ms));
const log = (event, data = {}) => console.log(JSON.stringify({ event, ...data }));
const statusCode = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
function validTile(url) {
  const match = TILE.exec(url);
  if (!match) return false;
  const z = Number(match[1]), y = Number(match[2]), x = Number(match[3]);
  return Number.isSafeInteger(z) && z >= 6 && z <= 19 && Number.isSafeInteger(x) && Number.isSafeInteger(y) && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;
}

function installPanel(options) {
  const map = window[options.map], osm = window[options.osm];
  if (!map || !osm || !window.L || typeof window.initializeBirdmapBasemap !== 'function') throw Error('Candidate prerequisites unavailable');
  map.setView([36, 127], 8, { animate: false });
  for (const name of ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard']) if (map[name]) map[name].disable();
  const camera = { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
  const sites = window.siteData;
  const siteSnapshot = JSON.stringify(sites);
  const markers = sites.map(site => ({ marker: window[site.markerVar], name: site.markerVar, lat: site.lat, lon: site.lon, present: map.hasLayer(window[site.markerVar]) }));
  window.BIRDMAP_MAP_CONFIG = { vworldKey: '' };
  const api = window.birdmapBasemap = window.initializeBirdmapBasemap(map, osm);
  if (!api) throw Error('Candidate controller unavailable');
  const state = window[options.state] = {
    phase: 'awaiting_key', active: 'osm', reason: 'no_config', loading: false,
    siteCount: sites.length, markerRegistryCount: Object.keys(window.markerRegistry || {}).length,
    markersPreserved: true, cameraPreserved: true, siteDataPreserved: true,
    decoded256Tiles: 0, registeredLocationMatch: location.origin === options.origin && location.pathname === '/birdmap/',
    actualMapUserConfirmed: false, osmControllerFallbackObserved: false
  };
  const emit = value => { if (typeof window[options.binding] === 'function') window[options.binding](JSON.stringify({ token: options.eventToken, event: value })); };
  const panel = document.createElement('section');
  panel.id = 'birdmap-candidate-browser-check';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'birdmap-candidate-check-title');
  panel.style.cssText = 'position:fixed;z-index:2147483647;top:10px;right:10px;width:min(430px,calc(100vw - 20px));background:white;color:#172033;border:3px solid #275e99;border-radius:12px;padding:16px;box-sizing:border-box;font:15px/1.5 system-ui,sans-serif;box-shadow:0 3px 16px #0005;';
  const title = document.createElement('h2');
  title.id = 'birdmap-candidate-check-title';
  title.textContent = options.synthetic ? '후보 지도 합성 검사' : '실제 Pages · 후보 지도 확인';
  title.style.cssText = 'font-size:18px;margin:0 0 8px';
  const explanation = document.createElement('p');
  explanation.textContent = options.synthetic
    ? '로컬 문서와 합성 타일만 사용합니다. 실제 Pages·VWorld 인증 결과가 아닙니다.'
    : '현재 Pages에 검토한 지도 모듈을 임시 적용합니다. 배포하지 않습니다. 고정한 국내 화면에서 타일은 최대 32회만 요청하며 OSM 타일·제보 연결은 차단합니다. 키는 브라우저 메모리와 타일 URL에만 사용됩니다.';
  const form = document.createElement('form'); form.autocomplete = 'off';
  const label = document.createElement('label'); label.textContent = 'VWorld 인증키'; label.htmlFor = 'birdmap-candidate-check-key';
  const input = document.createElement('input');
  input.id = label.htmlFor; input.type = 'password'; input.autocomplete = 'off'; input.maxLength = 512;
  input.spellcheck = false; input.autocapitalize = 'off'; input.setAttribute('data-lpignore', 'true'); input.setAttribute('data-1p-ignore', 'true');
  input.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-height:44px;margin:6px 0 10px;font:inherit';
  const start = document.createElement('button'); start.id = 'birdmap-candidate-check-start'; start.type = 'submit'; start.textContent = '후보 지도 1회 불러오기';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '키 입력을 기다리고 있습니다.';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const yes = document.createElement('button'); yes.id = 'birdmap-candidate-check-yes'; yes.textContent = '실제 지도·마커 확인 완료'; yes.disabled = true;
  const no = document.createElement('button'); no.id = 'birdmap-candidate-check-no'; no.textContent = '정상 표시 확인 안 됨'; no.disabled = true;
  const cancel = document.createElement('button'); cancel.id = 'birdmap-candidate-check-cancel'; cancel.textContent = '종료';
  for (const button of [start, yes, no, cancel]) button.style.cssText = 'min-height:44px;padding:7px 10px;font:inherit';
  let polling, closed = false;
  function refreshEvidence() {
    const current = api.getState(), center = map.getCenter();
    state.active = current.active; state.reason = current.reason; state.loading = current.loading;
    state.siteCount = window.siteData.length;
    state.markerRegistryCount = Object.keys(window.markerRegistry || {}).length;
    state.siteDataPreserved = siteSnapshot === JSON.stringify(window.siteData);
    state.markersPreserved = markers.every(item => {
      const marker = window[item.name], ll = marker && marker.getLatLng && marker.getLatLng();
      return marker === item.marker && !!ll && ll.lat === item.lat && ll.lng === item.lon && map.hasLayer(marker) === item.present;
    });
    state.cameraPreserved = center.lat === camera.lat && center.lng === camera.lng && map.getZoom() === camera.zoom;
    state.decoded256Tiles = [...map.getContainer().querySelectorAll('img.leaflet-tile')].filter(image => image.complete && image.naturalWidth === 256 && image.naturalHeight === 256).length;
    return current;
  }
  function finish(phase) {
    if (closed) return;
    closed = true; clearInterval(polling); refreshEvidence();
    input.value = ''; input.remove(); label.remove(); start.remove();
    state.phase = phase; state.actualMapUserConfirmed = phase === 'map_confirmed';
    yes.disabled = no.disabled = cancel.disabled = true;
    try { api.updateConfig({ vworldKey: '' }); api.destroy(); } catch { /* No exception material is exported. */ }
    status.textContent = '키를 비우고 검사를 종료합니다. 저장되는 결과에는 키와 타일이 포함되지 않습니다.';
    emit(phase);
  }
  yes.addEventListener('click', event => { if (!options.synthetic && !event.isTrusted) return; if (state.phase === 'ready' && !yes.disabled) finish('map_confirmed'); });
  no.addEventListener('click', event => { if (!options.synthetic && !event.isTrusted) return; finish('map_not_confirmed'); });
  cancel.addEventListener('click', () => finish('cancelled'));
  form.addEventListener('submit', event => {
    event.preventDefault(); if (state.phase !== 'awaiting_key') return;
    let key = input.value.trim();
    if (!key || /\s|[\x00-\x1f\x7f]/.test(key)) { input.value = ''; status.textContent = '공백 없는 인증키를 입력해 주세요. 요청은 보내지 않았습니다.'; return; }
    input.value = ''; input.remove(); label.remove(); start.remove(); explanation.remove();
    panel.style.width = 'min(360px,calc(100vw - 20px))';
    title.textContent = '후보 지도 육안 확인';
    status.textContent = '국내 화면을 한 번 불러오고 있습니다. 화면 이동·확대·자동 재시도는 제한합니다.';
    state.phase = 'loading'; emit('started');
    api.setPreference('vworld'); api.updateConfig({ vworldKey: key }); key = '';
    const candidateRoot = document.querySelector('.birdmap-basemap');
    if (candidateRoot) { candidateRoot.style.pointerEvents = 'none'; candidateRoot.setAttribute('inert', ''); }
    const zoomControl = map.getContainer().querySelector('.leaflet-control-zoom');
    if (zoomControl) { zoomControl.style.pointerEvents = 'none'; zoomControl.setAttribute('inert', ''); }
    no.disabled = false;
    polling = setInterval(() => {
      if (closed) return;
      let current;
      try { current = refreshEvidence(); } catch { finish('controller_error'); return; }
      let next = 'loading';
      if (current.active === 'osm' && (current.reason === 'tile_error' || current.reason === 'tile_timeout')) {
        next = 'fallback'; state.osmControllerFallbackObserved = true;
        status.textContent = '후보가 OSM으로 복귀했습니다. 이 검사에서는 OSM 타일도 차단하므로 실제 OSM 표시 성공을 뜻하지 않습니다.';
      } else if (current.reason === 'partial_error') {
        next = 'partial_error'; status.textContent = '일부 타일을 불러오지 못했습니다. 요청 예산 제한과 네트워크 오류도 원인일 수 있습니다.';
      } else if (current.active === 'vworld' && current.reason === 'ready' && !current.loading && state.decoded256Tiles > 0) {
        next = 'ready'; status.textContent = '실제 지도와 229개 탐조지 마커가 정상인지 확인해 주세요. 타일 내용은 자동 판정하지 않습니다.';
      }
      yes.disabled = next !== 'ready' || state.siteCount !== 229 || state.markerRegistryCount !== 229 || !state.markersPreserved || !state.siteDataPreserved || !state.cameraPreserved;
      if (state.phase !== next) { state.phase = next; if (next !== 'loading') emit(next); }
    }, 200);
  });
  form.append(label, input, start); actions.append(yes, no, cancel); panel.append(title, explanation, form, status, actions);
  document.documentElement.append(panel); input.focus();
}

class CDP {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map(); this.handlers = [];
    socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const p = this.pending.get(message.id); if (!p) return;
        this.pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(Error('Browser command failed')) : p.resolve(message.result);
      } else for (const handler of this.handlers) Promise.resolve(handler(message)).catch(() => {});
    });
    socket.addEventListener('close', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('Browser disconnected')); } this.pending.clear(); });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Browser command timeout')); }, 10000);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(Error('Browser disconnected')); }
    });
  }
  async evaluate(expression, sessionId) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw Error('Browser evaluation failed'); return result.result.value;
  }
}

function syntheticPng() {
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
  function chunk(type, body) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(body.length); crc.writeUInt32BE(crc32(Buffer.concat([name, body]))); return Buffer.concat([length, name, body, crc]); }
  const header = Buffer.alloc(13); header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const at = y * (1 + 256 * 4) + 1 + x * 4; rows[at] = 90; rows[at + 1] = 160; rows[at + 2] = 210; rows[at + 3] = 255; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const startedAt = new Date().toISOString(), texts = {}, sourceSha256 = {};
  const eventToken = randomBytes(16).toString('hex');
  for (const file of ['index.html', 'assets/birdmap-basemap.js', 'assets/birdmap-basemap-init.js', 'assets/birdmap-basemap.css', 'docs/vworld-candidate/pages-candidate-check.mjs']) {
    const bytes = readFileSync(join(ROOT, file)); sourceSha256[file] = createHash('sha256').update(bytes).digest('hex'); texts[file] = bytes.toString('utf8');
  }
  const counters = { realVworldRequestsContinued: 0, syntheticVworldResponses: 0, budgetBlocked: 0, invalidTileBlocked: 0, redirectBlocked: 0, nonGetBlocked: 0, workerBlocked: 0, osmBlocked: 0, otherBlocked: 0 };
  const evidence = { genuinePagesDocumentReceived: false, documentHttpStatus: null, registeredLocationMatch: false, candidateModulesInjected: false, readyObserved: false, partialErrorObserved: false, osmControllerFallbackObserved: false, actualMapUserConfirmed: false, siteCount: 0, markerRegistryCount: 0, markersPreserved: false, siteDataPreserved: false, cameraPreserved: false, decoded256Tiles: 0, active: 'unobserved', reason: 'unobserved', loading: false, tileHttpStatuses: {}, reportedPngResponses: 0, referrerOrigin: 'not_observed', pngSignatureVerified: false, domainRestrictionVerified: false, candidateDeployed: false, osmTileDisplayVerified: false };
  let server, child, profile, socket, browser, sessionId, frameId, ttl, completed = false, phase = 'initializing', selfTestChecks;
  let resolveFinished; const finished = new Promise(done => { resolveFinished = done; });
  async function snapshot() {
    if (!browser || !sessionId) return;
    const state = await browser.evaluate(`(()=>{
      const s=window[${JSON.stringify(STATE)}];if(!s||typeof s!=='object')return null;
      const count=value=>Number.isInteger(value)&&value>=0&&value<=10000?value:0;
      const active=s.active,reason=s.reason;
      const reasons=['no_config','loading','ready','partial_error','tile_error','tile_timeout','user_osm','preparing','zoom_out','outside_view'];
      return {
        registeredLocationMatch:s.registeredLocationMatch===true,markersPreserved:s.markersPreserved===true,
        siteDataPreserved:s.siteDataPreserved===true,cameraPreserved:s.cameraPreserved===true,
        osmControllerFallbackObserved:s.osmControllerFallbackObserved===true,
        siteCount:count(s.siteCount),markerRegistryCount:count(s.markerRegistryCount),decoded256Tiles:count(s.decoded256Tiles),
        active:active==='osm'||active==='vworld'?active:'other',reason:reasons.includes(reason)?reason:'other',loading:s.loading===true
      };
    })()`, sessionId).catch(() => null);
    if (!state) return;
    for (const name of ['registeredLocationMatch', 'markersPreserved', 'siteDataPreserved', 'cameraPreserved', 'osmControllerFallbackObserved']) evidence[name] = state[name] === true;
    for (const name of ['siteCount', 'markerRegistryCount', 'decoded256Tiles']) evidence[name] = Number.isInteger(state[name]) && state[name] >= 0 && state[name] <= 10000 ? state[name] : 0;
    evidence.active = state.active === 'osm' || state.active === 'vworld' ? state.active : 'other';
    const reasons = new Set(['no_config', 'loading', 'ready', 'partial_error', 'tile_error', 'tile_timeout', 'user_osm', 'preparing', 'zoom_out', 'outside_view']);
    evidence.reason = reasons.has(state.reason) ? state.reason : 'other'; evidence.loading = state.loading === true;
  }
  async function finish(status) {
    if (completed) return; completed = true; clearTimeout(ttl);
    // The self-test preserves the main positive-case snapshot before replacing
    // its panel for the separate untrusted-click regression.
    if (!SELF_TEST || !selfTestChecks) await snapshot();
    let cleanup = 'complete';
    try {
      if (browser && socket?.readyState === WebSocket.OPEN) await browser.send('Browser.close').catch(() => {});
      if (child && child.exitCode === null) { await Promise.race([new Promise(done => child.once('exit', done)), delay(1500)]); if (child.exitCode === null) { child.kill(); await delay(500); } }
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
      if (server) await new Promise(done => server.close(done));
      if (profile) { const absolute = resolve(profile), base = resolve(tmpdir()); if (dirname(absolute) !== base || !absolute.startsWith(base + sep) || !basename(absolute).startsWith('birdmap-pages-candidate-')) throw Error('Unsafe profile cleanup target'); rmSync(absolute, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); }
    } catch { cleanup = 'incomplete'; }
    const result = { schema: 'birdmap-genuine-pages-candidate-v1', mode: SELF_TEST ? 'synthetic_self_test' : 'actual_pages_in_memory_candidate', startedAt, finishedAt: new Date().toISOString(), status, cleanup, requestBudget: BUDGET, sourceSha256, counters, evidence, ...(selfTestChecks ? { selfTestChecks } : {}), scope: SELF_TEST ? 'Tracked candidate HTML served locally; CDN dependencies allowed; VWorld responses synthetic only. No actual Pages, actual API, human imagery confirmation, or deployment.' : 'Genuine Pages main document plus exact reviewed CSS/module/init in browser memory. Masked input; fixed domestic viewport; up to32 valid Base tiles; request headers unchanged. Workers, OSM tiles, non-GET, redirects and unapproved requests blocked. No HAR, tile files, screenshots, raw errors, PNG byte inspection or negative-domain control. OSM fallback evidence describes controller state only.' };
    try { mkdirSync(dirname(OUTPUT), { recursive: true }); writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n'); } catch { log('result_write_failed'); }
    log('finished', { status, cleanup, counters, evidence, ...(selfTestChecks ? { selfTestChecks } : {}) }); process.exitCode = status === 'map_confirmed' || status === 'self_test_passed' ? 0 : 1; resolveFinished(result);
  }
  const stop = () => { void finish('cancelled'); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    let pageUrl = PAGE, localOrigin = '';
    if (SELF_TEST) {
      server = createServer((request, response) => {
        let path; try { path = new URL(request.url, 'http://localhost').pathname; } catch { response.writeHead(400); response.end(); return; }
        const relative = path === '/' ? 'index.html' : path.slice(1);
        if (request.method !== 'GET' || !FILES.has(relative)) { response.writeHead(403); response.end(); return; }
        const body = relative === 'assets/map-runtime-config.js' ? 'window.BIRDMAP_MAP_CONFIG={vworldKey:""};' : readFileSync(join(ROOT, relative));
        const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
        response.writeHead(200, { 'Content-Type': mime[extname(relative)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body);
      });
      await new Promise(done => server.listen(0, '127.0.0.1', done)); localOrigin = 'http://127.0.0.1:' + server.address().port; pageUrl = localOrigin + '/';
    }
    const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
    if (!chrome) throw Error('Chrome unavailable'); profile = mkdtempSync(join(tmpdir(), 'birdmap-pages-candidate-'));
    child = spawn(chrome, ['--remote-debugging-port=0', '--user-data-dir=' + profile, '--incognito', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-logging', '--log-level=3', '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter', '--disk-cache-size=1', '--media-cache-size=1', '--window-size=1000,800', ...(SELF_TEST ? ['--headless=new'] : []), 'about:blank'], { windowsHide: SELF_TEST, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((done, reject) => {
      let tail = ''; const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 30000);
      const read = data => { tail = (tail + data.toString()).slice(-4096); const match = tail.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[A-Za-z0-9-]+/); if (match) { clearTimeout(timer); tail = ''; child.stderr.removeListener('data', read); child.stderr.resume(); done(match[0]); } };
      child.stderr.on('data', read); child.once('error', () => { clearTimeout(timer); reject(Error('Chrome launch failed')); }); child.once('exit', () => { clearTimeout(timer); reject(Error('Chrome closed')); });
    });
    socket = new WebSocket(endpoint); await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', () => reject(Error('Browser connection failed')), { once: true }); });
    browser = new CDP(socket); const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' }); ({ sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true }));
    socket.addEventListener('close', () => { if (!completed) void finish('browser_closed'); });
    await browser.send('Page.enable', {}, sessionId); await browser.send('Runtime.enable', {}, sessionId); await browser.send('Network.enable', {}, sessionId);
    await browser.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId); await browser.send('Network.setBypassServiceWorker', { bypass: true }, sessionId); await browser.send('Runtime.addBinding', { name: BINDING }, sessionId);
    const png = SELF_TEST ? syntheticPng().toString('base64') : '';
    browser.handlers.push(async message => {
      if (message.sessionId !== sessionId || completed) return;
      if (message.method === 'Runtime.bindingCalled' && message.params.name === BINDING) {
        let received;
        try { received = JSON.parse(message.params.payload); } catch { return; }
        if (!received || received.token !== eventToken || !EVENTS.has(received.event)) return;
        const event = received.event;
        if (event === 'started' && phase === 'awaiting_key') { phase = 'loading'; log('request_started', { status: 'candidate_loading', maximumTileRequests: BUDGET }); }
        else if (event === 'ready' && ['loading', 'ready', 'partial_error'].includes(phase) && counters.realVworldRequestsContinued + counters.syntheticVworldResponses > 0) { phase = 'ready'; evidence.readyObserved = true; await snapshot(); log('candidate_ready', { status: 'awaiting_visual_confirmation', siteCount: evidence.siteCount, markerRegistryCount: evidence.markerRegistryCount, decoded256Tiles: evidence.decoded256Tiles, markersPreserved: evidence.markersPreserved, cameraPreserved: evidence.cameraPreserved }); }
        else if (event === 'partial_error' && ['loading', 'ready', 'partial_error'].includes(phase)) { phase = 'partial_error'; evidence.partialErrorObserved = true; await snapshot(); log('candidate_partial_error', { status: 'not_authentication_diagnosis' }); }
        else if (event === 'fallback' && ['loading', 'ready', 'partial_error'].includes(phase)) { phase = 'fallback'; evidence.osmControllerFallbackObserved = true; await snapshot(); log('candidate_fallback', { status: 'osm_controller_state_only' }); }
        else if (event === 'map_confirmed' && phase === 'ready' && !SELF_TEST) {
          await snapshot();
          const verified = evidence.genuinePagesDocumentReceived && evidence.registeredLocationMatch && evidence.candidateModulesInjected
            && counters.realVworldRequestsContinued > 0 && counters.realVworldRequestsContinued <= BUDGET
            && (evidence.tileHttpStatuses[200] || 0) > 0 && evidence.reportedPngResponses > 0 && evidence.referrerOrigin === ORIGIN
            && evidence.siteCount === 229 && evidence.markerRegistryCount === 229 && evidence.markersPreserved
            && evidence.siteDataPreserved && evidence.cameraPreserved && evidence.decoded256Tiles > 0
            && evidence.active === 'vworld' && evidence.reason === 'ready' && !evidence.loading;
          evidence.actualMapUserConfirmed = verified;
          await finish(verified ? 'map_confirmed' : 'confirmation_prerequisites_failed');
        }
        else if (event === 'map_not_confirmed' || event === 'cancelled' || event === 'controller_error') await finish(event);
      }
      if (message.method === 'Network.responseReceived') {
        const r = message.params.response;
        if (r.url === PAGE && message.params.type === 'Document') { evidence.documentHttpStatus = statusCode(r.status); evidence.genuinePagesDocumentReceived = !SELF_TEST && r.status === 200; }
        if (validTile(r.url)) { const code = statusCode(r.status); if (code !== null) evidence.tileHttpStatuses[code] = (evidence.tileHttpStatuses[code] || 0) + 1; if (r.mimeType === 'image/png') evidence.reportedPngResponses++; }
      }
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request, resourceType, frameId: requestFrameId, redirectedRequestId } = message.params;
      const fail = () => browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {});
      let url; try { url = new URL(request.url); } catch { counters.otherBlocked++; await fail(); return; }
      if (request.method !== 'GET') { counters.nonGetBlocked++; await fail(); return; }
      if (url.hostname === 'workers.dev' || url.hostname.endsWith('.workers.dev')) { counters.workerBlocked++; await fail(); return; }
      if (url.hostname === 'api.vworld.kr') {
        if (redirectedRequestId) { counters.redirectBlocked++; await fail(); return; }
        if (!validTile(request.url) || requestFrameId !== frameId || resourceType !== 'Image' || !['loading', 'ready', 'partial_error'].includes(phase)) { counters.invalidTileBlocked++; await fail(); return; }
        if (counters.realVworldRequestsContinued + counters.syntheticVworldResponses >= BUDGET) { counters.budgetBlocked++; await fail(); return; }
        const refererName = Object.keys(request.headers).find(name => name.toLowerCase() === 'referer');
        if (!refererName) evidence.referrerOrigin = 'absent';
        else { try { const origin = new URL(request.headers[refererName]).origin; evidence.referrerOrigin = origin === ORIGIN ? ORIGIN : SELF_TEST && origin === localOrigin ? 'synthetic_local_origin' : 'other'; } catch { evidence.referrerOrigin = 'invalid'; } }
        if (SELF_TEST) { counters.syntheticVworldResponses++; await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }, { name: 'Cache-Control', value: 'no-store' }], body: png }, sessionId); }
        else { counters.realVworldRequestsContinued++; await browser.send('Fetch.continueRequest', { requestId }, sessionId); }
        return;
      }
      if (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname)) { counters.osmBlocked++; await fail(); return; }
      const fixture = SELF_TEST && url.origin === localOrigin && FILES.has(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      const pages = !SELF_TEST && url.origin === ORIGIN && url.pathname.startsWith('/birdmap/') && FILES.has(url.pathname === '/birdmap/' ? 'index.html' : url.pathname.slice('/birdmap/'.length));
      const cdn = url.protocol === 'https:' && CDN.has(url.hostname);
      if (phase === 'initializing' && !redirectedRequestId && ((!url.search && (fixture || pages)) || cdn)) await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      else { counters.otherBlocked++; await fail(); }
    });
    await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
    ({ frameId } = await browser.send('Page.navigate', { url: pageUrl }, sessionId));
    const deadline = Date.now() + 60000; let ready = false;
    while (!completed && Date.now() < deadline) {
      ready = await browser.evaluate(`location.href===${JSON.stringify(pageUrl)}&&typeof L!=='undefined'&&typeof ${MAP}!=='undefined'&&typeof ${OSM}!=='undefined'&&typeof siteData!=='undefined'&&siteData.length===229&&typeof markerRegistry!=='undefined'&&Object.keys(markerRegistry).length===229`, sessionId).catch(() => false);
      if (ready) break; await delay(200);
    }
    if (!ready || !SELF_TEST && !evidence.genuinePagesDocumentReceived) throw Error('Product prerequisites unavailable');
    await browser.evaluate(`if(window.birdmapBasemap&&typeof window.birdmapBasemap.destroy==='function')window.birdmapBasemap.destroy();void 0`, sessionId);
    await browser.evaluate(texts['assets/birdmap-basemap.js'] + '\n' + texts['assets/birdmap-basemap-init.js'] + '\nvoid 0', sessionId);
    await browser.evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(texts['assets/birdmap-basemap.css'])};document.head.append(style);})();void 0`, sessionId);
    const panelOptions = { map: MAP, osm: OSM, state: STATE, binding: BINDING, origin: ORIGIN, synthetic: SELF_TEST, eventToken };
    await browser.evaluate(`(${installPanel.toString()})(${JSON.stringify(panelOptions)});void 0`, sessionId);
    phase = 'awaiting_key'; evidence.candidateModulesInjected = true; await snapshot(); ttl = setTimeout(() => { void finish('expired'); }, TTL_MS);
    log('harness_ready', { status: 'awaiting_key', mode: SELF_TEST ? 'synthetic_self_test' : 'actual_pages_in_memory_candidate', genuinePagesDocumentReceived: evidence.genuinePagesDocumentReceived, registeredLocationMatch: evidence.registeredLocationMatch, siteCount: evidence.siteCount, markerRegistryCount: evidence.markerRegistryCount, maximumTileRequests: BUDGET, expiresAfterSeconds: TTL_MS / 1000 });
    if (SELF_TEST) {
      await browser.evaluate(`window[${JSON.stringify(BINDING)}](JSON.stringify({token:'UNTRUSTED_SYNTHETIC_EVENT',event:'started'}));void 0`, sessionId);
      await delay(50);
      const untrustedBindingRejected = phase === 'awaiting_key';
      const emptyInputRejected = await browser.evaluate(`document.getElementById('birdmap-candidate-check-start').click();${STATE}.phase==='awaiting_key'`, sessionId);
      const emptyInputNoRequests = counters.syntheticVworldResponses === 0;
      await browser.evaluate(`document.getElementById('birdmap-candidate-check-key').value='SYNTHETIC_QA_CREDENTIAL_NOT_VALID';document.getElementById('birdmap-candidate-check-start').click();void 0`, sessionId);
      const tileDeadline = Date.now() + 20000; while (phase !== 'ready' && phase !== 'fallback' && !completed && Date.now() < tileDeadline) await delay(100);
      if (phase !== 'ready') throw Error('Synthetic candidate not ready'); await snapshot();
      await browser.evaluate(`(()=>{for(let x=0;x<40;x++){const image=new Image();image.src='https://api.vworld.kr/req/wmts/1.0.0/SYNTHETIC_BUDGET_INPUT/Base/8/99/'+x+'.png';}const invalid=new Image();invalid.src='https://api.vworld.kr/req/wmts/1.0.0/SYNTHETIC_BUDGET_INPUT/Base/20/0/0.png';fetch(location.href,{method:'POST',body:'synthetic'}).catch(()=>{});fetch('https://synthetic-block.workers.dev/check').catch(()=>{});})();void 0`, sessionId);
      await delay(800);
      selfTestChecks = {
        emptyInputRejected: emptyInputRejected === true, emptyInputNoRequests, untrustedBindingRejected,
        candidateReady: evidence.readyObserved, siteAndRegistry229: evidence.siteCount === 229 && evidence.markerRegistryCount === 229,
        markerIdentitiesPreserved: evidence.markersPreserved, siteDataPreserved: evidence.siteDataPreserved, cameraPreserved: evidence.cameraPreserved,
        decoded256Tiles: evidence.decoded256Tiles > 0, budgetStrict32: counters.syntheticVworldResponses === BUDGET && counters.budgetBlocked > 0,
        invalidZoomBlocked: counters.invalidTileBlocked > 0, workerBlocked: counters.workerBlocked > 0, nonGetBlocked: counters.nonGetBlocked > 0,
        noActualApiRequest: counters.realVworldRequestsContinued === 0, noActualPagesProofClaim: !evidence.genuinePagesDocumentReceived && !evidence.registeredLocationMatch,
        noActualVisualConfirmation: !evidence.actualMapUserConfirmed, noDomainRestrictionClaim: !evidence.domainRestrictionVerified
      };
      // An untrusted programmatic click must never become a human confirmation.
      await browser.evaluate(`document.getElementById('birdmap-candidate-browser-check').remove();birdmapBasemap.destroy();void 0`, sessionId);
      const liveOptions = { ...panelOptions, synthetic: false };
      selfTestChecks.untrustedLiveConfirmationRejected = await browser.evaluate(`(${installPanel.toString()})(${JSON.stringify(liveOptions)});${STATE}.phase='ready';document.getElementById('birdmap-candidate-check-yes').disabled=false;document.getElementById('birdmap-candidate-check-no').disabled=false;document.getElementById('birdmap-candidate-check-yes').click();document.getElementById('birdmap-candidate-check-no').click();${STATE}.phase==='ready'&&${STATE}.actualMapUserConfirmed===false`, sessionId) === true;
      await finish(Object.values(selfTestChecks).every(value => value === true) ? 'self_test_passed' : 'self_test_failed');
    }
    await finished;
  } catch { await finish('harness_error'); }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}

await main().catch(() => { log('finished', { status: 'harness_error', detailsSuppressed: true }); process.exitCode = 1; });
