/* P1-B independent read-only selector audit; outputs stdout only. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const HERE=path.dirname(fileURLToPath(import.meta.url));
// Intended location: docs/recommendation-masterplan/_scripts/.
const ROOT=path.resolve(HERE,'../../..');
const OLD='1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25',NEW='35141c0';
const NOW='2026-10-08T22:40:00+09:00';
const blob=(pin,p)=>execFileSync('git',['show',pin+':'+p],{cwd:ROOT,maxBuffer:1<<28});
const hash=b=>createHash('sha256').update(b).digest('hex');
const helper=blob(OLD,'.github/scripts/test_weekly_recommendation.mjs').toString('utf8');
const prefix=helper.slice(0,helper.indexOf('const SITE =')).replace(/^import .*;\r?\n/gm,'')
 .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');",'const ROOT = REVIEW_ROOT;');
const extra=['monthTideForSite','todayKstMonth','v251EffectiveScore','weatherScoreAllowed','weatherTimeMs','weatherLatestDue','storedWeatherState','todayWeatherFromWeek','weatherTodayForSite'];
const {loadApi,RUNTIME}=vm.runInNewContext(prefix+'\nfor(const n of EXTRA_NAMES)if(!NAMES.includes(n))NAMES.push(n);\n({loadApi,RUNTIME})',{
 REVIEW_ROOT:ROOT,EXTRA_NAMES:extra,readFileSync:p=>blob(OLD,path.relative(ROOT,p).replaceAll('\\','/')).toString('utf8'),dirname:path.dirname,join:path.join,vm,assert,fileURLToPath,execFileSync:()=>{throw Error('Unexpected subprocess');}});
assert.equal(hash(blob(OLD,'index.html')),hash(blob(NEW,'index.html')));
assert.deepEqual(execFileSync('git',['diff','--name-only',OLD,NEW],{cwd:ROOT,encoding:'utf8'}).trim().split(/\r?\n/),['weather_today.json','weather_week.json']);
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/recommendation-masterplan/_snapshots/input_manifest.json')));
const reportBytes=fs.readFileSync(path.join(ROOT,manifest.recentSites.path));assert.equal(hash(reportBytes),manifest.recentSites.sha256);
const sightings=Object.fromEntries(JSON.parse(reportBytes).sites.map(s=>[String(s.siteId),{latestDate:s.latestDate,species:s.species}]));
const json=(pin,p)=>JSON.parse(blob(pin,p).toString('utf8'));
const common={now:NOW,month:10,weatherWeek:null,weatherToday:null,tideMonth:json(OLD,'tide_month.json'),notices:json(OLD,'notices.json'),rules:json(OLD,'weather_rules.json')};
const makeApi=(pin,reports,sites=RUNTIME)=>loadApi({...common,siteData:sites,weatherWeek:json(pin,'weather_week.json'),weatherToday:json(pin,'weather_today.json'),recentSiteSightings:reports?sightings:{}});
const core=new Set([7,8,10,15,20]);
const rank=e=>Number.isFinite(e.rankScore)?e.rankScore:Number.isFinite(e.score)?e.score:-Infinity;
const recent=e=>[e.recentReport?e.recentReport.ageDays:Infinity,-(e.recentReport?e.recentReport.speciesCount:0)];
const tuple=(e,phase)=>phase==='field'?[-rank(e),...recent(e),-Number(core.has(Number(e.site.id))),e.recommendationDate||'9999']:
 phase==='pelagic'?[-rank(e),...recent(e),String(e.recommendationDate)]:
 phase==='fill'?[-rank(e),e.priority,...recent(e),-(e.sortLevel||0)]:[e.priority,-rank(e),...recent(e),-(e.sortLevel||0)];
const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;if(typeof a[i]==='string')return a[i].localeCompare(b[i]);return a[i]<b[i]?-1:1;}return 0;};
const cmp=(phase)=>(a,b)=>compare(tuple(a,phase),tuple(b,phase))||a.stableOrder-b.stableOrder||Number(a.site.id)-Number(b.site.id);
const canonical=e=>common.rules.aliases?.[e.site.weatherRuleKey]||e.site.weatherRuleKey;
const knownLower=value=>typeof value==='number'&&Number.isFinite(value)?value:Infinity;
const altConditions=e=>[e.recommendationDate||'9999',e.recommendationTime||'99:99',knownLower(e.sample?.precipitation3h),knownLower(e.sample?.gust),knownLower(e.sample?.windSpeed),Number(e.site.id)];
function independentlySelect(rows,mode='original'){
 const selected=[],used=new Set();let pelagic=0;const quota=rows.filter(e=>!e.season||e.season==='autumn');
 const phases=[['field',4,e=>e.axes.field&&!e.axes.pelagic],['mudflat',3,e=>e.axes.mudflat&&!e.axes.pelagic],
  ['pelagic',1,e=>e.axes.pelagic],['other',2,e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic],['fill',10,()=>true]];
 const trace=[];
 for(const [phase,limit,filter] of phases){
  const last=mode==='original'?(a,b)=>a.stableOrder-b.stableOrder||Number(a.site.id)-Number(b.site.id):
   mode==='conditions'?(a,b)=>compare(altConditions(a),altConditions(b)):(a,b)=>Number(a.site.id)-Number(b.site.id);
  const candidates=(phase==='fill'?rows:quota).filter(filter).slice().sort((a,b)=>compare(tuple(a,phase),tuple(b,phase))||last(a,b));
  const available=candidates.filter(e=>!used.has(String(e.site.id))&&(!e.axes.pelagic||pelagic<1));
  const groups=new Map();for(const e of available){const key=JSON.stringify(tuple(e,phase),(_k,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(String(e.site.id));}
  trace.push({phase,limit,available:available.length,nonSingletonTies:[...groups].filter(([,ids])=>ids.length>1).map(([key,ids])=>({key,ids}))});
  let added=0,remaining=candidates.slice();
  while(remaining.length&&selected.length<10&&added<limit){
   remaining=remaining.filter(e=>!used.has(String(e.site.id))&&(!e.axes.pelagic||pelagic<1));if(!remaining.length)break;
   let e=remaining[0];
   if(mode==='diversity'){
    const tied=remaining.filter(x=>compare(tuple(x,phase),tuple(e,phase))===0);
    const regions=count(selected.map(x=>x.site.sido)),types=count(selected.map(canonical));
    tied.sort((a,b)=>(regions[a.site.sido]||0)-(regions[b.site.sido]||0)||(types[canonical(a)]||0)-(types[canonical(b)]||0)||Number(a.site.id)-Number(b.site.id));e=tied[0];
   }
   used.add(String(e.site.id));if(e.axes.pelagic)pelagic++;selected.push({...e,selectedAxis:phase});added++;
  }
 }
 return {selected,trace};
}
const count=a=>a.reduce((o,v)=>(o[String(v)]=(o[String(v)]||0)+1,o),{});
const selectionSignature=rows=>JSON.stringify(rows.map(e=>[String(e.site.id),e.selectedAxis]));
const summarize=e=>e.map(x=>({id:String(x.site.id),name:x.site.name,axis:x.selectedAxis,rank:rank(x),raw:x.score,display:x.today?commonApi.v251EffectiveScore(x.today):null,priority:x.priority,sortLevel:x.sortLevel||0,date:x.recommendationDate,
 stableOrder:x.stableOrder,core:core.has(Number(x.site.id)),canonical:common.rules.aliases?.[x.site.weatherRuleKey]||x.site.weatherRuleKey,sido:x.site.sido,region:x.site.region}));
const commonApi=makeApi(NEW,true);
const maxRuns=Number(process.argv.find(a=>a.startsWith('--runs='))?.split('=')[1]||1000);
const seed=Number(process.argv.find(a=>a.startsWith('--seed='))?.split('=')[1]||982451653);
function xorshift32(seedValue){let s=seedValue>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function shuffle(a,rng){const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
const results=[];
for(const pin of [OLD,NEW])for(const reports of [true,false]){
 const api=makeApi(pin,reports),entries=RUNTIME.map((s,stableOrder)=>{const e=api.weeklyRecommendationForSite(s,api.weeklyInfo());return e&&api.weeklyRecommendationIsSafe(e)!==false?{...e,stableOrder}:null;}).filter(Boolean);
 const expected=api.todayRecommendedSites(),observed=independentlySelect(entries);
 assert.equal(selectionSignature(observed.selected),selectionSignature(expected));
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.equal(Math.sign(cmp('field')(entries[i],entries[j])),Math.sign(api.autumnFieldRank(entries[i],entries[j])));
 const counts=Object.fromEntries(RUNTIME.map(s=>[String(s.id),0])),rng=xorshift32(seed),selectionArrays=[];let allPipelineChecks=0;
 for(let run=0;run<maxRuns;run++){
  const order=shuffle(RUNTIME,rng),positions=new Map(order.map((s,i)=>[String(s.id),i]));
  const permuted=entries.map(e=>({...e,stableOrder:positions.get(String(e.site.id))}));
  const actual=api.autumnBalancedRecommendations(permuted),independent=independentlySelect(permuted).selected;
  assert.equal(selectionSignature(independent),selectionSignature(actual));
  for(const e of actual)counts[String(e.site.id)]++;
  selectionArrays.push(Array.from(actual,e=>String(e.site.id)));
  if(run<3){const full=makeApi(pin,reports,order).todayRecommendedSites();assert.equal(selectionSignature(full),selectionSignature(actual));allPipelineChecks++;}
 }
 results.push({pin,reports,candidateCount:entries.length,baseline:summarize(observed.selected),ties:observed.trace,
  rawDistribution:count(entries.map(e=>e.score)),rankDistribution:count(entries.map(rank)),
  candidateCanonical:count(entries.map(e=>common.rules.aliases?.[e.site.weatherRuleKey]||e.site.weatherRuleKey)),candidateSido:count(entries.map(e=>e.site.sido)),
  allPipelineChecks,runs:maxRuns,seed,prng:'xorshift32',allSelectorListsIdentical:true,selectionCount:counts,
  selectionArraysSha256:hash(JSON.stringify(selectionArrays)),selectionArrays,
  alternatives:Object.fromEntries(['id','conditions','diversity'].map(mode=>[mode,summarize(independentlySelect(entries,mode).selected)]))});
}
console.log(JSON.stringify({evaluationTime:NOW,codeUnchanged:true,changedInputPaths:['weather_today.json','weather_week.json'],reportSha256:hash(reportBytes),results},null,2));

