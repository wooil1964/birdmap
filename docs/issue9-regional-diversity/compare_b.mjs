/* Issue #9 대안 B 변경 전·후 비교. 같은 고정 입력에 index.html 버전만 바꿔 실행한다.
   입력: 분석 보고서(57844c9)의 고정 입력 = 399b2f3 의 기상·조석·공지·규칙 + 같은 보고서의 익명화한 공개 제보 집계.
   BEFORE = 이 브랜치의 부모(origin/main)의 index.html, AFTER = 작업 트리 index.html.
   참조 구현: 분석 하네스(analyze.mjs)의 select(policy 'B')를 그대로 옮겨 독립 대조에 쓴다.
   실행: node docs/issue9-regional-diversity/compare_b.mjs [BEFORE_REV] > RESULTS.json */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const INPUT = '399b2f3ac579e365bd48e611465fb5624ce5d9c4';
const ANALYSIS = '57844c94a17b2a2844a54b15957afbf11b52ba20';
const NOW = '2026-10-14T13:33:05+09:00';
const BEFORE_REV = process.argv[2] || 'HEAD~1';
const git = (rev, file) => execFileSync('git', ['show', rev + ':' + file], { maxBuffer: 1 << 29 }).toString('utf8');
const json = (rev, file) => JSON.parse(git(rev, file));

const data = {
  weatherToday: json(INPUT, 'weather_today.json'), weatherWeek: json(INPUT, 'weather_week.json'),
  tideMonth: json(INPUT, 'tide_month.json'), notices: json(INPUT, 'notices.json'), rules: json(INPUT, 'weather_rules.json'),
};
const reports = json(ANALYSIS, 'docs/issue9-current-analysis-20261014/recent_sites_sanitized.json');
const sightings = Object.fromEntries(reports.sites.map((x) => [x.siteId, { latestDate: x.latestDate, species: Array.from({ length: x.speciesCount }, (_, i) => 'opaque-species-' + i) }]));
const reference = json(ANALYSIS, 'docs/issue9-current-analysis-20261014/RESULTS.json');
const NAMES_SRC = fs.readFileSync('.github/scripts/test_weekly_recommendation.mjs', 'utf8').match(/const NAMES = (\[[\s\S]*?\]);/)[1];

function load(html) {
  const source = (name) => {
    const start = html.indexOf('function ' + name + '(');
    let depth = 0, quote = null;
    for (let i = html.indexOf('{', start); i < html.length; i++) {
      const c = html[i], prev = html[i - 1];
      if (quote) { if (c === quote && prev !== '\\') quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i) + 1; continue; }
      if (c === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
      if (c === '{') depth++; else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
    }
    throw new Error(name);
  };
  const ctx = vm.createContext({});
  vm.runInContext(html.match(/var siteData=([^\n]+);/)[0] + '\n' + html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0], ctx);
  const sites = JSON.parse(JSON.stringify(ctx.siteData));
  const names = [...new Set([...vm.runInNewContext(NAMES_SRC), 'todayKstMonth', 'weatherScoreAllowed', 'v251EffectiveScore', 'weatherTodayForSite', 'todayWeatherFromWeek'])]
    .filter((n) => html.includes('function ' + n + '('));
  const constants = html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0] + html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0] +
    html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0] + [...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map((m) => m[0]).join('\n') +
    html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0];
  const factory = new Function('ctx', 'Date', 'var weatherWeek=ctx.weatherWeek,tideMonth=ctx.tideMonth,weatherToday=ctx.weatherToday,siteData=ctx.sites,loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;' +
    constants + 'function monthTideForSite(id){return tideMonth&&tideMonth.sites?tideMonth.sites[String(id)]||null:null;}' + names.map(source).join('\n') +
    ';return {' + names.join(',') + ',setSites:function(s){siteData=s;}};');
  const api = (withReports) => {
    const Clock = class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return new Date(NOW).getTime(); } };
    return factory({ ...data, sites, sightings: withReports ? sightings : {} }, Clock);
  };
  return { api, sites };
}

const before = load(git(BEFORE_REV, 'index.html'));
const after = load(fs.readFileSync('index.html', 'utf8'));
assert.equal(before.sites.length, 190); assert.equal(after.sites.length, 190);
assert.deepEqual(before.sites, after.sites, 'siteData 190곳은 변경되지 않는다');

const count = (values) => { const o = {}; for (const v of values) { const k = v == null ? 'unknown' : String(v); o[k] = (o[k] || 0) + 1; } return o; };
const ruleOf = (e) => data.rules.aliases[e.site.weatherRuleKey] || e.site.weatherRuleKey || 'general_birding';
const compact = (a, e, i) => ({ position: i + 1, id: String(e.site.id), name: e.site.name, sido: e.site.sido, rule: ruleOf(e), axis: e.selectedAxis, score: e.score, rankScore: a.weeklyRankScore(e), bonus: e.recentReport?.bonus || 0, priority: e.priority, date: e.recommendationDate, time: e.recommendationTime });
function metrics(list) {
  const regions = count(list.map((e) => e.sido)), rules = count(list.map((e) => e.rule));
  return { regions, regionCategories: Object.keys(regions).length, regionHHI: +Object.values(regions).reduce((n, x) => n + (x / list.length) ** 2, 0).toFixed(4), rules,
    rankSum: list.reduce((n, e) => n + e.rankScore, 0), rawScoreSum: list.reduce((n, e) => n + e.score, 0), axes: count(list.map((e) => e.axis)) };
}
function candidates(v, a, order) {
  const week = a.weeklyInfo();
  const entries = order.map((s) => a.weeklyRecommendationForSite(s, week)).filter(Boolean);
  const safe = entries.filter((e) => a.weeklyRecommendationEligible(e) && a.weeklyRecommendationIsSafe(e) !== false);
  return { all: entries, safe };
}
const signature = (a, list) => list.map((e) => [String(e.site.id), e.score, a.weeklyRankScore(e), e.priority, e.recommendationDate, e.recommendationTime, e.sortLevel || 0].join('|')).sort().join(';');

/* 참조 구현: analyze.mjs select(policy 'B'). 위 compact 대신 최소 필드만 쓴다. */
function referenceB(a, entries, trace) {
  const core = new Set([7, 8, 10, 15, 20]);
  const idcmp = (x, y) => Number(x.site.id) - Number(y.site.id);
  const prefix = (_api, aa, b, phase) => {
    const rank = a.weeklyRankScore(b) - a.weeklyRankScore(aa), recent = a.weeklyRecentTieBreak(aa, b);
    const gen = () => aa.priority - b.priority || rank || recent || (b.sortLevel || 0) - (aa.sortLevel || 0);
    if (phase === 'field') return rank || recent || Number(core.has(Number(b.site.id))) - Number(core.has(Number(aa.site.id))) || String(aa.recommendationDate || '9999').localeCompare(String(b.recommendationDate || '9999'));
    if (phase === 'pelagic') return rank || recent || String(aa.recommendationDate).localeCompare(String(b.recommendationDate));
    return phase === 'fill' ? (rank || gen()) : gen();
  };
  const selected = [], used = new Set(); let pelagic = 0;
  const quota = a.weeklySeasonQuotaEntries(entries, 'autumn');
  const phases = [['field', 4, (e) => e.axes.field && !e.axes.pelagic], ['mudflat', 3, (e) => e.axes.mudflat && !e.axes.pelagic], ['pelagic', 1, (e) => e.axes.pelagic],
    ['other', 2, (e) => !e.axes.field && !e.axes.mudflat && !e.axes.pelagic], ['fill', 10, () => true]];
  for (const [phase, n, filter] of phases) {
    const cand = (phase === 'fill' ? entries : quota).filter(filter).filter((e) => !used.has(String(e.site.id)) && (!e.axes.pelagic || pelagic < 1)).sort((x, y) => prefix(a, x, y, phase) || idcmp(x, y));
    const groups = [];
    for (const e of cand) { const g = groups.at(-1); if (g && prefix(a, g[0], e, phase) === 0) g.push(e); else groups.push([e]); }
    const t = { phase, available: cand.length, tieGroups: groups.filter((g) => g.length > 1).map((g) => g.map((e) => String(e.site.id))), decisions: [] };
    let added = 0;
    for (const g of groups) {
      const rest = g.slice();
      while (rest.length && added < n && selected.length < 10) {
        const choices = rest.filter((e) => !used.has(String(e.site.id)) && (!e.axes.pelagic || pelagic < 1));
        if (!choices.length) break;
        const regions = count(selected.map((e) => e.site.sido || 'unknown')), rules = count(selected.map(ruleOf));
        choices.sort((x, y) => (regions[x.site.sido || 'unknown'] || 0) - (regions[y.site.sido || 'unknown'] || 0) || (rules[ruleOf(x)] || 0) - (rules[ruleOf(y)] || 0) || idcmp(x, y));
        const win = choices[0];
        if (g.length > 1) t.decisions.push({ group: g.map((e) => String(e.site.id)), chose: String(win.site.id), regionCounts: { ...regions }, ruleCounts: { ...rules }, tiedSido: win.site.sido });
        rest.splice(rest.indexOf(win), 1); used.add(String(win.site.id)); if (win.axes.pelagic) pelagic++;
        selected.push({ ...win, selectedAxis: phase }); added++;
      }
      if (added >= n || selected.length >= 10) break;
    }
    trace.push(t);
  }
  return selected;
}

function xorshiftShuffles(list, count_, seed) {
  let s = seed >>> 0;
  return Array.from({ length: count_ }, () => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  });
}

const result = { inputCommit: INPUT, analysisCommit: ANALYSIS, beforeRevision: BEFORE_REV, evaluationTime: NOW, scenarios: [] };
for (const withReports of [true, false]) {
  const b = before.api(withReports), a = after.api(withReports);
  const cb = candidates('before', b, before.sites), ca = candidates('after', a, after.sites);
  const sc = { reports: withReports, siteCount: after.sites.length, candidates: { before: cb.all.length, after: ca.all.length }, safeCandidates: { before: cb.safe.length, after: ca.safe.length } };
  assert.equal(signature(b, cb.safe), signature(a, ca.safe), '안전 적격 후보의 점수·rank·날짜·시각·조위 순서값은 변경 전후 동일');
  sc.candidateSignatureEqual = true;
  const topB = b.todayRecommendedSites().map((e, i) => compact(b, e, i)), topA = a.todayRecommendedSites().map((e, i) => compact(a, e, i));
  sc.before = { top: topB, metrics: metrics(topB) }; sc.after = { top: topA, metrics: metrics(topA) };
  sc.membershipChanged = topA.filter((e) => !topB.some((x) => x.id === e.id)).map((e) => e.id);
  sc.removed = topB.filter((e) => !topA.some((x) => x.id === e.id)).map((e) => e.id);
  sc.orderChangedOnly = !sc.membershipChanged.length && topB.map((e) => e.id).join() !== topA.map((e) => e.id).join();
  // 점수·가점·정원: 같은 id 의 값은 동일해야 한다.
  for (const e of topA) { const x = topB.find((y) => y.id === e.id); if (x) { assert.equal(e.score, x.score); assert.equal(e.rankScore, x.rankScore); assert.equal(e.bonus, x.bonus); } }
  // 선발 축별 정원 불변
  sc.axisCountsEqual = JSON.stringify(metrics(topA).axes) === JSON.stringify(metrics(topB).axes);
  // 참조 구현(분석 하네스 policy B)과 운영 코드의 일치
  const trace = [], ref = referenceB(a, ca.safe, trace);
  sc.referenceBIds = ref.map((e) => String(e.site.id));
  sc.matchesReferenceB = sc.referenceBIds.join() === topA.map((e) => e.id).join();
  const refResults = reference.scenarios.find((s) => s.reports === withReports).alternatives.find((x) => x.policy === 'B').top.map((e) => e.id);
  sc.matchesAnalysisReportB = refResults.join() === topA.map((e) => e.id).join();
  sc.analysisReportBIds = refResults;
  sc.tieTrace = trace.map((t) => ({ phase: t.phase, tieGroups: t.tieGroups, decisions: t.decisions }));
  // 같은 입력 재현
  const again = a.todayRecommendedSites().map((e) => String(e.site.id)).join();
  sc.sameInputRepeat = again === topA.map((e) => e.id).join();
  // 배열 순서 100회 (seed 982451653, xorshift32 Fisher–Yates)
  const orders = xorshiftShuffles(after.sites, 100, 982451653), perm = { iterations: orders.length, beforeMembershipChanges: 0, beforeOrderChanges: 0, afterMembershipChanges: 0, afterOrderChanges: 0 };
  const idsB = topB.map((e) => e.id), idsA = topA.map((e) => e.id);
  for (const o of orders) {
    b.setSites(o); a.setSites(o);
    const rb = b.todayRecommendedSites().map((e) => String(e.site.id)), ra = a.todayRecommendedSites().map((e) => String(e.site.id));
    if ([...rb].sort().join() !== [...idsB].sort().join()) perm.beforeMembershipChanges++;
    if (rb.join() !== idsB.join()) perm.beforeOrderChanges++;
    if ([...ra].sort().join() !== [...idsA].sort().join()) perm.afterMembershipChanges++;
    if (ra.join() !== idsA.join()) perm.afterOrderChanges++;
  }
  b.setSites(before.sites); a.setSites(after.sites);
  sc.permutation = perm;
  assert.equal(perm.afterOrderChanges, 0, '배열 순서에 따른 결과 변동 0');
  result.scenarios.push(sc);
}
console.log(JSON.stringify(result, null, 2));
