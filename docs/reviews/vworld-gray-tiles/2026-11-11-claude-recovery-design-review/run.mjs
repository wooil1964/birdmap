// Offline design check: real Leaflet 1.9.3 + real Chrome, every non-local request answered by CDP Fetch with a
// synthetic tile or error. Nothing reaches the Worker, Lambda, VWorld or OSM.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { deflateSync, crc32 } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url)), PAGE = join(HERE, 'h');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function png(r, g, b, a) {
  const chunk = (tag, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(tag), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, r, g, b, a]))), chunk('IEND', Buffer.alloc(0))]);
}
const SAT = png(20, 90, 40, 255).toString('base64'), OSM = png(150, 190, 230, 255).toString('base64'), OVL = png(0, 0, 0, 0).toString('base64');

const server = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname, f = join(PAGE, p === '/' ? 'index.html' : p.slice(1));
  if (!f.startsWith(PAGE) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

const profile = mkdtempSync(join(tmpdir(), 'vw-design-'));
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let port = 0;
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} }
if (!port) throw Error('chrome did not start');

async function openPage() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), handlers = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { const [r, j] = wait.get(d.id); wait.delete(d.id); d.error ? j(Error(JSON.stringify(d.error))) : r(d.result); } else if (d.method) handlers.forEach(h => h(d)); };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; wait.set(i, [r, j]); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, on: h => handlers.push(h), close: async () => { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); } };
}

// One run: policy(tile, attempt, now) -> 200 | 429 | 502 | 503 | 'hang'. Returns the request log and probes.
async function run({ ctrl, pref = 'satellite', retry = 3000, rec = '', width = 1366, height = 768, mobile = false, policy, steps }) {
  const page = await openPage(), log = [], seen = new Map(), t0 = Date.now(), order = [];
  page.on(async d => {
    if (d.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = d.params, url = request.url;
    if (url.startsWith(origin)) return page.send('Fetch.continueRequest', { requestId });
    const m = /\/tiles\/(satellite|hybrid)\/(\d+)\/(\d+)\/(\d+)\.(jpeg|png)$/.exec(url);
    if (/^https:\/\/osm\.test\//.test(url)) { log.push({ t: Date.now() - t0, kind: 'osm', url, status: 200 }); return page.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: OSM }); }
    if (!m) { log.push({ t: Date.now() - t0, kind: 'blocked', url }); return page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
    const attempt = seen.get(url) || 0; seen.set(url, attempt + 1);
    if (m[1] === 'satellite' && !order.includes(url)) order.push(url);
    const tile = { layer: m[1], z: +m[2], x: +m[3], y: +m[4], url, index: order.indexOf(url) };
    const status = policy(tile, attempt, Date.now() - t0);
    log.push({ t: Date.now() - t0, kind: m[1], key: m.slice(2, 5).join('/'), attempt, status });
    if (status === 'hang') return;
    if (status === 200) return page.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: m[1] === 'satellite' ? 'image/jpeg' : 'image/png' }, { name: 'Cache-Control', value: 'no-store' }], body: m[1] === 'satellite' ? SAT : OVL });
    return page.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from('tiles_unavailable').toString('base64') });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await page.send('Runtime.enable');
  const errors = []; page.on(d => { if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); });
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${origin}/?ctrl=${ctrl}&pref=${pref}&retry=${retry}${rec ? '&rec=' + rec : ''}` });
  const ev = async expr => (await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  for (let i = 0; i < 50 && !(await ev('typeof probe==="function"').catch(() => false)); i++) await sleep(100);
  const probes = [];
  for (const step of steps) {
    // Order per step: act, wait, then measure.
    if (step.js) await ev('void (' + step.js + ')');
    if (step.wait) await sleep(step.wait);
    if (step.probe) probes.push({ at: step.probe, t: Date.now() - t0, ...(await ev('probe()')) });
  }
  await page.close();
  // Same URL requested twice within 200 ms (a duplicate in flight).
  const dup = log.filter((r, i) => r.key && log.some((o, j) => j < i && o.kind === r.kind && o.key === r.key && r.t - o.t < 200)).length;
  return { ctrl, pref, retry, width, height, mobile, probes, errors, dupWithin200ms: dup,
    counts: { satellite: log.filter(r => r.kind === 'satellite').length, hybrid: log.filter(r => r.kind === 'hybrid').length, osm: log.filter(r => r.kind === 'osm').length, blocked: log.filter(r => r.kind === 'blocked').length,
      retried: log.filter(r => r.attempt > 0).length, s429: log.filter(r => r.status === 429).length, s502: log.filter(r => r.status === 502).length, s503: log.filter(r => r.status === 503).length },
    log };
}

const failIdx = idx => (t, attempt, status, persistent) => t.layer === 'satellite' && idx.includes(t.index) && (persistent || attempt === 0) ? status : 200;
const short = (r) => ({ ctrl: r.ctrl, pref: r.pref, view: r.width + 'x' + r.height + (r.mobile ? ' mobile' : ''), counts: r.counts, dup: r.dupWithin200ms, errors: r.errors.length,
  probes: r.probes.map(p => ({ at: p.at, gray: p.gray, expected: p.expected, overlayMissing: p.overlayMissing, active: p.state.active, reason: p.state.reason, locked: p.state.locked, osmOn: p.osmOn, retryPending: p.state.partialRetryPending, retriedKeys: p.state.retriedKeys, recoveryAttempts: p.state.recoveryAttempts })) });

const only = process.argv[2] ? process.argv[2].split(',') : null;
const scenarios = {
  // 1. Two tiles fail once (limiter window or upstream blip), then answer. Each error code separately.
  ...Object.fromEntries([429, 502, 503].flatMap(code => ['main', 'proto'].map(ctrl => [`transient-${code}-${ctrl}`, { ctrl, policy: (t, a) => failIdx([3, 9])(t, a, code, false),
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 4000, probe: 'after-retry-window' }, { wait: 4000, probe: 'later' }] }]))),
  // 2. Limiter still blocking those tiles at every attempt (persistent 429).
  ...Object.fromEntries(['main', 'proto', 'naive'].map(ctrl => [`persistent-429-${ctrl}`, { ctrl, policy: (t, a) => failIdx([3, 9, 12, 15])(t, a, 429, true),
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 4500, probe: 'after-retry' }, { wait: 6000, probe: 'later' }] }])),
  // 3. Four tiles that never load (e.g. a no-data tile answered with an error: hypothetical), then pans back and forth.
  ...Object.fromEntries(['main', 'proto', 'naive'].map(ctrl => [`permanent-502-pan-${ctrl}`, { ctrl, policy: (t, a) => failIdx([3, 9, 12, 15])(t, a, 502, true),
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 4500, probe: 'after-retry' },
      { js: 'map.panBy([300,0],{animate:false})', wait: 1500 }, { js: 'map.panBy([-300,0],{animate:false})', wait: 5000, probe: 'after-pan-and-retry' },
      { wait: 5000, probe: 'later' }] }])),
  // 4. Pending retry cancelled by switching to OSM, by a zoom, and by destroy.
  'cancel-osm-proto': { ctrl: 'proto', policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'partial' }, { js: 'ctl.setPreference("osm")', wait: 5000, probe: 'osm-before-and-after-timer' }, { js: 'ctl.setPreference("satellite")', wait: 3000, probe: 'back-to-satellite' }] },
  'cancel-zoom-proto': { ctrl: 'proto', policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'partial' }, { js: 'map.setZoom(12,{animate:false})', wait: 6000, probe: 'zoomed' }] },
  'cancel-destroy-proto': { ctrl: 'proto', policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'partial' }, { js: 'ctl.destroy()', wait: 5000 }] },
  // 5. Hybrid: satellite partial once, overlay always fine.
  ...Object.fromEntries(['main', 'proto'].map(ctrl => [`hybrid-transient-${ctrl}`, { ctrl, pref: 'hybrid', policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 5000, probe: 'after-retry' }] }])),
  // 6. Phone-sized view with touch emulation.
  ...Object.fromEntries(['main', 'proto'].map(ctrl => [`mobile-transient-${ctrl}`, { ctrl, width: 390, height: 844, mobile: true, policy: (t, a) => failIdx([2, 5])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 5000, probe: 'after-retry' }] }])),
  // 7. Everything 429 (global limiter): the existing outage path, unchanged; no partial retry.
  ...Object.fromEntries(['main', 'proto'].map(ctrl => [`all-429-${ctrl}`, { ctrl, policy: t => t.layer === 'satellite' ? 429 : 200,
    steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 5000, probe: 'later' }] }])),
  // 8. A tile that never answers among loaded ones: the 12 s batch deadline (unchanged).
  ...Object.fromEntries(['main', 'proto'].map(ctrl => [`hang-one-${ctrl}`, { ctrl, policy: t => t.layer === 'satellite' && t.index === 4 ? 'hang' : 200,
    steps: [{ wait: 3000, probe: 'waiting' }, { wait: 11000, probe: 'after-12s' }] }])),
  // 9. Rapid pans while a retry is pending: retry waits for an idle layer; no duplicate in flight.
  'fast-pan-proto': { ctrl: 'proto', policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
    steps: [{ wait: 2500, probe: 'partial' }, ...Array.from({ length: 12 }, (_, i) => ({ js: `map.panBy([${i % 2 ? -200 : 200},40],{animate:false})`, wait: 350 })), { wait: 7000, probe: 'settled' }] }
};
// 10. A scaled IP limiter (30 requests per 3 s sliding window) while the user pans every second.
function limiter(limit, windowMs) { const times = []; return (t, a, now) => { while (times.length && now - times[0] >= windowMs) times.shift(); if (times.length >= limit) { times.push(now); return 429; } times.push(now); return 200; }; }
for (const ctrl of ['main', 'proto', 'naive']) scenarios[`limiter-pans-${ctrl}`] = { ctrl, get policy() { return limiter(30, 3000); },
  steps: [{ wait: 1500 }, ...Array.from({ length: 8 }, () => ({ js: 'map.panBy([700,0],{animate:false})', wait: 700 })), { wait: 2000, probe: 'after-pans' }, { wait: 10000, probe: 'idle-10s' }] };
// 12. Codex M1 comparison: four tiles that never load. R1 (proto) keeps them grey; the fallback variant hands the layer to
// fail() once a retry fails. Every delay scaled by 1/20 (retry 60 s -> 3 s, recovery 60/120/240/480 s -> 3/6/12/24 s).
for (const ctrl of ['proto', 'proto2', 'fallback']) scenarios[`chain-permanent-502-${ctrl}`] = { ctrl, rec: '3000,6000,12000,24000', policy: (t, a) => failIdx([3, 9, 12, 15])(t, a, 502, true),
  steps: [{ wait: 2500, probe: '2.5s' }, { wait: 7500, probe: '10s' }, { wait: 15000, probe: '25s' }, { wait: 25000, probe: '50s' }, { wait: 20000, probe: '70s' }] };
// Same, but the four tiles fail only on their first two attempts (an outage that ends): does the fallback come back?
for (const ctrl of ['proto', 'proto2', 'fallback']) scenarios[`chain-heals-502-${ctrl}`] = { ctrl, rec: '3000,6000,12000,24000', policy: (t, a) => t.layer === 'satellite' && [3, 9, 12, 15].includes(t.index) && a < 2 ? 502 : 200,
  steps: [{ wait: 2500, probe: '2.5s' }, { wait: 7500, probe: '10s' }, { wait: 15000, probe: '25s' }] };
// 11. Real 60 s delay (unscaled), transient 429.
scenarios['real60-transient-429-proto'] = { ctrl: 'proto', retry: 60000, policy: (t, a) => failIdx([3, 9])(t, a, 429, false),
  steps: [{ wait: 2500, probe: 'after-batch' }, { wait: 30000, probe: '30s' }, { wait: 32000, probe: '62s' }, { wait: 3000, probe: '65s' }] };

// Every R1 (proto) scenario again with the per-tile backoff variant (proto2).
for (const [name, sc] of Object.entries({ ...scenarios })) if (name.endsWith('-proto') && !name.startsWith('real60')) {
  const d = Object.getOwnPropertyDescriptors(sc); d.ctrl = { value: 'proto2', enumerable: true }; scenarios[name + '2'] = Object.defineProperties({}, d);
}
const results = {};
try {
  for (const [name, sc] of Object.entries(scenarios)) {
    if (only && !only.some(o => name.includes(o))) continue;
    const r = await run({ ...sc, policy: sc.policy }); results[name] = r;
    console.log(name, JSON.stringify(short(r)));
  }
} finally {
  writeFileSync(join(HERE, process.env.OUT || 'design-results.json'), JSON.stringify(results, null, 1));
  proc.kill(); server.close(); await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
