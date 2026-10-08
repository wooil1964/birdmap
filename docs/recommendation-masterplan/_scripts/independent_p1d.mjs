/* P1-D independent quota analysis; immutable Git inputs; stdout only; no coordinate fields. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(process.argv.find(a=>a.startsWith('--root='))?.slice(7)||process.cwd());
const OLD='1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25',NEW='35141c0';
const NOW='2026-10-08T22:40:00+09:00';
const blob=(pin,p)=>execFileSync('git',['show',pin+':'+p],{cwd:ROOT,maxBuffer:1<<28});
const hash=b=>createHash('sha256').update(b).digest('hex');
const helper=blob(OLD,'.github/scripts/test_weekly_recommendation.mjs').toString('utf8');
const prefix=helper.slice(0,helper.indexOf('const SITE =')).replace(/^import .*;\r?\n/gm,'')
 .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');",'const ROOT = REVIEW_ROOT;')
 .replace('HTML.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0]', "('var WEEKLY_RECENT_BONUS_MAX='+String(state.bonusMax??16)+';')" );
const extra=['monthTideForSite','todayKstMonth','v251EffectiveScore','weatherScoreAllowed','weatherTimeMs','weatherLatestDue','storedWeatherState','todayWeatherFromWeek','weatherTodayForSite'];
const {loadApi,RUNTIME:RUNTIME_VM}=vm.runInNewContext(prefix+'\nfor(const n of EXTRA_NAMES)if(!NAMES.includes(n))NAMES.push(n);\n({loadApi,RUNTIME})',{
 REVIEW_ROOT:ROOT,EXTRA_NAMES:extra,readFileSync:p=>blob(OLD,path.relative(ROOT,p).replaceAll('\\','/')).toString('utf8'),dirname:path.dirname,join:path.join,vm,assert,fileURLToPath,execFileSync:()=>{throw Error('Unexpected subprocess');}});
const RUNTIME=JSON.parse(JSON.stringify(RUNTIME_VM));
assert.equal(hash(blob(OLD,'index.html')),hash(blob(NEW,'index.html')));
assert.deepEqual(execFileSync('git',['diff','--name-only',OLD,NEW],{cwd:ROOT,encoding:'utf8'}).trim().split(/\r?\n/),['weather_today.json','weather_week.json']);
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/recommendation-masterplan/_snapshots/input_manifest.json')));
const reportBytes=fs.readFileSync(path.join(ROOT,manifest.recentSites.path));assert.equal(hash(reportBytes),manifest.recentSites.sha256);
const sightings=Object.fromEntries(JSON.parse(reportBytes).sites.map(s=>[String(s.siteId),{latestDate:s.latestDate,species:s.species}]));
const json=(pin,p)=>JSON.parse(blob(pin,p).toString('utf8'));
const common={now:NOW,month:10,weatherWeek:null,weatherToday:null,tideMonth:json(OLD,'tide_month.json'),notices:json(OLD,'notices.json'),rules:json(OLD,'weather_rules.json')};
const makeApi=(pin,reports,sites=RUNTIME,cap=16)=>loadApi({...common,siteData:sites,bonusMax:cap,weatherWeek:json(pin,'weather_week.json'),weatherToday:json(pin,'weather_today.json'),recentSiteSightings:reports?sightings:{}});
const core=new Set([7,8,10,15,20]);
const rank=e=>Number.isFinite(e.rankScore)?e.rankScore:Number.isFinite(e.score)?e.score:-Infinity;
const recent=e=>[e.recentReport?e.recentReport.ageDays:Infinity,-(e.recentReport?e.recentReport.speciesCount:0)];
const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;if(typeof a[i]==='string')return a[i].localeCompare(b[i]);return a[i]<b[i]?-1:1;}return 0;};
const count=a=>a.reduce((o,v)=>(o[String(v)]=(o[String(v)]||0)+1,o),{});
/* Independent P1-D: actual immutable candidates + separate policy tuple selectors. */
const freshManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json')));
for(const f of freshManifest.files)assert.equal(hash(blob(f.sourceCommit||freshManifest.codeCommit,f.path)),f.sha256,f.path);
const policies=[{id:'current',quota:[4,3,1,2],fill:'source'}, {id:'global_rank',quota:null,fill:'global'},
 {id:'flex1111',quota:[1,1,1,1],fill:'global'}, {id:'flex2211',quota:[2,2,1,1],fill:'global'},
 {id:'quota_only_2211',quota:[2,2,1,1],fill:'source'}];
const canonical=e=>common.rules.aliases?.[e.site.weatherRuleKey]||e.site.weatherRuleKey;
const primary=e=>e.axes.pelagic?'pelagic':e.axes.field?'field':e.axes.mudflat?'mudflat':'other';
const physical=e=>{if(!e)return null;const{site,recentReport,rankScore,stableOrder,selectedAxis,...rest}=e;return JSON.stringify({id:String(site.id),...rest});};
function scoreKeys(e,phase){
 if(phase==='global')return[-rank(e),...recent(e),String(e.recommendationDate||'9999'),Number(e.site.id)];
 if(phase==='field')return[-rank(e),...recent(e),-Number(core.has(Number(e.site.id))),String(e.recommendationDate||'9999'),Number(e.site.id)];
 if(phase==='pelagic')return[-rank(e),...recent(e),String(e.recommendationDate),Number(e.site.id)];
 if(phase==='source_fill')return[-rank(e),e.priority,...recent(e),-(e.sortLevel||0),Number(e.site.id)];
 return[e.priority,-rank(e),...recent(e),-(e.sortLevel||0),Number(e.site.id)];
}
function independentQuotaSelector(entries,policy){
 const chosen=[],ids=new Set();let shipCount=0;const seasonRows=entries.filter(e=>!e.season||e.season==='autumn');
 const eligible={field:e=>e.axes.field&&!e.axes.pelagic,mudflat:e=>e.axes.mudflat&&!e.axes.pelagic,pelagic:e=>e.axes.pelagic,
 other:e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic};
 const stages=policy.quota?Object.keys(eligible).map((phase,i)=>[phase,policy.quota[i],eligible[phase],seasonRows]):[];
 stages.push([policy.fill==='global'?'global':'source_fill',10,()=>true,entries]);
 const traces=[];
 for(const[phase,slots,condition,pool]of stages){
 const ordered=pool.filter(condition).slice().sort((a,b)=>compare(scoreKeys(a,phase),scoreKeys(b,phase)));
 const available=ordered.filter(e=>!ids.has(String(e.site.id))&&(!e.axes.pelagic||shipCount<1));
 const selectedIds=[];let added=0;for(const e of ordered){if(added>=slots||chosen.length>=10)break;const id=String(e.site.id);
 if(ids.has(id)||e.axes.pelagic&&shipCount>=1)continue;
 chosen.push({...e,selectedAxis:phase==='source_fill'||(policy.quota&&phase==='global')?'fill':phase});ids.add(id);selectedIds.push(id);added++;if(e.axes.pelagic)shipCount++;
 }
 traces.push({stage:phase,limit:slots,available:available.length,selected:selectedIds});
 }
 return{chosen,traces};
}
const hh=countObj=>Object.values(countObj).reduce((s,n)=>s+(n/10)**2,0);
function summary(api,chosen){
 const ranks=chosen.map(rank),raws=chosen.map(e=>e.score),displays=chosen.map(e=>api.v251EffectiveScore(e.today));
 const regions=count(chosen.map(e=>e.site.sido)),rules=count(chosen.map(canonical)),primaryAxes=count(chosen.map(primary)),stages=count(chosen.map(e=>e.selectedAxis));
 return{rankSum:ranks.reduce((s,n)=>s+n,0),rawSum:raws.reduce((s,n)=>s+n,0),displaySum:displays.reduce((s,n)=>s+n,0),
 regions,rules,primaryAxes,stages,env:count(chosen.map(e=>e.site.env)),habitatType:count(chosen.map(e=>e.site.habitatType)),mainBirdGroup:count(chosen.map(e=>e.site.mainBirdGroup)),regionCategoryCount:Object.keys(regions).length,ruleCategoryCount:Object.keys(rules).length,
 regionHHI:hh(regions),ruleHHI:hh(rules),pelagicCount:chosen.filter(e=>e.axes.pelagic).length};
}
const compact=(api,chosen)=>chosen.map((e,i)=>({position:i+1,id:String(e.site.id),name:e.site.name,axis:e.selectedAxis,primaryAxis:primary(e),axes:e.axes,
 raw:e.score,display:api.v251EffectiveScore(e.today),rank:rank(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,
 sido:e.site.sido,canonical:canonical(e),priority:e.priority,sortLevel:e.sortLevel||0}));
function permutations(){let state=982451653>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 return Array.from({length:1000},()=>{const a=RUNTIME.slice();for(let i=a.length-1;i>=1;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;});}
const orders=permutations(),orderHash=hash(JSON.stringify(orders.map(o=>o.map(s=>String(s.id)))));
assert.equal(orderHash,'b26c9c0332debf07098544bbb1db54690693606c3a12803f839beaebd35f7ad4');
const scenarios=[];let physical190=null;
for(const withReports of[true,false]){
 const api=makeApi(NEW,withReports),all190=RUNTIME.map((site,stableOrder)=>{const e=api.weeklyRecommendationForSite(site,api.weeklyInfo());return e?{...e,stableOrder}:null;});
 const invariants=all190.map(physical);if(physical190===null)physical190=invariants;else assert.deepEqual(invariants,physical190);
 const entries=all190.filter(e=>e&&api.weeklyRecommendationIsSafe(e)!==false);assert.equal(entries.length,176);assert.ok(entries.every(e=>api.weeklyRecommendationIsSafe(e)===true));
 const nonships=entries.filter(e=>!e.axes.pelagic).slice().sort((a,b)=>rank(b)-rank(a)||Number(a.site.id)-Number(b.site.id)),ships=entries.filter(e=>e.axes.pelagic).slice().sort((a,b)=>rank(b)-rank(a)||Number(a.site.id)-Number(b.site.id));
 const nonship10=nonships.slice(0,10),withShip=ships.length?nonships.slice(0,9).concat(ships[0]):[],numericSum=a=>a.reduce((s,e)=>s+rank(e),0);
 const scoreUpperBound=Math.max(numericSum(nonship10),withShip.length===10?numericSum(withShip):-Infinity);
 const current=independentQuotaSelector(entries,policies[0]).chosen,actual=api.todayRecommendedSites();
 assert.deepEqual(current.map(e=>String(e.site.id)),Array.from(actual,e=>String(e.site.id)));
 assert.deepEqual(current.map(e=>e.selectedAxis),Array.from(actual,e=>e.selectedAxis));
 const results=[];
 for(const policy of policies){
 const{chosen,traces}=independentQuotaSelector(entries,policy),ids=chosen.map(e=>String(e.site.id)),statistics=summary(api,chosen);
 assert.equal(chosen.length,10);assert.equal(new Set(ids).size,10);assert.ok(statistics.pelagicCount<=1);
 assert.ok(chosen.every(e=>api.weeklyRecommendationIsSafe(e)===true));assert.ok(chosen.filter(e=>e.axes.pelagic).every(e=>api.weeklyPelagicSafety(e.sample)===true));
 for(const e of chosen)assert.equal(physical(e),physical(all190[RUNTIME.findIndex(s=>String(s.id)===String(e.site.id))]));
 if(policy.id==='global_rank')assert.equal(statistics.rankSum,scoreUpperBound);
 for(const order of orders){const positions=new Map(order.map((s,i)=>[String(s.id),i]));
 const shuffled=entries.map(e=>({...e,stableOrder:positions.get(String(e.site.id))})).sort((a,b)=>a.stableOrder-b.stableOrder);
 const list=independentQuotaSelector(shuffled,policy).chosen;assert.deepEqual(list.map(e=>String(e.site.id)),ids);assert.deepEqual(list.map(e=>e.selectedAxis),chosen.map(e=>e.selectedAxis));
 }
 results.push({policy:policy.id,quota:policy.quota,fill:policy.fill,candidateCount:176,top10:compact(api,chosen),statistics,rankLossToUpperBound:scoreUpperBound-statistics.rankSum,
 replacedVsCurrent:10-ids.filter(id=>current.some(e=>String(e.site.id)===id)).length,traces,permutationRuns:1000,arrayInvariant:true,
 allSelectedPassExistingSafety:true,physicalSignaturesUnchanged:true});
 }
 scenarios.push({withReports,candidateCount:176,rawDistribution:count(entries.map(e=>e.score)),rankDistribution:count(entries.map(rank)),candidateRegions:count(entries.map(e=>e.site.sido)),
 candidateCanonicalRules:count(entries.map(canonical)),candidatePrimaryAxes:count(entries.map(primary)),candidateAxisEligibility:{field:entries.filter(e=>e.axes.field&&!e.axes.pelagic).length,
 mudflat:entries.filter(e=>e.axes.mudflat&&!e.axes.pelagic).length,pelagic:entries.filter(e=>e.axes.pelagic).length,other:entries.filter(e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic).length},
 rejectedBeforeSelection:all190.map((e,i)=>({id:String(RUNTIME[i].id),name:RUNTIME[i].name,candidate:!!e,gate:e?api.weeklyRecommendationIsSafe(e):null})).filter(e=>!e.candidate||e.gate===false),
 scoreUpperBound:{value:scoreUpperBound,nonship10:numericSum(nonship10),nonship9PlusBestShip:withShip.length===10?numericSum(withShip):null,method:'With at most one ship, any feasible ten-item set has zero ships or one ship; top ranked nonships attain each case upper bound. This is only a numeric rank objective.'},results});
}
const rootDPath=path.join(ROOT,'docs/recommendation-masterplan/_results/p1d_quotas.json');
let rootResultMatch=null;
if(fs.existsSync(rootDPath)){
 const rd=JSON.parse(fs.readFileSync(rootDPath));assert.equal(rd.codeCommit,freshManifest.codeCommit);assert.equal(rd.evaluationTime,NOW);assert.equal(rd.reportSha256,hash(reportBytes));
 const policyName={current:'current_4312',global_rank:'global_rank',flex1111:'flex_1111',flex2211:'flex_2211',quota_only_2211:'quota_only_2211'};
 let all190Checks=0,listsCompared=0;
 for(const scenario of scenarios){
 const recorded=rd.results.find(r=>r.reports===scenario.withReports);assert.ok(recorded);assert.equal(recorded.candidateCount,scenario.candidateCount);
 assert.deepEqual(recorded.rawCandidateDistribution,scenario.rawDistribution);assert.deepEqual(recorded.rankCandidateDistribution,scenario.rankDistribution);
 assert.deepEqual(recorded.candidatePrimaryAxes,scenario.candidatePrimaryAxes);assert.equal(recorded.numericalUpperBoundProof.maximum,scenario.scoreUpperBound.value);
 assert.deepEqual(recorded.numericalUpperBoundProof.options.map(o=>o.rankSum),[scenario.scoreUpperBound.nonship10,scenario.scoreUpperBound.nonship9PlusBestShip]);
 const api=makeApi(NEW,scenario.withReports),sourceRows=RUNTIME.map(s=>api.weeklyRecommendationForSite(s,api.weeklyInfo()));
  assert.deepEqual(recorded.candidateAxisMembership,scenario.candidateAxisEligibility);assert.deepEqual(recorded.candidateRegions,scenario.candidateRegions);
 assert.deepEqual(recorded.candidateCanonicalRules,scenario.candidateCanonicalRules);
 assert.deepEqual(recorded.registeredRegions,count(RUNTIME.map(s=>s.sido)));assert.deepEqual(recorded.registeredCanonicalRules,count(RUNTIME.map(s=>canonical({site:s}))));
 assert.deepEqual(recorded.secondaryAxisOverlap,sourceRows.filter(e=>e&&e.axes.field&&e.axes.mudflat).map(e=>String(e.site.id)));
 assert.deepEqual(recorded.candidateSeasons,count(sourceRows.filter(e=>e&&api.weeklyRecommendationIsSafe(e)!==false).map(e=>e.season)));
 assert.equal(recorded.registered,190);assert.equal(recorded.domestic,RUNTIME.filter(s=>s.sido!=='중국').length);
 for(const result of scenario.results){
 const actual=recorded.policies.find(p=>p.policy===policyName[result.policy]);assert.ok(actual);
 const projected=result.top10.map(e=>({position:e.position,id:e.id,name:e.name,raw:e.raw,display:e.display,rank:e.rank,bonus:e.bonus,date:e.date,time:e.time,
 axis:e.axis,primaryAxis:e.primaryAxis,sido:e.sido,canonicalRule:e.canonical}));
 assert.deepEqual(projected,actual.top10,result.policy+' top10');listsCompared++;
 for(const k of ['rankSum','rawSum','displaySum','regionHHI','ruleHHI','regions','primaryAxes','env','habitatType','mainBirdGroup'])assert.deepEqual(result.statistics[k],actual.summary[k],result.policy+' '+k);
 assert.deepEqual(result.statistics.rules,actual.summary.canonicalRules);assert.deepEqual(result.statistics.stages,actual.summary.pickPhases);
 assert.equal(result.statistics.regionCategoryCount,actual.summary.regionCategories);assert.equal(result.statistics.ruleCategoryCount,actual.summary.ruleCategories);
 assert.equal(result.top10.reduce((s,e)=>s+e.bonus,0),actual.summary.bonusSum);assert.equal(result.rankLossToUpperBound,actual.rankSumGap);assert.equal(result.replacedVsCurrent,actual.changesVsCurrent);
 assert.equal(actual.permutationStability.runs,1000);assert.equal(actual.permutationStability.orderedListChanges,0);
 const selectedIds=result.top10.map(e=>e.id);
 for(let i=0;i<RUNTIME.length;i++){
 const e=sourceRows[i],record=actual.all190.find(x=>x.id===String(RUNTIME[i].id));assert.ok(record);
 const parts={id:String(RUNTIME[i].id),candidate:!!e,gate:e?api.weeklyRecommendationIsSafe(e):null,raw:e?.score??null,rank:e?rank(e):null,
 display:e?api.v251EffectiveScore(e.today):null,selected:selectedIds.includes(String(RUNTIME[i].id)),priority:e?.priority??null,isMandatory:e?.isMandatory??null};
 for(const[k,v]of Object.entries(parts))assert.deepEqual(v,record[k],result.policy+' all190 '+parts.id+' '+k);all190Checks++;
 }
 }
 }
 rootResultMatch={all10PolicyTop10Match:true,all10SummaryScoreGroupsMatch:true,all1900CandidateRowsMatch:true,all190Checks,listsCompared,
 independent10000PermutationChecks:true,numericalUpperBoundMatches:true,rootPath:'docs/recommendation-masterplan/_results/p1d_quotas.json'};
}
console.log(JSON.stringify({schemaVersion:1,rootResultMatch,codeCommit:freshManifest.codeCommit,evaluationTime:NOW,reportSha256:hash(reportBytes),manifestAll16HashesVerified:true,
 method:'Independent original-test helper extraction; independently constructed lexicographic score/recent/core/priority/date/level tuples; no root runtime/policy selector imports.',
 policies,orderHash,all10Policies1000PermutationInvariant:true,physicalONvsOFF190Unchanged:true,scenarios,
 limits:['Five quota/rank policies are design sensitivity scenarios, not ecologically validated allocation rules.',
 'global_rank changes existing priority/core sorting as well as quotas; pure quota comparison is current versus quota_only_2211.',
 'Recommendation axis eligibility and selection stage are kept separate from canonical weather rules and actual habitat.',
 'The score upper bound maximizes numeric rank sum, not field success, safety quality, or ecological benefit.',
 'Only the frozen October input is examined. No per-species persistence, independent observers, effort, production code/DB/API writes, or original coordinates were generated.']},null,2));