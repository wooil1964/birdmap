import { WorkerError, sha256Hex } from '../shared.js';

export const SCHEMA_VERSION = 'phase2a-0001';
export const TRANSFORM_VERSION = 'phase2b-legacy-v1';
export const REPORT_COLUMNS = ['id','status','species','lat','lon','public_lat','public_lon','approx_lat','approx_lon','pending_public','observed_on','received_at','decided_at','bird_count','reporter','note','admin_note','site_id','name_public','spot_key','ip_hash','dedupe_hash'];
export const FIELD_MAP = {id:'checklist_id',species:'species_text',lat:'actual_lat',lon:'actual_lon',observed_on:'observation_date',bird_count:'shared_bird_count',ip_hash:'compat_ip_hash',dedupe_hash:'compat_dedupe_hash'};
export function stable(value) {
  if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const fingerprint = value => sha256Hex(stable(value));
export const rows = async (db,sql,...values) => (await db.prepare(sql).bind(...values).all()).results || [];
export const first = async (db,sql,...values) => db.prepare(sql).bind(...values).first();
const TABLES = new Set(['reports','captcha_redemptions','sites','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions']);
export function insert(db,table,value) {
  if (!TABLES.has(table) || Object.keys(value).some(k=>!/^\w+$/.test(k))) throw Error('invalid_internal_statement');
  return db.prepare(`INSERT INTO ${table} (${Object.keys(value).join(',')}) VALUES (${Object.keys(value).map(()=>'?').join(',')})`).bind(...Object.values(value));
}
export function fail(code,message,status=409) { throw new WorkerError(code,message,status); }
export function requestId(value) {
  if (typeof value!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) fail('REQUEST_ID_REQUIRED','유효한 요청 식별자가 필요합니다.',400);
  return value;
}
export function revision(value) {
  if (!Number.isSafeInteger(value)||value<1) fail('REVISION_REQUIRED','조회한 revision이 필요합니다.',400);
  return value;
}
export function assertion(db,key,condition='changes()=1',values=[]) {
  return db.prepare(`INSERT INTO transaction_assertions(assertion_id,ok) VALUES (?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`).bind(key,...values);
}
export const clearAssertion = (db,key) => db.prepare('DELETE FROM transaction_assertions WHERE assertion_id=?').bind(key);
export async function assertNotPurged(db,id) {
  if (await first(db,"SELECT audit_id FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?",id)) fail('REPORT_PURGED','정책에 따라 제거된 요청은 다시 저장할 수 없습니다.',410);
}
// Application boundary (not a replacement for restricting direct database credentials).
export function applicationDb(db) {
  return {
    prepare(sql) {
      const clean=sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
      if (!/^(SELECT|PRAGMA|INSERT|UPDATE|DELETE)\b/i.test(clean) || /;\s*\S/.test(clean) ||
          /\b(REPLACE|DROP|ALTER)\b/i.test(clean) || /\bUPDATE\s+["`\[]?(reviews|audit_log|raw_submissions)\b/i.test(clean) ||
          (/\bDELETE\b/i.test(clean) && !/^DELETE FROM (transaction_assertions WHERE assertion_id|captcha_redemptions WHERE redeemed_at<)=?\?$/i.test(clean))) {
        fail('APPEND_ONLY','일반 경로에서는 원자료·검토·감사 기록 삭제/변경을 허용하지 않습니다.',403);
      }
      return db.prepare(sql);
    },
    batch(statements) { return db.batch(statements); },
  };
}
export function checklistFromReport(r,rawId,capturedAt,native=false) {
  const c={};for(const key of REPORT_COLUMNS)c[FIELD_MAP[key]||key]=r[key];
  return {...c,raw_id:rawId,source_type:native?'native':'legacy_reports',source_id:r.id,
    record_mode:native?'quick_report':'legacy_report',start_time:null,timezone:null,duration_minutes:null,distance_m:null,observer_count:null,protocol:null,complete_list:null,
    coordinate_uncertainty_m:null,coordinate_policy:native?'actual':'legacy_fallback',created_at:capturedAt,revision:1,updated_at:capturedAt};
}
export function initialSighting(r,capturedAt,native=false) {
  const multiple=/[·,;\n/]/.test(r.species);
  return {sighting_id:`sighting:${r.id}:1`,checklist_id:r.id,source_ordinal:1,species_original:r.species,species_identified:null,
    interpretation:multiple?'unparsed_multiple':'single',taxon_id:null,count_value:multiple?null:r.bird_count,count_accuracy:'unknown',
    count_source:multiple?'ambiguous_group':r.bird_count===null?'not_recorded':native?'reported':'legacy_single',interpretation_note:null,created_at:capturedAt,updated_at:capturedAt};
}
export const canonicalProjection = `SELECT ${REPORT_COLUMNS.map(k=>(FIELD_MAP[k]||k)+(FIELD_MAP[k]?` AS ${k}`:'')).join(',')} FROM checklists WHERE record_mode IN ('legacy_report','quick_report') AND actual_lat IS NOT NULL AND actual_lon IS NOT NULL`;
export function canonicalReadDb(db) {
  return {prepare(sql) {
    if (!/^\s*SELECT\b/i.test(sql) || !/\bFROM reports\b/.test(sql)) throw Error('unsupported_read_query');
    return db.prepare(sql.replace(/\bFROM reports\b/g,`FROM (${canonicalProjection}) AS reports`));
  }};
}
export function projectChecklist(c) {return Object.fromEntries(REPORT_COLUMNS.map(k=>[k,c[FIELD_MAP[k]||k]]));}
