/* Independent PR #13 replay. Reads immutable Git blobs and committed public snapshots.
   Never invokes production endpoints or writes repository/application files. */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import assert from 'node:assert/strict'; import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto'; import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const OUT=path.resolve(process.argv[4]||HERE);
fs.mkdirSync(OUT,{recursive:true});
const REPO=path.resolve(process.argv[2]||process.cwd());
const ANALYSIS=path.resolve(process.argv[3]||REPO);
const BEFORE='35141c04d4fd152982b1f4683d5b7a6f4f7514e5',MAIN='b0975cad9f3112af38cc286a892bf6f06722ce12',PREVIOUS='e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6',HEAD='352315a57d038687807dbe0044c136a22fb0c9c5';
const NOW='2026-10-08T22:40:00+09:00';
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=(rev,file)=>execFileSync('git',['show',rev+':'+file],{cwd:REPO,maxBuffer:1<<29});
const manifest=JSON.parse(fs.readFileSync(path.join(ANALYSIS,'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json'),'utf8'));
assert.equal(manifest.codeCommit,BEFORE);assert.equal(manifest.evaluationTime,NOW);
const inputs=new Map();
for(const item of manifest.files){
 const raw=item.snapshotPath?gunzipSync(fs.readFileSync(path.join(ANALYSIS,item.snapshotPath))):blob(item.sourceCommit||manifest.codeCommit,item.path);
 assert.equal(hash(raw),item.sha256,'fixed blob '+item.path);inputs.set(item.path,raw);
}
const reportBytes=fs.readFileSync(path.join(ANALYSIS,manifest.recentSites.path));
assert.equal(hash(reportBytes),manifest.recentSites.sha256);
assert.equal(hash(blob(HEAD,'.github/scripts/fixtures/recent_sites_20261008_193204.json')),hash(reportBytes));
const reports=JSON.parse(reportBytes);
assert.equal(reports.sites.length,11);
const sightings=Object.fromEntries(reports.sites.map(s=>[String(s.siteId),{latestDate:s.latestDate,species:s.species.map(String)}]));
const data={week:JSON.parse(inputs.get('weather_week.json')),today:JSON.parse(inputs.get('weather_today.json')),tide:JSON.parse(inputs.get('tide_month.json')),notices:JSON.parse(inputs.get('notices.json')),rules:JSON.parse(inputs.get('weather_rules.json'))};
const names=Array.from(vm.runInNewContext(inputs.get('.github/scripts/test_weekly_recommendation.mjs').toString('utf8').match(/const NAMES = (\[[\s\S]*?\]);/)[1]));
const extras=['monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue','v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite','weeklyScoreValid','weeklyNonNegativeNumber','weeklySampleRecommendable','weeklyTodayRecommendable','weeklyOwn','weeklyTodayRequiredDataValid','weeklyTodayWeather','weeklyKstTimestamp','weeklyForecastTimestamp','weeklyTideTimestamp','weeklyTideForecastGapMinutes','weeklyRecommendationEligible'];
function parseSites(html){
 const ctx=vm.createContext({});
 vm.runInContext(html.match(/var siteData=([^\n]+);/)[0]+'\n'+html.match(/siteData=siteData\.concat\([\s\S]*?\);/)[0],ctx);
 const sites=JSON.parse(JSON.stringify(ctx.siteData));assert.equal(sites.length,190);assert.equal(new Set(sites.map(s=>s.id)).size,190);return sites;
}
function extractFunction(html,name){
 const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);
 let depth=0,quote=null;
 for(let i=html.indexOf('{',start);i<html.length;i++){
  const c=html[i];
  if(quote){let n=0;for(let j=i-1;j>=0&&html[j]==='\\';j--)n++;if(c===quote&&n%2===0)quote=null;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
  if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(start,i+1);
 }
 throw Error('Unbalanced source '+name);
}
function runtime(rev){
 const bytes=blob(rev,'index.html'),html=bytes.toString('utf8'),sites=parseSites(html);
 const all=[...new Set([...names,...extras])].filter(n=>html.includes('function '+n+'('));
 const constants=html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0]+'\n'+html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0]+'\n'+html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0]+'\n'+[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]).join('\n')+'\n'+html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0];
 const functions=all.map(n=>extractFunction(html,n)).join('\n');
 const factory=new Function('ctx','Date','var weatherWeek=ctx.week,weatherToday=ctx.today,tideMonth=ctx.tide,loadedNotices=ctx.notices,recommendationWeatherRules=ctx.rules,siteData=ctx.sites,recentSiteSightings=ctx.recent,PINNED_BIRDING_ISSUES=[];\n'+constants+'\n'+functions+'\nreturn {'+all.join(',')+'};');
 class Clock extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return new Date(NOW).getTime();}}
 return {rev,sites,htmlSHA256:hash(bytes),functionsSHA256:hash(functions),api:(recent,override={})=>{const clock=override.evaluationTime||NOW;class ScenarioClock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return new Date(clock).getTime();}}return factory({...data,sites,recent,...override},ScenarioClock);}};
}
function clean(v){if(Array.isArray(v))return v.map(clean);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,clean(v[k])]));return v;}
const signature=v=>JSON.stringify(clean(v));
function compact(e,api){
 return {id:String(e.site.id),name:e.site.name,raw:e.score,display:e.today?api.v251EffectiveScore(e.today):null,rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,latestDate:e.recentReport?.latestDate||null,ageDays:e.recentReport?.ageDays??null,speciesCount:e.recentReport?.speciesCount??null,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis||null,axes:e.axes,season:e.season,ruleKey:e.site.weatherRuleKey,canonicalRule:data.rules.aliases?.[e.site.weatherRuleKey]||e.site.weatherRuleKey||'general_birding',region:e.site.sido,mandatory:e.isMandatory,priority:e.priority,sortLevel:e.sortLevel||0,gate:api.weeklyRecommendationIsSafe(e),basis:e.basisText,siteCoordinateSHA256:hash(signature({id:e.site.id,lat:e.site.lat,lon:e.site.lon}))};
}
const core=new Set([7,8,10,15,20]);
const rank=e=>Number.isFinite(e.rankScore)?e.rankScore:Number.isFinite(e.score)?e.score:-Infinity;
const recent=e=>[e.recentReport?.ageDays??Infinity,-(e.recentReport?.speciesCount||0)];
const tuple=(e,phase)=>phase==='field'?[-rank(e),...recent(e),-Number(core.has(Number(e.site.id))),e.recommendationDate||'9999']:phase==='pelagic'?[-rank(e),...recent(e),String(e.recommendationDate)]:phase==='fill'?[-rank(e),e.priority,...recent(e),-(e.sortLevel||0)]:[e.priority,-rank(e),...recent(e),-(e.sortLevel||0)];
function cmpTuple(a,b){for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;return typeof a[i]==='string'?a[i].localeCompare(b[i]):a[i]<b[i]?-1:1;}return 0;}
function independentSelect(rows){
 const result=[],used=new Set();let ships=0;
 const phases=[['field',4,e=>e.axes.field&&!e.axes.pelagic],['mudflat',3,e=>e.axes.mudflat&&!e.axes.pelagic],['pelagic',1,e=>e.axes.pelagic],['other',2,e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic],['fill',10,()=>true]];
 for(const [phase,n,predicate] of phases){
  const available=(phase==='fill'?rows:rows.filter(e=>!e.season||e.season==='autumn')).filter(predicate).slice().sort((a,b)=>cmpTuple(tuple(a,phase),tuple(b,phase))||a.stableOrder-b.stableOrder||Number(a.site.id)-Number(b.site.id));
  let added=0;
  for(const e of available){if(result.length>=10||added>=n)break;if(used.has(String(e.site.id))||(e.axes.pelagic&&ships>=1))continue;result.push({...e,selectedAxis:phase});used.add(String(e.site.id));if(e.axes.pelagic)ships++;added++;}
 }
 return result;
}
function run(rt,withReports,override={}){
 const api=rt.api(withReports?sightings:{},override),week=api.weeklyInfo();
 const all=rt.sites.map((site,stableOrder)=>{const entry=api.weeklyRecommendationForSite(site,week);return {siteId:String(site.id),entry,stableOrder,gate:entry?api.weeklyRecommendationIsSafe(entry):null};});
 const candidates=all.filter(x=>x.entry);
 const safe=candidates.filter(x=>x.gate!==false).map(x=>({...x.entry,stableOrder:x.stableOrder}));
 const top=api.todayRecommendedSites(),independent=independentSelect(safe);
 assert.deepEqual(top.map(e=>[String(e.site.id),e.selectedAxis]),independent.map(e=>[String(e.site.id),e.selectedAxis]),rt.rev+' independent selection');
 const providedComparableAllCandidateSignature=hash(JSON.stringify(candidates.map(x=>x.entry).map(e=>[e.site.id,e.score,api.weeklyRankScore(e),e.recommendationDate,e.recommendationTime,e.isMandatory,e.priority,e.reasons,e.tideText||'',e.basisText,e.recentReport?e.recentReport.bonus:0,e.today&&e.today.wind,e.today&&e.today.rain,e.today&&e.today.wave])));
 return {withReports,siteCount:all.length,candidateCount:candidates.length,providedComparableAllCandidateSignature,safeCandidateCount:safe.length,unsafeIds:candidates.filter(x=>x.gate===false).map(x=>x.siteId),unknownSafetyIds:candidates.filter(x=>x.gate!==true&&x.gate!==false).map(x=>x.siteId),independentSelectorMatches:true,top:top.map((e,i)=>({position:i+1,...compact(e,api)})),all190:all.map(x=>({id:x.siteId,candidate:!!x.entry,fullEntrySHA256:hash(signature(x.entry)),...(x.entry?compact(x.entry,api):{gate:null})})),full190SignatureSHA256:hash(signature(all.map(x=>({id:x.siteId,entry:x.entry,gate:x.gate}))))};
}
/* Approved C policy verification, never modifies a product function. Filters are applied to actual safe entries only. */
const target=runtime(HEAD),clone=v=>structuredClone(v);
function weekWithout(ids,emptySamples=false){const w=clone(data.week);for(const id of ids){if(emptySamples){for(const day of Object.values(w.sites[id]?.days||{}))day.samples=[];}else delete w.sites[id];}return w;}
function changedGeneration(stamp){const t=clone(data.today);for(const raw of Object.values(t.sites||{})){if(stamp===null)delete raw.generatedAt;else raw.generatedAt=stamp;}if(stamp===null){delete t.generatedAt;delete t.updated;}else t.generatedAt=t.updated=stamp;return t;}
const reportIds=Object.keys(sightings);
const scenarios=[
 {id:'fixed_normal_week',kind:'immutable fixed input',clock:NOW,overrides:{}},
 {id:'fixed_week_loader_failure',kind:'fixed weather only week loader null',clock:NOW,overrides:{week:null}},
 {id:'fixed_week_empty_registry',kind:'fixed weather only week sites missing',clock:NOW,overrides:{week:{...clone(data.week),sites:{}}}},
 {id:'fixed_week_missing_site14',kind:'fixed weather only week14 absent',clock:NOW,overrides:{week:weekWithout(['14'])}},
 {id:'fixed_week_missing_report_sites',kind:'fixed weather only eleven report sites absent in week',clock:NOW,overrides:{week:weekWithout(reportIds)}},
 {id:'fixed_week_site14_no_samples',kind:'site14 remains in week but all sample arrays empty',clock:NOW,overrides:{week:weekWithout(['14'],true)}},
 {id:'fixed_week_report_sites_no_samples',kind:'eleven reported sites remain in week but all sample arrays empty',clock:NOW,overrides:{week:weekWithout(reportIds,true)}},
 {id:'controlled_2240_today_fresh_week_failure',kind:'fixed physical weather; only generated metadata set22:35',clock:NOW,overrides:{week:null,today:changedGeneration('2026-10-08 22:35 KST')}},
 {id:'controlled_2240_today_delayed_week_failure',kind:'fixed physical weather; only generated metadata set12:00',clock:NOW,overrides:{week:null,today:changedGeneration('2026-10-08 12:00 KST')}},
 {id:'controlled_2240_today_future_week_failure',kind:'fixed physical weather; only generated metadata set23:00',clock:NOW,overrides:{week:null,today:changedGeneration('2026-10-08 23:00 KST')}},
 {id:'controlled_2240_today_bad_generation_week_failure',kind:'fixed physical weather; only generated metadata malformed',clock:NOW,overrides:{week:null,today:changedGeneration('bad-timestamp')}},
 {id:'controlled_2240_today_missing_generation_week_failure',kind:'fixed physical weather; only item/root generated metadata removed',clock:NOW,overrides:{week:null,today:changedGeneration(null)}},
 {id:'controlled_2240_mixed_report_reference',kind:'fixed physical weather; eleven week sites absent; generated metadata12:00',clock:NOW,overrides:{week:weekWithout(reportIds),today:changedGeneration('2026-10-08 12:00 KST')}},
 ];
const previous=clone(data.today);for(const raw of Object.values(previous.sites)){raw.stale=true;raw.scoreEligible=false;raw.fallbackSource='previous_saved';}
scenarios.push({id:'controlled_previous_saved_week_failure',kind:'fixed physical weather; previous_saved rawfalse/stale true metadata',clock:NOW,overrides:{week:null,today:previous}});
const sparse=JSON.parse(fs.readFileSync(path.join(OUT,'sparse6h_generated_today.json'),'utf8'));
const sparseTide={sites:{14:{days:[{date:'2026-10-10',highTide:'12:00',highTideLevel:'900'}]}}};
for(const [id,clock] of [['controlled_sparse6h_before_due','2026-10-10T08:00:00+09:00'],['controlled_sparse6h_after_due','2026-10-10T11:00:00+09:00']])scenarios.push({id,kind:'actual Python builder output unchanged, synthetic same-noon tide, separate10/10 clock',clock,overrides:{week:null,today:sparse,tide:sparseTide}});
for(const [id,value] of [['controlled_sparse6h_future_generation','2026-10-10 12:30 KST'],['controlled_sparse6h_bad_generation','not-a-timestamp']]){const today=clone(sparse);today.sites['14'].generatedAt=value;scenarios.push({id,kind:'actual builder physical values; only generated metadata changed; separate10/10 clock',clock:'2026-10-10T11:00:00+09:00',overrides:{week:null,today,tide:sparseTide}});}
const tally=(entries,key)=>Object.fromEntries([...entries.reduce((m,e)=>{const x=key(e);m.set(x,(m.get(x)||0)+1);return m;},new Map())]);
const kinds=new Set(['today_reference','previous_saved','none']);
const policies={current:()=>true,exclude_reference_kind:e=>!kinds.has(e.today?._weatherState?.kind),require_display_eligible:e=>e.today?._weatherState?.scoreEligible===true};
const wrongDay=clone(sparse);wrongDay.sites['14'].date='2026-10-10';wrongDay.sites['14'].forecastTime='2026-10-09 12:00 KST';wrongDay.sites['14'].generatedAt='2026-10-10 10:30 KST';
scenarios.push({id:'controlled_sparse6h_forecast_previous_date',kind:'builder physical values, raw date today but forecast previous date, separate10/10 clock and fresh valid generation',clock:'2026-10-10T11:00:00+09:00',overrides:{week:null,today:wrongDay,tide:sparseTide}});
const summary=[];let comparisons=0;
function resultFor(sc,on){
 const api=target.api(on?sightings:{},{...sc.overrides,evaluationTime:sc.clock}),week=api.weeklyInfo();
 const all=target.sites.map((s,stableOrder)=>{const e=api.weeklyRecommendationForSite(s,week);return e?{...e,stableOrder}:null;}).filter(Boolean);
 const safe=all.filter(e=>api.weeklyScoreValid(e.score)&&api.weeklyRecommendationIsSafe(e)!==false);
 const trueCurrent=api.todayRecommendedSites();assert.deepEqual(trueCurrent.map(e=>[String(e.site.id),e.selectedAxis]),api.autumnBalancedRecommendations(safe).map(e=>[String(e.site.id),e.selectedAxis]),sc.id+' source selection mismatch');
 const projected=e=>({id:String(e.site.id),raw:e.score,rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis||null,region:e.site.sido,kind:e.today?._weatherState?.kind||'missing',dataCurrent:e.today?._weatherState?.dataCurrent??null,displayEligible:e.today?._weatherState?.scoreEligible??null,displayText:e.today?api.v251ScoreDisplayText(e.today):null,rawEligibility:e.sample?e.sample.scoreEligible:(sc.overrides.today||data.today)?.sites?.[String(e.site.id)]?.scoreEligible,p0Safe:api.weeklyRecommendationIsSafe(e)});
 const variants={};for(const [id,predicate] of Object.entries(policies)){
  const entries=safe.filter(predicate),product=api.autumnBalancedRecommendations(entries),independent=independentSelect(entries);comparisons++;
  assert.deepEqual(product.map(e=>[String(e.site.id),e.selectedAxis]),independent.map(e=>[String(e.site.id),e.selectedAxis]),sc.id+'/'+id+' independent quota mismatch');
  if(id==='current')assert.deepEqual(product.map(e=>String(e.site.id)),trueCurrent.map(e=>String(e.site.id)));
  variants[id]={eligibleCount:entries.length,excludedIds:safe.filter(e=>!predicate(e)).map(e=>String(e.site.id)),independentSelectorMatches:true,top:product.map(projected),topRegionCounts:tally(product,e=>e.site.sido),topAxisCounts:tally(product,e=>e.selectedAxis),topRawScoreSum:product.reduce((n,e)=>n+e.score,0),topRankScoreSum:product.reduce((n,e)=>n+api.weeklyRankScore(e),0)};
 }
 const c=variants.current,strict=variants.require_display_eligible,byKind=variants.exclude_reference_kind;
 const row={scenario:sc.id,scenarioKind:sc.kind,evaluationTime:sc.clock,reports:on?'ON':'OFF',fixedInputPhysicalUnchanged:!sc.id.includes('sparse6h'),candidateCount:all.length,p0SafeCount:safe.length,referenceCount:safe.filter(e=>kinds.has(e.today?._weatherState?.kind)).length,displayIneligibleCount:safe.filter(e=>e.today?._weatherState?.scoreEligible!==true).length,unknownStateIds:safe.filter(e=>!e.today?._weatherState?.kind).map(e=>String(e.site.id)),entryKinds:tally(safe,e=>e.today?._weatherState?.kind||'missing'),allSafeEntries:safe.map(projected),variants,strictVsKindExcludedDifference:[...new Set([...strict.excludedIds.filter(x=>!byKind.excludedIds.includes(x)),...byKind.excludedIds.filter(x=>!strict.excludedIds.includes(x))])],topChangedWithStrict:signature(c.top)!==signature(strict.top),currentUnconfirmedTopIds:c.top.filter(e=>e.displayEligible!==true).map(e=>e.id)};
 summary.push({scenario:sc.id,reports:row.reports,candidates:all.length,safe:safe.length,reference:row.referenceCount,currentTop:c.top.map(e=>e.id),currentUnknownTop:row.currentUnconfirmedTopIds,filteredCandidates:strict.eligibleCount,filteredTop:strict.top.map(e=>e.id),filterDifferences:row.strictVsKindExcludedDifference.length});return row;
}
const experiments=scenarios.flatMap(sc=>[resultFor(sc,false),resultFor(sc,true)]);
const manifestSummary={head:HEAD,before:PREVIOUS,main:MAIN,fixedClock:NOW,fixedManifestSHA256:hash(fs.readFileSync(path.join(ANALYSIS,'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json'))),reportSHA256:hash(reportBytes),mode:'Actual product candidates/P0 checks/season selector; analysis-only final filters + independent unchanged4312 quota/tuple selection. No product function is patched. No new scores or probabilities.',policyDefinitions:{current:'actual approved C product candidates and final selection',exclude_reference_kind:'remove explicit reference/previous/none kind before final season selector; unknown kind retained by definition',require_display_eligible:'require derived scoreEligible strict true before final season selector; unknown state excluded'},scenarioCount:scenarios.length,experimentCount:experiments.length,independentSelectionComparisons:comparisons,experiments,summary,limits:['Fixed22:40 data is never compared with controlled10/10 fixture as a temporal algorithm change. Each policy is compared only within exactly one scenario/clock/report condition.','Generation timestamp changes preserve physical fields/score/forecastTime in fixed-input controlled cases, not a claim that their generated score corresponds to a new observation.','Sparse6h source is actual generator output from synthetic upstream arrays; frequency of loader failure, update delay and sparse upstream data is unknown.','Reference-ineligible derived display state is distinct from the original own raw scoreEligible true. C now rejects reference candidates in actual product functions. The saved R6 strict filter is an independent expected-result comparison; the analytical filters here never patch product code.']};
fs.writeFileSync(path.join(OUT,'c_reference_policy.json'),JSON.stringify(manifestSummary,null,2)+'\n');
console.log(JSON.stringify({head:HEAD,scenarioCount:scenarios.length,experimentCount:experiments.length,independentSelectionComparisons:comparisons,summary},null,2));

const zero=scenarios.find(s=>s.id==='fixed_week_loader_failure'),a=target.api(sightings,zero.overrides),w=a.weeklyInfo();
const excluded=target.sites.filter(s=>!a.weeklyRecommendationForSite(s,w)).map(s=>({id:String(s.id),pelagic:!!s.pelagic,closedTideGate:!a.weeklyMudflatTideGateOpen(s,w),policyPresent:!!a.weeklyDatePolicy(s,(data.today.sites[String(s.id)]||{}).date||a.weeklyTodayDateText()),rawTodayValid:a.weeklyTodayRecommendable(data.today.sites[String(s.id)],s)}));
const diagnostic={evaluationTime:NOW,sourceTodayRoot:{date:data.today.date,generatedAt:data.today.generatedAt,updated:data.today.updated},todayRawEligibilityCounts:tally(Object.values(data.today.sites),r=>String(r.scoreEligible)),sourceForecastTimes:[...new Set(Object.values(data.today.sites).map(r=>r.forecastTime))].sort(),excluded,excludedCauseCounts:{closedTideGate:excluded.filter(x=>x.closedTideGate).length,pelagicRequiresWeek:excluded.filter(x=>x.pelagic).length,noSeasonPolicy:excluded.filter(x=>!x.policyPresent).length,rawTodayInvalid:excluded.filter(x=>!x.rawTodayValid).length}};
fs.writeFileSync(path.join(OUT,'c_loader_failure_diagnostic.json'),JSON.stringify(diagnostic,null,2)+'\n');

// Cross-check actual C products against the independently measured before-R6 strict final filter.
const beforePath=process.argv[5]||path.join(REPO,'docs/p1-s-review/results/r6/r6_reference_policy.json');
const beforePolicy=JSON.parse(fs.readFileSync(beforePath,'utf8'));assert.equal(beforePolicy.head,PREVIOUS);assert.equal(beforePolicy.fixedManifestSHA256,manifestSummary.fixedManifestSHA256);assert.equal(beforePolicy.reportSHA256,manifestSummary.reportSHA256);
const comparison=[];for(const now of manifestSummary.experiments){const previous=beforePolicy.experiments.find(p=>p.scenario===now.scenario&&p.reports===now.reports);assert.ok(previous,now.scenario);const expected=previous.variants.require_display_eligible;
 assert.equal(now.p0SafeCount,expected.eligibleCount,'C candidate count versus approved strict analysis '+now.scenario+'/'+now.reports);
 assert.deepEqual(now.variants.current.top,expected.top,'actual C top full projection versus approved strict analysis '+now.scenario+'/'+now.reports);
 comparison.push({scenario:now.scenario,reports:now.reports,beforeCandidates:previous.p0SafeCount,beforeReferenceCandidates:previous.displayIneligibleCount,expectedStrictCount:expected.eligibleCount,actualCCount:now.p0SafeCount,actualCTop:now.variants.current.top.map(e=>e.id),fullTopMatchesApprovedStrict:true,referenceIdsRemaining:now.currentUnconfirmedTopIds});}
const actualC={head:HEAD,before:PREVIOUS,scenarioCount:manifestSummary.scenarioCount,conditions:comparison.length,sourceSHA256:hash(blob(HEAD,'index.html')),beforePolicySHA256:hash(fs.readFileSync(beforePath)),mode:'Same immutable and controlled19scenarios/reportONOFF; actual C product candidates/selection compared to saved R6 analysis strict policy, no product functions patched.',comparison};
fs.writeFileSync(path.join(OUT,'c_policy_before_after.json'),JSON.stringify(actualC,null,2)+'\n');console.log(JSON.stringify({actualCConditions:comparison.length,allStrictExpectedCountsAndFullTopsMatch:true,comparison},null,2));
