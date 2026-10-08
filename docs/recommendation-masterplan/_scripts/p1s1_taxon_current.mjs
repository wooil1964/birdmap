import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';

const DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(process.argv[2] || process.cwd());
const OUT=path.resolve(process.argv[3] || path.join(DIR,'../_results'));
const source=path.join(ROOT,'reports-api/src/shared.js');
const {normalizeSpecies, splitSpecies, isSensitiveReport}=await import(pathToFileURL(source).href);
const dataset=JSON.parse(fs.readFileSync(path.join(DIR,'../_snapshots/p1s_taxon_groundtruth.json'),'utf8'));
const rows=dataset.fixtures.map(f=>{
  const legacyTokens=splitSpecies(f.species);
  let normalizedTokens=null, normalizedSensitive=null, normalizationError=null;
  try {
    normalizedTokens=normalizeSpecies(f.species);
    normalizedSensitive=isSensitiveReport({species:normalizedTokens,speciesText:normalizedTokens.join(' · '),note:f.note});
  } catch(e) {normalizationError={code:e.code || e.name,message:e.message};}
  return {...f,current:{normalizedTokens,normalizedSensitive,normalizationError,legacyTokens,
    legacySensitive:isSensitiveReport({species:legacyTokens,speciesText:f.species,note:f.note})}};
});
const groups={};
for(const row of rows){
  const g=groups[row.group] ||= {n:0,submissionSensitiveTrue:0,submissionSensitiveFalse:0,submissionInvalid:0,legacySensitiveTrue:0,legacySensitiveFalse:0};
  g.n++;
  if(row.current.normalizationError)g.submissionInvalid++;
  else if(row.current.normalizedSensitive)g.submissionSensitiveTrue++;
  else g.submissionSensitiveFalse++;
  if(row.current.legacySensitive)g.legacySensitiveTrue++;
  else g.legacySensitiveFalse++;
}
const result={schemaVersion:1,contractScope:'Classification functions only, not an HTTP response or operating leak',sharedFileSHA256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),groundtruthSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR,'../_snapshots/p1s_taxon_groundtruth.json'))).digest('hex'),evaluatedCases:rows.length,groups,rows};
fs.writeFileSync(path.join(OUT,'p1s1_taxon_current.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,groups,interesting:rows.filter(x=>['mixed_delimiter','breeding_false_positive'].includes(x.group)).map(x=>({id:x.id,species:x.species,note:x.note,current:x.current}))},null,2));