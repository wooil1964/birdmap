// Unit tests for docs/site-data-guard/guard.cjs: the write-recording trap and the comparisons
// that the Chrome harnesses apply against the validated expectation. No browser required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const guard = require('../../docs/site-data-guard/guard.cjs');

const SITES = [{ id: '1', name: '시험 갯벌', country: '대한민국', lat: 37.1, lon: 126.7, markerVar: 'marker_1', kakaoMapUrl: 'https://map.kakao.com/link/map/a,37.1,126.7', tags: ['갯벌'] },
  { id: '2', name: '시험 섬', country: '중국', lat: 36.5, lon: 126.1, markerVar: 'marker_2', tags: [] }];
const SPOTS = [{ id: 'fixed:1:0', siteId: '1', lat: 37.11, lon: 126.71, species: ['도요'] }];
const DATA = { version: 1, initialCount: 1, siteData: SITES, siteSpotData: SPOTS };
const clone = value => JSON.parse(JSON.stringify(value));

// The page's own initialisation, replayed against a plain global object.
function boot() {
  const g = {};
  guard.install(g, guard.NAMES);
  g.siteData = clone(SITES.slice(0, 1));
  g.siteData = g.siteData.concat(clone(SITES.slice(1)));
  g.siteSpotData = clone(SPOTS);
  return g;
}

test('normal initialisation and read-only use leave a clean report that matches validated data', () => {
  const g = boot();
  const site = g.siteData.find(s => s.id === '1');
  assert.equal(site.name, '시험 갯벌');
  assert.equal(g.siteData.filter(s => s.lat > 37).length, 1);
  assert.deepEqual(g.siteData.map(s => s.id), ['1', '2']);
  assert.ok(Array.isArray(g.siteData) && Array.isArray(g.siteData[0].tags));
  assert.equal(JSON.stringify(g.siteData), JSON.stringify(SITES));
  assert.deepEqual([...g.siteSpotData[0].species], ['도요']);
  for (const key in g.siteData[0]) assert.ok(key);
  assert.equal(g.siteData.find(s => s.id === '1'), site, 'proxy identity is stable');
  const result = guard.compare(g.__birdmapSiteDataGuard.report(), DATA);
  assert.deepEqual(result.problems, []);
  assert.equal(result.pass, true);
});

test('every in-place write path and reassignment is recorded and fails the comparison', async () => {
  const tampers = {
    'nested field': g => { g.siteData[0].lat = 38; },
    'Object.assign': g => { Object.assign(g.siteData[1], { lon: 1 }); },
    'push': g => { g.siteData.push({ id: '3' }); },
    'splice': g => { g.siteData.splice(0, 1); },
    'sort': g => { g.siteData.sort((a, b) => b.lat - a.lat); },
    'delete': g => { delete g.siteData[0].markerVar; },
    'defineProperty': g => { Object.defineProperty(g.siteData[0], 'lat', { value: 1 }); },
    'nested array': g => { g.siteSpotData[0].species.push('물떼새'); },
    'spot coordinate': g => { g.siteSpotData[0].lon = 127; },
    'freeze': g => { Object.freeze(g.siteSpotData[0]); },
    'reassignment': g => { g.siteData = g.siteData.filter(s => s.id === '1'); },
    'spot reassignment': g => { g.siteSpotData = []; },
    'delayed write': g => new Promise(resolve => setTimeout(() => { g.siteData[1].name = 'x'; resolve(); }, 5)),
    'async write': async g => { await null; g.siteData[0].tags[0] = 'x'; },
  };
  for (const [name, tamper] of Object.entries(tampers)) {
    const g = boot();
    await tamper(g);
    const result = guard.compare(g.__birdmapSiteDataGuard.report(), DATA);
    assert.equal(result.pass, false, name);
    assert.ok(result.problems.length > 0, name);
  }
});

test('the recorder cannot be removed or redefined past the comparison', () => {
  const g = boot();
  assert.throws(() => Object.defineProperty(g, 'siteData', { value: [{ id: '1', lat: 99 }] }), TypeError);
  assert.throws(() => { delete g.siteSpotData; }, TypeError); // Strict code; sloppy code gets `false`.
  assert.equal(Reflect.deleteProperty(g, 'siteData'), false);
  const report = g.__birdmapSiteDataGuard.report();
  assert.deepEqual(report.intact, { siteData: true, siteSpotData: true });
  assert.equal(guard.compare(report, DATA).pass, true, 'failed redefinitions leave the validated data in place');
  const forged = { ...report, intact: { siteData: false, siteSpotData: true } };
  assert.match(guard.compare(forged, DATA).problems.join(';'), /siteData accessor was replaced/);
});

test('a missing guard or a different assigned value fails closed', () => {
  assert.equal(guard.compare(null, DATA).pass, false);
  const g = {};
  guard.install(g, guard.NAMES);
  g.siteData = clone(SITES.slice(0, 1));
  g.siteData = g.siteData.concat([{ ...clone(SITES[1]), lat: 36.6 }]);
  g.siteSpotData = clone(SPOTS);
  assert.match(guard.compare(g.__birdmapSiteDataGuard.report(), DATA).problems.join(';'), /concatenated siteData differs/);
  const h = {};
  guard.install(h, guard.NAMES);
  h.siteData = clone(SITES);
  h.siteSpotData = clone(SPOTS);
  assert.match(guard.compare(h.__birdmapSiteDataGuard.report(), DATA).problems.join(';'), /assignment sequence/);
});

test('rendered markers and spot layers must sit on validated coordinates', () => {
  const ok = { registry: 2, markers: [[37.1, 126.7], [36.5, 126.1]], spots: [[37.11, 126.71]] };
  assert.equal(guard.compareMap(ok, DATA).pass, true);
  assert.equal(guard.compareMap({ ...ok, spots: [null] }, DATA).pass, true, 'a spot layer not created yet is not a mismatch');
  for (const bad of [{ ...ok, markers: [[37.11, 126.7], [36.5, 126.1]] }, { ...ok, markers: [[37.1, 126.7], null] },
    { ...ok, registry: 3 }, { ...ok, spots: [[37.11, 126.72]] }]) assert.equal(guard.compareMap(bad, DATA).pass, false);
  assert.match(guard.mapProbe(DATA), /"marker_1","marker_2"/);
});

test('directions are judged by validated destination, not by link spelling', () => {
  const site = SITES[0], name = encodeURIComponent(site.name);
  const other = ['https://map.naver.com/v5/search/x', 'https://www.windy.com/37.1/126.7', '#',
    'https://map.kakao.com/link/search/' + encodeURIComponent('어청도 음식점'), 'https://place.map.kakao.com/1'];
  // Allowed: stored kakaoMapUrl, map or route links in any wording, tmap with any label, rounded 6-decimal links.
  assert.deepEqual(guard.siteRouteProblems(site, [site.kakaoMapUrl, 'https://map.kakao.com/link/map/' + name + ',37.1,126.7',
    'https://map.kakao.com/link/to/' + encodeURIComponent('새 문구') + ',37.1000004,126.7', 'tmap://route?goalname=x&goalx=126.7&goaly=37.1', ...other]), []);
  assert.deepEqual(guard.siteRouteProblems(SITES[1], other), [], 'no directions are required abroad');
  // Blocked: moved destination in any link (classed or not), http, unparsed app links, duplicate params; and none.
  for (const href of ['https://map.kakao.com/link/to/x,37.11,126.7', 'tmap://route?goalname=x&goalx=126.7&goaly=37.2',
    'http://map.kakao.com/link/map/x,37.1,126.7', '//map.kakao.com/link/to/x,37.1,126.7',
    'kakaomap://route?ep=37.1,126.7', 'tmap://route?goaly=37.1&goalx=126.7&goaly=38'])
    assert.equal(guard.siteRouteProblems(site, [site.kakaoMapUrl, href]).length, 1, href);
  assert.deepEqual(guard.siteRouteProblems(site, other), ['no directions link']);
  // Reviewed overrides: Yubudo may point at its ferry departure or at its own validated coordinate.
  const yubudo = { id: '19', name: '유부도', country: '대한민국', lat: 36.0011583333, lon: 126.6050305 };
  assert.deepEqual(guard.siteRouteProblems(yubudo, ['https://map.kakao.com/link/map/x,35.97698056,126.60557500',
    'tmap://route?goalname=x&goalx=126.605575&goaly=35.97698056', 'https://map.kakao.com/link/map/y,36.001158,126.605031']), []);
  assert.equal(guard.siteRouteProblems({ ...yubudo, lat: 36.1 }, ['https://map.kakao.com/link/map/y,36.001158,126.605031']).length, 1,
    'a stale island link fails once the validated coordinate moves');
  assert.throws(() => guard.siteRouteProblems({ ...yubudo, name: '다른 이름' }, []), /reviewed site name/);
  const gukhwado = { id: '156', name: '국화도', country: '대한민국', lat: 37.05, lon: 126.55 };
  assert.deepEqual(guard.siteRouteProblems(gukhwado, ['https://map.kakao.com/link/search/' + encodeURIComponent('장고항')]), []);
  assert.equal(guard.siteRouteProblems(gukhwado, ['https://map.kakao.com/link/map/x,37.05,126.55']).length, 1);
  assert.deepEqual(guard.siteRouteProblems(gukhwado, ['https://map.kakao.com/link/search/x']), ['no directions link']);
  // Fixed spots: every coordinate route link must reach the spot; a search alone is not a route.
  assert.deepEqual(guard.spotRouteProblems(SPOTS[0], ['https://map.kakao.com/link/to/a,37.11,126.71', 'tmap://route?goalx=126.71&goaly=37.11', '#']), []);
  assert.deepEqual(guard.spotRouteProblems(SPOTS[0], ['https://map.kakao.com/link/search/x']), ['no route link']);
  assert.equal(guard.spotRouteProblems(SPOTS[0], ['https://map.kakao.com/link/to/a,37.12,126.71']).length, 1);
  assert.deepEqual(guard.spotRouteProblems(SPOTS[0], ['#']), ['no route link']);
});

test('the repository expectation is produced only by the validating exporter', () => {
  const data = guard.expected();
  assert.equal(data.version, 1);
  assert.ok(data.siteData.length > 0 && data.initialCount > 0 && data.initialCount <= data.siteData.length);
  assert.equal(new Set(data.siteData.map(s => s.id)).size, data.siteData.length);
  assert.ok(Object.isFrozen(data));
});
