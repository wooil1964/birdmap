/* M07 회귀: 공지 활성 날짜 판정이 브라우저 timezone과 무관하게 항상 KST 기준이어야 한다.
   index.html의 실제 todayString()/activeNotice() 소스를 그대로 꺼내서 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_notice_kst_date.mjs */
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

const NAMES = ['kstDateText', 'todayString', 'activeNotice', 'activeNoticeItems'];

/* 같은 실제 순간을 유지한 채 '브라우저 timezone'만 바꾼 Date를 만든다.
   local 계열 getter만 그 timezone으로 답하고, 내부 timestamp는 그대로라
   Intl.DateTimeFormat(timeZone:'Asia/Seoul')은 정상적으로 동작한다. */
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

function loadApi(timeZone, instantIso, notices = []) {
  const factory = new Function('ctx', 'Date',
    'var PINNED_BIRDING_ISSUES=ctx.pinned||[];var loadedNotices=ctx.notices||[];' +
    NAMES.map(functionSource).join('\n') + '\n' +
    'return {' + NAMES.join(',') + '};');
  return factory({ notices }, browserClock(timeZone, instantIso));
}

/* 2027-06-01 00:30 KST 는 2027-05-31 15:30 UTC 와 같은 순간이다. */
const KST_MIDNIGHT_INSTANT = '2027-05-31T15:30:00Z';
const ZONES = ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Europe/London', 'Pacific/Honolulu'];

/* 감사 원문이 지적한 세 timezone은 반드시 포함한다. */
const AUDIT_ZONES = ['Asia/Seoul', 'UTC', 'America/Los_Angeles'];

test('같은 순간이면 브라우저 timezone과 무관하게 오늘 날짜가 KST 기준으로 같다', () => {
  for (const zone of ZONES) {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT);
    assert.equal(api.todayString(), '2027-06-01', zone + ' 에서 KST 날짜가 어긋났다');
    assert.equal(api.todayString(), api.kstDateText(), zone + ' : 기존 KST helper와 값이 달라졌다');
  }
});

test('A. 6/1 시작 공지는 2027-06-01 00:30 KST 순간에 모든 timezone에서 활성이다', () => {
  const notice = { start: '2027-06-01', end: '2027-06-10' };
  for (const zone of AUDIT_ZONES) {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT);
    assert.equal(api.activeNotice(notice), true, zone + ' 에서 6/1 시작 공지가 비활성이다');
  }
});

test('B. 5/31 종료 공지는 2027-06-01 00:30 KST 순간에 모든 timezone에서 비활성이다', () => {
  const notice = { start: '2027-05-20', end: '2027-05-31' };
  for (const zone of AUDIT_ZONES) {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT);
    assert.equal(api.activeNotice(notice), false, zone + ' 에서 5/31 종료 공지가 아직 활성이다');
  }
});

test('C~F. start/end 경계의 기존 inclusive 의미를 그대로 유지한다', () => {
  const today = '2027-06-01';
  for (const zone of ZONES) {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT);
    const check = (notice, expected, label) =>
      assert.equal(api.activeNotice(notice), expected, zone + ' / ' + label);
    check({ start: today, end: '2027-06-10' }, true, 'C. start == today 는 활성');
    check({ start: '2027-05-20', end: today }, true, 'D. end == today 는 활성(inclusive)');
    check({ start: today, end: today }, true, 'C+D. start == end == today 는 활성');
    check({ start: '2027-06-02', end: '2027-06-10' }, false, 'E. start 이전은 비활성');
    check({ start: '2027-05-20', end: '2027-05-31' }, false, 'F. end 이후는 비활성');
  }
});

test('KST 자정 직전/직후에 날짜가 정확히 바뀐다', () => {
  const cases = [
    ['2027-05-31T14:59:00Z', '2027-05-31'], // 2027-05-31 23:59 KST
    ['2027-05-31T15:00:00Z', '2027-06-01'], // 2027-06-01 00:00 KST
    ['2027-05-31T15:01:00Z', '2027-06-01'], // 2027-06-01 00:01 KST
  ];
  for (const [instant, expected] of cases) {
    for (const zone of ZONES) {
      assert.equal(loadApi(zone, instant).todayString(), expected, zone + ' @ ' + instant);
    }
  }
});

test('연말·월말·윤년 경계에서도 KST 날짜와 비교가 정상이다', () => {
  const cases = [
    ['2026-12-31T14:59:00Z', '2026-12-31'], // 2026-12-31 23:59 KST
    ['2026-12-31T15:00:00Z', '2027-01-01'], // 2027-01-01 00:00 KST
    ['2028-02-28T15:00:00Z', '2028-02-29'], // 윤년 2028-02-29 00:00 KST
    ['2028-02-29T14:59:00Z', '2028-02-29'], // 윤년 2028-02-29 23:59 KST
    ['2028-02-29T15:00:00Z', '2028-03-01'], // 2028-03-01 00:00 KST
  ];
  for (const [instant, expected] of cases) {
    for (const zone of ZONES) {
      const api = loadApi(zone, instant);
      assert.equal(api.todayString(), expected, zone + ' @ ' + instant);
      assert.equal(api.activeNotice({ start: expected, end: expected }), true, zone + ' @ ' + instant);
    }
  }
});

test('실제 activeNotice()로 감사 원문 fixture 두 벌을 세 timezone에서 검증한다', () => {
  const running = { start: '2027-06-01', end: '2027-06-10' };
  const finished = { start: '2027-05-20', end: '2027-05-31' };
  const results = AUDIT_ZONES.map((zone) => {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT, [running, finished]);
    return { zone, running: api.activeNotice(running), finished: api.activeNotice(finished),
      items: api.activeNoticeItems().length };
  });
  for (const r of results) {
    assert.equal(r.running, true, r.zone);
    assert.equal(r.finished, false, r.zone);
    assert.equal(r.items, 1, r.zone + ' : 활성 공지 수가 다르다');
  }
  assert.equal(new Set(results.map((r) => JSON.stringify([r.running, r.finished, r.items]))).size, 1,
    'timezone 사이에 결과가 갈렸다');
});

test('published:false 와 start/end 미기재 기본값 정책은 그대로다', () => {
  for (const zone of AUDIT_ZONES) {
    const api = loadApi(zone, KST_MIDNIGHT_INSTANT);
    assert.equal(api.activeNotice({ start: '2027-06-01', end: '2027-06-10', published: false }), false);
    assert.equal(api.activeNotice({}), true, 'start/end 없으면 기존대로 항상 활성');
    assert.equal(api.activeNotice({ start: '2027-06-01' }), true, 'end 없으면 무기한');
    assert.equal(api.activeNotice({ end: '2027-06-10' }), true, 'start 없으면 과거부터');
    assert.equal(api.activeNotice({ published: true }), true);
  }
});

test('서울 브라우저에서는 수정 전후 동작이 달라지지 않는다', () => {
  /* 서울 local 계열 getter가 만들던 값과 KST 값이 항상 같아야 한다. */
  const instants = ['2027-05-31T15:30:00Z', '2027-05-31T14:59:00Z', '2026-12-31T15:00:00Z',
    '2028-02-28T15:00:00Z', '2027-06-15T03:00:00Z'];
  for (const instant of instants) {
    const seoul = loadApi('Asia/Seoul', instant);
    const date = new Date(instant);
    const localStyle = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    assert.equal(seoul.todayString(), localStyle, '서울 결과가 바뀌었다 @ ' + instant);
  }
});
