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
