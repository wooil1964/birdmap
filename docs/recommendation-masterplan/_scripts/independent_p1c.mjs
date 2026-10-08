/* P1-C independent cap analysis; immutable Git inputs; stdout only; no coordinate fields. */
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
/* Independent P1-C extension: no root scenario/selector imports. */
const resultPath=path.join(ROOT,'docs/recommendation-masterplan/_results/p1c_reports.json');
const rootResults=JSON.parse(fs.readFileSync(resultPath));
const freshManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/recommendation-masterplan/_snapshots/input_manifest_35141c0_2240.json')));
for(const f of freshManifest.files)assert.equal(hash(blob(f.sourceCommit||freshManifest.codeCommit,f.path)),f.sha256,f.path);
assert.equal(rootResults.codeCommit,freshManifest.codeCommit);assert.equal(rootResults.evaluationTime,NOW);
const policies=[{id:'reports_off',reports:false},...[0,2,4,8,12,16,24].map(cap=>({id:'cap_'+cap,reports:true,cap})),
 {id:'visit_date_cap16',reports:true,cap:16,dateBasis:'visit'},{id:'latest_age7_cap16',reports:true,cap:16,maxLatestAge:7},
 {id:'recency_only_cap16',reports:true,cap:16,recencyOnly:true},{id:'cap0_without_report_tie',reports:true,cap:0,disableReportTie:true}];
const fullApi=makeApi(NEW,true),noReportApi=makeApi(NEW,false);
const base190=RUNTIME.map((s,stableOrder)=>{const e=fullApi.weeklyRecommendationForSite(s,fullApi.weeklyInfo());return e?{...e,stableOrder}:null;});
const physical=e=>{if(!e)return null;const{site,recentReport,rankScore,stableOrder,selectedAxis,...rest}=e;return JSON.stringify({id:String(site.id),...rest});};
const baselineSafe=base190.filter(e=>e&&fullApi.weeklyRecommendationIsSafe(e)!==false);
assert.equal(baselineSafe.length,176);assert.ok(baselineSafe.every(e=>fullApi.weeklyRecommendationIsSafe(e)===true));
for(let i=0;i<RUNTIME.length;i++){
 const e=noReportApi.weeklyRecommendationForSite(RUNTIME[i],noReportApi.weeklyInfo());assert.equal(physical(base190[i]),physical(e),'OFF physical '+RUNTIME[i].id);
}
const dateMs=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const[y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d);};
function independentReport(siteId,basis,policy){
 if(policy.reports===false)return null;const raw=sightings[String(siteId)];if(!raw)return null;
 const seen=dateMs(raw.latestDate),now=dateMs(basis);if(seen===null||now===null)return null;
 const age=Math.round((now-seen)/86400000);if(age<0||age>14||policy.maxLatestAge!==undefined&&age>policy.maxLatestAge)return null;
 const speciesCount=new Set(raw.species.filter(Boolean)).size;if(!speciesCount)return null;
 const recent=age<=1?12:age<=3?9:age<=7?5:2,diversity=policy.recencyOnly?0:speciesCount>=4?4:speciesCount>=2?2:0;
 return{ageDays:age,latestDate:raw.latestDate,speciesCount,bonus:Math.min(policy.cap??16,recent+diversity)};
}
function independentSelectPolicy(rows,policy,stableId){
 const selected=[],taken=new Set();let shipCount=0;
 const validSeason=rows.filter(e=>!e.season||e.season==='autumn');
 const recentTerms=e=>policy.disableReportTie?[]:recent(e);
 const keys=(e,phase)=>phase==='field'?[-rank(e),...recentTerms(e),-Number(core.has(Number(e.site.id))),e.recommendationDate||'9999']:
 phase==='pelagic'?[-rank(e),...recentTerms(e),String(e.recommendationDate)]:
 phase==='fill'?[-rank(e),e.priority,...recentTerms(e),-(e.sortLevel||0)]:[e.priority,-rank(e),...recentTerms(e),-(e.sortLevel||0)];
 const phases=[['field',4,e=>e.axes.field&&!e.axes.pelagic],['mudflat',3,e=>e.axes.mudflat&&!e.axes.pelagic],
 ['pelagic',1,e=>e.axes.pelagic],['other',2,e=>!e.axes.field&&!e.axes.mudflat&&!e.axes.pelagic],['fill',10,()=>true]];
 for(const[phase,slots,condition]of phases){
 const phaseRows=(phase==='fill'?rows:validSeason).filter(condition).slice().sort((a,b)=>compare(keys(a,phase),keys(b,phase))||
 (stableId?Number(a.site.id)-Number(b.site.id):a.stableOrder-b.stableOrder||Number(a.site.id)-Number(b.site.id)));
 let used=0;for(const e of phaseRows){if(selected.length>=10||used>=slots)break;const id=String(e.site.id);
 if(taken.has(id)||e.axes.pelagic&&shipCount>=1)continue;selected.push({...e,selectedAxis:phase});taken.add(id);used++;if(e.axes.pelagic)shipCount++;
 }
 }
 return selected;
}
const compactIndependent=e=>e.map((x,i)=>({position:i+1,id:String(x.site.id),name:x.site.name,raw:x.score,display:fullApi.v251EffectiveScore(x.today),
 rank:rank(x),bonus:x.recentReport?.bonus||0,date:x.recommendationDate,time:x.recommendationTime,axis:x.selectedAxis}));
function permutations(){let state=982451653>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 return Array.from({length:1000},()=>{const a=RUNTIME.slice();for(let i=a.length-1;i>=1;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;});}
const orders=permutations(),orderHash=hash(JSON.stringify(orders.map(o=>o.map(s=>String(s.id)))));
assert.equal(orderHash,'b26c9c0332debf07098544bbb1db54690693606c3a12803f839beaebd35f7ad4');
const reports=[];
for(const policy of policies){
 const expected=rootResults.results.find(r=>r.policy.id===policy.id);assert.ok(expected,'stored policy '+policy.id);
 const rows190=base190.map(e=>{if(!e)return null;const report=independentReport(e.site.id,policy.dateBasis==='visit'?e.recommendationDate:'2026-10-08',policy);
 const changed={...e,recentReport:report,rankScore:Number.isFinite(e.score)?e.score+(report?report.bonus:0):null};
 assert.equal(physical(e),physical(changed));return changed;});
 const rows=rows190.filter(e=>e&&fullApi.weeklyRecommendationIsSafe(e)!==false),original=independentSelectPolicy(rows,policy,false),stable=independentSelectPolicy(rows,policy,true);
 assert.deepEqual(compactIndependent(stable),expected.stableIdTop10,policy.id+' stable top10');
 assert.deepEqual(compactIndependent(original),expected.originalTop10,policy.id+' original top10');
 for(let i=0;i<RUNTIME.length;i++){
 const e=rows190[i],stored=expected.all190.find(x=>x.id===String(RUNTIME[i].id));assert.ok(stored);
 const actual={id:String(RUNTIME[i].id),candidate:!!e,gate:e?fullApi.weeklyRecommendationIsSafe(e):null,raw:e?.score??null,rank:e?rank(e):null,
 display:e?fullApi.v251EffectiveScore(e.today):null,report:e?.recentReport||null};assert.deepEqual(actual,stored,policy.id+' all190 '+actual.id);
 }
 assert.deepEqual(count(rows.map(rank)),expected.rankDistribution);
 const bonusRows=rows.filter(e=>e.recentReport).map(e=>({id:String(e.site.id),name:e.site.name,raw:e.score,rank:rank(e),display:fullApi.v251EffectiveScore(e.today),
 date:e.recommendationDate,time:e.recommendationTime,ageDays:e.recentReport.ageDays,latestDate:e.recentReport.latestDate,
 literalSpeciesCount:e.recentReport.speciesCount,bonus:e.recentReport.bonus}));
 assert.deepEqual(bonusRows.slice().sort((a,b)=>Number(a.id)-Number(b.id)),expected.bonusRows.slice().sort((a,b)=>Number(a.id)-Number(b.id)));
 const bonusTotal=bonusRows.reduce((s,e)=>s+e.bonus,0);assert.equal(bonusTotal,expected.bonusTotal);
 const originalIds=original.map(e=>String(e.site.id)),stableIds=stable.map(e=>String(e.site.id)),allIds=[],ever=new Set();let changed=0,orderChanged=0,replacements=0;
 for(const order of orders){const positions=new Map(order.map((s,i)=>[String(s.id),i]));const shuffled=rows.map(e=>({...e,stableOrder:positions.get(String(e.site.id))}));
 const chosen=independentSelectPolicy(shuffled,policy,false),ids=chosen.map(e=>String(e.site.id));allIds.push(ids);ids.forEach(id=>ever.add(id));
 const replacement=10-ids.filter(id=>originalIds.includes(id)).length;changed+=Number(replacement>0);orderChanged+=Number(ids.some((id,i)=>id!==originalIds[i]));replacements+=replacement;
 assert.deepEqual(independentSelectPolicy(shuffled,policy,true).map(e=>String(e.site.id)),stableIds);
 }
 const arr={runs:1000,membershipChangeRate:changed/1000,orderChangeRate:orderChanged/1000,meanReplaced:replacements/1000,distinctSelected:ever.size};
 for(const[k,v]of Object.entries(arr))assert.equal(v,expected.arrayControl[k],policy.id+' array '+k);
 assert.equal(hash(JSON.stringify(allIds)),expected.idsSha256,policy.id+' all1000 ordered list hash');
 reports.push({policy:policy.id,candidateCount:rows.length,all190Match:true,top10Match:true,all1000ListHashesMatch:true,stableIdAll1000Invariant:true,
 physicalSignaturesUnchanged:true,bonusTotal,rankDistribution:count(rows.map(rank)),top10:compactIndependent(stable),bonuses:bonusRows,arrayControl:arr});
}
const schemaKeys=Object.keys(JSON.parse(reportBytes));assert.deepEqual(schemaKeys.sort(),['days','ok','since','sites','today']);
const speciesDiagnostic=JSON.parse(reportBytes).sites.map(s=>{const literal=[...new Set(s.species.filter(Boolean))],groups=count(literal.map(x=>x.replace(/\s*\d+$/u,'').trim()));
 return{id:s.siteId,latestDate:s.latestDate,literalCount:literal.length,literalDuplicates:s.species.length-literal.length,numericSuffixTokens:literal.filter(x=>/\d+$/u.test(x)),
 diagnosticOnlySuffixCollapsedCount:Object.keys(groups).length,diagnosticCollisionGroups:Object.entries(groups).filter(([,n])=>n>1).map(([token,n])=>({token,strings:n}))};});
assert.deepEqual(speciesDiagnostic,rootResults.speciesAudit);
const topFor=id=>reports.find(r=>r.policy===id).top10.map(e=>e.id);assert.deepEqual(topFor('reports_off'),topFor('cap0_without_report_tie'));
assert.notDeepEqual(topFor('cap_0'),topFor('reports_off'));assert.deepEqual(topFor('cap_16'),topFor('cap_24'));
console.log(JSON.stringify({schemaVersion:1,codeCommit:freshManifest.codeCommit,evaluationTime:NOW,reportSha256:hash(reportBytes),manifestAll16HashVerified:true,
 method:'Independent original-test helper extraction from immutable Git; independently calculated site aggregate age/bonus, independent A1 prefix tuples and stage selector; no root P1-C runtime/selector imports.',
 all12PoliciesMatch:true,all190PerPolicyMatch:true,all12000PermutationListsHashesMatch:true,stableA1All12000PermutationInvariant:true,
 physicalONvsOFF190Unchanged:true,orderHash,reports,speciesDiagnostic,
 limitations:['Only site latestDate plus whole-window literal species union is available. No per-species dates, observer independence, effort, complete checklist, or row provenance.',
 'days=14 inclusive age 0 through 14 is 15 calendar bins; maxLatestAge7 cannot reconstruct an actual days=7 union.',
 'Suffix stripping is a diagnostic collision calculation, not verified taxonomy normalization; literal12 to diagnostic10 retains existing 4-species tier.',
 'No product files, production API, Worker, D1, coordinates, or P1-D analysis were changed or invoked.']},null,2));