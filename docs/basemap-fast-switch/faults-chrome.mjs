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
    // Uncaught page exceptions fail the scenario; console errors are reported.
    const log = [], exceptions = [], consoleErrors = [];
    const listener = async m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push(String(d.exception?.description || d.text).split('\n')[0].slice(0, 160)); return; }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0].slice(0, 160)); return; }
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params, i = log.length, t = Date.now();
      log.push({ url: request.url, t });
      const a = answer(request.url, i, log);
      // no-store as the Worker sends it: without it Chrome reuses tile images already shown and undercounts requests.
      const reply = () => a.status === 200
        ? this.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: request.url.endsWith('.jpeg') ? 'image/jpeg' : 'image/png' }, { name: 'Cache-Control', value: 'no-store' }], body: request.url.endsWith('.jpeg') ? JPEG : PNG }, sessionId).catch(() => {})
        : this.send('Fetch.fulfillRequest', { requestId, responseCode: a.status, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from('x').toString('base64') }, sessionId).catch(() => {});
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
    return { sessionId, evaluate, log, exceptions, consoleErrors, close: async () => { this.listeners = this.listeners.filter(l => l !== listener); await this.send('Target.closeTarget', { targetId }); } };
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
// Wheel flicks on PC (1366x768): one notch each, `gap` ms apart, three in then three out, inside the domestic view.
const flicks = async (b, p, n, gap) => { for (let i = 0; i < n; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 683 + ((i % 3) - 1) * 120, y: 384 + (i % 2 ? 60 : -60), deltaX: 0, deltaY: i % 6 < 3 ? -100 : 100 }, p.sessionId); await sleep(gap); } };
const notch = (b, p, deltaY) => b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 683, y: 384, deltaX: 0, deltaY }, p.sessionId);
// Real two-finger pinches on a touch phone (CDP synthesizes the touch events), in 3 then out 3, `gap` ms apart.
const pinches = async (b, p, n, gap) => { for (let i = 0; i < n; i++) { const t = Date.now(); await b.send('Input.synthesizePinchGesture', { x: 195 + ((i % 3) - 1) * 60, y: 460 + (i % 2 ? 60 : -60), scaleFactor: i % 6 < 3 ? 2 : 0.5, relativeSpeed: 1200, gestureSourceType: 'touch' }, p.sessionId); await sleep(Math.max(0, gap - (Date.now() - t))); } };
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
    // The level the burst stops at loads ZOOM_SETTLE_MS after its last zoom: wait for it before reading the state.
    run: async (p, b, label) => { await fastZoom(b, p, label); await sleep(900); return waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); },
    expect: s => s.active === 'vworld' && s.reason === 'ready' },
  { name: 'fast_zoom_per_ip_limit', note: 'the Worker per-IP limit (180 tiles per 60 s, 429 beyond it) during fast zooming: VWorld, or OSM with no further request until the one automatic attempt', answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 60000).length > 180 ? 429 : 200, delay: 80 }),
    run: async (p, b, label) => { await fastZoom(b, p, label); await sleep(900); const s = await waitState(p, s => s.reason === 'ready' || s.reason === 'partial_error' || s.active === 'osm', 15000); s.requestsInWindow = p.log.filter(x => Date.now() - x.t < 60000).length;
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
  { name: 'outage_recovery_backoff', only: 'pc', note: 'a lasting outage (502): OSM, one automatic attempt after 60 s, then OSM with no further request until the next attempt (120 s later)', answer: () => ({ status: 502, delay: 60 }),
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
  { name: 'zoom_out_to_4_and_back', note: 'zoom 5 and 4: VWorld stays with z6 tiles drawn smaller (no z4/z5 request) and OSM only around Korea; back at 9 (whole view inside) OSM is removed', answer: () => ({ status: 200, delay: 60 }),
    run: async p => { const n = p.log.length, out = {};
      for (const z of [5, 4, 9]) { await setView(p, 36.3, 127.6, z); await sleep(300); const s = await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); out['z' + z] = s.active + '/' + s.reason + (s.backdrop ? '+osm' : ''); }
      return { ...out, levels: levels(p.log.slice(n)) }; },
    expect: s => s.z5 === 'vworld/ready+osm' && s.z4 === 'vworld/ready+osm' && s.z9 === 'vworld/ready' && s.levels[0] >= 6 },
  { name: 'border_views', note: 'centre just beyond the border (west of 백령도, south of 마라도) or the view past it (south of 제주): VWorld with OSM beyond the border; no domestic area in view (Shanghai): OSM; back inside: VWorld', answer: () => ({ status: 200, delay: 60 }),
    run: async p => { const out = {};
      for (const [k, lat, lng, z, done] of [['baengnyeong', 37.97, 124.45, 11, s => s.reason === 'ready'], ['marado', 32.85, 126.27, 11, s => s.reason === 'ready'], ['jeju_south', 33.0, 126.5, 10, s => s.reason === 'ready'], ['shanghai', 31.2, 121.5, 10, s => s.active === 'osm'], ['inside', 36.3, 127.6, 11, s => s.active !== 'osm' && s.reason === 'ready']]) {
        await setView(p, lat, lng, z); await sleep(300); const s = await waitState(p, done, 15000); out[k] = s.active + '/' + s.reason + (s.backdrop ? '+osm' : ''); }
      return out; },
    expect: s => s.baengnyeong === 'vworld/ready+osm' && s.marado === 'vworld/ready+osm' && s.jeju_south === 'vworld/ready+osm' && s.shanghai === 'osm/outside_view' && s.inside === 'vworld/ready' },
  { name: 'wheel_burst_skips_levels', only: 'pc', note: 'a fast wheel burst in from zoom 7: the levels it only passes through are not requested, the level it stops at is', answer: () => ({ status: 200, delay: 60 }),
    run: async (p, b) => { await setView(p, 36.3, 127.6, 7); await waitState(p, s => s.reason === 'ready' && s.zoom === 7, 15000); await sleep(400);
      await p.evaluate(`(function(){var m=${MAP};window.__zoomSteps=0;m.on('zoomanim',function(){window.__zoomSteps++;});return 1;})()`);
      const n = p.log.length;
      for (let i = 0; i < 9; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: -120 }, p.sessionId); await sleep(100); }
      await sleep(800); const s = await waitState(p, s => s.reason === 'ready', 15000);
      // The burst handling overrides Leaflet 1.9.3 internals: a Leaflet upgrade must come with a fresh check.
      const leaflet = await p.evaluate("(function(){var t=L.TileLayer.prototype,m=" + MAP + ";return L.version+'/'+['_animateZoom','_resetView','_onMoveEnd','_setView','_setZoomTransforms','onRemove','_abortLoading','_removeTile','_noTilesToLoad','_pxBoundsToTileRange','_getTiledPixelBounds'].every(function(k){return typeof t[k]==='function';})+'/'+(typeof m._animatingZoom==='boolean');})()");
      return { ...s, steps: await p.evaluate('window.__zoomSteps'), levels: levels(p.log.slice(n)), leaflet }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.steps >= 3 && s.levels.length < s.steps && s.levels.includes(Math.round(s.zoom)) && s.leaflet === '1.9.3/true/true' },
  // Live 10/27: wheel flicks 0.6 s apart were each a lone zoom loading a whole screen (650-700 tiles in 14 s); the
  // Worker answered 429 and the map switched to OSM. Here the per-IP limit is answered strictly.
  { name: 'wheel_flicks_per_ip_limit', only: ['pc', 'wide'], note: 'wheel flicks 0.6 s apart for 12 s against the Worker per-IP limit (180 per 60 s, 429 beyond): the levels passed through are not requested, VWorld stays and the level the map rests at is loaded',
    answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 60000).length > 180 ? 429 : 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; await flicks(b, p, 20, 600); await sleep(900); const s = await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); return { ...s, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.levels.includes(Math.round(s.zoom)) },
  { name: 'single_wheel_zoom_loads_at_once', only: 'pc', note: 'one wheel notch from rest: the new level is requested as the zoom starts (no settle pause), as before',
    answer: () => ({ status: 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length;
      await p.evaluate(`(function(){var m=${MAP};window.__sharp=null;m.eachLayer(function(l){if(l._url&&/workers\\.dev/.test(l._url))l.once('load',function(){window.__sharp=performance.now();});});window.__t0=performance.now();return 1;})()`);
      const t0 = Date.now(); await notch(b, p, -100); const s = await waitState(p, s => s.reason === 'ready' && s.zoom === 12, 10000);
      const first = p.log.slice(n)[0]; return { ...s, firstRequestMs: first ? first.t - t0 : null, sharpMs: Math.round(await p.evaluate('window.__sharp-window.__t0')), levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.zoom === 12 && s.firstRequestMs !== null && s.firstRequestMs < 250 && s.levels.join() === '12' },
  { name: 'wheel_right_after_jump_loads_at_once', only: 'pc', note: 'a jump (as to a search result), then one wheel notch 0.3 s later: the jump does not count as a zoom of a run, the new level is requested at once',
    answer: () => ({ status: 200, delay: 200 }),
    run: async (p, b) => { await setView(p, 35.2, 128.9, 11); await waitState(p, s => s.reason === 'ready', 10000); await setView(p, 36.3, 127.6, 10); await sleep(300);
      const n = p.log.length, t0 = Date.now(); await notch(b, p, -100); const s = await waitState(p, s => s.reason === 'ready' && s.zoom === 11, 10000);
      const first = p.log.slice(n).find(x => /\/tiles\/11\//.test(x.url)); return { ...s, firstRequestMs: first ? first.t - t0 : null }; },
    expect: s => s.active === 'vworld' && s.zoom === 11 && s.firstRequestMs !== null && s.firstRequestMs < 250 },
  { name: 'slow_wheel_each_level', only: 'pc', note: 'wheel notches 1.5 s apart: every level is loaded as its zoom starts, as before', answer: () => ({ status: 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; await flicks(b, p, 4, 1500); const s = await waitState(p, s => s.reason === 'ready', 10000); return { ...s, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.levels.join() === '12,13,14' },
  { name: 'wheel_in_and_back_to_start', only: 'pc', note: 'four quick notches in and four back out (0.45 s apart) around one point: back at the start level VWorld stays; only the first level passed through and the start level are requested',
    answer: () => ({ status: 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; for (let i = 0; i < 8; i++) { await notch(b, p, i < 4 ? -100 : 100); await sleep(450); }
      await sleep(900); const s = await waitState(p, s => s.reason === 'ready', 10000); return { ...s, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.zoom === 11 && s.levels.every(z => z === 11 || z === 12) },
  // Leaflet ends a batch only when a tile finishes: when the last tiles loading were cancelled (zooming back in onto the
  // tiles kept under the wider level), the batch stayed open and the 12 s deadline switched a drawn map to OSM (10/27).
  { name: 'cancelled_batch_closes_without_timeout', only: 'pc', note: 'slow tiles (1.5 s): zoom out one level and back in before its tiles arrive: the cancelled batch closes at once and the drawn map stays VWorld past the 12 s deadline',
    answer: () => ({ status: 200, delay: 1500 }),
    run: async p => { await sleep(600); await zoomBy(p, -1); await sleep(450); await zoomBy(p, 1);
      const early = await waitState(p, s => s.reason === 'ready' && s.zoom === 11, 4000); const pending = await p.evaluate('birdmapBasemap.getState().deadlinePending');
      await sleep(12500); const s = await p.evaluate(ST); return { ...s, earlyReason: early.reason, deadlinePendingAfterClose: pending }; },
    expect: s => s.earlyReason === 'ready' && s.deadlinePendingAfterClose === false && s.active === 'vworld' && s.reason === 'ready' },
  { name: 'real_pinch', only: 'mobile', touch: true, note: 'real two-finger pinches (touch), in 3 and out 3, 0.6 s apart: each pinch end loads its level at once (Leaflet default, unchanged), VWorld stays',
    answer: () => ({ status: 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; await pinches(b, p, 12, 600); const s = await waitState(p, s => s.reason === 'ready', 10000); return { ...s, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.levels.length >= 3 },
  // Flicks about a second apart (10/28, Codex): each was a lone zoom loading a whole screen, 183 tiles at 1366x768 and 526
  // at 1920x1080 for 12 flicks, then 429 and OSM. The run of zooms now loads its first level and the one it rests at.
  { name: 'wheel_flicks_1s_per_ip_limit', only: ['pc', 'wide'], note: 'wheel flicks 1 s apart (12) against the Worker per-IP limit (180 per 60 s): VWorld stays, the run requests its first level and the one it rests at',
    answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 60000).length > 180 ? 429 : 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; await flicks(b, p, 12, 1000); await sleep(1300); const s = await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); return { ...s, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.levels.includes(Math.round(s.zoom)) && s.levels.length <= 2 },
  // The same tiles failing, answered in either order (10/28, Codex): the verdict follows how many failed, not which
  // answered first. A few failures keep VWorld (partial); most failing falls back to OSM; no page exception either way.
  ...[[5, 'few', s => s.active === 'vworld'], [4, 'most', s => s.active === 'osm' && s.reason === 'tile_error']].flatMap(([mod, size, expect]) => [true, false].map(errorsFirst => ({
    name: `${size}_failures_${errorsFirst ? 'errors' : 'successes'}_first`, only: 'pc',
    note: `a new area where ${size === 'few' ? '1 tile in 5 fails' : 'all but 1 tile in 4 fail'} (502), the ${errorsFirst ? 'failures' : 'successes'} answering first`,
    answer: u => { const m = /\/(\d+)\/(\d+)\/(\d+)\.(png|jpeg)$/.exec(u); const bad = mixedOn && !!m && (size === 'few' ? (+m[2] + +m[3]) % mod === 0 : (+m[2] + +m[3]) % mod !== 0);
      return { status: bad ? 502 : 200, delay: bad === errorsFirst ? 40 : 300 }; },
    run: async p => { mixedOn = true; const t0 = Date.now(); await setView(p, 35.2, 128.9, 11); await sleep(400);
      const s = await waitState(p, s => s.reason === 'ready' || s.reason === 'partial_error' || s.active === 'osm', 15000); mixedOn = false; return { ...s, decidedMs: Date.now() - t0 }; },
    expect }))),
  { name: 'recovery_attempt_with_zoom_and_pan', only: 'pc', note: 'an outage (502) for 20 s: OSM; the attempt 60 s later meets zooming and panning while it loads, then VWorld with the recovery history reset',
    answer: (u, i, log) => ({ status: Date.now() - log[0].t < 20000 ? 502 : 200, delay: 300 }),
    run: async p => { await setView(p, 35.2, 128.9, 11); await waitState(p, s => s.active === 'osm', 15000);
      const a = await waitState(p, s => s.active !== 'osm', 70000); await zoomBy(p, 1); await sleep(150); await panBy(p, 160, 60); await sleep(150); await zoomBy(p, -1);
      await sleep(1500); const s = await waitState(p, s => s.reason === 'ready', 10000); s.attemptSeenAs = a.active + '/' + a.reason; s.recoveryAttempts = await p.evaluate('birdmapBasemap.getState().recoveryAttempts'); return s; },
    expect: s => s.attemptSeenAs === 'vworld/loading' && s.active === 'vworld' && s.reason === 'ready' && s.recoveryAttempts === 0 },
  // An uneven hand (10/28, Codex 2nd review: 600 ms flicks went to OSM after ~20 s): the pause ran out between two flicks
  // whenever a gap was longer than 1.25 x the one before, loading a whole screen each time.
  { name: 'wheel_flicks_uneven_per_ip_limit', only: ['pc', 'wide'], note: 'wheel flicks 450-750 ms apart for 20 s against the Worker per-IP limit (180 per 60 s): the pause does not run out between flicks, VWorld stays',
    answer: (u, i, log) => ({ status: log.filter(x => Date.now() - x.t < 60000).length > 180 ? 429 : 200, delay: 200 }),
    run: async (p, b) => { await sleep(600); const n = p.log.length; let r = 12345, i = 0; const t0 = Date.now();
      while (Date.now() - t0 < 20000) { await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 683 + ((i % 3) - 1) * 120, y: 384 + (i % 2 ? 60 : -60), deltaX: 0, deltaY: i % 6 < 3 ? -100 : 100 }, p.sessionId); i++;
        r = (r * 1103515245 + 12345) % 2147483648; await sleep(450 + Math.round(r / 2147483648 * 300)); }
      await sleep(1300); const s = await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); return { ...s, flicks: i, levels: levels(p.log.slice(n)) }; },
    expect: s => s.active === 'vworld' && s.reason === 'ready' && s.levels.includes(Math.round(s.zoom)) },
  // Failures, zooms and pans overlapping (10/28, Codex 2nd review: a fallback deferred by one batch removed the next): for
  // 3 s every other tile fails at once while the user zooms and pans every 250 ms, then all tiles are fine. Whatever the
  // order of events: no page exception, and the end state is either a consistent VWorld or a locked OSM.
  { name: 'overlapping_failures_zoom_pan', only: 'pc', note: 'every other tile 502 within 40 ms for 3 s while zooming and panning every 250 ms, then fine: no exception, a consistent end state',
    answer: u => { const m = /\/(\d+)\/(\d+)\/(\d+)\.(png|jpeg)$/.exec(u); const bad = Date.now() - overlapT0 < 3000 && !!m && (+m[2] + +m[3]) % 2 === 0; return { status: bad ? 502 : 200, delay: bad ? 40 : 250 }; },
    run: async p => { overlapT0 = Date.now(); for (let i = 0; i < 24; i++) { if (i % 3 === 2) await panBy(p, i % 2 ? -140 : 150, 40); else await zoomBy(p, i % 6 < 3 ? 1 : -1); await sleep(250); }
      await sleep(1500); const s = await waitState(p, s => s.reason === 'ready' || s.reason === 'partial_error' || s.active === 'osm', 15000); s.deadline = await p.evaluate('birdmapBasemap.getState().deadlinePending'); return s; },
    expect: s => s.active === 'osm' ? s.reason === 'tile_error' && s.locked : s.active === 'vworld' && (s.reason === 'ready' || s.reason === 'partial_error') && !s.deadline }
];
let mixedOn = false, overlapT0 = 0;


// Layout of the selector at the five checked widths (plus phone landscape): one column, at most 80 px wide, at the left
// edge, overlapping no other control, plain status hidden. Compact phones additionally start collapsed and must
// expand into the same four-choice column. (The report rows need live data: checked separately.)
const LAYOUT = `(function(){function r(el){if(!el)return null;var b=el.getBoundingClientRect(),cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||!b.width||!b.height)return null;return {x:b.left,y:b.top,w:b.width,h:b.height};}
  function hit(a,b){return a&&b&&Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.5;}
  var box=document.querySelector('.birdmap-basemap'),br=r(box),bs=[].map.call(document.querySelectorAll('.birdmap-basemap__choice'),r);
  var others=['#mapTitleBox','#togglePanelBtn','#birdmapExploreMenuToggle','#noticeToggleBtn','#todayToggleBtn','#reportToggleBtn','#recentReportsBox','.leaflet-control-zoom','.leaflet-control-attribution','.leaflet-control-scale'].map(function(s){return [s,r(document.querySelector(s))];}).filter(function(x){return x[1];});
  return {box:br&&{x:Math.round(br.x),y:Math.round(br.y),w:Math.round(br.w),h:Math.round(br.h)},inView:!!br&&br.y>=0&&br.y+br.h<=innerHeight,
    column:bs.length===4&&bs.every(function(b,i){return b&&Math.abs(b.x-bs[0].x)<1&&(i===0||b.y>bs[i-1].y);}),buttonH:bs.map(function(b){return b&&Math.round(b.h);}),
    collapsed:!!box&&box.classList.contains('birdmap-basemap-collapsed'),visibleChoices:bs.filter(Boolean).length,
    toggle:r(document.querySelector('.birdmap-basemap-toggle')),expanded:document.querySelector('.birdmap-basemap-toggle')?.getAttribute('aria-expanded'),
    overlaps:others.filter(function(o){return hit(br,o[1]);}).map(function(o){return o[0];}),statusDrawn:!!r(document.querySelector('.birdmap-basemap__status'))&&document.querySelector('.birdmap-basemap__status').getBoundingClientRect().height>2,
    notice:box&&box.getAttribute('data-notice'),reason:birdmapBasemap.getState().reason};})()`;
const LAYOUT_SIZES = [[320, 568, true], [375, 667, true], [390, 844, true], [768, 1024, true], [1366, 768, false], [640, 360, true], [844,390,true], [932,430,true], [844,390,false]];
const results = [];
const browser = await Browser.launch();
try {
  if (!process.env.FAULTS_ONLY || process.env.FAULTS_ONLY.split(',').includes('layout')) for (const [width, height, touch] of LAYOUT_SIZES) {
    const p = await browser.open({ width, height, mobile: touch, touch, answer: () => ({ status: 200, delay: 40 }) });
    await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000); await sleep(600);
    const initial = await p.evaluate(LAYOUT);
    if (width <= 700 || (touch && width < 1024 && height <= 500)) {
      const expectedCollapsed = height < 700;
      const closedOkay = initial.collapsed === expectedCollapsed && initial.expanded === String(!expectedCollapsed)
        && initial.toggle && initial.toggle.h >= 44 && initial.inView && initial.box.w <= 80 && initial.overlaps.length === 0
        && (!expectedCollapsed || initial.visibleChoices === 0);
      results.push({ size: width + 'x' + height, scenario: 'mobile-toggle', ok: closedOkay, final: initial });
      console.log(`${closedOkay ? 'PASS' : 'FAIL'} ${width}x${height} mobile-toggle -> ${JSON.stringify(initial)}`);
      if (initial.collapsed) {
        await p.evaluate("document.querySelector('.birdmap-basemap-toggle').click()");
        await sleep(100);
      }
    }
    const m = await p.evaluate(LAYOUT);
    const informational = false;
    const ok = m.column && m.box.w <= 80 && m.box.x <= 10 && m.overlaps.length === 0 && m.inView && (m.notice === 'true' || !m.statusDrawn) && m.buttonH.every(h => h >= (touch && height > 480 ? 44 : 32));
    results.push({ size: width + 'x' + height, scenario: 'layout', ok: informational ? undefined : ok, informational, final: m });
    console.log(`${informational ? 'INFO' : ok ? 'PASS' : 'FAIL'} ${width}x${height} layout -> ${JSON.stringify(m)}`);
    await p.close();
  }
  // 'wide' (1920x1080) runs only the scenarios that name it.
  for (const [label, size] of [['pc', { width: 1366, height: 768, mobile: false }], ['wide', { width: 1920, height: 1080, mobile: false }], ['mobile', { width: 390, height: 844, mobile: true }]]) {
    for (const sc of SCENARIOS) {
      if (label === 'wide' ? ![].concat(sc.only).includes('wide') : sc.only && ![].concat(sc.only).includes(label)) continue;
      if (process.env.FAULTS_ONLY && !process.env.FAULTS_ONLY.split(',').includes(sc.name)) continue;
      const p = await browser.open({ ...size, touch: !!sc.touch, answer: sc.answer });
      await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000);
      await start(p); await waitState(p, s => s.reason === 'ready' || s.active === 'osm', 15000);
      const before = p.log.length;
      const s = await sc.run(p, browser, label);
      const tiles = p.log.length - before;
      // Let late timers (deferred fallbacks, Leaflet's prune) run before reading the page's exceptions.
      await sleep(300);
      const ok = sc.expect(s) && p.exceptions.length === 0;
      results.push({ size: label, scenario: sc.name, ok, note: sc.note, tilesRequested: tiles, final: s, exceptions: p.exceptions, consoleErrors: p.consoleErrors });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${sc.name} tiles=${tiles} -> ${JSON.stringify(s)}${p.exceptions.length ? ' EXCEPTIONS ' + JSON.stringify(p.exceptions) : ''}`);
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
