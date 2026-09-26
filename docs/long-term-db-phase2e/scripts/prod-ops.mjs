// Phase 2E operator helpers.
//   node prod-ops.mjs access-token      capture the operator's existing cloudflared Access token for the production
//                                        admin app into .local (never printed). Run `cloudflared access login <url>` first.
//   node prod-ops.mjs seed <capturedAt> POST the 190-site registry plan to /admin/api/ops/seed (Production write:
//                                        needs PHASE2E_PRODUCTION_WRITE_APPROVED; admin must run with REPORTS_OPS_ENABLED)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTarget, assertWriteAllowed } from '../../../reports-api/tools/d1-rest.mjs';
import { prepareSiteSeed } from '../../../reports-api/tools/sites-seed.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)), ROOT = join(HERE, '../../..');
const t = loadTarget(join(HERE, '../targets/production.json')), jwtFile = join(ROOT, t.access_jwt_file);
const toml = readFileSync(join(ROOT, 'reports-api/wrangler.admin.toml'), 'utf8');
const val = k => new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, 'm').exec(toml)?.[1];
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'access-token') {
  const exe = join(ROOT, 'docs/long-term-db-phase2c/.local/cloudflared.exe');
  const r = spawnSync(exe, ['access', 'token', '--app', t.ops_url], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  const token = (r.stdout || '').trim();
  if (r.status !== 0 || token.split('.').length !== 3) { console.log(JSON.stringify({ status: 'NO_TOKEN', next: `cloudflared access login ${t.ops_url}` })); process.exit(2); }
  const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  const checks = { audience: c.aud?.includes(val('ACCESS_AUD')), issuer: c.iss === `https://${val('ACCESS_TEAM_DOMAIN')}.cloudflareaccess.com`, email: val('ADMIN_EMAILS').split(',').map(s => s.trim().toLowerCase()).includes(String(c.email).toLowerCase()), unexpired: c.exp > Date.now() / 1000 };
  if (!Object.values(checks).every(Boolean)) { console.log(JSON.stringify({ status: 'TOKEN_SCOPE_MISMATCH', checks })); process.exit(2); }
  writeFileSync(jwtFile, token + '\n');
  console.log(JSON.stringify({ status: 'CAPTURED', checks, expires_at: new Date(c.exp * 1000).toISOString(), token_printed: false }));
} else if (cmd === 'seed') {
  if (!arg || !Number.isFinite(Date.parse(arg))) throw Error('usage: seed <capturedAt ISO>');
  assertWriteAllowed(t, t.database_id);
  const plan = await prepareSiteSeed(readFileSync(join(ROOT, 'index.html'), 'utf8'), { capturedAt: arg });
  const jwt = readFileSync(jwtFile, 'utf8').trim();
  const r = await fetch(t.ops_url + '/admin/api/ops/seed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt }, body: JSON.stringify(plan) });
  const body = await r.json().catch(() => ({}));
  console.log(JSON.stringify({ status: r.status, ok: body.ok, state: body.state, added: body.added, code: body.error?.code, registry_revision: plan.registry_revision, sites: plan.source_count }));
  process.exitCode = r.status === 200 && body.ok ? 0 : 1;
} else throw Error('usage: access-token | seed <capturedAt>');
