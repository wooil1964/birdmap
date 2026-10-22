import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { bootstrapTrial, runTrial, recoverTrial } from '../../vworld-tiles/trial/core.mjs';
import { CloudflareAdapter, assertBindings, childEnvironment, trialConfig, validPng, verifyScope } from '../../vworld-tiles/trial/cloudflare.mjs';

// All credentials, responses, time and effects below are synthetic. No fixture
// invokes Wrangler, a real fetch, or a connected account.
const SHA = 'a'.repeat(40), RUN = '1234567890';
const KEY = 'SYNTHETIC_VWORLD_KEY_NO_NETWORK';
const NOW = Date.parse('2026-10-22T08:00:00.000Z');
const TOKEN = Buffer.alloc(32, 17).toString('base64url');
const options = extra => ({ sha: SHA, runId: RUN, vworldKey: KEY, now: () => NOW,
  randomBytesFn: () => Buffer.alloc(32, 17), ...extra });

function fake({ failAt = -1 } = {}) {
  const events = [], reports = [];
  let inFlight = 0, maximumInFlight = 0;
  const invoke = async (name, args) => {
    const index = events.length;
    events.push({ name, args });
    if (index === failAt) throw Error('SYNTHETIC_OPERATION_FAILED');
    if (name === 'probe' && args.status === 200) {
      inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight);
      try { await new Promise(resolve => setImmediate(resolve)); } finally { inFlight--; }
    }
  };
  const adapter = Object.fromEntries(['preflight', 'audit', 'assertAbsent', 'markMutation', 'deploy',
    'verify', 'probe', 'putSecret', 'switchToEdit', 'beginRecovery'].map(name => [name, args => invoke(name, args)]));
  adapter.report = event => reports.push(event);
  return { adapter, events, reports, get maximumInFlight() { return maximumInFlight; } };
}
const named = (f, name) => f.events.filter(event => event.name === name);
const writes = f => f.events.filter(event => ['deploy', 'putSecret'].includes(event.name));
const tiles = f => named(f, 'probe').filter(event => event.args.status === 200);
function restored(f) {
  assert.deepEqual(f.events.slice(-4).map(event => event.name), ['beginRecovery', 'deploy', 'verify', 'probe']);
  assert.deepEqual(f.events.at(-3).args, { enabled: false, bootstrap: true, phase: 'closed', create: false });
  assert.equal(f.events.at(-2).args.enabled, false);
  assert.deepEqual(f.events.at(-1).args, { x: 218, status: 503 });
  assert.equal(f.reports.at(-1), 'restored-503');
}

test('bootstrap only creates the isolated target disabled, without secrets, after audit and absence checks', async () => {
  const f = fake();
  assert.deepEqual(await bootstrapTrial(f.adapter, options()), { restored: true });
  assert.deepEqual(f.events.map(event => event.name), ['preflight', 'audit', 'assertAbsent', 'markMutation', 'deploy', 'verify', 'probe']);
  assert.deepEqual(f.events[0].args, { sha: SHA, runId: RUN, mode: 'bootstrap' });
  assert.deepEqual(f.events[1].args, { allowTarget: false });
  assert.deepEqual(f.events[4].args, { enabled: false, bootstrap: true, phase: 'bootstrap', create: true });
  assert.deepEqual(f.events[5].args.secretNames, []);
  assert.equal(named(f, 'putSecret').length, 0); assert.equal(tiles(f).length, 0);
});

test('run consumes an approved disabled bootstrap, supplies secrets while false, then restores false and real endpoint 503', async () => {
  const f = fake(); let randomCalls = 0; const entropy = Buffer.alloc(32, 17);
  const result = await runTrial(f.adapter, options({ randomBytesFn: size => {
    randomCalls++; assert.equal(size, 32); return entropy;
  } }));
  assert.deepEqual(result, { attemptedTiles: 4, restored: true });
  assert.deepEqual(f.events[0].args, { sha: SHA, runId: RUN, mode: 'run' });
  assert.equal(randomCalls, 1); assert.deepEqual(entropy, Buffer.alloc(32));
  const deployment = named(f, 'deploy');
  assert.deepEqual(deployment.map(event => event.args.enabled), [false, false, true, false]);
  assert.ok(deployment.every(event => event.args.create === false));
  assert.equal(deployment[0].args.phase, 'consumed');
  const secrets = named(f, 'putSecret');
  assert.deepEqual(secrets.map(event => event.args.name), ['VWORLD_API_KEY', 'TRIAL_ACCESS_TOKEN']);
  assert.equal(secrets[0].args.value, KEY); assert.equal(secrets[1].args.value, TOKEN);
  assert.equal(Buffer.from(secrets[1].args.value, 'base64url').length, 32);
  for (const secret of secrets) {
    const at = f.events.indexOf(secret);
    assert.equal(f.events[at - 1].name, 'verify'); assert.equal(f.events[at - 1].args.enabled, false);
    assert.equal(f.events[at + 1].name, 'verify'); assert.equal(f.events[at + 1].args.enabled, false);
    assert.equal(f.events[at + 2].name, 'probe'); assert.equal(f.events[at + 2].args.status, 503);
  }
  const activation = f.events.indexOf(deployment[2]);
  assert.deepEqual(f.events[activation - 1], { name: 'audit', args: { allowTarget: true } });
  assert.equal(deployment[2].args.start, new Date(NOW).toISOString());
  assert.equal(deployment[2].args.end, new Date(NOW + 600000).toISOString());
  assert.deepEqual(tiles(f).map(event => event.args.x), [218, 219, 220, 221]);
  assert.ok(tiles(f).every(event => event.args.token === TOKEN));
  assert.equal(f.maximumInFlight, 1);
  const negative = named(f, 'probe').filter(event => event.args.status === 403);
  assert.deepEqual(negative.map(event => event.args), [{ x: 218, status: 403 }]);
  assert.ok(f.events.indexOf(negative[0]) < f.events.indexOf(tiles(f)[0]));
  assert.ok(!JSON.stringify(f.reports).includes(KEY)); assert.ok(!JSON.stringify(f.reports).includes(TOKEN));
  restored(f);
});

// Fail each external boundary once, including a deploy that may have completed
// remotely before its response was lost. This proves recovery does not rely on
// success of the preceding operation, and that failed tile reads are not retried.
const happyRun = fake(); await runTrial(happyRun.adapter, options());
const happyBootstrap = fake(); await bootstrapTrial(happyBootstrap.adapter, options());
for (const [mode, trace, execute] of [
  ['run', happyRun, f => runTrial(f.adapter, options())],
  ['bootstrap', happyBootstrap, f => bootstrapTrial(f.adapter, options())]
]) {
  const stop = trace.events.findIndex(event => event.name === 'beginRecovery');
  const limit = stop < 0 ? trace.events.length : stop;
  const mutation = trace.events.findIndex(event => ['deploy', 'putSecret'].includes(event.name));
  for (let index = 0; index < limit; index++) {
    const boundary = trace.events[index];
    test(`${mode} boundary ${index + 1} ${boundary.name} fails closed with no retry`, async () => {
      const f = fake({ failAt: index });
      await assert.rejects(execute(f));
      if (index >= mutation) restored(f);
      else assert.equal(writes(f).length, 0);
      const failedTile = boundary.name === 'probe' && boundary.args.status === 200;
      const expected = trace.events.slice(0, index + 1).filter(event => event.name === 'probe' && event.args.status === 200).length;
      assert.equal(tiles(f).length, expected);
      if (failedTile) assert.equal(tiles(f).at(-1).args.x, boundary.args.x);
      assert.equal(named(f, 'putSecret').filter(event => event.args.name === 'TRIAL_ACCESS_TOKEN').length <= 1, true);
    });
  }
}

for (const [label, clock, expectedTiles] of [
  ['invalid initial time', () => NaN, 0],
  ['clock before start', (() => { let n = 0; return () => n++ ? NOW - 1 : NOW; })(), 0],
  ['expiry before second tile', (() => { let n = 0; return () => n++ < 2 ? NOW : NOW + 600000; })(), 1]
]) test(`${label} prevents further authorized tile attempts and restores`, async () => {
  const f = fake(); await assert.rejects(runTrial(f.adapter, options({ now: clock })));
  assert.equal(tiles(f).length, expectedTiles); restored(f);
});

for (const entropy of [Buffer.alloc(31), Buffer.alloc(33), 'not-random-bytes', null]) {
  test(`invalid entropy ${entropy === null ? 'null' : typeof entropy === 'string' ? 'string' : entropy.length} prevents any write`, async () => {
    const f = fake(); await assert.rejects(runTrial(f.adapter, options({ randomBytesFn: () => entropy })), /TRIAL_RANDOM_INVALID/);
    assert.equal(writes(f).length, 0); assert.equal(tiles(f).length, 0);
  });
}

test('every entry point rejects invalid SHA/run identity before adapter access', async () => {
  for (const execute of [bootstrapTrial, runTrial, recoverTrial]) for (const identity of [
    { sha: 'a'.repeat(39) }, { sha: 'refs/heads/main' }, { sha: 'A'.repeat(40) }, { runId: '0' }, { runId: '../123' }
  ]) {
    const f = fake(); await assert.rejects(execute(f.adapter, options(identity)), /TRIAL_IDENTITY_INVALID/);
    assert.equal(f.events.length, 0);
  }
});

test('recovery independently validates exact identity and only deploys false without trial/audit/secret prerequisites', async () => {
  const f = fake(); assert.deepEqual(await recoverTrial(f.adapter, options()), { restored: true });
  assert.deepEqual(f.events[0].args, { sha: SHA, runId: RUN, mode: 'recover' });
  restored(f); assert.equal(tiles(f).length, 0); assert.equal(named(f, 'putSecret').length, 0); assert.equal(named(f, 'audit').length, 0);
});
for (let index = 0; index < 5; index++) test(`independent recovery failure at boundary ${index + 1} never reports restoration`, async () => {
  const f = fake({ failAt: index }); await assert.rejects(recoverTrial(f.adapter, options()));
  assert.ok(!f.reports.includes('restored-503')); assert.equal(tiles(f).length, 0);
});
test('failed final recovery overrides an otherwise successful trial result', async () => {
  const index = happyRun.events.findIndex(event => event.name === 'beginRecovery') + 3;
  const f = fake({ failAt: index }); await assert.rejects(runTrial(f.adapter, options()));
  assert.equal(tiles(f).length, 4); assert.ok(!f.reports.includes('restored-503'));
});

function bindingFixture(enabled = false) {
  return [
    { type: 'plain_text', name: 'TILES_ENABLED', text: String(enabled) },
    { type: 'plain_text', name: 'TRIAL_STARTS_AT', text: '' }, { type: 'plain_text', name: 'TRIAL_EXPIRES_AT', text: '' },
    { type: 'ratelimit', name: 'CLIENT_TILE_LIMITER', namespace_id: '196440', simple: { limit: 20, period: 60 } },
    { type: 'ratelimit', name: 'GLOBAL_TILE_LIMITER', namespace_id: '196441', simple: { limit: 40, period: 60 } }
  ];
}
test('bootstrap config removes required secret names while preserving false, disabled preview/logging and dedicated namespaces', () => {
  const config = trialConfig(true);
  assert.match(config, /required = \[\]/); assert.match(config, /TILES_ENABLED = "false"/);
  assert.match(config, /preview_urls = false/); assert.match(config, /\[observability\]\s+enabled = false/);
  assert.match(config, /namespace_id = "196440"/); assert.match(config, /namespace_id = "196441"/);
  assert.doesNotMatch(config, /\[\[(d1_databases|services|kv_namespaces|r2_buckets)\]\]/);
});
test('remote binding verification rejects live vars, missing/extra bindings, wrong namespaces and unexpected secrets', () => {
  assert.doesNotThrow(() => assertBindings(bindingFixture(), { enabled: false, secretNames: [] }));
  for (const mutate of [
    b => { b[0].text = 'true'; }, b => b.pop(), b => { b[3].namespace_id = '1'; },
    b => b.push({ type: 'd1', name: 'DB', id: 'SYNTHETIC' }),
    b => b.push({ type: 'service', name: 'SERVICE', service: 'SYNTHETIC' }),
    b => b.push({ type: 'secret_text', name: 'VWORLD_API_KEY' }), b => b.push({ ...b[0] })
  ]) {
    const bindings = bindingFixture(); mutate(bindings);
    assert.throws(() => assertBindings(bindings, { enabled: false, secretNames: [] }));
  }
});
test('Wrangler child environment allowlist excludes VWorld/trial secrets, debug flags and proxy capture', () => {
  const source = { PATH: 'synthetic-path', SystemRoot: 'synthetic-system', TEMP: 'synthetic-temp',
    VWORLD_API_KEY: KEY, TRIAL_ACCESS_TOKEN: TOKEN, DEBUG: '*', NODE_DEBUG: 'http', NODE_OPTIONS: '--inspect',
    HTTPS_PROXY: 'https://capture.invalid', ACTIONS_STEP_DEBUG: 'true', CF_CREATE_TOKEN: 'OTHER_SYNTHETIC_TOKEN' };
  const env = childEnvironment(source, 'synthetic-account', 'synthetic-selected-cf-token', 'synthetic-home');
  for (const name of ['VWORLD_API_KEY', 'TRIAL_ACCESS_TOKEN', 'DEBUG', 'NODE_DEBUG', 'NODE_OPTIONS', 'HTTPS_PROXY', 'ACTIONS_STEP_DEBUG', 'CF_CREATE_TOKEN']) assert.ok(!Object.hasOwn(env, name));
  assert.equal(env.CLOUDFLARE_API_TOKEN, 'synthetic-selected-cf-token'); assert.equal(env.WRANGLER_WRITE_LOGS, 'false');
  assert.equal(env.WRANGLER_SEND_METRICS, 'false'); assert.ok(!JSON.stringify(env).includes(KEY)); assert.ok(!JSON.stringify(env).includes(TOKEN));
});
function scopeFixture() {
  const env = { APPROVED_SHA: SHA, CF_SCOPE_REVIEWED_SHA: SHA, CF_READ_SCOPE: 'workers-product-content-read-only',
    CF_CREATE_SCOPE: 'workers-product-admin', CF_EDIT_SCOPE: 'individual-worker-editor', CF_EDIT_WORKER: 'birdmap-vworld-tiles',
    CF_READ_TOKEN: 'SYNTHETIC_READ_TOKEN_ONLY_111', CF_CREATE_TOKEN: 'SYNTHETIC_CREATE_TOKEN_ONLY_222', CF_EDIT_TOKEN: 'SYNTHETIC_EDIT_TOKEN_ONLY_333' };
  for (const name of ['CF_READ_TOKEN', 'CF_CREATE_TOKEN', 'CF_EDIT_TOKEN']) env[name + '_SHA256'] = createHash('sha256').update(env[name]).digest('hex');
  return env;
}
test('scope gate binds reviewed token fingerprints and per-worker editing to the exact SHA', () => {
  assert.doesNotThrow(() => verifyScope(scopeFixture(), 'bootstrap')); assert.doesNotThrow(() => verifyScope(scopeFixture(), 'run'));
  for (const change of [{ CF_SCOPE_REVIEWED_SHA: 'b'.repeat(40) }, { CF_EDIT_WORKER: 'different-worker' },
    { CF_EDIT_SCOPE: 'workers-product-admin' }, { CF_EDIT_TOKEN_SHA256: '0'.repeat(64) }, { CF_READ_SCOPE: 'admin' }]) {
    assert.throws(() => verifyScope({ ...scopeFixture(), ...change }, 'run'));
  }
});

function crc32(bytes) { let c = 0xffffffff; for (const value of bytes) { c ^= value; for (let n = 0; n < 8; n++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function pngFixture() {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), out.length - 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + 256 * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store' };
test('PNG validation rejects corruption, truncation, nonimages and trailing data', () => {
  const valid = pngFixture(); assert.equal(validPng(valid), true);
  const corrupt = Buffer.from(valid); corrupt[45] ^= 1;
  for (const bytes of [corrupt, valid.subarray(0, -1), Buffer.from('<error>synthetic</error>'), Buffer.concat([valid, Buffer.from('extra')])]) assert.equal(validPng(bytes), false);
});
test('synthetic transport probes send the one token only as a header, with no redirects/retries/logs', async () => {
  const calls = [];
  const adapter = new CloudflareAdapter({ TRIAL_HOST: 'https://birdmap-vworld-tiles.synthetic.workers.dev' }, {
    fetchFn: async (url, init) => { calls.push({ url, init }); return new Response(pngFixture(), { status: 200, headers }); }
  });
  await adapter.probe({ x: 218, token: TOKEN, status: 200 });
  assert.equal(calls.length, 1); assert.ok(!calls[0].url.includes(TOKEN)); assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].init.headers['X-Birdmap-Trial-Token'], TOKEN); assert.equal(calls[0].init.redirect, 'manual'); assert.equal(calls[0].init.cache, 'no-store');
});
for (const [label, response] of [
  ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://capture.invalid' } })],
  ['upstream error', () => new Response('synthetic error', { status: 502, headers })],
  ['nonimage', () => new Response('<error/>', { status: 200, headers })],
  ['arbitrary response header', () => new Response(pngFixture(), { status: 200, headers: { ...headers, 'X-Synthetic-Secret': 'forbidden' } })],
  ['cacheable response', () => new Response(pngFixture(), { status: 200, headers: { ...headers, 'Cache-Control': 'max-age=60' } })]
]) test(`synthetic ${label} stops a probe after exactly one fetch`, async () => {
  let calls = 0; const adapter = new CloudflareAdapter({ TRIAL_HOST: 'https://birdmap-vworld-tiles.synthetic.workers.dev' }, { fetchFn: async () => { calls++; return response(); } });
  await assert.rejects(adapter.probe({ x: 218, token: TOKEN, status: 200 })); assert.equal(calls, 1);
});
test('active version lookup rejects split traffic and malformed deployment envelopes', async () => {
  for (const result of [[], {}, { deployments: [] }, { deployments: [{ versions: [{ version_id: 'b'.repeat(36), percentage: 50 }] }] }]) {
    const adapter = new CloudflareAdapter({}, { fetchFn: async () => { throw Error('NETWORK_FORBIDDEN'); } });
    adapter.get = async () => result;
    await assert.rejects(adapter.activeVersion(), /ACTIVE_DEPLOYMENT_INVALID/);
  }
});
test('active version follows the one 100 percent deployed immutable version using GET only', async () => {
  const id = '00000000-0000-4000-8000-000000000001', calls = [];
  const adapter = new CloudflareAdapter({ CF_ACCOUNT_ID: '0'.repeat(32), CF_READ_TOKEN: 'SYNTHETIC_READ_ONLY' }, {
    fetchFn: async (url, init) => { calls.push({ url, init }); return Response.json({ success: true, result: url.endsWith('/deployments') ? { deployments: [{ versions: [{ version_id: id, percentage: 100 }] }] } : { id, resources: {} } }); }
  });
  assert.equal((await adapter.activeVersion()).id, id); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.init.method === 'GET' && call.init.redirect === 'manual'));
  assert.ok(calls.every(call => call.url.includes('/workers/scripts/birdmap-vworld-tiles/')));
});
test('independent recovery with only reviewed per-worker editing requires no account-wide subdomain permission', async () => {
  const env = { ...scopeFixture(), APPROVED_RUN_ID: RUN, TRIAL_MODE: 'recover', CF_ACCOUNT_ID: '0'.repeat(32),
    CF_EXPECTED_ACCOUNT_ID: '0'.repeat(32), TRIAL_HOST: 'https://birdmap-vworld-tiles.synthetic.workers.dev' };
  delete env.CF_READ_TOKEN; delete env.CF_READ_TOKEN_SHA256;
  const calls = [];
  const adapter = new CloudflareAdapter(env, { localCheckFn: () => {}, fetchFn: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: false }, { status: 403 });
    if (url.endsWith('/workers/scripts/birdmap-vworld-tiles/subdomain')) return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
    throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
  } });
  adapter.sourceOwnership = async () => {};
  await adapter.preflight({ sha: SHA, runId: RUN, mode: 'recover' });
  assert.ok(calls.every(call => !call.url.endsWith('/workers/subdomain')));
  assert.ok(calls.every(call => call.init.method === 'GET'));
});
test('probe cancels response body when header policy rejects before body inspection', async () => {
  let cancelled = 0;
  const adapter = new CloudflareAdapter({ TRIAL_HOST: 'https://birdmap-vworld-tiles.synthetic.workers.dev' }, {
    fetchFn: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(Uint8Array.of(1)); }, cancel() { cancelled++; }
    }), { status: 200, headers: { ...headers, 'X-Synthetic-Unreviewed': 'forbidden' } })
  });
  await assert.rejects(adapter.probe({ x: 218, token: TOKEN, status: 200 }), /PROBE_HEADER_FAILED/);
  assert.equal(cancelled, 1);
});
