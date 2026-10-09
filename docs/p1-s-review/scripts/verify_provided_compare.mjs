import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {createHash} from 'node:crypto';
const HERE=path.resolve(process.argv[2]||path.dirname(fileURLToPath(import.meta.url)));
const bytes=fs.readFileSync(path.join(HERE,'provided_compare_output.json'));
const supplied=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
const independent=JSON.parse(fs.readFileSync(path.join(HERE,'independent_replay.json'),'utf8'));
assert.equal(supplied.now,independent.evaluationTime);
const summary=[];
for(const rev of [independent.codeBefore,independent.prHead]){
 const normal=independent.normal.find(x=>x.rev===rev),synthetic=independent.synthetic.find(x=>x.rev===rev).reportsOn;
 for(const [providedKey,independentKey] of [['withSightings','reportsOn'],['withoutSightings','reportsOff']]){
  const a=supplied.out[rev][providedKey],b=normal[independentKey];
  assert.equal(a.siteCount,b.siteCount);assert.equal(a.candidates,b.candidateCount);assert.equal(a.safeCandidates,b.safeCandidateCount);assert.deepEqual(a.unsafe,b.unsafeIds);
  const mapA=a.top.map(x=>({id:String(x.id),raw:x.score,rank:x.rank,bonus:x.bonus,date:x.date,time:x.time,mandatory:x.mandatory,basis:x.basis}));
  const mapB=b.top.map(x=>({id:x.id,raw:x.raw,rank:x.rank,bonus:x.bonus,date:x.date,time:x.time,mandatory:x.mandatory,basis:x.basis}));
  assert.deepEqual(mapA,mapB);
  summary.push({rev,scenario:providedKey,matchedCountTopScores:true,candidates:b.candidateCount,safe:b.safeCandidateCount,topIds:b.top.map(x=>x.id)});
 }
 const a=supplied.out[rev].syntheticNullScores;
 assert.equal(a.candidates,synthetic.candidateCount);
 assert.deepEqual(a.zeroScoreCandidates.map(String),synthetic.all190.filter(x=>x.raw===0).map(x=>x.id));
 assert.deepEqual(a.top.map(x=>({id:String(x.id),date:x.date,time:x.time,raw:x.score,rank:x.rank})),synthetic.top.map(x=>({id:x.id,date:x.date,time:x.time,raw:x.raw,rank:x.rank})));
 summary.push({rev,scenario:'syntheticNullScores',matchedCountTopScores:true,candidates:synthetic.candidateCount,zeroScoreCandidateCount:a.zeroScoreCandidates.length});
}
const result={schemaVersion:1,allComparisonsPass:true,providedOutputSHA256:createHash('sha256').update(bytes).digest('hex'),normalComparisons:4,syntheticComparisons:2,summary,limitations:['Provided script lacks weather_today input, display score output and full candidate comparisons. Independent replay supplies actual today snapshot and compares all 190 complete entry hashes.']};
fs.writeFileSync(path.join(HERE,'provided_crosscheck.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));