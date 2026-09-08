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
  'todayIsEastWindDirection', 'v24WaveNumber', 'todayWeatherCautionNote',
  'weeklyEastWindFromWeek', 'weeklyHighTideEvents', 'weeklyBestMudflatTide',
  'autumnBirdingAxes', 'autumnRecommendationSeason', 'weeklyPelagicSafety',
  'autumnFieldRank', 'autumnBalancedRecommendations', 'autumnAxisLabel',
  'todayIsAutumnRemoteIsland', 'todaySpringIslandReason', 'weeklyIssueReason',
  'weeklyRecommendationDateLabel', 'weeklyWeatherEntryForSite', 'weeklyRecommendationForSite',
  'todayRecommendedSites', 'weeklyEastWindRecommendation', 'v24WindParts', 'v24WindNumber',
  'activeNotice', 'activeNoticeItems', 'noticeLinkedSites', 'todayString', 'v23Value',
  'weeklyRecommendationIsSafe', 'weeklyPelagicRecommendationSeason',
  'weeklyWinterRecommendationSeason','winterBirdingAxes','winterRecommendationRank','winterBalancedRecommendations','winterAxisLabel',
  'weeklySpringRecommendationSeason','springBirdingAxes','springGeolmaeriPriority','weeklySampleTimestamp','springWestNorthwestWind',
  'springIslandRainWindCondition','springRecommendationRank','springBalancedRecommendations','springAxisLabel',
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
    HTML.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0] +
    [...HTML.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n') +
    HTML.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0] +
    'function monthTideForSite(id){return tideMonth&&tideMonth.sites?tideMonth.sites[String(id)]||null:null;}' +
    'function todayKstMonth(){return ctx.month||9;}' +
    tideRules + '\n' + source + '\n' +
    'return {' + NAMES.join(',') + ',setWeek:function(w){weatherWeek=w;}};'
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
  for(const name of ['부남호','영암호 금호호']) {
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
  for(const name of ['독도','호미곶','청림운동장']) {
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

test('물때 날짜에 기상이 없으면 다른 날짜 sample을 복사하지 않는다', () => {
  const a='2026-09-12',b='2026-09-13',week={start:a,end:b,dates:[a,b]};
  const api=loadApi({weatherWeek:weekDoc(SITE.id,{[b]:[sample(`${b} 09:00 KST`,92)]}),
    tideMonth:{sites:{[SITE.id]:{days:[{date:a,highTide:'03:00,15:00',highTideLevel:'650,720'}]}}}});
  const e=api.weeklyRecommendationForSite(SITE,week);
  assert.equal(e.recommendationDate,a);assert.equal(e.score,null);assert.equal(e.sample,null);
  assert.ok(e.isMandatory);assert.match(e.tideText,/720cm/);
});

test('원거리 섬 제외/봄 정책과 structured notice linkage 유지', () => {
  const api=loadApi({siteData:RUNTIME,notices:[{content:'교동도 추천'},{siteId:15},{sites:['새만금']},{siteIds:[7]}]});
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

test('실데이터 187곳의 가을 추천·선상 안전·score 무변경 및 보고', () => {
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
  assert.equal(RUNTIME.length,187);assert.equal(top.length,10);
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
 const doc=weekDoc(s.id,{[date]:[sample(`${date} 09:00 KST`,95,{waveM:2.2})]});
 const api=loadApi({siteData:[s],weatherWeek:doc,tideMonth:{sites:{[s.id]:{days:[{date,highTide:'15:00',highTideLevel:'720'}]}}}});
 const entry=api.weeklyRecommendationForSite(s,api.weeklyInfo());
 assert.ok(entry.isMandatory);assert.match(entry.reasons.join(' '),/물때/);
 assert.equal(api.todayRecommendedSites().length,0);
 doc.sites[s.id].days[date].samples[0].waveM=1;
 assert.equal(api.todayRecommendedSites().length,1);
});

test('실데이터 caution 전후 비교와 동풍·공지 보존',()=>{
 const api=loadApi({siteData:RUNTIME,weatherWeek:actualWeek,
  tideMonth:JSON.parse(readFileSync(join(ROOT,'tide_month.json'),'utf8')),
  notices:JSON.parse(readFileSync(join(ROOT,'notices.json'),'utf8'))});
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
 const date=futureDate(1),site={...POHANG,id:50,name:'청림운동장',env:'해안·갯벌'};
 const others=[501,502,503].map(id=>({...SITE,id,name:'안전 갯벌 '+id,env:'갯벌'}));
 const doc=weekDoc(site.id,{[date]:[sample(`${date} 09:00 KST`,65,{windSpeed:8,waveM:2.2})]});
 for(const s of others)Object.assign(doc.sites,weekDoc(s.id,{[date]:[sample(`${date} 09:00 KST`,60,{waveM:1})]}).sites);
 const api=loadApi({siteData:[site,...others],weatherWeek:doc,notices:[{siteId:50}]});
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
  const api=loadApi({weatherWeek:weekDoc(site.id,{[date]:[s]})});
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
 const api=loadApi({weatherWeek:weekDoc(site.id,{[a]:[unsafe],[b]:[safe]})});
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
 const core={39:['한탄강두루미탐조대','농경지·하천'],15:['천수만 간월호','간척호·농경지'],10:['강화도','갯벌·농경지'],7:['교동도','간척지·갯벌'],20:['새만금','간척지·갯벌']};
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

test('겨울 통합: 실제 187 site + 합성 겨울 예보, 10곳/점수/caution/시간/공지 보존',()=>{
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
 assert.equal(rows.length,187);assert.equal(counts.pelagic,5);assert.equal(excluded.explicit,3);
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
 assert.equal(api.todayRecommendedSites().length,0,'강수+NW라도 표시 기상 caution이면 제외');
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
 const state=springFixture('2027-05-10',{siteData:[site]}),api=loadApi(state);
 state.weatherWeek.sites['14'].days['2027-05-11']={samples:[sample('2027-05-11 09:00 KST',95,{waveM:0.5})]};
 const e=api.weeklyRecommendationForSite(site,api.weeklyInfo());assert.equal(e.recommendationDate,'2027-05-11');assert.equal(e.springGeolmaeriPriority,false);
});

test('걸매리 특별 우선은 일반 갯벌보다 앞서지만 caution/부적격/결측 승격 금지',()=>{
 const mud=RUNTIME.filter(s=>['14','9','11','22','107'].includes(s.id)),state=springFixture('2027-05-05',{siteData:mud,notices:[{siteIds:[14],published:true}]}),api=loadApi(state);
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
  const date=`2027-${String(month).padStart(2,'0')}-05`,state=springFixture(date,{siteData:[site]}),api=loadApi(state);
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
 counts.unique=rows.filter(e=>!e.excludedReason).length;assert.equal(counts.pelagic,8);assert.equal(rows.length,187);
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
test('여름 실제 187 후보 배분 6월 3/3/2/1/1, 7~8월 3/3/2/2 및 점수 불변',()=>{
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
 assert.equal(rows.length,187);assert.equal(counts.pelagic,1);assert.equal(counts.tomb,1);
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
