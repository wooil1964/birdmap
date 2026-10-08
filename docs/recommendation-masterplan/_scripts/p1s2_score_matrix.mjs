/* P1-S2 analysis only: exact current functions vs temporary strict-contract wrapper.
 Synthetic values are test stimuli, not ecological scores. No application source/data writes. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.join(path.dirname(fileURLToPath(import.meta.url))));
const prior=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(prior+1);process.env['GIT_CONFIG_KEY_'+prior]='safe.directory';process.env['GIT_CONFIG_VALUE_'+prior]=repo;
const {loadP1C}=await import(pathToFileURL(path.join(repo,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')));
const rt=loadP1C(),manifest=rt.manifest,html=execFileSync('git',['show',manifest.codeCommit+':index.html'],{cwd:repo,maxBuffer:1<<28}).toString('utf8');
const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],
 html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0]].join('\n');
const names=[...rt.functions.matchAll(/^function (\w+)\(/gm)].map(m=>m[1]);
export function validRawScore(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;}

const guard="function strictRawScore(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;}\nfunction strictEligible(value){return !!value&&Object.prototype.hasOwnProperty.call(value,'scoreEligible')&&value.scoreEligible===true&&strictRawScore(value.score);}\nfunction strictNumber(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}\nfunction strictWeekly(sample,site){\n if(!strictEligible(sample)||!Array.isArray(sample.missingScoreFields)||sample.missingScoreFields.length)return false;\n if(!['windSpeed','windDirectionDeg','precipitation3h'].every(function(key){return strictNumber(sample[key]);}))return false;\n if(sample.windDirectionDeg>=360)return false;\n if(sample.waveM!==null&&sample.waveM!==undefined&&!strictNumber(sample.waveM))return false;\n return !(site.showWave||site.island||site.pelagic)||strictNumber(sample.waveM);\n}\nfunction strictToday(day,site){\n if(!strictEligible(day)||!Array.isArray(day.missingScoreFields)||day.missingScoreFields.length||day.stale||day.dataUnavailable)return false;\n var wind=typeof day.wind==='string'&&day.wind.match(/^(.+?)\\s+(\\d+(?:\\.\\d+)?)m\\/s$/);\n if(!wind||!strictNumber(Number(wind[2])))return false;\n if(typeof day.rain!=='string'||!(/^(?:강수 없음|없음)$/.test(day.rain)||/^(?:3시간 )?강수 \\d+(?:\\.\\d+)?mm$/.test(day.rain)))return false;\n if(site.showWave||site.island||site.pelagic){\n  if(typeof day.wave!=='string'||!/^\\d+(?:\\.\\d+)?m$/.test(day.wave))return false;\n }\n return true;\n}\nfunction strictEntry(e){return !!e&&strictRawScore(e.score)&&(e.sample?strictWeekly(e.sample,e.site):strictToday(e.today,e.site));}\nif(ctx.contractGuard){\n var oldDaylight=weeklyDaylightCandidates,oldWeatherEntry=weeklyWeatherEntryForSite,oldTideWeather=weeklyTideWeather;\n var oldCandidate=weeklyRecommendationForSite,oldPelagic=weeklyPelagicSafety,oldAllowed=weatherScoreAllowed;\n weeklyDaylightCandidates=function(site,date){return oldDaylight(site,date).filter(function(s){return strictWeekly(s,site);});};\n weeklyWeatherEntryForSite=function(site,week,best){var e=oldWeatherEntry(site,week,best);return e&&(e.sample?strictWeekly(e.sample,site):strictToday(e.weather,site))?e:null;};\n weeklyTideWeather=function(site,tide){var e=oldTideWeather(site,tide);return e&&(e.sample?strictWeekly(e.sample,site):strictToday(e.weather,site))?e:null;};\n weeklyPelagicSafety=function(s){return strictRawScore(s&&s.score)&&oldPelagic(s);};\n weeklyRecommendationForSite=function(site,week){var e=oldCandidate(site,week);return strictEntry(e)?e:null;};\n weatherScoreAllowed=function(day){return !!day&&strictRawScore(day.score)&&oldAllowed(day);};\n var oldAutumn=autumnBalancedRecommendations,oldWinter=winterBalancedRecommendations,oldSpring=springBalancedRecommendations,oldSummer=summerBalancedRecommendations;\n autumnBalancedRecommendations=function(es){return oldAutumn(es.filter(strictEntry));};\n winterBalancedRecommendations=function(es){return oldWinter(es.filter(strictEntry));};\n springBalancedRecommendations=function(es){return oldSpring(es.filter(strictEntry));};\n summerBalancedRecommendations=function(es){return oldSummer(es.filter(strictEntry));};\n}\n";

const factory=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+constants+'\n'+rt.functions+'\n'+guard+
 '\nreturn {'+names.join(',')+',strictRawScore,strictWeekly,strictToday,strictEntry};');
const DAY='2026-10-10',DAY2='2026-10-11',NOW='2026-10-10T08:00:00+09:00';
function make(state={},patched=false,clock=NOW){const Clock=class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return new Date(clock).getTime();}};
 return factory({...rt.data,sites:rt.sites,sightings:rt.sightings,...state,contractGuard:patched},Clock);}
const tideSite=rt.sites.find(s=>String(s.id)==='14'),islandSite=rt.sites.find(s=>String(s.id)==='3'),boatSite=rt.sites.find(s=>String(s.id)==='48');
const general={...tideSite,id:'501',name:'Synthetic general',env:'숲',island:false,showWave:false,pelagic:false,weatherRuleKey:'general_birding'};
function sample(value=92,extra={},date=DAY,time='12:00'){return {forecastTime:date+' '+time+' KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',gust:5,precipitation3h:0,
 temperature:20,visibilityKm:15,cloudPct:20,waveM:.3,score:value,grade:value===0?'★':value===80?'★★★★':'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false,...extra};}
function today(value=92,extra={},date=DAY){return {date,forecastTime:date+' 12:00 KST',generatedAt:date+' 07:00 KST',score:value,grade:value===0?'★':value===80?'★★★★':'★★★★★',
 scoreEligible:true,missingScoreFields:[],stale:false,dataUnavailable:false,wind:'북풍 3m/s',rain:'강수 없음',wave:'0.3m',...extra};}
function state(site,samples,options={}){return {sites:[site],week:samples?{startDate:DAY,endDate:DAY2,sampleIntervalHours:3,generatedAt:DAY+' 07:00 KST',
 sites:{[site.id]:{days:{[DAY]:{samples}}}}}:null,today:null,tide:{sites:{[site.id]:{days:[{date:DAY,highTide:'12:00',highTideLevel:'900'}]}}},
 notices:[{published:true,siteIds:[site.id]}],sightings:{[site.id]:{latestDate:DAY,species:['일반종A','일반종B','일반종C','일반종D']}},...options};}
function compact(api,s){const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());return {candidate:!!e,score:e?.score??null,rawInputType:e?.sample?typeof e.sample.score:e?.today?typeof e.today.score:null,
 rank:e?(Number.isFinite(api.weeklyRankScore(e))?api.weeklyRankScore(e):String(api.weeklyRankScore(e))):null,bonus:e?.recentReport?.bonus??0,mandatory:!!e?.isMandatory,safe:e?api.weeklyRecommendationIsSafe(e):null,
 date:e?.recommendationDate??null,time:e?.recommendationTime??null,topIds:api.todayRecommendedSites().map(x=>String(x.site.id)),
 popupScore:e?.today?api.v251EffectiveScore(e.today):null};}
const cases=[['zero',0,{},true],['hundred',100,{},true],['float',92.5,{},true],['null',null,{},false],['undefined',undefined,{},false],['NaN',NaN,{},false],
 ['Infinity',Infinity,{},false],['-Infinity',-Infinity,{},false],['empty','',{},false],['numeric_string','92',{},false],['negative',-1,{},false],['above100',101,{},false],
 ['boolean_true',true,{},false],['boolean_false',false,{},false],['eligible_false',92,{scoreEligible:false},false],['eligible_missing',92,{scoreEligible:undefined},false],
 ['eligible_null',92,{scoreEligible:null},false],['eligible_one',92,{scoreEligible:1},false],['eligible_string',92,{scoreEligible:'true'},false],
 ['missing_reason',92,{missingScoreFields:['precipitation']},false],['missing_reason_null',92,{missingScoreFields:null},false],
 ['missing_reason_missing',92,{missingScoreFields:undefined},false],['required_wind_null',92,{windSpeed:null,wind:null},false],
 ['required_rain_null',92,{precipitation3h:null,rain:null},false],['required_direction_null',92,{windDirectionDeg:null},false],
 ['required_wave_null',92,{waveM:null,wave:null},false]];
const rows=[];
for(const [label,value,extra,expectedBase] of cases)for(const route of ['general_week','tide_week','island_week','pelagic_week','general_today','tide_today']){
 const s=route.startsWith('tide')?tideSite:route==='island_week'?islandSite:route==='pelagic_week'?boatSite:general;
 const isToday=route.endsWith('today'),options=isToday?{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[s.id]:today(value,{...extra,score:value})}}}:{};
 const input=state(s,isToday?null:[sample(value,{...extra,score:value})],options);
 const baseline=make(input),patched=make(input,true),a=compact(baseline,s),b=compact(patched,s);
 const requiredWave=!!(s.showWave||s.island||s.pelagic);
 const directionNotInToday=isToday&&label==='required_direction_null';
 const allowedOptional=!requiredWave&&label==='required_wave_null';
 const expected=expectedBase||directionNotInToday||allowedOptional;
 assert.equal(b.candidate,expected,label+' '+route+' design candidate');assert.equal(b.topIds.length,expected?1:0,label+' '+route+' design top');
 if(expected&&baseline.weeklyRecommendationForSite(s,baseline.weeklyInfo()))assert.deepEqual(baseline.weeklyRecommendationForSite(s,baseline.weeklyInfo()),patched.weeklyRecommendationForSite(s,patched.weeklyInfo()),'valid entry unchanged');
 rows.push({id:'S2-'+label+'-'+route,inputLabel:label,route,expectedCandidate:expected,current:a,designWrapper:b,currentContractMismatch:a.candidate!==expected,
  notes:directionNotInToday?'Today formatted schema has no windDirectionDeg; this mutation is irrelevant.':allowedOptional?'Wave is optional for this site; legitimate null remains accepted.':null});
}
const special=[];
function check(id,input,s,expect){const current=make(input),design=make(input,true),a=compact(current,s),b=compact(design,s);expect(design,b);special.push({id,current:a,designWrapper:b});}
for(const sameDay of [false,true]){
 const samples=sameDay?[sample(null,{},DAY,'09:00'),sample(80,{},DAY,'15:00')]:[sample(null)];
 const input=state(tideSite,samples);
 input.tide={sites:{14:{days:sameDay?[{date:DAY,highTide:'09:00,15:00',highTideLevel:'900,870'}]:[{date:DAY,highTide:'12:00',highTideLevel:'900'},{date:DAY2,highTide:'12:00',highTideLevel:'880'}]}}};
 if(!sameDay)input.week.sites['14'].days[DAY2]={samples:[sample(80,{},DAY2)]};
 check('S2-alternative-'+(sameDay?'same-day':'different-date'),input,tideSite,(_api,b)=>{assert.equal(b.candidate,true);assert.equal(b.score,80);assert.equal(b.time,sameDay?'15:00':'12:00');assert.equal(b.date,sameDay?DAY:DAY2);});
}
const withoutWeather=state(general,null,{today:null});
check('S2-notice-and-reports-with-no-weather',withoutWeather,general,(_api,b)=>{assert.equal(b.candidate,false);assert.equal(b.topIds.length,0);});
for(const [label,change,allowed] of [
 ['tide_gap90',{time:'10:30'},true],['tide_gap91',{time:'10:29'},false],['tide_gap120',{time:'10:00'},false],
 ['rain0999',{sample:{precipitation3h:.999}},true],['rain1',{sample:{precipitation3h:1}},false],['wave2',{sample:{waveM:2}},false],
 ['boat_wind6',{sample:{windSpeed:6,waveM:.7}},true],['boat_wind_over',{sample:{windSpeed:6.001}},false],
 ['boat_wave_over',{sample:{waveM:.701}},false],['boat_rain_positive',{sample:{precipitation3h:.0001}},false]]){
 const s=label.startsWith('boat')?boatSite:label.startsWith('tide')?tideSite:general;
 const input=state(s,[sample(0,change.sample||{},DAY,change.time||'12:00')]);
 check('S2-safety-'+label,input,s,(_api,b)=>{assert.equal(b.topIds.length,allowed?1:0);});
}
const fillSite={...general,id:'502',name:'Synthetic valid fill',env:'숲'};
const fillState=state(general,[sample(null)],{sites:[general,fillSite]});
fillState.week.sites[fillSite.id]={days:{[DAY]:{samples:[sample(92)]}}};
check('S2-fill-cannot-revive-invalid',fillState,general,(api,b)=>{assert.equal(b.candidate,false);assert.deepEqual(b.topIds,['502']);});
const validEntryApi=make(state(general,[sample(92)])),validEntry=validEntryApi.weeklyRecommendationForSite(general,validEntryApi.weeklyInfo());
const invalidDirect={...validEntry,score:null,rankScore:16,sample:sample(null),stableOrder:0,isMandatory:true,priority:1};
const validDirect={...validEntry,site:fillSite,stableOrder:1};
const direct=make(state(general,[sample(92)]),true);
for(const name of ['autumnBalancedRecommendations','winterBalancedRecommendations','springBalancedRecommendations','summerBalancedRecommendations']){
 const current=make(state(general,[sample(92)]));
 const a=current[name]([invalidDirect,validDirect]).map(e=>String(e.site.id)),b=direct[name]([invalidDirect,validDirect]).map(e=>String(e.site.id));
 assert.ok(!b.includes(general.id),name+' direct invalid filtering');special.push({id:'S2-direct-'+name,current:{topIds:a},designWrapper:{topIds:b}});
}

for(const [season,date] of [['spring','2027-04-10'],['summer','2027-06-10'],['winter','2026-12-10']])for(const value of [0,null])for(const route of ['week','today']){
 const s={...general,env:'습지',seasons:['연중'],seasonTags:'연중',island:false};
 const now=date+'T08:00:00+09:00',input=state(s,null,{sightings:{[s.id]:{latestDate:date,species:['일반종A']}}});
 input.tide=null;
 if(route==='week')input.week={startDate:date,endDate:date,sampleIntervalHours:3,generatedAt:date+' 07:00 KST',sites:{[s.id]:{days:{[date]:{samples:[sample(value,{},date)]}}}}};
 else input.today={date,generatedAt:date+' 07:00 KST',sites:{[s.id]:today(value,{},date)}};
 const current=make(input,false,now),design=make(input,true,now),a=compact(current,s),b=compact(design,s);
 assert.equal(b.candidate,value===0);assert.equal(b.topIds.length,value===0?1:0);
 special.push({id:'S2-seasonal-'+season+'-'+route+'-'+String(value),current:a,designWrapper:b});
}
const displayInput=state(general,null,{notices:[],sightings:{},today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[general.id]:today(null)}}});
const displayCurrent=make(displayInput),displayDesign=make(displayInput,true);
const rawCurrent=displayCurrent.weatherTodayForSite(general),rawDesign=displayDesign.weatherTodayForSite(general);
assert.equal(displayDesign.weatherScoreAllowed(rawDesign),false);
for(const key of ['wind','rain','wave','forecastTime'])assert.equal(rawCurrent[key],rawDesign[key]);
special.push({id:'S2-invalid-score-raw-weather-display-preserved',current:{scoreAllowed:displayCurrent.weatherScoreAllowed(rawCurrent),wind:rawCurrent.wind,rain:rawCurrent.rain,wave:rawCurrent.wave},
 designWrapper:{scoreAllowed:displayDesign.weatherScoreAllowed(rawDesign),wind:rawDesign.wind,rain:rawDesign.rain,wave:rawDesign.wave}});
const noNoticeInput=state(general,null,{notices:[],sightings:{},today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[general.id]:today(null)}}});
check('S2-today-null-no-notice',noNoticeInput,general,(_api,b)=>{assert.equal(b.candidate,false);assert.equal(b.topIds.length,0);});

const fixedCurrent=make({},false,manifest.evaluationTime),fixedDesign=make({},true,manifest.evaluationTime);
const top=api=>api.todayRecommendedSites().map((e,i)=>({position:i+1,id:String(e.site.id),raw:e.score,display:api.v251EffectiveScore(e.today),rank:api.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}));
const fixed={evaluationTime:manifest.evaluationTime,current:top(fixedCurrent),designWrapper:top(fixedDesign),
 candidateCurrent:rt.sites.filter(s=>fixedCurrent.weeklyRecommendationForSite(s,fixedCurrent.weeklyInfo())).length,
 candidateDesign:rt.sites.filter(s=>fixedDesign.weeklyRecommendationForSite(s,fixedDesign.weeklyInfo())).length};
assert.deepEqual(fixed.current,fixed.designWrapper);assert.deepEqual(fixed.current,top(rt.makeScenario({reports:true,cap:16})));assert.equal(fixed.candidateCurrent,fixed.candidateDesign);
const fixedSamples=Object.values(rt.data.week.sites).flatMap(s=>Object.values(s.days).flatMap(d=>d.samples||[]));
const fixedInvalid=fixedSamples.filter(s=>s.scoreEligible===true&&!validRawScore(s.score)).length;
const blobHash=commit=>createHash('sha256').update(execFileSync('git',['show',commit+':index.html'],{cwd:repo,maxBuffer:1<<28})).digest('hex');
const latestMain=execFileSync('git',['rev-parse','origin/main'],{cwd:repo}).toString().trim();assert.equal(blobHash(latestMain),blobHash(manifest.codeCommit));
const latestWeek=JSON.parse(execFileSync('git',['show',latestMain+':weather_week.json'],{cwd:repo,maxBuffer:1<<28}));
const latestSamples=Object.values(latestWeek.sites).flatMap(s=>Object.values(s.days||{}).flatMap(d=>d.samples||[]));
const latestScoreAudit={commit:latestMain,generatedAt:latestWeek.generatedAt,samples:latestSamples.length,eligibleInvalidScore:latestSamples.filter(s=>s.scoreEligible===true&&!validRawScore(s.score)).length,
 scope:'Read-only score audit of current remote main; not used for fixed recommendation comparison.'};
const report={schemaVersion:1,analysisOnly:true,codeCommit:manifest.codeCommit,latestMain,functionsSha256:rt.functionsHash,inputManifest:'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json',
 fixtureTime:NOW,scoreCases:cases.length,matrixCases:rows.length,currentContractMismatchCount:rows.filter(x=>x.currentContractMismatch).length,
 designExpectedCasesPass:rows.length,specialCases:special.length,designSpecialCasesPass:special.length,rows,special,fixedInput:{...fixed,samples:fixedSamples.length,eligibleInvalidScore:fixedInvalid},latestScoreAudit,
 contract:{rawScore:'number, finite, 0<=score<=100; zero valid; no minimum score policy introduced',
 eligibility:'Own scoreEligible property, value exactly true. Missing/null/string/1 are unknown and rejected for recommendations.',
 requiredData:'Array missingScoreFields explicitly empty; weekly finite/nonnegative windSpeed, windDirectionDeg<360 and precipitation3h; wave finite/nonnegative when showWave/island/pelagic. Today adapter validates generator formatted wind/rain and wave where required.',
 rankScore:'Finite raw score plus existing maximum 16 report bonus; rank may exceed 100 and is not clamped by raw-score range.',
 independentGates:'Numerical validity is separate from season/daylight/forecast provenance/freshness, absolute 90-minute tide proximity, precipitation and ship safety. No existing P0 gate is relaxed.',
 display:'Invalid numeric score produces unconfirmed score/grade; raw weather/tide facts remain readable. Analysis wrapper exercises numeric display guard, not a browser implementation.'},
 evidenceLimit:'Synthetic current defects reproduce malformed/contradictory score inputs; no invalid eligible score exists in fixed 10,640 sample set or audited latest main. Does not establish operational leak or ecological probability. Wrapper tests expected design behavior only, not implemented production changes.'};
fs.writeFileSync(path.join(out,'p1s2_score_matrix.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({matrixCases:report.matrixCases,currentContractMismatches:report.currentContractMismatchCount,designPass:report.designExpectedCasesPass,
 specialPass:report.designSpecialCasesPass,fixedCandidates:fixed.candidateCurrent,topUnchanged:true,fixedInputInvalid:fixedInvalid,latestScoreAudit,
 mismatchByRoute:Object.fromEntries([...new Set(rows.map(r=>r.route))].map(route=>[route,rows.filter(r=>r.route===route&&r.currentContractMismatch).length]))},null,2));
