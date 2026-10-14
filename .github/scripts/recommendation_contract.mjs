// Independent selection contract. No application import, writes, API calls or score generation.
import assert from 'node:assert/strict';
const cmpDate=(a,b)=>String(a||'9999').localeCompare(String(b||'9999'));
const byId=(a,b)=>Number(a.id)-Number(b.id);
const recent=(a,b)=>((a.recent?.ageDays??Infinity)-(b.recent?.ageDays??Infinity)||0)||((b.recent?.speciesCount||0)-(a.recent?.speciesCount||0));
const rank=(a,b)=>b.rank-a.rank;
const general=(a,b)=>a.priority-b.priority||rank(a,b)||recent(a,b)||(b.sortLevel||0)-(a.sortLevel||0);
export function recommendationPrefix(a,b,season,phase){
  if(season==='autumn'){
    if(phase==='field')return rank(a,b)||recent(a,b)||Number(b.autumnCore)-Number(a.autumnCore)||cmpDate(a.date,b.date);
    if(phase==='pelagic')return rank(a,b)||recent(a,b)||cmpDate(a.date,b.date);
    return phase==='fill'?(rank(a,b)||general(a,b)):general(a,b);
  }
  if(season==='winter')return rank(a,b)||recent(a,b)||Number(b.winterCore)-Number(a.winterCore)||cmpDate(a.date,b.date);
  const ordinary=()=>rank(a,b)||recent(a,b)||cmpDate(a.date,b.date);
  if(season==='spring'&&phase==='island')return rank(a,b)||recent(a,b)||Number(b.springCore)-Number(a.springCore)||ordinary();
  if(season==='spring'&&phase==='mudflat')return Number(b.springGeolmaeriPriority)-Number(a.springGeolmaeriPriority)||ordinary();
  return ordinary();
}
export function independentSelection(rows,month,{trace=[]}={}){
  const season=month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month===9||month===10?'autumn':'winter';
  const safe=rows.filter(e=>e.eligible===true&&e.safe!==false),quota=safe.filter(e=>!e.season||e.season===season),selected=[],used=new Set();let pelagic=0;
  const phases=season==='autumn'?[['field',4],['mudflat',3],['pelagic',1],['other',2],['fill',10]]:
    season==='winter'?[['field',3],['water',3],['coast',3],['pelagic',1],['fill',10]]:
    season==='spring'?[['island',4],['mudflat',3],['pelagic',1],['other',2],['fill',10]]:
    [['forest',3],['water',3],['coast',2],['other',month===6?1:2],...(month===6?[['pelagic',1]]:[]),['fill',10]];
  const allowed=safe.filter(e=>e.axes&&!e.axes.excludedReason);
  const own=allowed.filter(e=>!e.season||e.season===season);
  const winterOwn=own.filter(e=>e.axes.field||e.axes.water||e.axes.coast||e.axes.pelagic);
  const summerOwn=own.filter(e=>e.axes.pelagic?(month===6&&Number(e.id)===48&&e.pelagicSafe):(e.axes.forest||e.axes.water||e.axes.coast||e.axes.other));
  const tally=key=>{const m=new Map();selected.forEach(e=>m.set(e[key],(m.get(e[key])||0)+1));return m;};
  for(const [phase,limit] of phases){
    let pool;
    if(season==='autumn')pool=phase==='fill'?safe:quota;
    else if(season==='winter')pool=phase==='fill'?winterOwn.concat(allowed.filter(e=>e.season&&e.season!=='winter')):winterOwn;
    else if(season==='spring')pool=phase==='fill'?allowed:own;
    else pool=phase==='fill'?summerOwn.concat(allowed.filter(e=>e.season&&e.season!=='summer')):summerOwn;
    const phaseEligible=e=>phase==='fill'?(season!=='summer'||!e.axes.pelagic):season==='autumn'?
      phase==='field'?e.axes.field&&!e.axes.pelagic:phase==='mudflat'?e.axes.mudflat&&!e.axes.pelagic:phase==='pelagic'?e.axes.pelagic:!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic:!!e.axes[phase];
    const canAdd=e=>!used.has(e.id)&&(season==='summer'||!e.axes.pelagic||pelagic<1);
    pool=pool.filter(phaseEligible).sort((a,b)=>recommendationPrefix(a,b,season,phase)||byId(a,b));
    let n=0;
    while(pool.length&&n<limit&&selected.length<10){
      const available=pool.filter(canAdd);if(!available.length)break;
      const leader=available[0],ties=available.filter(e=>recommendationPrefix(leader,e,season,phase)===0),regions=tally('region'),rules=tally('rule');
      ties.sort((a,b)=>(regions.get(a.region)||0)-(regions.get(b.region)||0)||(rules.get(a.rule)||0)-(rules.get(b.rule)||0)||byId(a,b));
      const win=ties[0];assert.equal(recommendationPrefix(leader,win,season,phase),0,'selection cannot cross a phase prefix');
      trace.push({phase,id:win.id,tiedIds:ties.map(e=>e.id),leaderId:leader.id});
      selected.push({...win,selectedAxis:phase});used.add(win.id);if(win.axes.pelagic)pelagic++;pool=pool.filter(e=>e!==win);n++;
    }
  }
  return selected;
}
export function assertSelectedContracts(baseRows,top,month,label='top'){
  assert.ok(Array.isArray(baseRows)&&Array.isArray(top),label+' contract arrays');
  const candidates=new Map(baseRows.map(e=>[e.id,e]));assert.equal(candidates.size,baseRows.length,label+' unique candidate IDs');
  assert.equal(new Set(top.map(e=>e.id)).size,top.length,label+' duplicate selected ID');assert.ok(top.length<=10,label+' max10');
  for(const e of top){assert.ok(candidates.has(e.id),label+' unknown selected ID '+e.id);const {selectedAxis,...payload}=e;assert.deepEqual(payload,candidates.get(e.id),label+' same-ID values including date/time/priority/notice/tide/type/provenance '+e.id);assert.equal(e.eligible,true,label+' eligibility');assert.equal(e.safe,true,label+' safety');assert.ok(typeof e.score==='number'&&Number.isFinite(e.score)&&e.score>=0&&e.score<=100);assert.equal(e.rank,e.score+e.bonus,label+' rank');assert.equal(typeof selectedAxis,'string',label+' phase');}
  const trace=[];const expected=independentSelection(baseRows,month,{trace});assert.deepEqual(top,expected,label+' independent full-prefix/quotas/diversity/ID selection');
  return trace;
}
export function assertTopProjection(top,contracts,{synthetic=false}={}){
  assert.equal(top.length,contracts.length,'top projection length');
  for(let i=0;i<top.length;i++){
    const e=contracts[i],expected={id:e.id,name:e.name,score:e.score,rank:e.rank,date:e.date,time:e.time};
    if(!synthetic)Object.assign(expected,{bonus:e.bonus,mandatory:e.mandatory,reasons:e.reasons.join(' / '),tide:e.tide,basis:e.basis});
    const actual=Object.fromEntries(Object.keys(expected).map(k=>[k,k==='id'?String(top[i][k]):top[i][k]]));
    assert.deepEqual(actual,expected,'top projection same-ID values');
  }
}
export function assertRecommendationContract(before,after,label='recommendation'){
  assert.equal(after.siteCount,190,label+' registry size');assert.equal(after.registrySignature,before.registrySignature,label+' site registry and coordinates');
  assert.equal(after.selectionMonth,before.selectionMonth,label+' selection season');assert.deepEqual(after.candidateContracts,before.candidateContracts,label+' all same-ID candidate contracts including safety/type/recent/core');
  assert.equal(after.candidates,after.candidateContracts.length,label+' candidate count');
  assertTopProjection(after.top,after.topContracts);return assertSelectedContracts(before.candidateContracts,after.topContracts,after.selectionMonth,label);
}
