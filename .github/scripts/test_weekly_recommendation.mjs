/* '이번주 어디 갈까' 주간 추천 로직 회귀 테스트.
   index.html의 실제 함수 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_weekly_recommendation.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* index.html에서 함수 하나를 중괄호 균형으로 잘라온다. */
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
  'weeklyKstDateParts', 'weeklyDateFromText', 'weeklyDateTextFromUtc', 'weeklyTodayDateText',
  'weeklyInfo', 'weeklyDateInRange', 'weeklyMonthForDate', 'weeklyDateLabel',
  'weeklyNowKstMinutes', 'weeklySampleMinutes', 'weeklySampleTimeText', 'weeklySampleDateText',
  'weeklySunTimes', 'weeklyWeekSite', 'weeklyDaySamples', 'weeklyDaylightCandidates',
  'weeklyDailyBestSample', 'weeklyBestWeatherDay', 'weeklySampleAsWeather',
  'todayIsEastWindDirection', 'v24WaveNumber', 'todayWeatherCautionNote',
  'weeklyEastWindFromWeek', 'weeklyHighTideEvents', 'weeklyBestMudflatTide',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 함수를 평가한다. */
function loadApi(state = {}) {
  const source = NAMES.map(functionSource).join('\n');
  const tideRules = HTML.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0];
  const factory = new Function(
    'ctx',
    'var weatherWeek=ctx.weatherWeek||null;var tideMonth=ctx.tideMonth||null;' +
    'function monthTideForSite(id){return tideMonth&&tideMonth.sites?tideMonth.sites[String(id)]||null:null;}' +
    'function todayKstMonth(){return ctx.month||9;}' +
    tideRules + '\n' + source + '\n' +
    'return {' + NAMES.join(',') + ',setWeek:function(w){weatherWeek=w;}};'
  );
  return factory(state);
}

const SITE = { id: '19', name: '유부도', lat: 36.0, lon: 126.6, region: '충남 서천' };
const POHANG = {
  id: '49', name: '호미곶', lat: 36.076, lon: 129.566, region: '경북 포항', sido: '경북', sigungu: '포항',
  birdingFeature: '이동성 조류;해안', env: '동해 해안', weatherRuleKey: 'coastal_seabird',
};

function sample(time, score, extra = {}) {
  return Object.assign({
    forecastTime: time, windSpeed: 3, windDirectionDeg: 90, windName: '동풍', gust: 5,
    precipitation3h: 0, temperature: 20, visibilityKm: 15, cloudPct: 20, waveM: null,
    score, grade: '★★★★★', scoreEligible: true, missingScoreFields: [], isPastAtGeneration: false,
  }, extra);
}

function weekDoc(siteId, days, name = '테스트') {
  const sites = {};
  sites[String(siteId)] = {
    name, ruleKey: 'general_birding',
    fieldSources: { atmosphere: 'windy', visibility: 'open_meteo', wave: null },
    fallbackSource: 'open_meteo',
    days: Object.fromEntries(Object.entries(days).map(([d, s]) => [d, { samples: s }])),
  };
  return { startDate: Object.keys(days)[0], endDate: Object.keys(days).slice(-1)[0], sites };
}

/* 오늘이 아닌 날짜여야 '오늘 과거시간 제외'가 개입하지 않는다. */
function futureDate(offsetDays = 3) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const v = {};
  p.forEach((part) => { v[part.type] = part.value; });
  return `${v.year}-${v.month}-${v.day}`;
}

test('일출·일몰이 공표된 서울 하지/동지 값과 일치한다', () => {
  const api = loadApi();
  const summer = api.weeklySunTimes(37.5665, 126.978, '2026-06-21');
  const winter = api.weeklySunTimes(37.5665, 126.978, '2026-12-21');
  assert.equal(summer.riseMin, 5 * 60 + 11);
  assert.equal(summer.setMin, 19 * 60 + 57);
  assert.equal(winter.riseMin, 7 * 60 + 43);
  assert.equal(winter.setMin, 17 * 60 + 17);
  const equinox = api.weeklySunTimes(37.5665, 126.978, '2026-09-23');
  assert.ok(Math.abs(equinox.setMin - equinox.riseMin - 729) <= 5, '추분 낮 길이는 약 12시간 09분');
});

test('일출~일몰 경계: 06:00 제외, 09:00·18:00 포함, 21:00 제외', () => {
  const date = futureDate();
  const api = loadApi();
  api.setWeek(weekDoc(SITE.id, {
    [date]: [sample(`${date} 06:00 KST`, 95), sample(`${date} 09:00 KST`, 80),
             sample(`${date} 18:00 KST`, 81), sample(`${date} 21:00 KST`, 99)],
  }));
  const sun = api.weeklySunTimes(SITE.lat, SITE.lon, date);
  assert.ok(sun.riseMin > 6 * 60 && sun.riseMin < 9 * 60, '일출이 06:00~09:00 사이여야 이 경계 테스트가 유효');
  assert.ok(sun.setMin > 18 * 60 && sun.setMin < 21 * 60, '일몰이 18:00~21:00 사이여야 이 경계 테스트가 유효');
  const times = api.weeklyDaylightCandidates(SITE, date).map(api.weeklySampleTimeText);
  assert.deepEqual(times, ['09:00', '18:00']);
});

test('동점이면 오전 우선, 오전 안에서는 더 이른 시각', () => {
  const date = futureDate();
  const api = loadApi();
  const pick = (times) => {
    api.setWeek(weekDoc(SITE.id, { [date]: times.map(([time, score]) => sample(`${date} ${time} KST`, score)) }));
    return api.weeklySampleTimeText(api.weeklyDailyBestSample(SITE, date));
  };
  assert.equal(pick([['09:00', 90], ['15:00', 90]]), '09:00');
  assert.equal(pick([['09:00', 90], ['12:00', 90]]), '09:00');
  assert.equal(pick([['12:00', 90], ['15:00', 90]]), '12:00');
  assert.equal(pick([['09:00', 88], ['12:00', 91]]), '12:00', '점수가 높으면 오후라도 선택');
});

test('scoreEligible false 는 후보에서 완전히 제외된다', () => {
  const date = futureDate();
  const api = loadApi();
  api.setWeek(weekDoc(SITE.id, {
    [date]: [sample(`${date} 09:00 KST`, 99, { scoreEligible: false, score: null, missingScoreFields: ['wave'] }),
             sample(`${date} 12:00 KST`, 70)],
  }));
  assert.equal(api.weeklySampleTimeText(api.weeklyDailyBestSample(SITE, date)), '12:00');
});

test('유효 sample 이 없는 날짜와 사이트는 후보에서 빠진다', () => {
  const date = futureDate();
  const api = loadApi();
  api.setWeek(weekDoc(SITE.id, { [date]: [sample(`${date} 21:00 KST`, 99)] }));
  assert.equal(api.weeklyDailyBestSample(SITE, date), null);
  assert.equal(api.weeklyBestWeatherDay(SITE, { dates: [date] }), null);
});

test('오늘은 이미 지난 시각을 대표값으로 고르지 않는다', () => {
  const api = loadApi();
  const today = api.weeklyTodayDateText();
  const nowMinutes = api.weeklyNowKstMinutes();
  const slots = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => sample(`${today} ${String(h).padStart(2, '0')}:00 KST`, 99, { isPastAtGeneration: h * 60 <= nowMinutes }));
  api.setWeek(weekDoc(SITE.id, { [today]: slots }));
  const chosen = api.weeklyDailyBestSample(SITE, today);
  if (chosen) assert.ok(api.weeklySampleMinutes(chosen) > nowMinutes, '오늘 대표값은 현재 시각 이후여야 한다');
  api.weeklyDaylightCandidates(SITE, today).forEach((s) => {
    assert.equal(s.isPastAtGeneration, false);
    assert.ok(api.weeklySampleMinutes(s) > nowMinutes);
  });
});

test('내일 이후는 isPastAtGeneration 이 true 여도 낮 sample 을 사용한다', () => {
  const date = futureDate();
  const api = loadApi();
  api.setWeek(weekDoc(SITE.id, { [date]: [sample(`${date} 09:00 KST`, 93, { isPastAtGeneration: true })] }));
  assert.equal(api.weeklySampleTimeText(api.weeklyDailyBestSample(SITE, date)), '09:00');
});

test('주간 대표 날짜는 최고점, 동점이면 더 가까운 날짜', () => {
  const api = loadApi();
  const a = futureDate(2);
  const b = futureDate(4);
  api.setWeek(weekDoc(SITE.id, {
    [a]: [sample(`${a} 09:00 KST`, 92)],
    [b]: [sample(`${b} 09:00 KST`, 92)],
  }));
  assert.equal(api.weeklyBestWeatherDay(SITE, { dates: [a, b] }).date, a);
  api.setWeek(weekDoc(SITE.id, {
    [a]: [sample(`${a} 09:00 KST`, 88)],
    [b]: [sample(`${b} 09:00 KST`, 94)],
  }));
  assert.equal(api.weeklyBestWeatherDay(SITE, { dates: [a, b] }).date, b);
});

test('9월 동남해안 동풍 mandatory 는 8.0m/s 부터 충족', () => {
  const date = '2026-09-10';
  const week = { dates: [date] };
  const build = (windName, speed, site = POHANG) => {
    const api = loadApi();
    api.setWeek(weekDoc(site.id, { [date]: [sample(`${date} 09:00 KST`, 85, { windName, windSpeed: speed })] }, site.name));
    return api.weeklyEastWindFromWeek(site, week);
  };
  assert.equal(build('동풍', 7.9), null, '7.9m/s 미충족');
  assert.ok(build('동풍', 8.0), '8.0m/s 충족');
  assert.ok(build('북동풍', 9.5), '북동풍 충족');
  assert.ok(build('남동풍', 10), '남동풍 충족');
  assert.equal(build('서풍', 12), null, '서풍 미충족');
  const other = Object.assign({}, POHANG, { id: '90', region: '충북 옥천', sido: '충북', sigungu: '옥천' });
  assert.equal(build('동풍', 12, other), null, '대상 지역이 아니면 미적용');
  assert.match(build('동풍', 8.0).detailText, /가능성에 주목할 조건으로 추정/, '확정 표현을 쓰지 않는다');
});

test('10월에는 동풍 mandatory 가 적용되지 않는다', () => {
  const date = '2026-10-10';
  const api = loadApi();
  api.setWeek(weekDoc(POHANG.id, { [date]: [sample(`${date} 09:00 KST`, 85, { windName: '동풍', windSpeed: 12 })] }, POHANG.name));
  assert.equal(api.weeklyEastWindFromWeek(POHANG, { dates: [date] }), null);
});

test('갯벌 물때 mandatory 는 기준 조위 이상에서만 충족', () => {
  const date = '2026-09-12';
  const week = { start: date, end: date, dates: [date] };
  const check = (siteId, level) => {
    const api = loadApi({ tideMonth: { sites: { [siteId]: { days: [{ date, highTide: '09:10', highTideLevel: String(level) }] } } } });
    return api.weeklyBestMudflatTide({ id: siteId }, week);
  };
  assert.equal(check('19', 699), null, '유부도 699 미충족');
  assert.ok(check('19', 700), '유부도 700 충족');
  assert.equal(check('107', 849), null, '매향리 849 미충족');
  assert.ok(check('107', 850), '매향리 850 충족');
  assert.equal(check('14', 849), null, '걸매리 849 미충족');
  assert.ok(check('14', 850), '걸매리 850 충족');
  assert.match(check('19', 715).tideText, /715cm/);
});

test('weather_week 가 없으면 주간 헬퍼가 예외 없이 빈 결과를 준다', () => {
  const api = loadApi();
  assert.deepEqual(api.weeklyDaySamples(SITE, futureDate()), []);
  assert.deepEqual(api.weeklyDaylightCandidates(SITE, futureDate()), []);
  assert.equal(api.weeklyDailyBestSample(SITE, futureDate()), null);
  assert.equal(api.weeklyBestWeatherDay(SITE, api.weeklyInfo()), null);
  assert.equal(api.weeklyEastWindFromWeek(POHANG, api.weeklyInfo()), null);
});

test('주간 창은 오늘부터 7일이며 과거 날짜를 포함하지 않는다', () => {
  const api = loadApi();
  const week = api.weeklyInfo();
  assert.equal(week.dates.length, 7);
  assert.equal(week.start, api.weeklyTodayDateText());
  assert.equal(week.dates[0], week.start);
  assert.equal(week.dates[6], week.end);
  week.dates.forEach((d) => assert.ok(d >= week.start));
});

test('실제 weather_week.json 으로 대표 sample 을 뽑을 수 있다', () => {
  const week = JSON.parse(readFileSync(join(ROOT, 'weather_week.json'), 'utf8'));
  const api = loadApi({ weatherWeek: week });
  const siteData = JSON.parse(HTML.slice(HTML.indexOf('var siteData=') + 'var siteData='.length).match(/^\[[\s\S]*?\}\]/)[0]);
  const site = siteData.find((s) => String(s.id) === '19');
  assert.ok(site, 'siteData에 유부도가 있어야 한다');
  const dates = Object.keys(week.sites['19'].days);
  let daylightTotal = 0;
  dates.forEach((date) => {
    const candidates = api.weeklyDaylightCandidates(site, date);
    daylightTotal += candidates.length;
    candidates.forEach((s) => {
      assert.equal(api.weeklySampleDateText(s), date, 'sample 날짜가 day key와 같아야 한다');
      assert.equal(s.scoreEligible, true);
    });
    const best = api.weeklyDailyBestSample(site, date);
    if (best) assert.ok(candidates.every((s) => Number(s.score) <= Number(best.score)));
  });
  assert.ok(daylightTotal > 0, '실제 자료에서 낮 시간 후보가 나와야 한다');
  const bestDay = api.weeklyBestWeatherDay(site, { dates });
  assert.ok(bestDay && dates.includes(bestDay.date));
  const weather = api.weeklySampleAsWeather(site, bestDay.sample, bestDay.date);
  assert.match(weather.wind, /m\/s$/);
  assert.equal(weather._weatherState.scoreEligible, true);
});
