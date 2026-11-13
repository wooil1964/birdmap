import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalDb,publicEnv,ORIGIN} from './helpers.mjs';
import {confirmedIdentityAction,reporterKeySql,reporterNameSql,identityAutoAliasEnabled} from '../src/reporter-identity.js';
import {adminStats} from '../src/admin-stats.js';
import {handleRequest as publicHandle} from '../src/public.js';

const AUTO={REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_IDENTITY_AUTO_ALIASES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
const OFF={REPORTS_CONFIRMED_IDENTITIES:'1',REPORTS_PUBLICATION_REQUIRED:'true'};
const N='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const D='44444444-4444-4444-8444-444444444444';
const E='55555555-5555-4555-8555-555555555555';
const F='66666666-6666-4666-8666-666666666666';
const G='77777777-7777-4777-8777-777777777777';
const migration=readFileSync(new URL('../migrations/0007_reporter_identity.sql',import.meta.url),'utf8');
const select=(db,sql,...values)=>db.sqlite.prepare(sql).get(...values);
function add(db,id,reporter,species='참새',options={}){
 const received=options.received || '2026-10-01T00:00:00.000Z';
 db.sqlite.prepare("INSERT INTO reports(id,status,species,reporter,name_public,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES(?,?,?,?,?,37,127,'2026-10-01',?,'PRIVATE_HASH',?)")
 .run(id,options.status||'approved',species,reporter,options.namePublic??1,received,id);
}
async function confirm(db,reportIds){
 return confirmedIdentityAction(db,{action:'confirm',reportIds,confirmedSamePerson:true,reason:'합성 테스트 수동 본인 확인'},'admin@example.test');
}
async function fixture(){
 const db=canonicalDb();db.sqlite.exec(migration);
 add(db,A,'행복합니다','참새');
 add(db,B,'행복합니다김용선','박새');
 add(db,C,'행복합니다 김용선','동박새');
 const group=await confirm(db,[A,B,C]);
 const after=new Date(Date.parse(select(db,'SELECT created_at FROM reporter_identity_groups WHERE id=?',group.groupId).created_at)+60000).toISOString();
 return {db,group,after};
}
const identity=(db,id,env)=>select(db,'SELECT '+reporterKeySql(env,'r')+' AS k, '+reporterNameSql(env,'r')+' AS name FROM reports r WHERE r.id=?',id);
async function admin(db,env){return adminStats(db,new URL('https://admin.example/admin/api/stats?view=reporters'),new Date(),env);}
async function publicStats(db,reporter,reportId,env=AUTO){
 const e=publicEnv(db,env);const call=p=>publicHandle(new Request('https://reports.example'+p,{headers:ORIGIN}),e);
 const state=await(await call('/reports/public-state?nonce='+N)).json();
 const path='/reports/reporter-stats?'+new URLSearchParams({
  contract:'publication-v1',nonce:N,expectedEpoch:state.publication.epoch,expectedRevision:state.publication.revision,
  reporter,source:'history',reportId});
 const res=await call(path);return {status:res.status,body:await res.json(),env:e};
}
test('disabled by default and any missing identity flag leaves new reports unlinked',async()=>{
 const {db,group,after}=await fixture();
 add(db,D,'행복합니다 김용선','호사비오리',{received:after});
 assert.equal(identityAutoAliasEnabled(OFF),false);
 assert.equal(identityAutoAliasEnabled({...OFF,REPORTS_IDENTITY_AUTO_ALIASES:'1',REPORTS_CONFIRMED_IDENTITIES:'0'}),false);
 assert.equal(identity(db,D,OFF).k,'name:행복합니다 김용선');
 assert.equal(identity(db,D,AUTO).k,'group:'+group.groupId);
 assert.deepEqual(JSON.parse(select(db,'SELECT report_ids FROM reporter_identity_groups WHERE id=?',group.groupId).report_ids),[A,B,C]);
});
test('all three confirmed exact aliases share one stable internal group key for future approved reports',async()=>{
 const {db,group,after}=await fixture();
 add(db,D,'행복합니다 김용선','호사비오리',{received:after});
 add(db,E,'행복합니다김용선','까치',{received:after});
 add(db,F,'행복합니다','찌르레기',{received:after});
 for(const id of [A,B,C,D,E,F]){
  const row=identity(db,id,AUTO);
  assert.equal(row.k,'group:'+group.groupId);assert.equal(row.name,'행복합니다');
 }
 const rows=(await admin(db,AUTO)).rows;
 assert.equal(rows.filter(x=>x.reporter_key==='group:'+group.groupId).length,1);
 assert.equal(rows.find(x=>x.reporter_key==='group:'+group.groupId).total,6);
 assert.equal(select(db,'SELECT COUNT(*) n FROM reporter_identity_events').n,1);
 assert.equal(JSON.parse(select(db,'SELECT report_ids FROM reporter_identity_groups WHERE id=?',group.groupId).report_ids).length,3);
 const pub=await publicStats(db,'행복합니다 김용선',D);
 assert.equal(pub.status,200);
 assert.equal(pub.body.reportCount,6);assert.equal(pub.body.speciesCount,6);
 for(const word of ['PRIVATE_HASH',group.groupId,D,'lat','lon'])assert.ok(!JSON.stringify(pub.body).includes(word),word);
});
test('old unconfirmed and unregistered similar aliases do not join automatically',async()=>{
 const {db,after}=await fixture();
 add(db,D,'행복합니다 김용선','호사비오리',{received:'2020-01-01T00:00:00.000Z'});
 add(db,E,'행복합니다김용썬','까치',{received:after});
 assert.equal(identity(db,D,AUTO).k,'name:행복합니다 김용선');
 assert.equal(identity(db,E,AUTO).k,'name:행복합니다김용썬');
});
test('same alias confirmed in two distinct groups disables auto-attachment, while explicit links keep their groups',async()=>{
 const {db,group,after}=await fixture();
 add(db,D,'행복합니다 김용선','까치',{received:'2026-10-01T00:00:00.000Z'});
 add(db,E,'다른 닉네임','직박구리',{received:'2026-10-01T00:00:00.000Z'});
 const other=await confirm(db,[D,E]);
 add(db,F,'행복합니다 김용선','멧새',{received:after});
 assert.equal(identity(db,C,AUTO).k,'group:'+group.groupId);
 assert.equal(identity(db,D,AUTO).k,'group:'+other.groupId);
 assert.equal(identity(db,F,AUTO).k,'name:행복합니다 김용선');
});
test('revoked group never receives future auto-linked reports',async()=>{
 const {db,group,after}=await fixture();
 await confirmedIdentityAction(db,{action:'revoke',groupId:group.groupId,reason:'동일인 연결 철회'},'admin@example.test');
 add(db,D,'행복합니다 김용선','호사비오리',{received:after});
 assert.equal(identity(db,D,AUTO).k,'name:행복합니다 김용선');
});
test('private or unapproved historical aliases cannot authorize public auto-link',async()=>{
 const db=canonicalDb();db.sqlite.exec(migration);
 add(db,A,'공개닉','참새');add(db,B,'비공개 별칭','까치',{namePublic:0});
 const group=await confirm(db,[A,B]);
 const after=new Date(Date.parse(select(db,'SELECT created_at FROM reporter_identity_groups WHERE id=?',group.groupId).created_at)+60000).toISOString();
 add(db,D,'비공개 별칭','박새',{received:after});
 assert.equal(identity(db,D,AUTO).k,'name:비공개 별칭');
});
test('new approved row follows public consent and status gates even with matching alias',async()=>{
 const {db,after}=await fixture();
 add(db,D,'행복합니다 김용선','호사비오리',{received:after,namePublic:0});
 add(db,E,'행복합니다 김용선','고니',{received:after,status:'pending'});
 const got=await publicStats(db,'행복합니다',A);
 assert.equal(got.status,200);
 assert.equal(got.body.reportCount,3);
 assert.equal(got.body.speciesCount,3);
});
