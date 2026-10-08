/* Analysis-only paired permutations: actual 190-candidate pipeline per baseline trial. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {loadRuntime,DOCS,sha256} from './recommendation_runtime.mjs';
export const SEED=982451653,RUNS=1000;
export function ordersFor(sites,runs=RUNS){
 let state=SEED>>>0;const rng=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 return Array.from({length:runs},()=>{const a=sites.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;});
}
export function invariant(e){if(!e)return null;const {site,stableOrder,selectedAxis,...rest}=e;return JSON.stringify({id:String(site.id),...rest});}
export function compact(api,list){return list.map((e,i)=>({position:i+1,id:String(e.site.id),name:e.site.name,raw:e.score,
 display:api.v251EffectiveScore(e.today),rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}));}
export function count(v){return v.reduce((a,x)=>(a[String(x)]=(a[String(x)]||0)+1,a),{});}
export function metrics(rt,runs,baseline,candidates){
 const base=baseline.map(e=>e.id),freq=Object.fromEntries(rt.sites.map(s=>[String(s.id),0]));
 const position=Object.fromEntries(rt.sites.map(s=>[String(s.id),Array(10).fill(0)]));
 const totals={membershipChanged:0,orderChanged:0,replacedTotal:0,maxReplaced:0,positionMismatches:0,sharedPairs:0,invertedSharedPairs:0};
 const byRegion={},byRule={},byAxis={},regionUnique=[],ruleUnique=[],regionHHI=[],ruleHHI=[];
 for(const run of runs){
  const ids=run.ids,intersection=base.filter(id=>ids.includes(id)),replaced=10-intersection.length;
  totals.membershipChanged+=Number(replaced>0);totals.orderChanged+=Number(ids.some((id,i)=>id!==base[i]));
  totals.replacedTotal+=replaced;totals.maxReplaced=Math.max(totals.maxReplaced,replaced);
  totals.positionMismatches+=ids.filter((id,i)=>id!==base[i]).length;
  for(let i=0;i<intersection.length;i++)for(let j=i+1;j<intersection.length;j++){
   totals.sharedPairs++;totals.invertedSharedPairs+=Number(ids.indexOf(intersection[i])>ids.indexOf(intersection[j]));
  }
  ids.forEach((id,i)=>{freq[id]++;position[id][i]++;});
  const selected=ids.map(id=>rt.sites.find(s=>String(s.id)===id)),regions=count(selected.map(s=>s.sido)),rules=count(selected.map(rt.canonical)),axes=count(run.axes);
  for(const [bucket,out] of [[regions,byRegion],[rules,byRule],[axes,byAxis]])for(const [k,n] of Object.entries(bucket))out[k]=(out[k]||0)+n;
  regionUnique.push(Object.keys(regions).length);ruleUnique.push(Object.keys(rules).length);
  regionHHI.push(Object.values(regions).reduce((a,n)=>a+(n/10)**2,0));ruleHHI.push(Object.values(rules).reduce((a,n)=>a+(n/10)**2,0));
 }
 const n=runs.length,avg=a=>a.reduce((s,x)=>s+x,0)/n;
 const candidateIds=new Set(candidates.map(e=>String(e.site.id)));
 const selectionFrequency=rt.sites.map(s=>({id:String(s.id),name:s.name,sido:s.sido,canonical:rt.canonical(s),candidate:candidateIds.has(String(s.id)),times:freq[String(s.id)],positions:position[String(s.id)]}));
 const positive=selectionFrequency.filter(r=>r.times>0).sort((a,b)=>b.times-a.times||Number(a.id)-Number(b.id));
 const grouping=(key,totals)=>[...new Set(rt.sites.map(key))].sort().map(k=>({category:k,registered:rt.sites.filter(s=>key(s)===k).length,
 candidates:candidates.filter(e=>key(e.site)===k).length,totalSlots:totals[k]||0,meanSlots:(totals[k]||0)/n,slotShare:(totals[k]||0)/(n*10)}));
 return {runs:n,baseline:base,membershipChangeRate:totals.membershipChanged/n,orderChangeRate:totals.orderChanged/n,
 meanReplaced:totals.replacedTotal/n,maxReplaced:totals.maxReplaced,meanPositionMismatches:totals.positionMismatches/n,
 sharedPairInversionRate:totals.sharedPairs?totals.invertedSharedPairs/totals.sharedPairs:0,
 distinctSelected:positive.length,fixedSelected:positive.filter(r=>r.times===n).map(r=>r.id),
 most:positive.filter(r=>r.times===positive[0]?.times),leastPositive:positive.filter(r=>r.times===positive.at(-1)?.times),
 candidateNeverSelected:selectionFrequency.filter(r=>r.candidate&&!r.times).length,
 ineligibleNeverSelected:selectionFrequency.filter(r=>!r.candidate&&!r.times).length,
 regions:grouping(s=>s.sido,byRegion),canonicalRules:grouping(rt.canonical,byRule),meanAxisSlots:Object.fromEntries(Object.entries(byAxis).map(([k,x])=>[k,x/n])),
 meanRegionCategories:avg(regionUnique),meanRuleCategories:avg(ruleUnique),meanRegionHHI:avg(regionHHI),meanRuleHHI:avg(ruleHHI),
 regionCategoryDistribution:count(regionUnique),ruleCategoryDistribution:count(ruleUnique),selectionFrequency};
}
if(process.argv.includes('--run')){
 const rt=loadRuntime('docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json'),orders=ordersFor(rt.sites);
 assert.ok(orders.every(o=>o.length===190&&new Set(o.map(s=>s.id)).size===190));
 const orderHash=sha256(JSON.stringify(orders.map(o=>o.map(s=>String(s.id)))));
 for(const reports of [true,false]){
  const label=reports?'on':'off',api=rt.makeApi(reports),observed=new Map();
  api.setObserver((site,e)=>{observed.set(String(site.id),invariant(e));});
  const baselineEntries=api.todayRecommendedSites(),expected=new Map(observed),baseline=compact(api,baselineEntries);
  assert.equal(expected.size,190);
  const candidates=rt.sites.map(s=>api.weeklyRecommendationForSite(s,api.weeklyInfo())).filter(e=>e&&api.weeklyRecommendationIsSafe(e)!==false);
  const dest=path.join(DOCS,'_results/p1b_permutations_'+label+'.json');
  let runs=[];
  if(fs.existsSync(dest)){const prior=JSON.parse(fs.readFileSync(dest));assert.equal(prior.orderSha256,orderHash);assert.equal(prior.reportSha256,rt.manifest.recentSites.sha256);runs=prior.trials;}
  const save=()=>{const result={schemaVersion:1,evaluationTime:rt.manifest.evaluationTime,codeCommit:rt.manifest.codeCommit,reports,seed:SEED,prng:'xorshift32 sequential stream; Fisher-Yates descending',orderSha256:orderHash,
   reportSha256:rt.manifest.recentSites.sha256,functionSourceSha256:rt.functionsHash,candidateCount:candidates.length,
   baseline,completed:runs.length===RUNS,invariants:{full190CandidateCallsPerTrial:true,allCandidateSignaturesIdentical:true,selectedGateTrue:true,noCoordinateFieldsInOutput:true},summary:metrics(rt,runs,baseline,candidates),trials:runs};
   fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');};
  for(let i=runs.length;i<RUNS;i++){
   api.setSites(orders[i]);observed.clear();const selected=api.todayRecommendedSites();
   assert.equal(observed.size,190);for(const [id,sig] of observed)assert.equal(sig,expected.get(id),'candidate invariant '+id+' trial '+i);
   assert.equal(selected.length,10);assert.equal(new Set(selected.map(e=>e.site.id)).size,10);
   assert.ok(selected.every(e=>api.weeklyRecommendationIsSafe(e)===true));assert.ok(selected.filter(e=>e.axes.pelagic).length<=1);
   runs.push({ids:selected.map(e=>String(e.site.id)),axes:selected.map(e=>e.selectedAxis)});
   if(runs.length%100===0){save();console.log(JSON.stringify({scenario:label,completed:runs.length,total:RUNS,orderSha256:orderHash}));}
  }
  if(runs.length===RUNS)save();
  const m=metrics(rt,runs,baseline,candidates);
  console.log(JSON.stringify({scenario:label,runs:m.runs,membershipChangeRate:m.membershipChangeRate,meanReplaced:m.meanReplaced,distinctSelected:m.distinctSelected}));
 }
}
