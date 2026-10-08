/* Three analysis-only tie policies; never imported by the application. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {loadRuntime,DOCS,sha256} from './recommendation_runtime.mjs';
import {ordersFor,metrics,compact,invariant,count} from './p1b_experiment.mjs';
const cmp=(a,b)=>a===b?0:a<b?-1:1;
const idcmp=(a,b)=>Number(a.site.id)-Number(b.site.id);
const core=new Set([7,8,10,15,20]);
export function prefix(api,a,b,phase){
 const rank=cmp(api.weeklyRankScore(b),api.weeklyRankScore(a)),recent=api.weeklyRecentTieBreak(a,b);
 const general=()=>cmp(a.priority,b.priority)||rank||recent||cmp(b.sortLevel||0,a.sortLevel||0);
 if(phase==='field')return rank||recent||cmp(Number(core.has(Number(b.site.id))),Number(core.has(Number(a.site.id))))||
  String(a.recommendationDate||'9999').localeCompare(String(b.recommendationDate||'9999'));
 if(phase==='pelagic')return rank||recent||String(a.recommendationDate).localeCompare(String(b.recommendationDate));
 return phase==='fill'?(rank||general()):general();
}
const knownAsc=(a,b)=>{const ak=typeof a==='number'&&Number.isFinite(a),bk=typeof b==='number'&&Number.isFinite(b);
 return cmp(Number(bk),Number(ak))||(ak&&bk?cmp(a,b):0);};
export function tie(api,rt,a,b,policy,selected){
 if(policy==='original')return a.stableOrder-b.stableOrder||idcmp(a,b);
 if(policy==='A2')return String(a.recommendationDate||'9999').localeCompare(String(b.recommendationDate||'9999'))||
  String(a.recommendationTime||'99:99').localeCompare(String(b.recommendationTime||'99:99'))||
  knownAsc(a.sample?.precipitation3h,b.sample?.precipitation3h)||knownAsc(a.sample?.gust,b.sample?.gust)||
  knownAsc(a.sample?.windSpeed,b.sample?.windSpeed)||idcmp(a,b);
 if(policy==='A3'){
  const regions=count(selected.map(e=>e.site.sido)),rules=count(selected.map(e=>rt.canonical(e.site)));
  return cmp(regions[a.site.sido]||0,regions[b.site.sido]||0)||cmp(rules[rt.canonical(a.site)]||0,rules[rt.canonical(b.site)]||0)||idcmp(a,b);
 }return idcmp(a,b);
}
export function select(api,rt,entries,policy,trace=[]){
 const selected=[],used=new Set();let pelagic=0;
 const quota=api.weeklySeasonQuotaEntries(entries,'autumn');
 const phases=[['field',4,e=>e.axes.field&&!e.axes.pelagic],['mudflat',3,e=>e.axes.mudflat&&!e.axes.pelagic],
 ['pelagic',1,e=>e.axes.pelagic],['other',2,e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic],['fill',10,()=>true]];
 for(const [phase,limit,filter] of phases){
  const candidates=(phase==='fill'?entries:quota).filter(filter).filter(e=>!used.has(String(e.site.id))&&(!e.axes.pelagic||pelagic<1));
  candidates.sort((a,b)=>prefix(api,a,b,phase)||idcmp(a,b));
  const groups=[];for(const e of candidates){const g=groups.at(-1);if(g&&prefix(api,g[0],e,phase)===0)g.push(e);else groups.push([e]);}
  const record={phase,available:candidates.length,tieGroups:groups.filter(g=>g.length>1).map(g=>g.map(e=>String(e.site.id))),
    selectedTieSlots:0,boundaryTies:[],selected:[]};
  let added=0;
  for(const group of groups){
   const remaining=group.slice();let taken=0;
   while(remaining.length&&added<limit&&selected.length<10){
    const eligible=remaining.filter(e=>!used.has(String(e.site.id))&&(!e.axes.pelagic||pelagic<1));if(!eligible.length)break;
    // Greedy state is read once per selection. Never mutate state inside Array.sort comparator.
    eligible.sort((a,b)=>tie(api,rt,a,b,policy,selected));const winner=eligible[0];
    remaining.splice(remaining.indexOf(winner),1);used.add(String(winner.site.id));
    if(winner.axes.pelagic)pelagic++;
    selected.push({...winner,selectedAxis:phase});record.selected.push(String(winner.site.id));added++;taken++;
   }
   if(group.length>1&&taken){record.selectedTieSlots+=taken;if(taken<group.length)record.boundaryTies.push({ids:group.map(e=>String(e.site.id)),selected:taken});}
   if(added>=limit||selected.length>=10)break;
  }
  trace.push(record);
 }
 return selected;
}
if(process.argv.includes('--write')){
 const rt=loadRuntime('docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json'),orders=ordersFor(rt.sites),results=[];
 for(const reports of [true,false]){
  const api=rt.makeApi(reports),base=api.todayRecommendedSites(),entries=rt.sites.map((s,stableOrder)=>{
   const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());return e&&api.weeklyRecommendationIsSafe(e)!==false?{...e,stableOrder}:null;}).filter(Boolean);
  const signatures=new Map(entries.map(e=>[String(e.site.id),invariant(e)]));
  const baseline=compact(api,base),trace=[];assert.deepEqual(compact(api,select(api,rt,entries,'original',trace)),baseline);
  const cachedTrials=[],boundaryByPhase={},tieSlots=[],perTrialBoundaryGroups=[];
  for(const order of orders){
   const position=new Map(order.map((s,i)=>[String(s.id),i])),rows=entries.map(e=>({...e,stableOrder:position.get(String(e.site.id))})),t=[];
   const actualSelector=api.autumnBalancedRecommendations(rows),analysisSelector=select(api,rt,rows,'original',t);
   assert.deepEqual(compact(api,analysisSelector),compact(api,actualSelector));
   cachedTrials.push({ids:actualSelector.map(e=>String(e.site.id)),axes:actualSelector.map(e=>e.selectedAxis)});
   let boundaries=0,totalTieSlots=0;
   for(const x of t){boundaryByPhase[x.phase]=(boundaryByPhase[x.phase]||0)+x.boundaryTies.length;boundaries+=x.boundaryTies.length;totalTieSlots+=x.selectedTieSlots;}
   perTrialBoundaryGroups.push(boundaries);tieSlots.push(totalTieSlots);
  }
  const policyResults=[];
  for(const policy of ['A1','A2','A3']){
   const top=select(api,rt,entries,policy),baselineAlt=compact(api,top),trials=[];
   for(const order of orders){
    const positions=new Map(order.map((s,i)=>[String(s.id),i])),rows=entries.map(e=>({...e,stableOrder:positions.get(String(e.site.id))}));
    const selected=select(api,rt,rows,policy);
    assert.ok(selected.every(e=>invariant(e)===signatures.get(String(e.site.id))&&api.weeklyRecommendationIsSafe(e)===true));
    trials.push({ids:selected.map(e=>String(e.site.id)),axes:selected.map(e=>e.selectedAxis)});
   }
   const alternativeApi=rt.makeApi(reports);alternativeApi.setSelector(e=>select(alternativeApi,rt,e,policy));
   let actualPipelineChecks=0;
   for(const order of [rt.sites,orders[0],orders[137],orders[999]]){
    alternativeApi.setSites(order);
    assert.deepEqual(compact(alternativeApi,alternativeApi.todayRecommendedSites()),baselineAlt);actualPipelineChecks++;
   }
   const m=metrics(rt,trials,baselineAlt,entries);assert.equal(m.membershipChangeRate,0);assert.equal(m.orderChangeRate,0);
   policyResults.push({policy,top10:baselineAlt,summary:m,actualPipelineChecks,comparisonToOriginal:{replaced:10-baselineAlt.filter(e=>baseline.some(b=>b.id===e.id)).length},
    sourceCandidateUnchanged:true,selectedSafetyTrue:true,permutations:1000});
  }
  results.push({reports,candidateCount:entries.length,baseline,baselineTieTrace:trace,
   rankOnlyTies:Object.entries(count(entries.map(e=>api.weeklyRankScore(e)))).map(([rank,n])=>({rank,sites:n})).filter(x=>x.sites>1),
   exactPrefixTies:{trialsWithBoundaryTie:perTrialBoundaryGroups.filter(n=>n>0).length,boundaryGroupsDistribution:count(perTrialBoundaryGroups),
     boundaryGroupsByPhase:boundaryByPhase,selectedTieSlotsDistribution:count(tieSlots)},
   cachedOriginalOrderedIdsSha256:sha256(JSON.stringify(cachedTrials.map(r=>r.ids))),cachedOriginalTrials:cachedTrials,
   alternatives:policyResults,conditionFields:{total:entries.length,allThreeKnown:entries.filter(e=>['precipitation3h','gust','windSpeed'].every(k=>typeof e.sample?.[k]==='number'&&Number.isFinite(e.sample[k]))).length}});
 }
 const payload={schemaVersion:1,evaluationTime:rt.manifest.evaluationTime,codeCommit:rt.manifest.codeCommit,reportSha256:rt.manifest.recentSites.sha256,
  method:'Baseline source selector 1000 permutations, independent phase selector equivalence. Alternative pure tie selection uses fixed actual candidate pool; 4 full actual pipeline checks per policy/scenario.',
  unchangedPrefix:true,unchangedQuotas:true,conditionPolicy:'date,time,known precipitation3h,known gust,known windSpeed,id ascending; policy hypothesis only',
  diversityPolicy:'same prefix group: existing selected raw sido count,canonical weather-rule count,id ascending; greedy',
  results};
 fs.writeFileSync(path.join(DOCS,'_results/p1b_alternatives.json'),JSON.stringify(payload,null,2)+'\n');
 console.log(JSON.stringify({results:results.map(r=>({reports:r.reports,hash:r.cachedOriginalOrderedIdsSha256,ties:r.exactPrefixTies,alternatives:r.alternatives.map(a=>({policy:a.policy,top:a.top10.map(x=>x.id),regions:a.summary.meanRegionCategories,rules:a.summary.meanRuleCategories,changed:a.comparisonToOriginal.replaced}))}))},null,2));
}
