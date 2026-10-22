import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleTrialRequest } from '../../vworld-tiles/src/trial-worker.mjs';

const START = '2026-10-22T08:00:00.000Z';
const END = '2026-10-22T08:10:00.000Z';
const TOKEN = 'SYNTHETIC_TRIAL_TOKEN_ONLY_'.padEnd(43, 'x');
function fixture() {
  const calls = [], limits = [];
  const env = { TILES_ENABLED: 'true', TRIAL_STARTS_AT: START, TRIAL_EXPIRES_AT: END,
    TRIAL_ACCESS_TOKEN: TOKEN, VWORLD_API_KEY: 'SYNTHETIC_WORKER_CREDENTIAL_ONLY',
    CLIENT_TILE_LIMITER: { async limit() { limits.push('client'); return { success: false }; } },
    GLOBAL_TILE_LIMITER: { async limit() { limits.push('location'); return { success: true }; } } };
  const request = (token = TOKEN) => new Request('https://trial.invalid/tiles/8/218/100.png', {
    headers: { Origin: 'https://wooil1964.github.io', 'CF-Connecting-IP': '203.0.113.7',
      ...(token === null ? {} : { 'X-Birdmap-Trial-Token': token }) }
  });
  const run = (req = request(), nowMs = Date.parse(START)) => handleTrialRequest(req, env, {
    nowMs, fetch: async (...args) => { calls.push(args); throw Error('must_not_fetch'); }
  });
  return { env, calls, limits, request, run };
}
async function closed(f, status, request, now) {
  const r = await f.run(request, now);
  assert.equal(r.status, status);
  assert.equal(f.calls.length, 0);
  assert.equal(f.limits.length, 0);
  for (const key of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) assert.equal(r.headers.get(key), 'no-store');
  assert.ok(!(await r.text()).includes(TOKEN));
}

test('trial disabled rejects before native limits or upstream even with a valid token/window', async () => {
  const f = fixture(); f.env.TILES_ENABLED = 'false'; await closed(f, 503);
});
test('trial missing, noncanonical, invalid or excessive window fails closed', async () => {
  for (const [name, value] of [['TRIAL_STARTS_AT', ''], ['TRIAL_EXPIRES_AT', ''],
    ['TRIAL_STARTS_AT', '2026-10-22T08:00:00Z'], ['TRIAL_EXPIRES_AT', '2026-02-30T08:10:00.000Z'],
    ['TRIAL_EXPIRES_AT', START], ['TRIAL_EXPIRES_AT', '2026-10-22T07:59:59.999Z'],
    ['TRIAL_EXPIRES_AT', '2026-10-22T08:10:00.001Z']]) {
    const f = fixture(); f.env[name] = value; await closed(f, 503);
  }
});
test('trial cannot run before its start, at expiry, after expiry or with invalid time', async () => {
  for (const now of [Date.parse(START) - 1, Date.parse(END), Date.parse(END) + 1, NaN]) {
    const f = fixture(); await closed(f, 503, undefined, now);
  }
});
test('missing, malformed or incorrect trial token never consumes native limits or upstream', async () => {
  for (const token of [null, '', 'short', 'x'.repeat(43), 'x'.repeat(44), 'x'.repeat(42) + '!']) {
    const f = fixture(); await closed(f, 403, f.request(token));
  }
  const f = fixture(); delete f.env.TRIAL_ACCESS_TOKEN; await closed(f, 403);
});
test('valid trial still obeys the unchanged relay source and rate-limit checks', async () => {
  for (const now of [Date.parse(START), Date.parse(END) - 1]) {
    const f = fixture(); const r = await f.run(undefined, now);
    assert.equal(r.status, 429); assert.deepEqual(f.limits, ['client']); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); const request = new Request(f.request(), { headers: { Origin: 'https://example.com', 'X-Birdmap-Trial-Token': TOKEN } });
  await closed(f, 403, request);
});
test('authorized trial forwards once through the unchanged fixed relay without the trial header', async () => {
  const f = fixture(); f.env.CLIENT_TILE_LIMITER.limit = async () => { f.limits.push('client'); return { success: true }; };
  const r = await f.run();
  assert.equal(r.status, 502); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.limits, ['client', 'location']);
  assert.equal(f.calls[0][1].headers.Accept, 'image/png');
  assert.ok(!JSON.stringify(f.calls).includes(TOKEN));
});
test('trial config defaults closed, retains dedicated identity and has no data/service bindings', () => {
  const config = readFileSync(new URL('../../vworld-tiles/wrangler.trial.toml', import.meta.url), 'utf8');
  assert.match(config, /name = "birdmap-vworld-tiles"/);
  assert.match(config, /main = "src\/trial-worker.mjs"/);
  assert.match(config, /TILES_ENABLED = "false"/);
  assert.match(config, /TRIAL_STARTS_AT = ""/); assert.match(config, /TRIAL_EXPIRES_AT = ""/);
  assert.match(config, /required = \["VWORLD_API_KEY", "TRIAL_ACCESS_TOKEN"\]/);
  assert.match(config, /preview_urls = false/); assert.match(config, /enabled = false/);
  assert.doesNotMatch(config, /\[\[?(d1_databases|services|kv_namespaces|r2_buckets|durable_objects|migrations|routes|triggers)\b/);
});
