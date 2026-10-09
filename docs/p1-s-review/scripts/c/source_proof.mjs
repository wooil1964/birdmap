import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const repo=process.cwd(), dir=path.join(repo,'docs/p1-s-review'),out=path.join(dir,'results/c');
const head='352315a57d038687807dbe0044c136a22fb0c9c5',main='b0975cad9f3112af38cc286a892bf6f06722ce12',tree='0a32d8b656405ba3ee8cf85dc0208b9e0aa3d3d6';
const sha=b=>createHash('sha256').update(b).digest('hex'),norm=b=>b.toString('utf8').replace(/\r\n/g,'\n'),git=(ref,file)=>execFileSync('git',['show',ref+':'+file],{cwd:repo,maxBuffer:1<<29});
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8'));
const rows=[];
for(const [folder,ref,files] of [['targetC',head,['index.html']],['combinedC',head,['index.html']],['combinedC',main,['weather_today.json','weather_week.json','tide_today.json','tide_month.json']]]){
for(const file of files){const bytes=fs.readFileSync(path.join(dir,'.scratch',folder,file)),expected=git(ref,file);assert.equal(norm(bytes),norm(expected));rows.push({folder,file,ref,normalizedSHA256:sha(norm(bytes)),gitBlobSHA256:sha(expected),archiveRawSHA256:sha(bytes),matchesGitBlob:true});}}
const target=rows[0].archiveRawSHA256,combined=rows[1].archiveRawSHA256;
for(const name of ['detailed_dom_full.json','detailed_dom_root.json','loader_dom_corrected_full.json','loader_dom_corrected_root.json']){const d=read(name);assert.equal(d.sourceDigest,name.startsWith('loader_')?rows[0].normalizedSHA256:target,name);assert.equal(d.head||d.sha,head);}
const general=read('general_e2e_root.json');assert.equal(general.head,head);assert.equal(general.sourceDigests['index.html'],combined);
const matrix=read('pr13_r123_actual_matrix.json');assert.equal(matrix.matrixPassed,182);assert.equal(matrix.specialPassed,21);assert.equal(matrix.popup.filter(x=>x.contractPass).length,12);
const t=read('c_temporal_source_actual.json');assert.equal(t.coreContractRows.length,74);assert.equal(t.coreContractRows.filter(x=>!x.contractPass).length,43);assert.equal(t.schemaDiagnosticRows.length,4);assert.equal(t.timePass,23);
const replay=read('independent_replay.json'),now=replay.normal.find(x=>x.rev===head);
for(const condition of ['reportsOn','reportsOff'])assert.equal(now[condition].candidateCount,176);
assert.ok(replay.differences.every(x=>!x.topChanged&&x.full190SignatureEqual&&x.changedSiteIds.length===0));
const test=read('test_summary.json');assert.deepEqual(test.summary,{pass:588,fail:0,skip:1});
const policy=read('c_policy_before_after.json');assert.equal(policy.conditions,38);assert.ok(policy.comparison.every(x=>x.fullTopMatchesApprovedStrict&&x.referenceIdsRemaining.length===0));
const full=read('detailed_dom_full.json'),root=read('detailed_dom_root.json');
assert.equal(full.summary.pass,245);assert.equal(full.lifecycleSummary.pass,45);assert.equal(root.summary.pass,49);assert.equal(root.lifecycleSummary.pass,9);assert.equal(root.diagnosticSummary.fail,2);
const ld=read('loader_dom_corrected_root.json');assert.deepEqual(ld.summary,{conditions:40,propertyPass:20,propertyFail:20,exceptions:0});
const summary={head,main,combinedTree:tree,rows,counts:{regression:test.summary,matrix:182,special:21,popup:12,chrome245:full.summary,chromeRecovery45:full.lifecycleSummary,rootChrome49:root.summary,rootRecovery9:root.lifecycleSummary,rootWeeklyInvalidTime:root.diagnosticSummary,loaderChrome:ld.summary,sourceCore:74,sourceCoreMismatch:43,schemaDiagnostics:4,timestampHelper:23,normalSites:190,normalCandidates:176,policyConditions:38},normalTop:{ON:now.reportsOn.top,OFF:now.reportsOff.top},noOperatingWrites:true};
fs.writeFileSync(path.join(out,'verification_summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({head,main,combinedTree:tree,rows,counts:summary.counts},null,2));
