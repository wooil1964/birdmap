import fs from 'node:fs';import {createHash} from 'node:crypto';
const base='docs/p1-s-review',p=base+'/results/c/github_receipts.json',x=JSON.parse(fs.readFileSync(p,'utf8')),body=fs.readFileSync(base+'/FINAL_C_COMMENT.md','utf8').replace(/\r\n/g,'\n').trimEnd();
x.postedBodySHA256=createHash('sha256').update(body).digest('hex');fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const note='\n## 게시·최종 체크포인트\n\n'+
'검증 보고서 commit: '+x.reportCommit+' (원격 push 완료).\n\n'+
'- [PR #13 최종 판정](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6083239755)\n'+
'- [Issue #9 동일 판정](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6083244131)\n\n'+
'두 댓글 ID와 게시된 본문을 API로 다시 읽어 FINAL_C_COMMENT.md와 일치 확인했다. readback/본문hash는 results/c/github_receipts.json. 이 증빙을 저장한 마지막 commit은 git log -1/원격 review/p1-s-pr13에서 확인한다. 원격 main/head가 현재 검증 SHA와 같은지 최종 재확인한다. 사용자 승인·구현자 보완 새SHA 대기이며 운영 작업은 수행하지 않는다.\n';
for(const f of ['NEXT_SESSION.md','PROGRESS.md'])fs.appendFileSync(base+'/'+f,note);
console.log(JSON.stringify({reportCommit:x.reportCommit,readback:x.readback,bodySHA256:x.postedBodySHA256}));
