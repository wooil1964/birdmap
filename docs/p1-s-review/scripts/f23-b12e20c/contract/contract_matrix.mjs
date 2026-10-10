import {fs,path,sha,source,html,HEAD,MAIN,make,state,sample,today,compact,general,tideSite,islandSite,boatSite,DAY,rt} from './contract_common.mjs';
const out=process.argv[3],NOW='2026-10-10T11:00:00+09:00',stamp=DAY+' 10:50 KST',rows=[],typed=[],parser=[];
const values=[['normal',stamp],['old',DAY+' 10:30 KST'],['new',DAY+' 10:55 KST'],['missing',undefined],['null',null],['empty',''],['array',[stamp]],['object',{toString:'not-callable'}],['number',1791601200000],['boolean',true]];
const transport=x=>JSON.parse(JSON.stringify(x));
function audit(id,st,s,expected,raw){let actual,error=null,resolved,candidateError=null,finalError=null,sourceError=null;const api=make(transport(st),NOW);try{actual=compact(api,s);}catch(e){error=e.name+': '+e.message;}
try{api.weeklyRecommendationForSite(s,api.weeklyInfo());}catch(e){candidateError=e.name+': '+e.message;}
try{api.todayRecommendedSites();}catch(e){finalError=e.name+': '+e.message;}
try{resolved=api.weatherTodayForSite(s);}catch(e){sourceError=e.name+': '+e.message;}
return {id,expected,actual,error,candidateError,finalError,sourceError,raw,sourceState:resolved?._weatherState??null,scoreAllowed:resolved?._weatherState?.scoreEligible??false,pass:!error&&Object.entries(expected).every(([k,v])=>JSON.stringify(actual[k])===JSON.stringify(v))};}
for(const [route,s] of [['general',general],['tide',tideSite],['island',islandSite]])for(const side of ['root','item'])for(const [label,value] of values){
const raw=today(92,{generatedAt:stamp});const doc={date:DAY,generatedAt:stamp,updated:stamp,sites:{[s.id]:raw}};
if(side==='root'){if(value===undefined)delete doc.generatedAt;else doc.generatedAt=value;}else{if(value===undefined)delete raw.generatedAt;else raw.generatedAt=value;}
rows.push(audit('F2-'+route+'-'+side+'-'+label,state(s,null,{today:doc}),s,{candidate:label==='normal',topIds:label==='normal'?[String(s.id)]:[]},{side,label,value:value===undefined?'ABSENT':value}));
}
const types=[['string',x=>x],['array',x=>[x]],['object',()=>({toString:'not-callable'})],['number',()=>1791601200000],['boolean',()=>true],['null',()=>null],['ISO',x=>x.replace(' ','T').replace(' KST',':00+09:00')]];
for(const [label,fn] of types){const value=transport(fn(DAY+' 12:00 KST')),api=make(state(general,[sample()]),NOW);let parsed,weather,error=null;try{parsed=api.weeklyForecastTimestamp(value);weather=api.weatherTimeMs(value);}catch(e){error=e.name+': '+e.message;}
parser.push({label,value,parsed:parsed??null,weatherFinite:Number.isFinite(weather),error,pass:!error&&((label==='string'||label==='ISO')?Number.isFinite(parsed)&&Number.isFinite(weather):parsed===null&&!Number.isFinite(weather))});}
for(const [route,s] of [['general',general],['tide',tideSite],['island',islandSite],['boat',boatSite]])for(const field of ['publication','forecast'])for(const [label,fn] of types){
const st=state(s,[sample(99),sample(80,{},DAY,'13:00')]);st.week.generatedAt=stamp;
if(field==='publication')st.week.generatedAt=fn(stamp);else st.week.sites[s.id].days[DAY].samples[0].forecastTime=fn(DAY+' 12:00 KST');
const valid=label==='string'||label==='ISO',expected=valid?{candidate:true,score:99,rank:115}:field==='publication'?{candidate:false,topIds:[]}:{candidate:true,score:80,rank:96};
typed.push(audit('F3-'+route+'-'+field+'-'+label,st,s,expected,{field,label,source:field==='publication'?st.week.generatedAt:st.week.sites[s.id].days[DAY].samples[0].forecastTime}));
}
for(const field of ['publication-root','publication-item','forecast'])for(const [label,fn] of types){
const raw=today(99,{generatedAt:stamp});const doc={date:DAY,generatedAt:stamp,updated:stamp,sites:{[general.id]:raw}};
if(field==='publication-root')doc.generatedAt=fn(stamp);else if(field==='publication-item')raw.generatedAt=fn(stamp);else raw.forecastTime=fn(DAY+' 12:00 KST');
const valid=label==='string'||label==='ISO';typed.push(audit('F3-today-'+field+'-'+label,state(general,null,{today:doc}),general,valid?{candidate:true,score:99,rank:115}:{candidate:false,topIds:[]},{field,label,value:field==='publication-root'?doc.generatedAt:field==='publication-item'?raw.generatedAt:raw.forecastTime}));
}
// Actual live merge function and freshness helpers; only DOM sinks and interpretation output are mocked.
const liveNames=['applyLiveWeatherToPopup','liveWeatherResponseCurrent','liveWeatherComponents','liveWeatherUsableNumber','liveWeatherNumber','liveWeatherRepresentativeText','liveWeatherSky','liveWeatherPrecipitationText'];
const liveConstants=[...html.matchAll(/var LIVE_WEATHER_(?:CACHE_TTL_MS|REQUEST_TIMEOUT_MS)=.*?;/g)].map(x=>x[0]).join('\n')+'\n'+html.match(/var LIVE_WEATHER_VALUE_RANGES=\{[\s\S]*?\};/)[0];
const liveFactory=new Function('ctx','Date',liveConstants+'\n'+liveNames.map(source).join('\n')+`\nvar fields={},captured=null;function liveWeatherCurrentPopup(){return {};}function setLiveWeatherField(c,k,v){fields[k]=v;return !!v;}function setLiveWeatherMissing(){}function applyLiveTomorrow(){}function v24BriefingInterpretation(s,m){captured=m;return 'capture';}function tideTodayForSite(){return null;}var weatherTimeMs=ctx.api.weatherTimeMs,weatherTodayForSite=ctx.api.weatherTodayForSite,v251ScoreDisplayText=ctx.api.v251ScoreDisplayText;return {applyLiveWeatherToPopup,result:()=>({fields,captured})};`);
const Clock=class extends Date{constructor(...a){super(...(a.length?a:[NOW]));}static now(){return new Date(NOW).getTime();}};
const liveRows=[];
for(const [label,fields] of [['normal',{}],['stale',{stale:true,scoreEligible:false}],['mismatch',{generatedAt:DAY+' 10:30 KST'}],['missing',{generatedAt:undefined}],['null',{generatedAt:null}],['empty',{generatedAt:''}]]){
const raw=today(92,{generatedAt:stamp,...fields}),st=state(general,null,{today:{date:DAY,generatedAt:stamp,sites:{[general.id]:raw}}}),api=make(transport(st),NOW),before=transport(raw),live=liveFactory({api},Clock);
const data={ok:true,siteId:general.id,generatedAt:DAY+' 10:59 KST',stale:false,observation:{dataTime:DAY+' 10:00 KST',temperature:21,windSpeed:2,windDirectionDegrees:0,windDirection:'북풍',rain:0,humidity:55,weatherText:'맑음'},forecast:{}};
let applied,error=null;try{applied=live.applyLiveWeatherToPopup(general,{update(){}},data,false);}catch(e){error=e.name+': '+e.message;}
const result=live.result();liveRows.push({label,error,applied,sourceUnchanged:JSON.stringify(before)===JSON.stringify(transport(raw)),mergedEligible:result.captured?._weatherState?.scoreEligible??null,mergedGeneration:result.captured?.generatedAt??null,scoreDisplay:result.fields.score??null,expectedEligible:label==='normal',pass:!error&&applied&&result.captured?._weatherState?.scoreEligible===(label==='normal')});
}
const combined=path.resolve(process.argv[5]||''),current=[];
if(combined){const data=JSON.parse(fs.readFileSync(path.join(combined,'weather_today.json'),'utf8')),ClockNow=new Date().toISOString(),a=make({today:data,week:null},ClockNow);for(const s of rt.sites){const d=data.sites[String(s.id)],r=a.weatherTodayForSite(s);current.push({id:String(s.id),rawEligible:d.scoreEligible,rootItemEqual:d.generatedAt===data.generatedAt,sourceCurrent:r?._weatherState?.dataCurrent??false,sourceEligible:r?._weatherState?.scoreEligible??false,sourceKind:r?._weatherState?.kind??null});}}
const report={head:HEAD,main:MAIN,clock:NOW,sourceSHA256:sha(html),mode:'Exact Git-extracted functions; JSON-roundtripped raw input; no product guard patch. No coordinates logged.',f2:{cases:rows.length,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows},f3:{parser,typed,cases:typed.length,pass:typed.filter(x=>x.pass).length,fail:typed.filter(x=>!x.pass).length,exceptionCount:typed.filter(x=>x.error).length},liveMerge:{cases:liveRows.length,pass:liveRows.filter(x=>x.pass).length,fail:liveRows.filter(x=>!x.pass).length,rows:liveRows},latestMain:{actualCurrentClock:new Date().toISOString(),count:current.length,rootItemEqualCount:current.filter(x=>x.rootItemEqual).length,rawEligibleCount:current.filter(x=>x.rawEligible).length,sourceEligibleCount:current.filter(x=>x.sourceEligible).length,rows:current}};
fs.writeFileSync(path.join(out,'contract_matrix.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({f2:{cases:rows.length,pass:report.f2.pass,fail:report.f2.fail,failIds:rows.filter(x=>!x.pass).map(x=>x.id)},f3:{cases:typed.length,pass:report.f3.pass,fail:report.f3.fail,exceptions:report.f3.exceptionCount,failIds:typed.filter(x=>!x.pass).map(x=>x.id)},live:liveRows,latestMain:{count:current.length,rootItemEqual:report.latestMain.rootItemEqualCount,rawEligible:report.latestMain.rawEligibleCount,sourceEligible:report.latestMain.sourceEligibleCount}},null,2));
if(report.f2.fail||report.f3.fail||report.liveMerge.fail)process.exitCode=1;
