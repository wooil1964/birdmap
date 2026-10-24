// One unrelated-origin browser image control. No key is read from files or environment.
// Run: node docs/vworld-candidate/domain-control-check.mjs [--output <safe-json-path>]
// Offline synthetic regression: add --self-test. No live VWorld request is made. Live mode never repeats the registered-origin success.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CONTROL_PAGE = 'https://example.com/';
const CONTROL_ORIGIN = 'https://example.com';
const TTL_MS = 10 * 60 * 1000;
const IMAGE_TIMEOUT_MS = 15000;
const BINDING = '__birdmapPagesImageCheckEvent';
const STATE = '__birdmapPagesImageCheckState';
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
const outputAt = args.indexOf('--output');
const OUTPUT = resolve(outputAt >= 0 && args[outputAt + 1] ? args[outputAt + 1] : join(ROOT, '.ci-results/vworld-domain-control/result.json'));
const knownArgs = new Set(['--self-test', '--output']);
if (args.some((arg, index) => !(outputAt >= 0 && index === outputAt + 1) && !knownArgs.has(arg)) || (outputAt >= 0 && (!args[outputAt + 1] || args[outputAt + 1].startsWith('--')))) {
  console.log(JSON.stringify({ event: 'finished', status: 'invalid_arguments' }));
  process.exit(1);
}
// Only test URL shape. Never extract, save, print, or return the key segment.
const ONE_TILE = /^https:\/\/api\.vworld\.kr\/req\/wmts\/1\.0\.0\/(?:[A-Za-z0-9._~!'()*-]|%[0-9A-Fa-f]{2})+\/Base\/8\/100\/218\.png$/;
const SAFE_EVENTS = new Set(['started', 'loaded_256', 'loaded_other_size', 'image_error', 'image_timeout', 'map_confirmed', 'map_not_confirmed', 'cancelled']);
const delay = ms => new Promise(done => setTimeout(done, ms));
const safeStatus = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
function log(event, fields = {}) { console.log(JSON.stringify({ event, ...fields })); }
function hashes() {
  const result = {};
  for (const relative of ['index.html', 'assets/birdmap-basemap.js', 'assets/birdmap-basemap-init.js', 'docs/vworld-candidate/domain-control-check.mjs']) {
    result[relative] = createHash('sha256').update(readFileSync(join(ROOT, relative))).digest('hex');
  }
  return result;
}

// This function runs in the real fetched document. Key values stay in browser
// memory. Its binding only emits a fixed enum, never input or request material.
function installPanel(options) {
  const old = document.getElementById('birdmap-pages-image-check');
  if (old) old.remove();
  const state = window[options.state] = {
    phase: 'awaiting_key', browserDecodeSucceeded: false, width: 0, height: 0,
    controlLocationMatch: location.origin === options.controlOrigin && location.pathname === '/',
    actualMapUserConfirmed: false
  };
  const emit = value => { if (typeof window[options.binding] === 'function') window[options.binding](JSON.stringify({ token: options.eventToken, event: value })); };
  const panel = document.createElement('section');
  panel.id = 'birdmap-pages-image-check';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'birdmap-pages-image-check-title');
  panel.style.cssText = 'position:fixed;z-index:2147483647;inset:12px;margin:auto;width:min(480px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#172033;padding:20px;box-sizing:border-box;border:3px solid #275e99;border-radius:14px;box-shadow:0 0 0 100vmax #0009;font:16px/1.55 system-ui,sans-serif;';
  const heading = document.createElement('h2');
  heading.id = 'birdmap-pages-image-check-title';
  heading.style.cssText = 'margin:0 0 12px;font-size:21px';
  heading.textContent = options.synthetic ? '합성 이미지 자체 검사' : '등록 외 출처 · 도메인 제한 검사';
  const explanation = document.createElement('p');
  explanation.textContent = options.synthetic
    ? '합성 입력과 합성 이미지로만 검사합니다. 실제 VWorld에는 연결하지 않습니다.'
    : '등록하지 않은 example.com HTTPS 문서에서 같은 개발키로 타일 한 장만 요청합니다. 앞서 성공한 키와 같은 키를 입력해 주세요. 키는 임시 화면 메모리와 VWorld 요청 URL에만 사용합니다. 이 문서의 원래 콘텐츠는 제거했고 다른 모든 외부 요청을 차단합니다. 키를 example.com 서버에 보내지 않습니다. 10분 뒤 창을 닫습니다.';
  const form = document.createElement('form');
  form.autocomplete = 'off';
  const label = document.createElement('label');
  label.textContent = 'VWorld 인증키';
  label.htmlFor = 'birdmap-pages-image-check-key';
  const input = document.createElement('input');
  input.id = label.htmlFor;
  input.type = 'password';
  input.autocomplete = 'off';
  input.setAttribute('data-lpignore', 'true');
  input.setAttribute('data-1p-ignore', 'true');
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.maxLength = 512;
  input.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-height:44px;margin:6px 0 12px;font:inherit';
  const start = document.createElement('button');
  start.type = 'submit';
  start.id = 'birdmap-pages-image-check-start';
  start.textContent = '1회 검사 시작';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '키를 직접 입력하면 검사를 시작할 수 있습니다.';
  const imageBox = document.createElement('div');
  imageBox.style.cssText = 'width:256px;height:256px;max-width:100%;margin:12px auto;background:#edf1f5;display:none';
  const image = document.createElement('img');
  image.alt = options.synthetic ? '합성 검사 이미지' : '실제 지도인지 확인할 VWorld 타일 한 장';
  image.width = 256;
  image.height = 256;
  image.style.cssText = 'display:block;width:256px;height:256px;max-width:100%;object-fit:contain';
  imageBox.append(image);
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
  const yes = document.createElement('button');
  yes.id = 'birdmap-pages-image-check-yes';
  yes.textContent = '실제 지도 확인 완료';
  yes.disabled = true;
  const no = document.createElement('button');
  no.id = 'birdmap-pages-image-check-no';
  no.textContent = '정상 지도 확인 안 됨';
  no.disabled = true;
  const cancel = document.createElement('button');
  cancel.id = 'birdmap-pages-image-check-cancel';
  cancel.textContent = '종료';
  for (const button of [start, yes, no, cancel]) button.style.cssText = 'min-height:44px;padding:8px 12px;font:inherit;cursor:pointer';
  let timer;
  function clearInput() { input.value = ''; input.remove(); label.remove(); start.remove(); }
  function finish(phase) {
    clearTimeout(timer);
    image.onload = image.onerror = null;
    image.removeAttribute('src');
    clearInput();
    state.phase = phase;
    state.actualMapUserConfirmed = phase === 'map_confirmed';
    yes.disabled = no.disabled = cancel.disabled = true;
    status.textContent = '검사를 종료합니다. 저장되는 결과에는 키와 타일이 포함되지 않습니다.';
    emit(phase);
  }
  yes.addEventListener('click', event => { if (!options.synthetic && !event.isTrusted) return; if (state.phase === 'loaded_256') finish('map_confirmed'); });
  no.addEventListener('click', event => { if (!options.synthetic && !event.isTrusted) return; if (state.phase === 'loaded_256' || state.phase === 'loaded_other_size') finish('map_not_confirmed'); });
  cancel.addEventListener('click', () => finish('cancelled'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (state.phase !== 'awaiting_key') return;
    let key = input.value.trim();
    if (!key || key.length > 512 || /\s|[\x00-\x1f\x7f]/.test(key)) {
      input.value = '';
      status.textContent = '공백 없는 인증키를 입력해 주세요. 요청은 보내지 않았습니다.';
      return;
    }
    state.phase = 'awaiting_image';
    clearInput();
    status.textContent = '타일 한 장을 요청하고 있습니다. 자동 재시도는 하지 않습니다.';
    imageBox.style.display = 'block';
    emit('started');
    image.onload = () => {
      clearTimeout(timer);
      state.width = image.naturalWidth;
      state.height = image.naturalHeight;
      state.browserDecodeSucceeded = true;
      state.phase = state.width === 256 && state.height === 256 ? 'loaded_256' : 'loaded_other_size';
      status.textContent = state.phase === 'loaded_256'
        ? '256×256 이미지가 표시됐습니다. 오류 안내 이미지가 아닌 실제 지도가 맞는지 확인해 주세요.'
        : '이미지가 표시됐으나 256×256 크기가 아닙니다.';
      yes.disabled = state.phase !== 'loaded_256';
      no.disabled = false;
      emit(state.phase);
    };
    image.onerror = () => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      state.phase = 'image_error';
      status.textContent = '이미지를 표시하지 못했습니다. 요청을 반복하지 않고 종료합니다.';
      emit('image_error');
    };
    timer = setTimeout(() => {
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      state.phase = 'image_timeout';
      status.textContent = '15초 안에 표시되지 않았습니다. 요청을 반복하지 않고 종료합니다.';
      emit('image_timeout');
    }, options.imageTimeoutMs);
    // No referrerPolicy, Origin, Referer, CORS mode, or fetch header is set here.
    image.src = 'https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/Base/8/100/218.png';
    key = '';
  });
  form.append(label, input, start);
  controls.append(yes, no, cancel);
  panel.append(heading, explanation, form, status, imageBox, controls);
  document.documentElement.append(panel);
  input.focus();
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.handlers = [];
    socket.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        message.error ? pending.reject(Error('Browser command failed')) : pending.resolve(message.result);
      } else {
        for (const handler of this.handlers) Promise.resolve(handler(message)).catch(() => {});
      }
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('Browser disconnected')); }
      this.pending.clear();
    });
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
    if (result.exceptionDetails) throw Error('Browser evaluation failed');
    return result.result.value;
  }
}

function syntheticPng() {
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, body) {
    const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name, body])));
    return Buffer.concat([length, name, body, crc]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const at = y * (1 + 256 * 4) + 1 + x * 4;
    rows[at] = x; rows[at + 1] = y; rows[at + 2] = 180; rows[at + 3] = 255;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  const startedAt = new Date().toISOString();
  const sourceSha256 = hashes();
  const counters = {
    realVworldRequestsContinued: 0, syntheticVworldResponses: 0, vworldRequestsBlocked: 0,
    nonGetRequestsBlocked: 0, workerRequestsBlocked: 0, osmRequestsBlocked: 0,
    otherRequestsBlocked: 0, externalRequestsContinued: 0
  };
  const evidence = {
    genuineControlDocumentReceived: false, documentHttpStatus: null, controlLocationMatch: false,
    tileHttpStatus: null, reportedMimeType: 'not_observed', referrerOrigin: 'not_observed',
    browserDecodeSucceeded: false, imageWidth: 0, imageHeight: 0, actualMapUserConfirmed: false,
    pngSignatureVerified: false, registeredDomainRestrictionVerified: false,
    candidateDeployed: false, candidateFullMapValidated: false, passiveDocumentReplacedInMemory: false
  };
  let server, processHandle, browser, socket, profile, ttl, sessionId;
  // Private to this process and the panel closure; the globally named binding
  // must not accept forged completion events from unrelated page scripts.
  const eventToken = randomBytes(16).toString('hex');
  let phase = 'initializing', completed = false, imageRequestConsumed = false;
  let selfTestChecks = null;
  let resolveFinished;
  const finished = new Promise(resolvePromise => { resolveFinished = resolvePromise; });
  async function close() {
    clearTimeout(ttl);
    if (browser && socket?.readyState === WebSocket.OPEN) await browser.send('Browser.close').catch(() => {});
    if (processHandle && processHandle.exitCode === null) {
      await Promise.race([new Promise(done => processHandle.once('exit', done)), delay(1500)]);
      if (processHandle.exitCode === null) { processHandle.kill(); await delay(500); }
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    if (server) await new Promise(done => server.close(done));
    if (profile) {
      const absolute = resolve(profile), base = resolve(tmpdir());
      if (dirname(absolute) !== base || !absolute.startsWith(base + sep) || !basename(absolute).startsWith('birdmap-domain-control-')) throw Error('Unsafe profile cleanup target');
      rmSync(absolute, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    }
  }
  async function finish(status) {
    if (completed) return;
    completed = true;
    let cleanup = 'complete';
    try { await close(); } catch { cleanup = 'incomplete'; }
    const result = {
      domainRestrictionOutcome: SELF_TEST ? 'not_tested' : evidence.actualMapUserConfirmed ? 'unregistered_origin_accepted_restriction_insufficient' : (status === 'image_error' && [401,403].includes(evidence.tileHttpStatus)) ? 'unregistered_origin_rejected_http_auth_status_cause_unconfirmed' : 'inconclusive',
      schema: 'birdmap-unregistered-origin-control-v1', mode: SELF_TEST ? 'synthetic_self_test' : 'actual_unregistered_https_origin',
      startedAt, finishedAt: new Date().toISOString(), status, cleanup, sourceSha256, counters, evidence,
      ...(selfTestChecks ? { selfTestChecks } : {}),
      scope: SELF_TEST
        ? 'Local synthetic document, synthetic input and synthetic 256x256 image. All external requests blocked or fulfilled synthetically. No live API, actual Pages authentication, or human map confirmation.'
        : 'Genuine unrelated HTTPS static document, replaced locally in browser memory with a temporary input form. At most one Base/8/100/218 image request with the natural browser referrer. No registered-origin positive retest, deployment, header spoofing, API bypass, tile storage, or key output. A denied/failed image alone does not prove domain enforcement; compare the existing registered-origin success and provider account settings.'
    };
    let outputWritten = false;
    try { mkdirSync(dirname(OUTPUT), { recursive: true }); writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n'); outputWritten = true; }
    catch { log('result_write_failed', { status: 'safe_output_unavailable' }); }
    log('finished', { status, cleanup, counters, evidence, ...(selfTestChecks ? { selfTestChecks } : {}) });
    process.exitCode = cleanup === 'complete' && outputWritten && (status === 'map_confirmed' || status === 'self_test_passed') ? 0 : 1;
    resolveFinished(result);
  }
  const stop = () => { void finish('cancelled'); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    let pageUrl = CONTROL_PAGE, selfTestOrigin = '';
    if (SELF_TEST) {
      server = createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/') { response.writeHead(403); response.end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Synthetic browser harness test</title><script>window.__controlOriginalScriptRan=true</script></head><body onresize="window.__controlOriginalHandlerRan=true" onmessage="window.__controlOriginalHandlerRan=true"><p>합성 검사 전용 문서</p></body></html>');
      });
      await new Promise(done => server.listen(0, '127.0.0.1', done));
      selfTestOrigin = 'http://127.0.0.1:' + server.address().port;
      pageUrl = selfTestOrigin + '/';
    }
    const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
    if (!chrome) throw Error('Isolated Chrome unavailable');
    profile = mkdtempSync(join(tmpdir(), 'birdmap-domain-control-'));
    const flags = [
      '--remote-debugging-port=0', '--user-data-dir=' + profile, '--incognito', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-default-apps', '--disable-logging', '--log-level=3',
      '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter',
      '--disk-cache-size=1', '--media-cache-size=1', '--window-size=1100,900',
      ...(SELF_TEST ? ['--headless=new'] : []), 'about:blank'
    ];
    processHandle = spawn(chrome, flags, { windowsHide: SELF_TEST, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolvePromise, reject) => {
      let tail = '';
      const timer = setTimeout(() => reject(Error('Isolated Chrome startup timeout')), 30000);
      const onStderr = data => {
        // Only the local debugging endpoint is used; browser stderr is never printed.
        tail = (tail + data.toString()).slice(-4096);
        const match = tail.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[A-Za-z0-9-]+/);
        if (match) {
          clearTimeout(timer); resolvePromise(match[0]); tail = '';
          processHandle.stderr.removeListener('data', onStderr);
          processHandle.stderr.resume();
        }
      };
      processHandle.stderr.on('data', onStderr);
      processHandle.once('error', () => { clearTimeout(timer); reject(Error('Isolated Chrome launch failed')); });
      processHandle.once('exit', () => { clearTimeout(timer); reject(Error('Isolated Chrome closed')); });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolvePromise, reject) => { socket.addEventListener('open', resolvePromise, { once: true }); socket.addEventListener('error', () => reject(Error('Browser connection failed')), { once: true }); });
    browser = new CDP(socket);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true }));
    socket.addEventListener('close', () => { if (!completed) void finish('browser_closed'); });
    await browser.send('Page.enable', {}, sessionId);
    await browser.send('Runtime.enable', {}, sessionId);
    await browser.send('Network.enable', {}, sessionId);
    // Fresh disposable profile; do not override normal HTTP cache policy.
    await browser.send('Network.setBypassServiceWorker', { bypass: true }, sessionId);
    await browser.send('Runtime.addBinding', { name: BINDING }, sessionId);
    // The control site's code must never see the input, even if that public
    // document changes in future. CDP evaluation remains available while page
    // script execution is disabled; re-enable only after replacing its DOM.
    await browser.send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
    const syntheticBody = SELF_TEST ? syntheticPng().toString('base64') : '';
    browser.handlers.push(async message => {
      if (message.sessionId !== sessionId || completed) return;
      if (message.method === 'Runtime.bindingCalled' && message.params.name === BINDING) {
        if (typeof message.params.payload !== 'string' || message.params.payload.length > 160) return;
        let received;
        try { received = JSON.parse(message.params.payload); } catch { return; }
        if (!received || received.token !== eventToken) return;
        const event = received.event;
        if (!SAFE_EVENTS.has(event)) return;
        if (event === 'started' && phase === 'awaiting_key') { phase = 'awaiting_image'; log('request_started', { status: 'single_image_requested' }); }
        if (event === 'loaded_256' || event === 'loaded_other_size') {
          if (phase !== 'awaiting_image' || !imageRequestConsumed) return;
          const state = await browser.evaluate(`({width:${STATE}.width,height:${STATE}.height,controlLocationMatch:${STATE}.controlLocationMatch})`, sessionId);
          evidence.browserDecodeSucceeded = true;
          evidence.imageWidth = Number.isInteger(state.width) && state.width >= 0 && state.width <= 100000 ? state.width : 0;
          evidence.imageHeight = Number.isInteger(state.height) && state.height >= 0 && state.height <= 100000 ? state.height : 0;
          evidence.controlLocationMatch = state.controlLocationMatch === true;
          phase = event;
          log('image_loaded', { status: event, width: evidence.imageWidth, height: evidence.imageHeight, awaitingVisualConfirmation: true });
        }
        if (event === 'map_confirmed' && phase === 'loaded_256') {
          if (!SELF_TEST && !(evidence.genuineControlDocumentReceived && evidence.controlLocationMatch && evidence.passiveDocumentReplacedInMemory && evidence.referrerOrigin === CONTROL_ORIGIN && evidence.reportedMimeType === 'image/png' && counters.realVworldRequestsContinued === 1 && evidence.tileHttpStatus === 200 && evidence.browserDecodeSucceeded && evidence.imageWidth === 256 && evidence.imageHeight === 256)) return;
          evidence.actualMapUserConfirmed = !SELF_TEST;
          if (!SELF_TEST) await finish('map_confirmed');
        }
        if (event === 'map_not_confirmed') await finish('map_not_confirmed');
        if (event === 'image_error' || event === 'image_timeout' || event === 'cancelled') await finish(event);
      }
      if (message.method === 'Network.responseReceived') {
        const response = message.params.response;
        if (response.url === CONTROL_PAGE && message.params.type === 'Document') {
          evidence.documentHttpStatus = safeStatus(response.status);
          evidence.genuineControlDocumentReceived = response.status === 200 && !SELF_TEST;
        }
        if (ONE_TILE.test(response.url)) {
          evidence.tileHttpStatus = safeStatus(response.status);
          evidence.reportedMimeType = response.mimeType === 'image/png' ? 'image/png' : 'other';
        }
      }
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request, resourceType, frameId } = message.params;
      const fail = () => browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {});
      let url;
      try { url = new URL(request.url); } catch { counters.otherRequestsBlocked++; await fail(); return; }
      if (request.method !== 'GET') { counters.nonGetRequestsBlocked++; await fail(); return; }
      if (url.hostname.endsWith('.workers.dev') || url.hostname === 'workers.dev') { counters.workerRequestsBlocked++; await fail(); return; }
      if (url.hostname === 'api.vworld.kr') {
        if (!imageRequestConsumed && phase === 'awaiting_image' && resourceType === 'Image' && frameId === targetFrame && ONE_TILE.test(request.url)) {
          imageRequestConsumed = true;
          const refererKey = Object.keys(request.headers).find(name => name.toLowerCase() === 'referer');
          if (!refererKey) evidence.referrerOrigin = 'absent';
          else {
            try {
              const referrer = new URL(request.headers[refererKey]);
              evidence.referrerOrigin = referrer.origin === CONTROL_ORIGIN ? CONTROL_ORIGIN : SELF_TEST && referrer.origin === selfTestOrigin ? 'synthetic_local_origin' : 'other';
            } catch { evidence.referrerOrigin = 'invalid'; }
          }
          if (SELF_TEST) {
            counters.syntheticVworldResponses++;
            await browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }, { name: 'Cache-Control', value: 'no-store' }], body: syntheticBody }, sessionId);
          } else {
            counters.realVworldRequestsContinued++;
            counters.externalRequestsContinued++;
            // No request headers, referrer, URL, cookies, or method are overridden.
            await browser.send('Fetch.continueRequest', { requestId }, sessionId);
          }
        } else { counters.vworldRequestsBlocked++; await fail(); }
        return;
      }
      if (/^(?:[abc]\.)?tile\.openstreetmap\.org$/.test(url.hostname)) { counters.osmRequestsBlocked++; await fail(); return; }
      const localSynthetic = SELF_TEST && url.origin === selfTestOrigin && url.pathname === '/' && !url.search;
      const pagesPublic = !SELF_TEST && request.url === CONTROL_PAGE && resourceType === 'Document' && !imageRequestConsumed;
      const dependency = false; // No scripts, frames, styles, or third-party dependencies are permitted.
      // Once key entry becomes possible, only the single VWorld image above
      // may leave this target. Late public/CDN reads must not carry input data.
      if (phase === 'initializing' && (localSynthetic || pagesPublic || dependency)) {
        if (!localSynthetic) counters.externalRequestsContinued++;
        await browser.send('Fetch.continueRequest', { requestId }, sessionId);
      } else { counters.otherRequestsBlocked++; await fail(); }
    });
    // Interception is installed before navigation; the live document is never fulfilled.
    await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
    let targetFrame;
    const navigation = await browser.send('Page.navigate', { url: pageUrl }, sessionId);
    targetFrame = navigation.frameId;
    const readyUntil = Date.now() + 45000;
    let ready = false;
    while (Date.now() < readyUntil && !completed) {
      ready = await browser.evaluate(`location.href===${JSON.stringify(pageUrl)} && document.readyState!=='loading'`, sessionId).catch(() => false);
      if (ready) break;
      await delay(150);
    }
    if (!ready || (!SELF_TEST && !evidence.genuineControlDocumentReceived)) throw Error('Genuine document unavailable');
    evidence.controlLocationMatch = !SELF_TEST && await browser.evaluate(`location.origin===${JSON.stringify(CONTROL_ORIGIN)} && location.pathname==='/'`, sessionId) === true;
    // All control-site scripts were disabled before navigation, and external
    // subresources were blocked. Replace the DOM before enabling our panel.
    let originalScriptBlocked = false;
    {
      if (SELF_TEST) originalScriptBlocked = await browser.evaluate('typeof window.__controlOriginalScriptRan === "undefined"', sessionId) === true;
      await browser.evaluate(`(()=>{for(const target of [window,document]){for(let p=target;p;p=Object.getPrototypeOf(p)){for(const name of Object.getOwnPropertyNames(p)){if(/^on/.test(name)){try{target[name]=null;}catch{}}}}}const clean=document.createElement('html');clean.append(document.createElement('head'),document.createElement('body'));document.replaceChild(clean,document.documentElement);document.title='등록 외 출처 · 도메인 제한 검사';})();void 0`,sessionId);
      await browser.send('Emulation.setScriptExecutionDisabled', { value: false }, sessionId);
      evidence.passiveDocumentReplacedInMemory = true;
    }
    phase = 'awaiting_key';
    await browser.evaluate(`(${installPanel.toString()})(${JSON.stringify({ state: STATE, binding: BINDING, eventToken, controlOrigin: CONTROL_ORIGIN, synthetic: SELF_TEST, imageTimeoutMs: IMAGE_TIMEOUT_MS })});void 0`, sessionId);
    ttl = setTimeout(() => { void finish('expired'); }, TTL_MS);
    log('harness_ready', { status: 'awaiting_key', mode: SELF_TEST ? 'synthetic_self_test' : 'actual_unregistered_https_origin', genuineControlDocumentReceived: evidence.genuineControlDocumentReceived, controlLocationMatch: evidence.controlLocationMatch, expiresAfterSeconds: TTL_MS / 1000 });
    if (SELF_TEST) {
      await browser.evaluate(`window[${JSON.stringify(BINDING)}](JSON.stringify({token:'UNTRUSTED_SYNTHETIC_EVENT',event:'started'}));void 0`, sessionId);
      await delay(50);
      const unauthenticatedBindingIgnored = phase === 'awaiting_key';
      const emptyInputRejected = await browser.evaluate(`document.getElementById('birdmap-pages-image-check-start').click();${STATE}.phase==='awaiting_key'`, sessionId);
      const noRequestForEmptyInput = counters.syntheticVworldResponses === 0 && counters.realVworldRequestsContinued === 0;
      await browser.evaluate(`document.getElementById('birdmap-pages-image-check-key').value='SYNTHETIC_QA_CREDENTIAL_NOT_VALID';document.getElementById('birdmap-pages-image-check-start').click();void 0`, sessionId);
      const deadline = Date.now() + 10000;
      while (phase !== 'loaded_256' && !completed && Date.now() < deadline) await delay(50);
      if (phase !== 'loaded_256') throw Error('Synthetic decode failed');
      await browser.evaluate(`(()=>{const duplicate=new Image();duplicate.src='https://api.vworld.kr/req/wmts/1.0.0/SECOND_SYNTHETIC_QA_CREDENTIAL_NOT_VALID/Base/8/100/218.png';fetch('https://synthetic-harness-block.workers.dev/check').catch(()=>{});fetch(location.href,{method:'POST',body:'synthetic'}).catch(()=>{});})();void 0`, sessionId);
      await delay(300);
      selfTestChecks = {
        originalControlScriptNeverExecuted: originalScriptBlocked,
        fetchedDomReplacedBeforeInput: evidence.passiveDocumentReplacedInMemory,
        originalWindowHandlersRemoved: await browser.evaluate(`window.dispatchEvent(new Event('resize'));window.dispatchEvent(new MessageEvent('message'));typeof window.__controlOriginalHandlerRan==='undefined'`,sessionId) === true,
        emptyInputRejected: emptyInputRejected === true, noRequestForEmptyInput,
        syntheticImageDecoded256: evidence.browserDecodeSucceeded && evidence.imageWidth === 256 && evidence.imageHeight === 256,
        exactlyOneSyntheticResponse: counters.syntheticVworldResponses === 1,
        duplicateRequestBlocked: counters.vworldRequestsBlocked >= 1,
        nonGetBlocked: counters.nonGetRequestsBlocked >= 1, workerBlocked: counters.workerRequestsBlocked >= 1,
        noActualApiRequest: counters.realVworldRequestsContinued === 0,
        noExternalRequestContinued: counters.externalRequestsContinued === 0,
        noActualPagesProofClaim: !evidence.genuineControlDocumentReceived && !evidence.controlLocationMatch,
        noPngSignatureProofClaim: evidence.pngSignatureVerified === false,
        noDomainRestrictionProofClaim: evidence.registeredDomainRestrictionVerified === false,
        unauthenticatedBindingIgnored
      };
      // Exercise live-mode click protection in this same fully synthetic target.
      // No key is entered and no image request is made by this replacement panel.
      const livePanelOptions = { state: STATE, binding: BINDING, eventToken, controlOrigin: CONTROL_ORIGIN, synthetic: false, imageTimeoutMs: IMAGE_TIMEOUT_MS };
      selfTestChecks.untrustedLiveConfirmationRejected = await browser.evaluate(`(${installPanel.toString()})(${JSON.stringify(livePanelOptions)});${STATE}.phase='loaded_256';document.getElementById('birdmap-pages-image-check-yes').disabled=false;document.getElementById('birdmap-pages-image-check-no').disabled=false;document.getElementById('birdmap-pages-image-check-yes').click();document.getElementById('birdmap-pages-image-check-no').click();${STATE}.phase==='loaded_256'&&${STATE}.actualMapUserConfirmed===false`, sessionId) === true;
      await finish(Object.values(selfTestChecks).every(value => value === true) ? 'self_test_passed' : 'self_test_failed');
    }
    await finished;
  } catch {
    await finish('harness_error');
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

await main().catch(() => { log('finished', { status: 'harness_error', detailsSuppressed: true }); process.exitCode = 1; });
