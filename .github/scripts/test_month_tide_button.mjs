/* '한 달 조석 보기' 버튼 노출 대상 회귀 테스트.
   index.html의 실제 MONTH_TIDE_SITE_IDS와 monthTideButtonHtml()을 그대로 꺼내
   tide_month.json의 실제 월간 대상과 일치하는지 확인한다.
   실행: node --test .github/scripts/test_month_tide_button.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const MONTH = JSON.parse(readFileSync(join(ROOT, 'tide_month.json'), 'utf8'));

function functionSource(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'index.html에 함수가 없습니다: ' + name);
  let depth = 0;
  let quote = null;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    const c = HTML[i];
    const prev = HTML[i - 1];
    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && HTML[i + 1] === '*') { i = HTML.indexOf('*/', i) + 1; continue; }
    if (c === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('중괄호가 맞지 않습니다: ' + name);
}

const siteCtx = {};
new Function('c',
  HTML.match(/var siteData=([^\n]+);/)[0] + '\n' +
  HTML.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0] + 'c.sites=siteData;')(siteCtx);
const SITES = siteCtx.sites;

const api = new Function(
  HTML.match(/var MONTH_TIDE_SITE_IDS=new Set\(\[.*?\]\);/)[0] + '\n' +
  'function escapeHtml(value){return String(value);}\n' +
  functionSource('monthTideButtonHtml') + '\n' +
  'return {monthTideButtonHtml:monthTideButtonHtml,ids:MONTH_TIDE_SITE_IDS};')();

const MONTH_IDS = new Set(Object.keys(MONTH.sites));
const siteById = (id) => SITES.find((s) => String(s.id) === String(id));
const shows = (site) => api.monthTideButtonHtml(site) !== '';

test('월간 조석 대상 ID 집합이 tide_month.json과 정확히 일치한다', () => {
  assert.deepEqual(
    [...api.ids].map(Number).sort((a, b) => a - b),
    [...MONTH_IDS].map(Number).sort((a, b) => a - b),
  );
  assert.equal(api.ids.size, MONTH_IDS.size);
});

test('ID 188 이천항에서 한 달 조석 보기 버튼이 표시된다', () => {
  const site = siteById('188');
  assert.ok(site, 'siteData에 ID 188이 있어야 한다');
  assert.equal(site.name, '이천항');
  assert.equal(site.showTide, true, '조석 영역 자체가 렌더되는 site여야 한다');
  assert.ok(MONTH_IDS.has('188'), 'tide_month.json에 월간 자료가 있어야 한다');
  const html = api.monthTideButtonHtml(site);
  assert.notEqual(html, '', '버튼이 표시되어야 한다');
  assert.match(html, /한 달 조석 보기/);
  assert.match(html, /openMonthTideModal\('188'\)/, '자기 site id로 모달을 열어야 한다');
});

test('기존 월간 대상 27곳의 버튼 노출이 그대로 유지된다', () => {
  const previous = ['9', '107', '12', '156', '14', '17', '122', '19', '146', '20', '21', '22',
    '96', '95', '68', '99', '70', '26', '25', '71', '72', '76', '27', '75', '50', '43', '44'];
  assert.equal(previous.length, 27);
  for (const id of previous) {
    const site = siteById(id);
    assert.ok(site, 'siteData에 ID ' + id + '이 있어야 한다');
    assert.ok(shows(site), 'ID ' + id + ' ' + site.name + ' 버튼이 사라지면 안 된다');
  }
});

test('월간 대상이 아닌 site에는 버튼이 생기지 않는다', () => {
  const outside = SITES.filter((s) => !MONTH_IDS.has(String(s.id)));
  assert.ok(outside.length > 0);
  const leaked = outside.filter(shows).map((s) => s.id + '(' + s.name + ')');
  assert.deepEqual(leaked, [], '비대상 site에 버튼이 새로 생기면 안 된다');
  /* 대표 비대상 몇 곳을 이름으로도 못박아 둔다. */
  for (const id of ['1', '2', '4']) {
    const site = siteById(id);
    if (site && !MONTH_IDS.has(String(site.id))) assert.equal(shows(site), false, id + ' ' + site.name);
  }
});

test('버튼이 나오는 site 수가 월간 대상 수와 같다', () => {
  const shown = SITES.filter(shows);
  assert.equal(shown.length, MONTH_IDS.size);
  assert.equal(shown.length, 28);
  assert.ok(shown.every((s) => s.showTide === true), '조석 영역이 없는 site가 섞이면 안 된다');
});

/* ---- L04: 월간 조석 모달 제목은 생성 당시 과거 명칭이 아니라 현재 탐조지명을 쓴다 ---- */

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome', process.env.CHROME_PATH]
  .filter(Boolean).find((path) => existsSync(path));

/* 실제 index.html 을 Chromium 으로 띄워 모달 제목을 DOM 에서 읽는다(L01 과 같은 방식, 새 의존성 없음). */
async function modalTitle(siteId, { monthName, blankRuntimeName = false } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'birdmap-l04-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--no-sandbox',
    '--disable-gpu', '--disable-dev-shm-usage', '--user-data-dir=' + profile, 'about:blank'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools 미기동:\n' + stderr.slice(0, 400))), 30000);
      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
        const match = stderr.match(/ws:\/\/\S+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const socket = new WebSocket(endpoint);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    let seq = 0;
    const pending = new Map();
    const waiters = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      } else if (message.method) {
        waiters.filter((w) => w.method === message.method).forEach((w) => w.resolve());
      }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    const loaded = new Promise((resolve) => waiters.push({ method: 'Page.loadEventFired', resolve }));
    await send('Page.navigate', { url: pathToFileURL(join(ROOT, 'index.html')).href }, sessionId);
    await loaded;
    /* 월간 문서를 메모리에 직접 넣어 loadTideMonth() 가 즉시 resolve 하게 한다(file:// fetch 불가). */
    const fixture = JSON.stringify({
      windowStart: '2026-09-10', windowEnd: '2026-10-10',
      sites: { [String(siteId)]: { siteId: String(siteId), name: monthName, stationName: '평택',
        stationCode: 'DT_0002', days: [{ date: '2026-09-10', highTide: '04:23', highTideLevel: '902.0',
          lowTide: '10:43', lowTideLevel: '122.0', stationCode: 'DT_0002', stale: false }] } },
    });
    const expression = `(async function(){
      tideMonth = ${fixture};
      ${blankRuntimeName ? `siteData.find(function(s){return String(s.id)===${JSON.stringify(String(siteId))};}).name='';` : ''}
      openMonthTideModal(${JSON.stringify(String(siteId))});
      for (var i = 0; i < 5; i++) await new Promise(function(r){setTimeout(r, 0);});
      return document.getElementById('monthTideTitle').textContent;
    })()`;
    const { result, exceptionDetails } = await send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    socket.close();
    return result.value;
  } finally {
    proc.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 임시 프로필 */ }
  }
}

test('ID 14 는 runtime 이름이 걸매리이고 월간 조석 자료에는 과거 명칭이 남아 있다', () => {
  const site = siteById('14');
  assert.ok(site, 'siteData 에 ID 14 가 있어야 한다');
  assert.equal(site.name, '걸매리', 'runtime canonical 명칭');
  assert.equal(MONTH.sites['14'].name, '아산만 삽교호', '월간 JSON 에 남은 생성 당시 명칭');
  assert.equal(MONTH.sites['14'].stationCode, 'DT_0002');
});

test('월간 조석 모달 제목은 과거 명칭이 아니라 현재 탐조지명을 쓴다', { skip: CHROME ? false : 'Chromium 없음' },
  async () => {
    assert.equal(await modalTitle('14', { monthName: '아산만 삽교호' }), '한 달 조석 — 걸매리');
  });

test('이름이 같은 일반 탐조지의 제목은 그대로다', { skip: CHROME ? false : 'Chromium 없음' }, async () => {
  const site = siteById('19');
  assert.equal(site.name, MONTH.sites['19'].name, 'ID 19 는 두 이름이 원래 같다');
  assert.equal(await modalTitle('19', { monthName: site.name }), '한 달 조석 — ' + site.name);
});

test('runtime 이름을 쓸 수 없으면 월간 자료의 이름으로 대체한다', { skip: CHROME ? false : 'Chromium 없음' },
  async () => {
    assert.equal(await modalTitle('14', { monthName: '아산만 삽교호', blankRuntimeName: true }),
      '한 달 조석 — 아산만 삽교호');
  });
