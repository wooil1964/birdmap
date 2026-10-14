import test from 'node:test';import assert from 'node:assert/strict';
import * as publication from '../src/publication.js';import {handleRequest} from '../src/public.js';import {fakeDb,publicEnv,ORIGIN} from './helpers.mjs';
// 누적 출현종 이름 목록(/reports/reporter-species)과 전체 누적 기여자(/contributors/all).
const N='b'.repeat(32),A='11111111-1111-4111-8111-111111111111';
let seq=0;
const row=(extra={})=>({id:'r'+(++seq),status:'approved',name_public:1,reporter:'합성검증',species:'까치',lat:37,lon:127,observed_on:'2026-10-02',...extra});
const env=rows=>publicEnv(fakeDb(rows),{REPORTS_PUBLICATION_REQUIRED:'true'});
const call=(e,p)=>handleRequest(new Request('https://reports.example'+p,{headers:ORIGIN}),e);
async function read(e,path,params){const h=await(await call(e,'/reports/public-state?nonce='+N)).json();const r=await call(e,path+'?'+new URLSearchParams({contract:'publication-v1',nonce:N,expectedEpoch:h.publication.epoch,expectedRevision:h.publication.revision,...params}));return {r,b:await r.json()};}
const species=(e,params={})=>read(e,'/reports/reporter-species',{reporter:'합성검증',source:'history',reportId:A,...params});
const all=(e,params={})=>read(e,'/contributors/all',params);
const monthly=(e,month)=>read(e,'/contributors/monthly',{month});

test('species: union of approved consenting rows, deduped and 가나다 sorted, names only',async()=>{
 const e=env([row({id:A,species:'참새 · 까치'}),row({species:'까치 · 가마우지',observed_on:'2019-05-01'}),row({species:'동박새'})]);
 const {r,b}=await species(e);
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(b.species,['가마우지','까치','동박새','참새']);assert.equal(b.restricted,false);
 assert.deepEqual(Object.keys(b).sort(),['publication','restricted','serverTime','species']);
});
test('species: protected species, nesting keyword and hidden location rows are withheld whole',async()=>{
 const e=env([row({id:A,species:'까치'}),row({species:'저어새 · 백로'}),row({species:'직박구리',note:'둥지 근처 합성 메모'}),row({species:'흰뺨검둥오리',public_lat:36.5,public_lon:126.5}),row({species:'수리부엉이 2마리'})]);
 const {b}=await species(e);
 assert.deepEqual(b.species,['까치']);assert.equal(b.restricted,true);
 const text=JSON.stringify(b);for(const secret of ['저어새','백로','직박구리','흰뺨검둥오리','수리부엉이','둥지','메모','36.5','lat',A])assert.ok(!text.includes(secret),secret);
});
test('species: unapproved, unconsented, other names and withdrawn rows never counted',async()=>{
 const e=env([row({id:A,species:'까치'}),row({species:'대기종',status:'pending'}),row({species:'반려종',status:'rejected'}),row({species:'비공개종',name_public:0}),row({species:'남의종',reporter:'다른사람'}),row({species:'공백종',reporter:'합성검증 '})]);
 assert.deepEqual((await species(e)).b.species,['까치']);
});
test('species: same witness rules as reporter-stats (missing witness is 404 without data)',async()=>{
 for(const rows of [[row({id:A,name_public:0})],[row({id:A,status:'pending'})],[row({id:A,reporter:'다른사람'})],[]]){
  const {r,b}=await species(env(rows));assert.equal(r.status,404);assert.equal(b.error.code,'REPORTER_STATS_UNAVAILABLE');assert.equal(b.species,undefined);
 }
 const e=env([row({id:A}),row({observed_on:'2026-09-03',species:'참새'})]);
 assert.deepEqual((await species(e,{source:'monthly',month:'2026-10',reportId:''})).b.species,['까치','참새']);
 assert.equal((await species(e,{source:'monthly',month:'2026-08',reportId:''})).r.status,404);
 assert.deepEqual((await species(e,{source:'all',reportId:''})).b.species,['까치','참새']);
 for(const bad of [{source:'all'},{source:'all',reportId:'',month:'2026-10'},{source:'weird',reportId:''}])assert.equal((await species(e,bad)).r.status,400,JSON.stringify(bad));
});
test('reporter-stats accepts the all-time source and keeps numbers-only output',async()=>{
 const e=env([row({species:'까치'}),row({species:'참새 · 까치'}),row({species:'저어새'})]);
 const {r,b}=await read(e,'/reports/reporter-stats',{reporter:'합성검증',source:'all'});
 assert.equal(r.status,200);assert.deepEqual(Object.keys(b).sort(),['publication','reportCount','serverTime','speciesCount']);
 assert.equal(b.reportCount,3);assert.equal(b.speciesCount,3);
 assert.equal((await read(e,'/reports/reporter-stats',{reporter:'없는이름',source:'all'})).r.status,404);
});
test('species: list never exceeds the count shown by reporter-stats',async()=>{
 const e=env([row({id:A,species:'까치 · 참새'}),row({species:'저어새 · 까치'}),row({species:'동박새'})]);
 const s=(await species(e)).b,c=(await read(e,'/reports/reporter-stats',{reporter:'합성검증',source:'history',reportId:A})).b;
 assert.ok(s.species.length<=c.speciesCount);assert.equal(s.restricted,true);assert.equal(c.speciesCount,4);assert.deepEqual(s.species,['동박새','까치','참새'].sort());
});
test('pure helper: restricted flag and code-point order',()=>{
 assert.deepEqual(publication.reporterSpeciesNames([{species:'참새 · 가마우지'},{species:'매'},{species:'까치',location_hidden:1}]),{species:['가마우지','참새'],restricted:true});
 assert.deepEqual(publication.reporterSpeciesNames([]),{species:[],restricted:false});
});

test('all contributors: consenting approved rows per exact nickname, monthly ordering rule',async()=>{
 const e=env([row({reporter:'가'}),row({reporter:'나'}),row({reporter:'나',observed_on:'2019-01-01'}),row({reporter:'다',name_public:0}),row({reporter:null,name_public:0}),row({reporter:'라',status:'pending'}),row({reporter:'마',status:'rejected'}),row({reporter:'   '})]);
 const {r,b}=await all(e);
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(b.contributors,[{name:'나',count:2},{name:'가',count:1}]);
 assert.equal(b.publicContributors,2);assert.equal(b.approvedReports,6);assert.equal(b.scope,'all');assert.equal(b.offset,0);assert.equal(b.limit,200);
 assert.deepEqual(Object.keys(b).sort(),['approvedReports','contributors','limit','offset','publicContributors','publication','scope','serverTime']);
 for(const secret of ['37','127','lat','species','까치','2019'])assert.ok(!JSON.stringify(b.contributors).includes(secret),secret);
});
test('all contributors equal the sum of every monthly list',async()=>{
 const rows=[];const months=['2026-08','2026-09','2026-10'];
 for(const [i,m] of months.entries())for(const name of ['가','나','다'].slice(0,i+1))rows.push(row({reporter:name,observed_on:m+'-0'+(i+1)}),row({reporter:name,observed_on:m+'-1'+(i+1),name_public:0}));
 const e=env(rows),sum={};let approved=0;
 for(const m of months){const b=(await monthly(e,m)).b;approved+=b.approvedReports;for(const c of b.contributors)sum[c.name]=(sum[c.name]||0)+c.count;}
 const b=(await all(e)).b;
 assert.deepEqual(Object.fromEntries(b.contributors.map(c=>[c.name,c.count])),sum);assert.equal(b.approvedReports,approved);
});
test('withdrawal, unconsent and deletion disappear from the all-time list',async()=>{
 const e=env([row({id:'w1',reporter:'가'}),row({id:'w2',reporter:'가'}),row({id:'w3',reporter:'나'})]);
 assert.deepEqual((await all(e)).b.contributors,[{name:'가',count:2},{name:'나',count:1}]);
 const db=e.REPORTS_DB;
 await db.prepare("UPDATE reports SET status='rejected' WHERE id='w1'").run();
 await db.prepare("UPDATE reports SET name_public=0 WHERE id='w3'").run();
 assert.deepEqual((await all(e)).b.contributors,[{name:'가',count:1}]);
 await db.prepare("DELETE FROM reports WHERE id='w2'").run();
 const b=(await all(e)).b;assert.deepEqual(b.contributors,[]);assert.equal(b.publicContributors,0);
});
test('all contributors page by limit/offset; total stays the full count',async()=>{
 const rows=[];for(let i=0;i<5;i++)for(let k=0;k<=i;k++)rows.push(row({reporter:'기여'+i}));
 const e=env(rows);
 const p1=(await all(e,{limit:'2'})).b,p2=(await all(e,{limit:'2',offset:'2'})).b,p3=(await all(e,{limit:'2',offset:'4'})).b;
 assert.deepEqual([...p1.contributors,...p2.contributors,...p3.contributors].map(c=>c.name),['기여4','기여3','기여2','기여1','기여0']);
 assert.equal(p3.contributors.length,1);for(const p of [p1,p2,p3])assert.equal(p.publicContributors,5);
 for(const bad of [{limit:'0'},{limit:'201'},{limit:'1.5'},{offset:'-1'},{limit:'x'}])assert.equal((await all(e,bad)).r.status,400,JSON.stringify(bad));
});
test('new paths stay behind the publication contract',async()=>{
 const e=env([row({id:A})]);
 for(const p of ['/contributors/all','/reports/reporter-species?reporter=%ED%95%A9%EC%84%B1%EA%B2%80%EC%A6%9D&source=all']){
  const r=await call(e,p);assert.notEqual(r.status,200,p);
 }
 assert.ok(publication.isPublicationPath('/contributors/all'));assert.ok(publication.isPublicationPath('/reports/reporter-species'));
});
