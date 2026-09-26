// Pending-marker coordinate policy on the production (dual-write, non-breeding confirmed) path. Local ephemeral D1.
// usage: node docs/long-term-db-phase2e/scripts/local-coordinate-policy.mjs <wrangler node_modules>
import assert from 'node:assert/strict';
import { localDb, installAuthStubs, environments, input, post, adminPost, ORIGIN } from '../../../reports-api/local-test/helpers.mjs';
import { first, insert, canonicalProjection, stable } from '../../../reports-api/src/canonical/data.js';
import { handleRequest as publicHandler } from '../../../reports-api/src/public.js';

const local = await localDb(process.argv[2]), db = local.db, auth = await installAuthStubs();
const pass = name => console.log('PASS ' + name);
const get = async (env, path) => (await publicHandler(new Request('https://r' + path, { headers: { Origin: ORIGIN } }), env)).json();
const counts = async () => Object.values(await first(db, 'SELECT (SELECT COUNT(*) FROM reports) a,(SELECT COUNT(*) FROM raw_submissions) b,(SELECT COUNT(*) FROM checklists) c,(SELECT COUNT(*) FROM sightings) d,(SELECT COUNT(*) FROM captcha_redemptions) e')).join('/');
try {
  const { pub, admin } = environments(db);
  // pre-existing legacy pending row with an old offset public coordinate: must stay as it is
  await insert(db, 'reports', { id: '00000000-0000-4000-8000-000000000777', status: 'pending', species: '기존대기', lat: 37.3, lon: 127.3, public_lat: null, public_lon: null, approx_lat: 37.32, approx_lon: 127.33, pending_public: 1, observed_on: '2026-09-20', received_at: '2026-09-20T00:00:00.000Z', decided_at: null, bird_count: null, reporter: null, note: null, admin_note: null, site_id: null, name_public: 0, spot_key: null, ip_hash: 'h', dedupe_hash: 'legacy-777' }).run();

  const click = { lat: 37.512345, lon: 127.054321 }, body = input(901, click);
  const r = await post(pub, body), accepted = await r.json();
  assert.equal(r.status, 201);
  const row = await first(db, 'SELECT lat,lon,approx_lat,approx_lon,pending_public FROM reports WHERE id=?', body.request_id);
  assert.deepEqual([row.lat, row.lon], [click.lat, click.lon]);
  assert.deepEqual([row.approx_lat, row.approx_lon], [click.lat, click.lon]);
  assert.deepEqual([accepted.spot.lat, accepted.spot.lon, accepted.spot.approximate], [click.lat, click.lon, false]);
  const spot = (await get(pub, '/reports/pending')).spots.find(s => s.id === body.request_id);
  assert.deepEqual([spot.lat, spot.lon, spot.approximate], [click.lat, click.lon, false]);
  pass('non-breeding report: clicked = stored actual = public yellow marker (receipt and GET /reports/pending), approximate=false');

  const old = (await get(pub, '/reports/pending')).spots.find(s => s.id === '00000000-0000-4000-8000-000000000777');
  assert.deepEqual([old.lat, old.lon, old.approximate], [37.32, 127.33, true]);
  pass('pre-existing pending row keeps its stored public coordinate (no data rewrite), still labelled approximate');

  assert.deepEqual(await (await post(pub, { ...body, turnstileToken: 'other' })).json(), accepted);
  pass('same request_id replay: identical receipt (exact coordinate, approximate=false)');

  const rev = (await first(db, 'SELECT revision FROM checklists WHERE checklist_id=?', body.request_id)).revision;
  const ap = await adminPost(admin, auth.token, body.request_id, { action: 'approve', request_id: '53000000-0000-4000-8000-000000000901', expected_revision: rev });
  assert.equal(ap.status, 200);
  const red = (await get(pub, '/reports/approved')).spots.find(s => s.id === body.request_id);
  assert.deepEqual([red.lat, red.lon], [click.lat, click.lon]);
  assert.equal((await get(pub, '/reports/pending')).spots.some(s => s.id === body.request_id), false);
  pass('after approval the red dot uses the same actual coordinate; yellow marker removed');

  for (const bad of [{ non_breeding_confirmed: undefined }, { non_breeding_confirmed: false }, { non_breeding_confirmed: 'true' }]) {
    const before = await counts(), b = input(902 + Object.keys(bad).length, { ...bad, lat: 37.4, lon: 127.4 });
    if (bad.non_breeding_confirmed === undefined) delete b.non_breeding_confirmed;
    const res = await post(pub, b);
    assert.equal(res.status, 400); assert.equal((await res.json()).error.code, 'NON_BREEDING_CONFIRMATION_REQUIRED');
    assert.equal(await counts(), before);
  }
  pass('breeding-related (no explicit non-breeding confirmation) refused before storage: 400, nothing written');

  for (const [n, species] of [[911, '저어새'], [912, '두루미'], [913, '넓적부리도요']]) {
    const b = input(n, { species, lat: 36.8 + n / 10000, lon: 126.6 });
    const res = await post(pub, b), acc = await res.json();
    assert.equal(res.status, 201);
    const s = await first(db, 'SELECT lat,lon,approx_lat,approx_lon,pending_public FROM reports WHERE id=?', b.request_id);
    assert.equal(s.pending_public, 1);
    assert.deepEqual([s.approx_lat, s.approx_lon, acc.spot.lat, acc.spot.lon, acc.spot.approximate], [s.lat, s.lon, s.lat, s.lon, false]);
  }
  pass('rare/protected species names (저어새·두루미·넓적부리도요) with confirmation: accepted, published, exact coordinate — no species-based breeding inference or offset');

  for (const id of [body.request_id]) assert.equal(stable(await first(db, canonicalProjection + ' AND checklist_id=?', id)), stable(await first(db, 'SELECT * FROM reports WHERE id=?', id)));
  pass('canonical projection == reports row (22 fields)');
} finally { auth.restore(); await local.close(); }
