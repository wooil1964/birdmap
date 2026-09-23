import assert from 'node:assert/strict';
import test from 'node:test';
import {requestKmaWeather, validateKmaItems, handleRequest, hasCompleteTomorrow} from '../src/index.js';
import {SITES} from '../src/sites.js';

const now = new Date('2026-09-06T08:00:00Z');
const payload = items => ({response: {header: {resultCode: '00'}, body: {items: {item: items}}}});
function mockFetch(failures) {
  return async input => {
    const url = new URL(input), method = url.pathname.split('/').pop();
    if (failures.includes(method)) throw new Error('synthetic transport failure');
    const p = url.searchParams;
    const base = {baseDate: p.get('base_date'), baseTime: p.get('base_time'), nx: p.get('nx'), ny: p.get('ny')};
    const items = method === 'getUltraSrtNcst' ? [{...base, category: 'T1H', obsrValue: '25'}] :
      // 실제 KMA 처럼 1630 발표분을 baseTime 1600 으로 표기하고 첫 예보는 1700 이다.
      method === 'getUltraSrtFcst' ? [{...base, baseTime: base.baseTime.slice(0, 2) + '00', category: 'T1H', fcstValue: '26', fcstDate: '20260906', fcstTime: '1700'}] :
      ['0900', '1500'].map(fcstTime => ({...base, category: 'TMP', fcstValue: '25', fcstDate: '20260907', fcstTime}));
    return new Response(JSON.stringify(payload(items)));
  };
}
for (const failed of ['getUltraSrtFcst', 'getUltraSrtNcst', 'getVilageFcst']) {
  test('retains usable current data when ' + failed + ' fails', async t => {
    t.mock.method(globalThis, 'fetch', mockFetch([failed]));
    const result = await requestKmaWeather('188', SITES['188'], {KMA_SERVICE_KEY: 'synthetic'}, now);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'partial');
    assert.ok(result.observation.temperature === 25 || result.forecast.temperature === 26);
    assert.equal(result.fallbackSource, failed === 'getUltraSrtNcst' ? 'kma_forecast' : null);
    assert.ok(!JSON.stringify(result).includes('synthetic'));
    if (failed !== 'getVilageFcst') assert.equal(result.tomorrow.morning.forecastTime, '2026-09-07 09:00 KST');
  });
}
test('does not claim current success when both current requests fail', async t => {
  t.mock.method(globalThis, 'fetch', mockFetch(['getUltraSrtFcst', 'getUltraSrtNcst']));
  await assert.rejects(requestKmaWeather('188', SITES['188'], {KMA_SERVICE_KEY: 'synthetic'}, now));
});
test('rejects wrong response grid/date and empty payload', () => {
  const base = {date: '20260906', time: '1600'}, grid = {nx: 60, ny: 127};
  for (const item of [{baseDate: '20260825', baseTime: '1600'}, {baseDate: base.date, baseTime: base.time, nx: 61}]) {
    assert.throws(() => validateKmaItems(payload([item]), base, grid), {code: 'KMA_IDENTITY_MISMATCH'});
  }
  assert.throws(() => validateKmaItems(payload([]), base, grid), {code: 'KMA_EMPTY_DATA'});
});
const fcstItem = (baseDate, baseTime, fcstDate, fcstTime, extra = {}) =>
  ({baseDate, baseTime, nx: 43, ny: 95, category: 'T1H', fcstValue: '20', fcstDate, fcstTime, ...extra});
test('ultra-short forecast accepts the HH00 label only for the latest HH30 issuance', () => {
  const grid = {nx: 43, ny: 95};
  const accepted = [
    [{date: '20260923', time: '2130'}, fcstItem('20260923', '2100', '20260923', '2200')],
    [{date: '20260923', time: '2230'}, fcstItem('20260923', '2200', '20260923', '2300')],
    [{date: '20260923', time: '2330'}, fcstItem('20260923', '2300', '20260924', '0000')],
    [{date: '20260923', time: '2130'}, fcstItem('20260923', '2130', '20260923', '2200')],
  ];
  for (const [base, item] of accepted) {
    // 뒤 시각 item 을 앞에 두어도 가장 이른 예보시각으로 판단하는지 본다.
    const later = {...item, fcstDate: '20260930'};
    assert.equal(validateKmaItems(payload([later, item]), base, grid, 'getUltraSrtFcst').length, 2);
  }
  const base = {date: '20260923', time: '2130'};
  const rejected = [
    fcstItem('20260923', '2030', '20260923', '2200'),
    fcstItem('20260923', '2000', '20260923', '2200'),
    fcstItem('20260923', '2100', '20260923', '2100'),
    fcstItem('20260922', '2100', '20260923', '2200'),
    fcstItem('20260923', '2100', '20260923', '2200', {nx: 44}),
    fcstItem('20260923', '2100', '20260923', '2200', {ny: 96}),
  ];
  for (const item of rejected) {
    assert.throws(() => validateKmaItems(payload([item]), base, grid, 'getUltraSrtFcst'), {code: 'KMA_IDENTITY_MISMATCH'});
  }
  // 한 item 이라도 어긋나면 전체를 거부한다.
  assert.throws(() => validateKmaItems(payload([fcstItem('20260923', '2100', '20260923', '2200'),
    fcstItem('20260923', '2030', '20260923', '2300')]), base, grid, 'getUltraSrtFcst'), {code: 'KMA_IDENTITY_MISMATCH'});
});
test('observation and village forecast keep exact base time matching', () => {
  const grid = {nx: 43, ny: 95};
  const ncst = {date: '20260923', time: '2100'};
  assert.equal(validateKmaItems(payload([{baseDate: '20260923', baseTime: '2100', nx: 43, ny: 95}]), ncst, grid, 'getUltraSrtNcst').length, 1);
  assert.throws(() => validateKmaItems(payload([{baseDate: '20260923', baseTime: '2000', nx: 43, ny: 95}]), ncst, grid, 'getUltraSrtNcst'), {code: 'KMA_IDENTITY_MISMATCH'});
  const village = {date: '20260923', time: '2000'};
  assert.equal(validateKmaItems(payload([{baseDate: '20260923', baseTime: '2000', nx: 43, ny: 95}]), village, grid, 'getVilageFcst').length, 1);
  assert.throws(() => validateKmaItems(payload([{baseDate: '20260923', baseTime: '1700', nx: 43, ny: 95}]), village, grid, 'getVilageFcst'), {code: 'KMA_IDENTITY_MISMATCH'});
  // HH30 예외는 초단기예보 전용이다.
  const half = {date: '20260923', time: '2130'};
  for (const api of ['getUltraSrtNcst', 'getVilageFcst', undefined]) {
    assert.throws(() => validateKmaItems(payload([{baseDate: '20260923', baseTime: '2100', nx: 43, ny: 95}]), half, grid, api), {code: 'KMA_IDENTITY_MISMATCH'});
  }
});
test('188 lookup succeeds; Dokdo remains marine primary; complete tomorrow requires usable values', async () => {
  const request = id => handleRequest(new Request('https://worker.example/weather?siteId=' + id), {});
  assert.equal((await request(188)).status, 503);
  assert.equal((await request(52)).status, 422);
  assert.equal(hasCompleteTomorrow({tomorrow: {morning: {forecastTime: '2026-09-07 09:00 KST', temperature: 0}, afternoon: {forecastTime: '2026-09-07 15:00 KST', temperature: 25}}}), true);
});

test('Worker cache preserves generation time and cannot renew expired entries', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('offline'); });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let generatedAt = new Date(Date.now() - 60000).toISOString();
  Object.defineProperty(globalThis, 'caches', {configurable: true, value: {default: {
    match: async () => new Response(JSON.stringify({ok: true, status: 'ok', siteId: '188', generatedAt,
      observation: {temperature: 25}, tomorrow: {morning: {forecastTime: '2026-09-07 09:00 KST', temperature: 0}, afternoon: {forecastTime: '2026-09-07 15:00 KST', temperature: 25}}})),
    put: async () => {},
  }}});
  t.after(() => original ? Object.defineProperty(globalThis, 'caches', original) : delete globalThis.caches);
  const request = () => handleRequest(new Request('https://worker.example/weather?siteId=188'), {KMA_SERVICE_KEY: 'synthetic'});
  const cached = await (await request()).json();
  assert.equal(cached.cached, true);
  assert.equal(cached.generatedAt, generatedAt);
  assert.equal(calls, 0);
  generatedAt = new Date(Date.now() - 900001).toISOString();
  assert.notEqual((await request()).status, 200);
  assert.equal(calls, 3);
});
