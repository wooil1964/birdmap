/* PR #13 actual-product independent S2 verification. Read-only Git sources + synthetic memory.
 No patched contract wrappers; expectations are compared to real PR functions. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url))),
 referenceRepo=path.resolve(process.argv[4]||'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap');
const HEAD='2e485079a34fa5aeeef09e82f3b996bf2696d978',MAIN='b0975cad9f3112af38cc286a892bf6f06722ce12';
const config=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(config+2);
for(const [i,p] of [[config,repo],[config+1,referenceRepo]]){process.env['GIT_CONFIG_KEY_'+i]='safe.directory';process.env['GIT_CONFIG_VALUE_'+i]=p;}
const sha=b=>createHash('sha256').update(b).digest('hex'),git=(ref,file)=>execFileSync('git',['show',ref+':'+file],{cwd:repo,maxBuffer:1<<28}).toString('utf8');
assert.equal(sha(fs.readFileSync(path.join(repo,'index.html'),'utf8').replace(/\r\n/g,'\n')),sha(git(HEAD,'index.html').replace(/\r\n/g,'\n')),'archive must match explicit PR head');
const {loadP1C}=await import(pathToFileURL(path.join(referenceRepo,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')));
const rt=loadP1C(),html=git(HEAD,'index.html'),helper=git(HEAD,'.github/scripts/test_weekly_recommendation.mjs');
function source(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let depth=0,quote=null;
 for(let i=html.indexOf('{',start);i<html.length;i++){const c=html[i],p=html[i-1];if(quote){if(c===quote&&p!=='\\')quote=null;continue;}
 if(c==='"'||c==="'"){quote=c;continue;}if(c==='/'&&html[i+1]==='*'){i=html.indexOf('*/',i)+1;continue;}
 if(c==='/'&&html[i+1]==='/'){i=html.indexOf('\n',i);continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return html.slice(start,i+1);}throw Error('unbalanced '+name);}
const names=[...new Set([...vm.runInNewContext(helper.match(/const NAMES = (\[[\s\S]*?\]);/)[1]),
 'monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue',
 'v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite'])];
const constants=[html.match(/var TODAY_MUDFLAT_TIDE_RULES=\{[\s\S]*?\};/)[0],html.match(/var WEEKLY_RECENT_BONUS_MAX=.*?;/)[0],
 html.match(/var AUTUMN_CORE_FIELD_SITE_IDS=.*?;/)[0],...[...html.matchAll(/var (?:WINTER|SPRING)_[A-Z_]+=new Set\(.*?;/g)].map(m=>m[0]),
 html.match(/var TODAY_AUTUMN_REMOTE_ISLAND_SITE_NAMES=.*?;/)[0]].join('\n');
const functions=names.map(source).join('\n');
const factory=new Function('ctx','Date','var weatherWeek=ctx.week,tideMonth=ctx.tide,weatherToday=ctx.today,siteData=ctx.sites;'+
 'var loadedNotices=ctx.notices,PINNED_BIRDING_ISSUES=[],recommendationWeatherRules=ctx.rules,recentSiteSightings=ctx.sightings;'+
 constants+'\n'+functions+'\nreturn {'+names.join(',')+'};');
const DAY='2026-10-10',DAY2='2026-10-11',NOW='2026-10-10T08:00:00+09:00';
function make(state={},clock=NOW){const Clock=class extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return new Date(clock).getTime();}};
 return factory({...rt.data,sites:rt.sites,sightings:rt.sightings,...state},Clock);}
const tideSite=rt.sites.find(s=>String(s.id)==='14'),islandSite=rt.sites.find(s=>String(s.id)==='3'),boatSite=rt.sites.find(s=>String(s.id)==='48');
const general={...tideSite,id:'501',name:'Synthetic general',env:'숲',island:false,showWave:false,pelagic:false,weatherRuleKey:'general_birding'};
function sample(value=92,extra={},date=DAY,time='12:00'){return {forecastTime:date+' '+time+' KST',windSpeed:3,windDirectionDeg:0,windName:'북풍',gust:5,precipitation3h:0,
 temperature:20,visibilityKm:15,cloudPct:20,waveM:.3,score:value,grade:value===0?'★':'★★★★★',scoreEligible:true,missingScoreFields:[],isPastAtGeneration:false,...extra};}
function today(value=92,extra={},date=DAY){return {date,forecastTime:date+' 12:00 KST',generatedAt:date+' 07:00 KST',score:value,grade:value===0?'★':'★★★★★',
 scoreEligible:true,missingScoreFields:[],stale:false,dataUnavailable:false,wind:'북풍 3m/s',rain:'강수 없음',wave:'0.3m',...extra};}
function state(site,samples,options={}){return {sites:[site],week:samples?{startDate:DAY,endDate:DAY2,sampleIntervalHours:3,generatedAt:DAY+' 07:00 KST',
 sites:{[site.id]:{days:{[DAY]:{samples}}}}}:null,today:null,tide:{sites:{[site.id]:{days:[{date:DAY,highTide:'12:00',highTideLevel:'900'}]}}},
 notices:[{published:true,siteIds:[site.id]}],sightings:{[site.id]:{latestDate:DAY,species:['일반종A','일반종B','일반종C','일반종D']}},...options};}
function compact(api,s){const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());const rank=e?api.weeklyRankScore(e):null;
 return {candidate:!!e,score:e?.score??null,rank:Number.isFinite(rank)?rank:rank===null?null:String(rank),bonus:e?.recentReport?.bonus??0,mandatory:!!e?.isMandatory,
 safe:e?api.weeklyRecommendationIsSafe(e):null,date:e?.recommendationDate??null,time:e?.recommendationTime??null,tideText:e?.tideText??null,
 topIds:api.todayRecommendedSites().map(x=>String(x.site.id)),popupScore:e?.today?api.v251EffectiveScore(e.today):null};}
const cases=[['zero',0,{},true],['hundred',100,{},true],['float',92.5,{},true],['null',null,{},false],['undefined',undefined,{},false],['NaN',NaN,{},false],
 ['Infinity',Infinity,{},false],['-Infinity',-Infinity,{},false],['empty','',{},false],['numeric_string','92',{},false],['negative',-1,{},false],['above100',101,{},false],
 ['boolean_true',true,{},false],['boolean_false',false,{},false],['eligible_false',92,{scoreEligible:false},false],['eligible_missing',92,{scoreEligible:undefined},false],
 ['eligible_null',92,{scoreEligible:null},false],['eligible_one',92,{scoreEligible:1},false],['eligible_string',92,{scoreEligible:'true'},false],
 ['missing_reason',92,{missingScoreFields:['precipitation']},false],['missing_reason_null',92,{missingScoreFields:null},false],
 ['missing_reason_missing',92,{missingScoreFields:undefined},false],['required_wind_null',92,{windSpeed:null,wind:null},false],
 ['required_rain_null',92,{precipitation3h:null,rain:null},false],['required_direction_null',92,{windDirectionDeg:null},false],
 ['required_wave_null',92,{waveM:null,wave:null},false]];
const rows=[];
for(const [label,value,extra,normal] of cases)for(const route of ['general_week','tide_week','island_week','pelagic_week','general_today','tide_today','island_today']){
 const s=route.startsWith('tide')?tideSite:route.startsWith('island')?islandSite:route==='pelagic_week'?boatSite:general,isToday=route.endsWith('today');
 const input=state(s,isToday?null:[sample(value,{...extra,score:value})],isToday?{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[s.id]:today(value,{...extra,score:value})}}}:{});
 const api=make(input),actual=compact(api,s),requiredWave=!!(s.showWave||s.island||s.pelagic);
 const expected=normal||(isToday&&label==='required_direction_null')||(!requiredWave&&label==='required_wave_null');
 rows.push({id:'PR13-S2-'+label+'-'+route,route,inputLabel:label,expectedCandidate:expected,actual,
 contractPass:actual.candidate===expected&&actual.topIds.length===(expected?1:0)});
}
const specials=[];
function check(id,input,s,expect){const api=make(input),actual=compact(api,s);let error=null;try{expect(api,actual);}catch(e){error=e.message;}
 specials.push({id,actual,expectedPass:!error,error});}
for(const sameDay of [false,true]){
 const input=state(tideSite,sameDay?[sample(null,{},DAY,'09:00'),sample(80,{},DAY,'15:00')]:[sample(null)]);
 input.tide={sites:{14:{days:sameDay?[{date:DAY,highTide:'09:00,15:00',highTideLevel:'900,870'}]:[{date:DAY,highTide:'12:00',highTideLevel:'900'},{date:DAY2,highTide:'12:00',highTideLevel:'880'}]}}};
 if(!sameDay)input.week.sites['14'].days[DAY2]={samples:[sample(80,{},DAY2)]};
 check('alternative-'+(sameDay?'same-day':'different-date'),input,tideSite,(_api,b)=>{assert.equal(b.candidate,true);assert.equal(b.score,80);assert.equal(b.date,sameDay?DAY:DAY2);});
}
check('notice-reports-no-weather',state(general,null,{today:null}),general,(_api,b)=>{assert.equal(b.candidate,false);assert.equal(b.topIds.length,0);});
for(const [label,change,allowed] of [
 ['tide_gap90',{time:'10:30'},true],['tide_gap91',{time:'10:29'},false],['tide_gap120',{time:'10:00'},false],
 ['rain0999',{sample:{precipitation3h:.999}},true],['rain1',{sample:{precipitation3h:1}},false],['wave2',{sample:{waveM:2}},false],
 ['boat_wind6',{sample:{windSpeed:6,waveM:.7}},true],['boat_wind_over',{sample:{windSpeed:6.001}},false],
 ['boat_wave_over',{sample:{waveM:.701}},false],['boat_rain_positive',{sample:{precipitation3h:.0001}},false]]){
 const s=label.startsWith('boat')?boatSite:label.startsWith('tide')?tideSite:general;
 check('safety-'+label,state(s,[sample(0,change.sample||{},DAY,change.time||'12:00')]),s,(_api,b)=>assert.equal(b.topIds.length,allowed?1:0));
}
const second={...general,id:'502',name:'Synthetic valid fill'},fill=state(general,[sample(null)],{sites:[general,second]});
fill.week.sites[second.id]={days:{[DAY]:{samples:[sample(92)]}}};
check('fill-invalid-score',fill,general,(_api,b)=>assert.deepEqual(b.topIds,['502']));
for(const wave of ['0.3',-1,NaN])check('optional-wave-invalid-'+String(wave),state(general,[sample(92,{waveM:wave})]),general,(_api,b)=>assert.equal(b.candidate,false));
const inherit=sample();delete inherit.scoreEligible;Object.setPrototypeOf(inherit,{scoreEligible:true});
check('inherited-eligibility-week',state(general,[inherit]),general,(_api,b)=>assert.equal(b.candidate,false));
const inheritedToday=today();delete inheritedToday.scoreEligible;Object.setPrototypeOf(inheritedToday,{scoreEligible:true});
check('inherited-eligibility-today',state(general,null,{today:{sites:{[general.id]:inheritedToday}}}),general,(_api,b)=>assert.equal(b.candidate,false));

check('today-all-weather-fields-null',state(general,null,{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[general.id]:today(92,{wind:null,rain:null,wave:null})}}}),general,(_api,b)=>assert.equal(b.candidate,false));
check('island-today-all-weather-fields-null',state(islandSite,null,{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[islandSite.id]:today(92,{wind:null,rain:null,wave:null})}}}),islandSite,(_api,b)=>assert.equal(b.candidate,false));

const popup=[];
for(const [label,fields] of [['missingEligible',{scoreEligible:undefined}],['nullEligible',{scoreEligible:null}],['falseEligible',{scoreEligible:false}],
 ['missingReason',{missingScoreFields:undefined}],['nullReason',{missingScoreFields:null}],['nonemptyReason',{missingScoreFields:['precipitation']}],
 ['requiredWindMissing',{wind:null}],['requiredRainMissing',{rain:null}],['requiredWaveMissing',{wave:null}],['nullScore',{score:null}],['normalZero',{score:0}],['normal100',{score:100}]]){
 const s=label==='requiredWaveMissing'?islandSite:general,raw=today(92,fields),api=make(state(s,null,{today:{date:DAY,generatedAt:DAY+' 07:00 KST',sites:{[s.id]:raw}}}));
 const resolved=api.weatherTodayForSite(s),expected=['normalZero','normal100'].includes(label);
 popup.push({id:'popup-'+label,expectedScoreAllowed:expected,actualScoreAllowed:Boolean(api.weatherScoreAllowed(resolved)),
 display:api.v251ScoreDisplayText(resolved),resolvedState:resolved._weatherState,score:resolved.score,
 contractPass:Boolean(api.weatherScoreAllowed(resolved))===expected});
}
const apiNormal=make(state(general,[sample()])),valid=apiNormal.weeklyRecommendationForSite(general,apiNormal.weeklyInfo());
const invalidEntry={...valid,score:null,rankScore:16,sample:sample(null),stableOrder:0,isMandatory:true,priority:1};
const selectors=[];
for(const name of ['autumnBalancedRecommendations','winterBalancedRecommendations','springBalancedRecommendations','summerBalancedRecommendations']){
 const top=apiNormal[name]([invalidEntry]).map(e=>String(e.site.id));selectors.push({function:name,invalidDirectIds:top,
 note:'Direct call defense only; full production todayRecommendedSites already calls candidate/raw-score gates.'});
}
const fixed=make({},rt.manifest.evaluationTime),fixedTop=fixed.todayRecommendedSites().map((e,i)=>({position:i+1,id:String(e.site.id),raw:e.score,display:fixed.v251EffectiveScore(e.today),
 rank:fixed.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}));
const reference=rt.makeScenario({reports:true,cap:16}),referenceTop=reference.todayRecommendedSites().map((e,i)=>({position:i+1,id:String(e.site.id),raw:e.score,display:reference.v251EffectiveScore(e.today),
 rank:reference.weeklyRankScore(e),bonus:e.recentReport?.bonus||0,date:e.recommendationDate,time:e.recommendationTime,axis:e.selectedAxis}));
const candidates=rt.sites.filter(s=>fixed.weeklyRecommendationForSite(s,fixed.weeklyInfo())).length;assert.deepEqual(fixedTop,referenceTop);assert.equal(candidates,176);
const report={head:HEAD,latestMainAtTaskStart:MAIN,actualFunctionSourceSha256:sha(functions),indexSha256:sha(html),evaluationTime:NOW,
 mode:'Actual PR function extraction, no product guard patch/wrapper. Frozen clock only.',
 matrixCases:rows.length,matrixPassed:rows.filter(r=>r.contractPass).length,matrixFailed:rows.filter(r=>!r.contractPass).length,rows,
 specialCases:specials.length,specialPassed:specials.filter(r=>r.expectedPass).length,specialFailed:specials.filter(r=>!r.expectedPass).length,specials,popup,selectors,
 fixed:{manifest:'input_manifest_35141c0_2240.json',evaluationTime:rt.manifest.evaluationTime,candidates,topExact:true,top:fixedTop},
 privacy:'Synthetic source-only; no production API calls, database modifications, network requests or code writes.'};
fs.writeFileSync(path.join(out,'pr13_r123_actual_matrix.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({head:HEAD,matrix:[report.matrixPassed,report.matrixCases],failures:rows.filter(r=>!r.contractPass).map(r=>({id:r.id,actual:r.actual})),
 special:[report.specialPassed,report.specialCases],specialFailures:specials.filter(r=>!r.expectedPass),popupFailures:popup.filter(r=>!r.contractPass),
 selectors,fixedCandidates:candidates,fixedTopExact:true},null,2));


