/* 현장소식 작은 박스·거리별 길안내 순수 로직 회귀 테스트. index.html 의 실제 함수 소스를 꺼내 검증한다.
   실행: node --test .github/scripts/test_field_news.mjs
   DOM·지도·GPS 동작(마커 보기, 방향 유도, 겹침)은 브라우저에서 따로 확인한다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8');

function functionSource(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, '함수가 없습니다: ' + name);
  let depth = 0, quote = null;
  for (let i = HTML.indexOf('{', start); i < HTML.length; i++) {
    const c = HTML[i], prev = HTML[i - 1];
    if (quote) { if (c === quote && prev !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('중괄호 불일치: ' + name);
}

const NOW = Date.parse('2026-10-08T10:00:00+09:00');
function load(updates) {
  const names = ['fieldNewsList', 'fieldPublicPoint', 'fieldNavMode', 'fieldNavDistanceText', 'spotKakaoRouteUrl', 'spotKakaoRouteHtml',
    'fieldActivityMs', 'fieldAgeMin', 'fieldIsActive', 'haversineKm', 'publicationAllowed','escapeHtml','tmapNavigationUrl','tmapNavigationLink','spotTmapRouteHtml','spotRouteButtonsHtml'];
  const consts = HTML.match(/var FIELD_NEWS_PC_MAX=[^\n]+/)[0];
  return new Function('updates', 'NOW',
    "var PUBLICATION_MAX_AGE=5000,publicationState={ready:true,until:Date.now()+5000,checkedMono:performance.now()};var FIELD_TTL_HOURS_DEFAULT=3,fieldTtlHours=3,fieldClockOffset=0,fieldUpdates=updates;function fieldNowMs(){return NOW;}" +
    consts + '\n' + names.map(functionSource).join('\n') +
    '\nreturn {' + names.join(',') + ',expireAuthority(){publicationState.until=0;},expireMonotonic(){publicationState.until=Date.now()+5000;publicationState.checkedMono=performance.now()-5001;},unknownAuthority(){publicationState.ready=false;}};')(updates, NOW);
}
const upd = (id, status, minAgo, extra = {}) => Object.assign({ id, species: 's' + id, status, lat: 36.6, lon: 126.4,
  updatedAt: new Date(NOW - minAgo * 60000).toISOString(), lastConfirmedAt: null }, extra);

test('박스 목록: 지금 보여요·다시 나타남만, 유효시간 안, 최신 확인순', () => {
  const api = load([upd('a', 'visible', 30), upd('b', 'reappeared', 5), upd('c', 'searching', 1), upd('d', 'not_visible', 1),
    upd('e', 'visible', 181), upd('f', 'visible', 100, { lastConfirmedAt: new Date(NOW - 2 * 60000).toISOString() })]);
  assert.deepEqual(api.fieldNewsList().map((u) => u.id), ['f', 'b', 'a']);
  assert.deepEqual(load([]).fieldNewsList(), []);
  assert.deepEqual(load([upd('c', 'searching', 1), upd('d', 'not_visible', 1)]).fieldNewsList(), []);
});

test('등록자가 달라도 공개 소식은 같은 목록·같은 길안내 대상이다', () => {
  const api = load([upd('a', 'visible', 5, { nickname: '나' }), upd('b', 'visible', 6, { nickname: '다른 탐조인' })]);
  assert.equal(api.fieldNewsList().length, 2);
  assert.ok(api.fieldPublicPoint(api.fieldNewsList()[0]) && api.fieldPublicPoint(api.fieldNewsList()[1]));
});

test('거리 기준: 29.9km·30.0km는 방향 유도, 30.1km는 내비게이션', () => {
  const api = load([]);
  assert.equal(api.fieldNavMode(29.9), 'guide');
  assert.equal(api.fieldNavMode(30), 'guide');
  assert.equal(api.fieldNavMode(30.0001), 'navigate');
  assert.equal(api.fieldNavMode(30.1), 'navigate');
  assert.equal(api.fieldNavMode(0), 'guide');
});

test('위치 보호·비정상 좌표는 길안내 좌표가 없다', () => {
  const api = load([]);
  assert.equal(api.fieldPublicPoint(upd('h', 'visible', 1, { locationHidden: true })), null);
  for (const bad of [{ lat: NaN }, { lon: Infinity }, { lat: 91 }, { lon: -181 }, { lat: '36.6' }]) assert.equal(api.fieldPublicPoint(upd('x', 'visible', 1, bad)), null, JSON.stringify(bad));
  assert.deepEqual(api.fieldPublicPoint(upd('ok', 'visible', 1)), { lat: 36.6, lon: 126.4 });
});

test('현장 길찾기: 권한이 미확인 또는 만료면 정상 좌표도 내보내지 않는다',()=>{
  for(const mode of ['expireAuthority','expireMonotonic','unknownAuthority']){const api=load([]);api[mode]();assert.equal(api.fieldPublicPoint(upd('ok','visible',1)),null);}
});

test('거리 문구는 직선 약 km이고 위치 오차가 크면 오차를 함께 밝힌다', () => {
  const api = load([]);
  assert.equal(api.fieldNavDistanceText(29.94, 20), '직선 약 30 km');
  assert.equal(api.fieldNavDistanceText(4.26, 20), '직선 약 4.3 km');
  assert.match(api.fieldNavDistanceText(30.5, 1500), /위치 오차 ±1500 m/);
});

test('카카오맵·티맵은 같은 공개 좌표의 정확 URL을 유지하고 두 앱 링크를 함께 표시한다', () => {
  const api = load([]);
  assert.equal(api.spotKakaoRouteUrl({ lat: 36.6, lon: 126.4 }), 'https://map.kakao.com/link/to/' + encodeURIComponent('출현 지점') + ',36.6,126.4');
  assert.equal(api.spotKakaoRouteHtml({ lat: 36.6, lon: 126.4 }),
    '<a class="spotKakaoRoute" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/' + encodeURIComponent('출현 지점') + ',36.6,126.4">🚗 카카오맵</a>');
  assert.equal(api.spotKakaoRouteHtml({ lat: 'x', lon: 1 }), '');
  assert.equal(api.spotKakaoRouteUrl({ lat: 100, lon: 1 }), '');
  const tmap='tmap://route?goalname='+encodeURIComponent('출현 지점')+'&goalx=126.4&goaly=36.6';
  assert.equal(api.tmapNavigationUrl({lat:36.6,lon:126.4},'출현 지점'),tmap);
  const buttons=api.spotRouteButtonsHtml({lat:36.6,lon:126.4});
  assert.equal((buttons.match(/<a /g)||[]).length,2);assert.match(buttons,/class="spotRouteButtons"/);assert.match(buttons,/class="spotKakaoRoute"/);assert.match(buttons,/class="spotTmapRoute"/);
  assert.ok(buttons.includes(api.escapeHtml(tmap)));assert.equal(api.spotRouteButtonsHtml({lat:100,lon:1}),'');
});

test('위치정보를 저장·전송하는 코드가 새 길안내에 없다', () => {
  const block = HTML.slice(HTML.indexOf('/* ── 현장소식 작은 박스'), HTML.indexOf('function fieldToast('));
  assert.ok(block.length > 1000);
  for (const banned of ['localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'XMLHttpRequest', 'fieldApi(']) assert.ok(!block.includes(banned), banned);
});

test('외부 길안내는 자동 창 대신 실제 두 앱 선택창을 만들고 보호·미확인 좌표는 만들지 않는다', () => {
  function node(tag){return{tag,children:[],style:{},setAttribute(k,v){this[k]=v;},appendChild(child){child.parentNode=this;this.children.push(child);return child;},removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;}};}
  const document={body:node('body'),createElement:node};let opened=0;
  const names=['publicationAllowed','fieldPublicPoint','fieldNavDistanceText','spotKakaoRouteUrl','tmapNavigationUrl','openTmapNavigation','fieldLine','fieldNewsButton','fieldNavChoiceClose','fieldNavChooser','fieldNavExternal'];
  const body='var PUBLICATION_MAX_AGE=5000,publicationState={ready:true,until:Date.now()+5000,checkedMono:performance.now()};function fieldEl(id){return document.body.children.find(n=>n.id===id)||null;}function fieldNavManualGuide(){}'+names.map(functionSource).join('\n')+';return{fieldNavExternal,fieldNavChoiceClose,unknown(){publicationState.ready=false;}};';
  const api=new Function('document','window','navigator','alert',body)(document,{open(){opened++;throw new Error('Must not auto-open');}},{userAgent:'Android synthetic'},()=>{throw new Error('Unexpected desktop alert');});
  const visible=upd('normal','visible',1);api.fieldNavExternal(visible,40,10);
  assert.equal(opened,0);assert.equal(document.body.children.length,1);
  const box=document.body.children[0];assert.equal(box.id,'fieldNavChoice');assert.equal(box['data-field-id'],'normal');
  const anchors=box.children.flatMap(child=>child.children||[]).filter(child=>child.tag==='a');
  assert.deepEqual(anchors.map(a=>a.textContent),['카카오맵','티맵']);
  assert.equal(anchors[0].href,'https://map.kakao.com/link/to/'+encodeURIComponent(visible.species)+',36.6,126.4');assert.equal(anchors[0].target,'_blank');assert.equal(anchors[0].rel,'noopener');
  assert.equal(anchors[1].href,'tmap://route?goalname='+encodeURIComponent(visible.species)+'&goalx=126.4&goaly=36.6');
  api.fieldNavChoiceClose();assert.equal(document.body.children.length,0);
  for(const point of [{...visible,locationHidden:true},{...visible,lat:NaN},{...visible,lon:181}]){api.fieldNavExternal(point,40,10);assert.equal(document.body.children.length,0);}
  api.unknown();api.fieldNavExternal(visible,40,10);assert.equal(document.body.children.length,0);assert.equal(opened,0);
});

test('내 현장소식 삭제: 확인창 승인 뒤에만 서버로 요청하고, 버튼은 이 브라우저가 등록한 소식에만 보이며 소유권은 서버가 판단한다', () => {
  const del = HTML.slice(HTML.indexOf('function fieldDelete('), HTML.indexOf('function fieldRemoveLocal('));
  assert.ok(del.indexOf('window.confirm(') >= 0 && del.indexOf('window.confirm(') < del.indexOf('fieldApi('), '확인창이 요청보다 먼저');
  assert.ok(del.includes("'/field-updates/'+id+'/delete','POST',{deviceId:fieldDeviceId()}"));
  assert.ok(!/nickname|userHash|isOwner/.test(del), '닉네임 등으로 권한을 정하지 않는다');
  assert.ok(del.includes('result.status===403||result.status===404'), '서버 거부 시 기록·화면을 서버 기준으로 맞춘다');
  const popup = HTML.slice(HTML.indexOf('function fieldPopupNode('), HTML.indexOf('/* ── 현장 방향 안내'));
  assert.ok(popup.includes('if(fieldIsMine(update.id))add(') && popup.includes('내 현장소식 삭제'));
  const create = HTML.slice(HTML.indexOf('fieldMineAdd(result.body.id)') - 300, HTML.indexOf('fieldMineAdd(result.body.id)') + 300);
  assert.ok(create.includes("fieldApi('/field-updates','POST',payload)") || create.includes('fieldValidUpdate'), '등록 성공 때만 내 소식으로 기록');
  assert.equal(HTML.split('fieldMineAdd(').length - 1, 2, 'fieldMineAdd 는 정의 1곳 + 등록 성공 1곳');
  assert.ok(create.includes('loadFieldUpdates()'),'좌표없는 receipt 뒤 최신 공개 목록을 다시 확인한다');
});
