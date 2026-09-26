// Privileged internal operation only. No public/admin HTTP route exposes this function.
// Application-layer DELETE policy (Phase 2B option B); direct DB credentials remain privileged.
import { parseAdminEmails } from '../shared.js';
import { capability, BUILD_CAPABILITY, writeMode } from './control.js';
import { first, rows, assertion, clearAssertion, insert, requestId, revision, fail } from './data.js';

export async function purgeForbidden(env,actor,input) {
  if(env.REPORTS_PURGE_ENABLED!=='true'||!actor?.email||!parseAdminEmails(env.REPORTS_PURGE_ADMINS).includes(actor.email)||
    writeMode(env)!=='READ_ONLY_MAINTENANCE'||input?.confirmation!=='PURGE_FORBIDDEN_CONTENT'||input.reason_code!=='forbidden_breeding_content')fail('PURGE_FORBIDDEN','정책 폐기 권한과 명시적 확인이 필요합니다.',403);
  const own=await capability(env,'admin');
  if(!own.ready||!env.REPORTS_PEER?.fetch||!env.REPORTS_GATE_TOKEN)fail('PURGE_NOT_READY','유지보수 준비 상태를 확인할 수 없습니다.',503);
  let peer;try{const response=await env.REPORTS_PEER.fetch(new Request('https://reports-gate.internal/_internal/reports-capability',{headers:{'X-Reports-Gate':env.REPORTS_GATE_TOKEN},signal:AbortSignal.timeout(3000)}));if(!response.ok)throw Error();peer=await response.json();}catch{fail('PURGE_NOT_READY','상대 Worker가 준비되지 않았습니다.',503);}
  if(!peer.ready||peer.role!=='public'||peer.build!==BUILD_CAPABILITY||peer.mode!==own.mode||peer.schema!==own.schema||peer.activation!==own.activation||peer.release!==env.REPORTS_PEER_RELEASE_ID||peer.peerRelease!==own.release)fail('PURGE_NOT_READY','상대 Worker가 준비되지 않았습니다.',503);
  const id=requestId(input.id),operation=requestId(input.request_id),expected=revision(input.expected_revision),db=env.REPORTS_DB;
  const tombstone=await first(db,"SELECT request_id FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?",id);
  if(tombstone){if(tombstone.request_id!==operation)fail('REPORT_PURGED','이미 제거된 자료입니다.',410);return {ok:true,id,purged:true};}
  const c=await first(db,'SELECT * FROM checklists WHERE checklist_id=?',id);
  if(!c)fail('NOT_FOUND','제보를 찾을 수 없습니다.',404);
  // The instruction forbids deleting existing legacy reports. Resolve that policy exception explicitly later.
  if(c.source_type!=='native')fail('PURGE_LEGACY_DECISION_REQUIRED','기존 자료 삭제 금지와 정책 폐기의 적용 범위는 운영자 결정이 필요합니다.',409);
  if((await rows(db,'SELECT id FROM reports WHERE spot_key=?',id)).length||(await rows(db,'SELECT checklist_id FROM checklists WHERE spot_key=?',id)).length)fail('PURGE_DEPENDENCIES','연결된 정상 자료를 먼저 검토해야 합니다. 자동 해제하지 않습니다.',409);
  const key=`purge:${operation}`,now=new Date().toISOString();
  const statements=[db.prepare('UPDATE checklists SET revision=revision+1,updated_at=? WHERE checklist_id=? AND revision=?').bind(now,id,expected),assertion(db,key),clearAssertion(db,key),
    assertion(db,key+':links','NOT EXISTS (SELECT 1 FROM reports WHERE spot_key=?) AND NOT EXISTS (SELECT 1 FROM checklists WHERE spot_key=?)',[id,id]),clearAssertion(db,key+':links'),
    db.prepare('DELETE FROM reviews WHERE checklist_id=?').bind(id),db.prepare('DELETE FROM sightings WHERE checklist_id=?').bind(id),
    db.prepare('DELETE FROM checklists WHERE checklist_id=?').bind(id),db.prepare('DELETE FROM raw_submissions WHERE raw_id=?').bind(c.raw_id),
    db.prepare('DELETE FROM reports WHERE id=?').bind(id),assertion(db,key+':report'),clearAssertion(db,key+':report'),
    db.prepare('DELETE FROM audit_log WHERE target_id=?').bind(id),
    insert(db,'audit_log',{audit_id:`purge:${operation}`,actor_id:actor.email,action:'forbidden_content_purged',target_type:'report',target_id:id,request_id:operation,request_fingerprint:null,event_count:0,created_at:now})];
  try{await db.batch(statements);}catch{fail('PURGE_CONFLICT','폐기하지 못했습니다. 상태를 다시 확인해 주세요.',409);}
  return {ok:true,id,purged:true};
}
