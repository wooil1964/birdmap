// Independent sweep: a pending protected-species report (non-breeding confirmed, hideLocation=true,
// REPORTS_PENDING_PUBLIC='1' as in the old config) must not leak its coordinates through ANY public GET,
// in strict (publication-v1) or legacy mode, before approval and after admin hide/unhide/reject/unpublish.
// Run: node --test (reports-api). Fails on 29e88cb (pre-fix): GET /reports/pending returned the exact point.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDb} from './helpers.mjs';
import {environments,installAuthStubs,input,post,adminPost,ORIGIN} from '../local-test/helpers.mjs';
import {handleRequest} from '../src/public.js';

const LAT=36.987654,LON=126.876543,SITE='sweep-site';
const DIGITS=['36.98765','126.87654','36.9877','126.8765'];
async function get(env,path,strict) {
  const url=new URL('https://synthetic.invalid'+path);
  if(strict) {
    const h=await get(env,'/reports/public-state?nonce='+'b'.repeat(32),false);
    for(const [k,v] of Object.entries({contract:'publication-v1',nonce:'b'.repeat(32),expectedEpoch:h.body.publication.epoch,expectedRevision:h.body.publication.revision}))url.searchParams.set(k,v);
  }
  const r=await handleRequest(new Request(url,{headers:{Origin:ORIGIN}}),env);
  return {path,status:r.status,body:await r.json().catch(()=>null)};
}
function clean(label,res) {
  const s=JSON.stringify(res.body);
  for(const d of DIGITS)assert.ok(!s.includes(d),`${label} ${res.path} leaked ${d}: ${s.slice(0,300)}`);
}
async function sweep(env,id,label) {
  const paths=['/reports/pending','/reports/approved','/reports/search?q='+encodeURIComponent('매'),'/reports/search?q=','/reports/recent-sites?days=30',
    '/reports/site/'+SITE,'/reports/'+id+'/status','/contributors/monthly','/contributors/all',
    '/reports/reporter-stats?reporter='+encodeURIComponent('합성테스터'),'/reports/reporter-species?reporter='+encodeURIComponent('합성테스터'),'/field-updates'];
  for(const strict of [false,true])for(const p of paths) {
    env.REPORTS_PUBLICATION_REQUIRED=String(strict);
    const res=await get(env,p,strict);
    clean(`${label} strict=${strict}`,res);
    if(p==='/reports/pending'){assert.equal(res.status,200);assert.deepEqual(res.body.spots,[]);}
  }
}

test('pending protected report: no public GET leaks coordinates through the whole admin lifecycle',async t=>{
  const auth=await installAuthStubs();t.after(auth.restore);
  const db=canonicalDb(),{pub,admin}=environments(db);
  assert.equal(pub.REPORTS_PENDING_PUBLIC,'1');
  const body=input(901,{lat:LAT,lon:LON,species:'매, 청둥오리',note:'비행 관찰',hideLocation:true});
  const id=body.request_id;
  for(const strict of [false,true]) {
    pub.REPORTS_PUBLICATION_REQUIRED=String(strict);
    const r=await post(pub,body);assert.equal(r.status,201);
    const j=await r.json();assert.equal(j.publicVisibility,'withheld');assert.equal(j.spot,undefined);clean('receipt',{path:'POST',body:j});
  }
  await sweep(pub,id,'pending');
  let n=950;
  const rev=()=>db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').get(id).revision;
  const act=async(action,extra={})=>adminPost(admin,auth.token,id,{action,request_id:input(n++).request_id,expected_revision:rev(),...extra});
  assert.equal((await act('visibility',{public:true})).status,400);
  await sweep(pub,id,'after-visibility-refused');
  assert.equal((await act('hide',{hide:true})).status,200);await sweep(pub,id,'after-hide');
  assert.equal((await act('hide',{hide:false})).status,200);await sweep(pub,id,'after-unhide');
   assert.equal((await act('hide',{hide:true})).status,200);
  // Approving a protected nonbreeding sighting honors the reporter's mask, never the exact coordinate.
  assert.equal((await act('approve')).status,200);
  pub.REPORTS_PUBLICATION_REQUIRED='true';
  const appr=await get(pub,'/reports/approved',true);
  assert.ok(appr.body.spots.some(s=>s.id===id && s.locationHidden===true),'name visible but precise location remains hidden');
  await sweep(pub,id,'after-approve');
  assert.equal((await act('unpublish')).status,200);await sweep(pub,id,'after-unpublish(back to pending)');
  assert.equal((await act('reject')).status,200);await sweep(pub,id,'after-reject');
  assert.equal((await act('visibility',{public:1})).status,400);await sweep(pub,id,'after-reject-visibility-refused');
});
