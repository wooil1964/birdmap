// Phase 2D.1 staging control. Every Wrangler call is allowlisted and every config is checked to
// reference staging resources only. Production IDs anywhere in a config abort before Wrangler runs.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ACCOUNT = '1d697c22a32447b386b9fac6a3538597';
export const STAGING_DB = 'f2c65357-47fc-4f09-82c6-ad0d28f8314f', STAGING_DB_NAME = 'birdmap-reports-staging';
export const PRODUCTION_DB = 'b48201cc-0abd-4a64-bb61-9dd2a7813d21';
export const WORKERS = { public: 'birdmap-reports-staging-public', admin: 'birdmap-reports-staging-admin' };
export const NAMES = { rehearsal: 'birdmap-backfill-rehearsal-staging', ledger: 'birdmap-safety-ledger-staging' };
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const LOCAL = fileURLToPath(new URL('../.local/', import.meta.url));
export const P2C = join(ROOT, 'docs/long-term-db-phase2c/.local');
const CLI = join(process.env.LOCALAPPDATA, 'npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/bin/wrangler.js');
mkdirSync(LOCAL, { recursive: true });

export const resources = () => existsSync(join(LOCAL, 'resources.json')) ? JSON.parse(readFileSync(join(LOCAL, 'resources.json'), 'utf8')) : {};
export function saveResources(r) { writeFileSync(join(LOCAL, 'resources.json'), JSON.stringify(r, null, 2) + '\n'); }
export function target(kind = 'main') {
  const r = resources();
  return { name: 'staging-' + kind, environment: 'staging', account_id: ACCOUNT, database_id: kind === 'main' ? STAGING_DB : r.rehearsal_db,
    ledger_database_id: r.ledger_db, workers: [WORKERS.public, WORKERS.admin],
    ops_url: `https://${WORKERS.admin}.wooil-birdmap.workers.dev`, access_jwt_file: join(P2C, 'staging-access-jwt.txt'), extra_headers_file: join(LOCAL, 'staging-headers.json') };
}
export function writeTargets() {
  const secret = JSON.parse(readFileSync(join(P2C, 'staging-secrets.json'), 'utf8')).PHASE2C_TEST_TOKEN;
  writeFileSync(join(LOCAL, 'staging-headers.json'), JSON.stringify({ 'X-Phase2C-Test': secret, 'X-Phase2D1-Db': 'rehearsal' }));
  for (const k of ['main', 'rehearsal']) writeFileSync(join(LOCAL, `target.${k}.json`), JSON.stringify(target(k), null, 2) + '\n');
}
function guardConfig(cfg) {
  const text = JSON.stringify(cfg), r = resources();
  const allowedDbs = new Set([STAGING_DB, r.rehearsal_db, r.ledger_db].filter(Boolean));
  if (text.includes(PRODUCTION_DB) || /"birdmap-reports(-admin)?"/.test(text) || cfg.account_id !== ACCOUNT || cfg.routes?.length) throw Error('STAGING_GUARD');
  if ((cfg.d1_databases || []).some(d => !allowedDbs.has(d.database_id))) throw Error('STAGING_DB_GUARD');
  if (cfg.name && !Object.values(WORKERS).includes(cfg.name)) throw Error('STAGING_WORKER_GUARD');
}
export function wrangler(args, cfgPath, label, input) {
  if (cfgPath) guardConfig(JSON.parse(readFileSync(cfgPath, 'utf8')));
  const s = args.join(' '), names = Object.values(NAMES).join('|');
  const ok = (args[0] === 'deploy' && cfgPath) || (/^secret put (TURNSTILE_SECRET_KEY|REPORT_IP_SALT)$/.test(s) && cfgPath && JSON.parse(readFileSync(cfgPath, 'utf8')).name === WORKERS.public) || new RegExp(`^d1 create (${names})$`).test(s) ||
    new RegExp(`^d1 migrations apply (${names}|${STAGING_DB_NAME}) --remote$`).test(s) ||
    new RegExp(`^d1 time-travel info ${STAGING_DB_NAME}( --timestamp \\S+)? --json$`).test(s) ||
    new RegExp(`^d1 time-travel restore ${STAGING_DB_NAME} --bookmark [0-9a-f-]{20,100}( --json)?$`).test(s);
  if (!ok) throw Error('COMMAND_NOT_IN_STAGING_ALLOWLIST ' + s);
  const r = spawnSync(process.execPath, [CLI, ...args, ...(cfgPath ? ['--config', cfgPath] : [])], { cwd: ROOT, encoding: 'utf8', windowsHide: true, input: input ?? 'y\n', timeout: 180000, maxBuffer: 64e6,
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(LOCAL, label + '.debug.log') } });
  writeFileSync(join(LOCAL, label + '.log'), (r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) throw Error('WRANGLER_FAILED ' + label + ': ' + (r.stderr || r.stdout || '').slice(-1200));
  return r.stdout;
}
// Hard maintenance barrier: workers.dev + preview URLs off/on for a staging Worker (Cloudflare API, outside D1).
export async function setIngress(role, enabled) {
  const name = WORKERS[role]; if (!name) throw Error('STAGING_WORKER_GUARD');
  const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8'))?.[1];
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${name}/subdomain`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, previews_enabled: false }) });
  const j = await r.json(); if (!r.ok || !j.success) throw Error('INGRESS_CHANGE_FAILED ' + r.status + ' ' + JSON.stringify(j.errors));
  return j.result;
}
// Migration config per database; copies only the files that belong to it.
export function migrationConfig(kind) {
  const r = resources(), dir = join(LOCAL, 'migrations-' + kind); mkdirSync(dir, { recursive: true });
  const files = kind === 'ledger' ? [[join(ROOT, 'docs/long-term-db-phase2d1/migrations/ledger/0001_safety_ledger.sql'), '0001_safety_ledger.sql']] : [
    [join(ROOT, 'reports-api/schema.sql'), '0000_legacy.sql'], [join(ROOT, 'docs/long-term-db-phase2a/migrations/0001_core.sql'), '0001_core.sql'],
    [join(ROOT, 'docs/long-term-db-phase2d1/migrations/0002_system_state.sql'), '0002_system_state.sql'],
    ...(kind === 'main' ? [[join(ROOT, 'docs/long-term-db-phase2d1/migrations/0003_captcha_redemptions.sql'), '0003_captcha_redemptions.sql']] : [])];
  for (const [from, to] of files) copyFileSync(from, join(dir, to));
  const db = kind === 'main' ? [STAGING_DB_NAME, STAGING_DB] : kind === 'rehearsal' ? [NAMES.rehearsal, r.rehearsal_db] : [NAMES.ledger, r.ledger_db];
  if (!db[1]) throw Error('RESOURCE_MISSING ' + kind);
  const cfg = { name: WORKERS.admin, account_id: ACCOUNT, compatibility_date: '2026-07-03', workers_dev: false, routes: [], d1_databases: [{ binding: 'DB', database_name: db[0], database_id: db[1], migrations_dir: 'migrations-' + kind }] };
  const path = join(LOCAL, `wrangler.migrate-${kind}.json`); writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n'); return { path, name: db[0] };
}
// Worker config derived from the Phase 2C staging config (read only), pointing at the Phase 2D.1 wrapper.
export function workerConfig(role, mode, extraVars = {}) {
  const base = JSON.parse(readFileSync(join(P2C, `wrangler.${role}.json`), 'utf8')), r = resources();
  const cfg = { ...base, main: '../scripts/staging-worker.mjs', preview_urls: false, workers_dev: true,
    vars: { ...base.vars, REPORTS_WRITE_MODE: mode, REPORTS_DUAL_WRITE_ENABLED: mode === 'NORMAL' ? 'false' : 'true', ...extraVars },
    d1_databases: [...base.d1_databases, ...(r.rehearsal_db ? [{ binding: 'REHEARSAL_DB', database_name: NAMES.rehearsal, database_id: r.rehearsal_db }] : [])] };
  if (role === 'admin') cfg.vars.REPORTS_OPS_ENABLED = 'true';
  const path = join(LOCAL, `wrangler.${role}.json`); writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n'); return path;
}
export function deploy(role, mode, extraVars = {}, label) {
  const out = wrangler(['deploy'], workerConfig(role, mode, extraVars), label || `deploy-${role}-${mode}-${Date.now()}`);
  const version = /Current Version ID:\s*([0-9a-f-]+)/i.exec(out)?.[1];
  const log = join(LOCAL, 'deployments.json'), history = existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [];
  history.push({ at: new Date().toISOString(), worker: WORKERS[role], mode, version, extraVars, production_changed: false });
  writeFileSync(log, JSON.stringify(history, null, 2) + '\n');
  return version;
}
