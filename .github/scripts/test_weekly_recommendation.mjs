/* '이번주 어디 갈까' 주간 추천 로직 회귀 테스트.
   index.html의 실제 함수 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_weekly_recommendation.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const RULES = JSON.parse(readFileSync(join(ROOT, 'weather_rules.json'), 'utf8'));
const siteContext = vm.createContext({});
vm.runInContext(HTML.match(/var siteData=([^\n]+);/)[0] + '\n' + HTML.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0], siteContext);
const RUNTIME = JSON.parse(JSON.stringify(siteContext.siteData));
const actualWeek = JSON.parse(readFileSync(join(ROOT, 'weather_week.json'), 'utf8'));

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
  'summerPelagicSafety','weeklySummerRecommendationSeason','summerBirdingAxes','summerBalancedRecommendations','summerAxisLabel',
  'weeklyKstDateParts', 'weeklyDateFromText', 'weeklyDateTextFromUtc', 'weeklyTodayDateText',
  'weeklyInfo', 'weeklyDateInRange', 'weeklyMonthForDate', 'weeklyDateLabel',
  'weeklyNowKstMinutes', 'weeklySampleMinutes', 'weeklySampleTimeText', 'weeklySampleDateText',
  'weeklySunTimes', 'weeklyWeekSite', 'weeklyDaySamples', 'weeklyDaylightCandidates',
  'weeklyDailyBestSample', 'weeklyBestWeatherDay', 'weeklySampleAsWeather',
  'todayIsEastWindDirection', 'v24WaveNumber', 'todayWeatherCautionNote', 'v251RainInfo', 'weeklyTideNearestSample', 'weeklyCautionFreeFilter', 'weeklySampleCaution', 'weeklyTideWeather', 'weeklyUsableHighTides', 'weeklyQualifyingHighTides',
  'weeklyEastWindFromWeek', 'weeklyHighTideEvents', 'v24TideMinutesOfDay',
  'weeklyQualifyingHighTides', 'weeklyMudflatTideGateOpen', 'weeklyBestMudflatTide',
  'autumnBirdingAxes', 'autumnRecommendationSeason', 'weeklyPelagicSafety',
  'weeklySeasonForDate', 'weeklyDatePolicy', 'weeklySeasonalBestWeatherDay', 'weeklySeasonQuotaEntries',
  'autumnFieldRank', 'autumnBalancedRecommendations', 'autumnAxisLabel',
  'todayIsAutumnRemoteIsland', 'todaySpringIslandReason', 'weeklyIssueReason',
  'weeklyRecommendationDateLabel', 'weeklyWeatherEntryForSite', 'weeklyRecommendationForSite',
  'weeklyEditorialRecommendations',
  'todayRecommendedSites', 'weeklyEastWindRecommendation', 'v24WindParts', 'v24WindNumber',
  'activeNotice', 'activeNoticeItems', 'noticeLinkedSites', 'kstDateText', 'todayString', 'v23Value',
  'weeklyRecommendationIsSafe', 'weeklyPelagicRecommendationSeason',
  'weeklyWinterRecommendationSeason','winterBirdingAxes','winterRecommendationRank','winterBalancedRecommendations','winterAxisLabel',
  'weeklySpringRecommendationSeason','springBirdingAxes','springGeolmaeriPriority','weeklySampleTimestamp','springWestNorthwestWind',
  'springIslandRainWindCondition','springRecommendationRank','springBalancedRecommendations','springAxisLabel',
  'weeklyRecentReportBonus','weeklyRankScore','weeklyRecentTieBreak','weeklyPanelRecommendations',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 함수를 평가한다. */
function loadApi(state = {}) {
  const source = NAMES.map(functionSource).join('\n');
  const tideRules = HTML.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0];
  const factory = new Function(
    'ctx','Date',
    'var weatherWeek=ctx.weatherWeek||null;var tideMonth=ctx.tideMonth||null;' +
    'var siteData=ctx.siteData||[],weatherToday=ctx.weatherToday||null;' +
    'var loadedNotices=ctx.notices||[],PINNED_BIRDING_ISSUES=[];' +
    'var recommendationWeatherRules=ctx.rules;' +
    'var recentSiteSightings=ctx.recentSiteSightings||{};' + HTML.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0] +
    HTML.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0] +
    [...HTML.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n') +
    HTML.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0] +
    'function monthTideForSite(id){return tideMonth&&tideMonth.sites?tideMonth.sites[String(id)]||null:null;}' +
    'function todayKstMonth(){return ctx.month||9;}' +
    tideRules + '\n' + source + '\n' +
    'return {' + NAMES.join(',') + ',setWeek:function(w){weatherWeek=w;},setSightings:function(v){recentSiteSightings=v;}};'
  );
  const Clock=state.now?class extends Date {constructor(...args){super(...(args.length?args:[state.now]));} static now(){return new Date(state.now).getTime();}}:Date;
  return factory(Object.assign({rules:RULES},state),Clock);
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

/* 9월 동풍·선상 fixture는 날짜를 2026-09-10/11로 고정해야 정책 검증이 성립한다.
   그 날짜가 실행일과 겹치면 '오늘 이미 지난 시각 제외'가 09:00 sample을 지우므로
   테스트 시계도 그 앞날로 함께 고정해 sample이 항상 미래로 남게 한다. */
const SEPTEMBER_FIXTURE_NOW = '2026-09-09T12:00:00+09:00';

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

/* 일출은 여름에 05시대, 일몰은 겨울에 17시대가 되는 것이 정상이므로 고정 시각대를 가정하지 않는다.
   실제 weeklySunTimes() 결과를 기준으로 경계 관계만 검증하고, 테스트 시계와 대상 날짜를 함께
   고정해 실행 날짜·계절·시스템 timezone과 무관하게 같은 결과가 나오게 한다. */
test('일출~일몰 경계: 계산된 일출·일몰 직전은 제외하고 정각과 그 사이는 포함한다', () => {
  const hhmm = (minutes) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  const seasons = [
    ['겨울', '2027-01-10T09:00:00+09:00', '2027-01-15'],
    ['여름', '2027-06-16T09:00:00+09:00', '2027-06-21'],
    ['봄', '2027-03-15T09:00:00+09:00', '2027-03-20'],
    ['가을', '2027-10-10T09:00:00+09:00', '2027-10-15'],
  ];
  for (const [season, now, date] of seasons) {
    const api = loadApi({ now });
    assert.notEqual(api.weeklyTodayDateText(), date, season + ': 대상 날짜가 오늘이면 과거시간 제외가 끼어든다');
    const sun = api.weeklySunTimes(SITE.lat, SITE.lon, date);
    assert.ok(sun && Number.isFinite(sun.riseMin) && Number.isFinite(sun.setMin), season + ': 일출·일몰을 계산하지 못했다');
    /* 기존 구현의 경계 의미 그대로: minutes < riseMin 또는 minutes > setMin 만 제외하므로 양 끝은 포함된다. */
    const points = [[sun.riseMin - 1, false], [sun.riseMin, true], [sun.riseMin + 1, true],
                    [sun.setMin - 1, true], [sun.setMin, true], [sun.setMin + 1, false]];
    api.setWeek(weekDoc(SITE.id, {
      [date]: points.map(([minutes], index) => sample(`${date} ${hhmm(minutes)} KST`, 90 - index)),
    }));
    const times = api.weeklyDaylightCandidates(SITE, date).map(api.weeklySampleTimeText);
    const where = `${season} ${date} 일출 ${hhmm(sun.riseMin)} 일몰 ${hhmm(sun.setMin)}`;
    assert.deepEqual(times, points.filter(([, keep]) => keep).map(([minutes]) => hhmm(minutes)), where);
    assert.ok(!times.includes(hhmm(sun.riseMin - 1)), where + ' : 일출 1분 전이 포함됐다');
    assert.ok(!times.includes(hhmm(sun.setMin + 1)), where + ' : 일몰 1분 후가 포함됐다');
  }
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
    const api = loadApi({ now: SEPTEMBER_FIXTURE_NOW });
    api.setWeek(weekDoc(site.id, { [date]: [sample(`${date} 09:00 KST`, 85, { windName, windSpeed: speed })] }, site.name));
    return api.weeklyEastWindFromWeek(site, week);
  };
  assert.equal(build('동풍', 7.9), null, '7.9m/s 미충족');
  assert.ok(build('동풍', 8.0), '8.0m/s 충족');
  assert.ok(build('북동풍', 9.5), '북동풍 충족');
  assert.ok(build('남동풍', 10), '남동풍 충족');
  for(const wind of ['E','NE','SE'])assert.ok(build(wind,8),wind+' 8.0m/s 충족');
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
  // 일출~일몰 판정에 좌표가 필요하고, 이미 지난 만조는 세지 않으므로 09:10 보다 이른 시계를 쓴다.
  const check = (siteId, level) => {
    const api = loadApi({ now: date + 'T06:00:00+09:00', weatherWeek: weekDoc(siteId, { [date]: [sample(date + ' 09:00 KST', 90)] }), tideMonth: { sites: { [siteId]: { days: [{ date, highTide: '09:10', highTideLevel: String(level) }] } } } });
    return api.weeklyBestMudflatTide({ id: siteId, lat: 36.0, lon: 126.6 }, week);
  };
  assert.equal(check('19', 709), null, '유부도 709 미충족');
  assert.ok(check('19', 710), '유부도 710 충족');
  assert.ok(check('19', 711), '유부도 711 충족');
  assert.equal(check('107', 849), null, '매향리 849 미충족');
  assert.ok(check('107', 850), '매향리 850 충족');
  assert.equal(check('14', 849), null, '걸매리 849 미충족');
  assert.ok(check('14', 850), '걸매리 850 충족');
  assert.match(check('19', 715).tideText, /715cm/);
});

test('월포리해변(193)은 송림갯벌(122)과 같은 갯벌 추천 조건으로 엔진에 연결된다', () => {
  const api = loadApi();
  const wolpo = RUNTIME.find((s) => String(s.id) === '193');
  const songnim = RUNTIME.find((s) => String(s.id) === '122');
  assert.ok(wolpo && songnim);
  assert.equal(wolpo.lat, 36.05330278);
  assert.equal(wolpo.lon, 126.64626389);
  assert.notEqual(wolpo.lat, songnim.lat);
  assert.equal(wolpo.weatherRuleKey, songnim.weatherRuleKey);
  assert.deepEqual(wolpo.seasons, songnim.seasons);
  assert.equal(wolpo.seasonTags, songnim.seasonTags);
  /* 갯벌 축과 물때 정책: 122와 같이 TODAY_MUDFLAT_TIDE_RULES 대상이 아니다. */
  for (const site of [wolpo, songnim]) {
    assert.equal(api.autumnBirdingAxes(site).mudflat, true);
    assert.equal(api.autumnBirdingAxes(site).pelagic, false);
    assert.equal(api.weeklyBestMudflatTide(site, api.weeklyInfo()), null);
  }
  /* 기상 자료가 있으면 두 곳이 같은 계절 정책으로 각각 후보가 된다. */
  const date = futureDate(1);
  const day = { [date]: [sample(`${date} 09:00 KST`, 88)] };
  const doc = weekDoc(wolpo.id, day, wolpo.name);
  doc.sites[songnim.id] = JSON.parse(JSON.stringify(doc.sites[wolpo.id]));
  doc.sites[songnim.id].name = songnim.name;
  const withWeather = loadApi({ siteData: [wolpo, songnim], weatherWeek: doc });
  const week = withWeather.weeklyInfo();
  const entries = [wolpo, songnim].map((s) => withWeather.weeklyRecommendationForSite(s, week));
  entries.forEach((e, i) => {
    assert.ok(e, [wolpo, songnim][i].name + ' 후보 생성');
    assert.equal(e.recommendationDate, date);
    assert.equal(e.score, 88);
    assert.equal(e.isMandatory, false);
  });
  /* 조석·기상 자료가 없으면 적합 판정으로 승격하지 않는다. */
  assert.equal(withWeather.weeklyBestMudflatTide(wolpo, week), null);
  assert.equal(loadApi({ siteData: [wolpo] }).weeklyRecommendationForSite(wolpo, week), null);
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

test('가을 핵심 5곳과 실제 env token 분류', () => {
  const api=loadApi();
  for(const id of [7,8,10,15,20]) {
    const site=RUNTIME.find(s=>Number(s.id)===id);
    assert.deepEqual(api.autumnBirdingAxes(site),{field:true,mudflat:id!==15,pelagic:false});
  }
  for(const env of ['농경지','하천·농경지','간척지','목초지','초지','강변 초지·습지'])
    assert.equal(api.autumnBirdingAxes({env}).field,true,env);
  for(const env of ['간척호','하구','석호·하구','해안·하구','염전'])
    assert.deepEqual(api.autumnBirdingAxes({env}),{field:false,mudflat:false,pelagic:false},env);
  for(const env of ['갯벌','해안·갯벌','간척지·갯벌'])
    assert.equal(api.autumnBirdingAxes({env}).mudflat,true,env);
  assert.equal(api.autumnBirdingAxes({env:'간척지·갯벌'}).field,true);
  for(const name of ['천수만 B지구','영암호 금호호']) {
    const site=RUNTIME.find(s=>s.name===name);
    assert.ok(site);assert.equal(api.autumnBirdingAxes(site).field,false);
  }
});

function candidate(id,axis,score=92,extra={}) {
  return Object.assign({site:{id,name:String(id)},axes:{field:axis==='field',mudflat:axis==='mudflat',pelagic:axis==='pelagic'},
    score,recommendationDate:'2026-09-10',stableOrder:100+Number(id),priority:4,isMandatory:false},extra);
}

test('들판은 score → core → 날짜 → 안정 순서 → ID로 정렬', () => {
  const rank=loadApi().autumnFieldRank;
  const general=candidate(2,'field',100), core=candidate(7,'field',92);
  assert.ok(rank(general,core)<0);
  general.score=92;assert.ok(rank(core,general)<0);
  const near=candidate(20,'field',92,{recommendationDate:'2026-09-09'});
  assert.ok(rank(near,core)<0);
  const stable=candidate(20,'field',92,{stableOrder:0});
  assert.ok(rank(stable,core)<0,'ID가 아닌 기존 순서');
  const equal=candidate(20,'field',92,{stableOrder:core.stableOrder});
  assert.ok(rank(core,equal)<0,'모두 같을 때만 ID');
});

test('선상 분류는 pelagic true만 사용하며 독도를 제외', () => {
  const api=loadApi();
  assert.equal(api.autumnBirdingAxes({pelagic:true,seasons:['봄','겨울']}).pelagic,true);
  assert.equal(api.autumnBirdingAxes({pelagic:false,birdingFeature:'선상탐조',name:'항구 앞바다 해안'}).pelagic,false);
  for(const name of ['독도','호미곶','청림해변']) {
    const site=RUNTIME.find(s=>s.name===name);assert.ok(site);
    assert.equal(api.autumnBirdingAxes(site).pelagic,false);
  }
});

test('선상 추천 3개 기준의 inclusive 경계, 결측과 기존 score rule 독립', () => {
  const api=loadApi(), valid=sample('2026-09-10 09:00 KST',92,{waveM:0.6});
  const boundaries={waveM:[[0.6,true],[0.7,true],[0.8,false]],windSpeed:[[5.9,true],[6,true],[6.1,false]],precipitation3h:[[0,true],[0.1,false],[1,false]]};
  for(const [key,values] of Object.entries(boundaries)) {
    values.forEach(([value,expected])=>assert.equal(api.weeklyPelagicSafety({...valid,[key]:value}),expected,`${key}=${value}`));
    for(const value of [null,undefined,NaN,Infinity,'',false,-1])
      assert.equal(api.weeklyPelagicSafety({...valid,[key]:value}),false,`${key} missing/invalid`);
  }
  assert.equal(api.weeklyPelagicSafety({...valid,scoreEligible:false}),false);
  for(const extra of [{gust:null,visibilityKm:null},{gust:20,visibilityKm:1}])
    assert.equal(api.weeklyPelagicSafety({...valid,...extra}),true,'돌풍/시정은 참고정보');
  assert.equal(loadApi({rules:null}).weeklyPelagicSafety(valid),true);
  const changed=structuredClone(RULES);changed.rules.pelagic_seabird.waveMaxM=0.1;
  assert.equal(loadApi({rules:changed}).weeklyPelagicSafety(valid),true,'추천 gate는 점수 rule과 독립');
});

const PELAGIC={...SITE,id:74,name:'울산 앞바다 선상',pelagic:true,env:'외해·선상',seasons:['봄','겨울']};
test('선상은 safety 먼저 적용 후 daily/weekly 최고점과 동점 순서', () => {
  const a=futureDate(1),b=futureDate(2),week={start:a,end:b,dates:[a,b]};
  const api=loadApi({weatherWeek:weekDoc(74,{
    [a]:[sample(`${a} 09:00 KST`,92,{waveM:0.6}),sample(`${a} 12:00 KST`,95,{waveM:1.8}),sample(`${a} 15:00 KST`,92,{waveM:0.7})],
    [b]:[sample(`${b} 09:00 KST`,92,{waveM:0.6})]
  })});
  const best=api.weeklyBestWeatherDay(PELAGIC,week,api.weeklyPelagicSafety);
  assert.equal(best.date,a);assert.equal(api.weeklySampleTimeText(best.sample),'09:00');
  const entry=api.weeklyRecommendationForSite(PELAGIC,week);
  assert.equal(entry.score,92);assert.equal(entry.recommendationDate,a);assert.equal(entry.recommendationTime,'09:00');
  assert.equal(api.weeklyDailyBestSample({...PELAGIC,lat:NaN},a,api.weeklyPelagicSafety),null);
  api.setWeek(weekDoc(74,{[a]:[sample(`${a} 09:00 KST`,99,{waveM:1.6})]}));
  assert.equal(api.weeklyRecommendationForSite(PELAGIC,week),null);
});

test('선상도 밤/오늘 과거 sample 제외, 다른 날짜 동풍 근거로 위험 sample 승격 금지', () => {
  const api=loadApi(),today=api.weeklyTodayDateText(),later=futureDate(1);
  const site={...PELAGIC,region:'울산',birdingFeature:'선상'};
  api.setWeek(weekDoc(site.id,{
    [today]:[sample(`${today} 09:00 KST`,100,{waveM:0.5,isPastAtGeneration:true}),sample(`${today} 23:00 KST`,100,{waveM:0.5})],
    [later]:[sample(`${later} 09:00 KST`,95,{waveM:1.8,windSpeed:8.5}),sample(`${later} 12:00 KST`,92,{waveM:0.5})]
  }));
  const e=api.weeklyRecommendationForSite(site,{start:today,end:later,dates:[today,later]});
  assert.equal(e.recommendationDate,later);assert.equal(e.recommendationTime,'12:00');assert.equal(e.sample.waveM,0.5);
});

test('soft target은 4/3/1/2, 복합형 dedupe와 mandatory 독점 방지', () => {
  const api=loadApi();
  const fields=[7,8,10,15,20].map(id=>candidate(id,'field',92));
  fields[0].axes.mudflat=true;
  const tides=[19,107,14].map(id=>candidate(id,'mudflat',90,{isMandatory:true,priority:2}));
  const winds=Array.from({length:12},(_,i)=>candidate(200+i,'other',89,{isMandatory:true,priority:3}));
  const ships=[candidate(74,'pelagic'),candidate(75,'pelagic')];
  const input=[...fields,...tides,...ships,...winds],saved=JSON.stringify(input);
  const top=api.autumnBalancedRecommendations(input);
  assert.equal(top.length,10);assert.equal(new Set(top.map(e=>String(e.site.id))).size,10);
  for(const [axis,count] of Object.entries({field:4,mudflat:3,pelagic:1,other:2}))
    assert.equal(top.filter(e=>e.selectedAxis===axis).length,count);
  assert.ok(top.filter(e=>e.isMandatory).length<10);
  assert.equal(top.filter(e=>e.axes.pelagic).length,1);
  assert.equal(JSON.stringify(input),saved,'score/mandatory와 입력 배열 불변');
});

test('들판/갯벌/선상 부족 시 다른 유형으로 채우며 선상 0 허용', () => {
  const api=loadApi();
  const others=Array.from({length:15},(_,i)=>candidate(300+i,'other',92));
  const top=api.autumnBalancedRecommendations([candidate(7,'field'),...others]);
  assert.equal(top.length,10);assert.equal(top.filter(e=>e.axes.pelagic).length,0);
  assert.equal(new Set(top.map(e=>e.site.id)).size,10);
  assert.equal(api.autumnBalancedRecommendations(others.slice(0,2)).length,2);
});

test('weather_week/rules 실패에도 today 일반 추천, 선상만 제외', () => {
  const today=loadApi().weeklyTodayDateText();
  const sites=[{...SITE,id:15,env:'간척호·농경지'},PELAGIC];
  const weatherToday={sites:Object.fromEntries(sites.map(s=>[s.id,{date:today,forecastTime:today+' 12:00 KST',score:92,wind:'동풍 3m/s',rain:'강수 없음'}]))};
  const api=loadApi({weatherToday,siteData:sites,rules:null});
  const top=api.todayRecommendedSites();
  assert.equal(top.length,1);assert.equal(top[0].site.id,15);assert.equal(top[0].score,92);
});

test('공지/동풍 mandatory도 안전한 선상 sample 부재를 우회하지 못한다', () => {
  const date=futureDate(1),site={...PELAGIC,region:'울산',birdingFeature:'선상'};
  const api=loadApi({siteData:[site],notices:[{siteId:site.id}],weatherWeek:weekDoc(site.id,{
    [date]:[sample(`${date} 09:00 KST`,92,{waveM:null,windSpeed:8})]
  })});
  assert.equal(api.weeklyRecommendationForSite(site,{start:date,end:date,dates:[date]}),null);
});

test('물때 날짜에 기상이 없으면 다른 날짜 sample을 복사하지 않고 추천에서 제외한다', () => {
  const a='2026-09-12',b='2026-09-13',week={start:a,end:b,dates:[a,b]};
  const api=loadApi({now:a+'T06:00:00+09:00',weatherWeek:weekDoc(SITE.id,{[b]:[sample(`${b} 09:00 KST`,92)]}),
    tideMonth:{sites:{[SITE.id]:{days:[{date:a,highTide:'03:00,15:00',highTideLevel:'650,720'}]}}}});
  // 물때와 기상·안전은 모두 필수다. 만조 날짜에 유효 예보가 없으면 다른 날짜 예보로 대신하지 않고 제외한다.
  assert.equal(api.weeklyRecommendationForSite(SITE,week),null);
  assert.equal(api.weeklyBestMudflatTide(SITE,week),null);
});

test('원거리 섬 제외/봄 정책과 structured notice linkage 유지', () => {
  const api=loadApi({siteData:RUNTIME,notices:[{content:'교동도 추천'},{siteId:15},{sites:['군산새만금']},{siteIds:[7]}]});
  for(const name of ['백령도','외연도','어청도'])assert.equal(api.todayIsAutumnRemoteIsland({name}),true);
  assert.equal(loadApi({month:4}).todayIsAutumnRemoteIsland({name:'어청도'}),false);
  assert.ok(loadApi({month:4}).todaySpringIslandReason({weatherRuleKey:'island_migrant'}));
  assert.equal(api.weeklyIssueReason({id:8}), '');
  for(const id of [7,15,20])assert.ok(api.weeklyIssueReason({id}));
  assert.equal(loadApi({month:11}).autumnRecommendationSeason(),false);
});

test('전체 inline JavaScript 문법 정상', () => {
  let count=0;
  for(const match of HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if(match[1].trim()){new vm.Script(match[1]);count++;}
  }
  assert.ok(count>=3);
});

test('실데이터 190곳의 가을 추천·선상 안전·score 무변경 및 보고', () => {
  const before=JSON.stringify(actualWeek);
  const api=loadApi({weatherWeek:actualWeek,siteData:RUNTIME,
    tideMonth:JSON.parse(readFileSync(join(ROOT,'tide_month.json'),'utf8')),
    notices:JSON.parse(readFileSync(join(ROOT,'notices.json'),'utf8'))});
  const window=api.weeklyInfo();
  const entries=RUNTIME.map((s,i)=>{const e=api.weeklyRecommendationForSite(s,window);return e&&{...e,stableOrder:i};}).filter(Boolean);
  const fields=entries.filter(e=>e.axes.field&&!e.axes.pelagic).sort(api.autumnFieldRank);
  const ships=RUNTIME.filter(s=>api.autumnBirdingAxes(s).pelagic);
  const safeSamples=ships.flatMap(s=>window.dates.flatMap(d=>api.weeklyDaylightCandidates(s,d).filter(api.weeklyPelagicSafety)));
  const safeSites=ships.filter(s=>api.weeklyBestWeatherDay(s,window,api.weeklyPelagicSafety));
  const top=api.todayRecommendedSites();
  assert.equal(RUNTIME.length,190);assert.equal(top.length,10);
  assert.equal(new Set(top.map(e=>String(e.site.id))).size,top.length);
  assert.ok(top.filter(e=>e.axes.pelagic).length<=1);
  for(const e of top) {
    if(e.sample) {
      assert.equal(e.score,e.sample.score);
      assert.equal(e.recommendationDate,api.weeklySampleDateText(e.sample));
    }
    if(e.axes.pelagic)assert.equal(api.weeklyPelagicSafety(e.sample),true);
  }
  assert.equal(JSON.stringify(actualWeek),before);
  if(process.env.AUTUMN_REPORT==='1')console.log(JSON.stringify({
    generatedAt:actualWeek.generatedAt,checkedAt:new Date().toISOString(),window,
    core:[7,8,10,15,20].map(id=>{const e=fields.find(e=>Number(e.site.id)===id);return {id,name:e?.site.name,date:e?.recommendationDate,time:e?.recommendationTime,score:e?.score,fieldRank:fields.indexOf(e)+1};}),
    top:top.map(e=>({id:e.site.id,name:e.site.name,type:api.autumnAxisLabel(e.axes),slot:e.selectedAxis,date:e.recommendationDate,time:e.recommendationTime,score:e.score,mandatory:e.isMandatory,reasons:e.reasons})),
    pelagic:{evaluated:ships.length,safeSites:safeSites.length,safeSamples:safeSamples.length,selected:top.filter(e=>e.axes.pelagic).map(e=>({name:e.site.name,...e.sample}))}
  },null,2));
});

test('추천 caution은 mandatory/점수와 무관하며 미확인은 별도 상태',()=>{
 const api=loadApi();
 for(const score of [60,65,92,95])for(const isMandatory of [true,false]){
  const entry={score,isMandatory,today:{wave:'1.9m',rain:'강수 없음'},reasons:['공지','물때','동풍']};
  const saved=JSON.stringify(entry);
  assert.equal(api.weeklyRecommendationIsSafe(entry),true);
  assert.equal(JSON.stringify(entry),saved);
  for(const today of [{wave:'2.0m'},{rain:'3시간 강수 10.0mm'},{rain:'강한 비'}])
   assert.equal(api.weeklyRecommendationIsSafe({...entry,today}),false);
 }
 assert.equal(api.weeklyRecommendationIsSafe({today:null,isMandatory:true}),null);
 assert.equal(api.weeklyRecommendationIsSafe({today:{wind:'동풍 3m/s'},isMandatory:true}),null);
});

test('다른 시각의 caution 근거 대신 카드 표시 기상만 판단',()=>{
 const api=loadApi(),date=futureDate(1);
 const safe=sample(`${date} 09:00 KST`,90,{waveM:1});
 const unsafe=sample(`${date} 12:00 KST`,95,{waveM:2.2});
 const entry={site:SITE,recommendationDate:date,recommendationTime:'09:00',sample:safe,
  today:api.weeklySampleAsWeather(SITE,safe,date),cautionText:'다른 시각 현장 탐조 주의',reasons:['12:00 동풍 근거']};
 assert.equal(api.weeklyRecommendationIsSafe(entry),true);
 assert.equal(api.weeklyRecommendationIsSafe({...entry,sample:unsafe,recommendationTime:'12:00',
  today:api.weeklySampleAsWeather(SITE,unsafe,date),cautionText:''}),false);
});

test('최종 선발 전 caution 제외 후 같은 축 보충, 점수 하한선 없음',()=>{
 const date=loadApi().weeklyTodayDateText();
 const sites=Array.from({length:13},(_,i)=>({...SITE,id:300+i,name:'후보'+i,env:i<5?'농경지':i<9?'갯벌':'습지'}));
 const weatherToday={sites:Object.fromEntries(sites.map((s,i)=>[s.id,{date,forecastTime:date+' 12:00 KST',score:i===0?65:i===1?95:60,wind:'동풍 3m/s',wave:i<2||i===5?'2.2m':'1.0m',rain:'강수 없음'}]))};
 const api=loadApi({siteData:sites,weatherToday,notices:[{siteId:300},{siteId:305}]});
 const original=api.weeklyRecommendationForSite(sites[0],api.weeklyInfo());
 assert.equal(original.isMandatory,true);assert.equal(original.score,65);
 const top=api.todayRecommendedSites();
 assert.equal(top.length,10);assert.equal(new Set(top.map(e=>e.site.id)).size,10);
 assert.ok(!top.some(e=>[300,301].includes(e.site.id)));
 assert.ok(top.some(e=>e.score===60));
 assert.ok(top.every(e=>api.weeklyRecommendationIsSafe(e)!==false));
 assert.ok(api.weeklyIssueReason(sites[0]));assert.ok(original.reasons.length);
 assert.equal(top.filter(e=>e.selectedAxis==='mudflat').length,3);
 assert.ok(!top.some(e=>e.site.id===305));assert.ok(top.some(e=>e.site.id===308&&e.selectedAxis==='mudflat'));
 weatherToday.sites[300].wave='1.0m';
 assert.ok(api.todayRecommendedSites().some(e=>e.site.id===300&&e.score===65&&e.isMandatory));
});

test('물때 mandatory 후보의 이유를 남기고 추천 목록에서만 caution 제외',()=>{
 const date=futureDate(1),s={...SITE,env:'갯벌'};
 const doc=weekDoc(s.id,{[date]:[sample(`${date} 15:00 KST`,95,{waveM:2.2})]});
 const api=loadApi({siteData:[s],weatherWeek:doc,tideMonth:{sites:{[s.id]:{days:[{date,highTide:'15:00',highTideLevel:'720'}]}}}});
 // 만조 시각 예보가 위험하면 물때 조건을 충족해도 후보가 아니다. 안전해지면 mandatory 사유와 함께 추천된다.
 assert.equal(api.weeklyRecommendationForSite(s,api.weeklyInfo()),null);
 assert.equal(api.todayRecommendedSites().length,0);
 doc.sites[s.id].days[date].samples[0].waveM=1;
 const entry=api.weeklyRecommendationForSite(s,api.weeklyInfo());
 assert.ok(entry.isMandatory);assert.match(entry.reasons.join(' '),/물때/);
 assert.equal(api.todayRecommendedSites().length,1);
});

test('실데이터 caution 전후 비교와 동풍·공지 보존',()=>{
 const api=loadApi({siteData:RUNTIME,weatherWeek:actualWeek,
  tideMonth:JSON.parse(readFileSync(join(ROOT,'tide_month.json'),'utf8')),
  // 운영 공지의 교체·만료와 무관하게 청림 공지 연계의 안전 판정을 검증한다.
  notices:[{siteId:50,published:true}]});
 const entries=RUNTIME.map((s,i)=>{const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());return e&&{...e,stableOrder:i};}).filter(Boolean);
 const before=api.autumnBalancedRecommendations(entries),after=api.todayRecommendedSites();
 const site=entries.find(e=>String(e.site.id)==='50');
 assert.ok(site.isMandatory);
 // 자동 갱신 예보에서 동풍은 사라질 수 있다. 조건이 있을 때만 사유가 보존되어야 한다.
 const wind=api.weeklyEastWindFromWeek(site.site,api.weeklyInfo());
 assert.equal(site.reasons.includes('🌬️ 9월 동풍 이동기 주목'),!!wind);
 assert.ok(api.weeklyIssueReason(site.site));
 assert.equal(after.length,10);assert.equal(new Set(after.map(e=>e.site.id)).size,10);
 assert.ok(after.every(e=>api.weeklyRecommendationIsSafe(e)!==false));
 if(api.weeklyRecommendationIsSafe(site)===false)assert.ok(!after.some(e=>e.site.id===site.site.id));
 if(process.env.CAUTION_REPORT==='1'){
  const describe=e=>({id:e.site.id,name:e.site.name,type:api.autumnAxisLabel(e.axes),date:e.recommendationDate,time:e.recommendationTime,score:e.score,mandatory:e.isMandatory,caution:api.todayWeatherCautionNote(e.today),slot:e.selectedAxis});
  console.log(JSON.stringify({generatedAt:actualWeek.generatedAt,cheongrim:describe(site),before:before.map(describe),after:after.map(describe),added:after.filter(e=>!before.some(b=>b.site.id===e.site.id)).map(describe)},null,2));
 }
});

test('동풍 mandatory 현장주의는 이슈를 유지하고 다음 갯벌 후보로 보충',()=>{
 const date='2026-09-10',site={...POHANG,id:50,name:'청림해변',env:'해안·갯벌'};// 9월 동풍 정책 fixture: 날짜·시계 고정
 const others=[501,502,503].map(id=>({...SITE,id,name:'안전 갯벌 '+id,env:'갯벌'}));
 const doc=weekDoc(site.id,{[date]:[sample(`${date} 09:00 KST`,65,{windSpeed:8,waveM:2.2})]});
 for(const s of others)Object.assign(doc.sites,weekDoc(s.id,{[date]:[sample(`${date} 09:00 KST`,60,{waveM:1})]}).sites);
 const api=loadApi({now:SEPTEMBER_FIXTURE_NOW,siteData:[site,...others],weatherWeek:doc,notices:[{siteId:50}]});
 const entry=api.weeklyRecommendationForSite(site,api.weeklyInfo());
 assert.ok(entry.isMandatory);assert.match(entry.reasons.join(' '),/동풍/);
 const before=JSON.stringify(entry),top=api.todayRecommendedSites();
 assert.equal(JSON.stringify(entry),before);assert.ok(api.weeklyIssueReason(site));
 assert.deepEqual(top.map(e=>e.site.id),[501,502,503]);
 doc.sites['50'].days[date].samples[0].waveM=1;
 assert.ok(api.todayRecommendedSites().some(e=>e.site.id===50&&e.score===65));
});

test('동풍과 선상 gate는 지역·풍향·풍속에서 독립',()=>{
 const date='2026-09-10',week={start:date,end:date,dates:[date]};
 for(const [region,windName,windSpeed,east,ship] of [
  ['포항','E',7.9,false,false],['포항','E',8,true,false],['울산','NE',9.5,true,false],
  ['부산','SE',10,true,false],['포항','W',12,false,false],['포항','NW',12,false,false],
  ['포항','SW',12,false,false],['강릉','E',12,false,false],['울산','E',5,false,true],['부산','W',4,false,true]
 ]){
  const site={...POHANG,region,sido:region,sigungu:region},s=sample(date+' 09:00 KST',92,{windName,windSpeed,waveM:0.5});
  const api=loadApi({now:SEPTEMBER_FIXTURE_NOW,weatherWeek:weekDoc(site.id,{[date]:[s]})});
  assert.equal(!!api.weeklyEastWindFromWeek(site,week),east);
  assert.equal(api.weeklyPelagicSafety(s),ship);
 }
});

test('봄·가을 선상과 겨울 별도 허용, seasons 무관하며 독도 제외',()=>{
 for(const month of [1,4,5,7,9,10]){
  const date=`2027-${String(month).padStart(2,'0')}-10`,week={start:date,end:date,dates:[date]};
  const site={...PELAGIC,seasons:['겨울'],bestSeason:'겨울'},saved=JSON.stringify(site);
  const api=loadApi({month,weatherWeek:weekDoc(site.id,{[date]:[sample(date+' 09:00 KST',92,{waveM:0.7})]})});
  assert.equal(!!api.weeklyRecommendationForSite(site,week),[1,4,5,9,10].includes(month));
  assert.equal(api.weeklyRecommendationForSite({...site,name:'독도'},week),null);
  assert.equal(JSON.stringify(site),saved);
 }
});

test('강한 동풍 이슈는 안전 선상 날짜·사유로 섞이지 않으며 전부 위험하면 0',()=>{
 const a='2026-09-10',b='2026-09-11',week={start:a,end:b,dates:[a,b]};
 const site={...PELAGIC,region:'울산',birdingFeature:'선상'};
 const unsafe=sample(a+' 09:00 KST',99,{windSpeed:8.5,waveM:0.5});
 const safe=sample(b+' 09:00 KST',88,{windSpeed:5,waveM:0.6,gust:null,visibilityKm:null});
 const api=loadApi({now:SEPTEMBER_FIXTURE_NOW,weatherWeek:weekDoc(site.id,{[a]:[unsafe],[b]:[safe]})});
 assert.ok(api.weeklyEastWindFromWeek(site,week));
 const entry=api.weeklyRecommendationForSite(site,week);
 assert.equal(entry.recommendationDate,b);assert.equal(entry.score,88);
 assert.equal(entry.isMandatory,false);assert.ok(!entry.reasons.some(s=>/동풍/.test(s)));
 assert.equal(api.weeklyRecommendationIsSafe(entry),true);
 api.setWeek(weekDoc(site.id,{[a]:[unsafe]}));
 assert.equal(api.weeklyRecommendationForSite(site,week),null);
});

test('실제 동풍·선상 후보별 gate와 최종 선발 보고',()=>{
 const api=loadApi({weatherWeek:actualWeek,siteData:RUNTIME,
  tideMonth:JSON.parse(readFileSync(join(ROOT,'tide_month.json'),'utf8')),
  notices:JSON.parse(readFileSync(join(ROOT,'notices.json'),'utf8'))});
 const week=api.weeklyInfo();
 const east=RUNTIME.filter(s=>/포항|울산|부산/.test([s.region,s.sido,s.sigungu].join(' '))).map(site=>{
  const wind=api.weeklyEastWindFromWeek(site,week);
  const representative=wind?.sample||api.weeklyBestWeatherDay(site,week)?.sample;
  return {name:site.name,pelagic:site.pelagic===true,time:representative?.forecastTime,wind:representative?.windName,speed:representative?.windSpeed,qualified:!!wind};
 });
 const ships=RUNTIME.filter(s=>s.pelagic===true).map(site=>{
  const best=api.weeklyBestWeatherDay(site,week,api.weeklyPelagicSafety);
  const candidates=week.dates.flatMap(d=>api.weeklyDaylightCandidates(site,d));
  const chosen=best?.sample||api.weeklyBestWeatherDay(site,week)?.sample;
  const excluded=site.name==='독도';
  return {name:site.name,time:chosen?.forecastTime,wind:chosen?.windSpeed,wave:chosen?.waveM,rain:chosen?.precipitation3h,passed:!excluded&&!!best,
   reason:excluded?'독도 제외':best?'통과':'안전 sample 없음',safeSamples:excluded?0:candidates.filter(api.weeklyPelagicSafety).length,
   rejected:{wind:candidates.filter(s=>!Number.isFinite(s.windSpeed)||s.windSpeed<0||s.windSpeed>6).length,
    wave:candidates.filter(s=>!Number.isFinite(s.waveM)||s.waveM<0||s.waveM>0.7).length,
    rain:candidates.filter(s=>!Number.isFinite(s.precipitation3h)||s.precipitation3h!==0).length}};
 });
 const top=api.todayRecommendedSites();
 for(const e of top.filter(e=>e.axes.pelagic)){
  assert.ok(api.weeklyPelagicSafety(e.sample));assert.equal(api.weeklyRecommendationIsSafe(e),true);
  assert.ok(!e.reasons.some(r=>/동풍/.test(r)));
 }
 if(process.env.PELAGIC_REPORT==='1')console.log(JSON.stringify({generatedAt:actualWeek.generatedAt,week,east,ships,
  selected:top.filter(e=>e.axes.pelagic).map(e=>({name:e.site.name,...e.sample})),
  top:top.map(e=>({name:e.site.name,axis:e.selectedAxis,score:e.score,date:e.recommendationDate,time:e.recommendationTime}))},null,2));
});

test('봄 선상도 최대 1곳이며 전부 gate 탈락하면 다른 후보로 보충',()=>{
 const date=futureDate(1),ships=[{...PELAGIC,id:701},{...PELAGIC,id:702}];
 const land=Array.from({length:11},(_,i)=>({...SITE,id:710+i,name:'일반 '+i,env:'산림',seasons:['봄'],birdingFeature:'이동성 조류'}));
 const sites=[...ships,...land],doc={sites:{}};
 for(const s of sites)Object.assign(doc.sites,weekDoc(s.id,{[date]:[sample(date+' 09:00 KST',s.pelagic?95:92,{waveM:0.6})]}).sites);
 const api=loadApi({month:4,siteData:sites,weatherWeek:doc});
 let top=api.todayRecommendedSites();assert.equal(top.length,10);assert.equal(top.filter(e=>e.axes.pelagic).length,1);
 for(const s of ships)doc.sites[s.id].days[date].samples[0].precipitation3h=0.1;
 top=api.todayRecommendedSites();assert.equal(top.length,10);assert.equal(top.filter(e=>e.axes.pelagic).length,0);
 assert.equal(new Set(top.map(e=>e.site.id)).size,10);
});

// 겨울 자료는 합성 fixture다. 현재 9월 실제 예보를 겨울 예보로 바꾸지 않는다.
function winterFixture(extra={}){
 const date='2026-12-10',sites=extra.siteData||RUNTIME,doc={sites:{}};
 for(const s of sites)Object.assign(doc.sites,weekDoc(s.id,{[date]:[
  sample(date+' 06:00 KST',100,{waveM:0.5}),
  sample(date+' 09:00 KST',92,{waveM:0.5}),
  sample(date+' 12:00 KST',92,{waveM:0.5}),
  sample(date+' 18:00 KST',100,{waveM:0.5})
 ]}).sites);
 return {month:12,now:'2026-12-10T08:00:00+09:00',siteData:sites,weatherWeek:doc,...extra};
}

test('겨울 추천 달 경계와 전역 가을/이동기 정의 독립',()=>{
 for(const [date,winter] of [['2026-10-31',false],['2026-11-01',true],['2026-12-31',true],['2027-01-01',true],['2027-02-28',true],['2028-02-29',true],['2027-03-01',false]]){
  const month=Number(date.slice(5,7)),api=loadApi({month,now:date+'T12:00:00+09:00'});
  assert.equal(api.weeklyWinterRecommendationSeason(),winter,date);
  assert.equal(api.weeklyWinterRecommendationSeason(month),winter);
  assert.equal(api.autumnRecommendationSeason(),[9,10].includes(month));
  assert.equal(api.weeklyPelagicRecommendationSeason(),[4,5,9,10].includes(month),'기존 이동기 정의 무변경');
 }
});

test('겨울 실제 핵심 들판 5곳과 습지/해안 복합환경 유지',()=>{
 const api=loadApi(),saved=JSON.stringify(RUNTIME);
 const core={39:['한탄강두루미탐조대','농경지·하천'],15:['천수만 사기리','간척호·농경지'],10:['강화도','갯벌·농경지'],7:['교동도','간척지·갯벌'],20:['군산새만금','간척지·갯벌']};
 for(const [id,[name,env]] of Object.entries(core)){
  const s=RUNTIME.find(s=>String(s.id)===id);assert.equal(s.name,name);assert.equal(s.env,env);
  assert.equal(api.winterBirdingAxes(s).field,true);assert.equal(api.winterBirdingAxes(s).excludedReason,'');
 }
 assert.ok(api.winterBirdingAxes(RUNTIME.find(s=>s.id==='15')).water);
 for(const id of ['7','10','20'])assert.ok(api.winterBirdingAxes(RUNTIME.find(s=>s.id===id)).coast);
 for(const id of ['28','16','29','42','31'])assert.ok(api.winterBirdingAxes(RUNTIME.find(s=>s.id===id)).water);
 assert.equal(JSON.stringify(RUNTIME),saved);
});

test('겨울은 score → core → 날짜 → stable → ID, bonus와 강제 선발 없음',()=>{
 const api=loadApi(),rank=api.winterRecommendationRank;
 const c=candidate(39,'field',92),g=candidate(900,'field',93),saved=JSON.stringify(c);
 assert.ok(rank(g,c)<0);g.score=92;assert.ok(rank(c,g)<0);
 const near={...c,site:{id:15},recommendationDate:'2026-01-01'};assert.ok(rank(near,c)<0);
 const stable={...c,site:{id:20},stableOrder:0};assert.ok(rank(stable,c)<0);
 const same={...c,site:{id:20}};assert.ok(rank(same,c)<0);
 assert.equal(JSON.stringify(c),saved);
 const general=Array.from({length:12},(_,i)=>candidate(900+i,'field',95));
 assert.ok(!api.winterBalancedRecommendations([c,...general]).some(e=>e.site.id===39));
});

test('겨울 3/3/3/최대1과 부족 보충 및 전역 dedupe',()=>{
 const api=loadApi();
 const make=(id,axis)=>({...candidate(id,'other',92),axes:{field:false,water:false,coast:false,pelagic:false,[axis]:true}});
 const entries=['field','water','coast','pelagic'].flatMap((axis,i)=>Array.from({length:4},(_,j)=>make(300+i*10+j,axis)));
 entries[0].axes.water=true;entries[0].axes.coast=true;
 const saved=JSON.stringify(entries),top=api.winterBalancedRecommendations(entries);
 assert.equal(top.length,10);assert.equal(new Set(top.map(e=>e.site.id)).size,10);
 for(const [axis,n] of Object.entries({field:3,water:3,coast:3,pelagic:1}))assert.equal(top.filter(e=>e.selectedAxis===axis).length,n);
 assert.equal(top.filter(e=>e.axes.pelagic).length,1);assert.equal(JSON.stringify(entries),saved);
 const coast=Array.from({length:12},(_,i)=>make(500+i,'coast'));
 assert.equal(api.winterBalancedRecommendations(coast).length,10);
 assert.equal(api.winterBalancedRecommendations(coast.slice(0,2)).length,2);
 assert.equal(api.winterBalancedRecommendations(coast).filter(e=>e.axes.pelagic).length,0);
});

test('겨울 명시 제외는 정확한 ID/이름만, 미등록 7곳을 다른 site로 추정하지 않는다',()=>{
 const api=loadApi(winterFixture());
 for(const id of ['23','30','68']){
  const site=RUNTIME.find(s=>s.id===id);assert.equal(api.winterBirdingAxes(site).excludedReason,'explicit');
  assert.equal(api.weeklyRecommendationForSite(site,api.weeklyInfo()),null);
 }
 const absent=['대저생태공원','해평습지','담양습지','영광 불갑저수지','태평염전','백수해안도로','봉암갯벌'];
 for(const name of absent){
  assert.ok(!RUNTIME.some(s=>s.name===name));
  assert.equal(api.winterBirdingAxes({id:900,name,env:'습지·갯벌'}).excludedReason,'explicit');
 }
 for(const id of ['93','178'])assert.equal(api.winterBirdingAxes(RUNTIME.find(s=>s.id===id)).excludedReason,'');
 for(const name of ['대저생태공원 인근','담양습지 별도','고천암 다른 곳'])
  assert.equal(api.winterBirdingAxes({id:900,name,env:'습지'}).excludedReason,'');
});

test('겨울 섬 예외와 환경 정확 token, 이름으로 산/섬을 추정하지 않음',()=>{
 const api=loadApi();
 for(const id of ['7','10','19','9'])assert.equal(api.winterBirdingAxes(RUNTIME.find(s=>s.id===id)).excludedReason,'');
 for(const id of ['1','4','51','117','124'])assert.equal(api.winterBirdingAxes(RUNTIME.find(s=>s.id===id)).excludedReason,'island');
 for(const env of ['산','산림','도심산림','숲·습지','휴양림','저수지·수목원'])
  assert.equal(api.winterBirdingAxes({id:900,env}).excludedReason,'forest');
 assert.equal(api.winterBirdingAxes({id:900,env:'연근해'}).excludedReason,'marine');
 for(const name of ['새로운도','산이름','숲이름'])assert.equal(api.winterBirdingAxes({id:900,name,env:'농경지'}).field,true);
 for(const env of ['공원','강','하천','강변','유수지','염전','농경지추정'])assert.equal(api.winterBirdingAxes({id:900,env}).excludedReason,'unclassified');
});

test('겨울 선상 5곳은 기존 safety 재사용, 항구 3곳은 육상 coast 유지',()=>{
 const state=winterFixture(),api=loadApi(state),week=api.weeklyInfo();
 for(const id of ['48','62','191','192','74']){
  const site=RUNTIME.find(s=>s.id===id);assert.equal(site.pelagic,true);
  let e=api.weeklyRecommendationForSite(site,week);assert.ok(e.axes.pelagic);assert.ok(api.weeklyPelagicSafety(e.sample));
  assert.equal(e.recommendationTime,'09:00');assert.equal(e.score,92);
  for(const [key,value] of [['windSpeed',6.1],['waveM',0.8],['precipitation3h',0.1],['windSpeed',null],['waveM',NaN],['precipitation3h',undefined]]){
   const original=state.weatherWeek.sites[id].days['2026-12-10'].samples;
   state.weatherWeek.sites[id].days['2026-12-10'].samples=original.map(s=>({...s,[key]:value}));
   assert.equal(api.weeklyRecommendationForSite(site,week),null,`${id} ${key}`);
   state.weatherWeek.sites[id].days['2026-12-10'].samples=original;
  }
 }
 for(const id of ['53','54','55']){
  const site=RUNTIME.find(s=>s.id===id),e=api.weeklyRecommendationForSite(site,week);
  assert.equal(site.pelagic,true);assert.equal(e.axes.pelagic,false);assert.equal(e.axes.coast,true);
 }
 assert.equal(api.weeklyRecommendationForSite(RUNTIME.find(s=>s.id==='52'),week),null);
});

test('겨울 통합: 실제 190 site + 합성 겨울 예보, 10곳/점수/caution/시간/공지 보존',()=>{
 const state=winterFixture({notices:[{siteIds:[39],published:true}]}),api=loadApi(state);
 const saved=JSON.stringify(state),top=api.todayRecommendedSites();
 assert.equal(top.length,10);assert.equal(new Set(top.map(e=>e.site.id)).size,10);
 for(const [axis,n] of Object.entries({field:3,water:3,coast:3,pelagic:1}))assert.equal(top.filter(e=>e.selectedAxis===axis).length,n);
 for(const e of top){assert.equal(e.score,92);assert.equal(e.recommendationTime,'09:00');assert.equal(api.weeklyRecommendationIsSafe(e),true);}
 assert.equal(JSON.stringify(state),saved);
 const core=RUNTIME.find(s=>s.id==='39');
 let e=api.weeklyRecommendationForSite(core,api.weeklyInfo());assert.ok(e.isMandatory);assert.match(e.reasons.join(' '),/이슈/);
 for(const s of state.weatherWeek.sites['39'].days['2026-12-10'].samples){s.waveM=2;s.score=100;}
 e=api.weeklyRecommendationForSite(core,api.weeklyInfo());assert.ok(e.isMandatory);assert.equal(api.weeklyRecommendationIsSafe(e),false);
 assert.ok(!api.todayRecommendedSites().some(e=>e.site.id==='39'));
 for(const s of state.weatherWeek.sites['39'].days['2026-12-10'].samples){s.waveM=0.5;s.score=60;}
 assert.equal(api.weeklyRecommendationIsSafe(api.weeklyRecommendationForSite(core,api.weeklyInfo())),true);
});

test('겨울 today fallback 미확인 의미 유지, 선상 fallback 승격 금지',()=>{
 const site=RUNTIME.find(s=>s.id==='39'),ship=RUNTIME.find(s=>s.id==='48');
 const state=winterFixture({siteData:[site,ship],weatherWeek:null,weatherToday:{sites:{39:{date:'2026-12-10',score:65,wind:'북풍 3m/s'},48:{date:'2026-12-10',score:92,wind:'북풍 3m/s'}}}});
 const api=loadApi(state),top=api.todayRecommendedSites();assert.equal(top.length,1);assert.equal(top[0].site.id,'39');
 assert.equal(api.weeklyRecommendationIsSafe(top[0]),null);
});

test('겨울 실제 환경 분류 전수 보고 (실제 겨울 예보가 아님)',()=>{
 const api=loadApi(),rows=RUNTIME.map(s=>({id:s.id,name:s.name,env:s.env,island:s.island,runtimePelagic:s.pelagic,...api.winterBirdingAxes(s)}));
 const counts=Object.fromEntries(['field','water','coast','pelagic'].map(axis=>[axis,rows.filter(e=>e[axis]).length]));
 const excluded=Object.fromEntries(['explicit','dokdo','island','forest','marine','unclassified'].map(reason=>[reason,rows.filter(e=>e.excludedReason===reason).length]));
 assert.equal(rows.length,190);assert.equal(counts.pelagic,5);assert.equal(excluded.explicit,3);
 if(process.env.WINTER_REPORT==='1')console.log(JSON.stringify({counts,excluded,
  core:rows.filter(e=>['39','15','10','7','20'].includes(e.id)),
  ships:rows.filter(e=>RUNTIME.find(s=>s.id===e.id).pelagic),
  unclassified:rows.filter(e=>e.excludedReason==='unclassified'),
  fixtureTop:loadApi(winterFixture()).todayRecommendedSites().map(e=>({id:e.site.id,name:e.site.name,axis:e.selectedAxis,time:e.recommendationTime,score:e.score}))},null,2));
});

test('겨울 실제 오늘 지난 시각 제외와 선상 inclusive 경계/전부 탈락 보충',()=>{
 const state=winterFixture({now:'2026-12-10T10:00:00+09:00'}),api=loadApi(state);
 for(const id of ['48','62','191','192','74'])for(const s of state.weatherWeek.sites[id].days['2026-12-10'].samples){s.windSpeed=6;s.waveM=0.7;s.precipitation3h=0;}
 let top=api.todayRecommendedSites();assert.equal(top.length,10);
 for(const e of top)assert.equal(e.recommendationTime,'12:00');
 assert.equal(top.filter(e=>e.axes.pelagic).length,1);
 for(const id of ['48','62','191','192','74'])for(const s of state.weatherWeek.sites[id].days['2026-12-10'].samples)s.precipitation3h=0.1;
 top=api.todayRecommendedSites();assert.equal(top.length,10);assert.equal(top.filter(e=>e.axes.pelagic).length,0);
 assert.equal(new Set(top.map(e=>e.site.id)).size,10);
 const rollover=loadApi({month:12,now:'2026-12-31T10:00:00+09:00'}).weeklyInfo();
 assert.equal(rollover.start,'2026-12-31');assert.equal(rollover.end,'2027-01-06');
});

// 합성 봄 예보와 고정 KST clock. 실제 현재 weather_week 날짜를 바꾸지 않는다.
function springFixture(date='2027-05-05',extra={}){
 const sites=extra.siteData||RUNTIME,doc={sites:{}};
 for(const s of sites)Object.assign(doc.sites,weekDoc(s.id,{[date]:[
  sample(date+' 03:00 KST',100,{waveM:0.5}),sample(date+' 09:00 KST',92,{waveM:0.5}),sample(date+' 12:00 KST',92,{waveM:0.5})
 ]}).sites);
 return {month:Number(date.slice(5,7)),now:date+'T08:00:00+09:00',siteData:sites,weatherWeek:doc,...extra};
}

/* 물때 기준이 있는 갯벌 탐조지(유부도 19·걸매리 14·매향리 107)는 적합한 만조가 있어야
   추천 후보가 된다. 물때가 아니라 다른 규칙(봄 우선순위, scoreEligible 등)을 확인하는
   fixture 에는 기준을 넉넉히 넘는 한낮 만조를 깔아 관문을 통과시킨다. */
function qualifyingTideMonth(ids, dates) {
  const sites = {};
  for (const id of ids) sites[String(id)] = { days: dates.map((date) => ({ date, highTide: '12:00', highTideLevel: '999' })) };
  return { sites };
}
function weekDates(start, count = 7) {
  const base = new Date(start + 'T00:00:00Z');
  return Array.from({ length: count }, (_, i) => new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
}

test('봄 추천 3/1~5/31 경계, 3월 선상 미확대',()=>{
 for(const [date,expected] of [['2027-02-28',false],['2028-02-29',false],['2027-03-01',true],['2027-03-20',true],['2027-04-01',true],['2027-05-01',true],['2027-05-31',true],['2027-06-01',false]]){
  const api=loadApi(springFixture(date));assert.equal(api.weeklySpringRecommendationSeason(),expected,date);
  assert.equal(api.weeklySpringRecommendationSeason(Number(date.slice(5,7))),expected);
  if(expected)assert.equal(api.todayRecommendedSites().filter(e=>e.axes.pelagic).length,date.slice(5,7)==='03'?0:1);
 }
});

test('봄 핵심 도서 6개 정확 이름의 19개 ID, 환경과 점수 무변경',()=>{
 const api=loadApi(),groups={'어청도':[1,101,102,103],'외연도':[2,104,105,106],'백령도':[4,117,118,119],'흑산도':[63,127,128,129,130],'홍도':[64],'가거도':[65]};
 for(const [name,ids] of Object.entries(groups)){
  assert.deepEqual(RUNTIME.filter(s=>s.name===name).map(s=>Number(s.id)),ids);
  for(const id of ids){const site=RUNTIME.find(s=>Number(s.id)===id);assert.equal(site.island,true);assert.equal(site.pelagic,false);assert.ok(api.springBirdingAxes(site).island);}
 }
 assert.equal(api.springBirdingAxes({id:900,name:'어청도 인근',env:'공원',seasons:['겨울']}).island,false);
 assert.equal(api.springBirdingAxes({id:900,env:'알수없음',weatherRuleKey:'island_migrant',seasons:['봄']}).island,false,'weatherRuleKey로 환경 추정 금지');
});

test('봄 24시간 선행 강수 + W/NW 정확 경계 및 미래/결측 제외',()=>{
 const site=RUNTIME.find(s=>s.id==='1'),T='2027-05-05 09:00 KST';
 const target=sample(T,92,{windName:'W',waveM:0.5});
 const check=(previous,extra={})=>{
  const api=loadApi({weatherWeek:weekDoc(site.id,{'2027-05-04':previous,'2027-05-05':[target]})});
  return api.springIslandRainWindCondition(site,{...target,...extra});
 };
 const wet=time=>sample(time,50,{precipitation3h:0.1,isPastAtGeneration:true,scoreEligible:false});
 assert.equal(check([wet('2027-05-04 09:00 KST')]),true,'정확히 24h 포함');
 assert.equal(check([wet('2027-05-04 08:59 KST')]),false,'24h 초과 제외');
 assert.equal(check([wet('2027-05-04 08:00 KST')],{windName:'NW'}),false,'25h 제외');
 assert.equal(check([wet('2027-05-05 03:00 KST')],{windName:'북서풍'}),true,'야간/과거 강수 근거 허용');
 for(const windName of ['W','NW','서풍','북서풍'])assert.equal(check([wet('2027-05-04 12:00 KST')],{windName}),true);
 for(const windName of ['E','SW','SSW','N','NE','남서풍','북풍','WNW'])assert.equal(check([wet('2027-05-04 12:00 KST')],{windName}),false);
 assert.equal(check([]),false);assert.equal(check([wet(T)]),false,'T 자신은 과거 강수가 아님');
 assert.equal(check([wet('2027-05-05 12:00 KST')]),false,'미래 강수 제외');
 for(const rain of [0,null,undefined,NaN,Infinity,'0.1',-1])assert.equal(check([{...wet('2027-05-04 12:00 KST'),precipitation3h:rain}]),false);
 assert.equal(check([wet('2027-05-04 12:00 KST')],{windName:null,windDirectionDeg:null}),false);
 for(const windSpeed of [0,30,null])assert.equal(check([wet('2027-05-04 12:00 KST')],{windSpeed}),true,'새 풍속 제한 없음');
});

test('봄 degree 풍향은 기존 Worker 8방위 변환과 일치',async()=>{
 const {windDirectionName}=await import('../../weather-proxy/src/index.js');
 const api=loadApi();
 for(const degree of [0,45,90,180,225,247.49,247.5,270,292.49,292.5,315,337.49,337.5,360])
  assert.equal(api.springWestNorthwestWind({windDirectionDeg:degree}),['서풍','북서풍'].includes(windDirectionName(degree)),String(degree));
 for(const degree of [null,undefined,NaN,Infinity,'270',-1,361])assert.equal(api.springWestNorthwestWind({windDirectionDeg:degree}),false);
 assert.equal(api.weeklySampleTimestamp({forecastTime:'2027-02-30 09:00 KST'}),null);
});

test('봄 유입 사유는 표시 sample에서만 판정, caution을 우회하지 않음',()=>{
 const site=RUNTIME.find(s=>s.id==='1'),state=springFixture('2027-05-05',{siteData:[site]});
 const samples=state.weatherWeek.sites['1'].days['2027-05-05'].samples;
 samples[0].precipitation3h=1;samples[1].windName='NW';samples[2].windName='E';
 const api=loadApi(state);let e=api.todayRecommendedSites()[0];
 assert.match(e.reasons.join(' '),/봄 도서 이동기/);assert.match(e.reasons.join(' '),/가능성에 주목/);assert.equal(e.score,92);
 samples[2].score=95;e=api.todayRecommendedSites()[0];assert.equal(e.recommendationTime,'12:00');assert.ok(!e.reasons.join(' ').includes('비 뒤'));
 samples[1].score=100;samples[1].waveM=2;
 // P0-2: 위험 sample의 높은 점수가 안전한 다른 시각의 예보 선택을 막지 않는다. 위험 sample 자체는 대표가 되지 않는다.
 e=api.todayRecommendedSites()[0];assert.ok(e&&e.recommendationTime!=='09:00'&&api.todayWeatherCautionNote(e.today)==='',
  '위험 sample을 건너뛰고 안전 sample을 대표로 쓴다');assert.ok(!e.reasons.join(' ').includes('비 뒤'));
 samples.forEach(s=>{s.waveM=2;});
 assert.equal(api.todayRecommendedSites().length,0,'모든 sample이 caution이면 제외');
});

test('걸매리 5/1~10 우선은 추천일 기준이며 점수·가을 조석을 바꾸지 않는다',()=>{
 const site=RUNTIME.find(s=>s.id==='14');
 for(const [date,expected] of [['2027-04-30',false],['2027-05-01',true],['2027-05-05',true],['2027-05-10',true],['2027-05-11',false]]){
  const state=springFixture(date,{siteData:[site],tideMonth:{sites:{14:{days:[{date,highTide:'12:00',highTideLevel:'999'}]}}}}),api=loadApi(state);
  const e=api.weeklyRecommendationForSite(site,api.weeklyInfo());
  assert.equal(api.springGeolmaeriPriority(site,date),expected);assert.equal(e.springGeolmaeriPriority,expected);assert.equal(e.score,92);
  assert.equal(e.isMandatory,false);assert.equal(e.tideText,null);assert.equal(api.weeklyBestMudflatTide(site,api.weeklyInfo()),null);
  assert.equal(e.reasons.some(r=>r.includes('긴부리흑꼬리도요')),expected);
 }
 const state=springFixture('2027-05-10',{siteData:[site],tideMonth:qualifyingTideMonth([14],weekDates('2027-05-10'))}),api=loadApi(state);
 state.weatherWeek.sites['14'].days['2027-05-11']={samples:[sample('2027-05-11 09:00 KST',95,{waveM:0.5})]};
 const e=api.weeklyRecommendationForSite(site,api.weeklyInfo());assert.equal(e.recommendationDate,'2027-05-11');assert.equal(e.springGeolmaeriPriority,false);
});

test('걸매리 특별 우선은 일반 갯벌보다 앞서지만 caution/부적격/결측 승격 금지',()=>{
 const mud=RUNTIME.filter(s=>['14','9','11','22','107'].includes(s.id)),state=springFixture('2027-05-05',{siteData:mud,notices:[{siteIds:[14],published:true}],tideMonth:qualifyingTideMonth([14,107],weekDates('2027-05-05'))}),api=loadApi(state);
 const samples=state.weatherWeek.sites['14'].days['2027-05-05'].samples;
 for(const s of samples)s.score=60;
 let top=api.todayRecommendedSites();const firstMudflat=top.find(e=>e.selectedAxis==='mudflat');assert.equal(firstMudflat.site.id,'14');assert.equal(firstMudflat.score,60);
 for(const s of samples)s.waveM=2;assert.ok(!api.todayRecommendedSites().some(e=>e.site.id==='14'));
 for(const s of samples){s.waveM=0.5;s.scoreEligible=false;}assert.equal(api.weeklyRecommendationForSite(mud.find(s=>s.id==='14'),api.weeklyInfo()),null);
 state.weatherWeek.sites['14'].days={};assert.ok(!api.todayRecommendedSites().some(e=>e.site.id==='14'),'공지로 결측 승격 금지');
});

test('유부도는 봄에만 추천 제외, 가을·겨울 후보 및 원본 유지',()=>{
 const site=RUNTIME.find(s=>s.id==='19'),saved=JSON.stringify(site);
 for(const month of [3,4,5,9,10,11,12,1,2]){
  const date=`2027-${String(month).padStart(2,'0')}-05`,state=springFixture(date,{siteData:[site],tideMonth:qualifyingTideMonth([19],weekDates(date))}),api=loadApi(state);
  assert.equal(!!api.weeklyRecommendationForSite(site,api.weeklyInfo()),![3,4,5].includes(month));
 }
 assert.equal(JSON.stringify(site),saved);
});

test('봄 통합 4/3/최대1/2와 core 동점 우선, 부족 보충/dedupe/점수 보존',()=>{
 const state=springFixture(),saved=JSON.stringify(state),api=loadApi(state),top=api.todayRecommendedSites();
 for(const [axis,count] of Object.entries({island:4,mudflat:3,pelagic:1,other:2}))assert.equal(top.filter(e=>e.selectedAxis===axis).length,count);
 assert.equal(top.length,10);assert.equal(new Set(top.map(e=>e.site.id)).size,10);assert.equal(JSON.stringify(state),saved);
 for(const e of top){assert.equal(e.score,92);assert.equal(e.recommendationTime,'09:00');}
 const core={...candidate(1,'other',92),axes:{island:true}},general={...candidate(3,'other',92),axes:{island:true},stableOrder:0};
 assert.equal(api.springBalancedRecommendations([general,core])[0].site.id,1);
 general.score=95;assert.equal(api.springBalancedRecommendations([general,core])[0].site.id,3);
 const others=Array.from({length:12},(_,i)=>({...candidate(700+i,'other',92),axes:{other:true}}));
 assert.equal(api.springBalancedRecommendations(others).length,10);assert.equal(api.springBalancedRecommendations(others.slice(0,2)).length,2);
 const mixed={...others[0],axes:{other:true,island:true,mudflat:true}};
 assert.equal(new Set(api.springBalancedRecommendations([mixed,...others]).map(e=>e.site.id)).size,10);
});

test('봄 일반 today fallback의 null 안전 의미 유지',()=>{
 const site=RUNTIME.find(s=>s.id==='39'),date='2027-04-05';
 const state=springFixture(date,{siteData:[site],weatherWeek:null,weatherToday:{sites:{39:{date,score:65,wind:'서풍 3m/s'}}}}),api=loadApi(state);
 let top=api.todayRecommendedSites();assert.equal(top.length,1);assert.equal(api.weeklyRecommendationIsSafe(top[0]),null);
 state.weatherToday.sites[39].scoreEligible=false;assert.equal(api.todayRecommendedSites().length,0);
});

test('봄 실제 환경 분류 보고 (합성 fixture 결과는 실제 예보가 아님)',()=>{
 const api=loadApi(),coreNames=['어청도','외연도','백령도','흑산도','홍도','가거도'];
 const rows=RUNTIME.map(s=>({id:s.id,name:s.name,env:s.env,runtimeIsland:s.island,runtimePelagic:s.pelagic,seasons:s.seasons,birdingFeature:s.birdingFeature,...api.springBirdingAxes(s)}));
 const counts=Object.fromEntries(['island','mudflat','pelagic','other'].map(axis=>[axis,rows.filter(e=>e[axis]).length]));
 counts.unique=rows.filter(e=>!e.excludedReason).length;assert.equal(counts.pelagic,8);assert.equal(rows.length,190);
 if(process.env.SPRING_REPORT==='1')console.log(JSON.stringify({counts,core:rows.filter(e=>coreNames.includes(e.name)),excluded:rows.filter(e=>e.excludedReason),
  fixtureTop:loadApi(springFixture()).todayRecommendedSites().map(e=>({id:e.site.id,name:e.site.name,axis:e.selectedAxis,score:e.score,time:e.recommendationTime}))},null,2));
});

// 여름도 실제 index.html 함수를 호출하며, 시계/예보만 합성한다.
function summerFixture(date='2027-06-10',extra={}){return springFixture(date,extra);}

test('여름 6/1~8/31 월 경계',()=>{
 for(const [date,want] of [['2027-05-31',false],['2027-06-01',true],['2027-06-30',true],['2027-07-01',true],['2027-07-31',true],['2027-08-01',true],['2027-08-31',true],['2027-09-01',false]])
  assert.equal(loadApi(summerFixture(date)).weeklySummerRecommendationSeason(),want,date);
});
test('여름 실제 산림/수계/해안 및 릉 token, 이름과 weatherRuleKey 추정 금지',()=>{
 const api=loadApi({month:6});
 for(const id of [77,78,79,80,81,82,85,86])assert.equal(api.summerBirdingAxes(RUNTIME.find(s=>Number(s.id)===id)).forest,true,String(id));
 for(const env of ['습지','습지생태공원','하천','강','강변','호수','저수지','간척호','석호','공원 유수지'])assert.equal(api.summerBirdingAxes({env}).water,true,env);
 for(const env of ['해안','갯벌','해변','하구','항구'])assert.equal(api.summerBirdingAxes({env}).coast,true,env);
 const tomb=RUNTIME.find(s=>s.id==='109');assert.equal(tomb.name,'파주삼릉');assert.equal(tomb.env,'릉');assert.equal(api.summerBirdingAxes(tomb).other,true);
 assert.equal(api.summerAxisLabel(api.summerBirdingAxes(tomb)),'여름 릉·수림 탐조');
 assert.equal(RUNTIME.some(s=>s.env.split(/[·\s]+/).includes('왕릉')),false);
 assert.equal(RUNTIME.some(s=>s.name==='파주 장릉'||s.name==='파주장릉'),false);
 for(const site of [{name:'강릉',env:'공원'},{env:'사찰',seasons:['봄']},{env:'유적지',weatherRuleKey:'wetland_waterbird'},{env:'미분류'}])assert.equal(api.summerBirdingAxes(site).excludedReason,'unclassified');
 assert.equal(api.summerBirdingAxes({env:'공원',seasons:['여름']}).other,true);
 assert.equal(api.summerBirdingAxes({env:'공원',seasons:['봄']}).water,false);
});
test('여름 농경지/섬은 복합 환경과 100점 공지에서도 제외',()=>{
 const sites=['농경지','간척지','목초지','초지','농경지·하천','간척호·농경지','갯벌·간척지','도서·해안','섬·산림','해양도서'].map((env,i)=>({...SITE,id:String(1000+i),env}));
 sites.push({...SITE,id:'1100',env:'산림',island:true});
 for(const month of [6,7,8]){
  const state=summerFixture(`2027-0${month}-10`,{siteData:sites,notices:sites.map(s=>({siteIds:[s.id],published:true}))});
  Object.values(state.weatherWeek.sites).forEach(s=>Object.values(s.days).forEach(d=>d.samples.forEach(s=>s.score=100)));
  assert.deepEqual(loadApi(state).todayRecommendedSites(),[]);
 }
 const api=loadApi({month:6});assert.equal(api.summerBirdingAxes({name:'신시도',env:'휴양림',island:false}).forest,true);
});
test('봄 핵심 6개 섬 전 ID는 여름 제외, 원본/봄 정책 유지',()=>{
 const core=RUNTIME.filter(s=>['1','2','4','63','64','65','101','102','103','104','105','106','117','118','119','127','128','129','130'].includes(s.id));
 assert.equal(core.length,19);
 for(const month of [6,7,8]){const api=loadApi(summerFixture(`2027-0${month}-10`,{siteData:core}));assert.equal(api.todayRecommendedSites().length,0);for(const s of core)assert.equal(api.summerBirdingAxes(s).excludedReason,'island');}
 assert.ok(loadApi(springFixture('2027-05-05',{siteData:core})).todayRecommendedSites().length>0);
});
test('여름 실제 188 후보 배분 6월 3/3/2/1/1, 7~8월 3/3/2/2 및 점수 불변',()=>{
 for(const month of [6,7,8]){
  const state=summerFixture(`2027-0${month}-10`),before=JSON.stringify(state),api=loadApi(state),top=api.todayRecommendedSites();
  assert.equal(top.length,10);assert.equal(new Set(top.map(e=>e.site.id)).size,10);
  assert.deepEqual(Object.fromEntries(['forest','water','coast','other','pelagic'].map(a=>[a,top.filter(e=>e.selectedAxis===a).length])),{forest:3,water:3,coast:2,other:month===6?1:2,pelagic:month===6?1:0});
  assert.ok(top.some(e=>e.site.id==='109'));assert.equal(top.some(e=>e.site.id==='48'),month===6);
  assert.ok(top.every(e=>e.score===92&&e.recommendationTime==='09:00'&&e.recommendationDate===`2027-0${month}-10`));
  assert.equal(JSON.stringify(state),before);
 }
});
test('여름 부족 보충은 허용 축만, 복합 dedupe와 unsafe/미분류 제외',()=>{
 const sites=RUNTIME.filter(s=>[77,78,79,80,81,82,83,84,85,86,87,154].includes(Number(s.id)));
 const state=summerFixture('2027-06-10',{siteData:sites}),api=loadApi(state),top=api.todayRecommendedSites();
 assert.equal(top.length,10);assert.ok(top.every(e=>e.axes.forest));assert.equal(new Set(top.map(e=>e.site.id)).size,10);
 const entries=[...top,{...top[0],site:{id:'x'},axes:{excludedReason:'field'},score:100}, {...top[0],site:{id:'y'},today:{wave:'3.0m'}}];
 const filled=api.summerBalancedRecommendations(entries);assert.ok(filled.every(e=>!['x','y'].includes(e.site.id)));
 assert.deepEqual(api.summerBalancedRecommendations([{...top[0],axes:{}}]),[]);
});
test('여름 선상은 대진항48 pelagic=true의 6월 sample만, 6/30 주간 경계',()=>{
 const site=RUNTIME.find(s=>s.id==='48');assert.equal(site.name,'대진항');assert.equal(site.pelagic,true);
 for(const date of ['2027-06-01','2027-06-30','2027-07-01','2027-08-01']){
  const api=loadApi(summerFixture(date,{siteData:RUNTIME.filter(s=>s.pelagic)})),top=api.todayRecommendedSites();
  assert.deepEqual(top.map(e=>e.site.id),date.slice(5,7)==='06'?['48']:[]);
 }
 const state=summerFixture('2027-06-30',{siteData:[site]});state.weatherWeek.sites['48'].days['2027-07-01']={samples:[sample('2027-07-01 09:00 KST',100,{waveM:.5})]};
 const api=loadApi(state);assert.equal(api.todayRecommendedSites()[0].recommendationDate,'2027-06-30');
 state.weatherWeek.sites['48'].days['2027-06-30'].samples=[];assert.equal(loadApi(state).todayRecommendedSites().length,0);
});
test('여름 대진항 선상 안전 경계/결측/비수치와 caution 이중 검사',()=>{
 const site=RUNTIME.find(s=>s.id==='48'),date='2027-06-10';
 for(const [extra,want] of [[{windSpeed:6,waveM:.7},true],[{windSpeed:6.1},false],[{waveM:.71},false],[{precipitation3h:.1},false],[{windSpeed:null},false],[{waveM:NaN},false],[{precipitation3h:Infinity},false],[{scoreEligible:false},false]]){
  const state=summerFixture(date,{siteData:[site]});state.weatherWeek.sites['48'].days[date].samples=[sample(date+' 09:00 KST',92,{waveM:.5,...extra})];
  assert.equal(loadApi(state).todayRecommendedSites().length,want?1:0,JSON.stringify(extra));
 }
 const api=loadApi(summerFixture(date,{siteData:[site]})),entry=api.todayRecommendedSites()[0];
 assert.equal(api.summerBalancedRecommendations([{...entry,today:{rain:'3시간 강수 10.0mm'}}]).length,0);
 assert.match(api.summerAxisLabel(entry.axes),/6월 슴새 선상탐조 시기로 주목/);
});
test('여름 daylight/과거/최고점/날짜 tie 및 가을 조석 비활성',()=>{
 const site=RUNTIME.find(s=>s.id==='19'),date='2027-06-10',state=summerFixture(date,{siteData:[site],tideMonth:{sites:{19:{days:[{date,highTide:'12:00',highTideLevel:'999'}]}}}});
 state.weatherWeek.sites['19'].days[date].samples=[sample(date+' 06:00 KST',100),sample(date+' 09:00 KST',80),sample(date+' 12:00 KST',90),sample(date+' 21:00 KST',100)];
 state.weatherWeek.sites['19'].days['2027-06-11']={samples:[sample('2027-06-11 09:00 KST',90)]};
 const e=loadApi(state).todayRecommendedSites()[0];assert.equal(e.recommendationTime,'12:00');assert.equal(e.recommendationDate,date);assert.equal(e.score,90);assert.equal(e.tideText,null);assert.equal(e.isMandatory,false);
});
test('여름 공지로 부적격 sample 승격 금지, today fallback 미확인 유지',()=>{
 const site=RUNTIME.find(s=>s.id==='109'),date='2027-06-10',state=summerFixture(date,{siteData:[site],notices:[{siteIds:[109],published:true}]});
 state.weatherWeek.sites['109'].days[date].samples.forEach(s=>s.scoreEligible=false);assert.equal(loadApi(state).todayRecommendedSites().length,0);
 const fallback=summerFixture(date,{siteData:[site],weatherWeek:null,weatherToday:{sites:{109:{date,score:65,wind:'서풍 3m/s'}}}});
 const api=loadApi(fallback),top=api.todayRecommendedSites();assert.equal(top.length,1);assert.equal(api.weeklyRecommendationIsSafe(top[0]),null);
 fallback.weatherToday.sites[109].scoreEligible=false;assert.equal(loadApi(fallback).todayRecommendedSites().length,0);
});
test('여름 실제 환경 전수 보고',()=>{
 const api=loadApi({month:6}),rows=RUNTIME.map(s=>({id:s.id,name:s.name,env:s.env,island:s.island,axes:api.summerBirdingAxes(s)}));
 const counts=Object.fromEntries(['forest','water','coast','other','tomb','pelagic'].map(a=>[a,rows.filter(r=>r.axes[a]).length]));
 const excludes=Object.fromEntries(['field','island','pelagic','unclassified'].map(a=>[a,rows.filter(r=>r.axes.excludedReason===a).length]));
 const rawField=RUNTIME.filter(s=>s.env.split(/[·,;\/|\s]+/).some(t=>['농경지','간척지','목초지','초지'].includes(t)));
 const rawIsland=RUNTIME.filter(s=>s.island===true||s.env.split(/[·,;\/|\s]+/).some(t=>['도서','섬','해양도서'].includes(t)));
 assert.equal(rows.length,190);assert.equal(counts.pelagic,1);assert.equal(counts.tomb,1);
 if(process.env.SUMMER_REPORT)console.log(JSON.stringify({counts,excludes,uniqueJune:rows.filter(r=>!r.axes.excludedReason).length,uniqueJuly:RUNTIME.filter(s=>!api.summerBirdingAxes(s,7).excludedReason).length,rawField:rawField.length,rawIsland:rawIsland.length,islandTrue:RUNTIME.filter(s=>s.island===true).length,fieldIslandOverlap:rawField.filter(s=>rawIsland.includes(s)).length,compoundFields:rawField.filter(s=>s.env.split(/[·,;\/|\s]+/).length>1).map(s=>({id:s.id,name:s.name,env:s.env})),unclassified:rows.filter(r=>r.axes.excludedReason==='unclassified'),other:rows.filter(r=>r.axes.other)},null,2));
});

/* C01 회귀: 생성 단계 반올림이 선상 안전조건을 우회하지 못하는지
   원자료 → update_weather 생성 함수 → weather_week JSON 직렬화/역직렬화 → 추천 경로로 확인한다. */
const PELAGIC_FIXTURE = join(ROOT, '.github', 'scripts', 'pelagic_safety_fixture.py');
const DAEJIN = RUNTIME.find((site) => String(site.id) === '48');

function generatedWeeks(cases, now) {
  const input = JSON.stringify({ siteId: '48', now, cases });
  let output = null;
  for (const python of ['python3', 'python']) {
    try { output = execFileSync(python, [PELAGIC_FIXTURE], { input, encoding: 'utf8', cwd: ROOT }); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.ok(output, 'python 실행 파일을 찾지 못했습니다');
  /* 생성기가 실제로 저장하는 텍스트를 그대로 되읽어 JSON 왕복까지 실제 경로로 확인한다. */
  return Object.fromEntries(Object.entries(JSON.parse(output)).map(([name, text]) => [name, JSON.parse(text)]));
}

function generatedSamples(week) {
  return Object.entries(week.sites['48'].days)
    .flatMap(([date, day]) => day.samples.map((sample) => ({ date, sample })));
}

function clockText(now) { return now.replace(' ', 'T') + ':00+09:00'; }

const C01_CASES = [
  { name: 'wind', windSpeed: 6.01, waveM: 0.7, precipitation3h: 0, recommended: false },
  { name: 'wave', windSpeed: 6, waveM: 0.71, precipitation3h: 0, recommended: false },
  { name: 'rain', windSpeed: 6, waveM: 0.7, precipitation3h: 0.01, recommended: false },
  { name: 'combined', windSpeed: 6.04, waveM: 0.74, precipitation3h: 0.04, recommended: false },
  { name: 'limit', windSpeed: 6, waveM: 0.7, precipitation3h: 0, recommended: true },
];

test('C01 원자료가 선상 기준을 넘으면 생성 반올림과 무관하게 최종 추천에서 빠진다', () => {
  const now = '2026-09-08 09:00';
  const weeks = generatedWeeks(C01_CASES, now);
  for (const item of C01_CASES) {
    const week = weeks[item.name];
    const api = loadApi({ siteData: RUNTIME, weatherWeek: week, month: 9, now: clockText(now) });
    const first = generatedSamples(week)[0];
    /* 표시용 저장값은 기존처럼 소수점 한 자리다. 안전판정만 원자료를 본다. */
    assert.deepEqual([first.sample.windSpeed, first.sample.waveM, first.sample.precipitation3h], [6, 0.7, 0], item.name);
    const shown = api.weeklySampleAsWeather(DAEJIN, first.sample, first.date);
    assert.deepEqual([shown.wind, shown.wave, shown.rain], ['북풍 6.0m/s', '0.7m', '강수 없음'], item.name);
    assert.equal(api.weeklyPelagicSafety(first.sample), item.recommended, item.name + ' gate');
    const top = api.todayRecommendedSites();
    assert.equal(top.some((entry) => String(entry.site.id) === '48'), item.recommended, item.name + ' 최종 추천');
  }
});

test('C01 생성 JSON은 선상 안전판정에 필요한 원자료 precision을 잃지 않는다', () => {
  const cases = [
    { name: 'wind-5.999', windSpeed: 5.999, waveM: 0.7, precipitation3h: 0, safe: true },
    { name: 'wind-6', windSpeed: 6, waveM: 0.7, precipitation3h: 0, safe: true },
    { name: 'wind-6.000001', windSpeed: 6.000001, waveM: 0.7, precipitation3h: 0, safe: false },
    { name: 'wave-0.699', windSpeed: 6, waveM: 0.699, precipitation3h: 0, safe: true },
    { name: 'wave-0.7', windSpeed: 6, waveM: 0.7, precipitation3h: 0, safe: true },
    { name: 'wave-0.700001', windSpeed: 6, waveM: 0.700001, precipitation3h: 0, safe: false },
    { name: 'rain-0', windSpeed: 6, waveM: 0.7, precipitation3h: 0, safe: true },
    { name: 'rain-0.000001', windSpeed: 6, waveM: 0.7, precipitation3h: 0.000001, safe: false },
  ];
  const api = loadApi({ month: 9 });
  const weeks = generatedWeeks(cases, '2026-09-08 09:00');
  for (const item of cases) {
    const samples = generatedSamples(weeks[item.name]);
    assert.ok(samples.length > 0, item.name);
    for (const { sample } of samples) assert.equal(api.weeklyPelagicSafety(sample), item.safe, item.name);
  }
  /* safetyRaw가 있으면 그 원자료만 본다. 결측·비수치는 안전으로 보지 않는다. */
  const safe = generatedSamples(weeks['wind-6'])[0].sample;
  assert.equal(api.weeklyPelagicSafety(safe), true);
  for (const raw of [{}, { windSpeed: 6, waveM: 0.7 }, { windSpeed: '6', waveM: 0.7, precipitation3h: 0 },
                     { windSpeed: null, waveM: 0.7, precipitation3h: 0 }, { windSpeed: NaN, waveM: 0.7, precipitation3h: 0 },
                     { windSpeed: Infinity, waveM: 0.7, precipitation3h: 0 }])
    assert.equal(api.weeklyPelagicSafety({ ...safe, safetyRaw: raw }), false, JSON.stringify(raw));
  /* safetyRaw가 없는 기존 저장본은 종전대로 표시값으로 판정한다. */
  assert.equal(api.weeklyPelagicSafety({ ...safe, safetyRaw: null }), true);
});

test('C01 수정 뒤에도 봄·여름·가을·겨울 선상 정책과 안전 경계가 그대로다', () => {
  const seasons = [
    { name: '봄', month: 5, now: '2026-05-12 09:00' },
    { name: '여름 대진항', month: 6, now: '2026-06-10 09:00' },
    { name: '가을', month: 9, now: '2026-09-08 09:00' },
    { name: '겨울', month: 12, now: '2026-12-08 09:00' },
  ];
  const cases = [
    { name: 'safe', windSpeed: 6, waveM: 0.7, precipitation3h: 0, recommended: true },
    { name: 'over', windSpeed: 6.01, waveM: 0.71, precipitation3h: 0.01, recommended: false },
  ];
  for (const season of seasons) {
    const weeks = generatedWeeks(cases, season.now);
    for (const item of cases) {
      const api = loadApi({ siteData: RUNTIME, weatherWeek: weeks[item.name], month: season.month, now: clockText(season.now) });
      const ids = api.todayRecommendedSites().map((entry) => String(entry.site.id));
      assert.equal(ids.includes('48'), item.recommended, season.name + ' ' + item.name);
    }
  }
});

/* H01 회귀: 계절 정책은 화면을 연 날이 아니라 각 후보의 추천 날짜(recommendationDate) 기준으로 적용해야 한다. */
function h01Sample(time, score, extra = {}) {
  const base = sample(time, score, Object.assign({ windSpeed: 3, waveM: 0.5, precipitation3h: 0 }, extra));
  /* C01 구조 유지: 선상 안전판정은 표시값이 아니라 safetyRaw 원자료를 본다. */
  return Object.assign(base, { safetyRaw: { windSpeed: base.windSpeed, waveM: base.waveM, precipitation3h: base.precipitation3h } });
}
function h01Week(rows) {
  const sites = {}, dates = [];
  for (const [site, days] of rows) {
    Object.assign(sites, weekDoc(site.id, days, site.name).sites);
    dates.push(...Object.keys(days));
  }
  dates.sort();
  return { startDate: dates[0], endDate: dates[dates.length - 1], sites };
}
function h01Api(today, month, rows) {
  return loadApi({ siteData: RUNTIME, weatherWeek: h01Week(rows), month, now: today + 'T09:00:00+09:00' });
}
function h01Site(id) { return RUNTIME.find((site) => String(site.id) === String(id)); }
function h01Entry(api, site) { return api.weeklyRecommendationForSite(site, api.weeklyInfo()); }

test('H01 다음 계절 날짜의 sample에 현재 계절 정책을 적용하지 않는다', () => {
  const cases = [
    { name: 'CASE A 2/28→3/1 제주 남방 선상', today: '2026-02-28', month: 2, id: '62', date: '2026-03-01' },
    { name: 'CASE A 윤년 2/29→3/1 제주 남방 선상', today: '2028-02-29', month: 2, id: '62', date: '2028-03-01' },
    { name: 'CASE B 5/31→6/1 제주 남방 선상', today: '2026-05-31', month: 5, id: '62', date: '2026-06-01' },
    { name: 'CASE C 5/31→6/1 어청도 도서', today: '2026-05-31', month: 5, id: '1', date: '2026-06-01' },
    { name: 'CASE D 5/31→6/1 한탄강두루미탐조대 농경지', today: '2026-05-31', month: 5, id: '39', date: '2026-06-01' },
    { name: 'CASE F 10/31→11/1 증도 지도갯벌 겨울 명시 제외', today: '2026-10-31', month: 10, id: '68', date: '2026-11-01' },
  ];
  for (const item of cases) {
    const site = h01Site(item.id);
    const api = h01Api(item.today, item.month, [[site, { [item.date]: [h01Sample(item.date + ' 09:00 KST', 95)] }]]);
    assert.equal(h01Entry(api, site), null, item.name);
    assert.equal(api.todayRecommendedSites().some((entry) => String(entry.site.id) === item.id), false, item.name + ' 최종 추천');
  }
});

test('H01 CASE E 11/1 주문진항은 가을 선상이 아니라 겨울 해안·항구 육상 후보다', () => {
  const site = h01Site('53'), date = '2026-11-01';
  const api = h01Api('2026-10-31', 10, [[site, { [date]: [h01Sample(date + ' 09:00 KST', 88)] }]]);
  const entry = h01Entry(api, site);
  assert.ok(entry, '겨울 육상 coast 후보로 남아야 한다');
  assert.equal(entry.recommendationDate, date);
  assert.equal(entry.axes.pelagic, false, '11/1 sample을 선상으로 취급하면 안 된다');
  assert.equal(entry.axes.coast, true);
  assert.deepEqual(entry.reasons, [], '가을 선상 사유가 남으면 안 된다');
  assert.ok(api.todayRecommendedSites().some((item) => String(item.site.id) === '53'));
});

test('H01 CASE G 8/31에 열어도 9/1 가을 들판 후보는 여름 제외로 사라지지 않는다', () => {
  const site = h01Site('15'), date = '2026-09-01';
  const api = h01Api('2026-08-31', 8, [[site, { [date]: [h01Sample(date + ' 09:00 KST', 91)] }]]);
  const entry = h01Entry(api, site);
  assert.ok(entry, '9/1 가을 후보가 8월 농경지 제외로 사라지면 안 된다');
  assert.equal(entry.recommendationDate, date);
  assert.equal(entry.axes.field, true);
  assert.ok(api.todayRecommendedSites().some((item) => String(item.site.id) === '15'));
});

test('H01 계절 적격 sample 중에서만 주간 대표 날짜와 사유를 고른다', () => {
  const island = h01Site('1'), field = h01Site('15');
  /* A. 현재 계절 유효 90 + 다음 계절 부적격 100 → 90점 5/31 선택 */
  let api = h01Api('2026-05-31', 5, [[island, {
    '2026-05-31': [h01Sample('2026-05-31 12:00 KST', 90)],
    '2026-06-01': [h01Sample('2026-06-01 09:00 KST', 100)],
  }]]);
  let entry = h01Entry(api, island);
  assert.ok(entry);
  assert.equal(entry.recommendationDate, '2026-05-31');
  assert.equal(entry.score, 90);
  assert.ok(entry.reasons.indexOf('봄 도서 이동기') >= 0, '봄 사유는 봄 날짜에만 붙는다');
  /* B. 현재 계절 부적격 100 + 다음 계절 유효 90 → 90점 9/1 선택 */
  api = h01Api('2026-08-31', 8, [[field, {
    '2026-08-31': [h01Sample('2026-08-31 12:00 KST', 100)],
    '2026-09-01': [h01Sample('2026-09-01 09:00 KST', 90)],
  }]]);
  entry = h01Entry(api, field);
  assert.ok(entry);
  assert.equal(entry.recommendationDate, '2026-09-01');
  assert.equal(entry.score, 90);
  /* C. 두 날짜 모두 유효 → 기존 점수·날짜 tie 정책 그대로 */
  api = h01Api('2026-05-29', 5, [[island, {
    '2026-05-30': [h01Sample('2026-05-30 09:00 KST', 90)],
    '2026-05-31': [h01Sample('2026-05-31 09:00 KST', 100)],
  }]]);
  assert.equal(h01Entry(api, island).recommendationDate, '2026-05-31');
  /* D. 두 날짜 모두 부적격 → 제외 */
  api = h01Api('2026-05-31', 5, [[island, {
    '2026-06-01': [h01Sample('2026-06-01 09:00 KST', 100)],
    '2026-06-02': [h01Sample('2026-06-02 09:00 KST', 99)],
  }]]);
  assert.equal(h01Entry(api, island), null);
});

test('H01 계절 경계 8곳에서 그 날짜의 계절 정책이 적용된다', () => {
  const rows = [
    ['2/28→3/1 3월 선상 없음', '2026-02-28', 2, '62', '2026-03-01', false, false],
    ['윤년 2/29→3/1 3월 선상 없음', '2028-02-29', 2, '62', '2028-03-01', false, false],
    ['5/31→6/1 6월은 대진항만 선상', '2026-05-31', 5, '48', '2026-06-01', true, true],
    ['5/31→6/1 제주 남방 여름 제외', '2026-05-31', 5, '62', '2026-06-01', false, false],
    ['6/30→7/1 7월 선상 없음', '2026-06-30', 6, '48', '2026-07-01', false, false],
    ['7/31→8/1 여름 섬 제외 유지', '2026-07-31', 7, '1', '2026-08-01', false, false],
    ['7/31→8/1 여름 농경지 제외 유지', '2026-07-31', 7, '39', '2026-08-01', false, false],
    ['8/31→9/1 가을 들판 허용', '2026-08-31', 8, '15', '2026-09-01', true, false],
    ['10/31→11/1 겨울은 선상 아님', '2026-10-31', 10, '53', '2026-11-01', true, false],
    ['12/31→1/1 겨울 선상 유지', '2026-12-31', 12, '48', '2027-01-01', true, true],
  ];
  for (const [name, today, month, id, date, allowed, pelagic] of rows) {
    const site = h01Site(id);
    const api = h01Api(today, month, [[site, { [date]: [h01Sample(date + ' 09:00 KST', 93)] }]]);
    const entry = h01Entry(api, site);
    assert.equal(!!entry, allowed, name);
    if (entry) {
      assert.equal(entry.recommendationDate, date, name + ' 추천일');
      assert.equal(!!entry.axes.pelagic, pelagic, name + ' 선상 여부');
    }
  }
});

test('H01 계절 판정은 12개월을 중첩·공백 없이 한 번씩 덮는다', () => {
  const api = loadApi({ month: 9 });
  const seasons = {};
  for (let month = 1; month <= 12; month++) {
    const flags = {
      spring: api.weeklySpringRecommendationSeason(month), summer: api.weeklySummerRecommendationSeason(month),
      autumn: api.autumnRecommendationSeason(month), winter: api.weeklyWinterRecommendationSeason(month),
    };
    const active = Object.keys(flags).filter((key) => flags[key]);
    assert.equal(active.length, 1, month + '월 계절 판정');
    seasons[month] = active[0];
  }
  assert.deepEqual(seasons, { 1: 'winter', 2: 'winter', 3: 'spring', 4: 'spring', 5: 'spring', 6: 'summer',
    7: 'summer', 8: 'summer', 9: 'autumn', 10: 'autumn', 11: 'winter', 12: 'winter' });
});

/* M01/M02 회귀: 명시적으로 부적격이거나 유효 sample이 0인 후보는
   공지·mandatory·core·높은 점수로도 최종 추천에 되살아나지 않아야 한다.
   미확인(missing/null)은 기존 unknown 의미를 그대로 유지한다. */
const M_NOTICE = (id) => [{ siteIds: [Number(id)], published: true, title: '테스트 공지', summary: '연계 확인' }];
function mWeek(site, days) {
  const doc = weekDoc(site.id, days, site.name);
  const dates = Object.keys(days).sort();
  doc.startDate = dates[0] || '';
  doc.endDate = dates[dates.length - 1] || '';
  return doc;
}
function mApi(today, month, state) {
  return loadApi(Object.assign({ month, now: today + 'T09:00:00+09:00' }, state));
}
function mRecommended(api, id) {
  return api.todayRecommendedSites().some((entry) => String(entry.site.id) === String(id));
}

test('M01 주간 유효 sample이 0이면 공지로 최종 추천에 되살아나지 않는다', () => {
  const autumn = h01Site('107'), winter = h01Site('7');
  const rows = [
    { name: '가을 매향리 scoreEligible=false', today: '2026-10-13', month: 10, site: autumn,
      days: { '2026-10-14': [sample('2026-10-14 09:00 KST', 92, { scoreEligible: false, score: null, missingScoreFields: ['wave'] })] } },
    { name: '가을 매향리 samples=[]', today: '2026-10-13', month: 10, site: autumn, days: { '2026-10-14': [] } },
    { name: '가을 매향리 days={}', today: '2026-10-13', month: 10, site: autumn, days: {} },
    { name: '가을 매향리 야간 sample만', today: '2026-10-13', month: 10, site: autumn,
      days: { '2026-10-14': [sample('2026-10-14 21:00 KST', 99)] } },
    { name: '가을 매향리 오늘 과거 sample만', today: '2026-10-13', month: 10, site: autumn,
      days: { '2026-10-13': [sample('2026-10-13 06:00 KST', 99, { isPastAtGeneration: true })] } },
    { name: '겨울 교동도 scoreEligible=false', today: '2026-12-08', month: 12, site: winter,
      days: { '2026-12-09': [sample('2026-12-09 09:00 KST', 95, { scoreEligible: false, score: null, missingScoreFields: ['wave'] })] } },
    { name: '겨울 교동도 samples=[]', today: '2026-12-08', month: 12, site: winter, days: { '2026-12-09': [] } },
    { name: '겨울 교동도 야간 sample만', today: '2026-12-08', month: 12, site: winter,
      days: { '2026-12-09': [sample('2026-12-09 21:00 KST', 99)] } },
  ];
  for (const row of rows) {
    const api = mApi(row.today, row.month, { siteData: [row.site], weatherWeek: mWeek(row.site, row.days), notices: M_NOTICE(row.site.id) });
    assert.equal(h01Entry(api, row.site), null, row.name + ' 후보');
    assert.equal(mRecommended(api, row.site.id), false, row.name + ' 최종 추천');
  }
  /* 물때 mandatory가 있어도 유효 sample 0을 되살리지 못한다. */
  const tide = { sites: { 107: { days: [{ date: '2026-10-14', highTide: '12:00', highTideLevel: '900' }] } } };
  const api = mApi('2026-10-13', 10, { siteData: [autumn], weatherWeek: mWeek(autumn, { '2026-10-14': [] }),
    notices: M_NOTICE('107'), tideMonth: tide });
  assert.equal(mRecommended(api, '107'), false, '공지+물때 mandatory도 우회 금지');
});

test('M02 today fallback의 명시적 scoreEligible=false는 계절·공지·mandatory와 무관하게 제외된다', () => {
  const autumn = h01Site('107'), winter = h01Site('7');
  const todayDoc = (id, date, extra) => ({ sites: { [id]: Object.assign({ date: date, forecastTime: date + ' 12:00 KST', score: 99, wind: '북풍 3m/s', rain: '강수 없음' }, extra) } });
  const rows = [
    { name: '가을 explicit false', today: '2026-10-13', month: 10, site: autumn, extra: { scoreEligible: false }, expected: false },
    { name: '가을 explicit false + 공지', today: '2026-10-13', month: 10, site: autumn, extra: { scoreEligible: false }, notice: true, expected: false },
    { name: '겨울 core explicit false', today: '2026-12-08', month: 12, site: winter, extra: { scoreEligible: false }, expected: false },
    { name: '겨울 core explicit false + 공지', today: '2026-12-08', month: 12, site: winter, extra: { scoreEligible: false }, notice: true, expected: false },
    { name: '가을 explicit true', today: '2026-10-13', month: 10, site: autumn, extra: { scoreEligible: true }, expected: true },
    { name: '가을 eligibility 없음(unknown)', today: '2026-10-13', month: 10, site: autumn, extra: {}, expected: true },
    { name: '가을 eligibility null(unknown)', today: '2026-10-13', month: 10, site: autumn, extra: { scoreEligible: null }, expected: true },
    { name: '겨울 explicit true', today: '2026-12-08', month: 12, site: winter, extra: { scoreEligible: true }, expected: true },
  ];
  for (const row of rows) {
    const state = { siteData: [row.site], weatherWeek: null, weatherToday: todayDoc(row.site.id, row.today, row.extra),
      tideMonth: qualifyingTideMonth([row.site.id], weekDates(row.today)) };
    if (row.notice) state.notices = M_NOTICE(row.site.id);
    const api = mApi(row.today, row.month, state);
    assert.equal(mRecommended(api, row.site.id), row.expected, row.name);
  }
  /* mandatory(물때)도 명시적 부적격을 이기지 못한다. */
  const tide = { sites: { 107: { days: [{ date: '2026-10-14', highTide: '12:00', highTideLevel: '900' }] } } };
  const blocked = mApi('2026-10-13', 10, { siteData: [autumn], weatherWeek: null,
    weatherToday: todayDoc('107', '2026-10-13', { scoreEligible: false }), tideMonth: tide, notices: M_NOTICE('107') });
  assert.equal(mRecommended(blocked, '107'), false, '물때 mandatory + 공지 + explicit false');
  /* 물때 기준이 있는 갯벌 탐조지는 공지만으로 승격되지 않는다. 적합한 만조가 없으면 제외다. */
  const noticeOnly = mApi('2026-10-13', 10, { siteData: [autumn], weatherWeek: null, weatherToday: null, notices: M_NOTICE('107') });
  assert.equal(h01Entry(noticeOnly, autumn), null, '공지만으로는 물때 관문을 넘지 못한다');
  assert.equal(mRecommended(noticeOnly, '107'), false);
  /* 물때 기준이 없는 탐조지의 공지 전용 unknown fallback 은 기존 정책 그대로 남는다. */
  const plain = h01Site('8');
  const plainOnly = mApi('2026-10-13', 10, { siteData: [plain], weatherWeek: null, weatherToday: null, notices: M_NOTICE('8') });
  const entry = h01Entry(plainOnly, plain);
  assert.ok(entry, '공지 전용 fallback은 유지한다');
  assert.equal(entry.today, null);
  assert.equal(entry.basisText, '탐조 이슈 기준');
  assert.equal(mRecommended(plainOnly, '8'), true);
});

/* ── 갯벌 물때 관문 (유부도 710cm · 매향리·걸매리 850cm) ────────────────────────
   기준 물높이를 넘는 만조가 '지금 이후 ~ 이번 주 끝' 사이에 일출~일몰 시간대로 있어야
   추천 후보가 된다. 공지·기상·동풍 등 다른 사유로 우회할 수 없다. */
const GATE_SITES = { 19: 710, 107: 850, 14: 850 };
function gateSite(id) { return RUNTIME.find((site) => String(site.id) === String(id)); }
/* 기상은 넉넉히 통과시켜 제외 사유가 물때 하나뿐이 되게 한다. */
function gateApi(id, now, days, extra = {}) {
  const date = now.slice(0, 10);
  const sites = extra.siteData || [gateSite(id)];
  const dates = weekDates(date);
  const doc = { sites: {}, startDate: dates[0], endDate: dates[dates.length - 1] };
  for (const s of sites) {
    Object.assign(doc.sites, weekDoc(s.id, Object.fromEntries(dates.map((d) => [d, ['09:00', '12:00', '15:00'].map((t) => sample(d + ' ' + t + ' KST', 92))])), s.name).sites);
  }
  return loadApi(Object.assign({
    month: Number(date.slice(5, 7)), now: now, siteData: sites, weatherWeek: doc,
    tideMonth: days === null ? null : { sites: { [String(id)]: { days: days } } },
  }, extra));
}
function gatePasses(id, now, days, extra) {
  const api = gateApi(id, now, days, extra);
  return !!api.weeklyRecommendationForSite(gateSite(id), api.weeklyInfo());
}

test('물때 관문: 기준 물높이 경계값을 포함하고 미달은 제외한다', () => {
  const now = '2026-09-17T06:00:00+09:00';
  for (const [id, threshold] of Object.entries(GATE_SITES)) {
    const day = (level) => [{ date: '2026-09-17', highTide: '12:00', highTideLevel: String(level) }];
    assert.equal(gatePasses(id, now, day(threshold - 1)), false, id + ' ' + (threshold - 1) + 'cm 미달');
    assert.equal(gatePasses(id, now, day(threshold)), true, id + ' ' + threshold + 'cm 경계 포함');
    assert.equal(gatePasses(id, now, day(threshold + 1)), true, id + ' ' + (threshold + 1) + 'cm 충족');
  }
});

test('물때 관문: 오늘 이미 지난 만조는 세지 않는다', () => {
  const day = [{ date: '2026-09-17', highTide: '09:00', highTideLevel: '900' }];
  assert.equal(gatePasses('107', '2026-09-17T06:00:00+09:00', day), true, '만조 전이면 후보');
  assert.equal(gatePasses('107', '2026-09-17T09:00:00+09:00', day), false, '만조 시각과 같으면 지난 것으로 본다');
  assert.equal(gatePasses('107', '2026-09-17T14:00:00+09:00', day), false, '이미 지난 만조만 남으면 제외');
});

test('물때 관문: 일출 전·일몰 후 만조는 적합으로 세지 않는다', () => {
  const now = '2026-09-17T01:00:00+09:00';
  assert.equal(gatePasses('107', now, [{ date: '2026-09-17', highTide: '03:30', highTideLevel: '900' }]), false, '일출 전');
  assert.equal(gatePasses('107', now, [{ date: '2026-09-17', highTide: '23:30', highTideLevel: '900' }]), false, '일몰 후');
  assert.equal(gatePasses('107', now, [{ date: '2026-09-17', highTide: '03:30,12:00', highTideLevel: '900,900' }]), true, '낮 만조가 하나라도 있으면 후보');
});

test('물때 관문: 이번 주 밖의 충족일은 세지 않고, 주 안으로 들어오면 다시 후보가 된다', () => {
  const far = [{ date: '2026-09-27', highTide: '12:00', highTideLevel: '900' }];
  assert.equal(gatePasses('107', '2026-09-17T06:00:00+09:00', far), false, '9/27 은 이번 주 밖');
  assert.equal(gatePasses('107', '2026-09-23T06:00:00+09:00', far), true, '주간 창이 9/27 을 포함하면 후보');
});

test('물때 관문: 조석 자료가 없거나 비어 있으면 적합으로 추정하지 않는다', () => {
  const now = '2026-09-17T06:00:00+09:00';
  const cases = {
    'tide_month 자체가 없음': null,
    '해당 탐조지 자료 없음': [],
    '만조 값이 비어 있음': [{ date: '2026-09-17', highTide: '', highTideLevel: '' }],
    '만조 물높이가 숫자가 아님': [{ date: '2026-09-17', highTide: '12:00', highTideLevel: '자료 없음' }],
    '갱신 지연으로 지난 날짜만 있음': [{ date: '2026-09-10', highTide: '12:00', highTideLevel: '900' }],
  };
  for (const [name, days] of Object.entries(cases)) {
    assert.equal(gatePasses('107', now, days), false, name);
  }
});

test('물때 관문: 공지·기상 어느 경로로도 우회할 수 없다', () => {
  const now = '2026-09-17T06:00:00+09:00';
  const notice = { notices: M_NOTICE('107') };
  const short = [{ date: '2026-09-17', highTide: '12:00', highTideLevel: '745' }];
  assert.equal(gatePasses('107', now, short, notice), false, '기준 미달 + 공지 + 좋은 기상');
  const api = gateApi('107', now, short, notice);
  assert.equal(api.todayRecommendedSites().some((e) => String(e.site.id) === '107'), false, '자동 추천 경로');
  assert.equal(api.weeklyIssueReason(gateSite('107')), '📢 지금 볼 만한 탐조 이슈', '공지 연계 자체는 그대로다');
  assert.equal(gatePasses('107', now, [{ date: '2026-09-17', highTide: '12:00', highTideLevel: '850' }], notice), true, '기준 충족이면 다시 후보');
});

test('물때 관문: 고정 추천 목록도 우회하지 못한다', () => {
  const now = '2026-09-17T06:00:00+09:00';
  const editorial = [{ published: true, siteIds: [107], weeklyRecommendations: [{ siteId: 107, name: '매향리' }, { siteId: 8 }] }];
  function editorialIds(level) {
    const api = gateApi('107', now, [{ date: '2026-09-17', highTide: '12:00', highTideLevel: String(level) }], {
      siteData: [gateSite('107'), gateSite('8')], notices: editorial,
    });
    return (api.weeklyEditorialRecommendations(api.weeklyInfo()) || []).map((e) => String(e.site.id));
  }
  assert.deepEqual(editorialIds(745), ['8'], '기준 미달이면 고정 목록에서도 빠진다');
  assert.deepEqual(editorialIds(850), ['107', '8'], '기준 충족이면 고정 목록 순서 그대로 남는다');
});

test('물때 관문: 추천 사유 날짜와 카드에 표시되는 만조가 같은 날이다', () => {
  const api = gateApi('107', '2026-09-17T06:00:00+09:00', [
    { date: '2026-09-17', highTide: '12:00', highTideLevel: '860' },
    { date: '2026-09-19', highTide: '13:00', highTideLevel: '900' },
  ]);
  const entry = api.weeklyRecommendationForSite(gateSite('107'), api.weeklyInfo());
  assert.equal(entry.recommendationDate, '2026-09-19', '가장 높은 만조 날짜가 추천일이다');
  assert.equal(entry.tideText, '만조 13:00 · 900cm', '표시되는 만조에 다른 날짜가 섞이지 않는다');
  assert.match(entry.reasons.join(' '), /도요 이동기 물때 주목/);
});

test('물때 관문: 규칙이 없는 탐조지는 영향을 받지 않는다', () => {
  const now = '2026-09-17T06:00:00+09:00';
  const week = { start: '2026-09-17', end: '2026-09-23', dates: [] };
  for (const id of ['8', '10', '126']) {
    assert.equal(gateApi(id, now, null).weeklyQualifyingHighTides(gateSite(id), week), null, id + ' 은 관문 대상이 아니다');
    assert.equal(gatePasses(id, now, null), true, id + ' 은 조석 자료 없이도 후보가 된다');
  }
});

/* 고정 입력(시계 2026-09-17, 가을 규칙): 갱신되는 저장 JSON을 읽지 않는다. 이번 주 최고 만조 849cm 라서 매향리는 빠지고
   공지(siteIds [107])와 고정 추천 목록은 그대로이며 다른 탐조지(천수만 15)는 유지된다. */
test('고정 자료 2026-09-17 기준 매향리가 이번 주 추천에서 빠진다', () => {
  const date = '2026-09-18';
  const sites = ['107', '15'].map((id) => RUNTIME.find((s) => s.id === id));
  const doc = weekDoc('107', { [date]: p0Samples(date, [['09:00', 90], ['12:00', 90], ['15:00', 90]]) });
  Object.assign(doc.sites, weekDoc('15', { [date]: p0Samples(date, [['09:00', 90], ['12:00', 90], ['15:00', 90]]) }).sites);
  doc.sampleIntervalHours = 3;
  const notices = [{ title: '매향리 탐조 물높이', published: true, siteIds: [107], weeklyRecommendations: [{ siteId: 107 }, { siteId: 15 }] }];
  const api = loadApi({ month: 9, now: '2026-09-17T06:00:00+09:00', siteData: sites, weatherWeek: doc, notices,
    tideMonth: p0Tide('107', date, '12:10', 849) });
  const week = api.weeklyInfo();
  const maehyangri = gateSite('107');
  assert.equal(api.weeklyIssueReason(maehyangri), '📢 지금 볼 만한 탐조 이슈', '매향리 공지는 그대로 게시 중이다');
  assert.equal(api.weeklyMudflatTideGateOpen(maehyangri, week), false);
  assert.equal(api.weeklyRecommendationForSite(maehyangri, week), null, '매향리가 추천 후보에서 빠진다');
  const editorial = (api.weeklyEditorialRecommendations(week) || []).map((e) => String(e.site.id));
  assert.ok(!editorial.includes('107'), '고정 추천에서 제외');
  assert.ok(!api.todayRecommendedSites().some((e) => String(e.site.id) === '107'), '자동 추천에서도 제외');
  assert.ok(editorial.includes('15'), '다른 탐조지의 고정 추천은 유지된다');
  const ok = loadApi({ month: 9, now: '2026-09-17T06:00:00+09:00', siteData: sites, weatherWeek: doc, notices,
    tideMonth: p0Tide('107', date, '12:10', 850) });
  assert.ok(ok.weeklyRecommendationForSite(maehyangri, ok.weeklyInfo()), '850cm 경계는 포함');
});

test('실제 저장 자료: 관문이 고른 적합 만조가 매향리 공지의 후보일과 일치한다', () => {
  const tideMonth = JSON.parse(readFileSync(join(ROOT, 'tide_month.json'), 'utf8'));
  const site = gateSite('107');
  const days = (tideMonth.sites['107'] || {}).days || [];
  if (!days.length) return;
  /* 공지(매향리 탐조 물높이)가 사람 손으로 고른 9월 후보일. 같은 파일에서 코드가 같은 날을
     고르는지 본다. 9/30 18:51 · 871cm 는 공지가 '일몰 후라 제외'로 적은 건이다. */
  const noticeDates = ['2026-09-27', '2026-09-28', '2026-09-29'];
  const excludedAfterSunset = { date: '2026-09-30', time: '18:51' };
  const covers = (date) => days.some((d) => d.date === date);
  if (!noticeDates.every(covers) || !covers(excludedAfterSunset.date)) return; // 저장 자료가 그 구간을 담고 있을 때만
  const api = loadApi({ month: 9, now: '2026-09-23T06:00:00+09:00', siteData: [site], weatherWeek: null, tideMonth: tideMonth });
  const week = api.weeklyInfo(); // 2026-09-23 ~ 2026-09-29
  const picked = (api.weeklyQualifyingHighTides(site, week) || []).map((t) => t.date);
  assert.deepEqual(picked, noticeDates.filter((d) => d >= week.start && d <= week.end), '공지 후보일과 같은 날을 고른다');
  const sun = api.weeklySunTimes(Number(site.lat), Number(site.lon), excludedAfterSunset.date);
  assert.ok(api.v24TideMinutesOfDay(excludedAfterSunset.time) > sun.setMin, '공지가 일몰 후로 제외한 만조는 코드에서도 일몰 후다');
  const later = loadApi({ month: 9, now: excludedAfterSunset.date + 'T06:00:00+09:00', siteData: [site], weatherWeek: null, tideMonth: tideMonth });
  assert.equal(later.weeklyMudflatTideGateOpen(site, later.weeklyInfo()), false, '일몰 후 만조만 남은 주에는 후보가 아니다');
});

/* ── 최근 출현 추천 가점(R01) ─────────────────────────────────────────
   /reports/recent-sites 자료(탐조지별 최근 관찰일·고유 종)로 순위에만 가점을 준다.
   화면 기상 점수(entry.score)는 바꾸지 않고 rankScore 로만 정렬한다. */
function recentDaysAgo(api, days) {
  const today = api.weeklyDateFromText(api.weeklyTodayDateText());
  return api.weeklyDateTextFromUtc(new Date(today.getTime() - days * 86400000));
}
function recentFieldSites(count) {
  return Array.from({ length: count }, (_, i) => ({ ...SITE, id: 400 + i, name: '들판' + i, env: '농경지' }));
}
function todayWeatherFor(api, sites, scoreOf = () => 92, extra = () => ({})) {
  const date = api.weeklyTodayDateText();
  return { sites: Object.fromEntries(sites.map((s, i) => [s.id, Object.assign({ date, forecastTime: date + ' 12:00 KST', score: scoreOf(s, i), wind: '북풍 3m/s', wave: '0.5m', rain: '강수 없음' }, extra(s, i))])) };
}

test('R01 B 가점은 최근성 12/9/5/2/0, 종수 +0/+2/+4, 상한 16', () => {
  const api = loadApi({ month: 10 });
  const site = { id: '15' };
  const bonusAt = (days, species) => {
    api.setSightings({ 15: { latestDate: recentDaysAgo(api, days), species } });
    const r = api.weeklyRecentReportBonus(site);
    return r ? r.bonus : 0;
  };
  assert.deepEqual([0, 1, 2, 3, 4, 7, 8, 14, 15].map((d) => bonusAt(d, ['a'])), [12, 12, 9, 9, 5, 5, 2, 2, 0]);
  assert.equal(bonusAt(-1, ['a']), 0, '미래 관찰일은 가점 없음');
  assert.equal(bonusAt(2, ['a', 'b']), 11);
  assert.equal(bonusAt(2, ['a', 'b', 'c']), 11);
  assert.equal(bonusAt(2, ['a', 'b', 'c', 'd']), 13);
  assert.equal(bonusAt(1, ['a', 'b', 'c', 'd', 'e']), 16, '12+4 = 상한 16');
  api.setSightings({});
  assert.equal(api.weeklyRecentReportBonus(site), null);
});

/* R01 C/A 는 시계와 관찰일을 모두 고정한다(상대 날짜와 고정 기대값을 섞지 않는다). */
const R01_NOW = '2026-10-08T10:12:00+09:00';
const R01_SEEN = '2026-10-06'; // R01_NOW 의 2일 전

test('R01 C 같은 종 5건은 1종, D 서로 다른 4종은 종수 가점', () => {
  const api = loadApi({ month: 10, now: R01_NOW });
  assert.equal(api.weeklyTodayDateText(), '2026-10-08');
  api.setSightings({ 15: { latestDate: R01_SEEN, species: Array(5).fill('캐나다기러기') } });
  assert.deepEqual(api.weeklyRecentReportBonus({ id: 15 }), { ageDays: 2, latestDate: R01_SEEN, speciesCount: 1, bonus: 9 });
  api.setSightings({ 15: { latestDate: R01_SEEN, species: ['캐나다기러기', '쇠기러기', '큰기러기', '흰이마기러기'] } });
  assert.deepEqual(api.weeklyRecentReportBonus({ id: 15 }), { ageDays: 2, latestDate: R01_SEEN, speciesCount: 4, bonus: 13 });
});

test('R01 A 같은 기상에서 최근 출현 장소가 92점 동점을 넘어 선정되고 표시 점수는 그대로다', () => {
  const sites = recentFieldSites(6);
  const base = loadApi({ month: 10, now: R01_NOW, siteData: sites });
  const weatherToday = todayWeatherFor(base, sites);
  const without = loadApi({ month: 10, now: R01_NOW, siteData: sites, weatherToday });
  const before = without.todayRecommendedSites().filter((e) => e.selectedAxis === 'field').map((e) => e.site.id);
  assert.deepEqual(before, [400, 401, 402, 403], '출현 자료가 없으면 기존 안정 순서 그대로');
  const api = loadApi({ month: 10, now: R01_NOW, siteData: sites, weatherToday, recentSiteSightings: { 405: { latestDate: R01_SEEN, species: ['캐나다기러기'] } } });
  const top = api.todayRecommendedSites();
  const field = top.filter((e) => e.selectedAxis === 'field');
  assert.equal(field[0].site.id, 405, '2일 전 출현 장소가 들판 1위');
  assert.equal(field[0].score, 92, '화면 기상 점수 유지');
  assert.equal(field[0].rankScore, 101);
  assert.deepEqual(field[0].recentReport, { ageDays: 2, latestDate: R01_SEEN, speciesCount: 1, bonus: 9 });
  assert.deepEqual(field.slice(1).map((e) => e.site.id), [400, 401, 402], '나머지는 기존 순서');
  assert.ok(top.every((e) => e.score <= 100));
});

test('R01 동점 tie-break: rankScore 같으면 더 최근 출현, 그다음 고유 종수', () => {
  const api = loadApi({ month: 10 });
  const entry = (id, rankScore, recentReport) => ({ site: { id, name: String(id) }, axes: { field: true }, score: 92, rankScore, recentReport, recommendationDate: '2026-10-02', stableOrder: id, priority: 4 });
  const newer = entry(9, 97, { ageDays: 4, speciesCount: 1, bonus: 5 });
  const older = entry(1, 97, { ageDays: 6, speciesCount: 1, bonus: 5 });
  assert.ok(api.autumnFieldRank(newer, older) < 0);
  const more = entry(9, 97, { ageDays: 4, speciesCount: 3, bonus: 5 });
  const less = entry(1, 97, { ageDays: 4, speciesCount: 1, bonus: 5 });
  assert.ok(api.springRecommendationRank(more, less) < 0);
  assert.ok(api.winterRecommendationRank(more, less) < 0);
  assert.equal(api.weeklyRecentTieBreak(entry(1, 92, null), entry(2, 92, null)), 0, '출현 없는 곳끼리는 기존 정렬에 맡긴다');
});

test('R01 E 최근 출현이 있어도 폭우·고파고 현장주의는 제외되고, 큰 감점은 가점으로 뒤집히지 않는다', () => {
  const sites = recentFieldSites(6);
  const base = loadApi({ month: 10, siteData: sites });
  const weatherToday = todayWeatherFor(base, sites, (s) => (s.id === 401 ? 62 : 92), (s) => (s.id === 400 ? { rain: '3시간 강수 12.0mm' } : {}));
  const recent = { latestDate: recentDaysAgo(base, 0), species: ['a', 'b', 'c', 'd'] };
  const api = loadApi({ month: 10, siteData: sites, weatherToday, recentSiteSightings: { 400: recent, 401: recent } });
  const top = api.todayRecommendedSites();
  assert.ok(!top.some((e) => e.site.id === 400), '폭우(10mm 이상) 장소는 가점이 있어도 제외');
  const rainy = top.find((e) => e.site.id === 401);
  assert.equal(rainy && rainy.rankScore, 78, '62 + 상한 16');
  assert.ok(top.filter((e) => e.selectedAxis === 'field').every((e) => e.site.id !== 401), '맑은 92점 장소보다 아래');
});

test('R01 F 선상 탐조는 출현 가점으로 파고 안전 기준을 우회하지 못한다', () => {
  const date = futureDate(1);
  const boat = { ...SITE, id: 48, name: '대진항', pelagic: true, env: '외해·선상', lat: 38.5, lon: 128.4 };
  const recent = { 48: { latestDate: recentDaysAgo(loadApi({ month: 10 }), 1), species: ['슴새', '바다쇠오리', '흰배슴새', '검은바람까마귀'] } };
  const high = loadApi({ month: 10, siteData: [boat], weatherWeek: weekDoc(48, { [date]: [sample(date + ' 12:00 KST', 92, { windSpeed: 3, waveM: 1.2 })] }), recentSiteSightings: recent });
  assert.equal(high.weeklyRecommendationForSite(boat, high.weeklyInfo()), null, '파고 1.2m > 0.7m 이면 후보가 아니다');
  const calm = loadApi({ month: 10, siteData: [boat], weatherWeek: weekDoc(48, { [date]: [sample(date + ' 12:00 KST', 92, { windSpeed: 3, waveM: 0.5 })] }), recentSiteSightings: recent });
  const entry = calm.weeklyRecommendationForSite(boat, calm.weeklyInfo());
  assert.ok(entry && entry.axes.pelagic);
  assert.equal(entry.score, 92);
  assert.ok(entry.rankScore > entry.score, '안전 기준을 통과한 경우에만 가점');
});

test('R01 G 산림 탐조지는 조석 자료가 없어도 감점 없이 기상 점수 + 출현 가점이다', () => {
  const forest = { ...SITE, id: 81, name: '지리산', env: '산림·고산' };
  const base = loadApi({ month: 10, siteData: [forest] });
  const weatherToday = todayWeatherFor(base, [forest], () => 92, () => ({ wave: null }));
  const none = loadApi({ month: 10, siteData: [forest], weatherToday, tideMonth: null });
  const plain = none.weeklyRecommendationForSite(forest, none.weeklyInfo());
  assert.equal(plain.rankScore, 92, '조석 없음 = 0 감점');
  const api = loadApi({ month: 10, siteData: [forest], weatherToday, tideMonth: null, recentSiteSightings: { 81: { latestDate: recentDaysAgo(base, 8), species: ['들꿩'] } } });
  const entry = api.weeklyRecommendationForSite(forest, api.weeklyInfo());
  assert.equal(entry.score, 92);
  assert.equal(entry.rankScore, 94);
});

test('R01 H recent-sites 실패·이상 응답이면 가점 없이 기존 추천 그대로', async () => {
  const loader = functionSource('loadRecentSiteSightings');
  async function run(fetchImpl, previous) {
    const box = { sightings: previous, refreshed: 0, warned: 0 };
    const fn = new Function('box', 'fetch', 'console',
      'var recentSiteSightings=box.sightings;var REPORTS_API_URL="https://reports.example";' +
      'function reportsConfigured(){return true;}function refreshTodayPanelIfOpen(){box.refreshed++;}' +
      loader + ';return loadRecentSiteSightings().then(function(ok){box.sightings=recentSiteSightings;return ok;});');
    const ok = await fn(box, fetchImpl, { warn: () => { box.warned++; } });
    return { ok, ...box };
  }
  const failed = await run(() => Promise.reject(new Error('network')), {});
  assert.deepEqual([failed.ok, failed.sightings, failed.refreshed], [false, {}, 0]);
  const broken = await run(() => Promise.resolve({ ok: true, json: async () => ({ ok: true, sites: 'x' }) }), { 15: { latestDate: '2026-09-29', species: ['a'] } });
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.sightings, { 15: { latestDate: '2026-09-29', species: ['a'] } }, '직전 자료 유지');
  const good = await run(() => Promise.resolve({ ok: true, json: async () => ({ ok: true, sites: [{ siteId: '15', latestDate: '2026-09-29', species: ['캐나다기러기'] }, { siteId: '', latestDate: 'bad', species: [] }] }) }), {});
  assert.deepEqual([good.ok, good.sightings, good.refreshed], [true, { 15: { latestDate: '2026-09-29', species: ['캐나다기러기'] } }, 1]);

  // 자료가 비면(=실패 직후) 추천은 출현 가점이 없는 기존 결과와 같다.
  const sites = recentFieldSites(6);
  const base = loadApi({ month: 10, siteData: sites });
  const weatherToday = todayWeatherFor(base, sites);
  const plain = loadApi({ month: 10, siteData: sites, weatherToday }).todayRecommendedSites();
  assert.ok(plain.length > 0);
  assert.ok(plain.every((e) => !e.recentReport && e.rankScore === e.score));
});

/* ── 편집 목록은 순위를 정하지 않는다(R02) ──────────────────────────── */
function panelFixture(extra = {}, count = 6) {
  const sites = recentFieldSites(count);
  const base = loadApi({ month: 10, siteData: sites });
  const weatherToday = todayWeatherFor(base, sites);
  const ids = (list) => list.map((e) => e.site.id);
  return { sites, base, weatherToday, ids, api: (state) => loadApi(Object.assign({ month: 10, siteData: sites, weatherToday }, extra, state)) };
}

test('R02 A·D 편집 목록이 있어도 자동 rankScore 순서이고, 탈락한 편집 장소를 끼워 넣지 않는다', () => {
  const f = panelFixture({}, 13);
  const recent = { 405: { latestDate: recentDaysAgo(f.base, 2), species: ['캐나다기러기'] } };
  const auto = f.api({ recentSiteSightings: recent }).todayRecommendedSites();
  assert.equal(auto.length, 10);
  assert.ok(!f.ids(auto).includes(412), '412 는 자동 추천 정원 밖');
  // 편집 목록: 자동 순서와 다르고, 정원 밖(412)과 없는 장소(999)를 맨 앞에 둔다.
  const notices = [{ published: true, weeklyRecommendations: [{ siteId: 412, name: '편집이름', reason: '편집 사유' }, { siteId: 999 }, { siteId: 403 }, { siteId: 400, reason: '맹금류' }] }];
  const api = f.api({ recentSiteSightings: recent, notices });
  assert.ok(api.weeklyEditorialRecommendations(api.weeklyInfo()).some((e) => e.site.id === 412), '412 는 편집 목록상 적격');
  const panel = api.weeklyPanelRecommendations(api.weeklyInfo());
  assert.deepEqual(f.ids(panel), f.ids(auto), '순서·구성이 자동 추천과 같다');
  assert.equal(panel[0].site.id, 405, '최근 출현 가점 장소가 들판 1위 그대로');
  assert.ok(!f.ids(panel).includes(412), '편집 목록에 있어도 자동 추천에서 빠지면 넣지 않는다');
  assert.equal(panel.find((e) => e.site.id === 400).reasons[0], '맹금류', '뽑힌 편집 장소는 사유 표시');
  assert.equal(panel.length, auto.length);
});

test('R02 B·E 편집 목록이 없으면 자동 추천 그대로이고, 출현 자료가 없으면 기존 결과와 같다', () => {
  const f = panelFixture();
  const api = f.api({});
  const panel = api.weeklyPanelRecommendations(api.weeklyInfo());
  assert.deepEqual(f.ids(panel), f.ids(api.todayRecommendedSites()));
  assert.deepEqual(f.ids(panel.filter((e) => e.selectedAxis === 'field')), [400, 401, 402, 403], '기존 안정 순서');
  assert.ok(panel.every((e) => !e.editorialPick && !e.recentReport && e.rankScore === e.score));
});

test('R02 C 자동 추천에 뽑힌 편집 장소에는 편집 사유만 덧붙이고 점수·순위는 그대로다', () => {
  const f = panelFixture();
  const notices = [{ published: true, weeklyRecommendations: [{ siteId: 402, name: '편집이름', reason: '맹금류 도착' }] }];
  const api = f.api({ notices });
  const plain = f.api({}).weeklyPanelRecommendations(api.weeklyInfo());
  const panel = api.weeklyPanelRecommendations(api.weeklyInfo());
  const picked = panel.find((e) => e.site.id === 402);
  assert.equal(picked.editorialPick, true);
  assert.equal(picked.reasons[0], '맹금류 도착');
  assert.equal(picked.score, 92);
  assert.equal(picked.displayName, undefined, '편집 표시명으로 장소 이름을 바꾸지 않는다');
  assert.deepEqual(f.ids(panel), f.ids(plain), '편집 사유가 붙어도 순위는 같다');
  assert.ok(panel.filter((e) => e.site.id !== 402).every((e) => !e.editorialPick));
});

/* ===== 추천 알고리즘 P0 (2026-10-08): 만조·예보 시각 일치 / 안전 우선 대표 선택 / 강수 기준 일치 ===== */
const P0_NOW = '2026-10-08T08:00:00+09:00';
const P0_DATE = '2026-10-10';
const p0Samples = (date, rows) => rows.map(([time, score, extra]) => sample(`${date} ${time} KST`, score, Object.assign({ windName: '북풍', waveM: 0.3 }, extra || {})));
const p0Tide = (id, date, time, level) => ({ sites: { [id]: { days: [{ date, highTide: time, highTideLevel: String(level) }] } } });
const p0Api = (site, rows, tide, extraState = {}) => {
  const doc = weekDoc(site.id, { [P0_DATE]: p0Samples(P0_DATE, rows) });
  doc.sampleIntervalHours = 3;
  return loadApi(Object.assign({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: doc, tideMonth: tide || null }, extraState));
};
const MUD = { 19: 710, 107: 850, 14: 850 };

test('P0-1 유부도·매향리·걸매리: 만조에 가장 가까운 예보로 평가하고 하루 최고점 시각을 쓰지 않는다', () => {
  for (const id of Object.keys(MUD)) {
    const site = RUNTIME.find((s) => s.id === id);
    // 06:00(95점)이 하루 최고지만 만조(13:20)와 7시간 이상 떨어져 있다. 12:00(80점)이 만조에 80분 거리다.
    const api = p0Api(site, [['06:00', 95], ['09:00', 85], ['12:00', 80], ['15:00', 70]], p0Tide(id, P0_DATE, '13:20', MUD[id]));
    const entry = api.weeklyRecommendationForSite(site, api.weeklyInfo());
    assert.ok(entry, site.name + ' 추천');
    assert.equal(entry.recommendationTime, '12:00', site.name);
    assert.equal(entry.score, 80, site.name + ': 만조 시각 예보 점수');
    assert.match(entry.basisText, /만조 인접.*80분/, site.name);
    assert.ok(entry.tideMatched);
  }
});

test('P0-1 조석 기준값 경계: 유부도 710 / 매향리·걸매리 850 이상만 후보, 1cm 미달은 제외', () => {
  for (const id of Object.keys(MUD)) {
    const site = RUNTIME.find((s) => s.id === id);
    const at = (level) => {
      const api = p0Api(site, [['12:00', 80]], p0Tide(id, P0_DATE, '12:30', level));
      return api.weeklyRecommendationForSite(site, api.weeklyInfo());
    };
    assert.ok(at(MUD[id]), site.name + ' 경계값 포함');
    assert.equal(at(MUD[id] - 1), null, site.name + ' 1cm 미달 제외');
  }
  const rules = HTML.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0];
  assert.match(rules, /'19':\{months:\[9,10\],minHighTideCm:710/);
  assert.match(rules, /'107':\{months:\[9,10\],minHighTideCm:850/);
  assert.match(rules, /'14':\{months:\[9,10\],minHighTideCm:850/);
});

test('P0-1 대표성: 만조와 예보 간격 절반(90분) 이내만 쓰고 넘으면 추정 없이 추천 제외', () => {
  const site = RUNTIME.find((s) => s.id === '14');
  const run = (tideTime) => {
    const api = p0Api(site, [['09:00', 90], ['18:00', 60]], p0Tide('14', P0_DATE, tideTime, 900));
    return api.weeklyRecommendationForSite(site, api.weeklyInfo());
  };
  assert.equal(run('10:30').recommendationTime, '09:00', '정확히 90분은 대표성 있음');
  for (const tideTime of ['10:31', '13:00']) {
    const e = run(tideTime);
    assert.equal(e, null, tideTime + ': 만조 시각 기상이 없으면 다른 시각 예보를 빌리지 않고 추천에서 제외');
  }
});

test('P0-1 일출·일몰 밖 예보는 만조 평가에 쓰지 않고 유효 예보가 없으면 기존처럼 후보 제외', () => {
  const site = RUNTIME.find((s) => s.id === '14');
  const night = p0Api(site, [['21:00', 99]], p0Tide('14', P0_DATE, '12:00', 900));
  assert.equal(night.weeklyRecommendationForSite(site, night.weeklyInfo()), null);
});

test('P0-2 흑산도형: 위험 시각의 높은 점수가 안전한 시각 예보 선택을 막지 않는다', () => {
  const site = { ...SITE, id: 501, name: '흑산도형', env: '갯벌' };
  for (const [label, danger] of [['파고', { waveM: 2.2 }], ['강수', { precipitation3h: 6 }]]) {
    const api = p0Api(site, [['09:00', 99, danger], ['12:00', 80]]);
    const top = api.todayRecommendedSites();
    assert.equal(top.length, 1, label + ': 안전한 12:00 예보로 후보 유지');
    assert.equal(top[0].recommendationTime, '12:00', label);
    assert.equal(top[0].score, 80);
    assert.equal(api.todayWeatherCautionNote(top[0].today), '');
  }
  const none = p0Api(site, [['09:00', 99, { waveM: 2.2 }], ['12:00', 80, { precipitation3h: 6 }]]);
  assert.equal(none.todayRecommendedSites().length, 0, '모든 예보가 위험이면 제외');
});

test('P0-2 부적격 예보는 승격되지 않고 선상 안전 기준(6.0m/s·0.7m·0mm·결측 제외)은 그대로다', () => {
  const site = { ...SITE, id: 501, name: '일반', env: '갯벌' };
  const api = p0Api(site, [['09:00', 99, { scoreEligible: false, score: null, missingScoreFields: ['wave'] }], ['12:00', 80]]);
  assert.equal(api.todayRecommendedSites()[0].recommendationTime, '12:00');
  const boundary = (extra) => sample('2026-10-10 09:00 KST', 90, Object.assign({ windSpeed: 6, waveM: 0.7, precipitation3h: 0 }, extra));
  const pelagic = loadApi({ month: 10 });
  assert.equal(pelagic.weeklyPelagicSafety(boundary()), true, '풍속 6.0·파고 0.7·강수 0 경계 포함');
  assert.equal(pelagic.weeklyPelagicSafety(boundary({ windSpeed: 6.1 })), false);
  assert.equal(pelagic.weeklyPelagicSafety(boundary({ waveM: 0.8 })), false);
  assert.equal(pelagic.weeklyPelagicSafety(boundary({ precipitation3h: 0.1 })), false);
  assert.equal(pelagic.weeklyPelagicSafety(boundary({ waveM: null })), false, '필수 자료 결측은 제외');
});

test('P0-2 최근 출현 가점·공지는 안전 제외를 우회하지 못한다', () => {
  const site = { ...SITE, id: 501, name: '일반', env: '갯벌' };
  const api = p0Api(site, [['09:00', 99, { waveM: 2.2 }], ['12:00', 90, { precipitation3h: 20 }]], null, {
    recentSiteSightings: { 501: { latestDate: '2026-10-08', species: ['a', 'b', 'c', 'd'] } },
    notices: [{ siteId: 501, published: true }] });
  assert.equal(api.todayRecommendedSites().length, 0);
});

test('P0-3 강수 판정: 화면 카드의 비권장 기준(1mm)과 추천 안전 기준이 같고 결측은 무강수가 아니다', () => {
  const api = loadApi({ month: 10 });
  const weather = (rain) => api.weeklySampleAsWeather(SITE, sample('2026-10-10 12:00 KST', 80, { precipitation3h: rain }), '2026-10-10');
  for (const [rain, cautioned] of [[0, false], [0.05, false], [0.9, false], [1, true], [5, true], [12, true]]) {
    assert.equal(api.todayWeatherCautionNote(weather(rain)) !== '', cautioned, rain + 'mm');
    const info = api.v251RainInfo({ rain: weather(rain).rain });
    assert.equal(info.raining && (info.amount === null || info.amount >= 1), cautioned, '카드 기준과 동일: ' + rain);
  }
  const missing = weather(null);
  assert.equal(missing.rain, null, '강수 결측은 "강수 없음"으로 바뀌지 않는다');
  assert.equal(api.todayWeatherCautionNote(missing), '');
  assert.equal(api.weeklyRecommendationIsSafe({ today: { wave: null, rain: null } }), null, '미확인은 안전 판정이 아니다');
});

test('P0-4 최근 출현 근거에 실제 관찰일이 포함되고 예보 자료 생성 시각이 표시된다', () => {
  const api = loadApi({ month: 10, now: P0_NOW, recentSiteSightings: { 15: { latestDate: '2026-10-05', species: ['검은어깨매'] } } });
  const bonus = api.weeklyRecentReportBonus({ id: 15 });
  assert.equal(bonus.latestDate, '2026-10-05');
  assert.equal(bonus.ageDays, 3);
  assert.ok(HTML.includes("entry.recentReport.latestDate+' 관찰, 제보 승인 기준)"));
  assert.ok(HTML.includes("예보 자료 생성 '+weatherWeek.generatedAt"));
});

/* ===== P0 교차 검증 지적 반영 (2026-10-08): 시계·관찰일 고정 ===== */
const P0B_DAY2 = '2026-10-11';
const p0Tides = (id, days) => ({ sites: { [id]: { days } } });

test('P0-B1 만조 기상 미확인: 물때 조건만으로는 최종 추천에 들어오지 못한다', () => {
  const site = RUNTIME.find((s) => s.id === '14');
  // 만조(12:00)와 가장 가까운 예보가 18:00(360분)뿐이다. 조석 조회 자체는 그대로 가능하다.
  const api = p0Api(site, [['18:00', 90]], p0Tide('14', P0_DATE, '12:00', 900), { notices: [{ siteId: 14, published: true }] });
  const week = api.weeklyInfo();
  assert.equal(api.weeklyQualifyingHighTides(site, week).length, 1, '조석 기준 충족 자체는 확인된다');
  assert.equal(api.weeklyMudflatTideGateOpen(site, week), false);
  assert.equal(api.weeklyBestMudflatTide(site, week), null);
  assert.equal(api.weeklyRecommendationForSite(site, week), null);
  assert.equal(api.todayRecommendedSites().length, 0, '공지가 있어도 우회하지 못한다');
  const none = loadApi({ now: P0_NOW, month: 10, siteData: [site], tideMonth: p0Tide('14', P0_DATE, '12:00', 900) });
  assert.equal(none.weeklyRecommendationForSite(site, none.weeklyInfo()), null, '기상 자료가 아예 없어도 제외');
});

test('P0-B2 모든 적격 만조 검사: 첫날 900cm 위험 기상, 다음날 880cm 적격이면 다음날을 추천한다', () => {
  const site = RUNTIME.find((s) => s.id === '14');
  const doc = weekDoc('14', {
    [P0_DATE]: p0Samples(P0_DATE, [['12:00', 95, { waveM: 2.4 }]]),
    [P0B_DAY2]: p0Samples(P0B_DAY2, [['12:00', 80]]),
  });
  doc.sampleIntervalHours = 3;
  const api = loadApi({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: doc,
    tideMonth: p0Tides('14', [{ date: P0_DATE, highTide: '12:00', highTideLevel: '900' }, { date: P0B_DAY2, highTide: '12:00', highTideLevel: '880' }]) });
  const e = api.weeklyRecommendationForSite(site, api.weeklyInfo());
  assert.ok(e, '다음날 적격 만조로 정상 추천');
  assert.equal(e.recommendationDate, P0B_DAY2);
  assert.match(e.tideText, /880cm/);
  assert.ok(!/900cm/.test(e.tideText + (e.extraText || '')), '위험한 만조는 후보·보조 문구에 없다');
  assert.equal(e.score, 80);
  assert.equal(api.todayRecommendedSites().length, 1);
});

test('P0-B2 같은 날 두 번의 만조도 각각 검사한다', () => {
  const site = RUNTIME.find((s) => s.id === '14');
  const api = p0Api(site, [['09:00', 95, { precipitation3h: 3 }], ['15:00', 70]],
    p0Tide('14', P0_DATE, '08:30,15:30', '900,870'));
  const e = api.weeklyRecommendationForSite(site, api.weeklyInfo());
  assert.ok(e);
  assert.match(e.tideText, /15:30 · 870cm/, '아침 900cm는 강수로 탈락, 오후 870cm가 선택');
  assert.equal(e.recommendationTime, '15:00');
});

test('P0-B3 오늘 자료 fallback: 만조와 예보 시각 간격(90분)·날짜·적격·안전을 똑같이 적용한다', () => {
  const site = RUNTIME.find((s) => s.id === '107');
  const base = { date: P0_DATE, forecastTime: P0_DATE + ' 09:00 KST', score: 90, wind: '북풍 3m/s', rain: '강수 없음', wave: '0.3m' };
  const run = (tideTime, extra) => {
    const api = loadApi({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: null,
      weatherToday: { sites: { 107: Object.assign({}, base, extra) } }, tideMonth: p0Tide('107', P0_DATE, tideTime, 900) });
    return api.weeklyRecommendationForSite(site, api.weeklyInfo());
  };
  assert.equal(run('14:00'), null, '09시 예보를 14시 만조에 쓰지 못한다');
  assert.equal(run('10:31'), null, '91분');
  assert.ok(run('10:30'), '정확히 90분은 허용');
  assert.ok(run('07:30'), '앞쪽 90분도 허용');
  assert.equal(run('10:30', { forecastTime: undefined }), null, '예보 시각 불명은 추정하지 않는다');
  assert.equal(run('10:30', { date: '2026-10-09', forecastTime: '2026-10-09 09:00 KST' }), null, '다른 날짜 예보');
  assert.equal(run('10:30', { scoreEligible: false }), null);
  assert.equal(run('10:30', { stale: true }), null);
  assert.equal(run('10:30', { rain: '3시간 강수 4.0mm' }), null, '위험 기상');
  assert.equal(run('10:30', { wave: '2.3m' }), null, '위험 파고');
  assert.equal(run('10:30', { score: null }), null, '점수 결측');
});

test('P0-B4 강수·파고 경계와 반올림: 원자료 1mm/2.0m 기준, 표시 반올림이 기준을 넘지 못하고 결측은 판정하지 않는다', () => {
  const api = loadApi({ month: 10 });
  const rain = (v) => api.weeklySampleCaution({ precipitation3h: v });
  assert.equal(rain(0.95), false);
  assert.equal(rain(0.96), false, '0.96mm가 표시 반올림으로 1.0mm가 되어 위험 처리되면 안 된다');
  assert.equal(rain(0.999), false);
  assert.equal(rain(1), true);
  assert.equal(rain(1.04), true);
  assert.equal(api.weeklySampleCaution({ waveM: 1.96 }), false);
  assert.equal(api.weeklySampleCaution({ waveM: 2 }), true);
  for (const missing of [null, undefined, NaN, '1.5']) assert.equal(rain(missing), false, '결측/비수치는 위험 판정 대상이 아님: ' + String(missing));
  assert.equal(api.weeklySampleCaution({ waveM: null, precipitation3h: null }), false);
  assert.equal(api.weeklySampleCaution({ waveM: 2.2, precipitation3h: null }), true, '한쪽 결측이어도 다른 쪽 위험은 잡는다');
  assert.equal(api.weeklySampleCaution({ waveM: null, precipitation3h: 2 }), true);
  // 표시 문자열이 반올림으로 기준을 넘어 보이지 않는다.
  const shown = api.weeklySampleAsWeather(SITE, sample('2026-10-10 12:00 KST', 80, { precipitation3h: 0.96, waveM: 1.96 }), '2026-10-10');
  assert.equal(api.todayWeatherCautionNote(shown), '');
  // 추천 선택도 같은 결과: 0.96mm 최고점 예보가 대표로 유지된다.
  const site = { ...SITE, id: 501, name: '일반', env: '갯벌' };
  const picked = p0Api(site, [['09:00', 99, { precipitation3h: 0.96 }], ['12:00', 80]]).todayRecommendedSites();
  assert.equal(picked.length, 1);
  assert.equal(picked[0].recommendationTime, '09:00');
  assert.equal(p0Api(site, [['09:00', 99, { precipitation3h: 1 }], ['12:00', 80]]).todayRecommendedSites()[0].recommendationTime, '12:00');
});

test('P0-B5 고정 입력 회귀: 최근 출현 가점·관찰일은 기준일에만 의존한다', () => {
  const api = loadApi({ month: 10, now: P0_NOW, recentSiteSightings: { 15: { latestDate: '2026-10-07', species: ['a', 'b'] } } });
  assert.deepEqual(api.weeklyRecentReportBonus({ id: 15 }), { ageDays: 1, latestDate: '2026-10-07', speciesCount: 2, bonus: 14 });
  const old = loadApi({ month: 10, now: P0_NOW, recentSiteSightings: { 15: { latestDate: '2026-09-20', species: ['a'] } } });
  assert.equal(old.weeklyRecentReportBonus({ id: 15 }), null, '14일 지난 제보는 가점이 없다');
});

/* ===== P0 잔여 보완: 만조 기상 예보 90분 절대 상한 ===== */
const B90_SITE = () => RUNTIME.find((s) => s.id === '14');
function b90Run(interval, sampleTime, tideTime, extra = {}) {
  const site = B90_SITE();
  const doc = weekDoc('14', { [P0_DATE]: p0Samples(P0_DATE, [[sampleTime, 90]]) });
  if (interval !== undefined) doc.sampleIntervalHours = interval;
  const api = loadApi(Object.assign({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: doc, tideMonth: p0Tide('14', P0_DATE, tideTime, 900) }, extra));
  return { api, site, entry: api.weeklyRecommendationForSite(site, api.weeklyInfo()) };
}

test('P0-C1 90분 절대 상한: 간격 3h 90분 허용·91분 제외, 6h·24h 간격은 120분 차이를 허용하지 않는다', () => {
  assert.ok(b90Run(3, '10:30', '12:00').entry, '3h 간격, 정확히 90분');
  assert.equal(b90Run(3, '10:29', '12:00').entry, null, '3h 간격, 91분');
  assert.equal(b90Run(6, '10:00', '12:00').entry, null, '6h 간격(절반 180분)이어도 120분은 제외');
  assert.ok(b90Run(6, '10:30', '12:00').entry, '6h 간격이어도 90분은 허용');
  assert.equal(b90Run(24, '10:00', '12:00').entry, null, '24h 간격(절반 720분)이어도 120분은 제외');
  assert.equal(b90Run(24, '10:29', '12:00').entry, null, '24h 간격, 91분');
  assert.ok(b90Run(24, '13:30', '12:00').entry, '24h 간격, 뒤쪽 90분');
  assert.equal(b90Run(1, '10:29', '12:00').entry, null, '1h 간격(절반 30분)은 기존대로 더 엄격');
  assert.ok(b90Run(1, '11:30', '12:00').entry, '1h 간격, 30분');
  assert.equal(b90Run(1, '11:00', '12:00').entry, null, '1h 간격, 60분은 간격 절반(30분) 초과');
});

test('P0-C2 잘못된 간격 metadata는 3시간(90분)으로 보고, 어떤 값도 90분을 넘기지 못한다', () => {
  for (const bad of [undefined, null, 0, -3, NaN, 'abc', '', Infinity, 1000, '24']) {
    assert.ok(b90Run(bad, '10:30', '12:00').entry, String(bad) + ': 90분은 허용');
    assert.equal(b90Run(bad, '10:29', '12:00').entry, null, String(bad) + ': 91분 제외');
  }
});

test('P0-C3 예보 시각 결측·형식 오류는 만조 기상으로 쓰지 않는다', () => {
  const site = B90_SITE();
  for (const bad of [null, undefined, '', '시각없음', '2026-10-10', 12]) {
    const doc = weekDoc('14', { [P0_DATE]: [sample('x', 90, { forecastTime: bad })] });
    doc.sampleIntervalHours = 3;
    const api = loadApi({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: doc, tideMonth: p0Tide('14', P0_DATE, '12:00', 900) });
    assert.equal(api.weeklyRecommendationForSite(site, api.weeklyInfo()), null, JSON.stringify(bad));
  }
});

test('P0-C4 90분 밖 예보는 공지·최근 출현 가점·mandatory 로도 추천되지 않고, 오늘 자료 fallback 도 같은 상한이다', () => {
  const extra = { notices: [{ siteIds: [14], published: true }], recentSiteSightings: { 14: { latestDate: '2026-10-08', species: ['a', 'b', 'c', 'd'] } } };
  const { api, site, entry } = b90Run(24, '10:00', '12:00', extra);
  assert.equal(entry, null);
  assert.equal(api.todayRecommendedSites().length, 0);
  const today = (time) => {
    const fallback = loadApi(Object.assign({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: null,
      weatherToday: { sites: { 14: { date: P0_DATE, forecastTime: P0_DATE + ' ' + time + ' KST', score: 90, wind: '북풍 3m/s', rain: '강수 없음', wave: '0.3m' } } },
      tideMonth: p0Tide('14', P0_DATE, '12:00', 900) }, extra));
    return fallback.weeklyRecommendationForSite(site, fallback.weeklyInfo());
  };
  assert.ok(today('10:30'), 'fallback 90분 허용');
  assert.equal(today('10:29'), null, 'fallback 91분 제외');
});

test('P0-C5 상한을 넘는 만조는 건너뛰고 90분 안의 다른 만조(다른 날짜·같은 날 두 번째)를 쓴다', () => {
  const site = B90_SITE();
  const day2 = '2026-10-11';
  const doc = weekDoc('14', { [P0_DATE]: p0Samples(P0_DATE, [['09:00', 90]]), [day2]: p0Samples(day2, [['12:00', 70]]) });
  doc.sampleIntervalHours = 24;
  const tides = { sites: { 14: { days: [{ date: P0_DATE, highTide: '12:00', highTideLevel: '900' }, { date: day2, highTide: '12:30', highTideLevel: '880' }] } } };
  const api = loadApi({ now: P0_NOW, month: 10, siteData: [site], weatherWeek: doc, tideMonth: tides });
  const entry = api.weeklyRecommendationForSite(site, api.weeklyInfo());
  assert.ok(entry);
  assert.equal(entry.recommendationDate, day2, '첫날 900cm(예보 180분 차이)는 제외하고 다음날 880cm');
  assert.match(entry.tideText, /880cm/);
  const same = p0Api(site, [['09:00', 90], ['15:00', 80]], p0Tide('14', P0_DATE, '12:00,15:30', '900,870'), {});
  const e2 = same.weeklyRecommendationForSite(site, same.weeklyInfo());
  assert.match(e2.tideText, /15:30 · 870cm/, '같은 날 첫 만조는 예보가 180분 떨어져 제외, 두 번째 만조 사용');
});
