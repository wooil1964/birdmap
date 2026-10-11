import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';
const [out,root]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex');
const newer=await import(pathToFileURL(path.join(root,'reports-api/src/shared.js')));
const oldText=execFileSync('git',['show','41650e43f80fadb2bfd9f80b18d958862f673551:reports-api/src/shared.js'],{cwd:root,encoding:'utf8'});
const older=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
const base='https://birdmap-reports.wooil-birdmap.workers.dev';
const endpoints=['/reports/approved','/reports/recent-sites?days=14','/field-updates'];
const result={startedAt:new Date().toISOString(),scope:'Current public GET only. Raw responses, species, names, IDs, notes, coordinates not saved. Aggregates only; private stored notes and omitted rows are not audited.',requests:[],operatingWrites:0,d1Queries:0,postCalls:0,rawDataSaved:false};
function classify(species,note=''){const names=Array.isArray(species)?species:[String(species||'')];const report={species:names,speciesText:names.join(','),note};return {old:older.isSensitiveReport(report),new:newer.isSensitiveReport(report)};}
for(const endpoint of endpoints){
 const response=await fetch(base+endpoint,{method:'GET',headers:{Origin:'https://wooil1964.github.io','Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
 const body=await response.text(),row={endpoint,httpStatus:response.status,bodySHA256:sha(body),bytes:Buffer.byteLength(body)};
 if(!response.ok){try{row.errorCode=JSON.parse(body).error?.code;}catch{}result.requests.push(row);continue;}
 const data=JSON.parse(body);row.ok=data.ok;row.topLevelKeys=Object.keys(data);row.generatedAt=data.generatedAt;
 let items;
 if(endpoint==='/reports/approved'){const spots=data.spots||[],histories=[...spots.flatMap(s=>s.history||[]),...Object.values(data.fixedSpots||{}).flatMap(s=>s.history||[])];const unique=[...new Map(histories.map((s,i)=>[s.id??'unknown-'+i,s])).values()];const rows=unique.length?unique:spots;row.scope='All rows observable in this approved public payload; stored private note unavailable.';row.spotCount=spots.length;row.fixedGroupCount=Object.keys(data.fixedSpots||{}).length;row.historyCount=histories.length;row.rootSpotProtection={oldSensitive:0,newSensitive:0,newlySensitive:0,oldSensitiveUnhidden:0,newSensitiveUnhidden:0}; for(const s of spots){const c=classify(s.species);if(c.old){row.rootSpotProtection.oldSensitive++;if(s.locationHidden!==true)row.rootSpotProtection.oldSensitiveUnhidden++;}if(c.new){row.rootSpotProtection.newSensitive++;if(s.locationHidden!==true)row.rootSpotProtection.newSensitiveUnhidden++;}if(!c.old&&c.new)row.rootSpotProtection.newlySensitive++;}items=rows;}
 else if(endpoint.startsWith('/reports/recent-sites')){items=data.sites||data.recentSites||[];row.scope='Already aggregated, old-classifier-filtered recent site output. Underlying row attribution is unavailable.';}
 else{items=data.entries||data.updates||[];row.scope='Current active field-update payload only; expired/deleted rows unavailable.';}
 row.count=items.length;row.coordinateObservability=items.some(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));row.oldSensitive=0;row.newSensitive=0;row.newlySensitive=0;row.newlySensitiveWithUnhiddenPublicLocation=0;row.oldSensitiveWithUnhiddenPublicLocation=0;
 for(const item of items){const c=classify(item.species,item.note||'');if(c.old)row.oldSensitive++;if(c.new)row.newSensitive++;if(!c.old&&c.new){row.newlySensitive++;if(item.locationHidden!==true&&Number.isFinite(item.lat)&&Number.isFinite(item.lon))row.newlySensitiveWithUnhiddenPublicLocation++;}if(c.old&&item.locationHidden!==true&&Number.isFinite(item.lat)&&Number.isFinite(item.lon))row.oldSensitiveWithUnhiddenPublicLocation++;}
 if(!row.coordinateObservability){row.newlySensitiveWithUnhiddenPublicLocation=null;row.oldSensitiveWithUnhiddenPublicLocation=null;}result.requests.push(row);
}
result.endedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'public_read_impact_latest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
