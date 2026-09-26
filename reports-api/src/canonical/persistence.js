import { validateReport, MAX_BIRD_COUNT, splitSpecies, rethrowIfFrozen } from '../shared.js';
import { applicationDb, assertion, clearAssertion, checklistFromReport, initialSighting, insert, first, rows, stable, fingerprint, requestId, revision, assertNotPurged, fail, projectChecklist, FIELD_MAP } from './data.js';

const INPUT_KEYS=['species','lat','lon','observedOn','birdCount','reporter','namePublic','note','non_breeding_confirmed'];
export function quickInput(body) {
  if(body?.non_breeding_confirmed!==true)fail('NON_BREEDING_CONFIRMATION_REQUIRED','번식 관련 관찰이 아니라는 명시적 확인이 필요합니다.',400);
  requestId(body.request_id);
  if(typeof body.lat!=='number'||!Number.isFinite(body.lat)||typeof body.lon!=='number'||!Number.isFinite(body.lon))fail('COORDINATE_REQUIRED','실제 관찰좌표가 필요합니다.',400);
  const report=validateReport({...body,birdCount:null});
  const n=body.birdCount;
  if(n!==undefined&&n!==null&&n!==''&&(!Number.isSafeInteger(n)||n<0||n>MAX_BIRD_COUNT))fail('COUNT_INVALID','수량은 0 이상의 정수 또는 미확인이어야 합니다.',400);
  report.birdCount=n===undefined||n===null||n===''?null:n;
  return {report,input:Object.fromEntries(INPUT_KEYS.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]))};
}
export async function replayQuick(db,id,input) {
  await assertNotPurged(db,id);
  const raw=await first(db,'SELECT * FROM raw_submissions WHERE request_id=?',id);
  if(!raw)return null;
  const saved=JSON.parse(raw.payload_json);
  if(raw.source_type!=='native_submission'||raw.source_id!==id||await fingerprint(saved.input)!==await fingerprint(input))fail('IDEMPOTENCY_CONFLICT','같은 요청 식별자에 다른 내용이 전송되었습니다.');
  if(raw.source_fingerprint!==await fingerprint(saved)||!saved.accepted)fail('IDEMPOTENCY_STATE_INVALID','저장된 요청을 검증할 수 없습니다.');
  const c=await first(db,'SELECT raw_id FROM checklists WHERE checklist_id=?',id);
  const live=await first(db,'SELECT status,pending_public,approx_lat,approx_lon,species,observed_on FROM reports WHERE id=?',id);
  if(c?.raw_id!==raw.raw_id||!live)fail('IDEMPOTENCY_STATE_INVALID','저장 결과가 불완전합니다.');
  // Replay the successful receipt, subject to current publication consent. Never resurrect a withdrawn marker.
  const accepted={...saved.accepted,status:live.status,publicVisibility:live.status==='approved'?'approved':live.status==='rejected'?'not_published':Number(live.pending_public)===1?'approximate':'withheld'};
  delete accepted.spot;
  if(live.status==='pending'&&Number(live.pending_public)===1&&live.approx_lat!==null&&live.approx_lon!==null)accepted.spot={id,status:'pending',lat:live.approx_lat,lon:live.approx_lon,approximate:true,species:splitSpecies(live.species),date:live.observed_on};
  return accepted;
}
// Redemptions older than this are removed in the same batch (tokens themselves expire after 300 s).
export const REDEMPTION_RETENTION_MS=60*60*1000;
export async function persistQuick(binding,row,input,accepted,tokenHash) {
  const db=applicationDb(binding), id=requestId(row.id), now=row.received_at;
  const previous=await replayQuick(db,id,input);if(previous)return previous;
  const payload={input,accepted};
  const raw={raw_id:`raw:${id}`,source_type:'native_submission',source_id:id,request_id:id,payload_json:stable(payload),submitted_at:now,submitted_by:null,schema_version:'quick-v1',captured_at:now,source_fingerprint:await fingerprint(payload),non_breeding_confirmed:1,policy_version:'non-breeding-v1'};
  if(typeof tokenHash!=='string'||!/^[0-9a-f]{64}$/.test(tokenHash))fail('CAPTCHA_REQUIRED','자동 등록 방지 확인을 완료해 주세요.',400);
  const key=`submit:${id}`,cutoff=new Date(Date.parse(now)-REDEMPTION_RETENTION_MS).toISOString();
  const statements=[assertion(db,key,"NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?)",[id]),clearAssertion(db,key),
    db.prepare('DELETE FROM captcha_redemptions WHERE redeemed_at<?').bind(cutoff),insert(db,'captcha_redemptions',{token_hash:tokenHash,request_id:id,redeemed_at:now}),
    insert(db,'reports',row),insert(db,'raw_submissions',raw),insert(db,'checklists',checklistFromReport(row,raw.raw_id,now,true)),insert(db,'sightings',initialSighting(row,now,true))];
  try {await db.batch(statements);} catch(error) {
    rethrowIfFrozen(error);
    const replay=await replayQuick(db,id,input);if(replay)return replay;
    // Another logical request already redeemed this token (whole batch rolled back, nothing stored).
    if(await first(db,'SELECT 1 AS used FROM captcha_redemptions WHERE token_hash=? AND request_id<>?',tokenHash,id))fail('CAPTCHA_REUSED','이미 사용된 자동 등록 방지 확인입니다. 다시 확인해 주세요.',403);
    if(await first(db,'SELECT id FROM reports WHERE dedupe_hash=? OR id=?',row.dedupe_hash,id))fail('DUPLICATE_REPORT','같은 종·위치·날짜의 제보가 이미 접수되어 있습니다.');
    fail('WRITE_FAILED','제보를 저장하지 못했습니다. 같은 요청으로 다시 시도해 주세요.',503);
  }
  return accepted;
}
const ADMIN_KEYS=['action','expected_revision','adminNote','species','lat','lon','publicLat','publicLon','siteId','observedOn','namePublic','public','spotKey','sightingReviews'];
export async function adminIdentity(body,id,actor) {
  requestId(body.request_id);revision(body.expected_revision);
  const input=Object.fromEntries(ADMIN_KEYS.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
  return {request_id:body.request_id,fingerprint:await fingerprint({id,actor,input})};
}
const eventMeaning=r=>Object.fromEntries(['decision','sighting_id','validated_taxon_id','validated_count','validated_count_accuracy','from_status','to_status','actor_id','reason_code','event_index'].map(k=>[k,r[k]]));
export async function replayAdmin(db,identity,id,actor) {
  await assertNotPurged(db,id);
  const audit=await first(db,'SELECT * FROM audit_log WHERE audit_id=?',`admin:${identity.request_id}`);
  if(!audit)return null;
  if(audit.target_id!==id||audit.actor_id!==actor||audit.request_fingerprint!==identity.fingerprint)fail('IDEMPOTENCY_CONFLICT','같은 요청 식별자에 다른 작업이 전송되었습니다.');
  const events=await rows(db,'SELECT * FROM reviews WHERE request_id=? ORDER BY event_index',identity.request_id);
  let receipt;try{receipt=JSON.parse(events[0]?.note);}catch{fail('IDEMPOTENCY_STATE_INVALID','검토 결과 기록이 불완전합니다.');}
  if(!receipt||receipt.version!==1||audit.event_count!==events.length||stable(receipt.events)!==stable(events.map(eventMeaning))||!receipt.result||events.some((r,i)=>r.event_index!==i||r.checklist_id!==id||r.actor_id!==actor))fail('IDEMPOTENCY_STATE_INVALID','검토 이벤트 의미가 일치하지 않습니다.');
  return receipt.result;
}
function countReview(value) {
  if(value!==null&&(!Number.isSafeInteger(value)||value<0))fail('COUNT_INVALID','검토 수량은 0 이상의 정수 또는 NULL이어야 합니다.',400);
}
// Called only after authenticated gate and the legacy action planner. No source records are rewritten.
export async function persistAdmin(binding,{id,body,actor,identity,plan,before,now}) {
  const db=applicationDb(binding);
  const replay=await replayAdmin(db,identity,id,actor);if(replay)return replay;
  const current=await first(db,'SELECT * FROM checklists WHERE checklist_id=?',id);
  if(!current)fail('CANONICAL_NOT_READY','관찰 정본이 준비되지 않았습니다.',503);
  if(current.revision!==body.expected_revision) {
    const saved=await replayAdmin(db,identity,id,actor);if(saved)return saved;
    fail('REVISION_CONFLICT','다른 변경이 먼저 반영됐습니다. 새로 조회해 주세요.');
  }
  if(stable(projectChecklist(current))!==stable(before)) {
    const latest=await first(db,'SELECT revision FROM checklists WHERE checklist_id=?',id);
    const saved=await replayAdmin(db,identity,id,actor);if(saved)return saved;
    if(latest?.revision!==current.revision)fail('REVISION_CONFLICT','다른 변경이 먼저 반영됐습니다. 새로 조회해 주세요.');
    fail('CANONICAL_DRIFT','기존 자료와 정본이 다릅니다. 쓰기를 중지하고 확인해 주세요.',503);
  }
  const after={...before,...plan.patch};
  if(after.site_id!==null&&!await first(db,'SELECT site_id FROM sites WHERE site_id=?',after.site_id))fail('SITE_ID_UNKNOWN','등록된 탐조지 ID가 아닙니다.',400);
  const expected=revision(body.expected_revision), key=`cas:${identity.request_id}`;
  const updates={};for(const [k,v] of Object.entries(plan.patch))updates[FIELD_MAP[k]||k]=v;
  if(Object.hasOwn(plan.patch,'public_lat')||Object.hasOwn(plan.patch,'public_lon'))updates.coordinate_policy=after.public_lat!==null&&after.public_lon!==null?'explicit':current.source_type==='legacy_reports'?'legacy_fallback':'actual';
  const statements=[db.prepare(`UPDATE checklists SET ${Object.keys(updates).map(k=>k+'=?').join(',')},revision=revision+1,updated_at=? WHERE checklist_id=? AND revision=?`).bind(...Object.values(updates),now,id,expected),
    assertion(db,key),clearAssertion(db,key)];
  if(plan.linkTarget) {
    statements.push(assertion(db,key+':target',"EXISTS (SELECT 1 FROM reports WHERE id=? AND spot_key IS NULL)",[plan.linkTarget]),clearAssertion(db,key+':target'));
  }
  statements.push(db.prepare(`UPDATE reports SET ${Object.keys(plan.patch).map(k=>k+'=?').join(',')} WHERE id=?`).bind(...Object.values(plan.patch),id),assertion(db,key+':report'),clearAssertion(db,key+':report'));
  const sequence=Number((await first(db,'SELECT COALESCE(MAX(sequence),0) AS n FROM reviews WHERE checklist_id=?',id)).n);
  const decision=body.action==='reject'?'rejected':body.action==='unpublish'?'unpublished':['approve','link'].includes(body.action)?(before.status==='rejected'?'reapproved':'approved'):'corrected';
  const events=[{decision,sighting_id:null,validated_taxon_id:null,validated_count:null,validated_count_accuracy:null,from_status:before.status,to_status:after.status,actor_id:actor,reason_code:body.action,event_index:0}];
  const sightings=await rows(db,'SELECT * FROM sightings WHERE checklist_id=? ORDER BY source_ordinal',id);
  const changed=new Map();
  if(after.species!==before.species) {
    const single=sightings.length===1&&!/[·,;\n/]/.test(after.species);
    for(const s of sightings)changed.set(s.sighting_id,{species_identified:single?after.species:null,interpretation:single?'single':sightings.length===1?'unparsed_multiple':'unknown',taxon_id:null,
      count_value:single&&s.interpretation==='single'?s.count_value:null,count_accuracy:single&&s.interpretation==='single'?s.count_accuracy:'unknown',
      count_source:single&&s.interpretation==='single'?s.count_source:'ambiguous_group'});
  }
  if(body.sightingReviews!==undefined&&!Array.isArray(body.sightingReviews))fail('REVIEW_INVALID','검토 목록 형식이 아닙니다.',400);
  const seen=new Set();
  for(const r of body.sightingReviews||[]) {
    if(!r||typeof r!=='object'||seen.has(r.sighting_id)||!sightings.some(s=>s.sighting_id===r.sighting_id))fail('REVIEW_INVALID','검토 대상이 올바르지 않습니다.',400);
    seen.add(r.sighting_id);countReview(r.count_value);
    if(!['exact','estimated','minimum','unknown'].includes(r.count_accuracy)||(r.count_value===null&&r.count_accuracy!=='unknown'))fail('REVIEW_INVALID','수량 정확도가 올바르지 않습니다.',400);
    const s=sightings.find(s=>s.sighting_id===r.sighting_id), prior=changed.get(s.sighting_id)||s;
    if(prior.interpretation!=='single'&&(r.count_value!==null||r.taxon_id))fail('REVIEW_UNRESOLVED','여러 종 또는 미해석 자료에는 수량/분류를 자동 배정할 수 없습니다.',400);
    if(r.taxon_id!=null&&!await first(db,'SELECT taxon_id FROM taxa WHERE taxon_id=?',r.taxon_id))fail('TAXON_UNKNOWN','검증된 분류 ID가 아닙니다.',400);
    changed.set(s.sighting_id,{...changed.get(s.sighting_id),count_value:r.count_value,count_accuracy:r.count_accuracy,count_source:'reviewed',taxon_id:r.taxon_id??null});
  }
  // Stable source order defines event indices, independent of request array ordering.
  for(const s of sightings)if(changed.has(s.sighting_id)) {
    const values=changed.get(s.sighting_id), value={...s,...values};
    statements.push(db.prepare(`UPDATE sightings SET ${Object.keys(values).map(k=>k+'=?').join(',')},updated_at=? WHERE checklist_id=? AND sighting_id=?`).bind(...Object.values(values),now,id,s.sighting_id),assertion(db,key+':sighting'),clearAssertion(db,key+':sighting'));
    events.push({decision:'corrected',sighting_id:s.sighting_id,validated_taxon_id:value.taxon_id,validated_count:value.count_value,validated_count_accuracy:value.count_accuracy,from_status:before.status,to_status:after.status,actor_id:actor,reason_code:body.action,event_index:events.length});
  }
  const receipt=stable({version:1,result:plan.result,events});
  for(const event of events)statements.push(insert(db,'reviews',{review_id:`review:${identity.request_id}:${event.event_index}`,checklist_id:id,sequence:sequence+event.event_index+1,...event,request_id:identity.request_id,note:event.event_index===0?receipt:null,created_at:now}));
  statements.push(insert(db,'audit_log',{audit_id:`admin:${identity.request_id}`,actor_id:actor,action:body.action,target_type:'checklist',target_id:id,request_id:identity.request_id,request_fingerprint:identity.fingerprint,event_count:events.length,created_at:now}));
  try {await db.batch(statements);}catch(error) {
    rethrowIfFrozen(error);
    const saved=await replayAdmin(db,identity,id,actor);if(saved)return saved;
    fail('REVISION_CONFLICT','저장에 실패했거나 다른 변경이 먼저 반영됐습니다. 새로 조회해 주세요.');
  }
  return plan.result;
}
