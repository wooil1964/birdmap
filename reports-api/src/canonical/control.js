import { WorkerError, jsonResponse } from '../shared.js';
import { rows, fingerprint, SCHEMA_VERSION } from './data.js';

export const BUILD_CAPABILITY='phase2c-dual-v3';
const MODES=new Set(['NORMAL','READ_ONLY_MAINTENANCE','CANONICAL_DUAL_WRITE']);
export function writeMode(env) {return env.REPORTS_WRITE_MODE===undefined?'NORMAL':env.REPORTS_WRITE_MODE;}
function closed(code='WRITE_MAINTENANCE') {const e=new WorkerError(code,'제보 쓰기를 잠시 중지했습니다. 잠시 후 다시 시도해 주세요.',503);e.retryAfter=60;throw e;}
export async function schemaReady(db) {
  try {
    const tables=['sites','taxa','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions'];
    const objects=(await rows(db,`SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND tbl_name IN (${tables.map(()=>'?').join(',')}) ORDER BY type,name`,...tables))
      .map(r=>({...r,sql:r.sql.replace(/\s+/g,' ').trim().replace(/;$/,'')}));
    // All 2A table definitions, indexes and triggers, including CHECK/FK/UNIQUE.
    return await fingerprint(objects)==='76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0';
  } catch {return false;}
}
export async function capability(env,role) {
  const mode=writeMode(env);
  const configured=env.REPORTS_DUAL_WRITE_ENABLED==='true'&&env.REPORTS_CONFIRMATION_REQUIRED==='true'&&
    env.REPORTS_SCHEMA_VERSION===SCHEMA_VERSION&&typeof env.REPORTS_ACTIVATION_ID==='string'&&env.REPORTS_ACTIVATION_ID.length>0&&
    typeof env.REPORTS_RELEASE_ID==='string'&&env.REPORTS_RELEASE_ID.length>0&&['0','1'].includes(env.REPORTS_PENDING_PUBLIC)&&
    typeof env.REPORTS_PEER_RELEASE_ID==='string'&&env.REPORTS_PEER_RELEASE_ID.length>0&&
    typeof env.REPORTS_PEER?.fetch==='function'&&typeof env.REPORTS_GATE_TOKEN==='string'&&env.REPORTS_GATE_TOKEN.length>0&&
    (env.ENVIRONMENT!=='production'||env.REPORTS_REMOTE_VERIFIED==='true');
  return {role,build:BUILD_CAPABILITY,mode,activation:env.REPORTS_ACTIVATION_ID||null,release:env.REPORTS_RELEASE_ID||null,peerRelease:env.REPORTS_PEER_RELEASE_ID||null,
    schema:SCHEMA_VERSION,ready:configured&&await schemaReady(env.REPORTS_DB)};
}
export async function internalCapability(request,env,role) {
  if(!env.REPORTS_GATE_TOKEN||request.headers.get('X-Reports-Gate')!==env.REPORTS_GATE_TOKEN)return new Response('Not found',{status:404});
  return Response.json(await capability(env,role),{headers:{'Cache-Control':'no-store'}});
}
export async function assertWriteGate(env,role) {
  const mode=writeMode(env);
  if(!MODES.has(mode)||mode==='READ_ONLY_MAINTENANCE')closed();
  if(mode==='NORMAL') {
    if(env.REPORTS_DUAL_WRITE_ENABLED==='true')closed('ROLLOUT_NOT_READY');
    return false;
  }
  const own=await capability(env,role);
  if(!own.ready||!env.REPORTS_PEER?.fetch||!env.REPORTS_GATE_TOKEN||!env.REPORTS_PEER_RELEASE_ID)closed('ROLLOUT_NOT_READY');
  let peer;
  try {
    const response=await env.REPORTS_PEER.fetch(new Request('https://reports-gate.internal/_internal/reports-capability',{headers:{'X-Reports-Gate':env.REPORTS_GATE_TOKEN},signal:AbortSignal.timeout(3000)}));
    if(!response.ok)closed('ROLLOUT_NOT_READY');peer=await response.json();
  } catch {closed('ROLLOUT_NOT_READY');}
  if(!peer.ready||peer.role!==(role==='public'?'admin':'public')||peer.mode!==mode||peer.build!==BUILD_CAPABILITY||peer.schema!==own.schema||peer.activation!==own.activation||peer.release!==env.REPORTS_PEER_RELEASE_ID||peer.peerRelease!==own.release)closed('ROLLOUT_NOT_READY');
  return true;
}
export function publicCapability(request,env) {
  const enabled=writeMode(env)==='CANONICAL_DUAL_WRITE'&&env.REPORTS_CONFIRMATION_REQUIRED==='true';
  return jsonResponse(request,env,{ok:true,quickReport:{nonBreedingConfirmation:enabled,requestId:enabled},maintenance:writeMode(env)==='READ_ONLY_MAINTENANCE'},200,{'Cache-Control':'no-store'});
}
