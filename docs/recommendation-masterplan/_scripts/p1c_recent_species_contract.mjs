// Analysis only. Imports application sources but never calls a production endpoint or database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';

const repo=path.resolve(process.argv[2]||process.cwd());
const here=path.resolve(process.argv[3]||path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_results'));
const {handleRequest}=await import(pathToFileURL(path.join(repo,'reports-api/src/public.js')));
const {normalizeSpecies,splitSpecies,isSensitiveReport,kstDateString}=await import(pathToFileURL(path.join(repo,'reports-api/src/shared.js')));
const {fakeDb,publicEnv,ORIGIN}=await import(pathToFileURL(path.join(repo,'reports-api/test/helpers.mjs')));
const NativeDate=Date, evaluationTime='2026-10-08T22:40:00+09:00';
globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[evaluationTime]));}static now(){return new NativeDate(evaluationTime).getTime();}};
globalThis.fetch=async()=>{throw Error('Network forbidden in synthetic contract review');};

const cases=[
 {label:'exact protected',raw:'저어새',expected:[]},
 {label:'numeric suffix',raw:'저어새1',expected:['저어새1']},
 {label:'spaced numeric suffix',raw:'저어새 1',expected:['저어새 1']},
 {label:'other protected suffix',raw:'흰꼬리수리1',expected:['흰꼬리수리1']},
 {label:'short protected suffix',raw:'매1',expected:['매1']},
 {label:'breeding note still excludes suffix',raw:'저어새1',note:'둥지 확인',expected:[]},
 {label:'hidden still excludes suffix',raw:'저어새1',hidden:true,expected:[]},
 {label:'canonical protected mixed row excludes ordinary co-species',raw:'저어새,울새',expected:[]},
 {label:'ordinary control',raw:'울새',expected:['울새']},
 {label:'pending still excluded',raw:'저어새1',status:'pending',expected:[]},
 {label:'unlinked still excluded',raw:'저어새1',unlinked:true,expected:[]},
 {label:'outside window still excluded',raw:'저어새1',old:true,expected:[]},
 {label:'uncanonical legacy delimiter',raw:'저어새·울새',legacy:true,expected:['저어새·울새']},
];
cases.push({label:'newline merges protected and ordinary species',raw:'저어새\n울새',expected:['저어새울새']});
const now=new Date(),today=kstDateString(now),out=[];
for(const c of cases){
 const stored=c.legacy?c.raw:normalizeSpecies(c.raw).join(' · ');
 const db=fakeDb([{id:'synthetic',status:c.status||'approved',site_id:c.unlinked?null:'19',species:stored,
  lat:36,lon:126,observed_on:c.old?kstDateString(new Date(now.getTime()-15*86400000)):today,note:c.note||null,
  ...(c.hidden?{public_lat:36.01,public_lon:126.01}:{})}]);
 const before=JSON.stringify(db.rows);
 const response=await handleRequest(new Request('https://reports.example/reports/recent-sites?days=14',{method:'GET',headers:ORIGIN}),publicEnv(db));
 assert.equal(response.status,200);
 const body=await response.json(),names=body.sites.flatMap(s=>s.species);
 assert.deepEqual(names,c.expected);
 assert.equal(JSON.stringify(db.rows),before);
 assert.ok(body.sites.every(s=>Object.keys(s).every(k=>['siteId','latestDate','species'].includes(k))));
 out.push({case:c.label,storedSpecies:stored,returnedSpecies:names,excluded:names.length===0,status:response.status,rowsUnchanged:true,privateFieldsInResponse:0});
}
const fixturePath='docs/recommendation-masterplan/_snapshots/recent_sites_20261008_193204.json';
const fixtureBytes=fs.readFileSync(path.join(repo,fixturePath)),fixture=JSON.parse(fixtureBytes);
const diagnosticKey=s=>s.replace(/[0-9]+$/,'').trim();
const rows=fixture.sites.map(s=>({siteId:s.siteId,latestDate:s.latestDate,rawCount:s.species.length,
 uniqueRaw:new Set(s.species).size,suffixEntries:s.species.filter(x=>/[0-9]+$/.test(x)),
 diagnosticStripCount:new Set(s.species.map(diagnosticKey)).size,
 diagnosticCollisions:[...new Set(s.species.map(diagnosticKey))].map(k=>({key:k,raw:s.species.filter(x=>diagnosticKey(x)===k)})).filter(x=>x.raw.length>1)}));
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload={schemaVersion:1,sourceCheckpoint:'8bd44e39776a1c3c78dfa870d24becdeb7a4b8b2',evaluationTime,
 scope:'Original GET handler and schema.sql, SQLite :memory: helper, synthetic rows only. No real D1 or API queried; no POST; network fail-closed. Repository and operating sources are read only.',
 sourceFiles:Object.fromEntries(['reports-api/src/public.js','reports-api/src/shared.js','reports-api/schema.sql','reports-api/test/helpers.mjs'].map(p=>[p,sha(fs.readFileSync(path.join(repo,p)))])),
 fixture:{path:fixturePath,sha256:sha(fixtureBytes),sites:fixture.sites.length,totalRawStrings:fixture.sites.reduce((n,s)=>n+s.species.length,0),rows},
 syntheticCases:out,
 additionalNormalizerDiagnostic:{input:'저어새\n울새',normalized:normalizeSpecies('저어새\n울새'),
  sensitive:isSensitiveReport({species:normalizeSpecies('저어새\n울새'),speciesText:normalizeSpecies('저어새\n울새').join(' · '),note:''})},
 interpretation:'Numeric-suffix stripping is a diagnostic hypothesis only; no taxon identification, canonical species count, observer identity, effort or occurrence probability was inferred. The suffix limitation belongs to the existing string protection gate, not to a new recommendation bonus policy. Synthetic output does not establish a production leak.'};
fs.writeFileSync(path.join(here,'p1c_recent_species_contract.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({output:path.join(here,'p1c_recent_species_contract.json'),cases:out.length,allPassed:true,fixtureSites:fixture.sites.length,fixtureRawStrings:payload.fixture.totalRawStrings,diagnosticCollisions:rows.flatMap(r=>r.diagnosticCollisions.map(c=>({siteId:r.siteId,...c})))},null,2));
