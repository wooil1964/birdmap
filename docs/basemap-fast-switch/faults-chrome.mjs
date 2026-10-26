// Fast switching and tile faults in real Chrome against a LOCAL index.html. The Worker config is injected and every
// tile request is answered by CDP (no network, no credential): normal, sporadic errors, a rate-limit storm (429), an
// outage (502), slow tiles, a hang; also zooming out to 4, views at the border and a wheel burst. Reports, per scenario,
// the controller outcome and how many tiles were requested.
//   CHROME_PATH=... node docs/basemap-fast-switch/faults-chrome.mjs [repo=.] [result=.ci-results/basemap-faults/result.json] [label]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const [repo = '.', resultPath = '.ci-results/basemap-faults/result.json', runLabel = 'ci'] = process.argv.slice(2);
const PAGE = pathToFileURL(join(resolve(repo), 'index.html')).href;
const ENDPOINT = 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles';
const CONFIG = `window.BIRDMAP_MAP_CONFIG = { vworldMode: 'worker', vworldTileEndpoint: '${ENDPOINT}' };`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 2;
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(256 * 769, 90))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64').toString('base64');

class Browser {
  static async launch() {
    const profile = mkdtempSync(join(tmpdir(), 'birdmap-faults-'));
    const proc = spawn(process.env.CHROME_PATH, ['--headless=new', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const ws = await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('NO_DEVTOOLS')), 30000); proc.stderr.on('data', d => { stderr += d; const m = stderr.match(/ws:\/\/\S+/); if (m) { clearTimeout(t); resolve(m[0]); } }); });
    const socket = new WebSocket(ws); await new Promise(r => socket.addEventListener('open', r));
    return new Browser(proc, socket, profile);
  }
  constructor(proc, socket, profile) {
    Object.assign(this, { proc, socket, profile, seq: 0, pending: new Map(), listeners: [] });
    socket.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } else if (m.method) for (const l of this.listeners) l(m); });
  }
  send(method, params = {}, sessionId) { const id = ++this.seq; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
  async open({ width, height, mobile, answer, touch = false }) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const log = [];
    const listener = async m => {
      if (m.sessionId !== sessionId || m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params, i = log.length, t = Date.now();
      log.push({ url: request.url, t });
      const a = answer(request.url, i, log);
      const reply = () => a.status === 200
        ? this.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: request.url.endsWith('.jpeg') ? 'image/jpeg' : 'image/png' }], body: request.url.endsWith('.jpeg') ? JPEG : PNG }, sessionId).catch(() => {})
        : this.send('Fetch.fulfillRequest', { requestId, responseCode: a.status, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: Buffer.from('x').toString('base64') }, sessionId).catch(() => {});
      if (a.hang) return;
      if (a.network) return this.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }, sessionId).catch(() => {});
      if (a.delay) setTimeout(reply, a.delay); else reply();
    };
    this.listeners.push(listener);
    await this.send('Page.enable', {}, sessionId); await this.send('Runtime.enable', {}, sessionId);
    await this.send('Fetch.enable', { patterns: [{ urlPattern: ENDPOINT + '/*', requestStage: 'Request' }] }, sessionId);
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    if (touch) await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: CONFIG + "try{localStorage.removeItem('birdmap.basemap.preference')}catch(e){}" }, sessionId);
    const evaluate = async expression => { const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (exceptionDetails) throw Error(exceptionDetails.text); return result.value; };
    await this.send('Page.navigate', { url: PAGE }, sessionId);
    for (let i = 0; i < 100 && !(await evaluate("typeof birdmapBasemap!=='undefined'&&!!birdmapBasemap").catch(() => false)); i++) await sleep(200);
    return { sessionId, evaluate, log, close: async () => { this.listeners = this.listeners.filter(l => l !== listener); await this.send('Target.closeTarget', { targetId }); } };
  }
  dispose() { try { this.socket.close(); } catch {} this.proc.kill(); try { rmSync(this.profile, { recursive: true, force: true }); } catch {} }
}

const ST = "(function(){var g=birdmapBasemap.getState();return {active:g.active,preference:g.preference,reason:g.reason,locked:g.locked,overlay:g.overlay,errors:g.errors,backdrop:g.backdrop,zoom:g.zoom};})()";
const MAP = "(function(){for(var k in window){try{if(/^map_[0-9a-f]{32}$/.test(k)&&window[k] instanceof L.Map)return window[k];}catch(e){}}})()";
const click = (p, l) => p.evaluate(`document.querySelector('.birdmap-basemap__choice[aria-label="${l}"]').click()`);
const zoomBy = (p, d) => p.evaluate(`(function(){var m=${MAP};m.setZoom(m.getZoom()+${d});return 1;})()`);
const panBy = (p, x, y) => p.evaluate(`(function(){var m=${MAP};m.panBy([${x},${y}]);return 1;})()`);
const L_BASE = '브이월드 일반지도 선택', L_SAT = '브이월드 위성영상 선택', L_HYB = '브이월드 하이브리드 선택', L_OSM = 'OSM 지도 선택';
// Settled: the selection is applied (not the 250 ms pause after a tap) and its batch finished, or OSM.
const applied = s => s.active === 'osm' || ((s.reason === 'ready' || s.reason === 'partial_error') && (s.active === s.preference || (s.preference === 'hybrid' && s.active === 'satellite' && s.overlay === 'failed')));
const waitState = async (p, pred, ms) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await p.evaluate(ST); if (pred(s)) return s; await sleep(150); } return s; };
// Start close in (zoom 11, central Korea) so pans stay inside the domestic view.
const start = p => p.evaluate(`(function(){var m=${MAP};m.setView([36.3,127.6],11,{animate:false});return 1;})()`);
// Fast zoom: real wheel steps on PC, pinch-like zoom around points on mobile (both stay inside the domestic view).
const wheelZoom = async (b, p, steps, gap) => { for (let i = 0; i < steps; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 560 + (i % 3) * 110, y: 330 + (i % 2) * 90, deltaX: 0, deltaY: i % 6 < 3 ? -120 : 120 }, p.sessionId); await sleep(gap); } };
const pinchZoom = async (p, steps, gap) => { for (let i = 0; i < steps; i++) { const dz = [0.7, -0.6, 0.9, -0.8, 0.5, -0.7][i % 6]; await p.evaluate(`(function(){var m=${MAP};m.setZoomAround(L.point(${[120, 260, 195, 220][i % 4]},${[320, 480, 560, 400][i % 4]}),m.getZoom()+${dz});return 1;})()`); await sleep(gap); } };
const fastZoom = (b, p, label) => label === 'pc' ? wheelZoom(b, p, 24, 140) : pinchZoom(p, 20, 180);
const setView = (p, lat, lng, z) => p.evaluate(`(function(){var m=${MAP};m.setView([${lat},${lng}],${z},{animate:false});return 1;})()`);
// Zoom levels of the tile requests in a log slice.
const levels = log => [...new Set(log.map(x => +(/\/tiles\/(?:satellite\/|hybrid\/)?(\d+)\//.exec(x.url) || [])[1]))].sort((a, b) => a - b);
const rapid = async (p, taps, gap) => { const seq = [L_SAT, L_HYB, L_BASE, L_SAT, L_BASE, L_HYB]; for (let i = 0; i < taps; i++) { await click(p, seq[i % seq.length]); if (i % 4 === 1) await zoomBy(p, i % 8 === 1 ? 1 : -1); if (i % 4 === 3) await panBy(p, 120, -80); await sleep(gap); } };

const SCENARIOS = [
  { name: 'rapid_normal', note: '12 taps at 200 ms with zoom/pan, every tile fine', answer: () => ({ status: 200, delay: 80 }),
    run: async p => { await rapid(p, 12, 200); return waitState(p, applied, 15000); },
    expect: s => s.active !== 'osm' && s.active === s.preference },
  { name: 'sporadic_long_session', note: 'every 9th tile fails; 24 taps at 450 ms with zoom/pan (no outage: ~89% of tiles fine)', answer: (u, i) => ({ status: i % 9 === 8 ? 500 : 200, delay: 60 }),
    run: async p => { await rapid(p, 24, 450); return waitState(p, applied, 15000); },
    expect: s => s.active !== 'osm' },
  { name: 'slow_tiles_continuous_pan', note: 'every tile answers after 1.6 s; the user pans every 350 ms for 16 s', answer: () => ({ status: 200, delay: 1600 }),
    run: async p => { await click(p, L_SAT); await sleep(300); for (let i = 0; i < 46; i++) { await panBy(p, i % 2 ? -150 : 160, i % 3 ? 60 : -70); await sleep(350); } return waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); },
    expect: s => s.active !== 'osm' },
  { name: 'cold_tiles_continuous_zoom_pan', note: 'every tile answers after 3 s (cold start); the user zooms and pans every 250 ms for 20 s', answer: () => ({ status: 200, delay: 3000 }),
    run: async p => { await click(p, L_BASE); for (let i = 0; i < 80; i++) { if (i % 10 === 5) await zoomBy(p, i % 20 === 5 ? 1 : -1); else await panBy(p, i % 2 ? -170 : 180, i % 3 ? 70 : -80); await sleep(250); } return waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); },
    expect: s => s.active !== 'osm' },
  { name: 'fast_zoom_normal', note: 'fast wheel (PC) or pinch (mobile) zooming inside the domestic view, every tile fine', answer: () => ({ status: 200, delay: 80 }),
    run: async (p, b, label) => { await fastZoom(b, p, label); return waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); },
    expect: s => s.active === 'vworld' && s.reason === 'ready' },
  { name: 'fast_zoom_per_ip_limit', note: 'the Worker per-IP limit (180 tiles per 60 s, 429 beyond it) during fast zooming: VWorld, or OSM with no further request until the one automatic attempt', answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 60000).length > 180 ? 429 : 200, delay: 80 }),
    run: async (p, b, label) => { await fastZoom(b, p, label); const s = await waitState(p, s => s.reason === 'ready' || s.reason === 'partial_error' || s.active === 'osm', 15000); s.requestsInWindow = p.log.filter(x => Date.now() - x.t < 60000).length;
      const n = p.log.length; await panBy(p, 150, 0); await zoomBy(p, 1); await sleep(2500); s.requestsAfter = p.log.length - n; return s; },
    expect: s => s.active !== 'osm' || (s.reason === 'tile_error' && s.requestsAfter === 0) },
  { name: 'limit_window_then_recovery', only: 'pc', note: '429 for every tile during the first 20 s, fine afterwards: OSM, then one automatic attempt after 60 s brings VWorld back', answer: (u, i, log) => ({ status: Date.now() - log[0].t < 20000 ? 429 : 200, delay: 60 }),
    run: async p => { await p.evaluate(`(function(){var m=${MAP};m.setView([35.2,128.9],10,{animate:false});return 1;})()`); const o = await waitState(p, s => s.active === 'osm', 15000);
      const t0 = Date.now(); const s = await waitState(p, s => s.active === 'vworld' && s.reason === 'ready', 75000); s.fellBackTo = o.active + '/' + o.reason; s.recoveredAfterMs = Date.now() - t0; return s; },
    expect: s => s.fellBackTo === 'osm/tile_error' && s.active === 'vworld' && s.reason === 'ready' && !s.locked },
  { name: 'internet_down', note: 'every tile fails at the network level (connection lost): OSM; panning/zooming sends nothing; another type is tried with one batch and locked too', answer: () => ({ network: true }),
    run: async p => { const s = await waitState(p, s => s.active === 'osm', 15000); let n = p.log.length; await panBy(p, 180, 0); await zoomBy(p, 1); await sleep(2000); s.afterFallbackPanZoom = p.log.length - n;
      n = p.log.length; await click(p, L_SAT); await waitState(p, s => s.active === 'osm' && s.preference === 'satellite' && s.locked, 15000); s.otherTypeBatch = p.log.length - n;
      n = p.log.length; await panBy(p, -160, 0); await zoomBy(p, -1); await click(p, L_SAT); await sleep(2000); const f = await p.evaluate(ST); return { ...f, afterFallbackPanZoom: s.afterFallbackPanZoom, otherTypeBatch: s.otherTypeBatch, afterSecondLock: p.log.length - n }; },
    expect: s => s.active === 'osm' && s.locked && s.afterFallbackPanZoom === 0 && s.otherTypeBatch > 0 && s.otherTypeBatch <= 60 && s.afterSecondLock === 0 },
  { name: 'slow_lte', note: 'every tile 1.2-2.4 s (slow LTE) while switching types and zooming', answer: (u, i) => ({ status: 200, delay: 1200 + (i % 7) * 200 }),
    run: async (p, b, label) => { await rapid(p, 8, 400); await fastZoom(b, p, label); return waitState(p, applied, 25000); },
    expect: s => s.active !== 'osm' },
  { name: 'outage_one_recovery_only', only: 'pc', note: 'a lasting outage (502): OSM, exactly one automatic attempt after 60 s, then OSM with no further request', answer: () => ({ status: 502, delay: 60 }),
    run: async p => { const o = await waitState(p, s => s.active === 'osm', 15000); const n0 = p.log.length; await sleep(64000); const s = await waitState(p, s => s.active === 'osm', 10000);
      const n1 = p.log.length; await panBy(p, 160, 0); await zoomBy(p, 1); await sleep(3000); s.attemptRequests = n1 - n0; s.requestsAfterSecondFailure = p.log.length - n1; s.firstFallback = o.reason; return s; },
    expect: s => s.firstFallback === 'tile_error' && s.active === 'osm' && s.locked && s.attemptRequests > 0 && s.attemptRequests <= 60 && s.requestsAfterSecondFailure === 0 },
  { name: 'user_osm_during_recovery_wait', only: 'pc', note: 'after a 429 lock the user chooses OSM: the automatic attempt 60 s later does not switch back to VWorld', answer: (u, i, log) => ({ status: Date.now() - log[0].t < 20000 ? 429 : 200, delay: 60 }),
    run: async p => { await waitState(p, s => s.active === 'osm', 15000); await click(p, L_OSM); const n = p.log.length; await sleep(64000); const s = await p.evaluate(ST); s.requestsDuringWait = p.log.length - n; return s; },
    expect: s => s.active === 'osm' && s.preference === 'osm' && s.requestsDuringWait === 0 },
  { name: 'rate_limit_storm', note: 'Worker limiter: after 40 tiles in 10 s every tile gets 429; 12 taps at 200 ms', answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 10000).length > 40 ? 429 : 200, delay: 60 }),
    run: async p => { await rapid(p, 12, 200); const s = await waitState(p, applied, 15000);
      const n = p.log.length; await panBy(p, 200, 0); await zoomBy(p, 1); await sleep(2500); s.requestsAfterSettlePan = p.log.length - n; return s; },
    expect: s => s.active === 'osm' ? s.requestsAfterSettlePan === 0 : true },
  { name: 'outage_502', note: 'every tile 502 (real outage)', answer: () => ({ status: 502, delay: 60 }),
    run: async p => { const s = await waitState(p, s => s.active === 'osm', 15000); const n = p.log.length; await panBy(p, 200, 0); await click(p, L_BASE); await sleep(2000); s.requestsAfterFallback = p.log.length - n; return s; },
    expect: s => s.active === 'osm' && s.reason === 'tile_error' && s.locked && s.requestsAfterFallback === 0 },
  { name: 'hang', note: 'tiles never answer', answer: () => ({ hang: true }),
    run: async p => { const t0 = Date.now(); const s = await waitState(p, s => s.active === 'osm', 20000); s.ms = Date.now() - t0; return s; },
    expect: s => s.active === 'osm' && s.reason === 'tile_timeout' && s.locked },
  { name: 'overlay_outage_only', note: 'Hybrid overlay tiles 502, imagery fine', answer: u => ({ status: u.includes('/hybrid/') ? 502 : 200, delay: 60 }),
    run: async p => { await click(p, L_HYB); return waitState(p, s => s.overlay === 'failed', 15000); },
    expect: s => s.active === 'satellite' && s.preference === 'hybrid' && s.overlay === 'failed' },
  { name: 'osm_then_back', note: 'OSM chosen in the middle of rapid taps, then Base', answer: () => ({ status: 200, delay: 60 }),
    run: async p => { await click(p, L_SAT); await sleep(150); await click(p, L_OSM); await sleep(150); const o = await p.evaluate(ST); await click(p, L_BASE); const s = await waitState(p, s => s.reason === 'ready', 10000); s.osmWas = o.active; return s; },
    expect: s => s.osmWas === 'osm' && s.active === 'vworld' && s.reason === 'ready' },
  { name: 'zoom_out_to_4_and_back', note: 'zoom 5 and 4: VWorld stays with z6 tiles drawn smaller (no z4/z5 request) and OSM only around Korea; back at 8 OSM is removed', answer: () => ({ status: 200, delay: 60 }),
    run: async p => { const n = p.log.length, out = {};
      for (const z of [5, 4, 8]) { await setView(p, 36.3, 127.6, z); await sleep(300); const s = await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); out['z' + z] = s.active + '/' + s.reason + (s.backdrop ? '+osm' : ''); }
      return { ...out, levels: levels(p.log.slice(n)) }; },
    expect: s => s.z5 === 'vworld/ready+osm' && s.z4 === 'vworld/ready+osm' && s.z8 === 'vworld/ready' && s.levels[0] >= 6 },
  { name: 'border_views', note: 'centre just beyond the border (west of 백령도, south of 마라도): VWorld with OSM beyond the border; no domestic area in view (Shanghai): OSM; back inside: VWorld', answer: () => ({ status: 200, delay: 60 }),
    run: async p => { const out = {};
      for (const [k, lat, lng, z, done] of [['baengnyeong', 37.97, 124.45, 11, s => s.reason === 'ready'], ['marado', 32.85, 126.27, 11, s => s.reason === 'ready'], ['shanghai', 31.2, 121.5, 10, s => s.active === 'osm'], ['inside', 36.3, 127.6, 11, s => s.active !== 'osm' && s.reason === 'ready']]) {
        await setView(p, lat, lng, z); await sleep(300); const s = await waitState(p, done, 15000); out[k] = s.active + '/' + s.reason + (s.backdrop ? '+osm' : ''); }
      return out; },
    expect: s => s.baengnyeong === 'vworld/ready+osm' && s.marado === 'vworld/ready+osm' && s.shanghai === 'osm/outside_view' && s.inside === 'vworld/ready' },
  { name: 'wheel_burst_skips_levels', only: 'pc', note: 'a fast wheel burst in from zoom 7: the levels it only passes through are not requested, the level it stops at is', answer: () => ({ status: 200, delay: 60 }),
    run: async (p, b) => { await setView(p, 36.3, 127.6, 7); await waitState(p, s => s.reason === 'ready' && s.zoom === 7, 15000); await sleep(400);
      await p.evaluate(`(function(){var m=${MAP};window.__zoomSteps=0;m.on('zoomanim',function(){window.__zoomSteps++;});return 1;})()`);
      const n = p.log.length;
      for (let i = 0; i < 9; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: -120 }, p.sessionId); await sleep(100); }
      await sleep(800); const s = await waitState(p, s => s.reason === 'ready', 15000);
      return { ...s, steps: await p.evaluate('window.__zoomSteps'), levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.steps >= 3 && s.levels.length < s.steps && s.levels.includes(Math.round(s.zoom)) }
];


// Layout of the selector at the five checked widths (plus phone landscape): one column, at most 80 px wide, at the left
// edge, overlapping no other control, plain status hidden. (The recent-report box needs live data: checked separately.)
const LAYOUT = `(function(){function r(el){if(!el)return null;var b=el.getBoundingClientRect(),cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||!b.width||!b.height)return null;return {x:b.left,y:b.top,w:b.width,h:b.height};}
  function hit(a,b){return a&&b&&Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.5;}
  var box=document.querySelector('.birdmap-basemap'),br=r(box),bs=[].map.call(document.querySelectorAll('.birdmap-basemap__choice'),r);
  var others=['#mapTitleBox','#togglePanelBtn','#noticeToggleBtn','#todayToggleBtn','#reportToggleBtn','#recentReportsBox','.leaflet-control-zoom','.leaflet-control-attribution','.leaflet-control-scale'].map(function(s){return [s,r(document.querySelector(s))];}).filter(function(x){return x[1];});
  return {box:br&&{x:Math.round(br.x),y:Math.round(br.y),w:Math.round(br.w),h:Math.round(br.h)},inView:!!br&&br.y>=0&&br.y+br.h<=innerHeight,
    column:bs.length===4&&bs.every(function(b,i){return b&&Math.abs(b.x-bs[0].x)<1&&(i===0||b.y>bs[i-1].y);}),buttonH:bs.map(function(b){return b&&Math.round(b.h);}),
    overlaps:others.filter(function(o){return hit(br,o[1]);}).map(function(o){return o[0];}),statusDrawn:!!r(document.querySelector('.birdmap-basemap__status'))&&document.querySelector('.birdmap-basemap__status').getBoundingClientRect().height>2,
    notice:box&&box.getAttribute('data-notice'),reason:birdmapBasemap.getState().reason};})()`;
const LAYOUT_SIZES = [[320, 568, true], [375, 667, true], [390, 844, true], [768, 1024, true], [1366, 768, false], [640, 360, true]];
const results = [];
const browser = await Browser.launch();
try {
  if (!process.env.FAULTS_ONLY || process.env.FAULTS_ONLY.split(',').includes('layout')) for (const [width, height, touch] of LAYOUT_SIZES) {
    const p = await browser.open({ width, height, mobile: touch, touch, answer: () => ({ status: 200, delay: 40 }) });
    await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); await sleep(600);
    const m = await p.evaluate(LAYOUT);
    const informational = false;
    const ok = m.column && m.box.w <= 80 && m.box.x <= 10 && m.overlaps.length === 0 && m.inView && (m.notice === 'true' || !m.statusDrawn) && m.buttonH.every(h => h >= (touch && height > 480 ? 44 : 32));
    results.push({ size: width + 'x' + height, scenario: 'layout', ok: informational ? undefined : ok, informational, final: m });
    console.log(`${informational ? 'INFO' : ok ? 'PASS' : 'FAIL'} ${width}x${height} layout -> ${JSON.stringify(m)}`);
    await p.close();
  }
  for (const [label, size] of [['pc', { width: 1366, height: 768, mobile: false }], ['mobile', { width: 390, height: 844, mobile: true }]]) {
    for (const sc of SCENARIOS) {
      if (sc.only && sc.only !== label) continue;
      if (process.env.FAULTS_ONLY && !process.env.FAULTS_ONLY.split(',').includes(sc.name)) continue;
      const p = await browser.open({ ...size, answer: sc.answer });
      await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000);
      await start(p); await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000);
      const before = p.log.length;
      const s = await sc.run(p, browser, label);
      const tiles = p.log.length - before;
      const ok = sc.expect(s);
      results.push({ size: label, scenario: sc.name, ok, note: sc.note, tilesRequested: tiles, final: s });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${sc.name} tiles=${tiles} -> ${JSON.stringify(s)}`);
      await p.close();
    }
  }
} catch (error) { results.push({ harness: String(error?.message ?? error) }); console.log('HARNESS', String(error?.message ?? error)); }
finally { browser.dispose(); }
const failed = results.filter(r => r.ok === false || r.harness).length;
mkdirSync(dirname(resultPath), { recursive: true });
writeFileSync(resultPath, JSON.stringify({ schema: 'basemap-faults/v1', label: runLabel, page: PAGE, passed: results.length - failed, failed, results }, null, 2) + '\n');
console.log(JSON.stringify({ label: runLabel, passed: results.length - failed, failed }));
if (failed) process.exitCode = 1;
