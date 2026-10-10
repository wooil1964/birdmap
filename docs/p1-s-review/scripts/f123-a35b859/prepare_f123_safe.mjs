import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.dirname((await import('node:url')).fileURLToPath(import.meta.url));
let source=fs.readFileSync(path.join(dir,'independent_original.mjs'),'utf8');
const once=(before,after)=>{assert.equal(source.split(before).length,2,'Expected exactly one transform location: '+before.slice(0,100));source=source.replace(before,after);};
once("phase('fresh_today_arrives',['14','15']", "phase('fresh_today_arrives',[]");
once("phase('partial_reference_today',['14']", "phase('partial_reference_today',[]");
once("row.passed=true;\n if(width===375",`if(['fresh_today_arrives','partial_reference_today'].includes(name)){
 row.policyChange={contract:'F2 batch provenance consistency',originalExpectedIds:name==='fresh_today_arrives'?['14','15']:['14'],safeExpectedIds:[],assertionsRetained:true};
 row.provenance=await browser.eval(page,'({root:weatherToday.generatedAt,items:Object.fromEntries(Object.entries(weatherToday.sites).map(([id,raw])=>[id,{generatedAt:raw.generatedAt,scoreEligible:storedWeatherState(raw,weatherToday,undefined,siteData.find(s=>String(s.id)===id)).scoreEligible}]))})');
 row.referencePopups=[];
 for(const id of ['14','15']){
 await browser.eval(page,'(function(){var s=siteData.find(s=>String(s.id)==='+JSON.stringify(id)+');window.__testedSite=s;var m=map_7010a44f6ac2025090f0fe07508ed485;m.closePopup();toggleTodayPanel(false);m.setView([s.lat,s.lon],11,{animate:false});markerRegistry[markerKey(s)].addTo(m).openPopup();refreshOpenBirdPopup();return true;})()');
 await browser.wait(page,'document.querySelector('+JSON.stringify('.leaflet-popup-content [data-live-weather-site-id="'+id+'"] [data-live-weather-field=score]')+')!==null',10000);
 const popup=await browser.eval(page,readPopup);assert.equal(popup.popupScore,'오늘 적합도 미확인');assert.equal(popup.popupAllowed,false);assert.ok(popup.popupHasTemperature&&popup.popupHasWind,'F2 invalid provenance retains reference weather');row.referencePopups.push({siteId:id,...popup});
 await browser.eval(page,'map_7010a44f6ac2025090f0fe07508ed485.closePopup();toggleTodayPanel(true);true');
 }
 }
 row.passed=true;
 if(width===375`);
once("await phase('valid_week_recovery',['14','15'],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});", `await phase('valid_week_recovery',['14','15'],async()=>{const result=await reloadWeek();assert.equal(result,true);return result;});
 // Independent matched provenance controls; original mismatch fixtures remain above.
 activeFixture={todayDocument:referenceDoc('10:30'),week:null,tide:tide('14')};
 await browser.eval(page,'weatherToday='+JSON.stringify(activeFixture.todayDocument)+';weatherWeek=null;birdmapDataSeq={};renderTodayPanel();toggleTodayPanel(true);true');
 activeFixture.todayDocument={date,generatedAt:date+' 10:31 KST',sites:{14:raw({generatedAt:date+' 10:31 KST'}),15:raw({generatedAt:date+' 10:31 KST'})}};
 await phase('consistent_fresh_today_arrives',['14','15'],async()=>{const result=await reloadToday();assert.equal(result,true);return result;});
 activeFixture.todayDocument={date,generatedAt:date+' 10:32 KST',sites:{14:raw({generatedAt:date+' 10:32 KST'}),15:raw({generatedAt:date+' 05:41 KST'})}};
 await phase('consistent_partial_reference_today',['14'],async()=>{const result=await reloadToday();assert.equal(result,true);return result;});`);
source=source.replaceAll("['array_forecast','array_publication']","['array_forecast','array_publication','object_forecast','object_publication']");
source=source.replaceAll("name==='array_forecast'", "name.endsWith('_forecast')");
source=source.replaceAll("name==='array_publication'", "name.endsWith('_publication')");
source=source.replaceAll("?[invalidTime]:invalidTime", "?(name.startsWith('array_')?[invalidTime]:{toString:'not-callable'}):invalidTime");
source=source.replaceAll("doc.generatedAt=[date+' 10:30 KST'];", "doc.generatedAt=name.startsWith('array_')?[date+' 10:30 KST']:{toString:'not-callable'};");
source=source.replaceAll("?[invalidTime]:doc.generatedAt", "?(name.startsWith('array_')?[invalidTime]:{toString:'not-callable'}):doc.generatedAt");
source=source.replace('((process.env.FINAL_BOAT_ONLY||process.env.FINAL_TYPED_ONLY)?[]:scenarios)','((process.env.F123_LIFECYCLE_ONLY||process.env.FINAL_BOAT_ONLY||process.env.FINAL_TYPED_ONLY)?[]:scenarios)');fs.writeFileSync(path.join(dir,'independent_f123_safe.mjs'),source);
console.log(JSON.stringify({output:path.join(dir,'independent_f123_safe.mjs'),originalAssertionsPreserved:true,lifecycleExpectedChanges:2,matchedControls:2,typedArrays:2,typedObjects:2}));
