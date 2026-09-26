// STAGING-ONLY wrapper around the Phase 2C staging entry (unchanged, same test-token boundary).
// Adds: X-Phase2D1-Db: rehearsal -> the real public/admin handlers run against the backfill rehearsal D1,
// and a few synthetic-only state/reset operations for that rehearsal database.
import phase2c from '../../long-term-db-phase2c/scripts/staging-worker.mjs';
import { rows, first, insert, fingerprint } from '../../../reports-api/src/canonical/data.js';

const DB_ID = 'f2c65357-47fc-4f09-82c6-ad0d28f8314f';
const TABLES = ['reviews', 'sightings', 'checklists', 'raw_submissions', 'audit_log', 'backfill_runs', 'transaction_assertions', 'reports', 'sites'];
const synthetic = r => /^0{8}-0000-4000-8000-\d{12}$/.test(r.id) && String(r.ip_hash).startsWith('synthetic-');
async function op(input, env) {
  const db = input.db === 'rehearsal' ? env.REHEARSAL_DB : env.REPORTS_DB;
  switch (input.op) {
    case 'state': {
      const out = { system_state: await first(db, 'SELECT mode,generation,reason FROM system_state WHERE id=1'), counts: {} };
      for (const t of TABLES) out.counts[t] = (await first(db, `SELECT COUNT(*) n FROM ${t}`)).n;
      if (await first(db, "SELECT 1 x FROM sqlite_schema WHERE name='captcha_redemptions'")) out.counts.captcha_redemptions = (await first(db, 'SELECT COUNT(*) n FROM captcha_redemptions')).n;
      out.reportsDigest = await fingerprint(await rows(db, 'SELECT * FROM reports ORDER BY id'));
      out.triggers = await rows(db, "SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name IN ('reports','system_state') ORDER BY name");
      return out;
    }
    case 'rows': return rows(db, 'SELECT id,status,species,pending_public,site_id,name_public,spot_key FROM reports WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id', JSON.stringify(input.ids));
    case 'rehearsal-reset': {
      if (input.db !== 'rehearsal' || !env.REHEARSAL_DB) throw Error('REHEARSAL_ONLY');
      const s = await first(db, 'SELECT mode FROM system_state WHERE id=1');
      if (s?.mode !== 'NORMAL') throw Error('RESET_REQUIRES_NORMAL');
      if ((await rows(db, 'SELECT id,ip_hash FROM reports')).some(r => !synthetic(r))) throw Error('SYNTHETIC_ONLY');
      await db.batch(TABLES.map(t => db.prepare(`DELETE FROM ${t}`))); return { reset: true };
    }
    case 'rehearsal-load': {
      if (input.db !== 'rehearsal' || !env.REHEARSAL_DB || !input.reports.every(synthetic)) throw Error('SYNTHETIC_REHEARSAL_ONLY');
      await db.batch(input.reports.map(r => insert(db, 'reports', r))); return { added: input.reports.length };
    }
    default: throw Error('UNKNOWN_OPERATION');
  }
}
export default { async fetch(request, env, ctx) {
  if (env.ENVIRONMENT !== 'staging' || env.PHASE2C_DATABASE_ID !== DB_ID) return new Response('Not found', { status: 404 });
  const path = new URL(request.url).pathname, authed = env.PHASE2C_TEST_TOKEN && request.headers.get('X-Phase2C-Test') === env.PHASE2C_TEST_TOKEN;
  if (path === '/_phase2d1' && request.method === 'POST') {
    if (!authed) return new Response('Not found', { status: 404 });
    try { return Response.json({ ok: true, value: await op(await request.json(), env) }); } catch (e) { return Response.json({ ok: false, message: String(e.message).slice(0, 400) }, { status: 500 }); }
  }
  if (authed && request.headers.get('X-Phase2D1-Db') === 'rehearsal' && env.REHEARSAL_DB) return phase2c.fetch(request, { ...env, REPORTS_DB: env.REHEARSAL_DB }, ctx);
  return phase2c.fetch(request, env, ctx);
} };
