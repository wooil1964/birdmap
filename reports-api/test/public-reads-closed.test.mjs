// Synthetic only: emergency public-read closure and recovery. No network, no production D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';

const NONCE = 'a'.repeat(32);
async function get(env, path, strict = false) {
  const url = new URL('https://test' + path);
  if (strict) {
    // While closed the head itself is refused; a well-formed stale anchor models an open old page.
    const anchor = (await (await handleRequest(new Request('https://test/reports/public-state?nonce=' + NONCE, {headers:{Origin:ORIGIN}}), env)).json()).publication
      || {epoch:'0'.repeat(32), revision:'1'};
    for (const [k, v] of Object.entries({contract:'publication-v1', nonce:NONCE, expectedEpoch:anchor.epoch, expectedRevision:anchor.revision})) url.searchParams.set(k, v);
  }
  const response = await handleRequest(new Request(url, {headers:{Origin:ORIGIN}}), env);
  return {status:response.status, cache:response.headers.get('Cache-Control'), retry:response.headers.get('Retry-After'), text:await response.text()};
}
const READS = ['/reports/public-state?nonce=' + NONCE, '/reports/approved', '/reports/pending', '/reports/recent-sites?days=30',
  '/reports/site/19?limit=5&offset=0', '/reports/search?q=' + encodeURIComponent('매') + '&offset=0', '/contributors/monthly', '/contributors/all?limit=20&offset=0',
  '/reports/reporter-stats?reporter=' + encodeURIComponent('합성테스터'), '/reports/reporter-species?reporter=' + encodeURIComponent('합성테스터')];

test('public read closure blocks every location/history/search/stat read, keeps submit, status, capability and admin', async t => {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), {pub, admin} = environments(db);
  pub.REPORTS_PUBLICATION_REQUIRED = 'true';
  const body = input(901, {species:'참새', lat:37.523456, lon:127.065432, note:'먹이활동', namePublic:true});
  assert.equal((await post(pub, body)).status, 201);
  const approve = await adminPost(admin, auth.token, body.request_id, {action:'approve', request_id:input(902).request_id, expected_revision:1});
  assert.equal(approve.status, 200, await approve.clone().text());
  const open = await get(pub, '/reports/approved', true);
  assert.equal(open.status, 200);assert.match(open.text, /37\.523456/, 'confirmed nonbreeding marker is public before closure');

  pub.REPORTS_PUBLIC_READS_CLOSED = 'true'; // same object is the admin peer: the whole system sees the closed version
  for (const path of READS) for (const strict of [false, true]) {
    const r = await get(pub, path, strict && !path.startsWith('/reports/public-state'));
    assert.equal(r.status, 503, path);assert.equal(r.cache, 'no-store', path);assert.equal(r.retry, '60', path);
    assert.deepEqual(JSON.parse(r.text).error.code, 'PUBLIC_READS_CLOSED', path);
    assert.doesNotMatch(r.text, /37\.52|127\.06|매|합성테스터/, path);
  }
  // Submissions continue and their receipt carries no marker coordinate.
  const next = input(903, {species:'청둥오리', lat:37.611111, lon:127.122222});
  const accepted = await post(pub, next);
  assert.equal(accepted.status, 201);const receipt = await accepted.text();
  assert.doesNotMatch(receipt, /37\.611|127\.122|"spot"/);
  const status = await get(pub, '/reports/' + next.request_id + '/status');
  assert.equal(status.status, 200);assert.doesNotMatch(status.text, /37\.611|127\.122/);
  assert.equal((await get(pub, '/reports/capabilities')).status, 200);
  // Admin decisions continue through the peer check while public reads are closed.
  const approveNext = await adminPost(admin, auth.token, next.request_id, {action:'approve', request_id:input(904).request_id, expected_revision:1});
  assert.equal(approveNext.status, 200, await approveNext.clone().text());

  // Recovery: same data, normal v2 policy, including the record approved during closure.
  pub.REPORTS_PUBLIC_READS_CLOSED = 'false';
  const reopened = await get(pub, '/reports/approved', true);
  assert.equal(reopened.status, 200);assert.match(reopened.text, /37\.523456/);assert.match(reopened.text, /37\.611111/);
  for (const value of [undefined, '', '1', 'TRUE']) {
    pub.REPORTS_PUBLIC_READS_CLOSED = value;
    assert.equal((await get(pub, '/reports/public-state?nonce=' + NONCE)).status, 200, 'only the exact string true closes');
  }
});

test('closure keeps the v2 protection: unconfirmed protected locations stay hidden after reopening', async () => {
  const db = canonicalDb(), {pub} = environments(db);
  pub.REPORTS_PUBLICATION_REQUIRED = 'true';
  // Approved legacy row with no immutable nonbreeding evidence (trusted fixture write).
  db.sqlite.prepare(`INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,note,site_id,ip_hash,dedupe_hash)
    VALUES('legacy-protected','approved','매',37.533333,127.077777,'2026-09-20','2026-09-20T00:00:00Z','먹이활동','19','synthetic','legacy-protected')`).run();
  db.sqlite.prepare(`INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,note,site_id,ip_hash,dedupe_hash)
    VALUES('legacy-common','approved','청둥오리',37.544444,127.088888,'2026-09-20','2026-09-20T00:00:01Z',NULL,'19','synthetic','legacy-common')`).run();
  pub.REPORTS_PUBLIC_READS_CLOSED = 'true';
  assert.equal((await get(pub, '/reports/approved', true)).status, 503);
  pub.REPORTS_PUBLIC_READS_CLOSED = 'false';
  const r = await get(pub, '/reports/approved', true);
  assert.equal(r.status, 200);assert.doesNotMatch(r.text, /37\.533333|127\.077777/);assert.match(r.text, /37\.544444/, 'positive control: common species stays public');
});

test('production config keeps public reads open by default and documents the switch', () => {
  const toml = readFileSync(new URL('../wrangler.public.toml', import.meta.url), 'utf8');
  assert.match(toml, /^REPORTS_PUBLIC_READS_CLOSED = "false"$/m);
});
