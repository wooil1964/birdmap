import{spawnSync}from'node:child_process';import{readFileSync,writeFileSync,mkdirSync,readdirSync}from'node:fs';import{resolve,join}from'node:path';
const root=resolve(process.argv[2]||'.'),out=resolve(process.argv[3]||join(root,'docs/p1-publication-security-implementation/results/root')),scope=process.argv[4]||'front';mkdirSync(out,{recursive:true});
const py='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const env={...process.env,CHROME_PATH:'C:/Program Files/Google/Chrome/Application/chrome.exe',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',PATH:'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python;'+process.env.PATH};
let fileList=[],cmd=process.execPath,args=[],cwd=root;
if(scope==='front'){fileList=readdirSync(join(root,'.github/scripts')).filter(f=>/^test_.*\.mjs$/.test(f)).map(f=>'.github/scripts/'+f);args=['--test','--test-reporter=tap',...fileList];}
else if(scope==='reports'){cwd=join(root,'reports-api');args=['--test','--test-reporter=tap'];}
else if(scope==='proxy'){fileList=readdirSync(join(root,'weather-proxy/test')).filter(f=>f.endsWith('.test.mjs')).map(f=>'weather-proxy/test/'+f);args=['--test','--test-reporter=tap',...fileList];}
else {cmd=py;args=['.github/scripts/test_'+scope+'.py'];}
const start=new Date().toISOString(),r=spawnSync(cmd,args,{cwd,env,encoding:'utf8',maxBuffer:1<<27}),end=new Date().toISOString(),output=(r.stdout||'')+(r.stderr||'');writeFileSync(join(out,scope+'.tap'),output);
const counts={};for(const n of ['tests','pass','fail','skipped','cancelled','todo']){const m=output.match(new RegExp('^# '+n+' (\\d+)$','m'));if(m)counts[n]=Number(m[1]);}
const failures=[...output.matchAll(/^not ok \d+ - (.*)$/gm)].map(m=>m[1]);const receipt={scope,root,cwd,cmd,args,env:{CHROME_PATH:env.CHROME_PATH,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},start,end,exit:r.status,signal:r.signal,counts,failures};writeFileSync(join(out,scope+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));process.exitCode=r.status||0;
