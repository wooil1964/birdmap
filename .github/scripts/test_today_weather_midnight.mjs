/* 자정 전후 '오늘 적합도 미확인' 회귀 테스트.
   index.html 의 실제 함수 소스를 그대로 꺼내 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_today_weather_midnight.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

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
  'weatherTimeMs', 'weatherLatestDue', 'storedWeatherState', 'weatherScoreAllowed',
  'storedWeatherLabel', 'weatherTodayForSite', 'todayWeatherFromWeek',
  'weeklyKstDateParts', 'weeklyDateFromText', 'weeklyDateTextFromUtc', 'weeklyTodayDateText',
  'weeklyNowKstMinutes', 'weeklySampleMinutes', 'weeklySampleDateText', 'weeklySunTimes',
  'weeklyWeekSite', 'weeklyDaySamples', 'weeklyDaylightCandidates', 'weeklyDailyBestSample',
  'weeklySampleAsWeather',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 함수를 평가한다. */
function loadApi(state = {}) {
  const factory = new Function(
    'ctx', 'Date',
    'var weatherToday=ctx.weatherToday||null;var weatherWeek=ctx.weatherWeek||null;' +
    'var siteData=ctx.siteData||[];' +
    NAMES.map(functionSource).join('\n') + '\n' +
    'return {' + NAMES.join(',') + ',setToday:function(v){weatherToday=v;}};'
  );
  const Clock = state.now
    ? class extends Date {
        constructor(...args) { super(...(args.length ? args : [state.now])); }
        static now() { return new Date(state.now).getTime(); }
      }
    : Date;
  return factory(state, Clock);
}

const SITE = { id: '19', name: '유부도', lat: 36.001158, lon: 126.605031 };
const WOLPO = { id: '193', name: '월포리해변', lat: 36.05330278, lon: 126.64626389 };
const HAERI = { id: '126', name: '해리천습지', lat: 35.51132777777778, lon: 126.49810833333333 };

function sample(time, score, extra = {}) {
  return Object.assign({
    forecastTime: time, windSpeed: 3, windDirectionDeg: 90, windName: '북풍', gust: 5,
    precipitation3h: 0, temperature: 20, visibilityKm: 15, cloudPct: 20, waveM: null,
    score, grade: '★★★★★', scoreEligible: true, missingScoreFields: [], isPastAtGeneration: false,
  }, extra);
}

function todayDoc(date, generatedAt, sites) {
  return { date, updated: generatedAt, generatedAt, status: 'ok', sites };
}

function storedDay(date, forecastTime, generatedAt, score) {
  return {
    date, forecastTime, generatedAt, stale: false, scoreEligible: true, score,
    grade: '★★★★★', wind: '북풍 4.7m/s', rain: '강수 없음', temperature: '23.1°C',
    visibility: '19.0km', cloud: '16%', wave: null,
  };
}

function weekDoc(days) {
  const sites = {};
  for (const [siteId, byDate] of Object.entries(days)) {
    sites[siteId] = {
      name: siteId, ruleKey: 'general_birding',
      fieldSources: { atmosphere: 'windy', visibility: 'open_meteo', wave: null },
      days: Object.fromEntries(Object.entries(byDate).map(([d, s]) => [d, { samples: s }])),
    };
  }
  return { startDate: '2026-09-16', endDate: '2026-09-22', generatedAt: '2026-09-16 23:44 KST', sites };
}

/* 실제로 보고된 상황: 2026-09-16 23:44 KST 에 만들어진 일일 자료와 같은 시각의 주간 예보. */
const SAVED_TODAY = todayDoc('2026-09-16', '2026-09-16 23:44 KST', {
  19: storedDay('2026-09-16', '2026-09-16 23:30 KST', '2026-09-16 23:44 KST', 92),
  193: storedDay('2026-09-16', '2026-09-16 23:30 KST', '2026-09-16 23:44 KST', 92),
});
const SAVED_WEEK = weekDoc({
  19: {
    '2026-09-16': [sample('2026-09-16 15:00 KST', 90)],
    '2026-09-17': [sample('2026-09-17 09:00 KST', 88), sample('2026-09-17 12:00 KST', 94)],
  },
  193: {
    '2026-09-16': [sample('2026-09-16 15:00 KST', 90)],
    '2026-09-17': [sample('2026-09-17 09:00 KST', 86)],
  },
});

const BEFORE_MIDNIGHT = '2026-09-16T23:59:00+09:00';
const AFTER_MIDNIGHT = '2026-09-17T00:05:00+09:00';

test('자정 전 23:59 에는 기존 오늘 저장값이 그대로 쓰인다', () => {
  const api = loadApi({ now: BEFORE_MIDNIGHT, weatherToday: SAVED_TODAY, weatherWeek: SAVED_WEEK });
  for (const site of [SITE, WOLPO]) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'today_saved', site.name);
    assert.equal(today.score, 92, site.name);
    assert.equal(api.weatherScoreAllowed(today), true, site.name);
    assert.match(api.storedWeatherLabel(today), /^오늘 저장값 · 예보 2026-09-16 23:30 KST/, site.name);
  }
});

test('자정 직후 저장 일일 자료만으로는 오늘 적합도를 낼 수 없다 (원인 재현)', () => {
  const api = loadApi({ now: AFTER_MIDNIGHT, weatherToday: SAVED_TODAY, weatherWeek: null });
  for (const site of [SITE, WOLPO]) {
    const today = api.weatherTodayForSite(site);
    // 저장 자료의 날짜가 어제라 sameDay 가 깨지고 previous_saved 로 떨어진다.
    assert.equal(today._weatherState.kind, 'previous_saved', site.name);
    assert.equal(api.weatherScoreAllowed(today), false, site.name);
    assert.match(api.storedWeatherLabel(today), /^이전 저장값\(참고\)/, site.name);
  }
});

test('자정 직후 오늘 날짜 주간 예보가 있으면 출처와 예보 시각을 밝히고 적합도를 낸다', () => {
  const api = loadApi({ now: AFTER_MIDNIGHT, weatherToday: SAVED_TODAY, weatherWeek: SAVED_WEEK });
  const expected = { 19: { score: 94, time: '2026-09-17 12:00 KST' }, 193: { score: 86, time: '2026-09-17 09:00 KST' } };
  for (const site of [SITE, WOLPO]) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'week_forecast', site.name);
    assert.equal(today._weatherState.date, '2026-09-17', site.name);
    assert.equal(today.score, expected[site.id].score, site.name);
    assert.equal(today.forecastTime, expected[site.id].time, site.name);
    assert.equal(api.weatherScoreAllowed(today), true, site.name);
    const label = api.storedWeatherLabel(today);
    assert.match(label, /^주간 저장 예보 · 예보 2026-09-17 /, site.name);
    assert.match(label, /· 생성 2026-09-16 23:44 KST$/, site.name);
    // 어제 예보를 오늘 것처럼 쓰지 않는다.
    assert.doesNotMatch(label, /예보 2026-09-16/, site.name);
  }
});

test('오늘 예보가 없거나 필수값이 모자라면 미확인을 유지한다', () => {
  const cases = {
    '오늘 날짜 자체가 없음': weekDoc({ 19: { '2026-09-16': [sample('2026-09-16 15:00 KST', 90)] } }),
    'samples 비어 있음': weekDoc({ 19: { '2026-09-17': [] } }),
    '필수값 부족(scoreEligible=false)': weekDoc({ 19: { '2026-09-17': [sample('2026-09-17 09:00 KST', 88, { scoreEligible: false, missingScoreFields: ['visibilityKm'] })] } }),
    '점수 없음': weekDoc({ 19: { '2026-09-17': [sample('2026-09-17 09:00 KST', null)] } }),
    '주간 문서 자체가 없음': null,
  };
  for (const [name, week] of Object.entries(cases)) {
    const api = loadApi({ now: AFTER_MIDNIGHT, weatherToday: SAVED_TODAY, weatherWeek: week });
    const today = api.weatherTodayForSite(SITE);
    assert.equal(api.weatherScoreAllowed(today), false, name);
    assert.equal(today._weatherState.kind, 'previous_saved', name);
    assert.match(api.storedWeatherLabel(today), /^이전 저장값\(참고\)/, name);
  }
});

test('야간 시간대 예보만 남아 있으면 대체하지 않는다', () => {
  // 주간(일출~일몰) 표본만 오늘 적합도로 쓴다. 기존 규칙을 그대로 따른다.
  const week = weekDoc({ 19: { '2026-09-17': [sample('2026-09-17 03:00 KST', 95), sample('2026-09-17 23:00 KST', 95)] } });
  const api = loadApi({ now: AFTER_MIDNIGHT, weatherToday: SAVED_TODAY, weatherWeek: week });
  assert.equal(api.weatherScoreAllowed(api.weatherTodayForSite(SITE)), false);
});

test('새 일일 자료가 도착하면 주간 대체에서 오늘 저장값으로 되돌아온다', () => {
  const refreshed = todayDoc('2026-09-17', '2026-09-17 00:24 KST', {
    19: storedDay('2026-09-17', '2026-09-17 00:30 KST', '2026-09-17 00:24 KST', 77),
    193: storedDay('2026-09-17', '2026-09-17 00:30 KST', '2026-09-17 00:24 KST', 81),
  });
  const api = loadApi({ now: '2026-09-17T00:40:00+09:00', weatherToday: refreshed, weatherWeek: SAVED_WEEK });
  const expected = { 19: 77, 193: 81 };
  for (const site of [SITE, WOLPO]) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'today_saved', site.name);
    assert.equal(today.score, expected[site.id], site.name);
    assert.equal(api.weatherScoreAllowed(today), true, site.name);
    assert.match(api.storedWeatherLabel(today), /^오늘 저장값 · 예보 2026-09-17 00:30 KST/, site.name);
  }
});

test('저장 일일 자료가 오늘이면 주간 예보로 갈아타지 않는다', () => {
  const refreshed = todayDoc('2026-09-17', '2026-09-17 00:24 KST', {
    19: storedDay('2026-09-17', '2026-09-17 00:30 KST', '2026-09-17 00:24 KST', 60),
  });
  const api = loadApi({ now: '2026-09-17T00:40:00+09:00', weatherToday: refreshed, weatherWeek: SAVED_WEEK });
  const today = api.weatherTodayForSite(SITE);
  assert.equal(today.score, 60);
  assert.equal(today._weatherState.kind, 'today_saved');
});

test('실제 저장 파일로 자정 직후를 재현하면 유부도·월포리해변이 미확인에서 벗어난다', () => {
  const today = JSON.parse(readFileSync(join(ROOT, 'weather_today.json'), 'utf8'));
  const week = JSON.parse(readFileSync(join(ROOT, 'weather_week.json'), 'utf8'));
  // 저장된 날짜의 다음 날을 KST 달력 기준으로 구한다(UTC 로 밀리면 하루가 어긋난다).
  const [y, m, d] = today.date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().slice(0, 10);
  const midnight = nextDate + 'T00:05:00+09:00';
  if (!week.sites['19'] || !week.sites['19'].days[nextDate]) {
    return; // 주간 문서가 다음 날짜를 담고 있지 않은 시점이면 검증 대상이 아니다.
  }
  const api = loadApi({ now: midnight, weatherToday: today, weatherWeek: week });
  const withoutWeek = loadApi({ now: midnight, weatherToday: today, weatherWeek: null });
  for (const site of [SITE, WOLPO]) {
    assert.equal(api.weatherScoreAllowed(withoutWeek.weatherTodayForSite(site)), false, site.name + ' 수정 전 재현');
    const fixed = api.weatherTodayForSite(site);
    assert.equal(fixed._weatherState.kind, 'week_forecast', site.name);
    assert.equal(api.weatherScoreAllowed(fixed), true, site.name);
    assert.ok(String(fixed.forecastTime).startsWith(nextDate), site.name);
  }
});

/* ── 오늘 날짜지만 예보 시각이 오래된 자료(갱신 지연) ────────────────────────────
   2026-09-17 05:35 KST 예정 기상 Actions가 08:13 KST 로 밀린 동안 실제로 일어난 상황이다.
   저장 자료의 날짜는 오늘이라 자정 분기에 걸리지 않지만, 생성 시각이 예정 갱신 시각보다
   앞서 storedWeatherState() 가 today_reference(갱신 지연/재사용)로 판정해 점수를 숨겼다. */
const STALE_TODAY = todayDoc('2026-09-17', '2026-09-17 03:54 KST', {
  126: storedDay('2026-09-17', '2026-09-17 03:45 KST', '2026-09-17 03:54 KST', 92),
  19: storedDay('2026-09-17', '2026-09-17 03:45 KST', '2026-09-17 03:54 KST', 92),
  193: storedDay('2026-09-17', '2026-09-17 03:45 KST', '2026-09-17 03:54 KST', 92),
});
/* 주간 예보 점수는 일부러 92 와 다르게 둔다. 03:45 의 낡은 92 를 그대로 되살리면 실패한다. */
const STALE_WEEK = Object.assign(weekDoc({
  126: { '2026-09-17': [sample('2026-09-17 03:00 KST', 99), sample('2026-09-17 09:00 KST', 71), sample('2026-09-17 12:00 KST', 64)] },
  19: { '2026-09-17': [sample('2026-09-17 03:00 KST', 99), sample('2026-09-17 09:00 KST', 58), sample('2026-09-17 12:00 KST', 66)] },
  193: { '2026-09-17': [sample('2026-09-17 03:00 KST', 99), sample('2026-09-17 12:00 KST', 49)] },
}), { startDate: '2026-09-17', endDate: '2026-09-23', generatedAt: '2026-09-17 03:54 KST' });
const DELAYED_REFRESH = '2026-09-17T08:20:00+09:00'; // 05:35 예정 갱신은 지났고 새 자료는 아직 없다
const STALE_SITES = [HAERI, SITE, WOLPO];

test('오늘 날짜라도 예보 시각이 예정 갱신보다 오래되면 일일 자료만으로는 적합도를 낼 수 없다 (원인 재현)', () => {
  const api = loadApi({ now: DELAYED_REFRESH, weatherToday: STALE_TODAY, weatherWeek: null });
  for (const site of STALE_SITES) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'today_reference', site.name);
    assert.equal(today._weatherState.date, '2026-09-17', site.name); // 날짜는 오늘이라 자정 분기가 아니다
    assert.equal(api.weatherScoreAllowed(today), false, site.name);
    assert.match(api.storedWeatherLabel(today), /^오늘 저장값 · 갱신 지연\/재사용\(참고\)/, site.name);
  }
});

test('갱신 지연 구간에도 오늘 주간 예보가 있으면 주간 저장 예보로 대체한다', () => {
  const api = loadApi({ now: DELAYED_REFRESH, weatherToday: STALE_TODAY, weatherWeek: STALE_WEEK });
  const expected = { 126: { score: 71, time: '2026-09-17 09:00 KST' }, 19: { score: 66, time: '2026-09-17 12:00 KST' }, 193: { score: 49, time: '2026-09-17 12:00 KST' } };
  for (const site of STALE_SITES) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'week_forecast', site.name);
    assert.equal(today.score, expected[site.id].score, site.name);
    assert.equal(today.forecastTime, expected[site.id].time, site.name);
    assert.equal(api.weatherScoreAllowed(today), true, site.name);
    const label = api.storedWeatherLabel(today);
    assert.match(label, /^주간 저장 예보 · 예보 2026-09-17 /, site.name);
    assert.match(label, /· 생성 2026-09-17 03:54 KST$/, site.name);
    // 03:45 의 낡은 점수 92 를 현재 점수로 되살리지 않는다.
    assert.notEqual(today.score, 92, site.name);
    assert.doesNotMatch(label, /예보 2026-09-17 03:45/, site.name);
  }
});

test('갱신 지연이어도 오늘 주간 예보가 없거나 쓸 수 없으면 미확인을 유지한다', () => {
  const cases = {
    '주간 문서 자체가 없음': null,
    '오늘 날짜가 없음': weekDoc({ 126: { '2026-09-18': [sample('2026-09-18 09:00 KST', 71)] } }),
    'samples 비어 있음': weekDoc({ 126: { '2026-09-17': [] } }),
    '필수값 부족(scoreEligible=false)': weekDoc({ 126: { '2026-09-17': [sample('2026-09-17 09:00 KST', 71, { scoreEligible: false, missingScoreFields: ['visibilityKm'] })] } }),
    '점수 없음': weekDoc({ 126: { '2026-09-17': [sample('2026-09-17 09:00 KST', null)] } }),
    '남은 예보가 모두 지난 시각': weekDoc({ 126: { '2026-09-17': [sample('2026-09-17 06:00 KST', 71)] } }),
  };
  for (const [name, week] of Object.entries(cases)) {
    const api = loadApi({ now: DELAYED_REFRESH, weatherToday: STALE_TODAY, weatherWeek: week });
    const today = api.weatherTodayForSite(HAERI);
    assert.equal(today._weatherState.kind, 'today_reference', name);
    assert.equal(api.weatherScoreAllowed(today), false, name);
    assert.match(api.storedWeatherLabel(today), /^오늘 저장값 · 갱신 지연\/재사용\(참고\)/, name);
  }
});

test('늦은 일일 자료가 도착하면 갱신 지연 대체에서 오늘 저장값으로 되돌아온다', () => {
  // 실제로 08:13 KST 에 도착한 run 과 같은 구조다.
  const refreshed = todayDoc('2026-09-17', '2026-09-17 08:13 KST', {
    126: storedDay('2026-09-17', '2026-09-17 08:00 KST', '2026-09-17 08:13 KST', 55),
    19: storedDay('2026-09-17', '2026-09-17 08:00 KST', '2026-09-17 08:13 KST', 63),
    193: storedDay('2026-09-17', '2026-09-17 08:15 KST', '2026-09-17 08:13 KST', 47),
  });
  const api = loadApi({ now: '2026-09-17T08:25:00+09:00', weatherToday: refreshed, weatherWeek: STALE_WEEK });
  const expected = { 126: 55, 19: 63, 193: 47 };
  for (const site of STALE_SITES) {
    const today = api.weatherTodayForSite(site);
    assert.equal(today._weatherState.kind, 'today_saved', site.name);
    assert.equal(today.score, expected[site.id], site.name);
    assert.equal(api.weatherScoreAllowed(today), true, site.name);
    assert.match(api.storedWeatherLabel(today), /^오늘 저장값 · 예보 2026-09-17 08:/, site.name);
  }
});

test('실제 저장 파일을 갱신 지연 시각으로 되돌리면 해리천습지·유부도·월포리해변이 미확인에서 벗어난다', () => {
  const real = JSON.parse(readFileSync(join(ROOT, 'weather_today.json'), 'utf8'));
  const week = JSON.parse(readFileSync(join(ROOT, 'weather_week.json'), 'utf8'));
  const date = real.date;
  const sites = [HAERI, SITE, WOLPO];
  if (sites.some(function (s) { return !real.sites[s.id] || !week.sites[s.id] || !week.sites[s.id].days[date]; })) {
    return; // 저장 파일이 세 탐조지의 오늘 자료를 담고 있지 않은 시점이면 검증 대상이 아니다.
  }
  // 05:35 KST 예정 갱신보다 먼저 만들어진 상태로 되돌려 실제 장애 구간을 재현한다.
  const stale = JSON.parse(JSON.stringify(real));
  stale.generatedAt = stale.updated = date + ' 03:54 KST';
  for (const site of sites) {
    const day = stale.sites[site.id];
    day.generatedAt = day.refreshedAt = date + ' 03:54 KST';
    day.forecastTime = date + ' 03:45 KST';
  }
  const now = date + 'T08:20:00+09:00';
  const api = loadApi({ now: now, weatherToday: stale, weatherWeek: week });
  const withoutWeek = loadApi({ now: now, weatherToday: stale, weatherWeek: null });
  for (const site of sites) {
    const before = withoutWeek.weatherTodayForSite(site);
    assert.equal(before._weatherState.kind, 'today_reference', site.name + ' 수정 전 재현');
    assert.equal(withoutWeek.weatherScoreAllowed(before), false, site.name + ' 수정 전 재현');
    const fixed = api.weatherTodayForSite(site);
    if (!api.todayWeatherFromWeek(site)) {
      // 08:20 이후 주간(일출~일몰) 표본이 남아 있지 않은 날이면 미확인 유지가 정상이다.
      assert.equal(api.weatherScoreAllowed(fixed), false, site.name);
      continue;
    }
    assert.equal(fixed._weatherState.kind, 'week_forecast', site.name);
    assert.equal(api.weatherScoreAllowed(fixed), true, site.name);
    assert.ok(String(fixed.forecastTime).startsWith(date), site.name);
    assert.ok(fixed.forecastTime > date + ' 08:20', site.name + ' 지난 시각 예보를 쓰지 않는다');
    assert.match(api.storedWeatherLabel(fixed), /^주간 저장 예보 · 예보 /, site.name);
  }
});
