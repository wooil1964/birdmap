import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const root=resolve(process.argv[2]||process.cwd());
const output=resolve(process.argv[3]||join(root,'docs/p1-publication-security-implementation/results/integration'));
const tree=process.argv[4];if(!/^[0-9a-f]{40}$/.test(tree||''))throw new Error('Provide exact merged tree SHA. No actual merge is performed.');
mkdirSync(output,{recursive:true});
const py='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const scratch=resolve(root,'.tmp','p1-publication-integration-'+tree.slice(0,12));
if(!scratch.startsWith(resolve(root,'.tmp')+'/')&&!scratch.startsWith(resolve(root,'.tmp')+'\\'))throw Error('Scratch target escapes workspace');
mkdirSync(scratch,{recursive:true});
const archive=join(scratch,'source.zip');
execFileSync('git',['archive','--format=zip','--output='+archive,tree],{cwd:root});
execFileSync(py,['-c','import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,scratch],{cwd:root});
const env={...process.env,CHROME_PATH:'C:/Program Files/Google/Chrome/Application/chrome.exe',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',PATH:'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python;'+process.env.PATH};
function run(name,cmd,args,cwd=scratch){const start=new Date().toISOString(),r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',maxBuffer:1<<28}),end=new Date().toISOString(),log=(r.stdout||'')+(r.stderr||'');writeFileSync(join(output,name+'.log'),log);const counts={};for(const n of ['tests','pass','fail','skipped','cancelled','todo']){const m=log.match(new RegExp('^# '+n+' (\\d+)$','m'));if(m)counts[n]=Number(m[1]);}const pm=log.match(/Ran (\d+) tests?/),skip=log.match(/skipped=(\d+)/);if(pm){counts.tests=Number(pm[1]);counts.skipped=skip?Number(skip[1]):0;const failures=log.match(/failures=(\d+)/),errors=log.match(/errors=(\d+)/);counts.fail=(failures?Number(failures[1]):0)+(errors?Number(errors[1]):0);counts.pass=counts.tests-counts.fail-counts.skipped;}
const receipt={name,tree,root:scratch,cwd,command:[cmd,...args],start,end,exit:r.status,signal:r.signal,counts,failures:[...log.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1])};writeFileSync(join(output,name+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));return receipt;}
const suites=[];
const fronts=readdirSync(join(scratch,'.github/scripts')).filter(f=>/^test_.*\.mjs$/.test(f)).map(f=>'.github/scripts/'+f);
if(process.env.INTEGRATION_SKIP_FRONT!=='1')suites.push(run('front',process.execPath,['--test','--test-reporter=tap',...fronts]));
for(const name of ['publication-security.test.mjs','publication-path.test.mjs']){try{readFileSync(join(scratch,'reports-api/test',name));}catch{copyFileSync(join(root,'reports-api/test',name),join(scratch,'reports-api/test',name));}}
suites.push(run('reports',process.execPath,['--test','--test-reporter=tap'],join(scratch,'reports-api')));
const proxy=readdirSync(join(scratch,'weather-proxy/test')).filter(f=>f.endsWith('.test.mjs')).map(f=>'weather-proxy/test/'+f);
suites.push(run('proxy',process.execPath,['--test','--test-reporter=tap',...proxy]));
for(const suite of ['weather','tide','share_pages'])suites.push(run(suite,py,['.github/scripts/test_'+suite+'.py']));
const fixed=run('fixed-recommendations',process.execPath,['.github/scripts/compare_p1s_recommendation.mjs','b12e20c1b6d856a021898a0c1c9221b30393a221',tree]);
let comparison=null;
if(fixed.exit===0){const actual=JSON.parse(readFileSync(join(output,'fixed-recommendations.log'),'utf8')),before=actual.out.b12e20c1b6d856a021898a0c1c9221b30393a221,after=actual.out[tree];comparison={clock:actual.now,weekGeneratedAt:actual.weekGeneratedAt,withSightings:{siteCount:after.withSightings.siteCount,candidates:after.withSightings.candidates,signature:after.withSightings.allCandidateSignature,sameAllSignature:before.withSightings.allCandidateSignature===after.withSightings.allCandidateSignature,sameTop:JSON.stringify(before.withSightings.top)===JSON.stringify(after.withSightings.top)},withoutSightings:{siteCount:after.withoutSightings.siteCount,candidates:after.withoutSightings.candidates,signature:after.withoutSightings.allCandidateSignature,sameAllSignature:before.withoutSightings.allCandidateSignature===after.withoutSightings.allCandidateSignature,sameTop:JSON.stringify(before.withoutSightings.top)===JSON.stringify(after.withoutSightings.top)}};writeFileSync(join(output,'fixed-summary.json'),JSON.stringify(comparison,null,2)+'\n');}
const summary={tree,scratch,suites,comparison};writeFileSync(join(output,'suite-summary.json'),JSON.stringify(summary,null,2)+'\n');
process.exitCode=suites.some(x=>x.exit!==0)||fixed.exit!==0||!comparison||Object.values(comparison).some(x=>x&&typeof x==='object'&&('sameTop'in x)&&(!x.sameTop||!x.sameAllSignature))?1:0;

