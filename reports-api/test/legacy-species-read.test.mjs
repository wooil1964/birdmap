import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_BIRD_NAMES } from '../src/official-bird-names.js';
import { legacySpeciesItems, speciesNamesOf, publicSightingsOf } from '../src/shared.js';
import { adminStats } from '../src/admin-stats.js';
import { reporterLifetimeCounts, reporterSpeciesNames } from '../src/publication.js';
import { canonicalDb } from './helpers.mjs';

test('공식 2025 v2.1 Species 국명 전체 일치만, 잘못된 수량·동의어·부분 일치는 분리하지 않음', () => {
  assert.equal(OFFICIAL_BIRD_NAMES.length,598);
  assert.equal(new Set(OFFICIAL_BIRD_NAMES).size,598);
  for (const name of OFFICIAL_BIRD_NAMES) for (const suffix of ['3',' 3',' 3마리',' 3개체'])
    assert.deepEqual(legacySpeciesItems(name+suffix),[{name,count:3,countStatus:'reported'}]);
  for (const raw of ['고니03','고니0','고니-3','고니3.5','고니3쌍','고니약3','고니3~5','고니100001','고니류3','백조3','가짜새3','Cygnus columbianus3','고니3?'])
    assert.deepEqual(legacySpeciesItems(raw),[{name:raw,count:null,countStatus:'uncertain'}],raw);
  assert.deepEqual(legacySpeciesItems('고니3, 고니5 / 박새'),[{name:'고니',count:null,countStatus:'uncertain'},{name:'박새',count:null,countStatus:'not_recorded'}]);
});

test('정본 식별값·관리자 수정값이 과거 원문보다 우선하고 불확실 수량은 공개 합산하지 않음', () => {
  const row={species:'고니3',identified_species:'["박새"]',public_sightings:JSON.stringify([{name:'박새',count:8,state:'single'}])};
  assert.deepEqual(speciesNamesOf(row),['박새']);
  assert.deepEqual(publicSightingsOf(row),[{name:'박새',count:8,countStatus:'reported'}]);
  assert.equal(publicSightingsOf({...row,public_sightings:JSON.stringify([{name:'박새',count:8,state:'unknown'}])})[0].count,null);
  assert.deepEqual(reporterLifetimeCounts([{species:'고니3'},{species:'고니'},{species:'고니5 · 박새'}]),{speciesCount:2,reportCount:3});
  assert.deepEqual(reporterSpeciesNames([{species:'고니3'},{species:'고니'},{species:'박새2',location_hidden:1}]),{species:['고니'],restricted:true});
});

test('과거 승인 통계 모든 뷰·종 필터는 고니3=고니; 읽기가 원본 DB 어느 행도 변경하지 않음',async()=>{
  const db=canonicalDb();
  const insert=db.sqlite.prepare("INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,reporter,name_public,ip_hash,dedupe_hash) VALUES (?,?,?,37,127,'2020-01-01','2020-01-02','관찰자',1,'s',?)");
  for(const [id,status,species] of [['old1','approved','고니3'],['old2','approved','고니'],['old3','approved','고니5 · 박새'],['unknown','approved','가짜새3'],['pending','pending','고니7']])insert.run(id,status,species,id);
  const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
  const changes=db.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const stats=q=>adminStats(db,new URL('https://synthetic.invalid/admin/api/stats?'+q));
  for(const view of ['summary','species','sites','reporters','monthly','yearly','list']) {
    const body=await stats('view='+view);
    assert.equal(body.summary.species,3,view);assert.equal(body.summary.individuals,8,view);
  }
  const filtered=await stats('view=species&species='+encodeURIComponent('고니'));
  assert.equal(filtered.summary.approved,3);assert.equal(filtered.summary.species,1);assert.equal(filtered.rows[0].total,3);assert.equal(filtered.rows[0].individuals,8);
  assert.equal((await stats('view=list&species='+encodeURIComponent('고니'))).rows.find(r=>r.id==='old1').species,'고니3');
  assert.equal((await stats('status=pending&view=species')).rows[0].species,'고니7','미승인 과거 자료는 자동 재해석하지 않음');
  assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
  assert.equal(db.sqlite.prepare('SELECT total_changes() AS n').get().n,changes,'읽기 중 어느 표에도 쓰기 없음');
});

test('sightings가 없는 이전 스키마도 공식 국명 읽기 집계·종 필터 지원',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("CREATE TABLE reports(id TEXT,status TEXT,species TEXT,observed_on TEXT,received_at TEXT,site_id TEXT,reporter TEXT);INSERT INTO reports VALUES('old','approved','고니3','2020-01-01','2020-01-02',NULL,NULL),('bare','approved','고니','2020-01-01','2020-01-02',NULL,NULL)");
 const db={prepare(sql){let values=[];return {bind(...v){values=v;return this;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async first(){return sqlite.prepare(sql).get(...values);}};}};
 const result=await adminStats(db,new URL('https://synthetic.invalid/admin/api/stats?view=species&species='+encodeURIComponent('고니')));
 assert.equal(result.summary.species,1);assert.equal(result.summary.individuals,3);assert.equal(result.rows[0].total,2);
 sqlite.close();
});

test('공식 국명 미확인 과거 승인 기록은 상태·원문을 유지하며 관리자 검토 대상으로 표시',async t=>{
 const {environments,installAuthStubs}=await import('../local-test/helpers.mjs');const auth=await installAuthStubs();t.after(auth.restore);
 const admin=(await import('../src/admin.js')).default;const db=canonicalDb();
 const insert=db.sqlite.prepare("INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,bird_count,ip_hash,dedupe_hash) VALUES (?,'approved',?,37,127,'2020-01-01','2020-01-02',?, 's',?)");
 insert.run('review-original','힝등새1',7,'review-original');insert.run('known-original','고니3',3,'known-original');
 const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());const changes=db.sqlite.prepare('SELECT total_changes() n').get().n;
 const response=await admin.fetch(new Request('https://admin.example/admin/api/reports?status=approved',{headers:{'Cf-Access-Jwt-Assertion':auth.token}}),environments(db).admin);
 const rows=(await response.json()).reports;assert.equal(response.status,200);
 const unknown=rows.find(r=>r.id==='review-original'),known=rows.find(r=>r.id==='known-original');
 assert.equal(unknown.status,'approved');assert.equal(unknown.species,'힝등새1');assert.equal(unknown.bird_count,7);assert.equal(unknown.species_review_required,true);assert.deepEqual(unknown.unconfirmed_species,['힝등새1']);
 assert.equal(known.species_review_required,undefined);assert.equal(known.species,'고니3');
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);assert.equal(db.sqlite.prepare('SELECT total_changes() n').get().n,changes);
 const {ADMIN_PAGE}=await import('../src/admin-page.js');assert.ok(ADMIN_PAGE.includes('공식 국명 확인 필요 · 관리자 검토 대상(원문 유지)'));
});
