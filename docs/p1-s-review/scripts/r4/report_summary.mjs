import fs from 'node:fs';
const dir='docs/p1-s-review/results/r4';const r=JSON.parse(fs.readFileSync(dir+'/independent_replay.json','utf8')),v=r.normal.find(x=>x.rev===r.prHead);
const payload={head:r.prHead,evaluationTime:r.evaluationTime,on:v.reportsOn.top,off:v.reportsOff.top,candidates:[v.reportsOn.candidateCount,v.reportsOff.candidateCount],safeCandidates:[v.reportsOn.safeCandidateCount,v.reportsOff.safeCandidateCount],unchanged190:r.differences.every(x=>x.full190SignatureEqual&&!x.topChanged),coordinatesSame:r.normal.every(x=>x.coordinateVectorSHA256===r.normal[0].coordinateVectorSHA256)};
fs.writeFileSync(dir+'/recommendation_summary.json',JSON.stringify(payload,null,2)+'\n');console.log(JSON.stringify(payload,null,2));
