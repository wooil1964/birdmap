// Pure action plan extracted from the existing admin handler. Both writers share it.
import { WorkerError, approximateCoordinate, normalizeCoordinate, normalizeObservedOn, normalizeSpecies } from './shared.js';
export const ACTIONS=['approve','reject','unpublish','link','unlink','consent','visibility','site'];
export async function loadReport(db,id) {
  const row=await db.prepare('SELECT * FROM reports WHERE id = ?1').bind(id).first();
  if(!row)throw new WorkerError('NOT_FOUND','제보를 찾을 수 없습니다.',404);
  return row;
}
export async function planAction(db,body,row,admin,now) {
  const action=String(body?.action||''),id=row.id;
  if(!ACTIONS.includes(action))throw new WorkerError('ACTION_INVALID','알 수 없는 처리입니다.',400);
  const admin_note=body.adminNote===undefined?row.admin_note:String(body.adminNote||'').slice(0,1000);
  const base={ok:true,id};
  if(action==='reject'||action==='unpublish') {
    const status=action==='reject'?'rejected':'pending';
    return {patch:{status,pending_public:0,decided_at:now,admin_note},result:{...base,status}};
  }
  if(action==='consent') {
    const name_public=body.namePublic===true||body.namePublic===1?1:0;
    return {patch:{name_public,admin_note},result:{...base,namePublic:name_public}};
  }
  if(action==='visibility') {
    const open=body.public===true||body.public===1?1:0;
    if(open&&row.status!=='pending')throw new WorkerError('ACTION_INVALID','승인 대기 중인 제보만 황색 마커로 공개할 수 있습니다.',400);
    const approx=open&&(row.approx_lat==null||row.approx_lon==null)?approximateCoordinate(row.lat,row.lon):{lat:row.approx_lat,lon:row.approx_lon};
    return {patch:{pending_public:open,approx_lat:approx.lat,approx_lon:approx.lon,admin_note},result:{...base,pendingPublic:open}};
  }
  if(action==='site') {
    const raw=body.siteId===undefined||body.siteId===null?'':String(body.siteId).trim();
    if(raw&&!/^[0-9A-Za-z_-]{1,16}$/.test(raw))throw new WorkerError('SITE_ID_INVALID','탐조지 ID 형식이 아닙니다.',400);
    return {patch:{site_id:raw||null,admin_note},result:{...base,siteId:raw||null}};
  }
  if(action==='unlink')return {patch:{spot_key:null,admin_note},result:{...base,spotKey:null}};
  if(action==='link') {
    const spotKey=String(body.spotKey||'');let linkTarget=null;
    if(!spotKey||spotKey===id)throw new WorkerError('TARGET_INVALID','연결할 지점을 선택해 주세요.',400);
    if(/^fixed:[0-9]{1,6}:[0-9]{1,3}$/.test(spotKey)) { /* Preserve current fixed-key syntax contract. */ }
    else if(/^[0-9a-f-]{36}$/.test(spotKey)) {
      const target=await loadReport(db,spotKey);
      if(target.spot_key)throw new WorkerError('TARGET_INVALID','이미 다른 지점에 연결된 제보에는 붙일 수 없습니다.',400);
      linkTarget=spotKey;
    } else throw new WorkerError('TARGET_INVALID','지점 키 형식이 올바르지 않습니다.',400);
    return {patch:{status:'approved',spot_key:spotKey,decided_at:now,admin_note},result:{...base,status:'approved',spotKey},linkTarget};
  }
  const species=body.species===undefined?String(row.species):normalizeSpecies(body.species).join(' · ');
  const coordinate=body.lat===undefined&&body.lon===undefined?{lat:row.lat,lon:row.lon}:normalizeCoordinate(body.lat,body.lon);
  const usePublic=body.publicLat!==undefined||body.publicLon!==undefined;
  const publicCoordinate=usePublic?(body.publicLat===null||body.publicLat===''?{lat:null,lon:null}:normalizeCoordinate(body.publicLat,body.publicLon)):{lat:row.public_lat,lon:row.public_lon};
  const siteId=body.siteId===undefined?row.site_id:String(body.siteId||'')||null;
  const observedOn=body.observedOn===undefined?String(row.observed_on):normalizeObservedOn(body.observedOn);
  const namePublic=body.namePublic===undefined?(Number(row.name_public)===1?1:0):(body.namePublic===true||body.namePublic===1?1:0);
  return {patch:{status:'approved',species,lat:coordinate.lat,lon:coordinate.lon,public_lat:publicCoordinate.lat,public_lon:publicCoordinate.lon,site_id:siteId,observed_on:observedOn,name_public:namePublic,decided_at:now,admin_note},result:{...base,status:'approved',by:admin.email}};
}
