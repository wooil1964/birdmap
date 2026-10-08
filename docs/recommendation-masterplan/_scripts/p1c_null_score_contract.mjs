/* Existing malformed-score contract defect, independent of P1-C bonus policy. Analysis only. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_results'));
const prior=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(prior+1);process.env['GIT_CONFIG_KEY_'+prior]='safe.directory';process.env['GIT_CONFIG_VALUE_'+prior]=repo;
const {loadP1C,SCENARIOS}=await import(pathToFileURL(path.join(repo,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')));
const rt=loadP1C(),DAY='2026-10-10',NOW=rt.manifest.evaluationTime,site=rt.sites.find(s=>String(s.id)==='14');
function invalidScore(value){return value===null||value===undefined||value===''||typeof value==='boolean'||!Number.isFinite(Number(value));}
const allSamples=Object.entries(rt.data.week.sites).flatMap(([id,s])=>Object.entries(s.days||{}).flatMap(([day,d])=>(d.samples||[]).map((sample,i)=>({id,day,i,sample}))));
const invalid=allSamples.filter(r=>r.sample.scoreEligible===true&&invalidScore(r.sample.score));
assert.equal(allSamples.length,10640);assert.equal(invalid.length,0);
const sample={forecastTime:DAY+' 12:00 KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',gust:5,precipitation3h:0,temperature:20,visibilityKm:15,cloudPct:20,waveM:0.3,score:null,grade:'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false};
const overrides={sites:[site],week:{startDate:DAY,endDate:DAY,sampleIntervalHours:3,sites:{14:{name:site.name,days:{[DAY]:{samples:[sample]}}}}},today:null,tide:{sites:{14:{days:[{date:DAY,highTide:'12:00',highTideLevel:'900'}]}}},notices:[{siteIds:[site.id],published:true}],sightings:{14:{latestDate:'2026-10-08',species:['a','b','c','d']}}};
const cases=SCENARIOS.map(policy=>{
 const api=rt.makeScenario(policy,overrides,[site],NOW),e=api.weeklyRecommendationForSite(site,api.weeklyInfo()),top=api.todayRecommendedSites();
 assert.ok(e);assert.equal(e.sample.score,null);assert.equal(e.score,0);assert.equal(api.weeklyRecommendationIsSafe(e),true);assert.equal(top.length,1);
 return {scenario:policy.id,inputScore:null,inputScoreEligible:true,expectedInvalidScoreExcluded:true,actualExcluded:false,entryScore:e.score,rankScore:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,isMandatory:e.isMandatory,safeState:api.weeklyRecommendationIsSafe(e),recommendedIds:top.map(x=>String(x.site.id)),safetyContractSatisfied:false};
});
const fallback={...overrides,week:null,today:{sites:{14:{date:DAY,forecastTime:DAY+' 12:00 KST',score:null,scoreEligible:true,wind:'북풍 3m/s',rain:'강수 없음',wave:'0.3m'}}}};
const fallbackApi=rt.makeScenario({reports:true,cap:16},fallback,[site],NOW);assert.equal(fallbackApi.todayRecommendedSites().length,0);
const tideRelevantIds=Object.keys(rt.data.tide.sites||{}),tideInvalid=invalid.filter(r=>tideRelevantIds.includes(r.id));
const invalidCategories={null:allSamples.filter(r=>r.sample.scoreEligible===true&&r.sample.score===null).length,emptyString:allSamples.filter(r=>r.sample.scoreEligible===true&&r.sample.score==='').length,boolean:allSamples.filter(r=>r.sample.scoreEligible===true&&typeof r.sample.score==='boolean').length,nonFinite:allSamples.filter(r=>r.sample.scoreEligible===true&&r.sample.score!==null&&r.sample.score!==''&&typeof r.sample.score!=='boolean'&&!Number.isFinite(Number(r.sample.score))).length};
const python=process.argv[4]||process.env.BIRDMAP_PYTHON||'python';
const mutated=structuredClone(rt.data.week);let mutatedRef=null;
for(const [id,s] of Object.entries(mutated.sites))for(const [day,d] of Object.entries(s.days||{}))for(const [i,sample] of (d.samples||[]).entries()){
 if(!mutatedRef&&sample.scoreEligible===true){sample.score=null;mutatedRef={siteId:id,date:day,sampleIndex:i};}
}
const tempPath=path.join(out,'null-score-validator-synthetic-input.json');fs.writeFileSync(tempPath,JSON.stringify(mutated));
const runner="import sys\nsys.path.insert(0,sys.argv[1])\nfrom pathlib import Path\nfrom validate_weather_week import validate\nvalidate(Path(sys.argv[2]))\n";
const child=spawnSync(python,['-c',runner,path.join(repo,'.github/scripts'),tempPath],{encoding:'utf8'});
const validatorEvidence={executed:!child.error,exitCode:child.status,stdout:child.stdout||'',stderr:child.stderr||'',mutation:mutatedRef,validatorSourcePath:'.github/scripts/validate_weather_week.py'};
assert.equal(child.error,undefined,'Python validator should run');assert.notEqual(child.status,0,'validator should reject contradictory score');assert.match(child.stderr,/is eligible without a score/);
const result={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:NOW,manifestPath:rt.manifestPath||'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json',sourceFunctionsSha256:rt.functionsHash,scope:'Synthetic malformed weekly data only. No observed operational recommendation leak, no production reads or mutations. This pre-existing frontend contract weakness affects all tested policies and is not introduced by bonus changes.',fixedInputAudit:{totalSamples:allSamples.length,eligibleInvalidScoreSamples:invalid.length,invalidCategories,tideRelevantEligibleInvalidScoreSamples:tideInvalid.length},safetyContractViolationCount:cases.length,reproducedPolicies:cases,correctTodayFallback:{scoreNullExcluded:true},generatorValidator:validatorEvidence,cause:'weeklyDaylightCandidates accepts Number(sample.score); Number(null) equals 0. weeklyRecommendationForSite repeats numeric coercion. A contradictory scoreEligible:true can therefore pass frontend gates although the Python generator validator rejects this input.',requiredDesign:'Reject null/undefined/empty/boolean/non-finite score before numeric conversion in candidate selection, while preserving generation validation. Implement only with approval.',metadataDiagnostic:'isPastAtGeneration is checked only for today, as documented; a true flag with a future forecast date is inconsistent metadata and was not treated as an established product defect.'};
fs.writeFileSync(path.join(out,'p1c_null_score_contract.json'),JSON.stringify(result,null,2)+'\n');
fs.unlinkSync(tempPath);
console.log(JSON.stringify({fixedInputInvalid:invalid.length,samples:allSamples.length,policyContractViolations:cases.length,todayFallbackExcluded:true,validatorRejected:true,scope:result.scope},null,2));
