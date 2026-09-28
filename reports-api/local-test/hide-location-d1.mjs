// 위치 가리기를 실제 workerd D1(Miniflare, 메모리 전용)에서 확인한다. 운영 D1 은 건드리지 않는다.
// usage: node reports-api/local-test/hide-location-d1.mjs <wrangler node_modules>
import assert from 'node:assert/strict';
import { localDb, installAuthStubs, environments, input, post, adminPost, ORIGIN } from './helpers.mjs';
import { first } from '../src/canonical/data.js';
import { handleRequest as publicHandler } from '../src/public.js';
import { handleRequest as adminHandler } from '../src/admin.js';

const local = await localDb(process.argv[2]), db = local.db, auth = await installAuthStubs();
const pass = name => console.log('PASS ' + name);
const get = async (env, path) => (await publicHandler(new Request('https://r' + path, { headers: { Origin: ORIGIN } }), env)).text();
const rev = async id => (await first(db, 'SELECT revision FROM checklists WHERE checklist_id=?', id)).revision;
try {
  const { pub, admin } = environments(db), click = { lat: 37.512345, lon: 127.054321 };
  const body = input(951, { ...click, hideLocation: true });
  assert.equal((await post(pub, body)).status, 201);
  const row = await first(db, 'SELECT lat,lon,public_lat,public_lon,approx_lat,approx_lon FROM reports WHERE id=?', body.request_id);
  assert.deepEqual([row.lat, row.lon], [click.lat, click.lon]);
  assert.notDeepEqual([row.public_lat, row.public_lon], [click.lat, click.lon]);
  assert.equal((await first(db, 'SELECT coordinate_policy p FROM checklists WHERE checklist_id=?', body.request_id)).p, 'explicit');
  pass('hidden report: actual kept, public offset, coordinate_policy=explicit');

  const pending = await get(pub, '/reports/pending');
  assert.ok(!pending.includes('37.512345') && !pending.includes('127.054321'));
  assert.ok(JSON.parse(pending).spots.find(s => s.id === body.request_id).locationHidden);
  const res = await adminPost(admin, auth.token, body.request_id, { action: 'approve', request_id: '53000000-0000-4000-8000-000000000951', expected_revision: await rev(body.request_id) });
  assert.equal(res.status, 200, await res.clone().text());
  const approved = await get(pub, '/reports/approved'), red = JSON.parse(approved).spots.find(s => s.id === body.request_id);
  assert.ok(!approved.includes('37.512345') && !approved.includes('127.054321'));
  assert.deepEqual([red.lat, red.lon, red.locationHidden], [row.public_lat, row.public_lon, true]);
  pass('pending and approved public APIs: offset point only, no actual coordinate in response text');

  const list = await (await adminHandler(new Request('https://admin.example/admin/api/reports?status=all', { headers: { 'Cf-Access-Jwt-Assertion': auth.token } }), admin)).json();
  const seen = list.reports.find(r => r.id === body.request_id);
  assert.deepEqual([seen.lat, seen.lon, seen.public_lat, seen.hide_requested], [click.lat, click.lon, row.public_lat, 1]);
  pass('admin list: actual + public coordinate + hide_requested=1 (json_extract on D1)');

  const un = await adminPost(admin, auth.token, body.request_id, { action: 'hide', hide: false, request_id: '53000000-0000-4000-8000-000000000952', expected_revision: await rev(body.request_id) });
  assert.equal(un.status, 200, await un.clone().text());
  assert.equal((await first(db, 'SELECT coordinate_policy p FROM checklists WHERE checklist_id=?', body.request_id)).p, 'actual');
  pass('admin unhide on D1: CAS + coordinate_policy=actual');
} finally {
  auth.restore(); await local.close();
}
