import {readFileSync,writeFileSync} from 'node:fs';
const file=process.argv[2];
let text=readFileSync(file,'utf8');
text=text.replace("const first=await call('/reports/public-state','first-head');","const coldClients=Number(process.argv[6]||0);let coldBurst=[];if(coldClients){assert.ok([10,20].includes(coldClients));coldBurst=await Promise.all(Array.from({length:coldClients},()=>call('/reports/public-state','cold-burst-'+coldClients)));assert.ok(coldBurst.every(x=>x.status===200&&x.rowsWritten===0));} const first=await call('/reports/public-state','first-head');");
text=text.replace("evidence.observed={firstHead:","evidence.observed={coldBurst:summary(coldBurst),coldBurstClients:coldClients,firstHead:");
writeFileSync(file,text);

