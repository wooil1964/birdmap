import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {LOCAL,ROOT} from './staging-control.mjs';
const source=JSON.parse(readFileSync(join(LOCAL,'start-manifest.json'),'utf8'));
const changed=[];
for(const f of source.files){const path=join(ROOT,f.path);if(!existsSync(path)){changed.push({path:f.path,state:'MISSING'});continue;}const sha=createHash('sha256').update(readFileSync(path)).digest('hex');if(sha!==f.sha256)changed.push({path:f.path,state:'CHANGED'});}
const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
const permitted=new Set(['reports-api/src/canonical/control.js','reports-api/src/canonical/purge.js']);
const authorized=changed.filter(c=>c.state==='CHANGED'&&permitted.has(c.path));
const unexpected=changed.filter(c=>!authorized.includes(c));
const result={at:new Date().toISOString(),baseline:source.at,files_checked:source.files.length,changed,head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),local_origin_main:git(['rev-parse','origin/main']),status:git(['status','--short']),head_unchanged:git(['rev-parse','HEAD'])===source.head};
result.authorized_source_changes=authorized;result.unexpected=unexpected;
writeFileSync(join(LOCAL,'preservation-current.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
if(unexpected.length||!result.head_unchanged)process.exitCode=2;
