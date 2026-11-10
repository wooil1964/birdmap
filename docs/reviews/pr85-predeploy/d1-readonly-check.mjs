// Read-only production D1 check for PR #85 steps (SELECT/PRAGMA via reports-api/tools/d1-rest.mjs read guard).
// Usage: node d1-readonly-check.mjs <out.json> [baseline.json]
// Prints counts, object names and SQL hashes only. No reporter names, IDs, coordinates, notes or hashes of personal data.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const repo = new URL('../../../', import.meta.url);
const { read, stats, PRODUCTION_DB } = await import(new URL('reports-api/tools/d1-rest.mjs', repo));
const T = { account_id: '1d697c22a32447b386b9fac6a3538597' };
const q = sql => read(T, PRODUCTION_DB, sql);
const h = s => createHash('sha256').update(String(s)).digest('hex');
const IDENTITY = ['reporter_identity_groups', 'reporter_identity_events', 'identity_groups_insert', 'identity_groups_update', 'identity_groups_delete',
  'identity_groups_created', 'identity_groups_revoked', 'identity_events_insert', 'identity_events_update', 'identity_events_delete'];
const objs = await q("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','d1_migrations') ORDER BY type,name");
const existing = objs.filter(o => !IDENTITY.includes(o.name)), identity = objs.filter(o => IDENTITY.includes(o.name));
const [state] = await q('SELECT revision,write_frozen,(SELECT COUNT(*) FROM publication_writer_claim) AS claims FROM public_publication_state WHERE id=1');
const [counts] = await q(`SELECT (SELECT COUNT(*) FROM reports) AS reports,(SELECT COUNT(*) FROM reports WHERE status='approved') AS approved,
 (SELECT COUNT(*) FROM reports WHERE status='pending') AS pending,(SELECT COUNT(*) FROM raw_submissions) AS raw,(SELECT COUNT(*) FROM checklists) AS checklists,
 (SELECT COUNT(*) FROM sightings) AS sightings,(SELECT COUNT(*) FROM reviews) AS reviews`);
const r = { at: new Date().toISOString(),
  existingObjects: existing.length, existingSchemaHash: h(JSON.stringify(existing)),
  writerFence: existing.filter(o => o.type === 'trigger' && o.name.startsWith('writer_fence_')).length,
  identityObjects: identity.map(o => o.name), identitySchemaHash: identity.length ? h(JSON.stringify(identity)) : null,
  ledger: (await q('SELECT name FROM d1_migrations ORDER BY id')).map(x => x.name),
  revision: state.revision, writeFrozen: state.write_frozen, writerClaims: state.claims, counts,
  identityGroups: identity.some(o => o.name === 'reporter_identity_groups') ? (await q('SELECT COUNT(*) AS n,SUM(active) AS active FROM reporter_identity_groups'))[0] : null,
  foreignKeyViolations: (await q('PRAGMA foreign_key_check')).length };
r.d1 = { reads: stats.reads, rowsWrittenByReads: stats.rowsWrittenByReads };
writeFileSync(process.argv[2], JSON.stringify(r, null, 1));
console.log(JSON.stringify(r, null, 1));
if (process.argv[3]) {
  const b = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  for (const k of ['existingObjects', 'existingSchemaHash', 'writerFence', 'revision', 'writeFrozen', 'writerClaims', 'foreignKeyViolations'])
    console.log(b[k] === r[k] ? 'SAME   ' : 'CHANGED', k, b[k], '->', r[k]);
  console.log('ledger added', JSON.stringify(r.ledger.filter(n => !b.ledger.includes(n))), 'identity added', JSON.stringify(r.identityObjects.filter(n => !b.identityObjects.includes(n))));
  for (const k of Object.keys(r.counts)) if (b.counts[k] !== r.counts[k]) console.log('COUNT  ', k, b.counts[k], '->', r.counts[k]);
}
