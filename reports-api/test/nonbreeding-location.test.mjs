import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalDb, fakeDb, publicEnv, ORIGIN as HEADERS } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import { quickInput, replayQuick } from '../src/canonical/persistence.js';
import { reportBreedingStatus, isLocationRestricted } from '../src/shared.js';
import { schemaReady } from '../src/canonical/control.js';

async function get(env, path, strict = false, anchor) {
  if (strict) {
    anchor ??= (await get(env, '/reports/public-state?nonce=' + 'a'.repeat(32))).body.publication;
    const url = new URL('https://test' + path);
    for (const [k,v] of Object.entries({contract: 'publication-v1', nonce: 'a'.repeat(32), expectedEpoch: anchor.epoch, expectedRevision: anchor.revision})) url.searchParams.set(k,v);
    path = url.pathname + url.search;
  }
  const response = await handleRequest(new Request('https://test' + path, {headers: HEADERS}), env);
  return {status: response.status, body: await response.json()};
}
async function setup(t) {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), env = environments(db);
  return {db, ...env, token: auth.token};
}
async function approve(s, body, n) {
  const response = await adminPost(s.admin, s.token, body.request_id, {action:'approve', request_id:input(n).request_id, expected_revision:1});
  assert.equal(response.status, 200, await response.clone().text());
}

test('three states: only matching immutable explicit evidence confirms nonbreeding', () => {
  const original = input(401, {species:'매', note:'먹이활동', birdCount:0});
  const row = {species:'매', lat:original.lat, lon:original.lon, observed_on:original.observedOn, note:original.note,
    non_breeding_confirmed:1, location_input:JSON.stringify(original)};
  assert.equal(reportBreedingStatus(row), 'non_breeding');
  assert.equal(isLocationRestricted(row), false);
  const nonbreeding = {...original,note:'비번식 확인, non-breeding bird'};
  assert.equal(reportBreedingStatus({...row,note:nonbreeding.note,location_input:JSON.stringify(nonbreeding)}),'non_breeding');
  assert.equal(isLocationRestricted({...row,note:nonbreeding.note,non_breeding_confirmed:null}),true);
  for (const value of [undefined, null, 0, false, true, '1', 'true']) {
    assert.equal(reportBreedingStatus({...row, non_breeding_confirmed:value}), 'unknown');
    assert.equal(isLocationRestricted({...row, non_breeding_confirmed:value}), true);
  }
  for (const patch of [{lat:37.2}, {lon:127.2}, {species:'참매'}, {observed_on:'2020-01-01'}, {note:'수정 내용'}, {location_input:'broken'}]) {
    assert.equal(reportBreedingStatus({...row,...patch}), 'unknown');
  }
  for (const note of ['둥지', '새끼', '번식지', '포란', '육추', 'nest with chicks', 'breeding site']) {
    assert.equal(reportBreedingStatus({...row,note}), 'breeding');
    assert.throws(() => quickInput({...original,note}), {code:'BREEDING_REPORT_NOT_ALLOWED'});
  }
  for (const value of [undefined, null, false, 1, 'true']) assert.throws(() => quickInput({...original,non_breeding_confirmed:value}), {code:'NON_BREEDING_CONFIRMATION_REQUIRED'});
});

test('confirmed 매 / Falco peregrinus: pending and approved public coordinates, consent and strict snapshots', async t => {
  const s = await setup(t);
  for (const [i,species] of ['매', 'Falco peregrinus', '매, 청둥오리'].entries()) {
    const body = input(410+i, {species, lat:Number((37.512345+i/100).toFixed(6)), lon:127.054321, note:'먹이활동', namePublic:false});
    assert.equal((await post(s.pub,body)).status,201);
    for (const strict of [false,true]) {
      const yellow = (await get(s.pub,'/reports/pending',strict)).body.spots.find(x=>x.id===body.request_id);
      assert.equal(yellow.lat,body.lat); assert.equal(yellow.lon,body.lon);
    }
    await approve(s,body,420+i);
    for (const strict of [false,true]) {
      const response = await get(s.pub,'/reports/approved',strict);
      const red = response.body.spots.find(x=>x.id===body.request_id);
      assert.equal(red.lat,body.lat); assert.equal(red.history[0].reporter,undefined);
      const raw = JSON.stringify(response.body);
      for (const secret of ['location_input','non_breeding_confirmed','합성테스터','먹이활동','ip_hash']) assert.equal(raw.includes(secret),false,secret);
    }
    const search = (await get(s.pub,'/reports/search?q='+encodeURIComponent(species.split(',')[0]),true)).body;
    assert.ok(search.reports.some(x=>x.id===body.request_id && x.target?.spotId===body.request_id));
  }
  assert.equal(await schemaReady(s.db),true,'canonical schema hash unchanged');
});

test('confirmed protected hideLocation: stable masked point remains masked before and after approval', async t => {
  const s = await setup(t), body = input(430, {species:'매', hideLocation:true, note:'이동 관찰', lat:37.512345,lon:127.054321});
  const receipt = await (await post(s.pub,body)).json();
  assert.notEqual(receipt.spot.lat,body.lat);
  for (const strict of [false,true]) assert.equal((await get(s.pub,'/reports/pending',strict)).body.spots[0].lat,receipt.spot.lat);
  await approve(s,body,431);
  for (const strict of [false,true]) {
    const red = (await get(s.pub,'/reports/approved',strict)).body.spots[0];
    assert.equal(red.lat,receipt.spot.lat); assert.equal(red.locationHidden,true);
    assert.ok(!JSON.stringify(red).includes(String(body.lat)));
  }
  const result = (await get(s.pub,'/reports/search?q='+encodeURIComponent('매'),true)).body.reports[0];
  assert.equal(result.locationHidden,true); assert.equal(result.target,undefined);
});

test('unknown protected and breeding rows: approval, pending_public and fixed/root/site links cannot expose location', async () => {
  const rows = ['매','매 2마리','Falco peregrinus','falco peregrinus 2','매 (Falco peregrinus)','매(Falco peregrinus) 2마리','Peregrine Falcon','매 · 청둥오리'].map((species,i)=>({id:'unknown-'+i,status:'approved',species,lat:37.5,lon:127.5,site_id:'19'}));
  rows.push({id:'nest',status:'approved',species:'청둥오리',note:'새끼 둥지',lat:37.5,lon:127.5,site_id:'19'},
    {id:'pending',species:'매',pending_public:1,approx_lat:37.6,approx_lon:127.6,lat:37.5,lon:127.5},
    {id:'root',status:'approved',species:'갈매기',lat:37.1,lon:127.1},
    {id:'linked',status:'approved',species:'매',spot_key:'root',lat:37.5,lon:127.5},
    {id:'fixed',status:'approved',species:'매',spot_key:'fixed:19:1',lat:37.5,lon:127.5},
    {id:'hidden-site',status:'approved',species:'청둥오리',site_id:'19',public_lat:37.6,public_lon:127.6,lat:37.5,lon:127.5});
  const env = publicEnv(fakeDb(rows));
  for (const strict of [false,true]) {
    const approved = (await get(env,'/reports/approved',strict)).body;
    assert.deepEqual(approved.spots.map(x=>x.id).sort(),['hidden-site','root']);
    assert.deepEqual(approved.spots.find(x=>x.id==='root').species,['갈매기']);
    assert.deepEqual(approved.fixedSpots,{});
    assert.deepEqual((await get(env,'/reports/pending',strict)).body.spots,[]);
    const site = (await get(env,'/reports/site/19?limit=1&offset=0',strict)).body;
    assert.equal(site.total,0); assert.deepEqual(site.history,[]);
  }
  const search = (await get(env,'/reports/search?q='+encodeURIComponent('매'),true)).body;
  for (const row of search.reports.filter(x=>x.id!=='root')) {assert.equal(row.locationHidden,true);assert.equal(row.target,undefined);assert.equal(row.siteName,undefined);assert.equal(row.region,undefined);}
});

test('later breeding evidence or identity edit revokes native locations and replays; old strict anchor is rejected', async t => {
  const s = await setup(t), body = input(440,{species:'매',note:'비행 관찰'});
  assert.equal((await post(s.pub,body)).status,201);
  const anchor = (await get(s.pub,'/reports/public-state?nonce='+'a'.repeat(32))).body.publication;
  s.db.sqlite.prepare("UPDATE reports SET note='새끼 둥지' WHERE id=?").run(body.request_id);
  assert.equal((await get(s.pub,'/reports/pending',true,anchor)).status,409);
  for (const strict of [false,true]) assert.deepEqual((await get(s.pub,'/reports/pending',strict)).body.spots,[]);
  const replay = await replayQuick(s.db,body.request_id,quickInput(body).input);
  assert.equal(replay.publicVisibility,'withheld'); assert.equal(replay.spot,undefined);
  s.db.sqlite.prepare('UPDATE reports SET note=?,lat=37.8 WHERE id=?').run(body.note,body.request_id);
  assert.deepEqual((await get(s.pub,'/reports/pending',true)).body.spots,[]);
  assert.equal((await get(s.pub,'/reports/'+body.request_id+'/status')).body.publicVisibility,'withheld');
});

test('report form explains nonbreeding, unknown protection and existing privacy choices', () => {
  const html = readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(html,/둥지·새끼·포란·육추·번식지/);
  assert.match(html,/비번식이 명시적으로 확인되면 기존 공개 조건/);
  assert.match(html,/번식 여부가 미확인인 보호종의 위치는 비공개/);
  assert.match(html,/위치 가리기와 이름 공개 동의는 그대로 적용/);
});
