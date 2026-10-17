/* P1 위치 보호: 늦게 도착한 옛 API 응답·GPS 콜백이 삭제·가림·철회된 위치를 되살리지 못하는지 검증한다.
   index.html 의 실제 함수 소스를 꺼내 가짜 fetch/지도/GPS 로 실행한다(좌표는 모두 합성 값, 실제 제보·민감종 자료 없음).
   실행: node --test .github/scripts/test_location_protection.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML = readFileSync(process.env.INDEX_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

function functionSource(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, '함수가 없습니다: ' + name);
  let depth = 0, quote = null;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    const c = HTML[i], prev = HTML[i - 1];
    if (quote) { if (c === quote && prev !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('중괄호 불일치: ' + name);
}
const line = (re) => HTML.match(re)[0];

const NOW = Date.parse('2026-10-08T10:00:00+09:00');
const AUTHORITY={contract:'publication-v1',projection:'legacy-public-v1',epoch:'a'.repeat(32),revision:'1',nonce:'b'.repeat(32)};
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const upd = (id, extra = {}) => Object.assign({ id, species: 's' + id, status: 'visible', lat: 36.6, lon: 126.4, updatedAt: iso(5),
  firstSeenAt: iso(5), lastConfirmedAt: null, history: [],rowRevision:'1',expiresAt:new Date(NOW+8*3600000).toISOString() }, extra);

/* ── 출현종 제보 ── */
function reportEnv() {
  const calls = []; const rendered = []; let searchIndexBuilds = 0;
  const names = ['reportRequestStart', 'reportResponseCurrent', 'loadApprovedReports', 'loadPendingReports', 'loadRecentSiteSightings',
    'clearSiteHistoryCache', 'cachedSiteHistory', 'fetchSiteHistory','publicationAllowed','publicationSame','publicationDataAllowed'];
  const decl = line(/var reportRequestSeq=[^\n]+/) + '\n' + line(/var SITE_HISTORY_TTL=[^\n]+/) + '\n' + line(/var SITE_HISTORY_TIMEOUT=[^\n]+/) + '\nvar siteHistoryCache={};var siteHistoryGen=0;var SITE_HISTORY_PAGE=10;';
  const body = decl + 'var document={hidden:false};function publicationInvalidate(){publicationState.ready=false;publicationState.until=0;}var PUBLICATION_MAX_AGE=5000,publicationState={ready:true,until:Date.now()+5000,checkedMono:performance.now(),anchor:AUTHORITY};var reportFixedHistory={},recentReportsFailed=false,recentSiteSightings={};' +
    'function publicationFetch(path){return fetch(REPORTS_API_URL+path,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("transport");return r.json();});}'+
    'function reportsConfigured(){return true;} function buildReportSearchIndex(){searchIndexBuilds++;} function renderRecentReports(){} function refreshFixedSpotPopups(){}' +
    'function renderApprovedReports(s){rendered.push("approved:"+s.map(function(x){return x.id;}).join(","));} function renderPendingReports(s){rendered.push("pending:"+s.map(function(x){return x.id;}).join(","));}' +
    'function refreshTodayPanelIfOpen(){} var REPORTS_API_URL="https://x.invalid";' +
    names.map(functionSource).join('\n') + '\nreturn {loadApprovedReports,loadPendingReports,loadRecentSiteSightings,clearSiteHistoryCache,fetchSiteHistory,get gen(){return siteHistoryGen;}};';
  const fetch = (url) => new Promise((resolve) => { calls.push({ url, resolve }); });
  const api = new Function('fetch', 'rendered', 'searchIndexBuilds', 'AbortController','AUTHORITY', body)(fetch, rendered, 0, undefined,AUTHORITY);
  const ok = (data) => ({ ok: true, json: () => Promise.resolve({...data,publication:AUTHORITY}) });
  return { api, calls, rendered, ok, settle: () => new Promise((r) => setImmediate(r)) };
}

test('승인 제보: 공개 취소(철회) 뒤 도착한 옛 응답이 마커를 되살리지 못한다', async () => {
  const r = reportEnv();
  const stale = r.api.loadApprovedReports();    // call 0 (철회 전)
  const fresh = r.api.loadApprovedReports();    // call 1 (철회 후: 목록에 없음)
  r.calls[1].resolve(r.ok({ ok: true, spots: [{ id: 'keep', lat: 1, lon: 1 }] })); await fresh;
  r.calls[0].resolve(r.ok({ ok: true, spots: [{ id: 'keep', lat: 1, lon: 1 }, { id: 'withdrawn', lat: 1, lon: 1 }] })); await stale;
  assert.deepEqual(r.rendered, ['approved:keep'], '옛 응답은 렌더되지 않음');
});











test('승인 제보: 위치 가림 뒤 도착한 옛 응답이 정확 좌표를 다시 그리지 못한다 (대기·최근 제보 포함)', async () => {
  const r = reportEnv();
  const a0 = r.api.loadApprovedReports(), a1 = r.api.loadApprovedReports();
  r.calls[1].resolve(r.ok({ ok: true, spots: [{ id: 'x', lat: 36.5, lon: 126.5, locationHidden: true }] })); await a1;
  r.calls[0].resolve(r.ok({ ok: true, spots: [{ id: 'x', lat: 36.6, lon: 126.4 }] })); await a0;
  assert.deepEqual(r.rendered, ['approved:x']);   // 한 번(가림 응답)만
  const p0 = r.api.loadPendingReports(), p1 = r.api.loadPendingReports();
  r.calls[3].resolve(r.ok({ ok: true, spots: [] })); await p1;
  r.calls[2].resolve(r.ok({ ok: true, spots: [{ id: 'gone' }] })); await p0;
  assert.deepEqual(r.rendered, ['approved:x', 'pending:']);
  const s0 = r.api.loadRecentSiteSightings(), s1 = r.api.loadRecentSiteSightings();
  r.calls[5].resolve(r.ok({ ok: true, sites: [] })); assert.equal(await s1, true);
  r.calls[4].resolve(r.ok({ ok: true, sites: [{ siteId: '1', latestDate: '2026-10-01', species: ['a'] }] })); assert.equal(await s0, false);
});

test('정상 순서의 응답은 모두 반영된다(회귀)', async () => {
  const r = reportEnv();
  const a0 = r.api.loadApprovedReports(); r.calls[0].resolve(r.ok({ ok: true, spots: [{ id: '1', lat: 1, lon: 1 }] })); assert.equal(await a0, true);
  const a1 = r.api.loadApprovedReports(); r.calls[1].resolve(r.ok({ ok: true, spots: [{ id: '2', lat: 1, lon: 1 }] })); assert.equal(await a1, true);
  assert.deepEqual(r.rendered, ['approved:1', 'approved:2']);
});

test('탐조지 이력 기억: 승인 제보 갱신 전에 보낸 요청의 응답은 기억에 넣지 않고 다시 받는다', async () => {
  const r = reportEnv();
  const site = { id: 's1' };
  const p = r.api.fetchSiteHistory(site, 0);                    // call 0 (옛 자료)
  r.api.clearSiteHistoryCache();                                 // 승인 제보 갱신(철회 반영)
  r.calls[0].resolve(r.ok({ ok: true, history: [{ date: '2026-10-01', species: ['withdrawn'] }], total: 1 }));
  await r.settle();
  assert.equal(r.calls.length, 2, '한 번 다시 요청');
  r.calls[1].resolve(r.ok({ ok: true, history: [], total: 0 }));
  const data = await p;
  assert.deepEqual(data.history, [], '철회된 이력은 화면에 쓰이지 않는다');
  const again = await r.api.fetchSiteHistory(site, 0);           // 기억된 것은 새 응답
  assert.deepEqual(again.history, []);
  assert.equal(r.calls.length, 2);
});
