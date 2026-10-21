import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/public.js';
import { fakeDb, publicEnv, ORIGIN } from './helpers.mjs';

const nonce='c'.repeat(32);
const row=(id,extra={})=>({id,species:'까치',status:'approved',lat:37.1234567,lon:127.7654321,
  observed_on:'2020-01-01',received_at:'2026-10-01T00:00:00Z',reporter:'공개이름',name_public:1,...extra});
const env=rows=>publicEnv(fakeDb(rows),{REPORTS_PUBLICATION_REQUIRED:'true'});
const call=(e,path,headers=ORIGIN)=>handleRequest(new Request('https://synthetic.test'+path,{headers}),e);
async function head(e){return (await(await call(e,'/reports/public-state?nonce='+nonce)).json()).publication;}
function path(anchor,params={}){return '/reports/search?'+new URLSearchParams({contract:'publication-v1',nonce,expectedEpoch:anchor.epoch,expectedRevision:anchor.revision,...params});}
async function search(e,params={},anchor){const response=await call(e,path(anchor||await head(e),params));return {response,body:await response.json()};}
async function site(e,id,name,region){await e.REPORTS_DB.prepare("INSERT INTO sites(site_id,site_name,registry_source,registry_revision,source_record_json,created_at) VALUES(?,?,'index.html:siteData','test',?,'2026-10-21')").bind(id,name,JSON.stringify({region})).run();}

test('all observation dates, stable date/received/id order, pages 20/20/3 and empty tail',async()=>{
  const rows=Array.from({length:43},(_,i)=>row('r'+String(i).padStart(2,'0')));
  rows.push(row('pending',{status:'pending'}),row('rejected',{status:'rejected'}));
  const e=env(rows),all=[];
  for(const offset of [0,20,40,60]){
    const {response,body}=await search(e,{offset:String(offset)});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(body.total,43);assert.equal(body.limit,20);assert.equal(body.hasMore,offset<40);
    assert.equal(body.reports.length,offset===0||offset===20?20:offset===40?3:0);
    all.push(...body.reports.map(r=>r.id));
  }
  assert.deepEqual(all,rows.slice(0,43).map(r=>r.id).reverse());
  const order=env([row('old',{observed_on:'2010-01-01',received_at:'2026-10-21'}),row('new',{observed_on:'2026-10-20',received_at:'2026-10-01'}),row('newer',{observed_on:'2026-10-20',received_at:'2026-10-02'})]);
  assert.deepEqual((await search(order)).body.reports.map(r=>r.id),['newer','new','old']);
});
test('whole-history species, public reporter, public site and region search; literal Unicode/special characters',async()=>{
  const e=env([row('public',{species:'참새 · 동박새',site_id:'1',reporter:'Bird ABC'}),row('literal',{species:"%_ ' 까치"})]);
  await site(e,'1','공개탐조지','충남 서천군');
  for(const q of ['참새','동박새','bird abc','공개탐조지','충남','서천군','  Bird   ABC  ','참새'])assert.equal((await search(e,{q})).body.reports[0]?.id,'public',q);
  for(const q of ['%','_',"'"])assert.deepEqual((await search(e,{q})).body.reports.map(r=>r.id),['literal']);
  assert.equal((await search(e,{q:'없는자료'})).body.total,0);
});
test('private names and hidden/sensitive location cannot match or leak even through counts or parent targets',async()=>{
  const e=env([
    row('private',{name_public:0,reporter:'비공개이름토큰'}),
    row('hidden',{site_id:'2',public_lat:36,public_lon:126}),
    row('sensitive',{site_id:'2',species:'저어새'}),row('nest',{site_id:'2',note:'둥지 비밀메모'}),
    row('child',{spot_key:'hidden',site_id:'2'}),row('hidden-child',{spot_key:'private',site_id:'2',public_lat:36,public_lon:126}),
    row('fixed',{spot_key:'fixed:2:0',site_id:'2',public_lat:36,public_lon:126}),
    row('orphan',{spot_key:'withdrawn',site_id:'2'}),row('withdrawn',{status:'pending',site_id:'2'}),
    row('malformed',{spot_key:'fixed:2:bad',site_id:'2'}),row('sensitive-child',{spot_key:'sensitive',site_id:'2'}),
    row('chain',{spot_key:'child',site_id:'2'}),row('fixed-chain',{spot_key:'fixed',site_id:'2'}),
  ]);
  await site(e,'2','비공개탐조토큰','비공개지역토큰');
  for(const q of ['비공개이름토큰','비공개탐조토큰','비공개지역토큰','둥지','비밀메모','37.1234567','36'])assert.equal((await search(e,{q})).body.total,0,q);
  const body=(await search(e)).body;
  assert.equal(body.reports.find(r=>r.id==='private').reporter,undefined);
  for(const r of body.reports.filter(r=>r.id!=='private')){
    assert.equal(r.locationHidden,true,r.id);assert.equal(r.target,undefined);assert.equal(r.siteName,undefined);assert.equal(r.region,undefined);
  }
  for(const secret of ['비공개이름토큰','비공개탐조토큰','비공개지역토큰','37.1234567','127.7654321','비밀메모','spot_key','site_id','public_lat','admin_note'])assert.ok(!JSON.stringify(body).includes(secret),secret);
  assert.equal((await search(e,{q:'저어새'})).body.total,1,'public species remains searchable without location');
});
test('safe parent/fixed refs reuse existing targets and expose no coordinates',async()=>{
  const e=env([row('parent',{site_id:'1'}),row('child',{spot_key:'parent'}),row('fixed',{spot_key:'fixed:1:0'})]);await site(e,'1','공개지역','공개권역');
  const b=(await search(e,{q:'공개권역'})).body;assert.equal(b.total,3);
  assert.deepEqual(b.reports.find(r=>r.id==='child').target,{kind:'spot',spotId:'parent'});
  assert.deepEqual(b.reports.find(r=>r.id==='fixed').target,{kind:'fixed',spotId:'fixed:1:0'});
  for(const r of b.reports)assert.deepEqual(Object.keys(r).sort(),['date','id','locationHidden','region','reporter','siteName','species','target']);
});
test('singleton bounded query/fixed page/strict offset and publication-only even on legacy deployment',async()=>{
  const e=env([]);
  for(const params of [{q:'x'.repeat(101)},{q:'x\n'},{limit:'0'},{limit:'21'},{limit:'020'},{offset:'-1'},{offset:'1.1'},{offset:'1e2'},{offset:'01'},{offset:''},{offset:'9007199254740992'}])assert.equal((await search(e,params)).response.status,400,JSON.stringify(params));
  const a=await head(e);
  for(const suffix of ['&q=a&q=b','&offset=0&offset=20','&limit=20&limit=20'])assert.equal((await call(e,path(a)+suffix)).status,400);
  for(const required of ['true','false'])assert.equal((await call({...e,REPORTS_PUBLICATION_REQUIRED:required},'/reports/search')).status,400);
  assert.equal((await call(e,path(a),{Origin:'https://untrusted.example'})).status,403);
});
test('approval/consent/location/deletion changes reject old permissions and fresh queries reflect withdrawal',async()=>{
  for(const sql of ["UPDATE reports SET status='pending' WHERE id='public'","UPDATE reports SET name_public=0 WHERE id='public'","UPDATE reports SET public_lat=36,public_lon=126 WHERE id='public'","DELETE FROM reports WHERE id='public'"]){
    const e=env([row('public',{site_id:'1'})]);await site(e,'1','공개탐조지','서천');
    const old=await head(e);assert.equal((await search(e,{q:'공개이름'},old)).body.total,1);
    await e.REPORTS_DB.prepare(sql).run();
    const stale=await search(e,{},old);assert.equal(stale.response.status,409);assert.equal(stale.body.reports,undefined);
    const fresh=(await search(e)).body;
    if(sql.includes('pending')||sql.includes('DELETE'))assert.equal(fresh.total,0);
    else if(sql.includes('name_public'))assert.equal((await search(e,{q:'공개이름'})).body.total,0);
    else{assert.equal(fresh.reports[0].locationHidden,true);assert.equal((await search(e,{q:'공개탐조지'})).body.total,0);}
  }
});
test('replacement epoch and missing guard fail closed without report payload',async()=>{
  const original=env([row('public')]),old=await head(original),e=env([row('public')]);
  assert.equal((await search(e,{},old)).response.status,409);
  const current=await head(e);
  await e.REPORTS_DB.prepare('DROP TRIGGER publication_reports_update').run();
  const denied=await search(e,{},current);assert.equal(denied.response.status,503);assert.equal(denied.body.reports,undefined);
});
test('primary session and atomic state/approved/registry snapshot are reused',async()=>{
  const e=env([row('public')]),a=await head(e),db=e.REPORTS_DB,sessions=[],batches=[];
  e.REPORTS_DB={withSession(mode){sessions.push(mode);return {prepare:sql=>db.prepare(sql),batch:statements=>{batches.push(statements);return db.batch(statements);}};}};
  assert.equal((await search(e,{},a)).response.status,200);assert.deepEqual(sessions,['first-primary']);assert.equal(batches.length,1);assert.equal(batches[0].length,3);
});
