/* '이번주 어디 갈까' 주간 추천 로직 회귀 테스트.
   index.html의 실제 함수 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_weekly_recommendation.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  'weeklyRecommendationIsSafe',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 함수를 평가한다. */
function loadApi(state = {}) {
  const source = NAMES.map(functionSource).join('\n');
  const tideRules = HTML.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0];
  const factory = new Function(
    'ctx',
    'var weatherWeek=ctx.weatherWeek||null;var tideMonth=ctx.tideMonth||null;' +
    'var siteData=ctx.siteData||[],weatherToday=ctx.weatherToday||null;' +
    'var loadedNotices=ctx.notices||[],PINNED_BIRDING_ISSUES=[];' +
    'var recommendationWeatherRules=ctx.rules;' +
    HTML.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0] +
    HTML.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0] +
    'function monthTideForSite(id){return tideMonth&&tideMonth.sites?tideMonth.sites[String(id)]||null:null;}' +
    'function todayKstMonth(){return ctx.month||9;}' +
    tideRules + '\n' + source + '\n' +
    'return {' + NAMES.join(',') + ',setWeek:function(w){weatherWeek=w;}};'
  );
  return factory(Object.assign({rules:RULES},state));
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

test('선상 safety 5개 기준의 inclusive 경계와 결측값', () => {
  const api=loadApi(), valid=sample('2026-09-10 09:00 KST',92,{waveM:1});
  const boundaries={waveM:[1.4,1.5,1.6],windSpeed:[8.9,9,9.1],gust:[12.9,13,13.1],precipitation3h:[0.9,1,1.1],visibilityKm:[8.1,8,7.9]};
  for(const [key,values] of Object.entries(boundaries)) {
    values.forEach((value,i)=>assert.equal(api.weeklyPelagicSafety({...valid,[key]:value}),i<2,`${key}=${value}`));
    for(const value of [null,undefined,NaN,Infinity,'',false,-1])
      assert.equal(api.weeklyPelagicSafety({...valid,[key]:value}),false,`${key} missing/invalid`);
  }
  assert.equal(api.weeklyPelagicSafety({...valid,scoreEligible:false}),false);
  assert.equal(loadApi({rules:null}).weeklyPelagicSafety(valid),false);
  const changed=structuredClone(RULES);changed.rules.pelagic_seabird.waveMaxM=0.5;
  assert.equal(loadApi({rules:changed}).weeklyPelagicSafety(valid),false,'JSON 규칙을 실제로 사용');
});

const PELAGIC={...SITE,id:74,name:'울산 앞바다 선상',pelagic:true,env:'외해·선상',seasons:['봄','겨울']};
test('선상은 safety 먼저 적용 후 daily/weekly 최고점과 동점 순서', () => {
  const a=futureDate(1),b=futureDate(2),week={start:a,end:b,dates:[a,b]};
  const api=loadApi({weatherWeek:weekDoc(74,{
    [a]:[sample(`${a} 09:00 KST`,92,{waveM:0.8}),sample(`${a} 12:00 KST`,95,{waveM:1.8}),sample(`${a} 15:00 KST`,92,{waveM:1})],
    [b]:[sample(`${b} 09:00 KST`,92,{waveM:0.8})]
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
 assert.ok(site.isMandatory);assert.match(site.reasons.join(' '),/동풍/);
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
