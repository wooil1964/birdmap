/* A-grade draft popup engine: tide notices never point at missing data, evidence-pending records never name
   species groups, and every existing record renders exactly as on the main baseline.
   Runs the real index.html functions (no logic copy). node --test .github/scripts/test_a_grade_popup.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = JSON.parse(readFileSync(join(ROOT, 'data/a-grade-birding-sites-20261031.json'), 'utf8'));
const CURRENT = readFileSync(join(ROOT, 'index.html'), 'utf8');
const BASELINE = execFileSync('git', ['show', SOURCE.baselineCommit + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const NEW = ['235', '236', '237', '238', '240', '241', '242', '243', '244', '245', '247'];
const NAMES = ['escapeHtml', 'kstDateText', 'tideTodayDateText', 'tideTodayIsCurrent', 'v24TideParts', 'v24TideMinutesOfDay',
  'v24TideDayEvents', 'v24TideLevelDisplay', 'v24TideEventLineHtml', 'v24TideDayColumnHtml', 'tideStaleWarningHtml',
  'monthTideFallbackNoticeHtml', 'monthTideFallbackMissingHtml', 'monthTideForSite', 'monthTideDayForSite', 'tideTodayForSite',
  'v24TideHtml', 'v25EnvironmentLabel', 'v25CurrentSeason', 'v252ProfileBirdSentence', 'v252CurrentTargetSentence',
  'v251EnvironmentWeatherSentence'];

function functionSource(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let depth = 0, quote = null;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    const c = html[i];
    if (quote) { if (c === quote && html[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i) + 1; continue; }
    if (c === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

function load(html, state = {}) {
  const ctx = vm.createContext({ Date, Math, String, Number, Object, Array, JSON, RegExp, isFinite });
  vm.runInContext(html.match(/var siteData=([^\n]+);/)[0] + '\n' + html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0], ctx);
  vm.runInContext(html.match(/var MONTH_TIDE_SITE_IDS=new Set\([^\n]+\);/)[0], ctx);
  ctx.tideToday = state.tideToday || null;
  ctx.tideMonth = state.tideMonth || null;
  for (const name of NAMES) {
    if (name === 'kstDateText' && state.today) { vm.runInContext(`function kstDateText(){return ${JSON.stringify(state.today)};}`, ctx); continue; }
    vm.runInContext(functionSource(html, name), ctx);
  }
  return ctx;
}

const SPECIES_GROUPS = /도요|물떼새|오리|기러기|갈매기|저어새|맹금|바다새|텃새|번식조류|물새|산림성/;

test('existing 229 records: labels and generated sentences are identical to the main baseline', () => {
  const now = load(CURRENT), base = load(BASELINE);
  assert.equal(base.siteData.length, 229);
  assert.equal(now.siteData.length, 240);
  for (const site of base.siteData) {
    const cur = now.siteData.find(s => s.id === site.id);
    assert.equal(JSON.stringify(cur), JSON.stringify(site));
    for (const fn of ['v25EnvironmentLabel', 'v252ProfileBirdSentence', 'v251EnvironmentWeatherSentence'])
      assert.equal(now[fn](cur), base[fn](site), fn + ' ' + site.id);
    for (const month of [1, 4, 7, 10]) assert.equal(now.v252CurrentTargetSentence(cur, month), base.v252CurrentTargetSentence(site, month));
  }
});

test('new records: explicit type wins over wording, and no species group is named', () => {
  const now = load(CURRENT);
  for (const id of NEW) {
    const site = now.siteData.find(s => s.id === id);
    assert.equal(now.v25EnvironmentLabel(site), site.environmentBirdingLabel, id);
    // Even a misleading habitat word must not change the explicit type.
    assert.equal(now.v25EnvironmentLabel({ ...site, env: '번식섬', habitatType: '번식섬' }), site.environmentBirdingLabel);
    const texts = [now.v252ProfileBirdSentence(site), now.v251EnvironmentWeatherSentence(site)]
      .concat([1, 4, 7, 10].map(m => now.v252CurrentTargetSentence(site, m)));
    for (const text of texts) assert.doesNotMatch(text, SPECIES_GROUPS, id + ': ' + text);
  }
});

test('tide: a site absent from today\'s daily file shows 준비 중/미제공, never a monthly hint', () => {
  const today = '2026-10-31';
  const now = load(CURRENT, { today, tideToday: { date: today, sites: { '19': { date: today, highTide: '06:00', lowTide: '12:00' } } } });
  for (const id of ['236', '242', '243', '245']) {
    const site = now.siteData.find(s => s.id === id);
    const tide = now.tideTodayForSite(site);
    assert.equal(tide, null); // Existing contract: a site absent from today's daily file resolves to null.
    const html = now.v24TideHtml(tide, site);
    assert.match(html, /조석 자료 준비 중/);
    assert.doesNotMatch(html, /월간/);
  }
  const other = { id: '999', tideUse: '아니오' };
  assert.match(now.v24TideHtml(now.tideTodayForSite(other), other), /조석 자료 미제공/);
  // Without the site (old callers) or before the daily file is loaded, the old text stays.
  assert.match(now.v24TideHtml(null), /정보 없음/);
  assert.match(load(CURRENT, { today: '2026-10-31' }).v24TideHtml(null, other), /정보 없음/);
  // A daily target that is present keeps its own data.
  assert.equal(now.tideTodayForSite(now.siteData.find(s => s.id === '19')).highTide, '06:00');
});

test('tide: stale daily keeps the monthly hint only for the 28 monthly sites', () => {
  const now = load(CURRENT, { today: '2026-10-31', tideToday: { date: '2026-10-30', sites: {} } });
  const monthly = now.siteData.find(s => s.id === '19'), other = now.siteData.find(s => s.id === '193'), fresh = now.siteData.find(s => s.id === '242');
  assert.ok(now.MONTH_TIDE_SITE_IDS.has('19') && !now.MONTH_TIDE_SITE_IDS.has('193') && now.MONTH_TIDE_SITE_IDS.size === 28);
  assert.ok(NEW.every(id => !now.MONTH_TIDE_SITE_IDS.has(id)));
  assert.match(now.v24TideHtml(now.tideTodayForSite(monthly)), /불러오지 못했습니다\. 월간 조석표를 확인해 주세요\./);
  for (const site of [other, fresh]) {
    const html = now.v24TideHtml(now.tideTodayForSite(site), site);
    assert.match(html, /오늘 조석자료를 불러오지 못했습니다\./);
    assert.doesNotMatch(html, /월간/);
  }
});
