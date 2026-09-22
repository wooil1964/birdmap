/* 탐조지별 출현 이력의 호출 줄이기 회귀 테스트.
   index.html 의 실제 함수 소스를 그대로 꺼내 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_site_history_cache.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const BS = String.fromCharCode(92);

function functionSource(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'index.html에 함수가 없습니다: ' + name);
  let depth = 0;
  let quote = null;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    const c = HTML[i];
    const prev = HTML[i - 1];
    if (quote) {
      if (c === quote && prev !== BS) quote = null;
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

// index.html 에 선언된 상수를 그대로 읽어 온다(테스트가 값을 새로 정하지 않는다).
function constantSource(name) {
  const match = new RegExp('var\\s+' + name + '\\s*=\\s*([^;]+);').exec(HTML);
  assert.ok(match, 'index.html에 상수가 없습니다: ' + name);
  return 'var ' + name + '=' + match[1] + ';';
}

const NAMES = ['clearSiteHistoryCache', 'cachedSiteHistory', 'fetchSiteHistory'];

/* 바깥에서 오는 것(fetch·타이머·시계)만 주입하고 나머지는 실제 소스를 평가한다. */
function loadApi(options = {}) {
  const calls = { fetch: [], aborted: 0 };
  let now = 1000000;
  const responses = options.responses || (() => ({
    ok: true,
    json: async () => ({ ok: true, siteId: '190', total: 2, limit: 5, offset: 0, history: [
      { id: 'a', date: '2026-09-07', species: ['바다오리'], reporter: '둥이' },
      { id: 'b', date: '2026-09-04', species: ['긴꼬리도둑갈매기'], reporter: '진정' },
    ] }),
  }));

  const env = {
    REPORTS_API_URL: 'https://api.example',
    SITE_HISTORY_PAGE: 5,
    Date: { now: () => now },
    setTimeout: (fn, ms) => ({ fn, ms }),
    clearTimeout: () => {},
    AbortController: class {
      constructor() { this.signal = { aborted: false }; }
      abort() { this.signal.aborted = true; calls.aborted++; }
    },
    fetch: (url, opts) => {
      calls.fetch.push(String(url));
      return Promise.resolve(responses(String(url), opts));
    },
  };

  const src = [
    constantSource('SITE_HISTORY_TTL'),
    constantSource('SITE_HISTORY_TIMEOUT'),
    'var siteHistoryCache={};',
    ...NAMES.map(functionSource),
    'return {clearSiteHistoryCache,cachedSiteHistory,fetchSiteHistory,' +
      'SITE_HISTORY_TTL:SITE_HISTORY_TTL,SITE_HISTORY_TIMEOUT:SITE_HISTORY_TIMEOUT,' +
      'cache:function(){return siteHistoryCache;}};',
  ].join('\n');

  const keys = Object.keys(env);
  const api = new Function(...keys, src)(...keys.map((k) => env[k]));
  return { api, calls, advance: (ms) => { now += ms; } };
}

const SITE = { id: '190' };

test('같은 탐조지를 다시 열면 네트워크를 타지 않는다', async () => {
  const { api, calls } = loadApi();
  const first = await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 1, '처음엔 한 번 받아 온다');
  assert.equal(first.total, 2);

  const second = await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 1, '두 번째는 받아 오지 않는다');
  assert.deepEqual(second.history.map((h) => h.id), ['a', 'b'], '내용이 같아야 한다');
  assert.deepEqual(second, first);
});

test('기억해 둔 값은 날짜·종명·제보자·순서를 그대로 돌려준다', async () => {
  const { api } = loadApi();
  const fresh = await api.fetchSiteHistory(SITE, 0);
  const cached = await api.fetchSiteHistory(SITE, 0);
  assert.deepEqual(
    cached.history.map((h) => [h.date, h.species.join('·'), h.reporter]),
    fresh.history.map((h) => [h.date, h.species.join('·'), h.reporter]),
  );
  assert.deepEqual(cached.history.map((h) => h.date), ['2026-09-07', '2026-09-04']);
});

test('정해 둔 시간이 지나면 다시 받아 온다(새 승인 건 반영)', async () => {
  const { api, calls, advance } = loadApi();
  await api.fetchSiteHistory(SITE, 0);
  advance(api.SITE_HISTORY_TTL - 1);
  await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 1, '아직은 기억해 둔 값을 쓴다');
  advance(2);
  await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 2, '시간이 지나면 다시 받아 온다');
});

test('승인 제보 갱신이 돌면 기억을 버린다', async () => {
  const { api, calls } = loadApi();
  await api.fetchSiteHistory(SITE, 0);
  api.clearSiteHistoryCache();
  await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 2, '갱신 뒤에는 새로 받아 온다');
});

test('탐조지마다 따로 기억한다', async () => {
  const { api, calls } = loadApi();
  await api.fetchSiteHistory({ id: '190' }, 0);
  await api.fetchSiteHistory({ id: '189' }, 0);
  assert.equal(calls.fetch.length, 2, '다른 탐조지는 각자 받아 온다');
  await api.fetchSiteHistory({ id: '190' }, 0);
  await api.fetchSiteHistory({ id: '189' }, 0);
  assert.equal(calls.fetch.length, 2, '둘 다 기억해 둔 값을 쓴다');
});

test("'더 보기'로 받는 뒤쪽 페이지는 기억하지 않는다", async () => {
  const { api, calls } = loadApi();
  await api.fetchSiteHistory(SITE, 5);
  await api.fetchSiteHistory(SITE, 5);
  assert.equal(calls.fetch.length, 2, 'offset 이 있는 요청은 매번 받아 온다');
  assert.equal(Object.keys(api.cache()).length, 0, '뒤쪽 페이지는 기억에 남기지 않는다');
});

test('no-cache 를 붙이지 않아 서버의 60초 캐시를 살린다', async () => {
  const { api, calls } = loadApi();
  await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 1);
  // 요청 주소는 예전과 같다(limit·offset 그대로).
  assert.match(calls.fetch[0], /\/reports\/site\/190\?limit=5&offset=0$/);
  assert.equal(/cache.*no-cache/.test(functionSource('fetchSiteHistory')), false,
    'fetchSiteHistory 가 no-cache 를 보내면 서버 캐시가 죽는다');
});

test('실패해도 null 을 돌려주고 기억에 남기지 않는다', async () => {
  const { api, calls } = loadApi({ responses: () => ({ ok: false, status: 500 }) });
  const result = await api.fetchSiteHistory(SITE, 0);
  assert.equal(result, null, '실패는 null 로 알려 팝업이 이 블록만 지우게 한다');
  assert.equal(Object.keys(api.cache()).length, 0, '실패를 기억하면 안 된다');
  await api.fetchSiteHistory(SITE, 0);
  assert.equal(calls.fetch.length, 2, '다음에 다시 시도한다');
});

test('응답 모양이 어긋나면 실패로 본다', async () => {
  const { api } = loadApi({
    responses: () => ({ ok: true, json: async () => ({ ok: true, history: '배열 아님' }) }),
  });
  assert.equal(await api.fetchSiteHistory(SITE, 0), null);
});

test('응답이 오지 않으면 시간을 끊는다', async () => {
  const { api } = loadApi({ responses: () => new Promise(() => {}) });
  assert.ok(api.SITE_HISTORY_TIMEOUT > 0, '시간 제한이 있어야 한다');
  const source = functionSource('fetchSiteHistory');
  assert.match(source, /AbortController/, '중단 장치를 써야 한다');
  assert.match(source, /SITE_HISTORY_TIMEOUT/, '정해 둔 시간으로 끊어야 한다');
});

/* 팝업 본문을 문자열로 돌려주면 Leaflet 의 popup.update() 가 본문을 다시 만들어 붙이고,
   이력을 그리려고 잡아 둔 칸이 DOM 에서 떨어져 나가 '불러오는 중입니다.'가 남는다.
   임곡항·도구해수욕장이 쓰는 경로가 그랬다. 두 경로 모두 요소를 돌려줘야 한다. */
test('팝업 본문 함수는 문자열이 아니라 요소를 돌려준다', () => {
  for (const name of ['directCoastalPopupContent', 'v23PopupContent']) {
    const source = functionSource(name);
    assert.match(source, /document\.createElement\(/, name + ' 이 요소를 만들지 않는다');
    assert.match(source, /return root;/, name + ' 이 요소를 돌려주지 않는다');
    assert.equal(/return\s*'<div/.test(source), false, name + ' 이 문자열을 돌려준다');
  }
});

test('이력을 그릴 때 칸을 다시 찾는다', () => {
  const init = functionSource('initSiteHistory');
  // 받아 오기 전에 잡아 둔 칸만 믿으면 다시 그려진 팝업에서 이력이 영영 안 나온다.
  assert.match(init, /siteHistoryBoxIn\(popup\)/, '그릴 때 칸을 다시 찾아야 한다');
  const boxIn = functionSource('siteHistoryBoxIn');
  assert.match(boxIn, /document\.body\.contains\(box\)/, '떨어져 나간 칸은 걸러야 한다');
});

test('서버가 쓰는 캐시 시간과 같은 값을 쓴다', () => {
  const { api } = loadApi();
  const worker = readFileSync(join(ROOT, 'reports-api', 'src', 'public.js'), 'utf8');
  const maxAge = /max-age=(\d+)/.exec(worker);
  assert.ok(maxAge, 'Worker 의 Cache-Control 을 찾지 못했습니다');
  assert.equal(api.SITE_HISTORY_TTL, Number(maxAge[1]) * 1000,
    '화면 기억 시간과 서버 캐시 시간이 어긋나면 새 승인 건 반영 시점이 흐려진다');
});
