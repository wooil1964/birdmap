import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=(name,next)=>html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'('));
const c={escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),reporterStatsHistoryHtml:()=> '익명 제보',SPOT_HISTORY_VISIBLE:5,publicationAllowed:()=>true};
vm.createContext(c);
for(const [name,next] of [['spotSpeciesCoveredByHistory','spotKakaoRouteUrl'],['siteHistoryEntryHtml','clearSiteHistoryCache'],['reportSpeciesCountsHtml','spotHistoryHtml'],['spotHistoryHtml','birdmapShowAllSpotHistory'],['spotKakaoRouteUrl','spotPopupHtml'],['spotPopupHtml','birdmapSpotMarker'],['pendingPopupHtml','birdmapPendingMarker']])vm.runInContext(source(name,next),c);
const one=(name,count,countStatus=count===null?'not_recorded':'reported')=>({name,count,countStatus});
const entry={date:'2026-11-08',species:['동박새','박새','직박구리'],sightings:[one('동박새',3),one('박새',2),one('직박구리',1)]};
test('공개 이력·자동 공개 상세: 종별 수량·3종 6개체, 상태 문구(미검증·관리자 확인 전) 없음, 원 DTO 보존',()=>{
  const before=JSON.stringify(entry);const approved=c.spotHistoryHtml([entry]);
  for(const text of ['동박새 3개체','박새 2개체','직박구리 1개체','3종 · 입력된 개체수 6개체'])assert.ok(approved.includes(text),text);
  const site=c.siteHistoryEntryHtml(entry);assert.ok(site.includes('3종 · 입력된 개체수 6개체'));
  const pending=c.pendingPopupHtml({...entry,verified:false});
  for(const text of ['출현종','관찰일','3종 · 입력된 개체수 6개체'])assert.ok(pending.includes(text),text);
  for(const text of ['미검증','관리자 확인 전','아직 관리자가 확인하지 않았','자동 공개(미검증)'])assert.ok(!pending.includes(text),'상태 문구 없음: '+text);
  assert.equal(JSON.stringify(entry),before);
});
test('일부·전체 개체수 미입력과 불확실 값은 1로 채우거나 합산하지 않음',()=>{
  const partial=c.reportSpeciesCountsHtml({sightings:[one('동박새',3),one('박새',2),one('직박구리',null)]});
  assert.ok(partial.includes('직박구리 (개체수 미입력)'));assert.ok(partial.includes('3종 · 입력된 개체수 합계 5개체'));assert.ok(!partial.includes('6개체'));
  const empty=c.reportSpeciesCountsHtml({sightings:[one('동박새',null),one('박새',null)]});
  assert.ok(empty.includes('2종 · 개체수 미입력'));assert.ok(!empty.includes('1개체'));
  const ambiguous=c.reportSpeciesCountsHtml({sightings:[one('동박새',null,'uncertain'),one('박새',2)]});
  assert.ok(ambiguous.includes('개체수 확인 필요'));assert.ok(ambiguous.includes('입력된 개체수 합계 2개체'));
});
test('서로 다른 관찰 이력 수량을 합치지 않고, HTML 이스케이프와 위치 가림·길찾기 유지',()=>{
  const combined=c.spotHistoryHtml([entry,{...entry,date:'2026-11-07'}]);
  assert.equal(combined.split('입력된 개체수 6개체').length-1,2);assert.ok(!combined.includes('12개체'));
  assert.ok(!c.reportSpeciesCountsHtml({sightings:[one('<img src=x>',3)]}).includes('<img'));
  const hidden=c.spotPopupHtml('출현 지점',entry.species,[entry],false,true,{lat:37,lon:127});
  assert.ok(hidden.includes('위치 보호'));assert.ok(!hidden.includes('map.kakao.com'));assert.ok(!hidden.includes('tmap://'));
  const visible=c.spotPopupHtml('출현 지점',entry.species,[entry],false,false,{lat:37,lon:127});
  assert.ok(visible.includes('https://map.kakao.com/link/to/'));assert.ok(visible.includes('tmap://route?goalname='));assert.ok(visible.includes('goalx=127&amp;goaly=37'));
});
