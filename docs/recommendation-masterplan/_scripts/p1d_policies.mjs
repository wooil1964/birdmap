/* Analysis-only quota policies. No application imports or mutations. */
import {prefix,select as currentSelect} from './p1b_policies.mjs';
export const POLICIES=['current_4312','global_rank','flex_1111','flex_2211','quota_only_2211'];
export const axis=e=>e.axes.pelagic?'pelagic':e.axes.field?'field':e.axes.mudflat?'mudflat':'other';
const id=(a,b)=>Number(a.site.id)-Number(b.site.id);
export function globalRank(api,a,b){
 return api.weeklyRankScore(b)-api.weeklyRankScore(a)||api.weeklyRecentTieBreak(a,b)||
 String(a.recommendationDate||'9999').localeCompare(String(b.recommendationDate||'9999'))||id(a,b);
}
export function selectQuota(api,rt,entries,policy,trace=[]){
 if(policy==='current_4312')return currentSelect(api,rt,entries,'A1',trace);
 const selected=[],used=new Set();let ship=0;
 const add=(e,phase)=>{if(selected.length>=10||used.has(String(e.site.id))||(e.axes.pelagic&&ship>=1))return false;
 used.add(String(e.site.id));if(e.axes.pelagic)ship++;selected.push({...e,selectedAxis:phase});return true;};
 function take(phase,limit,filter,cmp,pool){
  const available=pool.filter(filter).filter(e=>!used.has(String(e.site.id))&&(!e.axes.pelagic||ship<1)).sort(cmp);
  const picked=[];for(const e of available)if(picked.length<limit&&add(e,phase))picked.push(String(e.site.id));
  trace.push({phase,limit,available:available.length,selected:picked,boundaryRank:picked.length?api.weeklyRankScore(selected.at(-1)):null});
 }
 if(policy==='global_rank')take('global',10,()=>true,(a,b)=>globalRank(api,a,b),entries);
 else{
  const floors=policy==='flex_1111'?[1,1,1,1]:[2,2,1,1],seasonPool=api.weeklySeasonQuotaEntries(entries,'autumn');
  const filters=[e=>e.axes.field&&!e.axes.pelagic,e=>e.axes.mudflat&&!e.axes.pelagic,e=>e.axes.pelagic,e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic];
  ['field','mudflat','pelagic','other'].forEach((phase,i)=>take(phase,floors[i],filters[i],(a,b)=>prefix(api,a,b,phase)||id(a,b),seasonPool));
  const final=policy==='quota_only_2211'?(a,b)=>prefix(api,a,b,'fill')||id(a,b):(a,b)=>globalRank(api,a,b);
  take('fill',10,()=>true,final,entries);
 }
 return selected;
}
