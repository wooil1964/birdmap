import {fs,path,sha,html,HEAD,make,state,sample,today,compact,general,tideSite,DAY} from './contract_before.mjs';
const rows=[],clock=DAY+'T11:00:00+09:00',stamp=DAY+' 10:50 KST';
for(const [label,value] of [['missing',undefined],['null',null],['empty','']]){
const raw=today(92,{generatedAt:stamp});if(value===undefined)delete raw.generatedAt;else raw.generatedAt=value;const api=make(JSON.parse(JSON.stringify(state(tideSite,null,{today:{date:DAY,generatedAt:stamp,sites:{14:raw}}}))),clock);rows.push({id:'before-F2-item-'+label,actual:compact(api,tideSite)});
}
const bad=today(99,{generatedAt:stamp,forecastTime:{toString:'not-callable'}}),api=make(state(general,null,{today:{date:DAY,generatedAt:stamp,sites:{[general.id]:bad}}}),clock);let candidateError=null,finalError=null;
try{api.weeklyRecommendationForSite(general,api.weeklyInfo());}catch(e){candidateError=e.name+': '+e.message;}
try{api.todayRecommendedSites();}catch(e){finalError=e.name+': '+e.message;}
rows.push({id:'before-F3-today-forecast-object',candidateError,finalError});
const st=state(tideSite,[sample(99,{forecastTime:[DAY+' 12:00 KST']}),sample(80,{},DAY,'13:00')]);st.week.generatedAt=stamp;rows.push({id:'before-F3-week-forecast-array',actual:compact(make(st,clock),tideSite)});
const report={head:HEAD,sourceSHA256:sha(html),actualBeforeFunctions:true,rows,limits:'No assertion relaxed. Historical source is exact before SHA; synthetic input is identical to new cases.'};fs.writeFileSync(path.join(process.argv[3],'historical_contract.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
