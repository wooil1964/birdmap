/* Analysis only: actual recent-sites GET handler and original bonus helper, memory SQLite synthetic rows. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const repo=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_results'));
const prior=Number(process.env.GIT_CONFIG_COUNT||0);process.env.GIT_CONFIG_COUNT=String(prior+1);process.env['GIT_CONFIG_KEY_'+prior]='safe.directory';process.env['GIT_CONFIG_VALUE_'+prior]=repo;
const {handleRequest}=await import(pathToFileURL(path.join(repo,'reports-api/src/public.js')));
const {fakeDb,publicEnv,ORIGIN}=await import(pathToFileURL(path.join(repo,'reports-api/test/helpers.mjs')));
const {loadP1C}=await import(pathToFileURL(path.join(repo,'docs/recommendation-masterplan/_scripts/p1c_runtime.mjs')));
const rt=loadP1C(),NOW='2026-10-08T22:40:00+09:00',DAY='2026-10-08',SINCE='2026-09-24',OLD='2026-09-23';
const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return new NativeDate(NOW).getTime();}};
globalThis.fetch=async()=>{throw Error('Network is forbidden in synthetic analysis');};
let serial=0;
const row=(species,date=DAY)=>({id:'synthetic-'+(++serial),species,observed_on:date,status:'approved',site_id:'501',lat:0,lon:0});
async function query(rows,days=14){
 const db=fakeDb(rows),before=JSON.stringify(db.rows);
 const resp=await handleRequest(new Request('https://reports.example/reports/recent-sites?days='+days,{headers:ORIGIN}),publicEnv(db));
 assert.equal(resp.status,200);const body=await resp.json();assert.equal(JSON.stringify(db.rows),before);
 assert.deepEqual(Object.keys(body).sort(),['days','ok','since','sites','today']);
 assert.ok(body.sites.every(s=>Object.keys(s).sort().join('|')==='latestDate|siteId|species'));
 const sightings=Object.fromEntries(body.sites.map(s=>[s.siteId,s]));
 const api=rt.makeScenario({reports:true,cap:16},{sightings});
 const bonus=api.weeklyRecentReportBonus({id:'501'},DAY);
 return {days:body.days,since:body.since,today:body.today,sites:body.sites,bonus,rowsUnchanged:true,privateFieldsInResponse:0};
}
const duplicateRows=[0,1,2,3,4].map(age=>row('울새','2026-10-0'+(8-age)));
const duplicates=await query(duplicateRows);assert.equal(duplicates.bonus.speciesCount,1);assert.equal(duplicates.bonus.bonus,12);
const oldRow=row('울새 · 노랑할미새 · 힝등새 · 솔딱새',SINCE);
const oldOnly=await query([oldRow]);assert.equal(oldOnly.bonus.ageDays,14);assert.equal(oldOnly.bonus.bonus,6);
const refresh=await query([oldRow,row('울새')]);
assert.equal(refresh.sites[0].latestDate,DAY);assert.equal(refresh.bonus.speciesCount,4);assert.equal(refresh.bonus.ageDays,0);assert.equal(refresh.bonus.bonus,16);
const tight=await query([oldRow,row('울새')],1);assert.equal(tight.bonus.speciesCount,1);assert.equal(tight.bonus.bonus,12);
const quantity=await query([row('울새 · 울새1')]);assert.equal(quantity.bonus.speciesCount,2);assert.equal(quantity.bonus.bonus,14);
const outOfWindow=await query([row('울새',OLD)]);assert.deepEqual(outOfWindow.sites,[]);assert.equal(outOfWindow.bonus,null);
const future=await query([row('울새','2026-10-09')]);assert.deepEqual(future.sites,[]);assert.equal(future.bonus,null);
assert.equal(refresh.since,SINCE);
const cases=[
 {case:'five literal duplicate rows count once',actual:duplicates,interpretation:'Literal duplicate rows do not increase variety; no observer or effort weighting exists in this aggregate.'},
 {case:'old four literal strings only at inclusive day14 boundary',actual:oldOnly},
 {case:'new one-string row refreshes age of entire old four-string union',actual:refresh,interpretation:'16 vs previous6 is aggregate age/union behavior, not proof that old species were seen today.'},
 {case:'actual days1 SQL recomputes one-string union',actual:tight,interpretation:'Unlike client maxLatestAge filter, shorter SQL window reconstructs union from rows; operational row dates are unavailable in the frozen aggregate.'},
 {case:'quantity-looking suffix produces two literal strings',actual:quantity,diagnosticSuffixStripCount:1,interpretation:'Removing suffix is diagnostic only; no verified taxonomic identity or bird count inferred. Species count2 gives variety2 and total14.'},
 {case:'age15 row excluded',actual:outOfWindow},
 {case:'future row excluded',actual:future}
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const result={schemaVersion:1,codeCommit:rt.manifest.codeCommit,evaluationTime:NOW,scope:'Actual source GET handler + schema.sql with SQLite :memory:, synthetic rows only. No POST, production D1/API, coordinates, reporter details, deployment or source mutation.',sourceHashes:Object.fromEntries(['reports-api/src/public.js','reports-api/src/shared.js','reports-api/test/helpers.mjs','reports-api/schema.sql'].map(p=>[p,sha(fs.readFileSync(path.join(repo,p)))])),functionsSha256:rt.functionsHash,cases,passed:cases.length,failed:0,missingFromPublicAggregate:['species-specific observed_on','row-to-species relation','independent observer identity/count','observation effort','validated taxon identifiers','individual bird counts']};
fs.writeFileSync(path.join(out,'p1c_aggregation_contract.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,allPassed:true,duplicateBonus:duplicates.bonus.bonus,oldBonus:oldOnly.bonus.bonus,refreshedUnionBonus:refresh.bonus.bonus,days1Bonus:tight.bonus.bonus,quantityLiteralBonus:quantity.bonus.bonus,scope:result.scope},null,2));
