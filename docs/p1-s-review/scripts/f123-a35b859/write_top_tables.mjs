import fs from'node:fs';import path from'node:path';const base=path.resolve(process.argv[2]),out=path.join(base,'results/f123-a35b859');
const n=JSON.parse(fs.readFileSync(path.join(out,'independent_replay.json'))).normal.find(n=>n.rev==='a35b8598d55890e705042e4d6f88621357749d09');
const table=(key,title)=>'\n### '+title+' — 네 버전 동일\n\n'+['|순위|ID·장소|원점수/표시|가점|rank|추천일·시각|유형|','|---:|---|---:|---:|---:|---|---|',...n[key].top.map(r=>'|'+[r.position,r.id+' '+r.name,r.raw+'/'+r.display,r.bonus,r.rank,r.date+' '+r.time,r.axis].join('|')+'|')].join('\n');
const p=path.join(base,'F123_RECHECK.md');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('{{TOP_TABLES}}',table('reportsOn','제보 ON')+'\n'+table('reportsOff','제보 OFF')));
