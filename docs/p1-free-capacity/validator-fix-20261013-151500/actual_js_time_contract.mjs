import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=process.argv[2],cases=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),html=fs.readFileSync(root+'/index.html','utf8');
const core=html.slice(html.indexOf('function weeklyScoreValid('),html.indexOf('/* 만조(날짜 +'));
const state=html.slice(html.indexOf('function weatherTimeMs('),html.indexOf('/* 점수는 출처에서 검증된'));
assert(core&&state);const c=vm.createContext({Date});vm.runInContext(core+'\n'+state,c);
const rows=cases.map(x=>({id:x.id,timestamp:c.weeklyForecastTimestamp(x.text),weatherState:x.mode==='today'?c.storedWeatherState(x.day,x.root,new Date(x.evaluation),x.site):null}));
console.log(JSON.stringify(rows));
