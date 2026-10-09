// Verify Windows archive CRLF conversion without modifying any input.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const revisions={'index.html':'7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e','weather_today.json':'38b45299c832b8ab8ad549762c02979fa8ddfb28','weather_week.json':'38b45299c832b8ab8ad549762c02979fa8ddfb28'};
revisions['weather_week.json']=revisions['weather_today.json'];
const rows=[];
for(const [p,ref] of Object.entries(revisions)){
 const raw=fs.readFileSync(path.join(root,p)),canonical=execFileSync('git',['show',ref+':'+p],{maxBuffer:32*1024*1024});
 const normalized=raw.toString('utf8').replace(/\r\n/g,'\n');
 assert.equal(normalized,canonical.toString('utf8').replace(/\r\n/g,'\n'),'Only archive newline conversion allowed: '+p);
 rows.push({path:p,revision:ref,archiveRaw:hash(raw),canonicalRaw:hash(canonical),normalizedHash:hash(normalized),sameAfterCRLFNormalization:true});
}
const e=JSON.parse(fs.readFileSync(path.join(out,'pr13_e2e_combined.json'),'utf8'));
for(const row of rows)assert.equal(e.sourceDigests[row.path],row.archiveRaw);
assert.equal(e.summary.passedSteps,40);assert.equal(e.summary.totalSteps,40);assert.equal(e.errors.length,0);
fs.writeFileSync(path.join(out,'e2e_source_crosscheck.json'),JSON.stringify({archiveConversion:'Windows archive text uses CRLF; canonical Git blobs use LF. No other difference.',rows,sourceAndDataMatched:true,summary:e.summary},null,2)+'\n');
console.log(JSON.stringify({rows,viewports:e.viewports.filter(v=>v.steps).map(v=>({width:v.width,dataBasis:v.steps.leaflet_and_load.result.dataBasis})),late:e.viewports.find(v=>v.lateFieldResponse)?.lateFieldResponse},null,2));
