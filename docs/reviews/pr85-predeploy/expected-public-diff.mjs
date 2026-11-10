// Read-only: one SELECT identical to /reports/approved, then main vs PR publicPayload locally. Aggregates only.
// Usage (Git Bash): git archive <liveSHA> reports-api/src | tar -x -C <A>; git archive <newSHA> reports-api/src | tar -x -C <B>
//   node expected-public-diff.mjs <repo> <A> <B>   -> expected public distinct species / known individuals / marker identity.
import { pathToFileURL } from 'node:url';
const [repo, mainDir, prDir] = process.argv.slice(2);
const { read, stats, PRODUCTION_DB } = await import(pathToFileURL(repo + '/reports-api/tools/d1-rest.mjs'));
const env = { REPORTS_WRITE_MODE: 'CANONICAL_DUAL_WRITE', REPORTS_PUBLICATION_REQUIRED: 'true' };
const T = { account_id: '1d697c22a32447b386b9fac6a3538597' };
const out = {};
let rows;
for (const [name, dir] of [['main', mainDir], ['pr', prDir]]) {
  const S = await import(pathToFileURL(dir + '/reports-api/src/shared.js'));
  const L = await import(pathToFileURL(dir + '/reports-api/src/location-evidence.js'));
  const sql = `SELECT id,species,note,lat,lon,public_lat,public_lon,observed_on,reporter,name_public,spot_key,${L.locationEvidenceColumns(env)},${S.identifiedSpeciesSql(env, true)} FROM reports WHERE status='approved' ORDER BY observed_on DESC,received_at DESC`;
  rows = await read(T, PRODUCTION_DB, sql);
  const p = S.publicPayload(rows);
  const spots = p.spots || [], history = spots.flatMap(s => s.history || []);
  const species = new Set([...spots.flatMap(s => s.species || []), ...history.flatMap(h => h.species || [])]);
  out[name] = { spots: spots.length, history: history.length, locationHidden: spots.filter(s => s.locationHidden).length, distinct: species.size, species,
    known: history.flatMap(h => h.sightings || []).filter(s => s.countStatus === 'reported').reduce((n, s) => n + s.count, 0),
    coords: JSON.stringify(spots.map(s => [s.lat, s.lon, !!s.locationHidden])) };
}
console.log(JSON.stringify({
  main: { ...out.main, species: undefined, coords: undefined }, pr: { ...out.pr, species: undefined, coords: undefined },
  removed: [...out.main.species].filter(s => !out.pr.species.has(s)), added: [...out.pr.species].filter(s => !out.main.species.has(s)),
  publicCoordinatesIdentical: out.main.coords === out.pr.coords, d1: stats }, null, 1));
