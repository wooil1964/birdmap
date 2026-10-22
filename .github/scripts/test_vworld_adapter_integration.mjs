import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { bootstrapTrial, runTrial, recoverTrial } from '../../vworld-tiles/trial/core.mjs';
import { CloudflareAdapter } from '../../vworld-tiles/trial/cloudflare.mjs';

// Exercise the actual adapter/core with synthetic GET responses and a fake
// Wrangler child. No real fetch, command, account, credentials or tiles occur.
const SHA = 'a'.repeat(40), BOOT = '1234567890', RUN = '1234567891';
const TARGET = 'birdmap-vworld-tiles', KEY = 'SYNTHETIC_VWORLD_KEY_NO_NETWORK';
const NOW = Date.parse('2026-10-22T08:00:00.000Z');
const TOKEN = Buffer.alloc(32, 17).toString('base64url');
const HOST = 'https://birdmap-vworld-tiles.synthetic.workers.dev';
function environment(mode, runId = RUN) {
  const env = { APPROVED_SHA: SHA, APPROVED_RUN_ID: runId, APPROVED_BOOTSTRAP_RUN_ID: BOOT,
    TRIAL_MODE: mode, TRIAL_HOST: HOST, CF_ACCOUNT_ID: '0'.repeat(32), CF_EXPECTED_ACCOUNT_ID: '0'.repeat(32),
    CF_SCOPE_REVIEWED_SHA: SHA, CF_READ_SCOPE: 'workers-product-content-read-only',
    CF_CREATE_SCOPE: 'workers-product-admin', CF_EDIT_SCOPE: 'individual-worker-editor', CF_EDIT_WORKER: TARGET,
    CF_READ_TOKEN: 'SYNTHETIC_READ_TOKEN_ONLY_111', CF_CREATE_TOKEN: 'SYNTHETIC_CREATE_TOKEN_ONLY_222',
    CF_EDIT_TOKEN: 'SYNTHETIC_EDIT_TOKEN_ONLY_333' };
  for (const name of ['CF_READ_TOKEN', 'CF_CREATE_TOKEN', 'CF_EDIT_TOKEN']) env[name + '_SHA256'] = createHash('sha256').update(env[name]).digest('hex');
  return env;
}
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let n = 0; n < 8; n++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
function png() {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), out.length - 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + 256 * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
// Cloudflare consumes its own CDN policy header before the external response.
const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'CF-Cache-Status': 'DYNAMIC' };
const clone = value => structuredClone(value);
function fixture({ failSecret = 0, failTile = 0, failDeploy = 0, revokeReadWhenEnabled = false } = {}) {
  const versions = new Map(), secrets = new Map(), apiCalls = [], toolCalls = [], probes = [], reports = [], syntheticErrors = [];
  let current = null, serial = 0, secretCalls = 0, deployCalls = 0, settingsOverride = null;
  const currentVersion = () => versions.get(current);
  const variables = () => Object.fromEntries((currentVersion()?.resources.bindings ?? []).filter(b => b.type === 'plain_text').map(b => [b.name, b.text]));
  function snapshot({ enabled = false, start = '', end = '', message = '', tag = 'bm-' + SHA, etag = 'synthetic-reviewed-code-etag' } = {}) {
    const id = '00000000-0000-4000-8000-' + String(++serial).padStart(12, '0');
    const bindings = [
      { type: 'plain_text', name: 'TILES_ENABLED', text: String(enabled) },
      { type: 'plain_text', name: 'TRIAL_STARTS_AT', text: start }, { type: 'plain_text', name: 'TRIAL_EXPIRES_AT', text: end },
      { type: 'ratelimit', name: 'CLIENT_TILE_LIMITER', namespace_id: '196440', simple: { limit: 20, period: 60 } },
      { type: 'ratelimit', name: 'GLOBAL_TILE_LIMITER', namespace_id: '196441', simple: { limit: 40, period: 60 } },
      ...[...secrets.keys()].map(name => ({ type: 'secret_text', name }))
    ];
    versions.set(id, { id, annotations: message ? { 'workers/tag': tag, 'workers/message': message } : {},
      resources: { bindings, script: { etag }, script_runtime: { compatibility_date: '2026-10-22' } } });
    current = id;
    return currentVersion();
  }
  const result = (value, info) => Response.json({ success: true, result: clone(value), ...(info ? { result_info: info } : {}) });
  const fetchFn = async (url, init) => {
    if (url.startsWith(HOST + '/tiles/')) {
      const token = init.headers['X-Birdmap-Trial-Token']; probes.push({ url, token });
      assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
      const enabled = variables().TILES_ENABLED === 'true';
      const allowed = token && token === secrets.get('TRIAL_ACCESS_TOKEN');
      const positives = probes.filter(p => p.token).length;
      const status = !enabled ? 503 : !allowed ? 403 : failTile && positives === failTile ? 502 : 200;
      return new Response(status === 200 ? png() : 'tiles_unavailable', { status, headers: { ...headers, 'Content-Type': status === 200 ? 'image/png' : 'text/plain; charset=utf-8' } });
    }
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + '0'.repeat(32);
    assert.ok(url.startsWith(base)); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual');
    const path = url.slice(base.length); apiCalls.push({ path, authorization: init.headers.Authorization });
    if (revokeReadWhenEnabled && variables().TILES_ENABLED === 'true' && init.headers.Authorization === 'Bearer ' + environment('run').CF_READ_TOKEN) return Response.json({ success: false }, { status: 403 });
    if (path === '/workers/subdomain') return result({ subdomain: 'synthetic' });
    if (path === '/workers/scripts') return result(current ? [{ id: TARGET }] : []);
    const prefix = '/workers/scripts/' + TARGET;
    if (!current && path.startsWith(prefix)) return Response.json({ success: false }, { status: 404 });
    if (path === prefix + '/settings') return result({ bindings: settingsOverride ?? currentVersion().resources.bindings, observability: { enabled: false }, logpush: false, tail_consumers: [], streaming_tail_consumers: [] });
    if (path === prefix + '/subdomain') return result({ enabled: true, previews_enabled: false });
    if (path === prefix + '/deployments') return result({ deployments: [{ id: 'synthetic-deployment-' + serial, versions: [{ version_id: current, percentage: 100 }] }] });
    if (path.startsWith(prefix + '/versions?')) {
      const parsed = new URL(url), page = Number(parsed.searchParams.get('page')), per = Number(parsed.searchParams.get('per_page'));
      const all = [...versions.keys()].reverse(), items = all.slice((page - 1) * per, page * per).map(id => ({ id }));
      return result({ items }, { page, per_page: per, count: items.length, total_count: all.length, total_pages: Math.ceil(all.length / per) });
    }
    if (path.startsWith(prefix + '/versions/')) {
      const version = versions.get(decodeURIComponent(path.slice((prefix + '/versions/').length)));
      return version ? result(version) : Response.json({ success: false }, { status: 404 });
    }
    throw Error('UNEXPECTED_SYNTHETIC_API_PATH');
  };
  const spawnFn = (command, argv, options) => {
    const child = new EventEmitter(); child.stdin = new EventEmitter();
    let input = ''; child.stdin.end = value => { input = value; };
    child.kill = () => { queueMicrotask(() => child.emit('close', 1)); return true; };
    const args = argv.slice(1), call = { command, args: clone(args), env: clone(options.env), input: '' }; toolCalls.push(call);
    assert.deepEqual(options.stdio, ['pipe', 'ignore', 'ignore']);
    assert.equal(options.windowsHide, true);
    queueMicrotask(() => {
      try {
        call.input = input;
        assert.ok(!JSON.stringify(args).includes(KEY)); assert.ok(!JSON.stringify(args).includes(TOKEN));
        assert.ok(!JSON.stringify(options.env).includes(KEY)); assert.ok(!JSON.stringify(options.env).includes(TOKEN));
        assert.equal(args[args.indexOf('--name') + 1], TARGET);
        let fail = false;
        if (args[0] === 'deploy') {
          deployCalls++;
          const config = readFileSync(args[args.indexOf('--config') + 1], 'utf8');
          assert.match(config, /TILES_ENABLED = "false"/); assert.match(config, /preview_urls = false/);
          const vars = {};
          for (let n = 0; n < args.length; n++) if (args[n] === '--var') {
            const value = args[n + 1], at = value.indexOf(':'); vars[value.slice(0, at)] = value.slice(at + 1);
          }
          assert.ok(['true', 'false'].includes(vars.TILES_ENABLED));
          snapshot({ enabled: vars.TILES_ENABLED === 'true', start: vars.TRIAL_STARTS_AT, end: vars.TRIAL_EXPIRES_AT,
            tag: args[args.indexOf('--tag') + 1], message: args[args.indexOf('--message') + 1] });
          call.enabled = vars.TILES_ENABLED;
          fail = deployCalls === failDeploy;
        } else {
          assert.deepEqual(args.slice(0, 2), ['secret', 'put']);
          assert.equal(variables().TILES_ENABLED, 'false');
          const config = readFileSync(args[args.indexOf('--config') + 1], 'utf8');
          assert.match(config, /TILES_ENABLED = "false"/);
          secretCalls++; secrets.set(args[2], input.replace(/\n$/, ''));
          // secret put itself deploys and may drop version annotations; preserve
          // code etag and exercise immutable retained-version ownership recovery.
          snapshot({ enabled: false });
          fail = secretCalls === failSecret;
        }
        child.emit('close', fail ? 1 : 0);
      } catch (error) { syntheticErrors.push(error.message); child.emit('error', Error('SYNTHETIC_TOOL_FAILED')); }
    });
    return child;
  };
  function adapter(mode, runId = RUN, onlyEditor = false) {
    const env = environment(mode, runId);
    if (onlyEditor) { delete env.CF_READ_TOKEN; delete env.CF_READ_TOKEN_SHA256; }
    const value = new CloudflareAdapter(env, { fetchFn, spawnFn, localCheckFn: sha => assert.equal(sha, SHA) });
    value.audit = async ({ allowTarget }) => { assert.equal(Boolean(current), allowTarget); };
    value.report = event => reports.push(event);
    return value;
  }
  return { adapter, versions, secrets, apiCalls, toolCalls, probes, reports, syntheticErrors, snapshot, currentVersion, variables,
    setCurrentSettings(bindings) { settingsOverride = clone(bindings); }, get exists() { return current !== null; } };
}
const runOptions = () => ({ sha: SHA, runId: RUN, vworldKey: KEY, now: () => NOW, randomBytesFn: () => Buffer.alloc(32, 17) });
const bootstrap = f => bootstrapTrial(f.adapter('bootstrap', BOOT), { sha: SHA, runId: BOOT });
const approvedRun = f => runTrial(f.adapter('run'), runOptions());
const recover = f => recoverTrial(f.adapter('recover', RUN, true), { sha: SHA, runId: RUN });
const successfulTiles = f => f.probes.filter(p => p.token);
function disabled(f) {
  assert.equal(f.variables().TILES_ENABLED, 'false');
  assert.equal(f.probes.at(-1).token, undefined);
  assert.equal(f.reports.at(-1), 'restored-503');
  assert.deepEqual(f.syntheticErrors, []);
}
test('complete synthetic bootstrap and trial preserve false through secret deployment and restore after four tiles', async () => {
  const f = fixture(); await bootstrap(f);
  assert.equal(f.variables().TILES_ENABLED, 'false'); assert.equal(f.secrets.size, 0);
  assert.deepEqual(await approvedRun(f), { attemptedTiles: 4, restored: true }); disabled(f);
  assert.deepEqual(successfulTiles(f).map(p => new URL(p.url).pathname), ['/tiles/8/218/100.png', '/tiles/8/219/100.png', '/tiles/8/220/100.png', '/tiles/8/221/100.png']);
  assert.deepEqual([...f.secrets.keys()].sort(), ['TRIAL_ACCESS_TOKEN', 'VWORLD_API_KEY']);
  const puts = f.toolCalls.filter(c => c.args[0] === 'secret');
  assert.equal(puts.length, 2); assert.equal(puts[0].input, KEY + '\n'); assert.equal(puts[1].input, TOKEN + '\n');
  assert.equal(f.toolCalls[0].env.CLOUDFLARE_API_TOKEN, environment('bootstrap').CF_CREATE_TOKEN);
  assert.ok(f.toolCalls.slice(1).every(c => c.env.CLOUDFLARE_API_TOKEN === environment('run').CF_EDIT_TOKEN));
  assert.deepEqual(f.toolCalls.filter(c => c.args[0] === 'deploy').map(c => c.enabled), ['false', 'false', 'false', 'true', 'false']);
});
test('ambiguous initial create completion is disabled again through the real adapter', async () => {
  const f = fixture({ failDeploy: 1 }); await assert.rejects(bootstrap(f));
  assert.equal(f.exists, true); disabled(f); assert.equal(f.secrets.size, 0); assert.equal(successfulTiles(f).length, 0);
  assert.deepEqual(f.toolCalls.map(c => c.enabled), ['false', 'false']);
});
test('secret put failure after remote mutation restores false with existing secret preserved', async () => {
  const f = fixture({ failSecret: 1 }); await bootstrap(f); await assert.rejects(approvedRun(f));
  disabled(f); assert.equal(f.secrets.get('VWORLD_API_KEY'), KEY); assert.equal(f.secrets.has('TRIAL_ACCESS_TOKEN'), false);
  assert.equal(successfulTiles(f).length, 0); assert.ok(f.toolCalls.every(c => c.enabled !== 'true'));
});
test('second synthetic tile failure stops immediately without retry and restores through real adapter', async () => {
  const f = fixture({ failTile: 2 }); await bootstrap(f); await assert.rejects(approvedRun(f)); disabled(f);
  assert.deepEqual(successfulTiles(f).map(p => new URL(p.url).pathname), ['/tiles/8/218/100.png', '/tiles/8/219/100.png']);
  assert.equal(f.toolCalls.filter(c => c.enabled === 'true').length, 1);
});
test('independent narrow-editor recovery finds owned history after annotations disappear without account-wide reads', async () => {
  const f = fixture(); await bootstrap(f); await approvedRun(f);
  f.snapshot({ enabled: true, start: new Date(NOW).toISOString(), end: new Date(NOW + 600000).toISOString(), message: '' });
  const callsBefore = f.apiCalls.length; await recover(f); disabled(f);
  assert.ok(f.apiCalls.slice(callsBefore).every(call => call.path.startsWith('/workers/scripts/' + TARGET + '/')));
  assert.ok(f.apiCalls.slice(callsBefore).every(call => call.authorization === 'Bearer ' + environment('recover').CF_EDIT_TOKEN));
});
test('independent recovery never creates an absent target', async () => {
  const f = fixture(); await assert.rejects(recover(f)); assert.equal(f.exists, false); assert.equal(f.toolCalls.length, 0);
});
test('independent recovery refuses an unrelated source without any deployment', async () => {
  const f = fixture(); f.snapshot({ message: 'unrelated-synthetic-source', tag: 'unrelated', etag: 'synthetic-foreign-code' });
  await assert.rejects(recover(f), /TARGET_SOURCE_OWNERSHIP_UNVERIFIED/); assert.equal(f.toolCalls.length, 0);
});
for (const type of ['d1', 'service']) test('owned source with an unexpected ' + type + ' binding is never overwritten during recovery', async () => {
  const f = fixture(); await bootstrap(f);
  f.currentVersion().resources.bindings.push({ type, name: 'UNRELATED_BINDING', id: 'synthetic-unrelated-resource' });
  const before = f.toolCalls.length;
  await assert.rejects(recover(f)); assert.equal(f.toolCalls.length, before);
  assert.ok(f.currentVersion().resources.bindings.some(b => b.name === 'UNRELATED_BINDING'));
});
test('a consumed or differently approved bootstrap cannot start another trial', async () => {
  for (const message of ['bm:' + SHA + ':consumed:' + BOOT, 'bm:' + SHA + ':bootstrap:9999999']) {
    const f = fixture(); f.snapshot({ message }); await assert.rejects(approvedRun(f), /NOT_UNUSED_APPROVED_BOOTSTRAP/);
    assert.equal(f.toolCalls.length, 0); assert.equal(successfulTiles(f).length, 0);
  }
});

test('automatic recovery uses narrow editing when the account-wide reader fails after activation', async () => {
  const f = fixture({ revokeReadWhenEnabled: true }); await bootstrap(f); await assert.rejects(approvedRun(f)); disabled(f);
  assert.equal(f.toolCalls.filter(c => c.enabled === 'true').length, 1); assert.equal(successfulTiles(f).length, 0);
});

test('independent recovery ignores a stale supplied account reader and uses target-only editing', async () => {
  const f = fixture({ revokeReadWhenEnabled: true }); await bootstrap(f);
  f.snapshot({ enabled: true, start: new Date(NOW).toISOString(), end: new Date(NOW + 600000).toISOString(), message: 'bm:' + SHA + ':enabled:' + RUN });
  const before = f.apiCalls.length;
  await recoverTrial(f.adapter('recover', RUN), { sha: SHA, runId: RUN }); disabled(f);
  assert.ok(f.apiCalls.slice(before).every(call => call.authorization === 'Bearer ' + environment('recover').CF_EDIT_TOKEN));
  assert.ok(f.apiCalls.slice(before).every(call => call.path.startsWith('/workers/scripts/' + TARGET + '/')));
});
test('recovery refuses unrelated current settings even if immutable active bindings remain isolated', async () => {
  const f = fixture(); await bootstrap(f);
  f.setCurrentSettings([...f.currentVersion().resources.bindings, { type: 'd1', name: 'UNRELATED_CURRENT_DB', id: 'synthetic-resource' }]);
  const before = f.toolCalls.length; await assert.rejects(recover(f)); assert.equal(f.toolCalls.length, before);
});

test('external probe accepts Cloudflare-consumed CDN policy headers with a noncacheable response', async () => {
  const adapter = new CloudflareAdapter({ TRIAL_HOST: HOST }, { fetchFn: async () => new Response(png(), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'CF-Cache-Status': 'DYNAMIC' } }) });
  await adapter.probe({ x: 218, token: TOKEN, status: 200 });
});
for (const status of ['HIT', 'STALE', 'REVALIDATED', 'UPDATING']) test('external probe rejects cached CF status ' + status, async () => {
  let calls = 0;
  const adapter = new CloudflareAdapter({ TRIAL_HOST: HOST }, { fetchFn: async () => { calls++; return new Response(png(), { status: 200, headers: { ...headers, 'CF-Cache-Status': status } }); } });
  await assert.rejects(adapter.probe({ x: 218, token: TOKEN, status: 200 })); assert.equal(calls, 1);
});

