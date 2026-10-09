// Review-only exact source/data and Chrome result verification; no product mutation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const review=process.cwd(),out=path.join(review,'docs/p1-s-review/results/r4'),scratch=path.join(review,'docs/p1-s-review/.scratch');
const head='8ccb248faa2c5c7b5a6019d12e19e21031169460',before='1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c',main='b0975cad9f3112af38cc286a892bf6f06722ce12';
const hash=x=>createHash('sha256').update(x).digest('hex'),normalize=x=>x.toString('utf8').replace(/\r\n/g,'\n');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f),'utf8'));const sources=[];
function exact(archive,file,ref){const bytes=fs.readFileSync(path.join(scratch,archive,file)),blob=execFileSync('git',['show',ref+':'+file],{maxBuffer:32*1024*1024});assert.equal(normalize(bytes),normalize(blob));sources.push({archive,file,ref,archiveSha256:hash(bytes),blobSha256:hash(blob),sameAfterNewlineNormalization:true});return hash(bytes);}
const general=read('general_e2e_root.json');
for(const file of ['index.html','weather_today.json','weather_week.json','tide_today.json','tide_month.json']){const digest=exact('combined8ccb',file,file==='index.html'?head:main);if(general.sourceDigests[file])assert.equal(general.sourceDigests[file],digest);}
assert.equal(general.summary.passedSteps,55);assert.equal(general.summary.totalSteps,55);assert.equal(general.errors.length,0);
for(const [file,archive,ref,total,pass,fail] of [
 ['detailed_dom_full.json','target8ccb',head,175,145,30],['detailed_dom_root.json','target8ccb',head,35,29,6],
 ['detailed_dom_before.json','before1bd',before,30,30,0],['detailed_dom_before_root.json','before1bd',before,6,6,0]]){
 const r=read(file);assert.equal(r.sourceDigest,exact(archive,'index.html',ref));assert.equal(r.head,ref);assert.deepEqual(r.summary,{total,pass,fail,errors:0});
 const diagnostics=r.rows.filter(x=>x.diagnostic);assert.equal(diagnostics.length,ref===head?fail:total);
 for(const d of diagnostics){assert.equal(d.popupScore,'오늘 적합도 미확인');assert.equal(d.safe,true);assert.equal(d.rawScore,92);assert.equal(d.cardScore,ref===head?'★★★★★ 92점':'오늘 적합도 미확인');assert.equal(d.passed,ref!==head);}
 if(ref===head)assert.ok(r.rows.filter(x=>!x.diagnostic).every(x=>x.passed));
}
for(const file of ['reports-api/src/shared.js','reports-api/src/public.js','reports-api/src/field-updates.js','reports-api/src/admin-actions.js'])exact('target8ccb',file,head);
const fixture=fs.readFileSync(path.join(out,'sparse6h_generated_today.json'));const payload={head,before,main,combinedTree:'9949dab3131d095c293f3bd0faf8f05539a1ad1e',sourceAndDataMatched:true,sources,generalSummary:general.summary,detailedNormal:145,detailedFreshnessFailures:30,rootNormal:29,rootFreshnessFailures:6,baselineFreshnessPass:30,rootBaselinePass:6,generatorFixtureSha256:hash(fixture),fixtureClock:'2026-10-10T11:00:00+09:00',generalClock:general.evaluationTime,productionWrites:false};
fs.writeFileSync(path.join(out,'source_crosscheck.json'),JSON.stringify(payload,null,2)+'\n');console.log(JSON.stringify({sourceAndDataMatched:true,general:general.summary,detailedNormal:145,freshnessFailures:30,baselinePass:30}));
