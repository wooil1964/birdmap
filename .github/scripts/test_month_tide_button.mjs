/* '한 달 조석 보기' 버튼 노출 대상 회귀 테스트.
   index.html의 실제 MONTH_TIDE_SITE_IDS와 monthTideButtonHtml()을 그대로 꺼내
   tide_month.json의 실제 월간 대상과 일치하는지 확인한다.
   실행: node --test .github/scripts/test_month_tide_button.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const MONTH = JSON.parse(readFileSync(join(ROOT, 'tide_month.json'), 'utf8'));

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

const siteCtx = {};
new Function('c',
  HTML.match(/var siteData=([^\n]+);/)[0] + '\n' +
  HTML.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0] + 'c.sites=siteData;')(siteCtx);
const SITES = siteCtx.sites;

const api = new Function(
  HTML.match(/var MONTH_TIDE_SITE_IDS=new Set\(\[.*?\]\);/)[0] + '\n' +
  'function escapeHtml(value){return String(value);}\n' +
  functionSource('monthTideButtonHtml') + '\n' +
  'return {monthTideButtonHtml:monthTideButtonHtml,ids:MONTH_TIDE_SITE_IDS};')();

const MONTH_IDS = new Set(Object.keys(MONTH.sites));
const siteById = (id) => SITES.find((s) => String(s.id) === String(id));
const shows = (site) => api.monthTideButtonHtml(site) !== '';

test('월간 조석 대상 ID 집합이 tide_month.json과 정확히 일치한다', () => {
  assert.deepEqual(
    [...api.ids].map(Number).sort((a, b) => a - b),
    [...MONTH_IDS].map(Number).sort((a, b) => a - b),
  );
  assert.equal(api.ids.size, MONTH_IDS.size);
});

test('ID 188 이천항에서 한 달 조석 보기 버튼이 표시된다', () => {
  const site = siteById('188');
  assert.ok(site, 'siteData에 ID 188이 있어야 한다');
  assert.equal(site.name, '이천항');
  assert.equal(site.showTide, true, '조석 영역 자체가 렌더되는 site여야 한다');
  assert.ok(MONTH_IDS.has('188'), 'tide_month.json에 월간 자료가 있어야 한다');
  const html = api.monthTideButtonHtml(site);
  assert.notEqual(html, '', '버튼이 표시되어야 한다');
  assert.match(html, /한 달 조석 보기/);
  assert.match(html, /openMonthTideModal\('188'\)/, '자기 site id로 모달을 열어야 한다');
});

test('기존 월간 대상 27곳의 버튼 노출이 그대로 유지된다', () => {
  const previous = ['9', '107', '12', '156', '14', '17', '122', '19', '146', '20', '21', '22',
    '96', '95', '68', '99', '70', '26', '25', '71', '72', '76', '27', '75', '50', '43', '44'];
  assert.equal(previous.length, 27);
  for (const id of previous) {
    const site = siteById(id);
    assert.ok(site, 'siteData에 ID ' + id + '이 있어야 한다');
    assert.ok(shows(site), 'ID ' + id + ' ' + site.name + ' 버튼이 사라지면 안 된다');
  }
});

test('월간 대상이 아닌 site에는 버튼이 생기지 않는다', () => {
  const outside = SITES.filter((s) => !MONTH_IDS.has(String(s.id)));
  assert.ok(outside.length > 0);
  const leaked = outside.filter(shows).map((s) => s.id + '(' + s.name + ')');
  assert.deepEqual(leaked, [], '비대상 site에 버튼이 새로 생기면 안 된다');
  /* 대표 비대상 몇 곳을 이름으로도 못박아 둔다. */
  for (const id of ['1', '2', '4']) {
    const site = siteById(id);
    if (site && !MONTH_IDS.has(String(site.id))) assert.equal(shows(site), false, id + ' ' + site.name);
  }
});

test('버튼이 나오는 site 수가 월간 대상 수와 같다', () => {
  const shown = SITES.filter(shows);
  assert.equal(shown.length, MONTH_IDS.size);
  assert.equal(shown.length, 28);
  assert.ok(shown.every((s) => s.showTide === true), '조석 영역이 없는 site가 섞이면 안 된다');
});
