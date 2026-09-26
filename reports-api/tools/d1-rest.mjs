// Cloudflare D1 REST client for operator CLIs. Credentials come from the local Wrangler login; never printed.
// Reads are guarded to SELECT/PRAGMA-read and must report rows_written=0.
// Any write to the Production database requires PHASE2E_PRODUCTION_WRITE_APPROVED=<production database id>.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PRODUCTION_DB = 'b48201cc-0abd-4a64-bb61-9dd2a7813d21';
const READ = /^\s*(SELECT|PRAGMA\s+(table_info|table_xinfo|foreign_key_check|index_list))\b/i;
const MUTATING = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|ATTACH|DETACH|VACUUM|REINDEX)\b/i;

export function loadTarget(path) {
  const t = JSON.parse(readFileSync(path, 'utf8'));
  for (const k of ['name', 'account_id', 'database_id']) if (typeof t[k] !== 'string' || !t[k]) throw Error('TARGET_INVALID ' + k);
  return t;
}
function headers() {
  const auth = readFileSync(join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(auth)?.[1];
  if (!token) throw Error('LOGIN_REQUIRED');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
async function call(account, database, sql, params) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, { method: 'POST', headers: headers(), body: JSON.stringify({ sql, params }) });
  const j = await r.json();
  if (!r.ok || !j.success || j.result.some(v => !v.success)) { const e = Error('D1_QUERY_FAILED ' + r.status + ' ' + JSON.stringify(j.errors?.map(x => x.message))); e.d1Errors = j.errors; throw e; }
  return j.result[0];
}
export async function apiGet(target, path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account_id}${path}`, { headers: headers() });
  const j = await r.json();
  if (!r.ok || !j.success) throw Error('API_READ_FAILED ' + r.status);
  return j.result;
}
// Hard maintenance barrier outside the main D1: no ingress to any version of the target Workers.
export async function ingressClosed(target) {
  const domains = await apiGet(target, '/workers/domains');
  const result = {};
  for (const w of target.workers || []) {
    const s = await apiGet(target, `/workers/scripts/${w}/subdomain`);
    result[w] = { workers_dev: s.enabled, previews: s.previews_enabled, custom_domains: domains.filter(d => d.service === w).length };
  }
  return { closed: (target.workers || []).length > 0 && Object.values(result).every(v => v.workers_dev === false && v.previews === false && v.custom_domains === 0), workers: result };
}
export const stats ={ reads: 0, writes: 0, rowsWrittenByReads: 0 };
export async function read(target, database, sql, params = []) {
  if (!READ.test(sql) || MUTATING.test(sql.replace(/'[^']*'/g, "''"))) throw Error('READ_ONLY_SQL_GUARD');
  const v = await call(target.account_id, database, sql, params);
  stats.reads++; stats.rowsWrittenByReads += v.meta?.rows_written ?? 0;
  if (v.meta?.rows_written !== 0 || v.meta?.changed_db !== false) throw Error('READ_CHANGED_DATABASE');
  return v.results;
}
export function assertWriteAllowed(target, database) {
  if ((database === PRODUCTION_DB || target.environment !== 'staging') && process.env.PHASE2E_PRODUCTION_WRITE_APPROVED !== PRODUCTION_DB) throw Error('PRODUCTION_WRITE_NOT_APPROVED');
}
// REST batch: D1 executes the statements sequentially without interleaving other queries.
// Atomic rollback of a REST batch is NOT documented, so callers must only send batches that are
// safe if cut short (here: one UPDATE followed by reads).
export async function writeBatch(target, database, statements) {
  assertWriteAllowed(target, database);
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account_id}/d1/database/${database}/query`, { method: 'POST', headers: headers(), body: JSON.stringify({ batch: statements.map(([sql, params = []]) => ({ sql, params })) }) });
  const j = await r.json();
  if (!r.ok || !j.success || j.result.some(v => !v.success)) throw Error('D1_BATCH_FAILED ' + r.status + ' ' + JSON.stringify(j.errors?.map(x => x.message)));
  stats.writes++;
  return j.result;
}
export async function write(target, database, sql, params = []) {
  assertWriteAllowed(target, database);
  const v = await call(target.account_id, database, sql, params);
  stats.writes++;
  return v;
}
