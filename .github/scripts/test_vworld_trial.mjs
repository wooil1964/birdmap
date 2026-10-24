import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
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
    ['TRIAL_STARTS_AT', 0], ['TRIAL_EXPIRES_AT', '2026-10-22T17:10:00.000+09:00'],
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
  for (const expected of [undefined, '', 'x'.repeat(42), '!'.repeat(43)]) {
    const f = fixture(); f.env.TRIAL_ACCESS_TOKEN = expected; await closed(f, 403);
  }
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

// A controlled wall clock and suspended native bindings exercise the complete
// trial -> relay path. Record when fetch actually starts, not just the response.
function timedFixture(t) {
  let now = Date.parse(START);
  t.mock.method(Date, 'now', () => { if (now instanceof Error) throw now; return now; });
  const f = fixture(), fetchTimes = [];
  for (const [name, label] of [['CLIENT_TILE_LIMITER', 'client'], ['GLOBAL_TILE_LIMITER', 'location']]) {
    f.env[name].limit = async () => { f.limits.push(label); return { success: true }; };
  }
  const fetch = async () => {
    fetchTimes.push(Date.now());
    return new Response(trialPng(), { headers: { 'Content-Type': 'image/png' } });
  };
  return { ...f, fetchTimes, setNow(value) { now = value; },
    run: (extra = {}) => handleTrialRequest(f.request(), f.env, { fetch, ...extra }) };
}
function trialPng() {
  const crc = bytes => { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; };
  const chunk = (tag, bytes) => { const type = Buffer.from(tag), size = Buffer.alloc(4), sum = Buffer.alloc(4); size.writeUInt32BE(bytes.length); sum.writeUInt32BE(crc(Buffer.concat([type, bytes]))); return Buffer.concat([size, type, bytes, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(256); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + 256 * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('fetch starts exactly once at inclusive start and one millisecond before exclusive end', async t => {
  const f = timedFixture(t);
  for (const now of [Date.parse(START), Date.parse(END) - 1]) {
    f.setNow(now);
    const before = f.fetchTimes.length;
    const response = await f.run();
    assert.equal(response.status, 200);
    assert.equal(f.fetchTimes.length, before + 1);
    assert.equal(f.fetchTimes.at(-1), now);
    assert.ok(f.fetchTimes.at(-1) >= Date.parse(START) && f.fetchTimes.at(-1) < Date.parse(END));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), trialPng());
  }
});

for (const name of ['CLIENT_TILE_LIMITER', 'GLOBAL_TILE_LIMITER']) {
  for (const afterWait of [Date.parse(END), Date.parse(END) + 1, Date.parse(START) - 1, NaN, Infinity, new Error('synthetic_clock_failure')]) {
    test(`clock is rechecked after ${name} wait: ${String(afterWait)}`, async t => {
      const f = timedFixture(t), entered = deferred(), release = deferred();
      f.setNow(Date.parse(END) - 1);
      f.env[name].limit = async () => {
        f.limits.push(name === 'CLIENT_TILE_LIMITER' ? 'client' : 'location');
        entered.resolve();
        await release.promise;
        return { success: true };
      };
      const pending = f.run();
      await entered.promise;
      assert.deepEqual(f.fetchTimes, []);
      f.setNow(afterWait); release.resolve();
      const response = await pending;
      assert.equal(response.status, 503);
      assert.equal(await response.text(), 'tiles_unavailable');
      assert.deepEqual(f.limits, ['client', 'location']);
      assert.deepEqual(f.fetchTimes, []);
    });
  }
}

test('both asynchronous checks can advance time within the window and fetch starts at the final clock', async t => {
  const f = timedFixture(t);
  f.env.CLIENT_TILE_LIMITER.limit = async () => { f.limits.push('client'); await Promise.resolve(); f.setNow(Date.parse(START) + 1); return { success: true }; };
  f.env.GLOBAL_TILE_LIMITER.limit = async () => { f.limits.push('location'); await Promise.resolve(); f.setNow(Date.parse(END) - 1); return { success: true }; };
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(f.limits, ['client', 'location']);
  assert.deepEqual(f.fetchTimes, [Date.parse(END) - 1]);
});

test('each limiter denial, exception, missing or malformed result makes zero fetch attempts', async t => {
  const f = timedFixture(t);
  for (const name of ['CLIENT_TILE_LIMITER', 'GLOBAL_TILE_LIMITER']) {
    const original = f.env[name];
    for (const result of [false, undefined, null, 'throw', 'missing']) {
      f.env[name] = result === 'missing' ? undefined : { async limit() {
        await Promise.resolve();
        if (result === 'throw') throw Error('synthetic');
        return result === false ? { success: false } : result;
      } };
      assert.equal((await f.run()).status, result === false ? 429 : 503);
      assert.deepEqual(f.fetchTimes, []);
    }
    for (const result of [{}, { success: 1 }, { success: 'true' }, { success: {} }]) {
      f.env[name] = { async limit() { await Promise.resolve(); return result; } };
      assert.equal((await f.run()).status, 429);
      assert.deepEqual(f.fetchTimes, []);
    }
    f.env[name] = original;
  }
});

test('trial timeout aborts pending headers and body without a retry or a later fetch', async t => {
  const f = timedFixture(t);
  for (const stalledBody of [false, true]) {
    const times = []; let signal, cancelled = false;
    const response = await f.run({ timeoutMs: 10, fetch: async (_, options) => {
      times.push(Date.now()); signal = options.signal;
      if (!stalledBody) return new Promise(() => {});
      return new Response(new ReadableStream({ start(c) { c.enqueue(trialPng().subarray(0, 24)); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'image/png' } });
    } });
    assert.equal(response.status, 502);
    assert.equal(await response.text(), 'tiles_unavailable');
    assert.equal(signal.aborted, true);
    assert.deepEqual(times, [Date.parse(START)]);
    if (stalledBody) assert.equal(cancelled, true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(times, [Date.parse(START)]);
  }
});
