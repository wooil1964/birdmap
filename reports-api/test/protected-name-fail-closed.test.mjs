// PR95 incident: read-only synthetic reproduction, never an operational Worker deployment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/public.js';
import { fakeDb, publicEnv, ORIGIN } from './helpers.mjs';
import { isSensitiveReport, isProtectedSpeciesReport, isLocationRestricted, kstDateString, SENSITIVE_KEYWORDS } from '../src/shared.js';
import { reporterSpeciesNames } from '../src/publication.js';
import { LEGAL_PROTECTED_NAMES, MAP_LOCATION_SENSITIVE } from '../src/protected-birds.js';
import { BIRD_NAME_TABLE } from '../src/official-bird-aliases.js';
import { identifyBird } from '../src/bird-names.js';

const variants = ["호사비오리'", '호사비오리.', '호사비오리,', '(호사비오리)', '호사비오리(관찰)',
 '호사비오리）', '호사비오리’', '참새|호사비오리', '호 사 비 오 리', '호사비오리\u200b',
 '참새 (호사비오리)', '호사비오리류', '호사비오리추정', '가짜새', '참새 가짜새', '참매미', '올빼미과',
 '매(Falco peregrinus)', ''];
const today = kstDateString();
const row = (id,species,extra={}) => ({id,species,status:'approved',lat:36.987654,lon:126.876543,
 site_id:'19',observed_on:today,reporter:'합성 공개 관찰자',name_public:1,...extra});
const call = (env,path) => handleRequest(new Request('https://synthetic.invalid'+path,{headers:ORIGIN}),env);
async function read(env,path,strict=true) {
 const u=new URL('https://synthetic.invalid'+path);
 if(strict){
  const nonce='d'.repeat(32), head=await (await call(env,'/reports/public-state?nonce='+nonce)).json();
  for(const [k,v] of Object.entries({contract:'publication-v1',nonce,expectedEpoch:head.publication.epoch,expectedRevision:head.publication.revision}))u.searchParams.set(k,v);
 }
 const res=await call(env,u.pathname+u.search);
 assert.equal(res.status,200,await res.clone().text());
 assert.equal(res.headers.get('Cache-Control'),'no-store');
 return res.json();
}

// 2026-11-14 정책 변경: 분류 미확인은 승인 전 자동 공개 보류(isSensitiveReport)와 위치 보호(비번식 확인 없음)만 유지한다.
// 승인된 기록의 종명은 원문 그대로 분류 미확인으로 보이고 종수에서 빠진다. 자동 교정은 하지 않는다.
test('PR95 punctuation incident: unclassified names keep coordinates private and are listed apart without rewriting input',()=>{
 for(const species of variants){
  const r=row('secret',species), before=JSON.stringify(r);
  assert.equal(isSensitiveReport({species:[species],speciesText:species}),true,species);
  assert.equal(isLocationRestricted(r),true,species);
  const names=reporterSpeciesNames([r]);
  assert.equal(names.restricted,false,species);
  assert.ok(!JSON.stringify(names).includes('Mergus'),species);
  // 끝 쉼표는 기존 구분자 규칙으로 나뉘어 공식 국명만 남는다(교정이 아니라 구분자). 위치는 위에서처럼 계속 가린다.
  if(species==='호사비오리,'){assert.deepEqual(names.species,['호사비오리']);assert.equal(names.unclassified,undefined);}
  else {assert.deepEqual(names.species,[],species);if(species)assert.deepEqual(names.unclassified,[species],species);}
  assert.equal(JSON.stringify(r),before);
 }
 for(const species of ['참새','참새3마리','까치 박새','갈매기','괭이갈매기','알락오리','Passer montanus',"Ross's Gull"])
  assert.equal(isSensitiveReport({species:[species],speciesText:species}),false,species);
 // A benign structured value cannot wash out unresolved/protected raw input, or vice versa.
 assert.equal(isLocationRestricted(row('mismatch',"호사비오리'",{identified_species:'["참새"]'})),true);
 assert.equal(isLocationRestricted(row('mismatch','참새',{identified_species:'["호사비오리"]'})),true);
 assert.equal(isLocationRestricted(row('counts','참새',{public_sightings:JSON.stringify([{name:"호사비오리'",state:'single',count:1}])})),true);
});

test('official protected classifications are retained but no blanket suppression of valid names',()=>{
 for(const species of [...LEGAL_PROTECTED_NAMES,...Object.keys(MAP_LOCATION_SENSITIVE)]){
  assert.equal(isProtectedSpeciesReport({species:[species]}),true,species);
   assert.equal(isSensitiveReport({species:[species]}),!identifyBird(species),species);
  const aliases=BIRD_NAME_TABLE.find(r=>r[0]===species)||[];
  for(const alias of aliases) {
     assert.equal(isProtectedSpeciesReport({species:[alias]}),true,alias);
     assert.equal(isSensitiveReport({species:[alias]}),!identifyBird(alias),alias);
   }
 }
 for(const keyword of [...SENSITIVE_KEYWORDS,'nesting','chicks','incubation'])
  assert.equal(isSensitiveReport({species:['참새'],note:keyword}),true,keyword);
});

// 위치가 필요한 투영(지도·탐조지 이력·최근 탐조지)에서는 통째로 빠지고, 위치 없는 투영(검색·종명 목록)에는
// 기록·원문 종명이 남되 좌표·탐조지·지역·이동 대상은 없다. 학명·영명으로 바꿔 쓰지 않는다.
test('all species-bearing public API projections: legacy + publication, flags on/off; coordinates never, names only where location-free',async()=>{
 for(const strict of [false,true])for(const aliases of ['0','1']){
  const secret=variants.filter(Boolean).map((s,i)=>row('private-'+i,s));
  secret.push(row('breeding','까치',{note:'육추 둥지'}));
  const env=publicEnv(fakeDb([row('ordinary','참새',{lat:37.111111,lon:127.222222}),...secret]),{
   REPORTS_PUBLICATION_REQUIRED:String(strict),REPORTS_IDENTITY_AUTO_ALIASES:aliases});
  const before=JSON.stringify(env.REPORTS_DB.rows);
  for(const path of ['/reports/approved','/reports/pending','/reports/site/19','/reports/recent-sites',
    '/reports/search?q='+encodeURIComponent('호사비오리'),'/reports/reporter-species?reporter='+encodeURIComponent('합성 공개 관찰자')+'&source=all']){
   const body=await read(env,path,strict || path.includes('search') || path.includes('reporter-species'));
   const text=JSON.stringify(body), locationFree=path.includes('search')||path.includes('reporter-species');
   for(const needle of ['36.987654','126.876543','Mergus squamatus','Scaly-sided Merganser',...(locationFree?[]:['호사비오리','가짜새'])])assert.ok(!text.includes(needle),path+' '+needle);
   if(path==='/reports/approved') assert.deepEqual(body.spots.map(s=>s.id),['ordinary']);
   if(path==='/reports/site/19') assert.equal(body.total,1);
   if(path.includes('search')){
    assert.ok(body.total>0);
    for(const r of body.reports){assert.equal(r.locationHidden,true,r.id);for(const k of ['target','siteName','region'])assert.equal(r[k],undefined,r.id+' '+k);}
   }
   if(path.includes('reporter-species')){
    assert.deepEqual(body.species,['참새','호사비오리'],'호사비오리, 는 구분자 분리');assert.equal(body.restricted,true,'breeding row stays out');
    assert.ok(body.unclassified.includes("호사비오리'")&&!body.unclassified.includes('까치'));
   }
  }
  assert.equal(JSON.stringify(env.REPORTS_DB.rows),before,'public reads never change approval/raw/group data');
 }
});

test('fresh permission after approval/name-consent withdrawal removes species membership',async()=>{
 const env=publicEnv(fakeDb([row('ordinary','참새')]),{REPORTS_PUBLICATION_REQUIRED:'true'});
 const path='/reports/reporter-species?reporter='+encodeURIComponent('합성 공개 관찰자')+'&source=all';
 assert.deepEqual((await read(env,path)).species,['참새']);
 const nonce='e'.repeat(32), anchor=(await(await call(env,'/reports/public-state?nonce='+nonce)).json()).publication;
 await env.REPORTS_DB.prepare("UPDATE reports SET name_public=0 WHERE id='ordinary'").run();
 const stale=await call(env,path+'&'+new URLSearchParams({contract:'publication-v1',nonce,expectedEpoch:anchor.epoch,expectedRevision:anchor.revision}));
 assert.equal(stale.status,409);
 const fresh=(await(await call(env,'/reports/public-state?nonce='+nonce)).json()).publication;
 const denied=await call(env,path+'&'+new URLSearchParams({contract:'publication-v1',nonce,expectedEpoch:fresh.epoch,expectedRevision:fresh.revision}));
 assert.equal(denied.status,404);
});
