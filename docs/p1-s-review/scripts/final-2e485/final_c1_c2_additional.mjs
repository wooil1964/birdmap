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

/* Independent new C1/C2 assertions beyond the saved74 core contract. */
const TEST_NOW='2026-10-10T11:00:00+09:00',rows=[];
const routes=[['general',general],['tide',tideSite],['island',islandSite],['boat',boatSite]];
function record(id,st,s,expected){
 const api=make(st,TEST_NOW),entry=api.weeklyRecommendationForSite(s,api.weeklyInfo()),actual=compact(api,s);
 const a={...actual,docVerified:api.weeklyDocVerified(),weeklySitePresent:!!api.weeklyWeekSite(s),source:entry?.today?._weatherState?.kind??null,fore:entry?.today?.forecastTime??null};
 const pass=Object.entries(expected).every(([k,v])=>JSON.stringify(a[k])===JSON.stringify(v));
 rows.push({id,expected,actual:a,pass});return api;
}
const malformed=[['nozone',DAY+' 12:00'],['UTC',DAY+' 12:00 UTC'],['suffix',DAY+' 12:00 bananas'],['minute60',DAY+' 12:60 KST'],['trailing',DAY+' 12:00 KST junk']];
for(const [kind,s] of routes){
 for(const [name,text] of malformed){
  const st=state(s,[sample(99,{forecastTime:text}),sample(80,{},DAY,'13:00')]);st.week.generatedAt=DAY+' 10:30 KST';
  record('C2-rank96-'+kind+'-'+name,st,s,{candidate:true,score:80,rank:96,bonus:16,mandatory:true,popupScore:80,source:'week_forecast',fore:DAY+' 13:00 KST',safe:true});
  const alone=state(s,[sample(99,{forecastTime:text})]);alone.week.generatedAt=DAY+' 10:30 KST';
  record('C2-no-valid-alternative-'+kind+'-'+name,alone,s,{candidate:false,score:null,rank:null,topIds:[]});
 }
 for(const [name,value] of [['missing',undefined],['null',null],['bad','not-a-time'],['future',DAY+' 12:30 KST'],['site-unavailable',DAY+' 10:30 KST']]){
  const st=state(s,[sample(99)]);st.week.generatedAt=value;
  if(name==='site-unavailable')st.week.sites[s.id].dataUnavailable=true;
  st.today={date:DAY,generatedAt:DAY+' 10:30 KST',sites:{[s.id]:today(80,{generatedAt:DAY+' 10:30 KST'})}};
  record('C1-unverified-week-normal-today-'+kind+'-'+name,st,s,kind==='boat'?{candidate:false,rank:null,topIds:[]}:{candidate:true,score:80,rank:96,popupScore:80,source:'today_saved',fore:DAY+' 12:00 KST'});
 }
 const rawfalse=state(s,[sample(null,{scoreEligible:false,missingScoreFields:['windSpeed']})]);rawfalse.week.generatedAt=DAY+' 10:30 KST';
 rawfalse.today={date:DAY,generatedAt:DAY+' 10:30 KST',sites:{[s.id]:today(80,{generatedAt:DAY+' 10:30 KST'})}};
 record('verified-week-raw-scoreEligible-false-'+kind,rawfalse,s,{docVerified:true,weeklySitePresent:true,candidate:false,rank:null,topIds:[]});
 for(const value of [0,92,92.5,100]){
  const st=state(s,[sample(value,{},DAY,'13:00')]);st.week.generatedAt=DAY+' 10:30 KST';
  record('normal-raw-score-'+kind+'-'+value,st,s,{candidate:true,score:value,rank:value+16,bonus:16,popupScore:value,source:'week_forecast',safe:true});
 }
}
const numeric=[];
const numericCases=[
 ['score-null','score',null,false],['score-string','score','92',false],['score-bool','score',true,false],['score-negative','score',-1,false],['score-above100','score',101,false],
 ['wind-null','windSpeed',null,false],['wind-string','windSpeed','3',false],['wind-negative','windSpeed',-1,false],['wind-bool','windSpeed',true,false],
 ['direction-null','windDirectionDeg',null,false],['direction360','windDirectionDeg',360,false],['rain-null','precipitation3h',null,false],['rain-string','precipitation3h','0',false],
 ['eligible-false','scoreEligible',false,false],['eligible-null','scoreEligible',null,false],['eligible-number','scoreEligible',1,false],
 ['reasons-null','missingScoreFields',null,false],['reasons-string','missingScoreFields','',false],['reasons-nonempty','missingScoreFields',['rain'],false],
 ['wave-null','waveM',null,null],['wave-string','waveM','0.3',false],['wave-negative','waveM',-1,false],['wave-bool','waveM',true,false]];
for(const [kind,s] of routes)for(const [name,field,value,expected] of numericCases){
 const st=state(s,[sample(92,{[field]:value})]);st.week.generatedAt=DAY+' 10:30 KST';const api=make(st,TEST_NOW);
 const want=expected===null?kind==='general'||kind==='tide':expected;
 numeric.push({id:kind+'-'+name,siteId:String(s.id),kind,field,value,expectedRecommendable:want,actualRecommendable:api.weeklySampleRecommendable(s,st.week.sites[s.id].days[DAY].samples[0]),sample:st.week.sites[s.id].days[DAY].samples[0]});
}
for(const r of numeric)r.pass=r.actualRecommendable===r.expectedRecommendable;
const builder=JSON.parse(fs.readFileSync(path.join(out,'normal_current_builder_today.json'),'utf8'));
const builderRows=[];
for(const [kind,s] of routes.filter(([kind])=>kind!=='general')){
 const raw=builder.sites[String(s.id)],st=state(s,null,{today:builder}),api=make(st,TEST_NOW),actual=compact(api,s),resolved=api.weatherTodayForSite(s);
 builderRows.push({kind,siteId:String(s.id),rawScore:raw.score,rawEligible:raw.scoreEligible,source:resolved._weatherState,actual,pass:raw.scoreEligible===true&&resolved._weatherState.scoreEligible===true&&(kind==='boat'?!actual.candidate:actual.candidate&&actual.score===raw.score)});
}
const report={head:HEAD,before:'352315a57d038687807dbe0044c136a22fb0c9c5',clock:TEST_NOW,sourceSHA256:sha(html),mode:'Actual Git functions with no product guard patch; synthetic C1/C2 inputs. Python build_site_result output is loaded without score edits.',rows,passed:rows.filter(r=>r.pass).length,total:rows.length,numeric,numericPassed:numeric.filter(r=>r.pass).length,numericTotal:numeric.length,builderRows,builderPass:builderRows.filter(r=>r.pass).length,limits:['Known unverified week document/site falls back to verified today for land/tide/island; pelagic requires week samples by unchanged safety policy.','Verified week site with only raw scoreEligible=false cannot be promoted using today; distinct from docVerified=false.','Python validator may accept stored ineligible null score while JavaScript correctly excludes recommendation; storage validity and recommendation eligibility differ.','No original coordinates are serialized.']};
fs.writeFileSync(path.join(out,'final_c1_c2_additional.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({head:HEAD,passed:report.passed,total:report.total,failed:rows.filter(r=>!r.pass),numericPassed:report.numericPassed,numericTotal:report.numericTotal,numericFailed:numeric.filter(r=>!r.pass),builderRows},null,2));
assert.equal(report.passed,report.total);assert.equal(report.numericPassed,report.numericTotal);assert.equal(report.builderPass,builderRows.length);

