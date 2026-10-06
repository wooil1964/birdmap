/* 최근 출현 제보 박스의 '이번 달 기여자' 탭 로직 테스트.
   index.html 의 실제 함수 소스를 그대로 꺼내 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_recent_contributors.mjs */
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
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('중괄호가 맞지 않습니다: ' + name);
}
function constSource(name) {
  const match = HTML.match(new RegExp('var ' + name + '=[^;]+;'));
  assert.ok(match, 'index.html에 상수가 없습니다: ' + name);
  return match[0];
}

const api = new Function(
  [constSource('CONTRIBUTORS_LIMIT_MOBILE'), constSource('CONTRIBUTORS_LIMIT_DESKTOP'),
    functionSource('contributorsPayload'), functionSource('contributorsVisible'),
    functionSource('contributorsMonthParts'),
    'return {contributorsPayload,contributorsVisible,contributorsMonthParts};'].join('\n'),
)();

const people = (n) => Array.from({ length: n }, (_, i) => ({ name: '기여자' + (i + 1), count: n - i }));

test('A. 3명: 모바일 3명 표시, 전체 보기 없음', () => {
  const view = api.contributorsVisible(people(3), true);
  assert.equal(view.rows.length, 3);
  assert.equal(view.more, false);
});
test('B. 4명: 모바일 3명 표시, 전체 보기 있음', () => {
  const view = api.contributorsVisible(people(4), true);
  assert.deepEqual(view.rows.map((r) => r.name), ['기여자1', '기여자2', '기여자3']);
  assert.equal(view.more, true);
});
test('C. 5명: 데스크톱 5명 표시, 전체 보기 없음', () => {
  const view = api.contributorsVisible(people(5), false);
  assert.equal(view.rows.length, 5);
  assert.equal(view.more, false);
});
test('D. 6명: 데스크톱 5명 표시, 전체 보기 있음', () => {
  const view = api.contributorsVisible(people(6), false);
  assert.equal(view.rows.length, 5);
  assert.equal(view.more, true);
});
test('서버 순서를 그대로 쓰고 다시 정렬하지 않는다', () => {
  const rows = [{ name: '나', count: 1 }, { name: '가', count: 9 }];
  assert.deepEqual(api.contributorsVisible(rows, false).rows.map((r) => r.name), ['나', '가']);
});
test('E. 빈 응답은 유효하고 기여자가 없다', () => {
  const payload = api.contributorsPayload({ month: '2026-10', approvedReports: 0, publicContributors: 0, contributors: [] });
  assert.deepEqual(payload, { month: '2026-10', approvedReports: 0, publicContributors: 0, contributors: [] });
  assert.equal(api.contributorsVisible(payload.contributors, true).more, false);
});
test('F. 비정상 응답은 거부한다', () => {
  for (const bad of [null, 'x', {}, { month: '2026-1', approvedReports: 1, publicContributors: 0, contributors: [] },
    { month: '2026-10', approvedReports: '7', publicContributors: 0, contributors: [] },
    { month: '2026-10', approvedReports: 7, publicContributors: 1, contributors: [{ name: 3, count: 1 }] },
    { month: '2026-10', approvedReports: 7, publicContributors: 1, contributors: [{ name: '가' }] },
    { month: '2026-10', approvedReports: 7, publicContributors: 1, contributors: null }]) {
    assert.equal(api.contributorsPayload(bad), null, JSON.stringify(bad));
  }
});
test('H. 운영 응답(2026-10)을 그대로 받아들이고 이름·건수만 남긴다', () => {
  const payload = api.contributorsPayload({
    month: '2026-10', approvedReports: 7, publicContributors: 3,
    contributors: [{ name: '이상목', count: 3, extra: 'x' }, { name: '행복합니다', count: 2 }, { name: '쌀나무', count: 1 }],
  });
  assert.deepEqual(payload.contributors, [{ name: '이상목', count: 3 }, { name: '행복합니다', count: 2 }, { name: '쌀나무', count: 1 }]);
  assert.deepEqual(api.contributorsMonthParts(payload.month), { year: 2026, month: 10 });
});
