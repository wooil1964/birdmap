// Final read-only remote-ref audit. Never fetches, changes code/data or calls a public API.
import fs from 'node:fs'; import {createHash} from 'node:crypto'; import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{maxBuffer:1<<28});
const current=git('rev-parse','origin/main').toString().trim();
const paths=['reports-api/src/shared.js','reports-api/src/public.js','reports-api/src/field-updates.js','reports-api/src/admin-actions.js','reports-api/src/canonical/data.js','reports-api/src/canonical/persistence.js','reports-api/src/canonical/control.js','reports-api/schema.sql','reports-api/test/helpers.mjs','index.html'];
const matches=Object.fromEntries(paths.map(p=>[p,hash(git('show',current+':'+p))===hash(git('show','4fc14b3:'+p))]));
if(!Object.values(matches).every(Boolean))throw Error('Source changed; new review required');
const raw=git('show',current+':weather_week.json'),weather=JSON.parse(raw);
const samples=Object.values(weather.sites).flatMap(s=>Object.values(s.days||{}).flatMap(d=>d.samples||[]));
const valid=s=>typeof s==='number'&&Number.isFinite(s)&&s>=0&&s<=100;
const audit={main:current,changedFromCodeBaseline:git('diff','--name-only','35141c0',current).toString().trim().split('\n'),sourceMatchesEarlierAudit:matches,weatherSha256:hash(raw),generatedAt:weather.generatedAt,sampleCount:samples.length,eligibleInvalidRawScore:samples.filter(s=>s.scoreEligible===true&&!valid(s.score)).length,scope:'Independent final remote main audit only; no input to fixed simulation, no raw reports or coordinates saved.'};
fs.writeFileSync(process.argv[2]||'docs/recommendation-masterplan/_results/p1s_final_main_audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit,null,2));