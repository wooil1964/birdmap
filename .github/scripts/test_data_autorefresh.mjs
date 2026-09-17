/* 기상·조석 저장 자료 자동 새로고침 회귀 테스트.
   index.html 의 실제 함수 소스를 그대로 꺼내 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_data_autorefresh.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const BS = String.fromCharCode(92);

function functionSource(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'index.html에 함수가 없습니다: ' + name);
  let depth = 0;
  let quote = null;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    const c = HTML[i];
    const prev = HTML[i - 1];
    if (quote) {
      if (c === quote && prev !== BS) quote = null;
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

const NAMES = [
  'birdmapDataStamp', 'loadBirdmapData', 'loadWeatherToday', 'loadWeatherWeek',
  'loadTideToday', 'refreshBirdmapData', 'scheduleBirdmapRefresh',
  'kstDateText', 'tideTodayDateText', 'tideTodayIsCurrent',
];

/* index.html 밖에서 오는 것(fetch·document·타이머·다시 그리기 함수)만 주입하고
   나머지는 실제 소스를 그대로 평가한다. */
function loadApi(options = {}) {
  const calls = { popup: 0, todayPanel: 0, tideMonth: 0, fetch: [], intervals: [] };
  const state = { hidden: !!options.hidden, timerId: 0 };
  const factory = new Function(
    'ctx', 'calls', 'state', 'document', 'fetch', 'setInterval', 'clearInterval',
    'var weatherToday=ctx.weatherToday;var weatherWeek=ctx.weatherWeek;var tideToday=ctx.tideToday;' +
    'var recommendationWeatherRules={};' +
    'var BIRDMAP_REFRESH_MS=' + (options.refreshMs || 600000) + ';' +
    'var BIRDMAP_REFRESH_MIN_GAP_MS=' + (options.minGapMs === undefined ? 30000 : options.minGapMs) + ';' +
    'var birdmapDataSeq={};var birdmapRefreshTimer=null;var birdmapLastDataCheck=0;' +
    'var birdmapDataStarted=' + (options.started === false ? 'false' : 'true') + ';' +
    'function refreshOpenBirdPopup(){calls.popup++;}' +
    'function refreshTodayPanelIfOpen(){calls.todayPanel++;}' +
    'function loadRecommendationWeatherRules(){return Promise.resolve();}' +
    'function loadTideMonth(){calls.tideMonth++;return ctx.tideMonthFails?Promise.reject(new Error("no month")):Promise.resolve({sites:{}});}' +
    NAMES.map(functionSource).join('\n') + '\n' +
    'return {' + NAMES.join(',') + ',' +
    'get weatherToday(){return weatherToday;},get weatherWeek(){return weatherWeek;},' +
    'get tideToday(){return tideToday;},get timer(){return birdmapRefreshTimer;}};'
  );
  const api = factory(
    options.ctx || {},
    calls,
    state,
    { get hidden() { return state.hidden; } },
    function (url) {
      calls.fetch.push(url);
      return (options.respond || (() => Promise.reject(new Error('no responder'))))(url, calls.fetch.length);
    },
    function (fn, ms) { calls.intervals.push(ms); return ++state.timerId; },
    function (id) { calls.intervals.push('clear:' + id); }
  );
  api._calls = calls;
  api._state = state;
  return api;
}

const EMPTY_TODAY = { updated: '', source: '', sites: {} };
function doc(stamp, extra = {}) {
  return Object.assign({ generatedAt: stamp, updated: stamp, sites: { 19: { name: '유부도' }, 126: { name: '해리천습지' } } }, extra);
}
function ok(body) { return Promise.resolve({ ok: true, json: () => Promise.resolve(body) }); }
function httpError() { return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }); }

const V1 = '2026-09-17 03:54 KST';
const V2 = '2026-09-17 08:13 KST';

test('발행 시각이 같으면 반영도 다시 그리기도 하지 않는다 (깜빡임 없음)', async () => {
  const current = doc(V1);
  const api = loadApi({
    ctx: { weatherToday: current, weatherWeek: doc(V1), tideToday: doc(V1, { date: '2026-09-17' }) },
    respond: (url) => ok(url.indexOf('tide_today') >= 0 ? doc(V1, { date: '2026-09-17' }) : doc(V1)),
  });
  assert.equal(await api.refreshBirdmapData(true), false);
  assert.equal(api._calls.popup, 0);
  assert.equal(api._calls.todayPanel, 0);
  assert.equal(api.weatherToday, current, '같은 자료인데 전역이 교체됐다');
});

test('새 자료가 오면 전역을 바꾸고 팝업·주간 추천을 한 번만 다시 그린다', async () => {
  const api = loadApi({
    ctx: { weatherToday: doc(V1), weatherWeek: doc(V1), tideToday: doc(V1, { date: '2026-09-17' }) },
    respond: (url) => ok(url.indexOf('tide_today') >= 0 ? doc(V2, { date: '2026-09-17' }) : doc(V2)),
  });
  assert.equal(await api.refreshBirdmapData(true), true);
  assert.equal(api.weatherToday.generatedAt, V2);
  assert.equal(api.weatherWeek.generatedAt, V2);
  assert.equal(api.tideToday.generatedAt, V2);
  // 세 파일이 모두 바뀌어도 다시 그리기는 한 번이다.
  assert.equal(api._calls.popup, 1);
  assert.equal(api._calls.todayPanel, 1);
});

test('통신 실패·잘못된 JSON 이면 마지막 정상 자료를 그대로 둔다', async () => {
  const cases = {
    'HTTP 오류': () => httpError(),
    '네트워크 끊김': () => Promise.reject(new Error('offline')),
    'JSON 파싱 실패': () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) }),
    'sites 없는 문서': () => ok({ generatedAt: V2 }),
    'sites 가 배열': () => ok({ generatedAt: V2, sites: null }),
  };
  for (const [name, respond] of Object.entries(cases)) {
    const good = doc(V1);
    const goodTide = doc(V1, { date: '2026-09-17' });
    const api = loadApi({ ctx: { weatherToday: good, weatherWeek: good, tideToday: goodTide }, respond });
    assert.equal(await api.refreshBirdmapData(true), false, name);
    assert.equal(api.weatherToday, good, name + ' : 기상 자료가 사라졌다');
    assert.equal(api.weatherWeek, good, name + ' : 주간 자료가 사라졌다');
    assert.equal(api.tideToday, goodTide, name + ' : 조석 자료가 사라졌다');
    assert.equal(api._calls.popup, 0, name);
  }
});

test('실패한 다음 확인에서 정상 복구된다', async () => {
  let fail = true;
  const api = loadApi({
    ctx: { weatherToday: doc(V1), weatherWeek: doc(V1), tideToday: doc(V1, { date: '2026-09-17' }) },
    respond: (url) => (fail ? Promise.reject(new Error('offline'))
      : ok(url.indexOf('tide_today') >= 0 ? doc(V2, { date: '2026-09-17' }) : doc(V2))),
  });
  assert.equal(await api.refreshBirdmapData(true), false);
  assert.equal(api.weatherToday.generatedAt, V1);
  fail = false;
  assert.equal(await api.refreshBirdmapData(true), true);
  assert.equal(api.weatherToday.generatedAt, V2);
});

test('늦게 도착한 응답이 더 최신 자료를 덮어쓰지 않는다', async () => {
  let slowResolve;
  let call = 0;
  const api = loadApi({
    ctx: { weatherToday: EMPTY_TODAY },
    respond: () => {
      call++;
      if (call === 1) return new Promise((r) => { slowResolve = () => r({ ok: true, json: () => Promise.resolve(doc(V1)) }); });
      return ok(doc(V2));
    },
  });
  const first = api.loadWeatherToday();   // 느린 첫 요청(오래된 자료)
  const second = api.loadWeatherToday();  // 뒤이은 요청(최신 자료)
  assert.equal(await second, true);
  assert.equal(api.weatherToday.generatedAt, V2);
  slowResolve();                          // 이제야 도착한 옛 응답
  assert.equal(await first, false, '늦게 온 응답이 반영됐다');
  assert.equal(api.weatherToday.generatedAt, V2, '늦게 온 응답이 최신 자료를 덮어썼다');
});

test('탭이 숨겨져 있으면 요청하지 않고 주기 타이머도 걸지 않는다', async () => {
  const api = loadApi({ hidden: true, ctx: { weatherToday: doc(V1) }, respond: () => ok(doc(V2)) });
  assert.equal(await api.refreshBirdmapData(), false);
  assert.equal(api._calls.fetch.length, 0, '숨겨진 탭에서 요청이 나갔다');
  api.scheduleBirdmapRefresh();
  assert.equal(api.timer, null, '숨겨진 탭에 주기 타이머가 걸렸다');
  assert.equal(api._calls.intervals.filter((v) => typeof v === 'number').length, 0);
});

test('최초 로드는 탭이 숨겨져 있어도 자료를 읽는다', async () => {
  const api = loadApi({
    hidden: true,
    ctx: { weatherToday: EMPTY_TODAY, weatherWeek: null, tideToday: EMPTY_TODAY },
    respond: (url) => ok(url.indexOf('tide_today') >= 0 ? doc(V2, { date: '2026-09-17' }) : doc(V2)),
  });
  assert.equal(await api.refreshBirdmapData(true), true);
  assert.equal(api._calls.fetch.length, 3);
  assert.equal(api.weatherToday.generatedAt, V2);
});

test('탭 복귀 때 focus 와 visibilitychange 가 겹쳐도 한 번만 요청한다', async () => {
  const api = loadApi({
    ctx: { weatherToday: doc(V1), weatherWeek: doc(V1), tideToday: doc(V1, { date: '2026-09-17' }) },
    respond: () => ok(doc(V1)),
  });
  await api.refreshBirdmapData();
  const afterFirst = api._calls.fetch.length;
  assert.equal(afterFirst, 3, '첫 확인에서 세 파일을 읽어야 한다');
  await api.refreshBirdmapData(); // visibilitychange 직후 focus
  await api.refreshBirdmapData();
  assert.equal(api._calls.fetch.length, afterFirst, '짧은 간격의 중복 요청이 나갔다');
});

test('최초 로드 전에 들어온 focus 는 같은 파일을 두 번 읽지 않는다', async () => {
  const api = loadApi({
    started: false,
    ctx: { weatherToday: EMPTY_TODAY, weatherWeek: null, tideToday: EMPTY_TODAY },
    respond: (url) => ok(url.indexOf('tide_today') >= 0 ? doc(V2, { date: '2026-09-17' }) : doc(V2)),
  });
  assert.equal(await api.refreshBirdmapData(), false, 'load 전 focus 가 요청을 냈다');
  assert.equal(api._calls.fetch.length, 0);
  assert.equal(await api.refreshBirdmapData(true), true);
  assert.equal(api._calls.fetch.length, 3, '최초 로드에서 세 파일을 한 번씩만 읽어야 한다');
});

test('최소 간격이 지나면 다시 확인한다', async () => {
  const api = loadApi({
    minGapMs: 0,
    ctx: { weatherToday: doc(V1), weatherWeek: doc(V1), tideToday: doc(V1, { date: '2026-09-17' }) },
    respond: () => ok(doc(V1)),
  });
  await api.refreshBirdmapData();
  await api.refreshBirdmapData();
  assert.equal(api._calls.fetch.length, 6);
});

test('보이는 탭에서는 10분 주기 타이머를 건다', () => {
  const api = loadApi({ ctx: {} });
  api.scheduleBirdmapRefresh();
  assert.equal(api._calls.intervals[0], 600000);
  api.scheduleBirdmapRefresh();
  // 다시 부르면 이전 타이머를 지우고 새로 건다(타이머가 쌓이지 않는다).
  assert.ok(api._calls.intervals.some((v) => String(v).startsWith('clear:')));
});

test('캐시된 옛 파일을 그대로 쓰지 않도록 재검증 요청으로 읽는다', () => {
  const source = functionSource('loadBirdmapData');
  assert.match(source, /cache:'no-cache'/, 'no-cache 재검증이 빠졌다');
  for (const name of ['loadWeatherToday', 'loadWeatherWeek', 'loadTideToday']) {
    const fn = functionSource(name);
    assert.match(fn, /loadBirdmapData\(/, name + ' 이 공통 로더를 쓰지 않는다');
    assert.doesNotMatch(fn, /fetch\(/, name + ' 이 직접 fetch 한다');
  }
});

test('조석 daily 가 오늘이 아니면 월간 자료로 보완하고, 한 번도 못 받으면 월간으로 대체한다', async () => {
  const stale = loadApi({
    ctx: { tideToday: EMPTY_TODAY },
    respond: () => ok(doc(V2, { date: '1999-01-01' })),
  });
  assert.equal(await stale.loadTideToday(), true);
  assert.equal(stale._calls.tideMonth, 1, '오래된 daily 인데 월간 자료를 읽지 않았다');

  const missing = loadApi({ ctx: { tideToday: EMPTY_TODAY }, respond: () => httpError() });
  assert.equal(await missing.loadTideToday(), true);
  assert.equal(missing._calls.tideMonth, 1, 'daily 실패 시 월간 대체를 타지 않았다');

  // 이미 정상 조석 자료가 있으면 실패해도 월간을 다시 읽지 않고 기존 값을 유지한다.
  const kept = doc(V1, { date: '2026-09-17' });
  const held = loadApi({ ctx: { tideToday: kept }, respond: () => httpError() });
  assert.equal(await held.loadTideToday(), false);
  assert.equal(held._calls.tideMonth, 0);
  assert.equal(held.tideToday, kept);
});

test('실제 저장 파일도 stamp 로 구분된다', () => {
  const api = loadApi({ ctx: {} });
  const today = JSON.parse(readFileSync(join(ROOT, 'weather_today.json'), 'utf8'));
  const week = JSON.parse(readFileSync(join(ROOT, 'weather_week.json'), 'utf8'));
  const tide = JSON.parse(readFileSync(join(ROOT, 'tide_today.json'), 'utf8'));
  for (const [name, data] of Object.entries({ weather_today: today, weather_week: week, tide_today: tide })) {
    const stamp = api.birdmapDataStamp(data);
    assert.ok(stamp.length > 0, name + ' 의 발행 시각을 읽지 못했다');
    assert.notEqual(stamp, api.birdmapDataStamp({ updated: '', source: '', sites: {} }), name);
  }
  assert.equal(api.birdmapDataStamp(null), '');
  assert.equal(api.birdmapDataStamp({ updated: '', source: '', sites: {} }), '', '빈 초기값은 "자료 없음"이어야 한다');
});
