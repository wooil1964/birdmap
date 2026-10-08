// P1-S1 analysis design prototype. No application source edit.
// S1-R corrects representations of the existing list only; S1-P is a separate prospective public policy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const folder=path.resolve(process.argv[2]||path.dirname(fileURLToPath(import.meta.url)));
const current=JSON.parse(fs.readFileSync(path.join(folder,'p1s_protection_current.json')));
const protectedNames=current.currentProtectedSpecies;
const existingKeywords=current.currentBreedingKeywords;
const ordinaryFixtureRegistry=['울새','박새','참새','검은어깨매','알락할미새'];
// This five-name fixture registry is a test oracle, not a production taxonomy catalog.
const registry=new Set([...protectedNames,...ordinaryFixtureRegistry]);
function tokenize(raw){return String(raw??'').normalize('NFC').split(/[,;·/\r\n]+/).map(s=>s.trim().replace(/[ \t]+/g,' ')).filter(Boolean);}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function parseToken(raw,maxCount=100000){
 const exact=registry.has(raw);
 if(exact)return {raw,taxonName:raw,count:null,status:'known_exact',protected:protectedNames.includes(raw)};
 for(const base of [...registry].sort((a,b)=>b.length-a.length)){
  const match=raw.match(new RegExp('^'+escape(base)+'\\s*([0-9]+)\\s*(마리|개체)?$'));
  if(match){const count=Number(match[1]),valid=Number.isSafeInteger(count)&&count>0&&count<=maxCount;return {raw,taxonName:base,count:valid?count:null,status:valid?'known_count':'ambiguous_count',protected:protectedNames.includes(base)};}
 }
 // No synonym resolution, number removal, fuzzy match, substring match of short 매, or silent taxon assignment.
 return {raw,taxonName:null,count:null,status:'unresolved',protected:false};
}
function assess(raw,note='',endpoint='report'){
 const tokens=tokenize(raw),maxCount=endpoint==='field'?999:100000,parsed=tokens.map(t=>parseToken(t,maxCount));
 const existingBreeding=existingKeywords.some(k=>(raw+' '+note).includes(k));
 // R only closes explicit 19-name/count/delimiter/NFC representation problems and preserves current keyword list.
 const sensitiveR=existingBreeding||parsed.some(x=>x.protected);
 const unresolved=parsed.some(x=>x.status!=='known_exact'&&x.status!=='known_count');
 // Prospective P2 candidate keywords, measured separately: whole-word 알, 산란; do not search raw 알 substring.
 const eggStandalone=/(^|[\s,;·/])(알)(?=$|[\s,;·/0-9])/.test(note);
 const laying=note.includes('산란');
 const spacedKnownKeyword=existingKeywords.some(k=>new RegExp(k.split('').map(escape).join('[ \\t]+')).test(note));
 const conservativeAmbiguous=unresolved||spacedKnownKeyword;
 const breedingP=existingBreeding||eggStandalone||laying;
 const locationModeP=breedingP||sensitiveR||conservativeAmbiguous?'withheld':'existing_public_policy';
 return {rawPreserved:raw,endpoint,embeddedQuantityMax:maxCount,tokens,parsed,sensitiveR,unresolved,existingBreeding,breedingPolicyExtension:eggStandalone||laying,spacedKnownKeyword,
  proposedP:{exactCoordinatesAllowed:locationModeP==='existing_public_policy',recentBonusAllowed:locationModeP==='existing_public_policy',linkedHistoryAllowed:locationModeP==='existing_public_policy',navigationAllowed:locationModeP==='existing_public_policy',publicMode:locationModeP}};
}
const rows=current.inputCases.map(c=>{
 const assessed=assess(c.input,c.note||'');
 const ordinaryControl=c.expectedClass==='ordinary';
 return {label:c.label,expectedClass:c.expectedClass,...assessed,fieldEndpointAssessment:assess(c.input,c.note||'','field'),ordinaryFixtureControl:ordinaryControl,
  currentRecentIncludes:!!c.results.find(x=>x.mode==='validated_normalize_species')?.recentIncluded};
});
for(const row of rows){assert.equal(row.rawPreserved,current.inputCases.find(c=>c.label===row.label).input);}
const named=label=>rows.find(x=>x.label===label);
for(const label of ['protected_exact','protected_suffix','protected_spaced_suffix','protected_count_unit','protected_other_suffix','protected_short_suffix','mixed_comma','mixed_slash','mixed_newline','mixed_crlf','mixed_semicolon','mixed_middot','mixed_delimiters','protected_decomposed_unicode']){
 assert.equal(named(label).sensitiveR,true,label);
 assert.equal(named(label).proposedP.exactCoordinatesAllowed,false,label);
}
for(const label of ['protected_negative_count','protected_count_range','protected_count_decimal','protected_suffix_unknown','protected_suffix_question','protected_parenthesis','protected_internal_space']){
 assert.equal(named(label).proposedP.exactCoordinatesAllowed,false,label);
 assert.equal(named(label).proposedP.recentBonusAllowed,false,label);
}
for(const label of ['ordinary_simple','ordinary_suffix','ordinary_mixed_comma','ordinary_similar_short','ordinary_similar_other','ordinary_egg_syllable']){
 assert.equal(named(label).sensitiveR,false,label);
 assert.equal(named(label).proposedP.exactCoordinatesAllowed,true,label);
}
for(const label of ['ordinary_count_zero','ordinary_negative_count','ordinary_count_over_report_cap'])assert.equal(named(label).proposedP.exactCoordinatesAllowed,false,label);
assert.equal(named('ordinary_count_over_field_cap').proposedP.exactCoordinatesAllowed,true);
assert.equal(named('ordinary_count_over_field_cap').fieldEndpointAssessment.proposedP.exactCoordinatesAllowed,false);
assert.equal(named('ordinary_digits_inside').rawPreserved,'조류2호');
assert.equal(named('ordinary_digits_inside').tokens[0],'조류2호');
assert.equal(named('ordinary_digits_inside').parsed[0].taxonName,null);
assert.equal(named('breeding_egg_only').sensitiveR,false);
assert.equal(named('breeding_egg_only').proposedP.exactCoordinatesAllowed,false);
assert.equal(named('ordinary_egg_syllable').proposedP.exactCoordinatesAllowed,true);
const controls=rows.filter(x=>x.ordinaryFixtureControl),resolvedControls=controls.filter(x=>x.parsed.every(p=>p.status==='known_count'||p.status==='known_exact'));
const ordinaryRFalsePositives=controls.filter(x=>x.sensitiveR).map(x=>x.label);
const ordinaryPExactWithheld=controls.filter(x=>!x.proposedP.exactCoordinatesAllowed).map(x=>x.label);
const payload={schemaVersion:1,sourceCommit:current.sourceCommit,evaluationTime:current.evaluationTime,
 scope:'Standalone design prototype on 48 synthetic cases; not a product patch, not a deployed classifier.',
 assumptions:{protectedList:'Unchanged current 19 exact names',ordinaryRegistry:'Five synthetic ordinary control names only; no complete standards catalog',quantity:'Embedded positive integers only: report max100000, field max999; zero/negative/range/above-limit text is unresolved and withheld. Existing explicit canonical birdCount0 remains valid by its existing separate storage contract; no submit count policy changed',taxonomy:'No synonyms or uncertain taxa merged',eggLayingKeywords:'Measured policy extension; not silently included in S1-R'},
 cases:rows,summary:{cases:rows.length,ordinaryFixtureControls:controls.length,fullyResolvedOrdinaryControls:resolvedControls.length,
  ordinaryRFalsePositiveCount:ordinaryRFalsePositives.length,ordinaryRFalsePositives,ordinaryPWithheldExactCount:ordinaryPExactWithheld.length,ordinaryPExactWithheld,
  warning:'P withholding includes unresolved normal parentheses case. This is measured conservative false withholding on a finite fixture set, not an operational false-positive rate.'},
 instructions:[
  'Do not claim every accepted spelling has verified taxonomy. Unknown and malformed tokens retain raw source and require review.',
  'Read-defense filtering must run before species union, latestDate, totals, history/fixedSpots joins, contributor count and pagination; a row rejected by classifier contributes no siteId, date, count, species or score signal.',
  'Filter hidden linked child rows before attaching to a public precise parent/fixed marker. Otherwise parent navigation leaks child location context.',
  'Non-breeding confirmation may authorize storing a report but cannot override prospective public privacy policy.',
  'Already exposed coordinates must not be newly jittered on every read; no database mutation or synthetic approximation without an explicitly approved stable policy.',
  'Generic report raw fields are preserved. A no-D1 immediate read defense can omit uncertain rows; retaining approximate public output requires a stable saved point/stronger de-identification policy.'
 ]};
fs.writeFileSync(path.join(folder,'p1s_protection_design_prototype.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({output:path.join(folder,'p1s_protection_design_prototype.json'),allAssertionsPassed:true,...payload.summary},null,2));
