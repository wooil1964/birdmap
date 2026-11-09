// Read-only production inspection. Never prints raw input, IDs, names, notes, hashes or coordinates.
import {read,stats} from './d1-rest.mjs';
import {legacySpeciesItems,parseSpeciesItems} from '../src/shared.js';
import {OFFICIAL_BIRD_NAMES} from '../src/official-bird-names.js';
import {writeFileSync} from 'node:fs';
const target={name:'production',account_id:'1d697c22a32447b386b9fac6a3538597',database_id:'b48201cc-0abd-4a64-bb61-9dd2a7813d21'};
const tables=await read(target,target.database_id,"SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('sightings','raw_submissions')");
const has=name=>tables.some(t=>t.name===name);
const rows=await read(target,target.database_id,`SELECT species,bird_count,reporter,${has('sightings')?"(SELECT json_group_array(json_object('name',species_identified,'count',count_value,'state',interpretation)) FROM sightings WHERE checklist_id=reports.id AND species_identified IS NOT NULL)":"NULL"} AS sightings,${has('raw_submissions')?"EXISTS(SELECT 1 FROM raw_submissions WHERE raw_id='raw:'||reports.id)":'NULL'} AS has_raw FROM reports WHERE status='approved'`);
const official=new Set(OFFICIAL_BIRD_NAMES),categories={structured:0,safeLegacy:0,uncertain:0,missing:0,duplicateException:0};
const before=new Set(),after=new Set(),reporters=new Map(),candidates=new Map();let changed=0,knownIndividuals=0,unrecorded=0,uncertainCounts=0,zeroInputs=0,rawPresent=0,beforeIndividuals=0;
for(const row of rows){
 if(row.has_raw===1)rawPresent++;
 const structured=JSON.parse(row.sightings||'[]');
 const items=structured.length?structured.map(i=>({name:i.name,count:i.state==='single'?i.count:null,countStatus:i.state==='single'?(i.count===null?'not_recorded':'reported'):'uncertain'})):legacySpeciesItems(row.species);
 const oldGrouped=new Map();
 const oldItems=structured.length?items:String(row.species||'').split(/[·,;\n/]+/).map(s=>s.trim()).filter(Boolean).map(token=>{
  const p=parseSpeciesItems([token]),i=p.items[0];
  return p.items.length===1&&p.clean&&official.has(i.name)?{name:i.name,count:i.count,countStatus:i.count===null?'not_recorded':'reported'}:{name:token,count:null,countStatus:'uncertain'};
 });
 for(const i of oldItems)oldGrouped.set(i.name,oldGrouped.has(i.name)?{name:i.name,count:null,countStatus:'uncertain'}:i);
 const old=[...oldGrouped.keys()];
 beforeIndividuals += [...oldGrouped.values()].filter(i=>i.countStatus==='reported').reduce((n,i)=>n+i.count,0);
 if(structured.length)categories.structured++;else if(!row.species?.trim())categories.missing++;else if(items.some(i=>i.countStatus==='uncertain'))categories.uncertain++;else categories.safeLegacy++;
 if(items.some(i=>i.countStatus==='uncertain'&&official.has(i.name)))categories.duplicateException++;
 old.forEach(s=>before.add(s));items.forEach(i=>{after.add(i.name);if(i.countStatus==='reported')knownIndividuals+=i.count;else if(i.countStatus==='not_recorded')unrecorded++;else uncertainCounts++;});
 if(row.bird_count===0)zeroInputs++;
 if(JSON.stringify([...new Set(old)].sort())!==JSON.stringify(items.map(i=>i.name).sort()))changed++;
 if(row.reporter?.trim()){
  if(!reporters.has(row.reporter))reporters.set(row.reporter,{before:new Set(),after:new Set()});const r=reporters.get(row.reporter);old.forEach(s=>r.before.add(s));items.forEach(i=>r.after.add(i.name));
  const key=row.reporter.replace(/\s/g,'');if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(row.reporter);
 }
}
const summary={checkedAt:new Date().toISOString(),approvedReports:rows.length,tablePresence:{sightings:has('sightings'),rawSubmissions:has('raw_submissions')},categories,rawPayloadRows:rawPresent,
 expected:{reportCountBefore:rows.length,reportCountAfter:rows.length,distinctSpeciesBefore:before.size,distinctSpeciesAfter:after.size,changedSpeciesReports:changed,knownIndividualsBefore:beforeIndividuals,knownIndividualsAfter:knownIndividuals,knownIndividualsDelta:knownIndividuals-beforeIndividuals,confirmedDistinctSpeciesAfter:[...after].filter(n=>official.has(n)).length,unrecordedSpeciesCounts:unrecorded,uncertainSpeciesCounts:uncertainCounts,zeroBirdCountInputs:zeroInputs,reportersWithChangedSpeciesCount:[...reporters.values()].filter(r=>r.before.size!==r.after.size).length},
 whitespaceCandidateGroups:[...candidates.values()].filter(s=>s.size>1).length,confirmedMerges:0,rowsWritten:stats.rowsWrittenByReads};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
