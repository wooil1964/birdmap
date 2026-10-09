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
const BEFORE='35141c04d4fd152982b1f4683d5b7a6f4f7514e5',MAIN='38b45299c832b8ab8ad549762c02979fa8ddfb28',HEAD='7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e';
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
const extras=['monthTideForSite','todayKstMonth','weatherScoreAllowed','storedWeatherState','weatherTimeMs','weatherLatestDue','v251EffectiveScore','v251GradeStars','v251ScoreDisplayText','todayWeatherFromWeek','weatherTodayForSite','weeklyScoreValid','weeklyNonNegativeNumber','weeklySampleRecommendable','weeklyTodayRecommendable'];
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
 return {rev,sites,htmlSHA256:hash(bytes),functionsSHA256:hash(functions),api:(recent,override={})=>factory({...data,sites,recent,...override},Clock)};
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
 return {withReports,siteCount:all.length,candidateCount:candidates.length,safeCandidateCount:safe.length,unsafeIds:candidates.filter(x=>x.gate===false).map(x=>x.siteId),unknownSafetyIds:candidates.filter(x=>x.gate!==true&&x.gate!==false).map(x=>x.siteId),independentSelectorMatches:true,top:top.map((e,i)=>({position:i+1,...compact(e,api)})),all190:all.map(x=>({id:x.siteId,candidate:!!x.entry,fullEntrySHA256:hash(signature(x.entry)),...(x.entry?compact(x.entry,api):{gate:null})})),full190SignatureSHA256:hash(signature(all.map(x=>({id:x.siteId,entry:x.entry,gate:x.gate}))))};
}
const runtimes=[runtime(BEFORE),runtime(MAIN),runtime(HEAD)];
for(const rt of runtimes)assert.equal(signature(rt.sites),signature(runtimes[0].sites),'190 site array changed '+rt.rev);
const normal=runtimes.map(rt=>({rev:rt.rev,htmlSHA256:rt.htmlSHA256,functionsSHA256:rt.functionsSHA256,siteDataSHA256:hash(signature(rt.sites)),coordinateVectorSHA256:hash(signature(rt.sites.map(s=>({id:s.id,lat:s.lat,lon:s.lon})))),reportsOn:run(rt,true),reportsOff:run(rt,false)}));
const differences=[];
for(const flag of ['reportsOn','reportsOff'])for(const version of normal.slice(1)){
 const before=normal[0][flag],after=version[flag];
 const changed=before.all190.filter((row,i)=>signature(row)!==signature(after.all190[i])).map(row=>row.id);
 const topChanged=signature(before.top)!==signature(after.top);
 differences.push({before:BEFORE,after:version.rev,condition:flag,changedSiteIds:changed,topChanged,full190SignatureEqual:before.full190SignatureSHA256===after.full190SignatureSHA256});
 assert.equal(changed.length,0,'normal input candidate rows changed');assert.equal(topChanged,false,'normal top changed');
}
const broken=structuredClone(data.week);
for(const id of Object.keys(sightings))for(const day of Object.values(broken.sites[id]?.days||{}))for(const sample of day.samples||[])if(sample.scoreEligible===true)sample.score=null;
const synthetic=runtimes.map(rt=>({rev:rt.rev,reportsOn:run(rt,true,{week:broken})}));
const s1=[];
for(const rev of [BEFORE,HEAD]){
 const raw=blob(rev,'reports-api/src/shared.js');const module=await import('data:text/javascript;base64,'+raw.toString('base64'));
 const rows=reports.sites.map(s=>({id:String(s.siteId),literalSpeciesCount:s.species.length,classifiedSensitive:module.isSensitiveReport({species:s.species,speciesText:s.species.join(' · '),note:''})}));
 s1.push({rev,sharedSHA256:hash(raw),testedAlreadyPublicAggregateSites:rows.length,literalSpeciesCount:rows.reduce((n,x)=>n+x.literalSpeciesCount,0),classifiedSensitiveIds:rows.filter(x=>x.classifiedSensitive).map(x=>x.id),rows});
}
const result={schemaVersion:1,scope:'Actual extracted product functions, immutable fixed inputs, all 190 site/candidate results. No operating API or raw/private report rows read. S1 classifier on already-public aggregation is separate from S2 full pipeline.',codeBefore:BEFORE,latestMain:MAIN,prHead:HEAD,evaluationTime:NOW,manifestSHA256:hash(fs.readFileSync(path.join(ANALYSIS,'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json'))),reportSHA256:hash(reportBytes),inputFiles:manifest.files.map(f=>({path:f.path,sha256:f.sha256})),normal,differences,synthetic,s1SnapshotClassifier:s1,limitations:['Public aggregate snapshot lacks source row notes, observed dates per species, approval and location flags, row-to-site provenance. Whole API aggregation effects cannot be inferred by fabricating those private rows.','Synthetic null-score replay is a separate input and is never mixed with normal fixture results.','Candidate objects have coordinates only inside hashed signatures; output does not disclose coordinate vectors.','This isolated JavaScript replay does not verify browser rendering or live network behavior.']};
fs.writeFileSync(path.join(OUT,'independent_replay.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({normal:normal.map(v=>({rev:v.rev,onCandidates:v.reportsOn.candidateCount,offCandidates:v.reportsOff.candidateCount,onTopIds:v.reportsOn.top.map(x=>x.id),offTopIds:v.reportsOff.top.map(x=>x.id),independentSelectorMatches:v.reportsOn.independentSelectorMatches&&v.reportsOff.independentSelectorMatches})),differences,synthetic:synthetic.map(v=>({rev:v.rev,candidates:v.reportsOn.candidateCount,zeroScoreIds:v.reportsOn.all190.filter(x=>x.raw===0).map(x=>x.id),top:v.reportsOn.top.map(x=>x.id)})),s1SnapshotClassifier:s1.map(x=>({rev:x.rev,sites:x.testedAlreadyPublicAggregateSites,literalSpeciesCount:x.literalSpeciesCount,classifiedSensitiveIds:x.classifiedSensitiveIds}))},null,2));