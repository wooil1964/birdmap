import { SITE_PICKER_JS } from '../src/site-picker.js';
import { fingerprint, stable, insert, rows, fail } from '../src/canonical/data.js';

export async function prepareSiteSeed(html,{capturedAt,expectedCount=190}={}) {
  const arrays=new Function(SITE_PICKER_JS+'\nreturn siteDataArrays;')()(html);
  const source=arrays.flatMap(a=>JSON.parse(a));
  if(source.length!==expectedCount||new Set(source.map(s=>String(s.id))).size!==source.length)fail('REGISTRY_INVALID','탐조지 수 또는 ID 중복을 확인해야 합니다.',400);
  const checksum=await fingerprint([...source].sort((a,b)=>a.id.localeCompare(b.id)));
  if(!capturedAt||!Number.isFinite(Date.parse(capturedAt)))fail('CAPTURE_TIME_REQUIRED','확인 시각이 필요합니다.',400);
  const sites=source.map(s=>{
    if(typeof s.id!=='string'||!s.id||typeof s.name!=='string'||!s.name)fail('REGISTRY_INVALID','탐조지 ID와 이름을 확인해야 합니다.',400);
    const lat=s.lat??null,lon=s.lon??null;
    if((lat===null)!==(lon===null)||(lat!==null&&(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)))fail('REGISTRY_COORDINATE_INVALID','탐조지 좌표를 추정하거나 보정하지 않습니다.',400);
    return {site_id:s.id,site_name:s.name,lat,lon,registry_source:'index.html:siteData',registry_revision:checksum,source_record_json:stable(s),created_at:capturedAt,retired_at:null};
  });
  return {registry_revision:checksum,source_count:sites.length,sites};
}
export async function seedSitesLocally(db,plan,{scope}={}) {
  if(scope!=='local-test')fail('SEED_DISABLED','이 단계에서는 로컬 시험만 허용됩니다.',403);
  const current=await rows(db,'SELECT * FROM sites ORDER BY site_id');
  if(current.length) {
    const expected=[...plan.sites].sort((a,b)=>a.site_id.localeCompare(b.site_id));
    if(stable(current)!==stable(expected))fail('REGISTRY_DRIFT','기존 registry가 다릅니다. ID를 수정/병합하지 않습니다.');
    return {added:0};
  }
  await db.batch(plan.sites.map(s=>insert(db,'sites',s)));return {added:plan.sites.length};
}
