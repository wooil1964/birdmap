// Synthetic regression: all pending coordinates stay private; admin approval and v2 stay intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDb,fakeDb,publicEnv,submitRequest,validBody} from './helpers.mjs';
import {environments,installAuthStubs,input,post,adminPost,ORIGIN} from '../local-test/helpers.mjs';
import {handleRequest} from '../src/public.js';
import {quickInput,persistQuick,replayQuick} from '../src/canonical/persistence.js';
import {dedupeHash,sha256Hex,pendingPayload} from '../src/shared.js';

const POINT={lat:37.512345,lon:127.054321};
async function get(env,path,strict=false) {
  const url=new URL('https://synthetic.invalid'+path);
  if(strict) {
    const h=await get(env,'/reports/public-state?nonce='+'a'.repeat(32));
    assert.equal(h.status,200);
    for(const [k,v] of Object.entries({contract:'publication-v1',nonce:'a'.repeat(32),expectedEpoch:h.body.publication.epoch,expectedRevision:h.body.publication.revision}))url.searchParams.set(k,v);
  }
  const r=await handleRequest(new Request(url,{headers:{Origin:ORIGIN}}),env);
  return {status:r.status,body:await r.json()};
}
function withheld(receipt) {
  assert.equal(receipt.status,'pending');
  assert.equal(receipt.publicVisibility,'withheld');
  assert.deepEqual(Object.keys(receipt).sort(),['id','ok','publicVisibility','status']);
  assert.ok(!JSON.stringify(receipt).includes(String(POINT.lat)));
  assert.ok(!JSON.stringify(receipt).includes(String(POINT.lon)));
}
async function setup(t) {
  const auth=await installAuthStubs();t.after(auth.restore);
  const db=canonicalDb();
  return {db,...environments(db),token:auth.token};
}
async function historical(s,n) {
  const body=input(n,{...POINT,species:'매',note:'비행 관찰',hideLocation:false});
  const {report,input:original}=quickInput(body),now=new Date().toISOString();
  const row={id:body.request_id,status:'pending',species:report.speciesText,lat:report.lat,lon:report.lon,public_lat:null,public_lon:null,
    approx_lat:report.lat,approx_lon:report.lon,pending_public:1,observed_on:report.observedOn,received_at:now,decided_at:null,
    bird_count:report.birdCount,reporter:report.reporter,note:report.note,admin_note:null,site_id:null,name_public:report.namePublic,spot_key:null,
    ip_hash:'synthetic',dedupe_hash:await dedupeHash(report)};
  const accepted={ok:true,id:row.id,status:'pending',publicVisibility:'approximate',spot:{id:row.id,lat:row.lat,lon:row.lon,species:report.species}};
  await persistQuick(s.db,row,original,accepted,await sha256Hex('historical-'+n));
  return body;
}

test('pending coordinates: historical public flags and exact approx columns never escape either GET path',async()=>{
  const row={id:'historical-common',species:'청둥오리',...POINT,approx_lat:POINT.lat,approx_lon:POINT.lon,pending_public:1};
  for(const flag of ['1','0',undefined]) {
    const env=publicEnv(fakeDb([row]),{REPORTS_PENDING_PUBLIC:flag});
    for(const strict of [false,true]) {
      const r=await get(env,'/reports/pending',strict);
      assert.equal(r.status,200);assert.deepEqual(r.body.spots,[]);
      assert.ok(!JSON.stringify(r.body).includes(String(POINT.lat)));
    }
  }
  assert.deepEqual(pendingPayload([row]),[]);
});

test('pending coordinates: NORMAL receipt plus canonical first, duplicate replay and status are withheld',async t=>{
  const s=await setup(t);
  const legacy=publicEnv(fakeDb(),{REPORTS_PENDING_PUBLIC:'1'});
  const normal=await handleRequest(submitRequest(validBody({...POINT})),legacy);
  assert.equal(normal.status,201);withheld(await normal.json());
  let n=810;
  for(const strict of [false,true])for(const hideLocation of [false,true]) {
    const body=input(n++,{...POINT,lon:POINT.lon+(n-810)/10,species:'매, 청둥오리',hideLocation});
    s.pub.REPORTS_PUBLICATION_REQUIRED=String(strict);
    const first=await post(s.pub,body);assert.equal(first.status,201);withheld(await first.json());
    const raw=s.db.sqlite.prepare('SELECT payload_json FROM raw_submissions WHERE request_id=?').get(body.request_id).payload_json;
    for(let i=0;i<2;i++) {const again=await post(s.pub,body);assert.equal(again.status,201);withheld(await again.json());}
    assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) AS n FROM reports WHERE id=?').get(body.request_id).n,1);
    assert.equal(s.db.sqlite.prepare('SELECT pending_public FROM reports WHERE id=?').get(body.request_id).pending_public,0);
    assert.equal(s.db.sqlite.prepare('SELECT payload_json FROM raw_submissions WHERE request_id=?').get(body.request_id).payload_json,raw);
    assert.deepEqual((await get(s.pub,'/reports/pending',strict)).body.spots,[]);
    assert.equal((await get(s.pub,'/reports/'+body.request_id+'/status')).body.publicVisibility,'withheld');
  }
});

test('pending coordinates: immutable historical receipt cannot revive a marker; approval/reject/unpublish/link keep their meaning',async t=>{
  const s=await setup(t),body=await historical(s,830),id=body.request_id;
  const rawBefore=s.db.sqlite.prepare('SELECT payload_json FROM raw_submissions WHERE request_id=?').get(id).payload_json;
  for(const strict of [false,true]) {
    s.pub.REPORTS_PUBLICATION_REQUIRED=String(strict);
    withheld(await (await post(s.pub,body)).json());
    withheld(await replayQuick(s.db,id,quickInput(body).input));
    assert.deepEqual((await get(s.pub,'/reports/pending',strict)).body.spots,[]);
    assert.equal((await get(s.pub,'/reports/'+id+'/status')).body.publicVisibility,'withheld');
  }
  let n=840;
  const rev=()=>s.db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').get(id).revision;
  const act=async(action,extra={})=>adminPost(s.admin,s.token,id,{action,request_id:input(n++).request_id,expected_revision:rev(),...extra});
  const before=s.db.sqlite.prepare('SELECT * FROM reports WHERE id=?').get(id);
  for(const value of [true,1]) {
    const r=await act('visibility',{public:value});assert.equal(r.status,400);
    assert.equal((await r.json()).error.code,'PENDING_PUBLICATION_DISABLED');
    assert.deepEqual(s.db.sqlite.prepare('SELECT * FROM reports WHERE id=?').get(id),before);
  }
  for(const hide of [true,false]) {
    assert.equal((await act('hide',{hide})).status,200);
    assert.deepEqual((await get(s.pub,'/reports/pending',true)).body.spots,[]);
    withheld(await (await post(s.pub,body)).json());
  }
  assert.equal((await act('approve')).status,200,'the existing approval procedure stays available');
  const approved=(await get(s.pub,'/reports/approved',true)).body.spots.find(r=>r.id===id);
  assert.ok(approved && Number(approved.lat)===Number(body.lat),'approved verified nonbreeding follows the original reporter choice');
  assert.equal((await get(s.pub,'/reports/search?q='+encodeURIComponent('매'),true)).body.total,1);
  const approvedReplay=await (await post(s.pub,body)).json();
  assert.equal(approvedReplay.status,'approved');assert.equal(approvedReplay.publicVisibility,'approved');assert.equal(approvedReplay.spot,undefined);
  assert.equal((await act('unpublish')).status,200);
  withheld(await (await post(s.pub,body)).json());assert.deepEqual((await get(s.pub,'/reports/approved',true)).body.spots,[]);
  assert.equal((await act('reject')).status,200);
  const rejected=await (await post(s.pub,body)).json();
  assert.equal(rejected.status,'rejected');assert.equal(rejected.publicVisibility,'not_published');assert.equal(rejected.spot,undefined);
  assert.equal((await act('visibility',{public:true})).status,400);
  assert.equal((await act('link',{spotKey:'fixed:19:1'})).status,200,'the existing link/approval procedure stays available');
  assert.equal((await (await post(s.pub,body)).json()).status,'approved');
  assert.equal(s.db.sqlite.prepare('SELECT payload_json FROM raw_submissions WHERE request_id=?').get(id).payload_json,rawBefore,'immutable historical receipt is not rewritten');
});
