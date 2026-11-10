// Read-only public API snapshot (the same GETs a map visitor makes). No auth, no writes.
// Usage: node public-smoke.mjs <out.json> [baseline.json]
// With a baseline it prints the diff used by the PR #85 GO/NO-GO checks.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const B = 'https://birdmap-reports.wooil-birdmap.workers.dev', H = { Origin: 'https://wooil1964.github.io' };
const nonce = () => randomBytes(16).toString('hex');
const get = async path => { const r = await fetch(B + path, { headers: H, cache: 'no-store' }); return { status: r.status, body: await r.json().catch(() => null) }; };
const head = await get('/reports/public-state?nonce=' + nonce());
const a = head.body?.publication;
const q = p => `${p}${p.includes('?') ? '&' : '?'}contract=publication-v1&nonce=${nonce()}&expectedEpoch=${a?.epoch}&expectedRevision=${a?.revision}`;
const approved = await get(q('/reports/approved')), contributors = await get(q('/contributors/all')), pending = await get(q('/reports/pending'));
const spots = approved.body?.spots || [], history = spots.flatMap(s => s.history || []);
const keys = new Set(); const walk = o => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v); } }; walk(approved.body); walk(contributors.body); walk(pending.body);
const FORBIDDEN = ['admin_note', 'ip_hash', 'dedupe_hash', 'evidence', 'confirmed_by', 'representative_id', 'report_ids', 'group_id', 'groupId', 'revoked_by', 'actor'];
const species = new Set([...spots.flatMap(s => s.species || []), ...history.flatMap(h => h.species || [])]);
const sightings = history.flatMap(h => h.sightings || []);
// Public coordinates fingerprint only (no coordinates printed): species parsing must not move any marker.
const coordHash = createHash('sha256').update(JSON.stringify([...spots, ...(pending.body?.spots || [])].map(s => [s.id, s.lat, s.lon, !!s.locationHidden, !!s.approximate]))).digest('hex');
const snap = { at: new Date().toISOString(), status: { head: head.status, approved: approved.status, contributors: contributors.status, pending: pending.status },
  pendingSpots: (pending.body?.spots || []).length, coordHash,
  publication: a && { contract: a.contract, projection: a.projection, revision: a.revision },
  spots: spots.length, historyEntries: history.length, locationHidden: spots.filter(s => s.locationHidden).length,
  distinctSpecies: species.size, species: [...species].sort(),
  knownIndividuals: sightings.filter(s => s.countStatus === 'reported').reduce((n, s) => n + s.count, 0),
  contributors: { approvedReports: contributors.body?.approvedReports, publicContributors: contributors.body?.publicContributors,
    list: (contributors.body?.contributors || []).map(c => c.count).join(',') },
  forbiddenKeysFound: FORBIDDEN.filter(k => keys.has(k)) };
writeFileSync(process.argv[2], JSON.stringify(snap, null, 1));
const { species: _s, ...summary } = snap; console.log(JSON.stringify(summary));
if (process.argv[3]) {
  const base = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  console.log('removedSpecies', JSON.stringify(base.species.filter(s => !species.has(s))));
  console.log('addedSpecies', JSON.stringify([...species].filter(s => !base.species.includes(s))));
  for (const k of ['spots', 'historyEntries', 'locationHidden', 'pendingSpots', 'coordHash', 'distinctSpecies', 'knownIndividuals']) console.log(k, base[k], '->', snap[k]);
  console.log('contributors', JSON.stringify(base.contributors) === JSON.stringify(snap.contributors) ? 'SAME' : 'CHANGED');
}
