import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {LOCAL,ROOT} from './staging-control.mjs';
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
async function read(path){const r=await fetch('https://api.github.com/repos/wooil1964/birdmap/'+path,{headers:{'User-Agent':'birdmap-phase2c-readonly'}});if(!r.ok)throw Error('GITHUB_READ_'+r.status);return r.json();}
const latest=(await read('commits/main')).sha,comparison=await read(`compare/${head}...${latest}`);
const files=comparison.files.map(f=>f.filename),allowed=new Set(['weather_today.json','weather_week.json','tide_today.json','tide_month.json','tide_health.json']);
const drift=files.filter(f=>!allowed.has(f));
const result={checked_at:new Date().toISOString(),head,remote_main:latest,ahead:comparison.ahead_by,behind:comparison.behind_by,files,status:drift.length?'PHASE_2C_STOP_REMOTE_CODE_DRIFT':'WEATHER_TIDE_DATA_ONLY',unexpected:drift,fetch_pull_merge:false};
writeFileSync(join(LOCAL,'remote-main-current.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(drift.length)process.exitCode=2;
