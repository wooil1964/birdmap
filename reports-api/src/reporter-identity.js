import { WorkerError } from './shared.js';
export const identityEnabled = env => env?.REPORTS_CONFIRMED_IDENTITIES === '1';
// Opt-in only. This is attribution by previously confirmed public aliases,
// NOT proof that the new submitter owns a nickname. Disable on impersonation.
export const identityAutoAliasEnabled = env =>
 identityEnabled(env) && env?.REPORTS_IDENTITY_AUTO_ALIASES === '1';
export const IDENTITY_GUARDS = ['identity_groups_insert','identity_groups_update','identity_groups_delete','identity_groups_created','identity_groups_revoked','identity_events_insert','identity_events_update','identity_events_delete'];
// Membership is an explicit set of report IDs, never a name/space/IP heuristic.
export function identityGroupSql(alias='reports') {
 return `(SELECT g.id FROM reporter_identity_groups g,json_each(g.report_ids) j WHERE g.active=1 AND j.value=${alias}.id)`;
}
// Automatic grouping is a *read-time* projection: no new report IDs are
// written into immutable report_ids and no report data is edited. Only aliases
// already visible in a previously confirmed, approved public group can match.
// A future row must be newer than the group's confirmation. If the exact alias
// occurs in two active confirmed groups, fail closed and leave it ungrouped.
export function identityAutoAliasGroupSql(alias='reports') {
 return `(SELECT MIN(g.id) FROM reporter_identity_groups g
 JOIN json_each(g.report_ids) member ON 1=1
 JOIN reports known ON known.id=member.value
 WHERE g.active=1 AND known.status='approved' AND known.name_public=1
  AND known.reporter=${alias}.reporter COLLATE BINARY
  AND ${alias}.received_at>g.created_at
 HAVING COUNT(DISTINCT g.id)=1)`;
}
function effectiveIdentityGroupSql(env,alias) {
 const explicit=identityGroupSql(alias);
 return identityAutoAliasEnabled(env)
  ? `COALESCE(${explicit},${identityAutoAliasGroupSql(alias)})`
  : explicit;
}
export function reporterNameSql(env, alias='reports', publicOnly=true) {
 if (!identityEnabled(env)) return alias+'.reporter';
 if(identityAutoAliasEnabled(env)){
  const resolved=effectiveIdentityGroupSql(env,alias);
  return `COALESCE((SELECT first.reporter FROM reporter_identity_groups g JOIN reports first
   ON first.id=g.representative_id WHERE g.active=1 AND g.id=${resolved}${publicOnly?" AND first.status='approved' AND first.name_public=1":''}),${alias}.reporter)`;
 }
 return `COALESCE((SELECT first.reporter FROM reporter_identity_groups g JOIN reports first ON first.id=g.representative_id,json_each(g.report_ids) j
 WHERE g.active=1 AND j.value=${alias}.id${publicOnly?" AND first.status='approved' AND first.name_public=1":''}),${alias}.reporter)`;
}
export function identityGuardStatement(db) {
 return db.prepare(`SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger' AND name IN (${IDENTITY_GUARDS.map(()=>'?').join(',')})`).bind(...IDENTITY_GUARDS);
}
export function checkIdentityGuards(result) {
 if(Number(result?.results?.[0]?.n)!==IDENTITY_GUARDS.length) throw new WorkerError('IDENTITY_UNAVAILABLE','동일인 확인 기록을 확인할 수 없습니다.',503);
}
export async function confirmedIdentityAction(db, body, actor) {
 const reason=typeof body?.reason==='string'?body.reason.trim():'';
 if(!reason || reason.length>500 || (body?.action==='confirm' && body?.confirmedSamePerson!==true)) throw new WorkerError('IDENTITY_CONFIRMATION_REQUIRED','동일인 확인과 근거가 필요합니다.',400);
 const now=new Date().toISOString();
 try {
  if(body.action==='confirm') {
   const ids=body.reportIds;
   if(!Array.isArray(ids)||ids.length<2||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||! /^[0-9A-Za-z_-]{1,64}$/.test(id))) throw new WorkerError('IDENTITY_REQUEST_INVALID','확인할 제보 ID가 올바르지 않습니다.',400);
   const id=crypto.randomUUID(),json=JSON.stringify(ids);
   await db.prepare(`INSERT INTO reporter_identity_groups(id,report_ids,representative_id,confirmed_by,evidence,created_at)
    VALUES(?1,?2,(SELECT r.id FROM reports r JOIN json_each(?2) j ON r.id=j.value ORDER BY r.received_at,r.id LIMIT 1),?3,?4,?5)`).bind(id,json,actor,reason,now).run();
   return {ok:true,groupId:id};
  }
  if(body.action==='revoke' && typeof body.groupId==='string' && /^[0-9a-f-]{36}$/.test(body.groupId)) {
   const sets=await db.batch([
    db.prepare('UPDATE reporter_identity_groups SET active=0,revoked_by=?1,revoked_reason=?2,revoked_at=?3 WHERE id=?4 AND active=1').bind(actor,reason,now,body.groupId),
    db.prepare('SELECT active FROM reporter_identity_groups WHERE id=?1').bind(body.groupId)
   ]);
   if(sets[1].results?.[0]?.active!==0) throw new WorkerError('IDENTITY_NOT_FOUND','확인 기록이 없습니다.',404);
   return {ok:true,groupId:body.groupId};
  }
  throw new WorkerError('IDENTITY_REQUEST_INVALID','확인 요청이 올바르지 않습니다.',400);
 } catch(error) {
  if(error instanceof WorkerError) throw error;
  if(/identity_invalid|identity_immutable|UNIQUE|FOREIGN KEY|NOT NULL/.test(String(error.message))) throw new WorkerError('IDENTITY_CONFLICT','제보 목록과 기존 확인 기록을 다시 확인해 주세요.',409);
  throw error;
 }
}

export function reporterKeySql(env, alias='reports', publicOnly=true) {
 if(!identityEnabled(env)) return alias+'.reporter';
 const visible=publicOnly?` AND EXISTS(SELECT 1 FROM reports first WHERE first.id=g.representative_id AND first.status='approved' AND first.name_public=1)`:'';
 if(identityAutoAliasEnabled(env)){
  const resolved=effectiveIdentityGroupSql(env,alias);
  return `COALESCE((SELECT 'group:'||g.id FROM reporter_identity_groups g
   WHERE g.active=1 AND g.id=${resolved}${visible}),'name:'||${alias}.reporter)`;
 }
 return `COALESCE((SELECT 'group:'||g.id FROM reporter_identity_groups g,json_each(g.report_ids) j WHERE g.active=1 AND j.value=${alias}.id${visible}),'name:'||${alias}.reporter)`;
}
