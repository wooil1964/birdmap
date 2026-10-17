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
  const names = ['spotKakaoRouteUrl','spotKakaoRouteHtml','escapeHtml','tmapNavigationUrl','tmapNavigationLink','spotTmapRouteHtml','spotRouteButtonsHtml'];
  const consts = '';
  return new Function('updates', 'NOW',
    "var document={hidden:false};function publicationInvalidate(){publicationState.ready=false;publicationState.until=0;}var PUBLICATION_MAX_AGE=5000,publicationState={ready:true,until:Date.now()+5000,checkedMono:performance.now()};var FIELD_TTL_HOURS_DEFAULT=8,fieldTtlHours=8,fieldClockOffset=0,fieldUpdates=updates;function fieldNowMs(){return NOW;}" +
    consts + '\n' + names.map(functionSource).join('\n') +
    '\nreturn {' + names.join(',') + ',expireAuthority(){publicationState.until=0;},expireMonotonic(){publicationState.until=Date.now()+5000;publicationState.checkedMono=performance.now()-5001;},unknownAuthority(){publicationState.ready=false;}};')(updates, NOW);
}
const upd = (id, status, minAgo, extra = {}) => Object.assign({ id, species: 's' + id, status, lat: 36.6, lon: 126.4,
  updatedAt: new Date(NOW - minAgo * 60000).toISOString(), lastConfirmedAt: null }, extra);

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
