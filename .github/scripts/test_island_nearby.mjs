import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const initial=JSON.parse(html.match(/var siteData=(\[.*?\]);/s)[1]);
const sites=initial.concat(...[...html.matchAll(/siteData=siteData\.concat\((\[.*?\])\);/gs)].map(m=>JSON.parse(m[1])));
const script=html.split('/* island-nearby:script:start */\n')[1].split('/* island-nearby:script:end */')[0];
const context={escapeHtml:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))};
vm.createContext(context);vm.runInContext(script,context);

test('six island groups cover all 20 existing markers, with no other places enabled',()=>{
  const expected=['1','101','102','103','2','104','105','106','63','127','128','129','130','4','117','118','119','110','111','64'].sort();
  assert.equal(context.ISLAND_NEARBY_PILOT.length,6);
  assert.equal(sites.length,240);
  assert.deepEqual(sites.filter(s=>context.islandNearbySearchHtml(s)).map(s=>s.id).sort(),expected);
  for(const invalid of [null,{...sites[0],country:'일본'},{...sites[0],island:false},{...sites[0],id:'9999'},{...sites[0],name:'다른 섬'}])assert.equal(context.islandNearbySearchHtml(invalid),'');
});

for(const group of context.ISLAND_NEARBY_PILOT)test(group.name+': exact encoded queries, safe new windows and no availability claims',()=>{
  for(const id of group.ids){
    const result=context.islandNearbySearchHtml(sites.find(s=>s.id===id));
    const links=[...result.matchAll(/<a class="nearby-search-link" href="([^"]+)" target="_blank" rel="noopener noreferrer"/g)];
    assert.equal(links.length,4);
    assert.deepEqual(links.map(m=>decodeURIComponent(m[1])),['음식점','숙박'].flatMap(term=>[
      'https://map.kakao.com/link/search/'+group.query+' '+term,
      'https://map.naver.com/p/search/'+group.query+' '+term]));
    assert.doesNotMatch(result,/<details[^>]*\bopen(?:\s|=|>)/);
    assert.match(result,/잔여 객실을 보장하지 않습니다/);
    assert.match(result,/선사·공식 예약처/);
    assert.doesNotMatch(result,/class="btn|<script|onclick=/);
  }
});

test('all executable inline scripts parse and shared popup uses one additive hook',()=>{
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/type="application\/ld\+json"/.test(match[1]))new vm.Script(match[2]);
  }
  assert.equal(html.split('    islandNearbySearchHtml(site)+\n').length-1,1);
  assert.doesNotMatch(script,/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|geolocation)\b/);
});
