import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const out=path.resolve(process.argv[2]);
const sha='b12e20c1b6d856a021898a0c1c9221b30393a221';
const base='https://api.github.com/repos/wooil1964/birdmap';
const report={startedAt:new Date().toISOString(),onlyGET:true,expectedHead:sha,requests:[]};
const targets=[['pr','/pulls/13'],['main','/branches/main'],['actions','/actions/runs?head_sha='+sha+'&per_page=10'],['status','/commits/'+sha+'/status'],['checks','/commits/'+sha+'/check-runs'],['pages','/deployments?environment=github-pages&per_page=1']];
for(const [kind,url] of targets){
 const r=await fetch(base+url,{method:'GET',headers:{Accept:'application/vnd.github+json','User-Agent':'birdmap-independent-readonly-review'},signal:AbortSignal.timeout(20000)});
 const body=await r.text(),row={kind,url:base+url,httpStatus:r.status,observedAt:new Date().toISOString(),bodySHA256:createHash('sha256').update(body).digest('hex')};
 if(!r.ok)throw new Error(kind+' HTTP '+r.status);
 const data=JSON.parse(body);
 if(kind==='pr')Object.assign(row,{head:data.head.sha,base:data.base.sha,draft:data.draft,merged:data.merged,state:data.state});
 else if(kind==='main')Object.assign(row,{sha:data.commit.sha,tree:data.commit.commit.tree.sha});
 else if(kind==='actions')Object.assign(row,{totalCount:data.total_count});
 else if(kind==='status')Object.assign(row,{totalCount:data.total_count,state:data.state});
 else if(kind==='checks')Object.assign(row,{totalCount:data.total_count});
 else if(kind==='pages')Object.assign(row,{deploymentId:data[0]?.id,sha:data[0]?.sha,createdAt:data[0]?.created_at});
 report.requests.push(row);
}
report.endedAt=new Date().toISOString();
report.headUnchanged=report.requests.find(r=>r.kind==='pr').head===sha;
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'final_github_read.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!report.headUnchanged)throw new Error('PR head changed; affected verification must resume.');
