import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalDb} from './helpers.mjs';
import {confirmedIdentityAction,reporterKeySql,reporterNameSql} from '../src/reporter-identity.js';
const ddl=n=>readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8');
const action=(db,input)=>confirmedIdentityAction(db,{confirmedSamePerson:true,reason:'합성 동일인 확인',...input},'admin@example.test');
function add(db,id,reporter,species='참새'){
 db.sqlite.prepare("INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES(?,'approved',?,?,1,37,127,'2026-11-11','2026-11-11T00:00:00Z','SECRET-IP',?)")
 .run(id,species,reporter,id);
}
function setup(){
 const db=canonicalDb();db.sqlite.exec(ddl('0007_reporter_identity.sql'));db.sqlite.exec(ddl('0008_identity_append.sql'));
 add(db,'a','행복합니다','참새');add(db,'b','행복합니다김용선','박새');
 add(db,'c','행복합니다 김용선','동박새');add(db,'new','행복합니다 김용선','호사비오리');
 return db;
}
const current=(db,id)=>JSON.parse(db.sqlite.prepare('SELECT report_ids FROM reporter_identity_groups WHERE id=?').get(id).report_ids);
test('append keeps one identity ID, original reports, count, and audited membership',async()=>{
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});
 const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
 const prev=db.sqlite.prepare('SELECT revision FROM public_publication_state WHERE id=1').get().revision;
 const r=await action(db,{action:'append',groupId:g.groupId,reportIds:['new']});
 assert.deepEqual({groupId:r.groupId,added:r.added,total:r.total},{groupId:g.groupId,added:1,total:4});
 assert.deepEqual(current(db,g.groupId),['a','b','c','new']);
 const events=db.sqlite.prepare('SELECT action,added_report_ids FROM reporter_identity_events ORDER BY event_id').all();
 assert.deepEqual(events.map(x=>x.action),['confirmed','appended']);
 assert.equal(events[1].added_report_ids,'["new"]');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM reporter_identity_groups WHERE active=1').get().n,1);
 assert.ok(db.sqlite.prepare('SELECT revision FROM public_publication_state WHERE id=1').get().revision>prev);
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
 const env={REPORTS_CONFIRMED_IDENTITIES:'1'};
 assert.equal(db.sqlite.prepare('SELECT '+reporterKeySql(env,'r')+' AS k FROM reports r WHERE r.id=?').get('new').k,'group:'+g.groupId);
 assert.equal(db.sqlite.prepare('SELECT '+reporterNameSql(env,'r')+' AS n FROM reports r WHERE r.id=?').get('new').n,'행복합니다');
});
test('invalid or cross-group membership fails without mutation',async()=>{
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});
 add(db,'outside','다른 이름');add(db,'outside2','다른 이름');
 await action(db,{action:'confirm',reportIds:['outside','outside2']});
 const count=db.sqlite.prepare('SELECT COUNT(*) n FROM reporter_identity_events').get().n;
 for(const ids of [['a'],['absent'],['outside'],['new','new']])
  await assert.rejects(action(db,{action:'append',groupId:g.groupId,reportIds:ids}),e=>[400,409].includes(e.status));
 assert.deepEqual(current(db,g.groupId),['a','b','c']);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM reporter_identity_events').get().n,count);
});
test('revoke still works and missing migration denies append',async()=>{
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});
 await action(db,{action:'append',groupId:g.groupId,reportIds:['new']});
 await confirmedIdentityAction(db,{action:'revoke',groupId:g.groupId,reason:'검증 철회'},'admin@example.test');
 assert.deepEqual(db.sqlite.prepare('SELECT action FROM reporter_identity_events ORDER BY event_id').all().map(x=>x.action),['confirmed','appended','revoked']);
 await assert.rejects(action(db,{action:'append',groupId:g.groupId,reportIds:['new']}),{code:'IDENTITY_NOT_FOUND'});
 const old=canonicalDb();old.sqlite.exec(ddl('0007_reporter_identity.sql'));
 add(old,'a','행복합니다');add(old,'b','행복합니다김용선');add(old,'c','행복합니다 김용선');
 const group=await action(old,{action:'confirm',reportIds:['a','b']});
 await assert.rejects(action(old,{action:'append',groupId:group.groupId,reportIds:['c']}),{code:'IDENTITY_UNAVAILABLE'});
});
test('unclaimed SQL cannot bypass membership and a missing confirmation is rejected',async()=>{
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});
 assert.throws(()=>db.sqlite.prepare('UPDATE reporter_identity_groups SET report_ids=? WHERE id=?').run('["a","b","c","new"]',g.groupId));
 await assert.rejects(confirmedIdentityAction(db,{action:'append',groupId:g.groupId,reportIds:['new'],reason:'확인'},'admin@example.test'),{code:'IDENTITY_CONFIRMATION_REQUIRED'});
 assert.deepEqual(current(db,g.groupId),['a','b','c']);
});

import {publicEnv, ORIGIN} from './helpers.mjs';
import {handleRequest as publicHandle} from '../src/public.js';
const AUTO={REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_IDENTITY_AUTO_ALIASES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
async function publicStats(db,reporter,reportId,env=AUTO,query=null) {
 const e=publicEnv(db,env),call=p=>publicHandle(new Request('https://reports.example'+p,{headers:ORIGIN}),e);
 if(!query){const h=await(await call('/reports/public-state?nonce='+'a'.repeat(32))).json();
 query='/reports/reporter-stats?'+new URLSearchParams({contract:'publication-v1',nonce:'a'.repeat(32),expectedEpoch:h.publication.epoch,expectedRevision:h.publication.revision,reporter,source:'history',reportId});}
 const response=await call(query);return {status:response.status,body:await response.json(),query};
}
test('23 public members keep UUID and representative; only one missing report is appended, then all three aliases auto-accumulate',async()=>{
 const db=setup(),ids=['a','b','c'];
 for(let i=3;i<23;i++){const id='old-'+i;add(db,id,['행복합니다','행복합니다김용선','행복합니다 김용선'][i%3]);ids.push(id);}
 const g=await action(db,{action:'confirm',reportIds:ids});
 const oldGroup={...db.sqlite.prepare('SELECT * FROM reporter_identity_groups WHERE id=?').get(g.groupId)};
 const originals=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
 // The missing row predates confirmation, so auto-attribution cannot repair it.
 const off={...AUTO,REPORTS_IDENTITY_AUTO_ALIASES:'0'};
 assert.equal((await publicStats(db,'행복합니다 김용선','new')).body.reportCount,1);
 const stale=await publicStats(db,'행복합니다','a',off);
 assert.equal(stale.body.reportCount,23);
 const result=await action(db,{action:'append',groupId:g.groupId,reportIds:['new']});
 assert.equal(result.added,1);assert.equal(result.total,24);assert.equal(result.groupId,g.groupId);
 const updated=db.sqlite.prepare('SELECT * FROM reporter_identity_groups WHERE id=?').get(g.groupId);
 for(const key of ['id','representative_id','confirmed_by','evidence','created_at','active'])assert.equal(updated[key],oldGroup[key],key);
 assert.deepEqual(current(db,g.groupId),[...ids,'new']);
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),originals);
 assert.equal((await publicStats(db,'행복합니다','a',off,stale.query)).status,409);
 for(const env of [off,AUTO]){
  const got=await publicStats(db,'행복합니다 김용선','new',env);
  assert.equal(got.status,200);assert.equal(got.body.reportCount,24);assert.equal(got.body.speciesCount,4);
  assert.deepEqual(Object.keys(got.body).sort(),['publication','reportCount','serverTime','speciesCount']);
 }
 // Future reports use the original confirmed aliases without changing membership.
 const after=new Date(Date.parse(oldGroup.created_at)+60000).toISOString();
 for(const [i,name] of ['행복합니다','행복합니다김용선','행복합니다 김용선'].entries()){
  add(db,'future-'+i,name);db.sqlite.prepare('UPDATE reports SET received_at=? WHERE id=?').run(after,'future-'+i);
  assert.equal(db.sqlite.prepare('SELECT '+reporterKeySql(AUTO)+' AS k FROM reports WHERE id=?').get('future-'+i).k,'group:'+g.groupId);
 }
 assert.equal((await publicStats(db,'행복합니다','a')).body.reportCount,27);
 assert.deepEqual(current(db,g.groupId),[...ids,'new']);
 assert.deepEqual(db.sqlite.prepare('SELECT action FROM reporter_identity_events ORDER BY event_id').all().map(r=>r.action),['confirmed','appended']);
});
test('27 stored members with 23 public consents retain all private members and consent gates after one append',async()=>{
 const db=setup(),ids=['a','b','c'];
 for(let i=3;i<27;i++){const id='stored-'+i;add(db,id,'행복합니다');ids.push(id);
  if(i>=23)db.sqlite.prepare('UPDATE reports SET name_public=0 WHERE id=?').run(id);}
 const g=await action(db,{action:'confirm',reportIds:ids});
 const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
 assert.equal((await publicStats(db,'행복합니다','a')).body.reportCount,23);
 const result=await action(db,{action:'append',groupId:g.groupId,reportIds:['new']});
 assert.equal(result.total,28);assert.deepEqual(current(db,g.groupId),[...ids,'new']);
 assert.equal((await publicStats(db,'행복합니다 김용선','new')).body.reportCount,24);
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
});
test('concurrent append rejects a stale member snapshot without losing the winning append',async()=>{
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});add(db,'other','행복합니다');
 let raced=false;
 const racing={prepare:db.prepare.bind(db),async batch(list){
  if(!raced){raced=true;await action(db,{action:'append',groupId:g.groupId,reportIds:['other']});}
  return db.batch(list);
 }};
 await assert.rejects(action(racing,{action:'append',groupId:g.groupId,reportIds:['new']}),{code:'IDENTITY_CONFLICT'});
 assert.deepEqual(current(db,g.groupId),['a','b','c','other']);
 assert.deepEqual(db.sqlite.prepare("SELECT added_report_ids FROM reporter_identity_events WHERE action='appended'").all().map(x=>x.added_report_ids),['["other"]']);
});
test('append rejects more than 200 total members and a forged group or representative',async()=>{
 const db=setup(),ids=['a','b','c'];
 for(let i=3;i<200;i++){add(db,'limit-'+i,'행복합니다');ids.push('limit-'+i);}
 const g=await action(db,{action:'confirm',reportIds:ids});
 await assert.rejects(action(db,{action:'append',groupId:g.groupId,reportIds:['new']}),{code:'IDENTITY_CONFLICT'});
 for(const column of ['id','representative_id']){
  await assert.rejects(db.prepare('UPDATE reporter_identity_groups SET '+column+'=? WHERE id=?').bind('forged',g.groupId).run(),/identity_immutable/);
 }
 assert.deepEqual(current(db,g.groupId),ids);
});

import {handleRequest as adminHandle} from '../src/admin.js';
import {environments,installAuthStubs} from '../local-test/helpers.mjs';
test('append API requires authenticated admin and explicit confirmation, and leaves public location protection unchanged',async t=>{
 const auth=await installAuthStubs();t.after(auth.restore);
 const db=setup(),g=await action(db,{action:'confirm',reportIds:['a','b','c']});
 const env={...environments(db).admin,...AUTO};
 const call=(body,token)=>adminHandle(new Request('https://admin.example/admin/api/reporter-identities',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'Cf-Access-Jwt-Assertion':token}:{})},body:JSON.stringify(body)}),env);
 const body={action:'append',groupId:g.groupId,reportIds:['new'],reason:'합성 관리자 확인',confirmedSamePerson:true};
 assert.ok([401,403].includes((await call(body)).status));
 assert.equal((await call({...body,confirmedSamePerson:false},auth.token)).status,400);
 assert.deepEqual(current(db,g.groupId),['a','b','c']);
 const before=JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all());
 const response=await call(body,auth.token);assert.equal(response.status,200);
 assert.equal((await response.json()).added,1);
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT * FROM reports ORDER BY id').all()),before);
 const e=publicEnv(db,AUTO),n='a'.repeat(32);
 const get=p=>publicHandle(new Request('https://reports.example'+p,{headers:ORIGIN}),e);
 const h=await(await get('/reports/public-state?nonce='+n)).json();
 const q=new URLSearchParams({contract:'publication-v1',nonce:n,expectedEpoch:h.publication.epoch,expectedRevision:h.publication.revision});
 const approved=await(await get('/reports/approved?'+q)).json();
 // 호사비오리 has no nonbreeding evidence in this synthetic fixture.
 assert.ok(!approved.spots.some(s=>s.id==='new'));
 assert.ok(!Object.values(approved.fixedSpots).some(s=>s.history.some(r=>r.id==='new')));
});
