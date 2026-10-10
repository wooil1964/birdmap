import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const review='C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap';
const target=review+'/docs/p1-s-review/.scratch/targetB',before=review+'/docs/p1-s-review/.scratch/beforeB';
const own='C:/Users/김진호/.codex/visualizations/2026/10/08/01a1190e-204e-7790-ad48-3431ee07838f/pr13_f23_b12_loader';
const kind=process.argv[2]||'node';
const sha={target:'b12e20c1b6d856a021898a0c1c9221b30393a221',before:'a35b8598d55890e705042e4d6f88621357749d09'};
const version=process.argv[3]||'target';
const out=path.join(own,version+'-contractF-'+kind);fs.mkdirSync(out,{recursive:true});
const args=[path.join(own,'scripts','loader_contractF_'+kind+'.mjs'),version==='target'?target:before,out,sha[version]];
const startedAt=new Date().toISOString();
const child=spawn('C:/Program Files/nodejs/node.exe',args,{cwd:review,windowsHide:true,env:{...process.env,...(kind==='dom'&&version==='before'?{LOADER_WIDTHS:'375'}:{})},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b.toString();process.stdout.write(b);});child.stderr.on('data',b=>{stderr+=b.toString();process.stderr.write(b);});
const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
const hash=x=>createHash('sha256').update(x).digest('hex');
const manifest={startedAt,endedAt:new Date().toISOString(),executable:'C:/Program Files/nodejs/node.exe',args,workdir:review,environment:{LOADER_WIDTHS:kind==='dom'&&version==='before'?'375':null},exitCode,stdoutSHA256:hash(stdout),stderrSHA256:hash(stderr),scriptHashes:Object.fromEntries(['contractF_cases.mjs','loader_contractF_node.mjs','loader_contractF_dom.mjs'].map(f=>[f,hash(fs.readFileSync(path.join(own,'scripts',f)))])),sourcePatches:0,assertionsDeleted:0,coordinatesLogged:false};
fs.writeFileSync(path.join(out,'stdout.txt'),stdout);fs.writeFileSync(path.join(out,'stderr.txt'),stderr);fs.writeFileSync(path.join(out,'execution_manifest.json'),JSON.stringify(manifest,null,2)+'\n');process.exitCode=exitCode;


