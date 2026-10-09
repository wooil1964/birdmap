import fs from 'node:fs';
const root='docs/p1-s-review',summary=JSON.parse(fs.readFileSync(root+'/results/r4/recommendation_summary.json','utf8'));
const table=(label,rows)=>'### '+label+'\n\n| 순서 | ID·장소 | 원점수/표시 | 내부 rank | 가점 | 추천일·시각 | 추천 유형 |\n|---:|---|---:|---:|---:|---|---|\n'+rows.map(e=>'| '+[e.position,e.id+' '+e.name,e.raw+'/'+e.display,e.rank,e.bonus,e.date+' '+e.time,e.axis].join(' | ')+' |').join('\n');
const file=root+'/R4_RECHECK.md';let text=fs.readFileSync(file,'utf8');text=text.replace(/### 제보 ON[\s\S]*?(?=표의 유형)/,table('제보 ON',summary.on)+'\n\n'+table('제보 OFF',summary.off)+'\n\n').replace('후기 자동응답','늦은 자동응답');fs.writeFileSync(file,text);console.log('Rendered both tables with all20 verified rows.');
