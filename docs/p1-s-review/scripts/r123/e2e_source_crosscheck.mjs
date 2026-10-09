// Review-only: exact sources/data after CRLF normalization; no source changes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);const hash=b=>createHash('sha256').update(b).digest('hex');
const refs={'index.html':'1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c','weather_today.json':'38b45299c832b8ab8ad549762c02979fa8ddfb28','weather_week.json':'38b45299c832b8ab8ad549762c02979fa8ddfb28','tide_today.json':'1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c'};
const e=JSON.parse(fs.readFileSync(path.join(out,'e2e_root_combined.json'),'utf8')),rows=[];
for(const [file,ref] of Object.entries(refs)){const raw=fs.readFileSync(path.join(root,file)),blob=execFileSync('git',['show',ref+':'+file],{maxBuffer:32*1024*1024});const normalized=raw.toString('utf8').replace(/\r\n/g,'\n');assert.equal(normalized,blob.toString('utf8').replace(/\r\n/g,'\n'));assert.equal(e.sourceDigests[file],hash(raw));rows.push({file,ref,archiveSha256:hash(raw),blobSha256:hash(blob),normalizedSha256:hash(normalized),sameAfterNewlineNormalization:true});}
assert.equal(e.summary.passedSteps,55);assert.equal(e.summary.totalSteps,55);assert.equal(e.errors.length,0);
const payload={head:refs['index.html'],main:refs['weather_today.json'],combinedTree:'1be66adcaaff8aa912491f11722f476255b36ed5',sourceAndDataMatched:true,archiveConversion:'Only Windows CRLF conversion',rows,viewports:e.viewports.filter(v=>v.steps).map(v=>({width:v.width,dataBasis:v.steps.leaflet_and_load.result.dataBasis})),summary:e.summary,diagnostics:e.viewports.filter(v=>!v.steps)};
fs.writeFileSync(path.join(out,'e2e_source_crosscheck.json'),JSON.stringify(payload,null,2)+'\n');console.log(JSON.stringify({sourceAndDataMatched:true,summary:e.summary,clock:e.evaluationTime}));

