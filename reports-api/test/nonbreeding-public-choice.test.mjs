import test from 'node:test';
import assert from 'node:assert/strict';
import {input} from '../local-test/helpers.mjs';
import {isSensitiveReport,isProtectedSpeciesReport,isLocationRestricted,reportBreedingStatus} from '../src/shared.js';
import {LEGAL_PROTECTED_NAMES,MAP_LOCATION_SENSITIVE} from '../src/protected-birds.js';
function attested(id,species,extra={}){
 const original=input(id,{species,note:'비행 관찰',hideLocation:false,...extra});
 return {id:original.request_id,species,lat:original.lat,lon:original.lon,note:original.note,
  observed_on:original.observedOn,non_breeding_confirmed:1,
  location_input:JSON.stringify(original)};
}
test('all nonbreeding names are permitted; protected status does not itself deny publication',()=>{
 for(const [i,name] of ['호사비오리','매','왜가리','참새','말똥가리'].entries()){
  const row=attested(i+5100,name);
  assert.equal(reportBreedingStatus(row),'non_breeding',name);
  assert.equal(isSensitiveReport({species:[name],speciesText:name}),false,name);
  assert.equal(isLocationRestricted(row),false,name);
 }
});
test('all breeding evidence including common birds keeps locations closed',()=>{
 for(const [i,name] of ['참새','까치','호사비오리','매','왜가리'].entries()){
  const row=attested(i+5200,name);
  assert.equal(isLocationRestricted({...row,note:'새끼 둥지 육추'}),true,name);
 }
});
test('historic protected coordinates lacking verified nonbreeding origin remain hidden',()=>{
 for(const [i,name] of ['호사비오리','매','왜가리'].entries()){
  const row=attested(i+5300,name);
  assert.equal(isProtectedSpeciesReport({species:[name]}),true,name);
  assert.equal(isLocationRestricted({...row,non_breeding_confirmed:null,location_input:null}),true,name);
  assert.equal(isLocationRestricted({...row,lat:row.lat+0.1}),true,name);
 }
});
test('unknown or punctuation-corrupted names still fail closed without guessing',()=>{
 for(const [i,name] of ["호사비오리'",'호사비오리.','(호사비오리)','가짜새','참새 가짜새','호사비오리|참새'].entries()){
  const row=attested(i+5400,name);
  assert.equal(isSensitiveReport({species:[name],speciesText:name}),true,name);
  assert.equal(isLocationRestricted(row),true,name);
 }
});
test('official protected taxonomy stays classified but is distinct from disclosure policy',()=>{
 for(const name of [...LEGAL_PROTECTED_NAMES,...Object.keys(MAP_LOCATION_SENSITIVE)])
  assert.equal(isProtectedSpeciesReport({species:[name]}),true,name);
});
