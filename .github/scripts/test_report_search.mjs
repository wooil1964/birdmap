/* 출현종 제보 통합 검색 회귀 테스트.
   index.html 의 실제 함수 소스를 그대로 꺼내 검증한다(로직 복제 금지).
   실행: node --test .github/scripts/test_report_search.mjs */
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

const NAMES = [
  'normalizeQuery', 'buildReportSearchIndex', 'reportEntryMatches',
  'searchReportEntries', 'reportEntryPlace',
];

// 공개 API 가 실제로 내려보내는 모양. 좌표는 이미 공개 좌표로 바뀐 값이다.
const SPOTS = [
  { id: 'rep-1', lat: 37.762436, lon: 126.705609, species: ['붉은가슴기러기'],
    history: [{ id: 'rep-1', date: '2025-11-20', species: ['붉은가슴기러기'], reporter: '관찰자A' }] },
  { id: 'rep-2', lat: 35.904364, lon: 126.651881, species: ['붉은가슴기러기', '흑두루미'],
    history: [
      { id: 'rep-2', date: '2026-03-18', species: ['붉은가슴기러기'], reporter: '관찰자B' },
      { id: 'rep-2b', date: '2017-04-11', species: ['흑두루미'] },
    ] },
];

function loadApi(fixedHistory = {}) {
  const env = {
    siteSpotData: [
      { id: 'fixed:195:0', siteId: '195', lat: 37.5632527778, lon: 126.8969333333, species: ['큰덤불해오라기'] },
    ],
    siteData: [{ id: '195', name: '평화의공원' }],
    reportFixedHistory: fixedHistory,
  };
  const src = [
    'var reportSearchIndex=[];',
    ...NAMES.map(functionSource),
    'return {buildReportSearchIndex,searchReportEntries,reportEntryPlace,reportEntryMatches,' +
      'index:function(){return reportSearchIndex;}};',
  ].join('\n');
  const keys = Object.keys(env);
  return new Function(...keys, src)(...keys.map((k) => env[k]));
}

test('이미 받아 둔 승인 자료로 검색 목록을 만든다', () => {
  const api = loadApi();
  api.buildReportSearchIndex(SPOTS);
  const index = api.index();
  assert.equal(index.length, 3);
  // 실제 관찰일 최신순이다.
  assert.deepEqual(index.map((e) => e.date), ['2026-03-18', '2025-11-20', '2017-04-11']);
});

test('고정 붉은 점에 연결된 제보도 함께 들어간다', () => {
  const api = loadApi({
    'fixed:195:0': [{ id: 'rep-3', date: '2026-05-05', species: ['청호반새'], reporter: '관찰자D' }],
  });
  api.buildReportSearchIndex(SPOTS);
  const fixed = api.index().filter((e) => e.kind === 'fixed');
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].spotId, 'fixed:195:0');
  // 좌표는 siteSpotData 의 기존 점 좌표를 그대로 쓴다(새로 만들지 않는다).
  assert.equal(fixed[0].lat, 37.5632527778);
  // 최신순 정렬에 함께 섞인다.
  assert.deepEqual(api.index().map((e) => e.date),
    ['2026-05-05', '2026-03-18', '2025-11-20', '2017-04-11']);
});

test('종명으로 검색되고 과거 관찰도 걸린다', () => {
  const api = loadApi();
  api.buildReportSearchIndex(SPOTS);
  const hits = api.searchReportEntries(['붉은가슴기러기']);
  assert.deepEqual(hits.map((e) => e.date), ['2026-03-18', '2025-11-20']);
  const old = api.searchReportEntries(['흑두루미']);
  assert.deepEqual(old.map((e) => e.date), ['2017-04-11'], '2017년 자료도 검색된다');
});

test('같은 지점의 여러 관찰이 각각 한 줄로 나온다', () => {
  const api = loadApi();
  api.buildReportSearchIndex(SPOTS);
  const sameSpot = api.index().filter((e) => e.spotId === 'rep-2');
  assert.equal(sameSpot.length, 2, '한 점에 두 관찰일이면 두 줄이다');
  assert.deepEqual(sameSpot.map((e) => e.date), ['2026-03-18', '2017-04-11']);
});

test('검색어가 없으면 아무것도 돌려주지 않는다', () => {
  const api = loadApi();
  api.buildReportSearchIndex(SPOTS);
  assert.deepEqual(api.searchReportEntries([]), []);
  assert.deepEqual(api.searchReportEntries(['없는종이름']), []);
});

test('공개 API 가 준 공개 좌표만 목록에 들어간다', () => {
  const api = loadApi();
  api.buildReportSearchIndex(SPOTS);
  // 항목이 갖는 열은 공개 자료에서 온 것뿐이다.
  for (const entry of api.index()) {
    assert.deepEqual(Object.keys(entry).sort(),
      ['date', 'kind', 'lat', 'lon', 'reporter', 'species', 'spotId']);
  }
  // 좌표는 spots 가 준 값 그대로다(실제 좌표를 따로 받아 오지 않는다).
  const one = api.index().find((e) => e.spotId === 'rep-1');
  assert.equal(one.lat, 37.762436);
  assert.equal(one.lon, 126.705609);
});

test('승인되지 않은 제보는 애초에 목록에 없다', () => {
  const api = loadApi();
  // /reports/approved 에는 승인 건만 나오므로 목록에도 승인 건만 들어간다.
  api.buildReportSearchIndex(SPOTS);
  assert.equal(api.index().some((e) => e.species.includes('승인대기종')), false);
  // 빈 목록을 받으면 검색 대상도 비워진다(공개 취소 반영).
  api.buildReportSearchIndex([]);
  assert.deepEqual(api.index(), []);
});

test('위치 이름은 고정 점이면 탐조지명, 독립 점이면 공개 좌표를 쓴다', () => {
  const api = loadApi({
    'fixed:195:0': [{ id: 'rep-3', date: '2026-05-05', species: ['청호반새'] }],
  });
  api.buildReportSearchIndex(SPOTS);
  const fixed = api.index().find((e) => e.kind === 'fixed');
  assert.equal(api.reportEntryPlace(fixed), '평화의공원 출현 지점');
  const spot = api.index().find((e) => e.spotId === 'rep-1');
  assert.equal(api.reportEntryPlace(spot), '공개 관찰 위치 37.762, 126.706');
});

test('좌표가 없는 제보는 목록에 넣지 않는다', () => {
  const api = loadApi();
  api.buildReportSearchIndex([
    { id: 'bad', lat: null, lon: null, species: ['동박새'], history: [{ id: 'bad', date: '2026-01-01', species: ['동박새'] }] },
    { id: '', lat: 37, lon: 127, species: ['동박새'], history: [{ id: '', date: '2026-01-01', species: ['동박새'] }] },
  ]);
  assert.deepEqual(api.index(), []);
});

test('검색 결과 클릭은 기존 마커만 쓰고 새 마커를 만들지 않는다', () => {
  const source = functionSource('openReportEntry');
  // 승인 점은 reportSpotLayers, 고정 점은 siteSpotLayers 를 그대로 연다.
  assert.match(source, /reportSpotLayers\[entry\.spotId\]/);
  assert.match(source, /siteSpotLayers\[index\]/);
  assert.match(source, /openPopup\(\)/);
  // 이동은 목록에 담긴 공개 좌표로만 한다.
  assert.match(source, /setView\(\[entry\.lat,entry\.lon\]/);
});

test('고정점 세 곳은 검색·필터·이력 갱신 어느 경로로 처음 만들어도 같은 공개 목적지 버튼을 제공한다', () => {
  const fixed = JSON.parse(HTML.match(/var siteSpotData=(\[[\s\S]*?\n\]);/)[1]);
  assert.equal(fixed.length, 3);
  const names = ['openReportEntry', 'syncSiteSpots', 'refreshFixedSpotPopups', 'birdmapSpotMarker',
    'spotPopupHtml', 'spotRouteButtonsHtml', 'spotKakaoRouteUrl', 'spotKakaoRouteHtml',
    'tmapNavigationUrl', 'tmapNavigationLink', 'spotTmapRouteHtml', 'escapeHtml'];
  function environment() {
    const layers = new Set(), siteSpotLayers = {}, moves = [];
    const map = {hasLayer: layer => layers.has(layer), removeLayer: layer => layers.delete(layer),
      setView: point => moves.push(point), once() {}};
    const L = {circleMarker(point) {return {point, bindPopup(content) {this.content = content;return this;},
      bindTooltip() {return this;}, addTo() {layers.add(this);return this;}, openPopup() {this.opened = true;},
      setPopupContent(content) {this.content = content;}};}};
    const context = {L, siteSpotData: fixed, siteSpotLayers, reportFixedHistory: {},
      siteData: [{id: '21', name: '공개 탐조지 21'}, {id: '195', name: '공개 탐조지 195'}],
      map_7010a44f6ac2025090f0fe07508ed485: map, reportSpotLayers: {},
      publicationAllowed: () => true, spotSpeciesCoveredByHistory: () => false, spotHistoryHtml: () => ''};
    const keys = Object.keys(context);
    const api = new Function(...keys, names.map(functionSource).join('\n') +
      '\nreturn {openReportEntry,syncSiteSpots,refreshFixedSpotPopups,spotPopupHtml};')(...Object.values(context));
    return {api, context, moves};
  }
  for (const [i, spot] of fixed.entries()) {
    const search = environment(), filter = environment();
    const entry = {kind: 'fixed', spotId: spot.id, lat: spot.lat, lon: spot.lon};
    search.api.openReportEntry(entry, true);
    filter.api.syncSiteSpots(filter.context.siteData.find(site => site.id === spot.siteId), true);
    const fromSearch = search.context.siteSpotLayers[i], fromFilter = filter.context.siteSpotLayers[i];
    assert.equal(fromSearch.content, fromFilter.content, spot.id + ' first-created content');
    assert.equal(fromSearch.opened, true);
    assert.deepEqual(fromSearch.point, [spot.lat, spot.lon]);
    assert.deepEqual(search.moves, [[spot.lat, spot.lon]]);
    assert.match(fromSearch.content, new RegExp('data-location-fixed="' + spot.id + '"'));
    assert.ok(fromSearch.content.includes('https://map.kakao.com/link/to/' + encodeURIComponent('출현 지점') + ',' + spot.lat + ',' + spot.lon));
    assert.ok(fromSearch.content.includes('goalx=' + spot.lon + '&amp;goaly=' + spot.lat));
    const initial = fromSearch.content;
    search.api.refreshFixedSpotPopups();
    assert.equal(fromSearch.content, initial, spot.id + ' refresh preserves routes');
    const hidden = search.api.spotPopupHtml('위치 보호', [], [], true, true,
      {lat: spot.lat, lon: spot.lon, fixedSpotId: spot.id});
    assert.ok(!/spotRouteButtons|data-location-fixed|map\.kakao|tmap:/.test(hidden), 'hidden popup never renders routes');
  }
});

test('승인 제보를 다시 받아 오면 검색 목록도 다시 만든다', () => {
  const load = functionSource('loadApprovedReports');
  assert.match(load, /buildReportSearchIndex\(data\.spots\)/,
    '승인 자료 갱신 때 검색 목록을 다시 만들어야 새 승인 건이 검색된다');
});
