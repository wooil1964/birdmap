// Read-only Git comparison: copy tracked files to temp and restore HEAD bytes only in that copy.
// Never checks out, resets, cleans, fetches or updates the working repository.
import { mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readdirSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),target=mkdtempSync(join(tmpdir(),'birdmap-baseline-'));
const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,maxBuffer:64*1024*1024});if(r.status!==0)throw Error('read-only git failed');return r.stdout;};
for(const path of git('ls-files','-z').toString('utf8').split('\0').filter(Boolean)) {const dest=join(target,path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,path),dest);}
for(const path of git('diff','HEAD','--name-only','-z').toString('utf8').split('\0').filter(Boolean))writeFileSync(join(target,path),git('show','HEAD:'+path));
const scripts=join(target,'.github/scripts'),tests=readdirSync(scripts).filter(n=>/^test_.*\.mjs$/.test(n)).map(n=>join(scripts,n));
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:target,env:process.env,encoding:'utf8',timeout:120000,maxBuffer:8e6});
writeFileSync(join(root,'docs/long-term-db-phase2b/.local/frontend-baseline.tap'),(result.stdout||'')+(result.stderr||''));
console.log(JSON.stringify({baseline_head:git('rev-parse','HEAD').toString().trim(),exit_code:result.status,temporary_copy:target}));
process.exitCode=result.status??1;
