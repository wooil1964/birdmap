import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/public.js';
import { fieldViewer, fieldVisible, fieldSnapshotPayload } from '../src/field-updates.js';
import { ORIGIN, fakeDb, publicEnv, withTurnstile } from './helpers.mjs';
import { trustedFixtureSqlite } from './fixture-writer.mjs';

const OWNER='visibility-owner-aaaaaaaa',OTHER='visibility-reader-bbbbbbbb',NONCE='f'.repeat(32);
let seq=0;
const viewer=(patch={})=>({lat:37.5,lon:127,accuracy:0,capturedAt:Date.now(),...patch});
async function call(env,path,{method='GET',body,ip}={}){
 const request=new Request('https://reports.test'+path,{method,headers:{...ORIGIN,'Content-Type':'application/json','CF-Connecting-IP':ip||'198.18.'+Math.floor(++seq/200)+'.'+(seq%200+1)},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await withTurnstile(true,()=>handleRequest(request,env));return {status:response.status,headers:response.headers,body:await response.json()};
}
async function create(env,patch={}){
 const result=await call(env,'/field-updates',{method:'POST',body:{species:'참새',status:'visible',lat:37.5,lon:127,deviceId:OWNER,turnstileToken:'synthetic',...patch}});
 assert.equal(result.status,201,JSON.stringify(result.body));return result.body.update||result.body;
}
async function published(env,path,body){
 const head=await call(env,'/reports/public-state?nonce='+NONCE);assert.equal(head.status,200,JSON.stringify(head.body));
 const a=head.body.publication,q=new URLSearchParams({contract:'publication-v1',nonce:NONCE,expectedEpoch:a.epoch,expectedRevision:a.revision});
 return call(env,path+'?'+q,{...(body===undefined?{}:{method:'POST',body})});
}
const setup=(required=false)=>publicEnv(fakeDb(),{REPORTS_PUBLICATION_REQUIRED:required?'true':'false'});
const nearby=(env,gps=viewer())=>call(env,'/field-updates/read',{method:'POST',body:{viewer:gps}});
const hidden=(body,id)=>{assert.equal(JSON.stringify(body).includes(id),false);assert.equal(body.update,undefined);};

test('Issue28: 신규 기본10km, 네 가지 범위만 허용, GPS 없는 직접 GET은 전체 공개만 반환',async()=>{
 const env=setup(),made=await create(env),all=await create(env,{species:'박새',visibilityRadius:'all'});
 assert.equal(made.visibilityRadius,'10');
 assert.equal((await env.REPORTS_DB.prepare('SELECT visibility_radius AS radius FROM field_updates WHERE id=?1').bind(made.id).first()).radius,'10');
 const read=await call(env,'/field-updates?lat=37.5&lon=127&radius=100');
 assert.deepEqual(read.body.updates.map(r=>r.id),[all.id]);hidden(read.body,made.id);
 assert.equal(read.headers.get('Cache-Control'),'no-store');
 for(const value of [5,10,20,0,'0','100',null,'ALL',{},[]]){
  const result=await call(env,'/field-updates',{method:'POST',body:{species:'참새',status:'visible',lat:37.5,lon:127,deviceId:OWNER,turnstileToken:'t',visibilityRadius:value}});
  assert.equal(result.status,400,JSON.stringify(value));assert.equal(result.body.error.code,'FIELD_VISIBILITY_INVALID');
 }
});

test('Issue28: 5·10·20km 경계와 GPS 정확도는 서버에서 보수적으로 판정',async()=>{
 const env=setup();
 for(const radius of ['5','10','20']){
  const made=await create(env,{visibilityRadius:radius});
  const delta=Number(radius)/(6371.0088*Math.PI/180);
  assert.equal(fieldVisible({species:'참새',visibility_radius:radius,public_lat:37.5,public_lon:127},viewer({lat:37.5+delta})),true,'정확한 경계 '+radius);
  const inside=await nearby(env,viewer({lat:37.5+delta-0.00001}));
  assert.ok(inside.body.updates.some(r=>r.id===made.id),radius);
  const outside=await nearby(env,viewer({lat:37.5+delta+0.00001}));
  hidden(outside.body,made.id);
  const uncertain=await nearby(env,viewer({lat:37.5+delta-0.00001,accuracy:20}));
  hidden(uncertain.body,made.id);
 }
});

test('Issue28: D1 조회 중 GPS가 오래되면 응답 작성 때 다시 닫힘',()=>{
 const now=new Date(),row={id:'slow-read',species:'참새',status:'visible',visibility_radius:'10',public_lat:37.5,public_lon:127,last_activity_at:now.toISOString(),created_at:now.toISOString(),updated_at:now.toISOString()};
 const result=fieldSnapshotPayload([{results:[row]},{results:[]},{results:[]}],new Date(now.getTime()-60000),viewer({capturedAt:now.getTime()-31000}));
 assert.deepEqual(result.updates,[]);
});

test('Issue28: 실패·누락·오래된·잘못된 GPS는 전체 공개만 반환하고 좌표를 반향하지 않음',async()=>{
 const env=setup(),restricted=await create(env),all=await create(env,{visibilityRadius:'all'});
 for(const gps of [null,{},viewer({capturedAt:Date.now()-30001}),viewer({capturedAt:Date.now()+10000}),viewer({accuracy:1001}),viewer({accuracy:-1}),viewer({lat:'37.5'}),viewer({lat:90}),viewer({lon:null}),viewer({capturedAt:null})]){
  assert.equal(fieldViewer(gps),null);
  const result=await nearby(env,gps);assert.equal(result.status,200);hidden(result.body,restricted.id);
  assert.deepEqual(result.body.updates.map(r=>r.id),[all.id]);assert.equal(result.body.viewer,undefined);
 }
});

test('Issue28: publication POST와 기존 GET 우회 방지, 새 공개 권한 없이는 내용이 없음',async()=>{
 const env=setup(true),made=await create(env),all=await create(env,{visibilityRadius:'all'});
 const noContract=await call(env,'/field-updates/read',{method:'POST',body:{viewer:viewer()}});
 assert.equal(noContract.status,400);hidden(noContract.body,made.id);
 const legacy=await published(env,'/field-updates');assert.deepEqual(legacy.body.updates.map(r=>r.id),[all.id]);
 const close=await published(env,'/field-updates/read',{viewer:viewer()});assert.ok(close.body.updates.some(r=>r.id===made.id));
 assert.equal(close.body.publication.contract,'publication-v1');assert.equal(close.headers.get('Cache-Control'),'no-store');
 assert.equal(close.body.fieldIntegrationVersion,'radius-report-v1');
 const far=await published(env,'/field-updates/read',{viewer:viewer({lat:38})});hidden(far.body,made.id);
 const h=await call(env,'/reports/public-state?nonce='+NONCE),a=h.body.publication;
 await create(env,{visibilityRadius:'all'});
 const changed=await call(env,'/field-updates/read?'+new URLSearchParams({contract:'publication-v1',nonce:NONCE,expectedEpoch:a.epoch,expectedRevision:a.revision}),{method:'POST',body:{viewer:viewer()}});
 assert.equal(changed.status,409);assert.equal(changed.body.updates,undefined);
});

test('Issue28: 범위 밖 상태·확인·타인 삭제는 미존재와 같은404, 행·이력·TTL 불변',async()=>{
 const env=setup(),made=await create(env),before=await env.REPORTS_DB.prepare('SELECT * FROM field_updates WHERE id=?1').bind(made.id).first();
 for(const action of ['status','confirm','delete']){
  for(const id of [made.id,'00000000-0000-0000-0000-000000000000']){
   const result=await call(env,`/field-updates/${id}/${action}`,{method:'POST',body:{deviceId:OTHER,status:'not_visible',turnstileToken:'t',viewer:viewer({lat:38})}});
   assert.equal(result.status,404);assert.equal(result.body.error.code,'FIELD_NOT_FOUND');assert.equal(result.body.update,undefined);
  }
 }
 assert.deepEqual(await env.REPORTS_DB.prepare('SELECT * FROM field_updates WHERE id=?1').bind(made.id).first(),before);
 const confirmed=await call(env,`/field-updates/${made.id}/confirm`,{method:'POST',body:{deviceId:OTHER,viewer:viewer()}});
 assert.equal(confirmed.status,201);assert.equal(confirmed.body.update.confirmCount,1);
 const status=await call(env,`/field-updates/${made.id}/status`,{method:'POST',body:{deviceId:OTHER,status:'not_visible',turnstileToken:'t',viewer:viewer()}});
 assert.equal(status.status,201);assert.equal(status.body.update.status,'not_visible');
 const ownDelete=await call(env,`/field-updates/${made.id}/delete`,{method:'POST',body:{deviceId:OWNER}});
 assert.equal(ownDelete.status,200);assert.equal((await nearby(env)).body.updates.length,0);
});

test('Issue28: 만료된 범위 밖 소식은410 대신 미존재404로 닫힘',async()=>{
 const env=setup(),made=await create(env);
 await env.REPORTS_DB.prepare('UPDATE field_updates SET last_activity_at=?2 WHERE id=?1').bind(made.id,new Date(Date.now()-9*3600000).toISOString()).run();
 const result=await call(env,`/field-updates/${made.id}/confirm`,{method:'POST',body:{deviceId:OTHER,viewer:viewer({lat:38})}});
 assert.equal(result.status,404);assert.equal(result.body.error.code,'FIELD_NOT_FOUND');
});

test('Issue28: 민감종 제한 공개는 GPS 위조·경계 탐색으로도 노출하지 않고 전체 공개는 고정 대략 좌표만',async()=>{
 const env=setup(true),restricted=await create(env,{species:'저어새1'}),all=await create(env,{species:'저어새 2마리',visibilityRadius:'all'});
 for(const gps of [viewer(),viewer({lat:37.50001}),viewer({lat:37.55}),viewer({lat:38}),null]){
  const result=await published(env,'/field-updates/read',{viewer:gps});hidden(result.body,restricted.id);
  const item=result.body.updates.find(r=>r.id===all.id);assert.equal(item.locationHidden,true);assert.notEqual(item.lat,37.5);assert.notEqual(item.lon,127);
 }
 const draft=await published(env,`/field-updates/${restricted.id}/report-draft`,{deviceId:OWNER});
 assert.equal(draft.status,200);assert.equal(draft.body.draft.lat,null);assert.equal(draft.body.draft.lon,null);assert.equal(draft.body.draft.locationHidden,true);
});

test('Issue28: 본인 초안은 기존 허용 종명·시각·공개 좌표만 재사용하고 자동 제보·쓰기 없음',async()=>{
 const env=setup(true),made=await create(env),before=await env.REPORTS_DB.prepare('SELECT * FROM field_updates WHERE id=?1').bind(made.id).first();
 const draft=await published(env,`/field-updates/${made.id}/report-draft`,{deviceId:OWNER});
 assert.equal(draft.status,200);assert.deepEqual(draft.body.draft,{id:made.id,species:'참새',firstSeenAt:before.created_at,lat:37.5,lon:127,locationHidden:false});
 assert.equal(env.REPORTS_DB.rows.length,0);assert.deepEqual(await env.REPORTS_DB.prepare('SELECT * FROM field_updates WHERE id=?1').bind(made.id).first(),before);
 const stranger=await published(env,`/field-updates/${made.id}/report-draft`,{deviceId:OTHER});
 assert.equal(stranger.status,404);hidden(stranger.body,made.id);assert.equal(stranger.body.draft,undefined);
 const unguarded=await call(env,`/field-updates/${made.id}/report-draft`,{method:'POST',body:{deviceId:OWNER}});
 assert.equal(unguarded.status,400);assert.equal(unguarded.body.draft,undefined);
 for(const key of ['user_hash','ip_hash','gps_accuracy','location_source','note','nickname'])assert.equal(JSON.stringify(draft.body).includes(key),false,key);
});

test('Issue28: 보호 위치의 메모·닉네임·상태이력 자유문자열은 direct GET·publication에서 가린다',async()=>{
 const env=setup(),sentinel='37.512345 127.054321 서울 강남구 합성주소 123',coordinateName='37.51234,127.05432';
 const protectedAll=await create(env,{species:'저어새',visibilityRadius:'all',note:sentinel,nickname:coordinateName});
 const saved=await create(env,{species:'참새',visibilityRadius:'all',note:sentinel,nickname:coordinateName});
 await env.REPORTS_DB.prepare("UPDATE field_updates SET species='저어새1',location_hidden=0,public_lat=lat,public_lon=lon WHERE id=?1").bind(saved.id).run();
 const ordinary=await create(env,{species:'박새',visibilityRadius:'all',note:'일반 소식 메모 유지',nickname:'일반닉네임'});
 for(const response of [await call(env,'/field-updates'),await published({...env,REPORTS_PUBLICATION_REQUIRED:'true'},'/field-updates')]){
  assert.equal(response.status,200);assert.equal(JSON.stringify(response.body).includes(sentinel),false);assert.equal(JSON.stringify(response.body).includes(coordinateName),false);
  for(const id of [protectedAll.id,saved.id]){const item=response.body.updates.find(x=>x.id===id);assert.equal(item.note,null);assert.equal(item.nickname,'익명');assert.ok(item.history.length>0);assert.ok(item.history.every(event=>event.nickname==='익명'));}
  assert.equal(response.body.updates.find(x=>x.id===ordinary.id).note,'일반 소식 메모 유지');
  assert.equal(response.body.updates.find(x=>x.id===ordinary.id).nickname,'일반닉네임');assert.equal(response.body.updates.find(x=>x.id===ordinary.id).history[0].nickname,'일반닉네임');
 }
 assert.equal((await env.REPORTS_DB.prepare('SELECT note FROM field_updates WHERE id=?1').bind(protectedAll.id).first()).note,sentinel,'원본 메모는 보존한다');
 assert.equal((await env.REPORTS_DB.prepare('SELECT nickname FROM field_updates WHERE id=?1').bind(protectedAll.id).first()).nickname,coordinateName);
 assert.equal((await env.REPORTS_DB.prepare('SELECT nickname FROM field_update_events WHERE field_update_id=?1').bind(protectedAll.id).first()).nickname,coordinateName);
});

test('Issue28: 위치 가리기·과거 번식 행은 보호되고, 보이는 목록100개를 비노출 행이 밀어내지 않음',async()=>{
 const env=setup(),all=await create(env,{visibilityRadius:'all'}),masked=await create(env);
 await env.REPORTS_DB.prepare('UPDATE field_updates SET location_hidden=1 WHERE id=?1').bind(masked.id).run();
 assert.equal((await nearby(env)).body.updates.some(r=>r.id===masked.id),false);
 const at=new Date().toISOString();
 for(let i=0;i<105;i++)await env.REPORTS_DB.prepare(`INSERT INTO field_updates(id,species,status,lat,lon,public_lat,public_lon,visibility_radius,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES(?1,'참새','visible',37.59,127,37.59,127,'5','비노출',?2,?2,?2,'owner','ip')`).bind(crypto.randomUUID(),at).run();
 assert.deepEqual((await nearby(env)).body.updates.map(r=>r.id),[all.id]);
 await env.REPORTS_DB.prepare("UPDATE field_updates SET note='둥지' WHERE id=?1").bind(all.id).run();
 assert.equal((await call(env,'/field-updates')).body.updates.length,0);
});

test('Issue28: 조회 속도 제한은 D1 쓰기 없이 동작',async()=>{
 const env=setup(),made=await create(env),before=await env.REPORTS_DB.prepare('SELECT row_revision FROM field_updates WHERE id=?1').bind(made.id).first();
 let result;
 for(let i=0;i<61;i++)result=await call(env,'/field-updates/read',{method:'POST',body:{viewer:viewer()},ip:'198.19.255.254'});
 assert.equal(result.status,429);assert.equal(result.body.error.code,'FIELD_READ_RATE_LIMITED');
 assert.deepEqual(await env.REPORTS_DB.prepare('SELECT row_revision FROM field_updates WHERE id=?1').bind(made.id).first(),before);
});

test('Issue28: additive migration은 기존 행·좌표·fence 보존, 기본all, 범위 불변·검증, 실패는 원복',()=>{
 const sqlite=new DatabaseSync(':memory:'),baseline=readFileSync(new URL('../../docs/p1-publication-security-implementation/results/server-audit/pre-publication-schema.sql',import.meta.url),'utf8');
 sqlite.exec(baseline);sqlite.exec(readFileSync(new URL('../migrations/0005_publication_security.sql',import.meta.url),'utf8'));
 sqlite.exec('UPDATE public_publication_state SET write_frozen=0,revision=revision+1');
 const trusted=trustedFixtureSqlite(sqlite),at=new Date().toISOString();
 trusted.prepare("INSERT INTO field_updates(id,species,status,lat,lon,public_lat,public_lon,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES('legacy','참새','visible',37.5,127,37.5,127,'기존',?1,?1,?1,'owner','ip')").run(at);
 const before={...sqlite.prepare('SELECT * FROM field_updates').get()},guards=sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name").all().map(r=>r.name);
 sqlite.exec('UPDATE public_publication_state SET write_frozen=1,revision=revision+1');
 const migration=readFileSync(new URL('../migrations/0006_field_visibility.sql',import.meta.url),'utf8');
 sqlite.exec('BEGIN');try{sqlite.exec(migration);sqlite.exec('INSERT INTO deliberately_missing VALUES(1)');assert.fail();}catch{sqlite.exec('ROLLBACK');}
 assert.equal(sqlite.prepare('PRAGMA table_info(field_updates)').all().some(r=>r.name==='visibility_radius'),false);
 sqlite.exec(migration);
 assert.ok(sqlite.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name='idx_field_updates_visibility_activity'").get());
 const after={...sqlite.prepare('SELECT * FROM field_updates').get()};assert.equal(after.visibility_radius,'all');delete after.visibility_radius;assert.deepEqual(after,before);
 assert.equal(sqlite.prepare('SELECT write_frozen FROM public_publication_state').get().write_frozen,1);
 for(const name of guards.filter(n=>n!=='publication_field_updates_insert'))assert.ok(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name=?").get(name));
 // An old publication reader insists on every old guard name. The additive
 // migration deliberately removes exactly its old insert guard witness.
 const oldCount=sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger' AND name IN ("+guards.map(()=>'?').join(',')+")").get(...guards).n;
 assert.equal(oldCount,guards.length-1);
 assert.ok(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name='publication_field_updates_insert_scoped'").get());
 sqlite.exec('UPDATE public_publication_state SET write_frozen=0,revision=revision+1');
 assert.throws(()=>trusted.prepare("UPDATE field_updates SET visibility_radius='5' WHERE id='legacy'").run(),/field_visibility_immutable/);
 assert.throws(()=>trusted.prepare("INSERT INTO field_updates(id,species,status,lat,lon,public_lat,public_lon,visibility_radius,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES('bad','참새','visible',37.5,127,37.5,127,'100','기존',?1,?1,?1,'owner','ip')").run(at),/CHECK constraint/);
 assert.equal(fieldVisible({...before,visibility_radius:'all'},null),true);
 sqlite.close();
});
