/* 팝업 '탐조 해석' 문구의 월 판단이 브라우저 timezone과 무관하게 KST 기준이어야 한다.
   index.html의 실제 v24BriefingInterpretation() 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_briefing_kst_month.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

/* 같은 실제 순간을 유지한 채 '브라우저 timezone'만 바꾼 Date. local getter만 그 zone으로 답하고
   내부 timestamp는 그대로라 Intl.DateTimeFormat(timeZone:'Asia/Seoul')은 정상 동작한다. */
function browserClock(timeZone, instantIso) {
  const instant = new Date(instantIso);
  assert.ok(!Number.isNaN(instant.getTime()), '잘못된 시각: ' + instantIso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const partsOf = (date) => {
    const out = {};
    for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
    return out;
  };
  return class BrowserDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant.getTime()])); }
    static now() { return instant.getTime(); }
    getFullYear() { return Number(partsOf(this).year); }
    getMonth() { return Number(partsOf(this).month) - 1; }
    getDate() { return Number(partsOf(this).day); }
    getHours() { return Number(partsOf(this).hour) % 24; }
    getMinutes() { return Number(partsOf(this).minute); }
  };
}

/* 해석 문장을 만드는 하위 함수는 stub 으로 두고, 실제 함수가 고른 '월'만 드러낸다.
   v25CurrentSeason 은 월만 받는 순수 함수라 실제 소스를 그대로 쓴다. */
function loadApi(timeZone, instantIso) {
  const factory = new Function('Date',
    'function v252CurrentTargetSentence(site,month){return "MONTH="+month+" SEASON="+v25CurrentSeason(month);}' +
    'function v252WeatherSentence(){return "";}function v251ScoreSentence(){return "";}' +
    'function v251EnvironmentWeatherSentence(){return "";}function v25TideSentence(){return "";}' +
    functionSource('v25CurrentSeason') + '\n' +
    functionSource('todayKstMonth') + '\n' +
    functionSource('v24BriefingInterpretation') + '\n' +
    'return {v24BriefingInterpretation:v24BriefingInterpretation,todayKstMonth:todayKstMonth};');
  return factory(browserClock(timeZone, instantIso));
}

const SITE = { id: '19', name: '유부도', habitatType: '갯벌', env: '서해 갯벌' };
const ZONES = ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Pacific/Honolulu'];
/* 2026-10-01 00:30 KST 는 2026-09-30 15:30 UTC 와 같은 순간이다. */
const KST_MONTH_TURN = '2026-09-30T15:30:00Z';

const monthOf = (api) => Number(api.v24BriefingInterpretation(SITE, null, null).match(/MONTH=(\d+)/)[1]);

test('월 경계 순간에 브라우저 timezone과 무관하게 KST 기준 월을 쓴다', () => {
  for (const zone of ZONES) {
    const api = loadApi(zone, KST_MONTH_TURN);
    assert.equal(monthOf(api), 10, zone + ' 에서 해석 문구의 월이 KST와 어긋났다');
    assert.equal(monthOf(api), api.todayKstMonth(), zone + ' : 기존 KST 월 helper와 값이 다르다');
  }
});

test('KST 자정 직전·직후에 해석 월이 정확히 바뀐다', () => {
  const cases = [
    ['2026-09-30T14:59:00Z', 9],  // 2026-09-30 23:59 KST
    ['2026-09-30T15:00:00Z', 10], // 2026-10-01 00:00 KST
    ['2026-09-30T15:01:00Z', 10], // 2026-10-01 00:01 KST
  ];
  for (const [instant, expected] of cases) {
    for (const zone of ZONES) {
      assert.equal(monthOf(loadApi(zone, instant)), expected, zone + ' @ ' + instant);
    }
  }
});

test('연말 경계에서도 KST 월을 따른다', () => {
  for (const [instant, expected] of [['2026-12-31T14:59:00Z', 12], ['2026-12-31T15:00:00Z', 1]]) {
    for (const zone of ZONES) {
      assert.equal(monthOf(loadApi(zone, instant)), expected, zone + ' @ ' + instant);
    }
  }
});

test('해석 문구의 계절 표기도 KST 월을 따라간다', () => {
  /* 9월은 가을, 10월도 가을이라 경계에서 문구가 흔들리지 않아야 한다. */
  for (const zone of ZONES) {
    const text = loadApi(zone, KST_MONTH_TURN).v24BriefingInterpretation(SITE, null, null);
    assert.match(text, /MONTH=10 SEASON=가을/, zone);
  }
  /* 여름→가을 경계: 2026-09-01 00:30 KST */
  for (const zone of ZONES) {
    const text = loadApi(zone, '2026-08-31T15:30:00Z').v24BriefingInterpretation(SITE, null, null);
    assert.match(text, /MONTH=9 SEASON=가을/, zone + ' : 8월(여름)로 읽히면 안 된다');
  }
});

test('서울 브라우저에서는 수정 전후 결과가 같다', () => {
  for (const instant of [KST_MONTH_TURN, '2026-09-30T14:59:00Z', '2026-12-31T15:00:00Z', '2026-06-15T03:00:00Z']) {
    const seoul = loadApi('Asia/Seoul', instant);
    const expected = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' })
      .format(new Date(instant)));
    assert.equal(monthOf(seoul), expected, '서울 결과가 바뀌었다 @ ' + instant);
  }
});
