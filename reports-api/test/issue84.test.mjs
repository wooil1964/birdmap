import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalDb,publicEnv,ORIGIN} from './helpers.mjs';
import {confirmedIdentityAction} from '../src/reporter-identity.js';
import {handleRequest as publicHandler} from '../src/public.js';
import {handleRequest as adminHandler} from '../src/admin.js';
import {adminStats} from '../src/admin-stats.js';
import {environments,installAuthStubs} from '../local-test/helpers.mjs';
import {normalizeSpecies,parseSpeciesItems,legacySpeciesItems,sightingValues,isSensitiveReport,isLocationRestricted,publicPayload,reportBreedingStatus} from '../src/shared.js';
import {contentReasons} from '../src/autopublic.js';
const MIGRATION=readFileSync(new URL('../migrations/0007_reporter_identity.sql',import.meta.url),'utf8');
const ENV={REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
const names=['들뫼산새','들뫼 산새','들 뫼 산 새'];
function seeded(extra=[]) {
 const db=canonicalDb();db.sqlite.exec(MIGRATION);
 const rows=[['a',names[0],'동박새, 까치'],['b',names[1],'찌르레기, 동박새'],['c',names[2],'박새'],...extra];
 rows.forEach(([id,name,species],i)=>db.sqlite.prepare("INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES(?,'approved',?,?,1,37,127,'2026-10-02',?,'same-ip',?)").run(id,species,name,'2026-10-'+String(i+1).padStart(2,'0')+'T00:00:00Z',id));
 return db;
}
const confirm=(db,ids=['c','b','a'])=>confirmedIdentityAction(db,{action:'confirm',reportIds:ids,confirmedSamePerson:true,reason:'관리자 본인 확인 완료'},'admin@example.test');
const env=db=>publicEnv(db,ENV);
async function url(e,path,params={}) {
 const h=await (await publicHandler(new Request('https://reports.example/reports/public-state?nonce='+'a'.repeat(32),{headers:ORIGIN}),e)).json();
 return 'https://reports.example'+path+'?'+new URLSearchParams({contract:'publication-v1',nonce:'a'.repeat(32),expectedEpoch:h.publication.epoch,expectedRevision:h.publication.revision,...params});
}
async function get(e,path,params={}) {const response=await publicHandler(new Request(await url(e,path,params),{headers:ORIGIN}),e);return {status:response.status,body:await response.json()};}
const stats=(e,reporter=names[0],extra={})=>get(e,'/reports/reporter-stats',{reporter,source:'history',reportId:'a',...extra});

test('official whitespace split: shared parser, 1 report / 3 species / 10 birds; original input untouched',()=>{
 for(const input of ['동박새3 찌르레기2 까치5','동박새 3 찌르레기 2 까치 5','동박새3, 찌르레기2, 까치5','동박새3마리 찌르레기2개체 까치5']) {
  const parsed=parseSpeciesItems(normalizeSpecies(input));
  assert.deepEqual(parsed.items.map(i=>[i.name,i.count]),[['동박새',3],['찌르레기',2],['까치',5]]);
  assert.deepEqual(legacySpeciesItems(input).map(i=>[i.name,i.count]),[['동박새',3],['찌르레기',2],['까치',5]]);
  assert.equal(sightingValues(parsed,null).reduce((n,s)=>n+s.count_value,0),10);
  assert.equal(contentReasons({species:normalizeSpecies(input),birdCount:null}).size,0);
  if(!input.includes(','))assert.equal(contentReasons({species:[input],birdCount:null}).size,0);
 }
});
test('no partial, English/scientific or invalid quantity whitespace guessing; duplicates never sum',()=>{
 for(const s of ['동박새3 미확인새2','동박새 03 까치5','동박새0 까치5','동박새3 5 까치2','동박새3찌르레기2','동박새100001 까치5'])assert.equal(legacySpeciesItems(s).length,1,s);
 for(const s of ['Peregrine Falcon 3','Falco peregrinus 3'])assert.equal(parseSpeciesItems(normalizeSpecies(s)).items.length,1);
 for(const s of ['동박새3 동박새5','동박새3 동박새3']) {
  const parsed=parseSpeciesItems(normalizeSpecies(s));assert.deepEqual(parsed.duplicates,['동박새']);
  assert.ok(sightingValues(parsed,null).every(i=>i.count_value===null&&i.interpretation==='unknown'));
  assert.equal(legacySpeciesItems(s)[0].countStatus,'uncertain');
 }
 assert.equal(legacySpeciesItems('동박새 까치5')[0].count,null);
 assert.equal(legacySpeciesItems('동박새0')[0].countStatus,'uncertain');
});
test('whitespace protected names and breeding remain hidden through all old raw read paths',()=>{
 for(const species of ['동박새3 저어새2 까치5','동박새3 매2 까치5']) {
  assert.equal(isSensitiveReport({species:[species]}),true);
  assert.equal(isLocationRestricted({species}),true);
  assert.ok(publicPayload([{id:'x',species,lat:37,lon:127,observed_on:'2026-10-02'}]).spots.every(s=>s.locationHidden));
 }
 assert.equal(isLocationRestricted({species:'동박새3 까치5',note:'육추 관찰'}),true);
});
test('unconfirmed names/IPs remain separate; explicit ID membership yields 3 reports, 4 distinct species and earliest received nickname',async()=>{
 const db=seeded(),e=env(db),before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
 assert.equal((await stats(e)).body.reportCount,1);
 assert.equal((await get(e,'/contributors/all')).body.publicContributors,3);
 await confirm(db);
 const r=await stats(e);assert.equal(r.status,200);assert.equal(r.body.reportCount,3);assert.equal(r.body.speciesCount,4);
 assert.deepEqual((await get(e,'/contributors/all')).body.contributors,[{name:names[0],count:3}]);
 assert.deepEqual((await get(e,'/contributors/monthly',{month:'2026-10'})).body.contributors,[{name:names[0],count:3}]);
 assert.deepEqual((await get(e,'/reports/reporter-species',{reporter:names[1],source:'history',reportId:'b'})).body.species,['까치','동박새','박새','찌르레기']);
 const a=await adminStats(db,new URL('https://admin.example/admin/api/stats?view=reporters'),new Date(),ENV);
 assert.equal(a.rows.length,1);assert.equal(a.rows[0].reporter,names[0]);assert.equal(a.rows[0].species,4);assert.equal(a.rows[0].total,3);
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
 assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_events'),1);
});
test('only enumerated reports join; unlinked future/similar names stay separate; ambiguous public label fails closed',async()=>{
 const db=seeded([['d',names[0],'참새'],['e','들뫼  산새','고니']]),e=env(db);await confirm(db);
 assert.equal((await stats(e)).body.reportCount,3);
 assert.equal((await stats(e,names[0],{reportId:'d'})).body.reportCount,1);
 assert.equal((await stats(e,names[0],{source:'all',reportId:''})).status,404);
 assert.equal((await get(e,'/contributors/all')).body.publicContributors,3);
});
test('revoke invalidates cached publication, restores separate counts, and keeps immutable audit history',async()=>{
 const db=seeded(),e=env(db),g=await confirm(db),old=await url(e,'/reports/reporter-stats',{reporter:names[0],source:'history',reportId:'a'});
 await confirmedIdentityAction(db,{action:'revoke',groupId:g.groupId,confirmedSamePerson:true,reason:'확인 철회'},'reviewer@example.test');
 assert.equal((await publicHandler(new Request(old,{headers:ORIGIN}),e)).status,409);
 assert.equal((await stats(e)).body.reportCount,1);
 assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_events'),2);
 await assert.rejects(db.prepare('DELETE FROM reporter_identity_groups').run(),/identity_immutable/);
 await assert.rejects(db.prepare('UPDATE reporter_identity_events SET reason=?').bind('tamper').run(),/identity_immutable/);
 await assert.rejects(db.prepare('UPDATE reporter_identity_groups SET active=1').run(),/identity_immutable/);
});
test('each report retains consent; withdrawn first nickname cannot be exposed by linked public rows',async()=>{
 const db=seeded(),e=env(db);await confirm(db);
 await db.prepare("UPDATE reports SET name_public=0 WHERE id='b'").run();
 assert.equal((await stats(e)).body.reportCount,2);assert.equal((await stats(e)).body.speciesCount,3);
 assert.equal((await stats(e,names[1],{reportId:'b'})).status,404);
 await db.prepare("UPDATE reports SET name_public=0 WHERE id='a'").run();
 const result=await get(e,'/contributors/all');assert.deepEqual(result.body.contributors,[{name:names[2],count:1}]);
 assert.ok(!JSON.stringify(result.body).includes(names[0]));
 assert.equal((await stats(e,names[0],{source:'all',reportId:''})).status,404);
});
test('invalid, overlapping, unverified or empty-name membership rolls back; freeze prevents new identity writes',async()=>{
 const db=seeded();
 await assert.rejects(confirmedIdentityAction(db,{action:'confirm',reportIds:['a','b'],reason:'maybe'},'admin'),{code:'IDENTITY_CONFIRMATION_REQUIRED'});
 for(const ids of [['a','missing'],['a','a']])await assert.rejects(confirm(db,ids));
 assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_groups'),0);
 await confirm(db,['a','b']);await assert.rejects(confirm(db,['b','c']),{code:'IDENTITY_CONFLICT'});
 await db.prepare('UPDATE public_publication_state SET write_frozen=1,revision=revision+1 WHERE id=1').run();
 await assert.rejects(confirm(db,['a','c']));
 assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_groups'),1);
 const frozen=seeded();await frozen.prepare('UPDATE public_publication_state SET write_frozen=1,revision=revision+1 WHERE id=1').run();
 await assert.rejects(confirm(frozen),{code:'WRITE_MAINTENANCE'});assert.equal(frozen.count('SELECT COUNT(*) n FROM reporter_identity_groups'),0);
});
test('identity schema guard checked on every primary read; disabled feature preserves old schema',async()=>{
 const db=seeded(),e=env(db);await confirm(db);assert.equal((await stats(e)).status,200);
 db.sqlite.exec('DROP TRIGGER identity_groups_revoked');
 assert.equal((await stats(e)).status,503);
 const legacy=publicEnv(db,{REPORTS_PUBLICATION_REQUIRED:'true'});assert.equal((await stats(legacy)).body.reportCount,1);
});
test('admin confirmation route requires Access authentication; no unauthenticated identity mutation',async()=>{
 const db=seeded();const response=await adminHandler(new Request('https://admin.example/admin/api/reporter-identities',{method:'POST',body:'{}'}),{...environments(db).admin,...ENV});
 assert.notEqual(response.status,200);assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_groups'),0);
});

test('identity removal of a report keeps ordinary deletion available without leaking missing representative name',async()=>{
 const db=seeded(),e=env(db);await confirm(db);
 await db.prepare("DELETE FROM reports WHERE id='a'").run();
 assert.equal((await stats(e)).status,404);
 assert.ok(!(await get(e,'/contributors/all')).body.contributors.some(c=>c.name===names[0]));
});
test('protected/hidden/withdrawn members never reveal species list details after linking',async()=>{
 const db=seeded(),e=env(db);await confirm(db);
 await db.prepare("UPDATE reports SET species='저어새2 동박새3',note='비공개 메모',admin_note='SECRET' WHERE id='b'").run();
 const r=await get(e,'/reports/reporter-species',{reporter:names[0],source:'history',reportId:'a'});
 assert.equal(r.body.restricted,true);assert.deepEqual(r.body.species,['까치','동박새','박새']);
 assert.ok(!JSON.stringify(r.body).includes('저어새'));assert.ok(!JSON.stringify(r.body).includes('SECRET'));
 const count=await stats(e);assert.equal(count.body.speciesCount,4);
 assert.deepEqual(Object.keys(count.body).sort(),['publication','reportCount','serverTime','speciesCount']);
});
test('authenticated admin route confirms, reads audit and revokes; feature is off by default',async t=>{
 const auth=await installAuthStubs();t.after(auth.restore);
 const db=seeded(),e={...environments(db).admin,...ENV};
 const call=(method,body,overrides={})=>adminHandler(new Request('https://admin.example/admin/api/reporter-identities',{method,headers:{'Cf-Access-Jwt-Assertion':auth.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{...e,...overrides});
 assert.equal((await call('POST',{action:'confirm',reportIds:['a','b'],reason:'확인 완료',confirmedSamePerson:true},{REPORTS_CONFIRMED_IDENTITIES:'0'})).status,404);
 const confirmed=await call('POST',{action:'confirm',reportIds:['a','b','c'],reason:'본인 확인 완료',confirmedSamePerson:true});assert.equal(confirmed.status,200);const g=await confirmed.json();
 const history=await(await call('GET')).json();assert.equal(history.groups.length,1);assert.equal(history.events[0].action,'confirmed');
 const revoked=await call('POST',{action:'revoke',groupId:g.groupId,reason:'확인 철회'});assert.equal(revoked.status,200);
 assert.equal(db.count('SELECT COUNT(*) n FROM reporter_identity_events'),2);
});

test('new whitespace submission persists one report, original raw payload, three canonical sightings and ten birds',async t=>{
 const auth=await installAuthStubs();t.after(auth.restore);
 const {input,post}=await import('../local-test/helpers.mjs');
 const {kstDateString}=await import('../src/shared.js');
 const db=canonicalDb(),e=environments(db).pub;
 const original='동박새3 찌르레기2 까치5';
 const body=input(8401,{species:original,observedOn:kstDateString(new Date()),birdCount:null});
 const response=await post(e,body);assert.equal(response.status,201);
 assert.equal(db.count('SELECT COUNT(*) n FROM reports'),1);
 const sightings=db.sqlite.prepare('SELECT species_identified,count_value FROM sightings ORDER BY source_ordinal').all();
 assert.deepEqual(sightings.map(s=>[s.species_identified,s.count_value]),[['동박새',3],['찌르레기',2],['까치',5]]);
 const raw=db.sqlite.prepare('SELECT payload_json FROM raw_submissions').get();
 assert.equal(JSON.parse(raw.payload_json).input.species,original);
});

test('old whitespace spelling retains exact nonbreeding evidence; edits and invalid old spelling never confirm',()=>{
 for(const species of ['저어새2 까치3','동박새3 동박새3',Array(11).fill('매').join(' ')]) {
  const input={species,lat:37,lon:127,observedOn:'2026-10-02',note:null,non_breeding_confirmed:true};
  const stored=species;
  const row={species:stored,lat:37,lon:127,observed_on:'2026-10-02',note:null,non_breeding_confirmed:1,location_input:JSON.stringify(input)};
  assert.equal(reportBreedingStatus(row),'non_breeding');
  assert.equal(isLocationRestricted(row),false);
  for(const patch of [{species:stored+' 까치1'},{lat:37.1},{observed_on:'2026-10-03'},{note:'changed'}])assert.equal(reportBreedingStatus({...row,...patch}),'unknown');
 }
 const row={species:'저어새2 까치3',lat:37,lon:127,observed_on:'2026-10-02',non_breeding_confirmed:1,location_input:JSON.stringify({species:'저어새2 까치3',lat:37,lon:127,observedOn:'2026-10-02'})};
 assert.equal(reportBreedingStatus(row),'unknown');
 assert.equal(reportBreedingStatus({...row,note:'육추'}),'breeding');
 for(const species of ['저어새2/까치3','<저어새2 까치3>'])assert.equal(reportBreedingStatus({...row,species,location_input:JSON.stringify({species,lat:37,lon:127,observedOn:'2026-10-02',non_breeding_confirmed:true})}),'unknown');
});
