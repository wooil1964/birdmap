import {WorkerError} from './shared.js';
// Candidate hints never change membership. Only confirmedIdentityAction writes groups.
const compact=name=>String(name||'').replace(/\s/gu,'');
function related(a,b){
 const x=compact(a),y=compact(b);
 if(!x||!y)return null;
 if(x===y)return a===b?'같은 이름 (동명이인 확인 필요)':'공백 차이';
 const [short,long]=x.length<y.length?[x,y]:[y,x];
 return short.length>=3&&long.startsWith(short)&&/^[가-힣]{3}$/.test(long.slice(short.length))?'닉네임 뒤 이름 추가 가능성':null;
}
export function identityCandidates(reports,groups){
 const active=groups.filter(g=>g.active),owners=new Map(),aliases=new Map(),byId=new Map(reports.map(r=>[r.id,r]));
 for(const g of active){const ids=JSON.parse(g.report_ids);for(const id of ids){if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(g.id);const r=byId.get(id);if(r&&compact(r.reporter)){const key=compact(r.reporter);if(!aliases.has(key))aliases.set(key,new Set());aliases.get(key).add(g.id);}}}
 const named=new Map();for(const r of reports){if(!compact(r.reporter))continue;if(!named.has(r.reporter))named.set(r.reporter,[]);named.get(r.reporter).push(r);}
 const entries=[...named],out=[],seen=new Set();
 function add(rows,reason,extra=[]){const ids=[...new Set(rows.map(r=>r.id))].sort();if(ids.length<2)return;const key=ids.join('|');if(seen.has(key))return;seen.add(key);const gs=new Set(extra);ids.forEach(id=>owners.get(id)?.forEach(g=>gs.add(g)));if(out.length>=200)throw new WorkerError('IDENTITY_CANDIDATE_LIMIT','후보가 200개를 넘어 전체 충돌 검토가 필요합니다.',409);out.push({reportIds:ids,reports:ids.map(id=>byId.get(id)).map(r=>({id:r.id,reporter:r.reporter,status:r.status,namePublic:r.name_public===1})),reason,groupIds:[...gs].sort(),conflict:gs.size>1});}
 for(let i=0;i<entries.length;i++){
  const [name,rows]=entries[i];if(rows.some(r=>!owners.has(r.id)))add(rows,'같은 이름 (동명이인 확인 필요)');
  for(let j=i+1;j<entries.length;j++){const reason=related(name,entries[j][0]);if(reason){const rows2=rows.concat(entries[j][1]);if(rows2.some(r=>!owners.has(r.id)))add(rows2,reason);}}
  const gs=aliases.get(compact(name));if(gs&&rows.some(r=>!owners.has(r.id))){const linked=reports.filter(r=>owners.get(r.id)&&[...owners.get(r.id)].some(g=>gs.has(g)));add(linked.concat(rows),'확인된 별칭의 새 제보 (재확인 필요)',gs);}
 }
 const collisions=new Map();for(const c of out)for(const id of c.reportIds){if(!collisions.has(id))collisions.set(id,new Set());c.groupIds.forEach(g=>collisions.get(id).add(g));}
 for(const c of out)if(c.reportIds.some(id=>collisions.get(id).size>1))c.conflict=true;
 return out;
}
export async function readIdentityCandidates(db){
 const sets=await db.batch([db.prepare('SELECT id,reporter,status,name_public FROM reports ORDER BY received_at DESC,id LIMIT 2001'),db.prepare('SELECT id,report_ids,active FROM reporter_identity_groups WHERE active=1 LIMIT 2001')]);
 const reports=sets[0].results||[],groups=sets[1].results||[];
 if(reports.length>2000||groups.length>2000)throw new WorkerError('IDENTITY_CANDIDATE_LIMIT','자료가 2000건을 넘어 후보 전체를 안전하게 확인할 수 없습니다. 기존 확인 관리 경로를 사용해 주세요.',409);
 return {ok:true,candidates:identityCandidates(reports,groups),scanned:reports.length};
}
