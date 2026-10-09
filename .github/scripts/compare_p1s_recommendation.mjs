/* P1-S 추천 비교(S2-A 점수 계약 전·후): 같은 고정 입력(35141c0 의 기상·조석·공지, 2026-10-08 22:40 KST, 공개 제보 스냅샷)에 index.html 버전만 바꿔 실행한다.
   정상 입력 결과와 합성 오류 입력 결과를 따로 낸다. 아래는 P0 비교 스크립트에서 가져온 설명이다.
   P0 추천 비교: 같은 고정 입력(ffd6506 의 기상·조석·공지, 190곳 배열, 2026-10-08 공개 제보 스냅샷)에 index.html 버전만 바꿔 실행한다.
   index.html의 실제 함수 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node .github/scripts/compare_p0_recommendation.mjs ffd6506 afc0a56 0e460b6 (인자 없으면 작업 트리 index.html) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXED = '35141c04d4fd152982b1f4683d5b7a6f4f7514e5'; // P1-S 분석 기준 커밋(고정 입력)
const show = (rev, file) => execFileSync('git', ['show', rev + ':' + file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 29 });
let HTML = show(FIXED, 'index.html');
const RULES = JSON.parse(show(FIXED, 'weather_rules.json'));
const siteContext = vm.createContext({});
vm.runInContext(HTML.match(/var siteData=([^\n]+);/)[0] + '\n' + HTML.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0], siteContext);
const RUNTIME = JSON.parse(JSON.stringify(siteContext.siteData));
const actualWeek = JSON.parse(show(FIXED, 'weather_week.json'));

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
  'weeklyScoreValid','weeklyNonNegativeNumber','weeklySampleRecommendable','weeklyTodayRecommendable','weeklyRecentReportBonus','weeklyRankScore','weeklyRecentTieBreak','weeklyPanelRecommendations',
];

/* 브라우저 전역 대신 테스트가 주입하는 상태만 두고 함수를 평가한다. */
function loadApi(state = {}) {
  const source = NAMES.filter((n) => HTML.includes('function ' + n + '(')).map(functionSource).join('\n');
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
    'return {' + NAMES.filter((n) => HTML.includes('function ' + n + '(')).join(',') + ',setWeek:function(w){weatherWeek=w;},setSightings:function(v){recentSiteSightings=v;}};'
  );
  const Clock=state.now?class extends Date {constructor(...args){super(...(args.length?args:[state.now]));} static now(){return new Date(state.now).getTime();}}:Date;
  return factory(Object.assign({rules:RULES},state),Clock);
}


const tideMonth = JSON.parse(show(FIXED, 'tide_month.json'));
const notices = JSON.parse(show(FIXED, 'notices.json'));
const snapshot = JSON.parse(readFileSync(join(ROOT, '.github/scripts/fixtures/recent_sites_20261008_193204.json'), 'utf8'));
/* loadRecentSiteSightings()가 /reports/recent-sites 응답을 recentSiteSightings 로 바꾸는 방식 그대로(날짜·종 무변경). */
const sightings = {};
snapshot.sites.forEach((item) => { if (item && item.siteId && /^\d{4}-\d{2}-\d{2}$/.test(String(item.latestDate || '')) && Array.isArray(item.species)) sightings[String(item.siteId)] = { latestDate: String(item.latestDate), species: item.species.map(String) }; });
const NOW = '2026-10-08T22:40:00+09:00';
const revs = process.argv.slice(2).length ? process.argv.slice(2) : ['worktree'];
const out = {};
for (const rev of revs) {
  HTML = rev === 'worktree' ? readFileSync(join(ROOT, 'index.html'), 'utf8') : show(rev, 'index.html');
  const run = (recent) => {
    const api = loadApi({ month: 10, now: NOW, siteData: RUNTIME, weatherWeek: actualWeek, tideMonth, notices, recentSiteSightings: recent });
    const week = api.weeklyInfo();
    const all = RUNTIME.map((s) => api.weeklyRecommendationForSite(s, week)).filter(Boolean);
    const unsafe = all.filter((e) => api.weeklyRecommendationIsSafe(e) === false);
    const top = api.todayRecommendedSites();
    return { siteCount: RUNTIME.length, candidates: all.length, unsafe: unsafe.map((e) => e.site.name), safeCandidates: all.length - unsafe.length,
      top: top.map((e) => ({ id: e.site.id, name: e.site.name, date: e.recommendationDate, time: e.recommendationTime, score: e.score, rank: api.weeklyRankScore(e),
        bonus: e.recentReport ? e.recentReport.bonus : 0, mandatory: e.isMandatory, reasons: (e.reasons || []).join(' / '), tide: e.tideText || '', basis: e.basisText })) };
  };
  out[rev] = { withSightings: run(sightings), withoutSightings: run({}) };
  /* 합성 오류: 최근 출현이 있는 탐조지의 모든 주간 표본 점수를 null(scoreEligible=true 유지)로 바꾼다. 원본은 건드리지 않는다.
     기존 코드는 null 을 0점으로 읽어 후보로 남기고, S2-A 이후에는 후보에서 빠져야 한다. */
  const broken = JSON.parse(JSON.stringify(actualWeek));
  Object.keys(sightings).forEach((id) => {
    const site = broken.sites[id];
    if (site) Object.values(site.days || {}).forEach((day) => (day.samples || []).forEach((x) => { if (x.scoreEligible === true) x.score = null; }));
  });
  const apiB = loadApi({ month: 10, now: NOW, siteData: RUNTIME, weatherWeek: broken, tideMonth, notices, recentSiteSightings: sightings });
  const weekB = apiB.weeklyInfo();
  const candB = RUNTIME.map((x) => apiB.weeklyRecommendationForSite(x, weekB)).filter(Boolean);
  out[rev].syntheticNullScores = { nulledSites: Object.keys(sightings).length, candidates: candB.length,
    zeroScoreCandidates: candB.filter((e) => e.score === 0).map((e) => e.site.id),
    top: apiB.todayRecommendedSites().map((e) => ({ id: e.site.id, name: e.site.name, date: e.recommendationDate, time: e.recommendationTime, score: e.score, rank: apiB.weeklyRankScore(e) })) };
}
console.log(JSON.stringify({ now: NOW, weekGeneratedAt: actualWeek.generatedAt, out }, null, 1));
