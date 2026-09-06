import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const names = ['weatherTimeMs', 'weatherLatestDue', 'storedWeatherState', 'weatherScoreAllowed',
  'liveWeatherComponents', 'liveWeatherResponseCurrent', 'v251EffectiveScore'];
const context = vm.createContext({weatherToday: {}, LIVE_WEATHER_CACHE_TTL_MS: 900000,
  LIVE_WEATHER_REQUEST_TIMEOUT_MS: 12000, v251RainInfo: () => ({raining: true, amount: 5})});
for (const name of names) {
  const match = html.match(new RegExp('function ' + name + '\\([^]*?^}', 'm'));
  assert.ok(match, name);
  vm.runInContext(match[0], context);
}
const now = new Date('2026-09-06T08:00:00Z');
const today = {date: '2026-09-06', forecastTime: '2026-09-06 17:00 KST',
  generatedAt: '2026-09-06 14:30 KST', wind: '0m/s', rain: '강수 없음', score: 90};

test('all inline scripts compile', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
});
test('today, component fallback, yesterday, old and no data remain distinct', () => {
  assert.equal(context.storedWeatherState(today, {}, now).kind, 'today_saved');
  assert.equal(context.storedWeatherState({...today, fallbackSource: 'open_meteo'}, {}, now).kind, 'today_fallback');
  for (const date of ['2026-09-05', '2026-08-25']) {
    const state = context.storedWeatherState({...today, date, forecastTime: date + ' 17:00 KST'}, {}, now);
    assert.equal(state.kind, 'previous_saved');
    assert.equal(state.scoreEligible, false);
  }
  assert.equal(context.storedWeatherState(null, {}, now).kind, 'none');
  assert.equal(context.storedWeatherState({...today, dataUnavailable: true}, {}, now).kind, 'none');
});
test('schedule deadline expires prior batch without using arbitrary age', () => {
  const previous = {...today, generatedAt: '2026-09-06 10:30 KST'};
  assert.equal(context.storedWeatherState(previous, {}, new Date('2026-09-06T05:46:00Z')).scoreEligible, true);
  assert.equal(context.storedWeatherState(previous, {}, new Date('2026-09-06T05:47:00Z')).scoreEligible, false);
});
test('fresh root or live current state cannot renew an old stored score', () => {
  const old = {...today, generatedAt: '2026-08-25 18:49 KST', stale: true};
  const state = context.storedWeatherState(old, {generatedAt: today.generatedAt}, now);
  assert.equal(state.scoreEligible, false);
  assert.equal(context.weatherScoreAllowed({...old, _weatherState: {...state, dataCurrent: true}}), false);
  assert.ok(Number.isNaN(context.v251EffectiveScore({...old, _weatherState: state})));
  assert.equal(context.v251EffectiveScore({...today, _weatherState: {scoreEligible: true}}), 35);
  assert.equal(context.weatherScoreAllowed({...today, score: null, _weatherState: {scoreEligible: true}}), false);
});
test('live cache keeps original timestamp and rejects outdated components', () => {
  const live = {ok: true, generatedAt: now.toISOString(), observation: {dataTime: '2026-09-06 16:00 KST'}};
  assert.equal(context.liveWeatherResponseCurrent(live, now.getTime()), true);
  assert.equal(context.liveWeatherResponseCurrent({...live, refreshedAt: '2026-09-06T09:00:00Z'}, now.getTime() + 900000), false);
  assert.equal(context.liveWeatherResponseCurrent({...live, observation: {dataTime: '2026-08-25 16:00 KST'}}, now.getTime()), false);
});
