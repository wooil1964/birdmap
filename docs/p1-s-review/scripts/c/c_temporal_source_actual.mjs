/* PR #13 actual-product independent S2 verification. Read-only Git sources + synthetic memory.
 No patched contract wrappers; expectations are compared to real PR functions. */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.dirname(fileURLToPath(import.meta.url))),
 referenceRepo=path.resolve(process.argv[4]||'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap');
const HEAD='352315a57d038687807dbe0044c136a22fb0c9c5',MAIN='b0975cad9f3112af38cc286a892bf6f06722ce12';
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
/* Independent C temporal/source audit; product functions and guards unchanged. */
const TEST_NOW='2026-10-10T11:00:00+09:00',rows=[];
function check(id,input,s,expected){const api=make(input,TEST_NOW),e=api.weeklyRecommendationForSite(s,api.weeklyInfo());const actual=compact(api,s);rows.push({id,expectedCandidate:expected,contractPass:actual.candidate===expected,...actual,entryForecast:e?.today?.forecastTime,entryState:e?.today?._weatherState,sampleForecast:e?.sample?.forecastTime,finalEligible:e?api.weeklyRecommendationEligible(e):null,strictForecastParsed:e?.today?api.weeklyForecastTimestamp(e.today.forecastTime):null});}
const sites=[['general',general],['tide',tideSite],['island',islandSite],['boat',boatSite]];
for(const [kind,s] of sites){
 const normal=state(s,[sample()]);normal.week.generatedAt=DAY+' 10:30 KST';check('normal-week-'+kind,normal,s,true);
 for(const [label,value] of [['missing',undefined],['null',null],['empty',''],['bad','not-a-time'],['future',DAY+' 12:30 KST']]){const st=state(s,[sample()]);st.week.generatedAt=value;check('week-generation-'+label+'-'+kind,st,s,false);}
 const unavailable=state(s,[sample()]);unavailable.week.generatedAt=DAY+' 10:30 KST';unavailable.week.sites[s.id].dataUnavailable=true;check('week-site-unavailable-'+kind,unavailable,s,false);
 const missingStart=state(s,[sample()]);missingStart.week.generatedAt=DAY+' 10:30 KST';delete missingStart.week.startDate;check('week-range-missing-start-'+kind,missingStart,s,false);
 for(const [label,text] of [['no_timezone',DAY+' 12:00'],['wrong_timezone',DAY+' 12:00 UTC'],['garbage_suffix',DAY+' 12:00 bananas'],['minute60',DAY+' 12:60 KST'],['trailing_garbage',DAY+' 12:00 KST junk']]){
  const st=state(s,[sample(99,{forecastTime:text}),sample(80,{},DAY,'13:00')]);st.week.generatedAt=DAY+' 10:30 KST';
  const api=make(st,TEST_NOW),e=api.weeklyRecommendationForSite(s,api.weeklyInfo()),actual=compact(api,s);
  rows.push({id:'invalid-highest-'+label+'-'+kind,expectedCandidate:true,expectedScore:80,contractPass:actual.candidate&&actual.score===80,...actual,entryForecast:e?.today?.forecastTime,entryState:e?.today?._weatherState,strictForecastParsed:e?.today?api.weeklyForecastTimestamp(e.today.forecastTime):null});
 }
}
// General today can still use the permissive display timestamp parser; compare with strict C parser.
for(const [label,text] of [['normal',DAY+' 12:00 KST'],['no_timezone',DAY+' 12:00'],['wrong_timezone',DAY+' 12:00 UTC'],['iso_non_kst',DAY+'T12:00:00+00:00'],['midnight24',DAY+'T24:00:00+09:00']]){
 const st=state(general,null,{today:{date:DAY,generatedAt:DAY+' 10:30 KST',sites:{[general.id]:today(92,{generatedAt:DAY+' 10:30 KST',forecastTime:text})}}});check('general-today-format-'+label,st,general,label==='normal');
}
const parser=make(state(general,[sample()]),TEST_NOW),timeRows=[];
function time(id,tide,text,expected){const actual=parser.weeklyTideForecastGapMinutes(tide,text);timeRows.push({id,tide,text,expected,actual,pass:actual===expected});}
for(const [id,date,minute,text,expected] of [
 ['same90later',DAY,720,DAY+' 13:30 KST',90],['same90earlier',DAY,720,DAY+' 10:30 KST',90],['same91',DAY,720,DAY+' 13:31 KST',91],
 ['midnight60','2026-10-11',30,DAY+' 23:30 KST',60],['previous1440',DAY,720,'2026-10-09 12:00 KST',1440],['next1440',DAY,720,'2026-10-11 12:00 KST',1440],
 ['monthEnd','2026-11-01',30,'2026-10-31 23:30 KST',60],['yearEnd','2027-01-01',30,'2026-12-31 23:30 KST',60],
 ['commonFebEnd','2027-03-01',30,'2027-02-28 23:30 KST',60],['leapDay','2028-02-29',30,'2028-02-28 23:30 KST',60],['leapMarch','2028-03-01',30,'2028-02-29 23:30 KST',60],
 ['invalidCommonLeap','2027-03-01',30,'2027-02-29 23:30 KST',null],['invalidApril31','2026-05-01',30,'2026-04-31 23:30 KST',null],
 ['ISO',DAY,720,DAY+'T12:00:00+09:00',0],['ISOmillisecondsZero',DAY,720,DAY+'T12:00:00.000+09:00',0],['ISOsecondsNonzero',DAY,720,DAY+'T12:00:01+09:00',null],
 ['noZone',DAY,720,DAY+' 12:00',null],['UTC',DAY,720,DAY+'T03:00:00Z',null],['invalidTime24',DAY,720,DAY+' 24:00 KST',null],['invalidMinute60',DAY,720,DAY+' 12:60 KST',null],
 ['invalidTideDate','2026-02-30',720,DAY+' 12:00 KST',null],['negativeMinute',DAY,-1,DAY+' 12:00 KST',null],['minute1440',DAY,1440,DAY+' 12:00 KST',null]])time(id,{date,minutes:minute},text,expected);
for(const interval of [3,6,24])for(const [delta,time] of [[90,'13:30'],[91,'13:31'],[120,'14:00']]){const st=state(tideSite,[sample(92,{},DAY,time)]);st.week.generatedAt=DAY+' 10:30 KST';st.week.sampleIntervalHours=interval;check('valid-week-interval'+interval+'-gap'+delta,st,tideSite,delta<=90);}
for(const [label,extra] of [['previous_1440',{forecastTime:'2026-10-09 12:00 KST'}],['next_1440',{forecastTime:'2026-10-11 12:00 KST'}],['missing_time',{forecastTime:undefined}],['delayed_generation',{generatedAt:DAY+' 05:41 KST'}],['future_generation',{generatedAt:DAY+' 12:30 KST'}],['missing_generation',{generatedAt:undefined}]])for(const s of [general,tideSite]){const st=state(s,null,{today:{date:DAY,sites:{[s.id]:today(92,{generatedAt:DAY+' 10:30 KST',...extra})}}});check('C-known-reference-excluded-'+label+'-'+s.id,st,s,false);}
const fillSites=Array.from({length:13},(_,i)=>({...general,id:600+i,name:'C synthetic '+i,env:i<5?'농경지':i<9?'갯벌':'습지'})),badFill=new Set([600,601,606]);
const fillWeek={startDate:DAY,endDate:DAY2,generatedAt:DAY+' 10:30 KST',sampleIntervalHours:3,sites:Object.fromEntries(fillSites.map(s=>[s.id,{days:{[DAY]:{samples:[sample(badFill.has(s.id)?99:80,badFill.has(s.id)?{forecastTime:DAY+' 12:00 bananas'}:{})]}}}]))};
const fillInput=state(general,null,{sites:fillSites,week:fillWeek,today:null,notices:[{published:true,title:'synthetic C source notice',siteIds:[...badFill]}],sightings:Object.fromEntries([...badFill].map(id=>[id,{latestDate:DAY,species:['A','B','C','D']}]))});
const fillApi=make(fillInput,TEST_NOW),fillTop=fillApi.todayRecommendedSites();
const fillRoute={mode:'actual candidate/final quorum mandatory paths, no selector patch',expectedNoUnparsedSource:true,topIds:fillTop.map(e=>String(e.site.id)),unparsedBadIds:fillTop.filter(e=>badFill.has(Number(e.site.id))).map(e=>String(e.site.id)),actual:fillTop.map(e=>({id:String(e.site.id),raw:e.score,rank:fillApi.weeklyRankScore(e),mandatory:e.isMandatory,forecast:e.today.forecastTime,strictTimestamp:fillApi.weeklyForecastTimestamp(e.today.forecastTime),state:e.today._weatherState})),pass:!fillTop.some(e=>badFill.has(Number(e.site.id)))};
const sourceReport={head:HEAD,before:'e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6',clock:TEST_NOW,fillRoute,mode:'Actual latest Git functions no guard patch; synthetic source metadata only.',rows,sourceCases:rows.length,sourceMismatchCount:rows.filter(r=>!r.contractPass).length,sourceMismatches:rows.filter(r=>!r.contractPass),coreContractRows:rows.filter(r=>!r.id.startsWith('week-range-missing-start-')),schemaDiagnosticRows:rows.filter(r=>r.id.startsWith('week-range-missing-start-')),timeRows,timeCases:timeRows.length,timePass:timeRows.filter(r=>r.pass).length,limits:['Missing startDate is schema completeness diagnostic, not a new user-approved age cutoff.','Week generatedAt is publication metadata; no invented maximum age or today schedule reuse is imposed on normal weekly forecasts.','No malformed operating file or production incident was observed.','Malformed highest fallback fixtures preserve a normal score80 alternative; only source timestamp of score99 is changed.']};
fs.writeFileSync(path.join(out,'c_temporal_source_actual.json'),JSON.stringify(sourceReport,null,2)+'\n');console.log(JSON.stringify({head:HEAD,timeCases:sourceReport.timeCases,timePass:sourceReport.timePass,sourceCases:sourceReport.sourceCases,mismatches:sourceReport.sourceMismatches.map(r=>({id:r.id,candidate:r.candidate,score:r.score,rank:r.rank,forecast:r.entryForecast,strictForecastParsed:r.strictForecastParsed,state:r.entryState}))},null,2));
