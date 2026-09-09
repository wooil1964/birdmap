/* M06 회귀: daily 조석을 쓸 수 없을 때 '정확히 오늘 날짜' 월간 조석 fallback을 놓치지 않는지 검증한다.
   index.html의 실제 함수 소스를 그대로 꺼내서 확인한다(로직 복제 금지).
   실행: node --test .github/scripts/test_tide_fallback.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* index.html에서 함수 하나를 중괄호 균형으로 잘라온다(주간 추천 테스트와 같은 방식). */
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

const NAMES = [
  'kstDateText', 'tideTodayDateText', 'tideTodayIsCurrent',
  'v24TideParts', 'v24TideMinutesOfDay', 'v24TideDayEvents',
  'monthTideForSite', 'monthTideDayForSite', 'tideTodayForSite',
  'loadTideMonth', 'loadTideToday',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 실제 함수를 평가한다. */
function loadApi(state = {}) {
  const calls = [];
  const fetchImpl = (url) => {
    calls.push(String(url).split('?')[0]);
    const responder = String(url).includes('tide_month') ? state.monthResponse : state.dailyResponse;
    if (typeof responder === 'function') return responder();
    return Promise.resolve({ ok: true, json: () => Promise.resolve(responder) });
  };
  const Clock = state.now
    ? class extends Date {
        constructor(...args) { super(...(args.length ? args : [state.now])); }
        static now() { return new Date(state.now).getTime(); }
      }
    : Date;
  const factory = new Function(
    'ctx', 'Date', 'fetch',
    'var tideToday=ctx.tideToday||{updated:"",source:"",sites:{}};' +
    'var tideMonth=ctx.tideMonth||null;var tideMonthPending=null;' +
    'var popupRefreshCount=0;' +
    'function refreshOpenBirdPopup(){popupRefreshCount++;}' +
    NAMES.map(functionSource).join('\n') + '\n' +
    'return {' + NAMES.join(',') +
    ',getTideMonth:function(){return tideMonth;}' +
    ',getTideToday:function(){return tideToday;}' +
    ',getPopupRefreshCount:function(){return popupRefreshCount;}};'
  );
  const api = factory(state, Clock, fetchImpl);
  api.fetchCalls = calls;
  return api;
}

const SITE = { id: '19', name: '유부도' };
const TODAY = '2026-09-10';
const NOW = '2026-09-10T05:00:00+09:00';

/* 실제 tide_today.json / tide_month.json과 같은 모양의 최소 fixture. */
function dailyDay(date, extra = {}) {
  return Object.assign({
    name: '유부도', stationName: '장항', stationCode: 'DT_0018', date,
    highTide: '04:23, 16:40', highTideLevel: '702.0, 859.0',
    lowTide: '10:43, 22:52', lowTideLevel: '122.0, 49.0',
    stale: false, source: 'KHOA Tide Forecast OpenAPI',
  }, extra);
}
function monthDay(date, extra = {}) {
  return Object.assign({
    date, highTide: '04:25, 16:44', highTideLevel: '711.0, 863.0',
    lowTide: '10:47, 22:55', lowTideLevel: '120.0, 47.0',
    stationCode: 'DT_0018', stale: false,
  }, extra);
}
function monthDoc(days, siteId = '19') {
  const sites = {};
  sites[siteId] = { siteId, name: '유부도', stationName: '장항', stationCode: 'DT_0018', days };
  return { windowStart: days[0] && days[0].date, windowEnd: days[days.length - 1] && days[days.length - 1].date, sites };
}
function dailyDoc(date, sites) {
  return { date, updated: date + ' 03:20 KST', source: 'KHOA Tide Forecast OpenAPI', sites };
}
const HTTP_FAIL = () => Promise.reject(new Error('network down'));

/* ---------- CASE A: daily HTTP 전체 실패 ---------- */

test('A. daily HTTP 실패 + monthly exact-date 정상 → 월간 fallback을 실제로 불러와 오늘 조석을 쓴다', async () => {
  const api = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: monthDoc([monthDay(TODAY)]) });
  await api.loadTideToday();
  assert.ok(api.fetchCalls.some((u) => u.includes('tide_month.json')), 'monthly endpoint를 요청해야 한다');
  const tide = api.tideTodayForSite(SITE);
  assert.ok(tide, '오늘 조석을 사용할 수 있어야 한다');
  assert.equal(tide.date, TODAY);
  assert.equal(tide.monthFallback, true, '월간 fallback 출처를 표시해야 한다');
  assert.equal(tide.monthFallbackMissing, undefined);
  assert.equal(tide.stationCode, 'DT_0018');
  assert.equal(api.v24TideDayEvents(tide).length, 4);
});

test('B. daily HTTP 실패 + monthly에 오늘 날짜가 없음 → 오늘 조석 사용 불가(미확인)', async () => {
  for (const wrong of ['2026-09-09', '2026-09-11']) {
    const api = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: monthDoc([monthDay(wrong)]) });
    await api.loadTideToday();
    const tide = api.tideTodayForSite(SITE);
    assert.equal(tide.monthFallbackMissing, true, wrong + ' 는 오늘로 쓰면 안 된다');
    assert.equal(tide.monthFallback, undefined);
    assert.equal(api.v24TideDayEvents(tide).length, 0);
  }
});

/* ---------- CASE C/D: daily는 정상이나 특정 site만 누락 ---------- */

test('C. daily root는 오늘이지만 site 누락 + 메모리 monthly exact-date → 월간 값을 쓴다', () => {
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 20: dailyDay(TODAY) }),
    tideMonth: monthDoc([monthDay(TODAY)]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.ok(tide, 'daily에 없더라도 exact-date monthly가 있으면 써야 한다');
  assert.equal(tide.date, TODAY);
  assert.equal(tide.monthFallback, true);
  assert.equal(tide.stationCode, 'DT_0018');
  assert.equal(api.fetchCalls.length, 0, '메모리에 있으므로 추가 요청이 없어야 한다');
});

test('D. daily site 누락 + 메모리 monthly가 다른 날짜뿐 → null', () => {
  for (const wrong of ['2026-09-09', '2026-09-11']) {
    const api = loadApi({
      now: NOW,
      tideToday: dailyDoc(TODAY, { 20: dailyDay(TODAY) }),
      tideMonth: monthDoc([monthDay(wrong)]),
    });
    assert.equal(api.tideTodayForSite(SITE), null, wrong + ' 를 오늘로 차용하면 안 된다');
  }
});

/* ---------- CASE E: daily 우선 ---------- */

test('E. daily site가 정상이면 monthly가 있어도 daily 값을 그대로 쓴다', () => {
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 19: dailyDay(TODAY) }),
    tideMonth: monthDoc([monthDay(TODAY)]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.highTideLevel, '702.0, 859.0', 'daily 값이어야 한다');
  assert.equal(tide.monthFallback, undefined, 'monthly로 덮어쓰면 안 된다');
  assert.equal(tide.staleDaily, undefined);
});

/* ---------- CASE F/G: 사용 불가 자료 ---------- */

test('F. daily site는 있으나 조석값이 자료 없음 + monthly exact-date 유효 → 월간 fallback', () => {
  const unusable = dailyDay(TODAY, { highTide: '정보 없음', highTideLevel: '', lowTide: '', lowTideLevel: '' });
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 19: unusable }),
    tideMonth: monthDoc([monthDay(TODAY)]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.monthFallback, true, '빈 daily object 존재만으로 fallback을 막으면 안 된다');
  assert.equal(api.v24TideDayEvents(tide).length, 4);
});

test('G. monthly에 오늘 row가 있어도 조석값이 없으면 쓰지 않는다', () => {
  const empty = monthDay(TODAY, { highTide: '', highTideLevel: '', lowTide: '', lowTideLevel: '' });
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 20: dailyDay(TODAY) }),
    tideMonth: monthDoc([empty]),
  });
  assert.equal(api.tideTodayForSite(SITE), null, 'row 존재 != 사용 가능한 조석');
});

test('G2. daily도 monthly도 자료 없음이면 기존 daily 표시를 유지한다', () => {
  const unusable = dailyDay(TODAY, { highTide: '', highTideLevel: '', lowTide: '', lowTideLevel: '' });
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 19: unusable }),
    tideMonth: monthDoc([monthDay('2026-09-11')]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.monthFallback, undefined);
  assert.equal(tide.date, TODAY, '기존 daily entry를 그대로 돌려줘야 한다');
});

/* ---------- CASE H: stale exact-date ---------- */

test('H. monthly exact-date가 stale이면 기존 stale 표시 의미를 그대로 보존한다', () => {
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 20: dailyDay(TODAY) }),
    tideMonth: monthDoc([monthDay(TODAY, { stale: true })]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.monthFallback, true, '날짜가 정확하면 stale이어도 쓴다');
  assert.equal(tide.monthFallbackStale, true, '재사용 자료임을 표시해야 한다');
  assert.equal(api.v24TideDayEvents(tide).length, 4);
});

test('H2. daily가 오늘이면 월간 fallback에 daily 갱신 지연 경고를 붙이지 않는다', () => {
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc(TODAY, { 20: dailyDay(TODAY) }),
    tideMonth: monthDoc([monthDay(TODAY)]),
  });
  assert.equal(api.tideTodayForSite(SITE).staleDaily, false, 'daily 파일은 최신인데 지연이라고 하면 안 된다');
});

test('H3. daily root 날짜가 어제면 기존 staleDaily 경고를 그대로 유지한다', () => {
  const api = loadApi({
    now: NOW,
    tideToday: dailyDoc('2026-09-09', { 19: dailyDay('2026-09-09') }),
    tideMonth: monthDoc([monthDay(TODAY)]),
  });
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.monthFallback, true);
  assert.equal(tide.staleDaily, true);
  assert.equal(tide.staleDailyDate, '2026-09-09');
  assert.equal(tide.date, TODAY, '어제 daily를 오늘로 인정하면 안 된다');
});

/* ---------- CASE I/J: 월 경계 ---------- */

test('I/J. 월 경계에서도 그날의 exact row만 쓴다 (9/30, 10/1, 12/31, 1/1, 2/28, 윤년 2/29, 3/1)', () => {
  const boundaries = [
    ['2026-09-30T05:00:00+09:00', '2026-09-30'], ['2026-10-01T05:00:00+09:00', '2026-10-01'],
    ['2026-12-31T05:00:00+09:00', '2026-12-31'], ['2027-01-01T05:00:00+09:00', '2027-01-01'],
    ['2027-02-28T05:00:00+09:00', '2027-02-28'], ['2028-02-29T05:00:00+09:00', '2028-02-29'],
    ['2028-03-01T05:00:00+09:00', '2028-03-01'],
  ];
  for (const [now, date] of boundaries) {
    const neighbour = new Date(new Date(date + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    const api = loadApi({
      now, tideToday: dailyDoc(date, {}), tideMonth: monthDoc([monthDay(neighbour), monthDay(date)]),
    });
    assert.equal(api.kstDateText(), date);
    assert.equal(api.tideTodayForSite(SITE).date, date, date + ' 는 그날 row를 써야 한다');

    const onlyNeighbour = loadApi({ now, tideToday: dailyDoc(date, {}), tideMonth: monthDoc([monthDay(neighbour)]) });
    assert.equal(onlyNeighbour.tideTodayForSite(SITE), null, neighbour + ' 를 ' + date + ' 로 쓰면 안 된다');
  }
});

/* ---------- CASE K/L: 요청 수 ---------- */

test('K. monthly가 이미 메모리에 있으면 추가 fetch 0회', () => {
  const api = loadApi({ now: NOW, tideToday: dailyDoc(TODAY, {}), tideMonth: monthDoc([monthDay(TODAY)]) });
  api.tideTodayForSite(SITE);
  api.tideTodayForSite(SITE);
  assert.equal(api.fetchCalls.length, 0);
});

test('L. daily 실패 후 monthly 요청은 기존 loader 기준 1회뿐이다', async () => {
  const api = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: monthDoc([monthDay(TODAY)]) });
  await Promise.all([api.loadTideToday(), api.loadTideMonth(), api.loadTideMonth()]);
  const monthCalls = api.fetchCalls.filter((u) => u.includes('tide_month.json'));
  assert.equal(monthCalls.length, 1, '같은 월간 JSON을 중복 요청하면 안 된다');
});

test('L2. daily 성공(오늘)이면 monthly를 추가로 요청하지 않는다', async () => {
  const api = loadApi({
    now: NOW, dailyResponse: dailyDoc(TODAY, { 19: dailyDay(TODAY) }), monthResponse: monthDoc([monthDay(TODAY)]),
  });
  await api.loadTideToday();
  assert.equal(api.fetchCalls.filter((u) => u.includes('tide_month.json')).length, 0);
  assert.equal(api.tideTodayForSite(SITE).monthFallback, undefined);
});

test('L3. monthly fetch까지 실패하면 기존처럼 미확인으로 끝난다', async () => {
  const api = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: HTTP_FAIL });
  await api.loadTideToday();
  const tide = api.tideTodayForSite(SITE);
  assert.equal(tide.monthFallbackMissing, true);
  assert.equal(tide.monthFallback, undefined, 'monthly 실패를 성공처럼 표시하면 안 된다');
});

/* ---------- §25: 월간 모달 선행 여부 무관 ---------- */

test('모달을 먼저 열었는지 여부가 오늘 조석 가용성을 바꾸지 않는다', async () => {
  const month = monthDoc([monthDay(TODAY)]);
  /* SCENARIO 1: 월간 모달을 먼저 열어 monthly가 이미 메모리에 있는 상태 */
  const opened = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: month, tideMonth: month });
  await opened.loadTideToday();
  /* SCENARIO 2: 모달을 열지 않아 monthly가 메모리에 없는 상태 */
  const notOpened = loadApi({ now: NOW, dailyResponse: HTTP_FAIL, monthResponse: month });
  await notOpened.loadTideToday();

  const a = opened.tideTodayForSite(SITE);
  const b = notOpened.tideTodayForSite(SITE);
  assert.deepEqual(b, a, 'UI 사용 순서가 데이터 가용성을 결정하면 안 된다');
  assert.equal(a.monthFallback, true);

  /* daily site 누락 경로도 같아야 한다 */
  const daily = dailyDoc(TODAY, { 20: dailyDay(TODAY) });
  const openedMissing = loadApi({ now: NOW, tideToday: daily, tideMonth: month });
  const notOpenedMissing = loadApi({ now: NOW, tideToday: daily, monthResponse: month });
  await notOpenedMissing.loadTideMonth();
  assert.deepEqual(notOpenedMissing.tideTodayForSite(SITE), openedMissing.tideTodayForSite(SITE));
});

/* ---------- stationCode / site ID ---------- */

test('월간 fallback은 같은 site의 stationCode만 쓰고 다른 site row를 빌려오지 않는다', () => {
  const month = monthDoc([monthDay(TODAY)], '20');
  const api = loadApi({ now: NOW, tideToday: dailyDoc(TODAY, {}), tideMonth: month });
  assert.equal(api.tideTodayForSite(SITE), null, '다른 site(20)의 월간 자료를 19에 쓰면 안 된다');
  assert.equal(api.tideTodayForSite({ id: '20', name: '다른곳' }).stationCode, 'DT_0018');
});

test('실제 tide_month.json 구조에서 오늘 exact row를 찾고 stationCode가 daily와 일치한다', () => {
  const month = JSON.parse(readFileSync(join(ROOT, 'tide_month.json'), 'utf8'));
  const daily = JSON.parse(readFileSync(join(ROOT, 'tide_today.json'), 'utf8'));
  const today = daily.date;
  const api = loadApi({ now: today + 'T05:00:00+09:00', tideToday: dailyDoc(today, {}), tideMonth: month });
  let checked = 0;
  for (const [siteId, site] of Object.entries(month.sites)) {
    const tide = api.tideTodayForSite({ id: siteId, name: site.name });
    if (!tide || !tide.monthFallback) continue;
    checked++;
    assert.equal(tide.date, today);
    if (daily.sites[siteId]) assert.equal(tide.stationCode, daily.sites[siteId].stationCode);
  }
  assert.ok(checked > 0, '실데이터에서 exact-date 월간 row를 하나도 찾지 못했다');
});
