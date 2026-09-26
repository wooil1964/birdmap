// Preparation and read-only verification library. No Cloudflare credentials or remote API client.
import { fingerprint, stable, REPORT_COLUMNS, checklistFromReport, initialSighting, insert, rows, first, fail, assertNotPurged, TRANSFORM_VERSION } from '../src/canonical/data.js';

function validDate(value) {
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
function validTimestamp(value) {
  if(typeof value!=='string'||!validDate(value.slice(0,10)))return false;
  const match=/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match&&Number(match[1])<24&&Number(match[2])<60&&Number(match[3])<60&&(!match[4]||(Number(match[4])<24&&Number(match[5])<60))&&Number.isFinite(Date.parse(value));
}

async function verifyRegistry(db,revision) {
  const sites=await rows(db,'SELECT * FROM sites ORDER BY site_id');
  if(sites.length!==190||sites.some(s=>s.registry_revision!==revision))fail('REGISTRY_DRIFT','registry 전체와 revision을 확인해야 합니다.');
  const source=[];
  for(const site of sites) {
    let raw;try{raw=JSON.parse(site.source_record_json);}catch{fail('REGISTRY_DRIFT','registry 원본을 확인해야 합니다.');}
    if(raw.id!==site.site_id||raw.name!==site.site_name||(raw.lat??null)!==site.lat||(raw.lon??null)!==site.lon||site.retired_at!==null)fail('REGISTRY_DRIFT','registry 원본과 현재 값이 다릅니다.');
    source.push(raw);
  }
  if(await fingerprint(source.sort((a,b)=>a.id.localeCompare(b.id)))!==revision)fail('REGISTRY_DRIFT','registry checksum이 다릅니다.');
}

export async function prepareBackfill(input) {
  const {reports,manifest_sha256,source_count,transform_version,registry_revision,captured_at,run_id}=input||{};
  if(!Array.isArray(reports)||source_count!==reports.length||transform_version!==TRANSFORM_VERSION||!registry_revision||!run_id||!validTimestamp(captured_at))fail('MANIFEST_INVALID','실측 manifest 정보가 필요합니다.',400);
  const sorted=[...reports].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(new Set(sorted.map(r=>r.id)).size!==sorted.length)fail('SOURCE_DUPLICATE_ID','원본 ID가 중복되었습니다.',400);
  for(const r of sorted) {
    if(stable(Object.keys(r).sort())!==stable([...REPORT_COLUMNS].sort())||typeof r.id!=='string'||!r.id||typeof r.species!=='string'||!['pending','approved','rejected'].includes(r.status))fail('SOURCE_INVALID','원본 22필드 구조가 올바르지 않습니다.',400);
    if(r.bird_count!==null&&(!Number.isSafeInteger(r.bird_count)||r.bird_count<0))fail('SOURCE_COUNT_INVALID','원본 수량 이상값은 자동 보정하지 않습니다.',400);
    if(![0,1].includes(r.name_public)||![0,1].includes(r.pending_public))fail('SOURCE_CONSENT_INVALID','원본 동의/공개 이상값은 자동 보정하지 않습니다.',400);
    if(!validDate(r.observed_on)||!validTimestamp(r.received_at)||(r.decided_at!==null&&!validTimestamp(r.decided_at)))fail('SOURCE_DATE_INVALID','원본 날짜/시각 이상값은 자동 보정하지 않습니다.',400);
    for(const [lat,lon,required] of [['lat','lon',true],['public_lat','public_lon',false],['approx_lat','approx_lon',false]]) {
      for(const [key,limit] of [[lat,90],[lon,180]])if((required||r[key]!==null)&&(typeof r[key]!=='number'||!Number.isFinite(r[key])||Math.abs(r[key])>limit))fail('SOURCE_COORDINATE_INVALID','원본 좌표 이상값은 자동 보정하지 않습니다.',400);
    }
  }
  const actual=await fingerprint({reports:sorted});
  if(actual!==manifest_sha256)fail('MANIFEST_CHANGED','입력 manifest checksum이 다릅니다.',409);
  return {run_id,manifest_sha256,source_count,transform_version,registry_revision,captured_at,reports:sorted};
}
export async function backfillRows(plan) {
  const result=[];
  for(const r of plan.reports) {
    const raw={raw_id:`raw:${r.id}`,source_type:'legacy_reports_snapshot',source_id:r.id,request_id:null,payload_json:stable(r),submitted_at:null,submitted_by:null,schema_version:plan.transform_version,captured_at:plan.captured_at,source_fingerprint:await fingerprint(r),non_breeding_confirmed:null,policy_version:null};
    result.push({raw,checklist:checklistFromReport(r,raw.raw_id,plan.captured_at),sighting:initialSighting(r,plan.captured_at)});
  }
  return result;
}
export async function verifyBackfill(db,plan,{allowEmpty=false}={}) {
  await verifyRegistry(db,plan.registry_revision);
  for(const r of plan.reports)await assertNotPurged(db,r.id);
  const live=await rows(db,'SELECT * FROM reports ORDER BY id');
  if(stable(live)!==stable(plan.reports))fail('SOURCE_DRIFT','frozen snapshot과 현재 reports가 다릅니다.');
  const runs=await rows(db,'SELECT * FROM backfill_runs');
  const counts=await Promise.all(['raw_submissions','checklists','sightings'].map(async t=>Number((await first(db,`SELECT COUNT(*) AS n FROM ${t}`)).n)));
  if(!runs.length&&counts.every(n=>n===0)&&allowEmpty) {
    for(const r of plan.reports)if(r.site_id!==null&&!await first(db,'SELECT site_id FROM sites WHERE site_id=?',r.site_id))fail('SITE_ID_UNKNOWN','기존 site_id가 registry에 없습니다.');
    return {state:'ready',added:plan.source_count};
  }
  if(runs.length!==1||runs[0].manifest_checksum!==plan.manifest_sha256||runs[0].transform_version!==plan.transform_version||runs[0].source_count!==plan.source_count||runs[0].source_revision!==plan.registry_revision||runs[0].run_id!==plan.run_id)fail('MANIFEST_OR_PARTIAL_STATE','manifest 변경 또는 부분 상태입니다. 자동 덮어쓰지 않습니다.');
  if(counts.some(n=>n!==plan.source_count))fail('PARTIAL_STATE','backfill 행 수가 다릅니다.');
  for(const value of await backfillRows(plan))for(const [table,expected,key] of [['raw_submissions',value.raw,'raw_id'],['checklists',value.checklist,'checklist_id'],['sightings',value.sighting,'sighting_id']]) {
    const found=await first(db,`SELECT * FROM ${table} WHERE ${key}=?`,expected[key]);
    if(stable(found)!==stable(expected))fail('BACKFILL_DRIFT','backfill 전체 동등성 검증에 실패했습니다.');
  }
  if((await rows(db,'PRAGMA foreign_key_check')).length)fail('FOREIGN_KEY_ERROR','참조 무결성 오류가 있습니다.');
  return {state:'verified',added:0};
}
// Only the local harness calls this executor in 2B. The CLI exposes preparation/verification, never apply.
export async function applyBackfillLocally(db,plan,{scope,writeFrozen}={}) {
  if(scope!=='local-test'||writeFrozen!==true)fail('APPLY_DISABLED','이 단계에서는 로컬 시험만 허용됩니다.',403);
  const checked=await verifyBackfill(db,plan,{allowEmpty:true});if(checked.state==='verified')return checked;
  const statements=[];
  for(const value of await backfillRows(plan))statements.push(insert(db,'raw_submissions',value.raw),insert(db,'checklists',value.checklist),insert(db,'sightings',value.sighting));
  statements.push(insert(db,'backfill_runs',{run_id:plan.run_id,manifest_checksum:plan.manifest_sha256,transform_version:plan.transform_version,source_count:plan.source_count,completed_at:new Date().toISOString(),source_revision:plan.registry_revision}));
  await db.batch(statements);await verifyBackfill(db,plan);return {state:'applied',added:plan.source_count};
}
