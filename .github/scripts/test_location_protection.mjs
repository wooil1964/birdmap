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
  firstSeenAt: iso(5), lastConfirmedAt: null, history: [],rowRevision:'1',expiresAt:new Date(NOW+3*3600000).toISOString() }, extra);

/* 제어 가능한 가짜 환경. fetch/GPS 응답은 테스트가 원하는 순서로 풀어 준다. */
function env() {
  const calls = []; const toasts = []; const geoPending = []; const watches = new Map(); let watchSeq = 0;
  const proxy = () => new Proxy(function () {}, { get: (t, p) => (p === 'isPopupOpen' ? () => false : p === 'getElement' ? () => null : () => proxy()) });
  const names = ['fieldGuardIncoming', 'fieldBarrier', 'loadFieldUpdates', 'fieldFind', 'fieldValidUpdate', 'fieldIsActive', 'fieldAgeMin', 'fieldActivityMs',
    'fieldMarkerClass', 'fieldMarkerSignature', 'renderFieldMarkers', 'fieldGuideTarget', 'fieldGuideUpdate', 'fieldGuideFit', 'fieldGuideOnPosition',
    'fieldGuideWatchStop', 'fieldGuideOnError', 'fieldGuideWatch', 'fieldGuideStart', 'fieldGuideStop', 'fieldBearing', 'fieldDistanceText',
    'fieldPublicPoint', 'fieldNavMode', 'fieldNavDistanceText', 'fieldNewsNavigate', 'fieldNavManualGuide', 'fieldNavGuide', 'fieldNavChoiceClose',
    'fieldNavChoiceGuard', 'fieldReplace', 'fieldRemoveLocal', 'fieldNewsList', 'haversineKm', 'fieldAgeText', 'publicationAllowed','publicationSame','publicationDataAllowed','publicationRevision','publicationValidate','publicationRenew','publicationRouteCheck'];
  const consts = [line(/var FIELD_TTL_HOURS_DEFAULT=3;/), line(/var FIELD_OLD_MIN=60;/), line(/var FIELD_AGING_MIN=30;/),
    line(/var FIELD_STATUS_LABEL=\{[^\n]+/), line(/var FIELD_GUIDE_MIN_ZOOM=11;/), line(/var FIELD_COMPASS=\[[^\n]+/), line(/var FIELD_NEWS_PC_MAX=[^\n]+/)].join('\n');
  const fakeLatLng = (lat, lng) => ({ lat, lng, distanceTo: () => 1234 });
  const sandbox = {
    L: { latLng: fakeLatLng, latLngBounds: () => ({}), circleMarker: proxy, polyline: proxy, marker: proxy, divIcon: proxy, layerGroup: proxy, point: () => ({}) },
    map: { closePopup() {}, hasLayer: () => true, removeLayer() {}, addLayer() {}, getBoundsZoom: () => 15, setView() {}, fitBounds() {}, getZoom: () => 12 },
    document: { body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: proxy },
    navigator: { geolocation: {
      watchPosition: (ok, err) => { const id = ++watchSeq; watches.set(id, { ok, err }); return id; },
      clearWatch: (id) => { watches.delete(id); },
      getCurrentPosition: (ok, err) => { geoPending.push({ ok, err }); } } },
    matchMedia: () => ({ matches: false }), innerWidth: 400, NOW, AUTHORITY,
    Date:class extends Date{static now(){return NOW;}},
    setTimeout:()=>1,clearTimeout:()=>{},
    fieldApi: (path, method) => new Promise((resolve) => { calls.push({ path, method, resolve }); }),
    toast: (text) => { toasts.push(text); },
    chooser: [],
  };
  const body =
    'var publicationState={ready:true,until:NOW+5000,checkedMono:performance.now(),anchor:AUTHORITY},PUBLICATION_MAX_AGE=5000,publicationExpiryTimer=0,headUnavailable=false,headChecks=0,PUBLICATION_CONTRACT="publication-v1",PUBLICATION_PROJECTION="legacy-public-v1";'+
    // Unit boundary: a synthetic fresh head; use actual validator, renewal and route gate.
    'function publicationHead(){headChecks++;if(headUnavailable)return Promise.reject(new Error("head unavailable"));var head={publication:publicationState.anchor,serverTime:new Date(NOW).toISOString()};publicationValidate(head,AUTHORITY.nonce);return Promise.resolve(head);}function publicationNotice(){}function publicationRefresh(){return Promise.resolve(false);}'+
    'var fieldUpdates=[],fieldAvailable=false,fieldClockOffset=0,fieldTtlHours=3,fieldMarkers={},fieldLayer=null,fieldGuide=null;' +
    'var fieldRequestSeq=0,fieldAppliedSeq=0,fieldBarrierSeq=0,fieldTombstones={},fieldProtectedIds={},fieldStepName="menu";' +
    'function fieldNowMs(){return NOW;} function fieldMap(){return map;} function fieldToast(t){toast(t);} function reportsConfigured(){return true;}' +
    'function fieldEl(id){return id==="fieldNavChoice"?window_navBox:id==="fieldPanel"?{hidden:true}:id==="fieldToggleBtn"?{hidden:true}:null;}' +
    'var window_navBox=null; function setNavBox(b){window_navBox=b;}' +
    'function fieldGuideBox(){var el={textContent:"",hidden:false};return {parentNode:null,querySelector:function(){return el;}};}' +
    'function fieldNavChooser(u,m){chooser.push({id:u.id,message:m});}' +
    'function fieldNavExternal(u){chooser.push({id:u.id,external:true});}' +
    'function fieldRender(){} function renderFieldNews(){}' +
    constsAndFns();
  function constsAndFns() { return consts + '\n' + names.map(functionSource).join('\n'); }
  const api = new Function(...Object.keys(sandbox), body +
    '\nreturn {loadFieldUpdates,fieldReplace,fieldRemoveLocal,fieldGuideStart,fieldGuideOnPosition,fieldNewsNavigate,fieldNavManualGuide,fieldNavChoiceGuard,setNavBox,' +
    'get fieldUpdates(){return fieldUpdates;},get fieldGuide(){return fieldGuide;},get fieldMarkers(){return fieldMarkers;},fieldPublicPoint,'+
    'acceptAuthority(revision){if(BigInt(revision)>=BigInt(publicationState.anchor.revision))publicationState.anchor={...AUTHORITY,revision};},blockHead(){headUnavailable=true;},get headChecks(){return headChecks;},expireAuthority(){publicationState.until=0;headUnavailable=true;},unknownAuthority(){publicationState.ready=false;headUnavailable=true;}};')(...Object.values(sandbox));
  const respond = (callIndex, updates, ok = true, revision=String(callIndex+1)) => {api.acceptAuthority(revision);calls[callIndex].resolve({ ok, status: ok ? 200 : 500, body: { ok, updates,publication:{...AUTHORITY,revision},publicationCheckedAt:new Date(NOW).toISOString(),serverTime: new Date(NOW).toISOString() } });};
  const settle = () => new Promise((r) => setImmediate(r));
  const touchGuide = async (id) => { api.fieldGuideStart(id); };
  return { api, calls, toasts, geoPending, watches, respond, settle, touchGuide, chooser: sandbox.chooser };
}

const HIDDEN = (id, extra) => upd(id, Object.assign({ locationHidden: true, lat: 36.5, lon: 126.5 }, extra));

test('삭제 → 오래된 GET 응답 도착 → 마커·목록 복구 0건', async () => {
  const e = env();
  const first = e.api.loadFieldUpdates(); e.respond(0, [upd('a'), upd('b')]); await first;
  assert.deepEqual(e.api.fieldUpdates.map((u) => u.id), ['a', 'b']);
  const stale = e.api.loadFieldUpdates();           // 삭제 전에 보낸 GET (call 1)
  e.api.fieldRemoveLocal('a');                      // 삭제 완료 → barrier + 새 GET (call 2)
  assert.deepEqual(e.api.fieldUpdates.map((u) => u.id), ['b']);
  e.respond(1, [upd('a'), upd('b')]); await stale;  // 옛 응답이 늦게 도착
  assert.deepEqual(e.api.fieldUpdates.map((u) => u.id), ['b'], '목록 복구 0건');
  assert.ok(!('a' in e.api.fieldMarkers), '마커 복구 0건');
  // 삭제 뒤에 보낸 요청이 (서버 오류 등으로) 같은 id 를 다시 줘도 tombstone 이 막는다.
  e.respond(2, [upd('a'), upd('b')]); await e.settle();
  assert.deepEqual(e.api.fieldUpdates.map((u) => u.id), ['b'], 'tombstone');
  assert.ok(!('a' in e.api.fieldMarkers));
});

test('여러 GET 이 뒤바뀌어 도착해도(응답 세대) 나중에 보낸 것만 반영된다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  const older = e.api.loadFieldUpdates();   // call 1
  const newer = e.api.loadFieldUpdates();   // call 2: 'a' 가 사라진(만료·삭제) 최신 상태
  e.respond(2, [upd('b')]); await newer;
  e.respond(1, [upd('a'), upd('b')]); await older;
  assert.deepEqual(e.api.fieldUpdates.map((u) => u.id), ['b']);
  assert.ok(!('a' in e.api.fieldMarkers));
});

test('위치 가림 → 오래된 응답 도착 → 정확 좌표 재노출 0건', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  const stale = e.api.loadFieldUpdates();   // call 1: 가림 전에 보냄(정확 좌표)
  const fresh = e.api.loadFieldUpdates();   // call 2: 가림 뒤
  e.respond(2, [HIDDEN('a')]); await fresh;
  assert.equal(e.api.fieldUpdates[0].locationHidden, true);
  e.respond(1, [upd('a')]); await stale;     // 옛 응답(정확 좌표)이 늦게 도착
  assert.equal(e.api.fieldUpdates[0].locationHidden, true);
  assert.equal(e.api.fieldUpdates[0].lat, 36.5, '가려진 좌표 유지');
  // 세대와 무관하게 이후 요청이 정확 좌표로 돌아와도(서버 캐시 등) 보호 기록이 막는다.
  const later = e.api.loadFieldUpdates(); e.respond(3, [upd('a')],true,'1'); await later;
  assert.equal(e.api.fieldUpdates[0].locationHidden, true);
  assert.equal(e.api.fieldUpdates[0].lat, 36.5);
});

test('상태 변경(POST) 응답으로 가림이 확인되면 그 전에 보낸 목록 GET 의 정확 좌표가 덮지 못한다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  const inflight = e.api.loadFieldUpdates();   // call 1 (정확 좌표를 들고 올 요청)
  e.api.fieldReplace(HIDDEN('a'));              // POST 응답: 가림
  e.respond(1, [upd('a')]); await inflight;
  assert.equal(e.api.fieldUpdates[0].locationHidden, true);
  assert.equal(e.api.fieldUpdates[0].lat, 36.5);
  e.api.fieldReplace(upd('a'));                 // 정확 좌표 POST 응답도 가림을 되돌리지 못한다
  assert.equal(e.api.fieldUpdates[0].locationHidden, true);
});

test('삭제된 id 는 늦은 POST 응답(fieldReplace)으로도 되살아나지 않는다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldRemoveLocal('a');
  e.api.fieldReplace(upd('a'));
  assert.deepEqual(e.api.fieldUpdates, []);
  assert.ok(!('a' in e.api.fieldMarkers));
});

test('길안내 중 보호 전환 → 안내·GPS 추적 즉시 중단', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldGuideStart('a');
  await e.settle();
  assert.ok(e.api.fieldGuide && e.watches.size === 1, '안내 시작 + watch');
  e.watches.get(1).ok({ coords: { latitude: 36.0, longitude: 126.0 } });
  await e.settle();
  const fresh = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await fresh;
  assert.equal(e.api.fieldGuide, null, '안내 종료');
  assert.equal(e.watches.size, 0, 'watchPosition 해제');
  assert.ok(e.toasts.some((t) => /위치 보호/.test(t)));
});

test('이미 실행 중인 GPS 콜백이 보호 직후 도착해도 안내가 재개되지 않는다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldGuideStart('a');
  await e.settle();
  const lateWatchCb = e.watches.get(1).ok;                       // 이미 큐에 있던 콜백
  const fresh = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await fresh;
  assert.equal(e.api.fieldGuide, null);
  lateWatchCb({ coords: { latitude: 36.0, longitude: 126.0 } }); // 해제 뒤 늦게 실행
  await e.settle();
  assert.equal(e.api.fieldGuide, null, '재개 0건');
  assert.equal(e.watches.size, 0);
});

test('보호 상태가 막 반영됐지만 안내 객체가 아직 남은 순간의 콜백도 최신 상태를 확인하고 멈춘다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldGuideStart('a');
  await e.settle();
  const cb = e.watches.get(1).ok;
  e.api.fieldUpdates[0].locationHidden = true;                   // renderFieldMarkers 를 거치지 않고 상태만 먼저 바뀐 경우
  cb({ coords: { latitude: 36.0, longitude: 126.0 } });
  await e.settle();
  assert.equal(e.api.fieldGuide, null);
  assert.equal(e.watches.size, 0);
});

test('보호 소식은 방향 안내를 시작할 수 없다(직접 호출 포함)', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [HIDDEN('h'), upd('ok')]); await p0;
  e.api.fieldGuideStart('h');
  await e.settle();
  assert.equal(e.api.fieldGuide, null);
  assert.equal(e.watches.size, 0);
  e.api.fieldGuideStart('ok');
  await e.settle();
  assert.ok(e.api.fieldGuide);
  e.api.fieldGuideStart('h');                                    // 다른 소식으로 바꾸는 경로도 막는다
  await e.settle();
  assert.equal(e.api.fieldGuide.id, 'ok');
});

test('지연 GPS(길안내 버튼) → 그 사이 보호·삭제되면 방향 안내·외부 길찾기 모두 시작하지 않는다', async () => {
  for (const mutate of ['hide', 'delete']) {
    const e = env();
    const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
    e.api.fieldNewsNavigate('a');                                 // GPS 응답 대기
    await e.settle();
    assert.equal(e.geoPending.length, 1);
    if (mutate === 'hide') { const f = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await f; } else e.api.fieldRemoveLocal('a');
    e.geoPending[0].ok({ coords: { latitude: 36.0, longitude: 126.0, accuracy: 10 } });
    await e.settle();
    assert.equal(e.api.fieldGuide, null, mutate);
    assert.deepEqual(e.chooser, [], mutate + ': 외부 길찾기/선택창 0건');
    assert.ok(e.toasts.some((t) => /시작하지 않았어요/.test(t)));
  }
});

test('GPS 오류 콜백도 보호된 소식의 선택창(정확 좌표 링크)을 만들지 않는다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldNewsNavigate('a');
  await e.settle();
  const f = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await f;
  e.geoPending[0].err({ code: 2 });
  await e.settle();
  assert.deepEqual(e.chooser, []);
});

test('수동 방향 유도(GPS 확인 후 시작)도 늦은 콜백에서 보호를 다시 확인한다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldNavManualGuide('a');
  await e.settle();
  const f = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await f;
  e.geoPending[0].ok({ coords: { latitude: 36.0, longitude: 126.0 } });
  await e.settle();
  assert.equal(e.api.fieldGuide, null);
  assert.equal(e.watches.size, 0);
});

test('정상(공개) 소식은 그대로 길안내·방향 안내가 된다(회귀)', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  e.api.fieldNewsNavigate('a');
  await e.settle();
  e.geoPending[0].ok({ coords: { latitude: 36.6, longitude: 126.5, accuracy: 10 } });   // 가까운 거리 → 방향 유도
  await e.settle();
  assert.ok(e.api.fieldGuide && e.api.fieldGuide.id === 'a');
  assert.equal(e.watches.size, 1);
  const e2 = env();
  const q0 = e2.api.loadFieldUpdates(); e2.respond(0, [upd('far')]); await q0;
  e2.api.fieldNewsNavigate('far');
  await e2.settle();
  e2.geoPending[0].ok({ coords: { latitude: 33.0, longitude: 126.5, accuracy: 10 } });  // 멀리 → 외부 길찾기
  await e2.settle();
  assert.deepEqual(e2.chooser, [{ id: 'far', external: true }]);
});

test('열려 있던 길안내 선택창은 소식이 보호되면 닫힌다', async () => {
  const e = env();
  const p0 = e.api.loadFieldUpdates(); e.respond(0, [upd('a')]); await p0;
  let removed = false;
  e.api.setNavBox({ getAttribute: () => 'a', parentNode: { removeChild() { removed = true; } } });
  e.api.fieldNavChoiceGuard(); assert.equal(removed, false, '공개 소식이면 유지');
  const f = e.api.loadFieldUpdates(); e.respond(1, [HIDDEN('a')]); await f;
  assert.equal(removed, true, '보호되면 renderFieldMarkers 가 닫는다');
});

/* ── 출현종 제보 ── */
function reportEnv() {
  const calls = []; const rendered = []; let searchIndexBuilds = 0;
  const names = ['reportRequestStart', 'reportResponseCurrent', 'loadApprovedReports', 'loadPendingReports', 'loadRecentSiteSightings',
    'clearSiteHistoryCache', 'cachedSiteHistory', 'fetchSiteHistory','publicationAllowed','publicationSame','publicationDataAllowed'];
  const decl = line(/var reportRequestSeq=[^\n]+/) + '\n' + line(/var SITE_HISTORY_TTL=[^\n]+/) + '\n' + line(/var SITE_HISTORY_TIMEOUT=[^\n]+/) + '\nvar siteHistoryCache={};var siteHistoryGen=0;var SITE_HISTORY_PAGE=10;';
  const body = decl + 'var PUBLICATION_MAX_AGE=5000,publicationState={ready:true,until:Date.now()+5000,checkedMono:performance.now(),anchor:AUTHORITY};var reportFixedHistory={},recentReportsFailed=false,recentSiteSightings={};' +
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

test('권한 만료·미확인은 현장 좌표·GPS 시작을 차단한다(전송 검증 경계 단위)',async()=>{
 for(const method of ['expireAuthority','unknownAuthority']){const e=env();const p=e.api.loadFieldUpdates();e.respond(0,[upd('a')]);await p;e.api[method]();assert.equal(e.api.fieldPublicPoint(e.api.fieldUpdates[0]),null);e.api.fieldNewsNavigate('a');await e.settle();assert.equal(e.geoPending.length,0);assert.deepEqual(e.chooser,[]);}
});

test('가림 해제는 더 새로운 명시 공개 권한에서 복구된다(영구 sticky 아님)',async()=>{
 const e=env();const p=e.api.loadFieldUpdates();e.respond(0,[HIDDEN('a')]);await p;assert.equal(e.api.fieldPublicPoint(e.api.fieldUpdates[0]),null);
 const q=e.api.loadFieldUpdates();e.respond(1,[upd('a')],true,'2');await q;assert.deepEqual(e.api.fieldPublicPoint(e.api.fieldUpdates[0]),{lat:36.6,lon:126.4});
});

test('캐시 권한이 아직 유효해도 새 head 확인 실패면 직접 방향안내를 시작하지 않는다',async()=>{
 const e=env();const p=e.api.loadFieldUpdates();e.respond(0,[upd('a')]);await p;
 assert.ok(e.api.fieldPublicPoint(e.api.fieldUpdates[0]));e.api.blockHead();e.api.fieldGuideStart('a');await e.settle();
 assert.equal(e.api.headChecks,1);assert.equal(e.api.fieldGuide,null);assert.equal(e.watches.size,0);
});

test('GPS 응답 뒤 head를 다시 확인하고 실패면 성공·오류·수동 콜백이 안내를 열지 않는다',async()=>{
 for(const mode of ['success','error','manual']){
  const e=env();const p=e.api.loadFieldUpdates();e.respond(0,[upd('a')]);await p;
  if(mode==='manual')e.api.fieldNavManualGuide('a');else e.api.fieldNewsNavigate('a');await e.settle();
  assert.equal(e.geoPending.length,1);assert.equal(e.api.headChecks,1);e.api.blockHead();
  if(mode==='error')e.geoPending[0].err({code:2});else e.geoPending[0].ok({coords:{latitude:33,longitude:126.5,accuracy:10}});
  await e.settle();assert.equal(e.api.headChecks,2,mode);assert.equal(e.api.fieldGuide,null,mode);assert.equal(e.watches.size,0,mode);assert.deepEqual(e.chooser,[],mode);
 }
});

test('연속 GPS watch의 정상 위치·오류 반영은 각각 새 권한 head 뒤에만 실행한다',async()=>{
 const e=env();const p=e.api.loadFieldUpdates();e.respond(0,[upd('a')]);await p;e.api.fieldGuideStart('a');await e.settle();assert.equal(e.api.headChecks,1);
 const watch=e.watches.get(1);assert.ok(watch);watch.ok({coords:{latitude:36,longitude:126}});assert.equal(e.api.fieldGuide.me,null,'fresh head 전에 위치 선을 갱신하지 않는다');
 await e.settle();assert.equal(e.api.headChecks,2);assert.ok(e.api.fieldGuide.me);
 watch.err({code:1});await e.settle();assert.equal(e.api.headChecks,3);assert.equal(e.api.fieldGuide.me,null);assert.equal(e.watches.size,0);
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

test('소스 점검: 응답 세대·tombstone·최신 상태 확인이 연결되어 있다', () => {
  for (const [name, needles] of [
    ['loadFieldUpdates', ['fieldAppliedSeq', 'fieldBarrierSeq', 'fieldGuardIncoming']],
    ['fieldGuideOnPosition', ['fieldGuideTarget']],
    ['fieldGuideStart', ['fieldGuideTarget']],
    ['fieldNewsNavigate', ['fieldGuideTarget']],
    ['fieldNavManualGuide', ['fieldGuideTarget']],
    ['fieldRemoveLocal', ['fieldTombstones', 'fieldBarrier']],
    ['fieldReplace', ['fieldGuardIncoming']],
  ]) {
    const src = functionSource(name);
    for (const n of needles) assert.ok(src.includes(n), name + ' 에 ' + n);
  }
});
