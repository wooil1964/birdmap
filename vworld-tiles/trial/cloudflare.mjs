import { spawn, execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditNamespaces } from './namespace-audit.mjs';

export const TARGET = 'birdmap-vworld-tiles';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = join(ROOT, 'vworld-tiles/trial');
const WRANGLER = join(TOOLS, 'node_modules/wrangler/bin/wrangler.js');
const ORIGIN = 'https://wooil1964.github.io';
const LIMIT = 2 * 1024 * 1024;
const fail = code => { throw Error(code); };
const ordered = value => JSON.stringify(value);
const sameNames = (a, b) => ordered([...a].sort()) === ordered([...b].sort());

export function localCheck(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) fail('SOURCE_SHA_INVALID');
  const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    if (git(['rev-parse', 'HEAD']) !== sha || git(['status', '--porcelain', '--untracked-files=all'])) fail('SOURCE_NOT_EXACT_CLEAN_SHA');
    if (!/^https:\/\/github\.com\/wooil1964\/birdmap(?:\.git)?$/.test(git(['remote', 'get-url', 'origin']))) fail('SOURCE_REPOSITORY_INVALID');
    if (process.version !== 'v24.18.0') fail('NODE_VERSION_INVALID');
    for (const folder of [ROOT, join(ROOT, 'vworld-tiles'), TOOLS]) {
      // Wrangler dotenv/local secrets must never override the allowlisted process env.
      if (readdirSync(folder).some(name => name === '.env' || name.startsWith('.env.') || name === '.dev.vars' || name.startsWith('.dev.vars.'))) fail('LOCAL_CREDENTIAL_FILE_FORBIDDEN');
    }
    if (JSON.parse(readFileSync(join(TOOLS, 'node_modules/wrangler/package.json'), 'utf8')).version !== '4.151.3') fail('WRANGLER_VERSION_INVALID');
    trialConfig();
  } catch (error) {
    if (/^(SOURCE_|NODE_|LOCAL_|WRANGLER_|CONFIG_)/.test(error.message)) throw error;
    fail('LOCAL_CHECK_FAILED');
  }
}

export function trialConfig(bootstrap = false) {
  const config = readFileSync(join(ROOT, 'vworld-tiles/wrangler.trial.toml'), 'utf8');
  const normalize = s => s.split(/\r?\n/).map(x => x.replace(/#.*/, '').trim()).filter(Boolean).join('\n');
  const expected = `name = "birdmap-vworld-tiles"
main = "src/trial-worker.mjs"
compatibility_date = "2026-10-22"
workers_dev = true
preview_urls = false
[vars]
TILES_ENABLED = "false"
TRIAL_STARTS_AT = ""
TRIAL_EXPIRES_AT = ""
[secrets]
required = ["VWORLD_API_KEY", "TRIAL_ACCESS_TOKEN"]
[[ratelimits]]
name = "CLIENT_TILE_LIMITER"
namespace_id = "196440"
simple = { limit = 20, period = 60 }
[[ratelimits]]
name = "GLOBAL_TILE_LIMITER"
namespace_id = "196441"
simple = { limit = 40, period = 60 }
[observability]
enabled = false`;
  if (normalize(config) !== expected) fail('CONFIG_NOT_REVIEWED_ISOLATED_TRIAL');
  return config.replace('main = "src/trial-worker.mjs"', 'main = ' + JSON.stringify(join(ROOT, 'vworld-tiles/src/trial-worker.mjs').replaceAll('\\', '/')))
    .replace('required = ["VWORLD_API_KEY", "TRIAL_ACCESS_TOKEN"]', bootstrap ? 'required = []' : 'required = ["VWORLD_API_KEY", "TRIAL_ACCESS_TOKEN"]');
}

// Child processes receive only OS essentials and the one appropriate CF token.
// Neither VWorld key nor trial token ever appears in argv or this environment.
export function childEnvironment(source, account, token, home) {
  const out = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (source[name]) out[name] = source[name];
  return { ...out, CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token,
    WRANGLER_HOME: home, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_SEND_METRICS: 'false', CI: 'true', NO_COLOR: '1',
    WRANGLER_LOG: 'none', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    WRANGLER_OUTPUT_FILE_PATH: '', WRANGLER_OUTPUT_FILE_DIRECTORY: '' };
}

export function verifyScope(env, mode) {
  if (env.CF_SCOPE_REVIEWED_SHA !== env.APPROVED_SHA) fail('SCOPE_REVIEW_REQUIRED');
  const check = name => {
    const value = env[name], digest = env[name + '_SHA256'];
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(value) || !/^[a-f0-9]{64}$/.test(digest ?? '')) fail('TOKEN_REVIEW_REQUIRED');
    const actual = createHash('sha256').update(value).digest();
    if (!timingSafeEqual(actual, Buffer.from(digest, 'hex'))) fail('TOKEN_REVIEW_MISMATCH');
  };
  if (mode !== 'recover') {
    if (env.CF_READ_SCOPE !== 'workers-product-content-read-only') fail('SCOPE_REVIEW_REQUIRED');
    check('CF_READ_TOKEN');
  }
  if (mode === 'bootstrap' || mode === 'bootstrap-recover') {
    check('CF_CREATE_TOKEN');
    if (env.CF_CREATE_SCOPE !== 'workers-product-admin' || env.CF_CREATE_TOKEN === env.CF_READ_TOKEN) fail('CREATION_SCOPE_REVIEW_REQUIRED');
  } else {
    check('CF_EDIT_TOKEN');
    if (env.CF_EDIT_SCOPE !== 'individual-worker-editor' || env.CF_EDIT_WORKER !== TARGET || (mode !== 'recover' && env.CF_EDIT_TOKEN === env.CF_READ_TOKEN)) fail('EDITOR_SCOPE_REVIEW_REQUIRED');
  }
}

export function assertBindings(bindings, { enabled, start = '', end = '', secretNames }) {
  if (!Array.isArray(bindings)) fail('REMOTE_BINDINGS_MISSING');
  const names = new Set(), secrets = [];
  for (const b of bindings) {
    if (!b || typeof b.name !== 'string' || names.has(b.name)) fail('REMOTE_BINDINGS_INVALID');
    names.add(b.name);
    if (b.type === 'plain_text') {
      const values = { TILES_ENABLED: String(enabled), TRIAL_STARTS_AT: start, TRIAL_EXPIRES_AT: end };
      if (!Object.hasOwn(values, b.name) || b.text !== values[b.name]) fail('REMOTE_VARS_MISMATCH');
    } else if (b.type === 'secret_text') {
      if (!['VWORLD_API_KEY', 'TRIAL_ACCESS_TOKEN'].includes(b.name)) fail('REMOTE_SECRET_NAME_INVALID');
      secrets.push(b.name);
    } else if (b.type === 'ratelimit') {
      const expected = { CLIENT_TILE_LIMITER: ['196440', 20], GLOBAL_TILE_LIMITER: ['196441', 40] }[b.name];
      if (!expected || String(b.namespace_id) !== expected[0] || b.simple?.limit !== expected[1] || b.simple?.period !== 60) fail('REMOTE_LIMITER_MISMATCH');
    } else fail('REMOTE_EXTRA_BINDING_FORBIDDEN');
  }
  if (!['TILES_ENABLED', 'TRIAL_STARTS_AT', 'TRIAL_EXPIRES_AT', 'CLIENT_TILE_LIMITER', 'GLOBAL_TILE_LIMITER'].every(n => names.has(n))) fail('REMOTE_BINDINGS_INCOMPLETE');
  if (secretNames && !sameNames(secrets, secretNames)) fail('REMOTE_SECRET_SET_MISMATCH');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > LIMIT || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  let pos = 8, data = false;
  while (pos + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(pos), end = pos + 12 + size, tag = bytes.toString('ascii', pos + 4, pos + 8);
    if (size > LIMIT || end > bytes.length || bytes.readUInt32BE(end - 4) !== crc32(bytes.subarray(pos + 4, end - 4))) return false;
    if (pos === 8) {
      if (tag !== 'IHDR' || size !== 13 || bytes.readUInt32BE(pos + 8) !== 256 || bytes.readUInt32BE(pos + 12) !== 256) return false;
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[bytes[pos + 17]]?.includes(bytes[pos + 16]) || bytes[pos + 18] || bytes[pos + 19] || bytes[pos + 20] > 1) return false;
    } else if (tag === 'IHDR') return false;
    if (tag === 'IDAT' && size > 0) data = true;
    if (tag === 'IEND') return size === 0 && data && end === bytes.length;
    pos = end;
  }
  return false;
}

async function bytesLimited(response, limit) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) fail('RESPONSE_TOO_LARGE'); chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

export class CloudflareAdapter {
  constructor(env, { fetchFn = fetch, spawnFn = spawn, localCheckFn = localCheck } = {}) {
    this.env = env; this.fetch = fetchFn; this.spawn = spawnFn; this.localCheck = localCheckFn;
    this.controller = new AbortController(); this.child = null; this.etag = null;
    this.phase = null; this.mode = env.TRIAL_MODE; this.sha = env.APPROVED_SHA; this.runId = env.APPROVED_RUN_ID;
    this.writeToken = this.mode === 'bootstrap' || this.mode === 'bootstrap-recover' ? env.CF_CREATE_TOKEN : env.CF_EDIT_TOKEN;
  }
  cancel() { this.controller.abort(); this.child?.kill('SIGTERM'); }
  report(event) {
    if (['restored-503', 'bootstrap-disabled-503', 'tile-ok'].includes(event)) process.stdout.write(JSON.stringify({ event }) + '\n');
  }
  async api(path, token = (this.recovering || this.mode === 'recover') ? this.writeToken : this.env.CF_READ_TOKEN || this.env.CF_EDIT_TOKEN) {
    if (!path.startsWith('/workers/') || path.includes('..') || path.includes('://')) fail('API_PATH_INVALID');
    const response = await this.fetch('https://api.cloudflare.com/client/v4/accounts/' + this.env.CF_ACCOUNT_ID + path, {
      method: 'GET', redirect: 'manual', headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(12000)])
    });
    let value;
    try { value = JSON.parse((await bytesLimited(response, 8 * LIMIT)).toString('utf8')); }
    catch { fail('API_RESPONSE_INVALID'); }
    return { status: response.status, success: value.success === true, result: value.result, info: value.result_info };
  }
  async get(path, token) {
    const r = await this.api(path, token);
    if (r.status !== 200 || !r.success) fail('API_GET_FAILED');
    return r.result;
  }
  async preflight({ sha, runId, mode }) {
    if (sha !== this.sha || String(runId) !== this.runId) fail('APPROVAL_IDENTITY_MISMATCH');
    this.localCheck(sha);
    if (!/^[a-f0-9]{32}$/.test(this.env.CF_ACCOUNT_ID ?? '') || this.env.CF_ACCOUNT_ID !== this.env.CF_EXPECTED_ACCOUNT_ID) fail('ACCOUNT_ID_MISMATCH');
    if (!/^https:\/\/birdmap-vworld-tiles\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.workers\.dev$/.test(this.env.TRIAL_HOST ?? '')) fail('TARGET_HOST_INVALID');
    verifyScope(this.env, this.mode);
    if (mode === 'recover') {
      // The operator supplies the previously verified exact host/account through
      // the protected recovery channel. Narrow Editors cannot discover account
      // subdomains. Confirm target access here; sourceOwnership checks it before
      // writing. Do not make emergency disabling depend on account-wide access.
      const targetSubdomain = await this.get(`/workers/scripts/${TARGET}/subdomain`, this.writeToken);
      if (typeof targetSubdomain?.enabled !== 'boolean' || typeof targetSubdomain?.previews_enabled !== 'boolean') fail('TARGET_SUBDOMAIN_UNVERIFIED');
    } else {
      const subdomain = await this.get('/workers/subdomain');
      if (this.env.TRIAL_HOST !== 'https://' + TARGET + '.' + subdomain?.subdomain + '.workers.dev') fail('TARGET_ACCOUNT_HOST_MISMATCH');
    }
    if (mode === 'run') {
      const v = await this.activeVersion();
      const approved = this.env.APPROVED_BOOTSTRAP_RUN_ID;
      if (!/^[1-9][0-9]{0,19}$/.test(approved ?? '') || v.annotations?.['workers/tag'] !== 'bm-' + sha ||
          v.annotations?.['workers/message'] !== `bm:${sha}:bootstrap:${approved}`) fail('NOT_UNUSED_APPROVED_BOOTSTRAP');
      this.etag = v.resources?.script?.etag;
      if (typeof this.etag !== 'string' || !this.etag) fail('SOURCE_ETAG_MISSING');
      this.phase = 'bootstrap';
    }
  }
  async audit({ allowTarget }) { return auditNamespaces(path => this.api(path), { mode: allowTarget ? 'target-only' : 'initial' }); }
  async assertAbsent() {
    const scripts = await this.get('/workers/scripts');
    if (!Array.isArray(scripts) || scripts.some(x => x.id === TARGET)) fail('TARGET_ALREADY_EXISTS');
  }
  async activeVersion() {
    const deployments = await this.get(`/workers/scripts/${TARGET}/deployments`);
    const active = deployments?.deployments?.[0];
    if (!active || active.versions?.length !== 1 || active.versions[0].percentage !== 100 || !/^[a-f0-9-]{36}$/.test(active.versions[0].version_id ?? '')) fail('ACTIVE_DEPLOYMENT_INVALID');
    return this.get(`/workers/scripts/${TARGET}/versions/${active.versions[0].version_id}`);
  }
  async sourceOwnership() {
    const active = await this.activeVersion();
    const settings = await this.get(`/workers/scripts/${TARGET}/settings`);
    for (const bindings of [active.resources?.bindings, settings?.bindings]) {
      // Recovery may repair disabled/expired/invalid trial vars, but never remove
      // an unexpected data/service binding from a changed target configuration.
      if (!Array.isArray(bindings)) fail('TARGET_BINDINGS_UNVERIFIED');
      const values = Object.fromEntries(bindings.filter(b => b.type === 'plain_text').map(b => [b.name, b.text]));
      if (!['TILES_ENABLED', 'TRIAL_STARTS_AT', 'TRIAL_EXPIRES_AT'].every(n => typeof values[n] === 'string')) fail('TARGET_VARS_UNVERIFIED');
      assertBindings(bindings, { enabled: values.TILES_ENABLED, start: values.TRIAL_STARTS_AT, end: values.TRIAL_EXPIRES_AT });
    }
    if (this.etag && active.resources?.script?.etag === this.etag) return;
    // Immutable version metadata + matching code etag supports independent recovery
    // after secret put (which may replace version annotations without changing code).
    const response = await this.api(`/workers/scripts/${TARGET}/versions?page=1&per_page=100`);
    const total = response.info?.total_count, per = response.info?.per_page;
    if (response.status !== 200 || !response.success || !Number.isInteger(total) || total < 1 || !Number.isInteger(per) || per < 1 || response.info.page !== 1) fail('RECOVERY_HISTORY_UNVERIFIED');
    let items = response.result?.items;
    if (!Array.isArray(items)) fail('RECOVERY_HISTORY_UNVERIFIED');
    for (let page = 2; items.length < total; page++) {
      if (page > 10000) fail('RECOVERY_HISTORY_UNVERIFIED');
      const r = await this.api(`/workers/scripts/${TARGET}/versions?page=${page}&per_page=100`);
      if (r.status !== 200 || !r.success || r.info?.page !== page || r.info?.total_count !== total || !Array.isArray(r.result?.items) || !r.result.items.length) fail('RECOVERY_HISTORY_UNVERIFIED');
      items = items.concat(r.result.items);
    }
    if (items.length !== total || new Set(items.map(x => x.id)).size !== total) fail('RECOVERY_HISTORY_UNVERIFIED');
    for (const item of items) {
      const v = await this.get(`/workers/scripts/${TARGET}/versions/${encodeURIComponent(item.id)}`);
      if (v.annotations?.['workers/tag'] === 'bm-' + this.sha && new RegExp(`^bm:${this.sha}:(bootstrap|consumed|enabled|closed):[1-9][0-9]{0,19}$`).test(v.annotations?.['workers/message'] ?? '') &&
          v.resources?.script?.etag === active.resources?.script?.etag && typeof v.resources?.script?.etag === 'string') {
        this.etag = v.resources.script.etag; return;
      }
    }
    fail('TARGET_SOURCE_OWNERSHIP_UNVERIFIED');
  }
  async verify(options) {
    const settings = await this.get(`/workers/scripts/${TARGET}/settings`);
    assertBindings(settings?.bindings, options);
    if (settings?.observability?.enabled !== false || settings.logpush === true || settings.tail_consumers?.length || settings.streaming_tail_consumers?.length) fail('REMOTE_LOGGING_FORBIDDEN');
    const subdomain = await this.get(`/workers/scripts/${TARGET}/subdomain`);
    if (subdomain.enabled !== true || subdomain.previews_enabled !== false) fail('REMOTE_PREVIEW_NOT_DISABLED');
    const active = await this.activeVersion();
    assertBindings(active.resources?.bindings, options);
    if (active.resources?.script_runtime?.compatibility_date !== '2026-10-22') fail('REMOTE_RUNTIME_MISMATCH');
    if (this.phase && this.phase !== 'secret' && this.phase !== 'bootstrap' && active.annotations?.['workers/message'] !== `bm:${this.sha}:${this.phase}:${this.runId}`) fail('REMOTE_SOURCE_ANNOTATION_MISMATCH');
    if (this.phase === 'bootstrap' && this.mode === 'bootstrap' && active.annotations?.['workers/message'] !== `bm:${this.sha}:bootstrap:${this.runId}`) fail('REMOTE_BOOTSTRAP_ANNOTATION_MISMATCH');
    await this.sourceOwnership();
  }
  async switchToEdit() {
    verifyScope(this.env, 'run');
    // Confirm the specific editor can read the existing target before first write.
    await this.get(`/workers/scripts/${TARGET}/settings`, this.env.CF_EDIT_TOKEN);
    this.writeToken = this.env.CF_EDIT_TOKEN;
  }
  async beginRecovery() {
    this.controller = new AbortController();
    this.recovering = true; // An expired account-wide reader must not prevent disabling.
    if (this.child) fail('PRIOR_DEPLOY_PROCESS_NOT_QUIESCENT');
    this.localCheck(this.sha);
    await this.sourceOwnership(); // Missing/foreign target is never created or overwritten.
  }
  async execute(args, stdin = '') {
    if (this.controller.signal.aborted) fail('TRIAL_CANCELLED');
    const home = mkdtempSync(join(tmpdir(), 'birdmap-wrangler-'));
    try {
      await new Promise((resolvePromise, reject) => {
        const child = this.spawn(process.execPath, [WRANGLER, ...args], { cwd: ROOT,
          env: childEnvironment(this.env, this.env.CF_ACCOUNT_ID, this.writeToken, home),
          stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
        this.child = child;
        let timedOut = false, killTimer, stopTimer;
        const clear = () => { clearTimeout(timer); clearTimeout(killTimer); clearTimeout(stopTimer); };
        const timer = setTimeout(() => {
          timedOut = true; child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
          stopTimer = setTimeout(() => { clear(); reject(Error('WRANGLER_NOT_QUIESCENT')); }, 10000);
        }, 120000);
        child.on('error', () => { clear(); this.child = null; reject(Error('WRANGLER_FAILED')); });
        child.on('close', code => { clear(); this.child = null; code === 0 && !timedOut && !this.controller.signal.aborted ? resolvePromise() : reject(Error('WRANGLER_FAILED')); });
        child.stdin.on('error', () => {}); child.stdin.end(stdin ? stdin + '\n' : '');
      });
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
  async deploy({ enabled, bootstrap, phase, create, start = '', end = '' }) {
    this.localCheck(this.sha);
    if (create) { if (this.mode !== 'bootstrap' || enabled) fail('CREATION_MODE_INVALID'); await this.assertAbsent(); }
    else await this.sourceOwnership();
    const temp = mkdtempSync(join(tmpdir(), 'birdmap-trial-config-'));
    try {
      const config = join(temp, 'wrangler.toml'); writeFileSync(config, trialConfig(bootstrap), { mode: 0o600 });
      await this.execute(['deploy', '--config', config, '--name', TARGET, '--tag', 'bm-' + this.sha,
        '--message', `bm:${this.sha}:${phase}:${this.runId}`, '--var', 'TILES_ENABLED:' + enabled,
        '--var', 'TRIAL_STARTS_AT:' + start, '--var', 'TRIAL_EXPIRES_AT:' + end]);
      this.phase = phase;
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
  async putSecret({ name, value }) {
    if (!['VWORLD_API_KEY', 'TRIAL_ACCESS_TOKEN'].includes(name) || this.mode !== 'run') fail('SECRET_MODE_INVALID');
    this.localCheck(this.sha); await this.verify({ enabled: false, bootstrap: true });
    await this.execute(['secret', 'put', name, '--config', join(ROOT, 'vworld-tiles/wrangler.trial.toml'), '--name', TARGET], value);
    this.phase = 'secret';
  }
  async probe({ x, token, status }) {
    if (![218, 219, 220, 221].includes(x) || ![200, 403, 503].includes(status) || (status === 200 && !/^[A-Za-z0-9_-]{43}$/.test(token ?? ''))) fail('PROBE_INVALID');
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(12000)]);
    const response = await this.fetch(this.env.TRIAL_HOST + `/tiles/8/${x}/100.png`, {
      method: 'GET', redirect: 'manual', cache: 'no-store', signal,
      headers: { Origin: ORIGIN, Accept: 'image/png', ...(token ? { 'X-Birdmap-Trial-Token': token } : {}) }
    });
    try {
      if (response.status !== status) fail('PROBE_STATUS_FAILED');
      if (response.headers.get('Cache-Control') !== 'no-store') fail('PROBE_CACHE_FAILED');
      // Cloudflare consumes its own CDN header rather than proxying it downstream.
      for (const h of ['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) if (response.headers.has(h) && response.headers.get(h) !== 'no-store') fail('PROBE_CACHE_FAILED');
      if (response.headers.has('CF-Cache-Status') && !['DYNAMIC', 'BYPASS'].includes(response.headers.get('CF-Cache-Status'))) fail('PROBE_CACHED_RESPONSE');
      const allowed = new Set(['content-type', 'content-length', 'cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control', 'access-control-allow-origin', 'vary', 'x-content-type-options', 'referrer-policy', 'date', 'server', 'cf-ray', 'cf-cache-status', 'report-to', 'nel', 'alt-svc', 'connection', 'transfer-encoding', 'content-encoding', 'server-timing', 'speculation-rules']);
      for (const name of response.headers.keys()) if (!allowed.has(name)) fail('PROBE_HEADER_FAILED');
      const bytes = await bytesLimited(response, status === 200 ? LIMIT : 256);
      if (status === 200 && (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'image/png' || !validPng(bytes))) fail('PROBE_PNG_FAILED');
      if (status !== 200 && bytes.toString('utf8') !== 'tiles_unavailable') fail('PROBE_DENIAL_FAILED');
    } finally { if (response.body && !response.body.locked) await response.body.cancel().catch(() => {}); }
  }
}
