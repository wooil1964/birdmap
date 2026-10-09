import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const repo=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('No network allowed in local policy test');};
const api=await import(pathToFileURL(path.join(repo,'reports-api/src/public.js')));
const shared=await import(pathToFileURL(path.join(repo,'reports-api/src/shared.js')));
const {fakeDb,publicEnv,ORIGIN}=await import(pathToFileURL(path.join(repo,'reports-api/test/helpers.mjs')));
const now=new Date().toISOString(),today=shared.kstDateString(new Date()),species='저어새1';
const db=fakeDb([{id:'11111111-1111-4111-8111-111111111111',status:'approved',species,site_id:'501',lat:36,lon:126,observed_on:today}]);
async function get(url){const response=await api.handleLegacyRequest(new Request('https://reports.local'+url,{headers:ORIGIN}),publicEnv(db));assert.equal(response.status,200);return response.json();}
const approved=await get('/reports/approved'),history=await get('/reports/site/501'),recent=await get('/reports/recent-sites');
const approvedPolicy={actualSensitiveDetectorTrue:shared.isSensitiveReport({species:[species],speciesText:species,note:''}),approvedSpeciesReturned:approved.spots.some(s=>s.species.includes(species)),syntheticExactPointReturned:approved.spots.some(s=>s.lat===36&&s.lon===126),siteHistorySpeciesReturned:history.history.some(h=>h.species.includes(species)),siteHistoryTotal:history.total,recentBonusExcluded:recent.sites.length===0};
for(const x of ['actualSensitiveDetectorTrue','approvedSpeciesReturned','syntheticExactPointReturned','siteHistorySpeciesReturned','recentBonusExcluded'])assert.equal(approvedPolicy[x],true);
await db.prepare('INSERT INTO field_updates (id,species,status,lat,lon,public_lat,public_lon,location_hidden,nickname,created_at,updated_at,last_activity_at,user_hash,ip_hash) VALUES (?1,?2,?3,?4,?5,?4,?5,0,?6,?7,?7,?7,?8,?9)').bind('22222222-2222-4222-8222-222222222222',species,'visible',36,126,'synthetic',now,'synthetic-owner','synthetic-ip').run();
const field=await get('/field-updates');
const legacyFieldPolicy={syntheticStoredUnhiddenProtectedNameReturned:field.updates.some(u=>u.species===species&&u.locationHidden!==true),syntheticExactPublicPointReturned:field.updates.some(u=>u.lat===36&&u.lon===126),policyMeaning:'Stored location_hidden/public coordinates remain trusted on read; no operational rows inspected, no claim that such rows exist.'};
assert.equal(legacyFieldPolicy.syntheticStoredUnhiddenProtectedNameReturned,true);assert.equal(legacyFieldPolicy.syntheticExactPublicPointReturned,true);assert.equal(networkCalls,0);
const result={sha:'8ccb248faa2c5c7b5a6019d12e19e21031169460',approvedPolicy,legacyFieldPolicy,networkCalls,productionD1Writes:0,syntheticMemoryOnly:true,coordinatesLogged:false};
fs.writeFileSync(path.join(out,'s1p_policy.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
