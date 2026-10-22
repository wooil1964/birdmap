import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { CloudflareAdapter } from '../../vworld-tiles/trial/cloudflare.mjs';

// Exercise the actual adapter/core with synthetic GET responses and a fake
// Wrangler child. No real fetch, command, account, credentials or tiles occur.
export const SHA = 'a'.repeat(40), BOOT = '1234567890', RUN = '1234567891';
export const TARGET = 'birdmap-vworld-tiles', KEY = 'SYNTHETIC_VWORLD_KEY_NO_NETWORK';
export const NOW = Date.parse('2026-10-22T08:00:00.000Z');
export const TOKEN = Buffer.alloc(32, 17).toString('base64url');
export const HOST = 'https://birdmap-vworld-tiles.synthetic.workers.dev';
export function environment(mode, runId = RUN) {
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
export function png() {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), out.length - 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + 256 * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
// Cloudflare consumes its own CDN policy header before the external response.
export const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'CF-Cache-Status': 'DYNAMIC' };
const clone = value => structuredClone(value);
// beforeTool(call) may delay or fail a synthetic Wrangler call (solo delayed-write tests).
// accountApi(path, init) answers account-level GETs outside /workers/ (solo handoff tests).
export function fixture({ failSecret = 0, failTile = 0, failDeploy = 0, revokeReadWhenEnabled = false, beforeTool, accountApi, tileStatus } = {}) {
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
      const status = tileStatus?.({ enabled, allowed, token }) ?? (!enabled ? 503 : !allowed ? 403 : failTile && positives === failTile ? 502 : 200);
      return new Response(status === 200 ? png() : 'tiles_unavailable', { status, headers: { ...headers, 'Content-Type': status === 200 ? 'image/png' : 'text/plain; charset=utf-8' } });
    }
    const base = 'https://api.cloudflare.com/client/v4/accounts/' + '0'.repeat(32);
    assert.ok(url.startsWith(base)); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual');
    const path = url.slice(base.length); apiCalls.push({ path, authorization: init.headers.Authorization });
    if (revokeReadWhenEnabled && variables().TILES_ENABLED === 'true' && init.headers.Authorization === 'Bearer ' + environment('run').CF_READ_TOKEN) return Response.json({ success: false }, { status: 403 });
    if (accountApi && !path.startsWith('/workers/')) return accountApi(path, init);
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
    queueMicrotask(async () => {
      try {
        call.input = input;
        if (beforeTool) await beforeTool(call);
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
  function adapter(mode, runId = RUN, onlyEditor = false, extraEnv = {}) {
    const env = { ...environment(mode, runId), ...extraEnv };
    if (onlyEditor) { delete env.CF_READ_TOKEN; delete env.CF_READ_TOKEN_SHA256; }
    const value = new CloudflareAdapter(env, { fetchFn, spawnFn, localCheckFn: sha => assert.equal(sha, SHA) });
    value.audit = async ({ allowTarget }) => { assert.equal(Boolean(current), allowTarget); };
    value.report = event => reports.push(event);
    return value;
  }
  return { adapter, versions, secrets, apiCalls, toolCalls, probes, reports, syntheticErrors, snapshot, currentVersion, variables,
    setCurrentSettings(bindings) { settingsOverride = clone(bindings); }, get exists() { return current !== null; } };
}
