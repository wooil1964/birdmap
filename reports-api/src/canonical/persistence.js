import { WorkerError, validateReport, MAX_BIRD_COUNT, splitSpecies, rethrowIfFrozen, LOCATION_HIDDEN_SQL, hasBreedingEvidence, isLocationRestricted, receiptPayload, parseSpeciesItems, sightingValues } from '../shared.js';
import { applicationDb, assertion, clearAssertion, checklistFromReport, initialSighting, nativeSightings, insert, first, rows, stable, fingerprint, requestId, revision, assertNotPurged, fail, projectChecklist, FIELD_MAP } from './data.js';
import { locationEvidenceColumns } from '../location-evidence.js';
import { AUTO_DECISION_SQL, unverifiedPayload, unverifiedReadsEnabled } from '../autopublic.js';

const INPUT_KEYS=['species','lat','lon','observedOn','birdCount','reporter','namePublic','note','non_breeding_confirmed','hideLocation'];
export function quickInput(body) {
  if(body?.non_breeding_confirmed!==true)fail('NON_BREEDING_CONFIRMATION_REQUIRED','번식 관련 관찰이 아니라는 명시적 확인이 필요합니다.',400);
  requestId(body.request_id);
  if(typeof body.lat!=='number'||!Number.isFinite(body.lat)||typeof body.lon!=='number'||!Number.isFinite(body.lon))fail('COORDINATE_REQUIRED','실제 관찰좌표가 필요합니다.',400);
  const report=validateReport({...body,birdCount:null});
  if(hasBreedingEvidence(report))fail('BREEDING_REPORT_NOT_ALLOWED','둥지·새끼·번식 관련 제보는 공개 접수할 수 없습니다.',400);
  const n=body.birdCount;
  if(n!==undefined&&n!==null&&n!==''&&(!Number.isSafeInteger(n)||n<0||n>MAX_BIRD_COUNT))fail('COUNT_INVALID','수량은 0 이상의 정수 또는 미확인이어야 합니다.',400);
  report.birdCount=n===undefined||n===null||n===''?null:n;
  return {report,input:Object.fromEntries(INPUT_KEYS.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]))};
}
export async function replayQuick(db,id,input,env={}) {
  await assertNotPurged(db,id);
  const raw=await first(db,'SELECT * FROM raw_submissions WHERE request_id=?',id);
  if(!raw)return null;
  const saved=JSON.parse(raw.payload_json);
  if(raw.source_type!=='native_submission'||raw.source_id!==id||await fingerprint(saved.input)!==await fingerprint(input))fail('IDEMPOTENCY_CONFLICT','같은 요청 식별자에 다른 내용이 전송되었습니다.');
  if(raw.source_fingerprint!==await fingerprint(saved)||!saved.accepted)fail('IDEMPOTENCY_STATE_INVALID','저장된 요청을 검증할 수 없습니다.');
  const c=await first(db,'SELECT raw_id FROM checklists WHERE checklist_id=?',id);
  const live=await first(db,'SELECT id,note,lat,lon,public_lat,public_lon,'+locationEvidenceColumns({REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE'})+',status,pending_public,approx_lat,approx_lon,(approx_lat<>lat OR approx_lon<>lon) AS approx_offset,'+LOCATION_HIDDEN_SQL+' AS location_hidden,species,observed_on,bird_count,received_at,'+(unverifiedReadsEnabled(env)?AUTO_DECISION_SQL:'NULL AS auto_decision')+' FROM reports WHERE id=?',id);
  if(c?.raw_id!==raw.raw_id||!live)fail('IDEMPOTENCY_STATE_INVALID','저장 결과가 불완전합니다.');
  // Recompute the current status; never replay historical pending coordinates.
  const visible=live.status==='pending'&&unverifiedPayload([live],env).length===1;
  return receiptPayload({...saved.accepted,status:live.status,publicVisibility:live.status==='rejected'?'not_published':visible?'public_unverified':isLocationRestricted(live)?'withheld':live.status==='approved'?'approved':'withheld'});
}
// Redemptions older than this are removed in the same batch (tokens themselves expire after 300 s).
export const REDEMPTION_RETENTION_MS=60*60*1000;
export async function persistQuick(binding,row,input,accepted,tokenHash,{env={},review=null,cap=null}={}) {
  const db=applicationDb(binding), id=requestId(row.id), now=row.received_at;
  const previous=await replayQuick(db,id,input,env);if(previous)return previous;
  const payload={input,accepted};
  const raw={raw_id:`raw:${id}`,source_type:'native_submission',source_id:id,request_id:id,payload_json:stable(payload),submitted_at:now,submitted_by:null,schema_version:'quick-v1',captured_at:now,source_fingerprint:await fingerprint(payload),non_breeding_confirmed:1,policy_version:'non-breeding-v1'};
  if(typeof tokenHash!=='string'||!/^[0-9a-f]{64}$/.test(tokenHash))fail('CAPTCHA_REQUIRED','자동 등록 방지 확인을 완료해 주세요.',400);
  const key=`submit:${id}`,cutoff=new Date(Date.parse(now)-REDEMPTION_RETENTION_MS).toISOString();
  const statements=[assertion(db,key,"NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?)",[id]),clearAssertion(db,key),
    db.prepare('DELETE FROM captcha_redemptions WHERE redeemed_at<?').bind(cutoff),insert(db,'captcha_redemptions',{token_hash:tokenHash,request_id:id,redeemed_at:now}),
    insert(db,'reports',row),insert(db,'raw_submissions',raw),insert(db,'checklists',checklistFromReport(row,raw.raw_id,now,true)),...nativeSightings(row,now).map(s=>insert(db,'sightings',s)),
    // 자동 공개 판정 기록은 같은 batch 에 넣는다. 판정만 남거나 저장만 남는 경우는 없다.
    ...(review?[insert(db,'reviews',review)]:[]),
    // 자동 공개로 판정된 접수만: 방금 넣은 판정 기록까지 센 오늘 건수가 한도 이하일 때만 batch 전체가 확정된다.
    // D1 batch 는 한 트랜잭션이라, 동시에 먼저 확정된 접수가 있으면 여기서 실패하고 아무것도 남지 않는다.
    ...(cap?[assertion(db,`autocap:${id}`,cap.condition,cap.values),clearAssertion(db,`autocap:${id}`)]:[]),
    // 같은 날·같은 종·200 m 이내에 먼저 확정된 다른 제보가 있으면 이 접수는 공개 대신 검토 대기로 다시 저장된다.
    ...(cap?.dup?[assertion(db,`autodup:${id}`,cap.dup.condition,cap.dup.values),clearAssertion(db,`autodup:${id}`)]:[])];
  try {await db.batch(statements);} catch(error) {
    rethrowIfFrozen(error);
    const replay=await replayQuick(db,id,input,env);if(replay)return replay;
    // Another logical request already redeemed this token (whole batch rolled back, nothing stored).
    if(await first(db,'SELECT 1 AS used FROM captcha_redemptions WHERE token_hash=? AND request_id<>?',tokenHash,id))fail('CAPTCHA_REUSED','이미 사용된 자동 등록 방지 확인입니다. 다시 확인해 주세요.',403);
    if(await first(db,'SELECT id FROM reports WHERE dedupe_hash=? OR id=?',row.dedupe_hash,id))fail('DUPLICATE_REPORT','같은 종·위치·날짜의 제보가 이미 접수되어 있습니다.');
    // 한도 경합: 호출한 쪽이 같은 요청을 검토 대기로 한 번 다시 저장한다(제보를 버리거나 거절하지 않는다).
    if(cap) {
      const reached=await first(db,cap.reachedSql,...cap.values),holdReasons=['rate_review','global_cap'].filter(k=>Number(reached?.[k])===1);
      if(cap.dup&&Number((await first(db,cap.dup.reachedSql,...cap.dup.values))?.possible_duplicate)===1)holdReasons.push('possible_duplicate');
      if(holdReasons.length){const race=new WorkerError('AUTO_PUBLIC_CAP_RACE','동시 접수로 자동 공개 조건(한도·중복 의심)이 바뀌어 검토 대기로 접수합니다.',409);race.holdReasons=holdReasons;throw race;}
    }
    fail('WRITE_FAILED','제보를 저장하지 못했습니다. 같은 요청으로 다시 시도해 주세요.',503);
  }
  return accepted;
}
const ADMIN_KEYS=['action','expected_revision','adminNote','reasonCode','species','lat','lon','publicLat','publicLon','siteId','observedOn','namePublic','public','hide','spotKey','sightingReviews'];
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
  const events=[{decision,sighting_id:null,validated_taxon_id:null,validated_count:null,validated_count_accuracy:null,from_status:before.status,to_status:after.status,actor_id:actor,reason_code:body.action==='reject'&&body.reasonCode?'reject:'+body.reasonCode:body.action,event_index:0}];
  const sightings=await rows(db,'SELECT * FROM sightings WHERE checklist_id=? ORDER BY source_ordinal',id);
  const changed=new Map(),added=[];
  const parsed=after.species!==before.species?parseSpeciesItems(splitSpecies(after.species)):null;
  if(parsed?.clean) {
    // 관리자 종명·개체수 정정: 종별 행을 순서대로 다시 맞춘다. 원문(species_original)은 바꾸지 않고, 모자라면 행을 더하고 남으면 무효로 둔다.
    const values=sightingValues(parsed,after.bird_count??null);
    let ordinal=Math.max(0,...sightings.map(s=>s.source_ordinal));
    values.forEach((v,i)=>{const {species_original,...rest}=v;
      if(sightings[i])changed.set(sightings[i].sighting_id,rest);
      else {ordinal++;added.push({sighting_id:`sighting:${id}:${ordinal}`,checklist_id:id,source_ordinal:ordinal,...v,created_at:now,updated_at:now});}});
    for(const s of sightings.slice(values.length))changed.set(s.sighting_id,{species_identified:null,interpretation:'unknown',taxon_id:null,count_value:null,count_accuracy:'unknown',count_source:'ambiguous_group',interpretation_note:'superseded'});
  } else if(parsed) {
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
  for(const s of added) {
    statements.push(insert(db,'sightings',s));
    events.push({decision:'corrected',sighting_id:s.sighting_id,validated_taxon_id:null,validated_count:s.count_value,validated_count_accuracy:s.count_accuracy,from_status:before.status,to_status:after.status,actor_id:actor,reason_code:body.action,event_index:events.length});
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
