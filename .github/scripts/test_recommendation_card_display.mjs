/* PR #13 R4: 정상 today 만조 fallback 에서 추천 카드와 탐조지 팝업의 점수·유효성 표시가 같아야 한다.
   실제 index.html 을 Chrome 으로 띄워 renderTodayPanel() 이 만든 카드 DOM 과 v23TodayWeatherHtml() 이 만든 팝업 DOM 을 함께 읽는다.
   (함수 반환값만 비교하지 않는다.) 화면 라이브러리 CDN 외의 네트워크(제보 API·분석·Turnstile)는 DNS 로 막고 시계·자료는 메모리에서 주입한다.
   실행: CHROME_PATH=<chrome> node --test .github/scripts/test_recommendation_card_display.mjs (Chrome 이 없으면 skip) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* 실제 update_weather.build_site_result 가 만든 sparse 6시간 출력(test_weather.py 가 같은 입력으로 재생성해 일치를 확인한다). */
const SPARSE6H = JSON.parse(readFileSync(join(ROOT, '.github/scripts/fixtures/sparse6h_today_site14.json'), 'utf8'));
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome', process.env.CHROME_PATH]
  .filter(Boolean).find((path) => existsSync(path));
const SKIP = CHROME ? false : 'Chromium 없음';

/* 2026-10-10 11:00 KST. 오늘 저장 기상은 10:30 에 생성됐고(10:17 예약 이후) 예보는 12:00, 만조는 12:00 이다. */
const NOW = '2026-10-10T11:00:00+09:00';
const DATE = '2026-10-10';
const raw = (extra = {}) => Object.assign({ name: '걸매리', date: DATE, generatedAt: DATE + ' 10:30 KST', refreshedAt: DATE + ' 10:30 KST', sourceType: 'saved_forecast',
  stale: false, scoreEligible: true, missingScoreFields: [], score: 92, grade: '★★★★★', summary: '좋음', wind: '북풍 3.0m/s', rain: '강수 없음',
  forecastTime: DATE + ' 12:00 KST', temperature: '20.0°C', visibility: '15.0km', cloud: '20%', wave: '0.3m' }, extra);
const tides = (rows) => ({ sites: { 14: { days: rows.map(([highTide, highTideLevel]) => ({ date: DATE, highTide, highTideLevel })) } } });
const BOOST = { 14: { latestDate: '2026-10-09', species: ['a', 'b', 'c', 'd'] } };
const sample = (time, score, extra = {}) => Object.assign({ forecastTime: DATE + ' ' + time + ' KST', windSpeed: 3, windDirectionDeg: 0, windName: '북풍', gust: 5,
  precipitation3h: 0, temperature: 20, visibilityKm: 15, cloudPct: 20, waveM: 0.3, score, grade: '★★★★★', scoreEligible: true, missingScoreFields: [], isPastAtGeneration: false }, extra);
const weekWith = (sites) => ({ startDate: DATE, endDate: '2026-10-16', generatedAt: DATE + ' 10:30 KST', sampleIntervalHours: 3, sites });

class Page {
  static async open() {
    const profile = mkdtempSync(join(tmpdir(), 'birdmap-r4-'));
    const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE cdn.jsdelivr.net, EXCLUDE code.jquery.com, EXCLUDE cdnjs.cloudflare.com, EXCLUDE netdna.bootstrapcdn.com', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools 미기동:\n' + stderr.slice(0, 400))), 30000);
      proc.stderr.on('data', (chunk) => { stderr += chunk; const m = stderr.match(/ws:\/\/\S+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    });
    const socket = new WebSocket(endpoint);
    await new Promise((resolve) => socket.addEventListener('open', resolve));
    const page = new Page(proc, socket, profile);
    await page.attach();
    return page;
  }

  constructor(proc, socket, profile) {
    Object.assign(this, { proc, socket, profile, seq: 0, pending: new Map(), waiters: [] });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      } else if (message.method) {
        this.waiters = this.waiters.filter((w) => (w.method === message.method ? (w.resolve(), false) : true));
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async attach() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId: this.session } = await this.send('Target.attachToTarget', { targetId, flatten: true }));
    await this.send('Page.enable', {}, this.session);
    await this.send('Runtime.enable', {}, this.session);
    const loaded = new Promise((resolve) => this.waiters.push({ method: 'Page.loadEventFired', resolve }));
    await this.send('Page.navigate', { url: pathToFileURL(join(ROOT, 'index.html')).href }, this.session);
    await loaded;
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, this.session);
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails.exception || exceptionDetails.text));
    return result.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 700 }, this.session);
  }

  dispose() {
    try { this.socket.close(); } catch { /* 이미 닫힘 */ }
    this.proc.kill();
    try { rmSync(this.profile, { recursive: true, force: true }); } catch { /* 임시 프로필 */ }
  }
}

/* 시나리오 하나를 페이지에 주입하고 걸매리(14) 추천 카드와 같은 장소 팝업의 점수 표시를 읽는다. */
const READ = (scenario) => `(async function(){
  var RealDate=Date, fixed=new RealDate(${JSON.stringify(NOW)}).getTime();
  window.Date=class extends RealDate{constructor(){var a=[].slice.call(arguments);super(...(a.length?a:[fixed]));}static now(){return fixed;}};
  var sc=${JSON.stringify(scenario)};
  weatherWeek=sc.week||null; weatherToday=sc.today?Object.assign({date:'${DATE}',sites:sc.today},sc.todayGeneratedAt===null?{}:{generatedAt:sc.todayGeneratedAt||'${DATE} 10:30 KST'}):null;
  tideMonth=sc.tide||null; recentSiteSightings=sc.sightings||{}; loadedNotices=[];
  var sid=String(sc.siteId||'14');
  window.__allSites=window.__allSites||siteData; siteData=window.__allSites;  // 시나리오마다 전체 목록에서 장소를 고른다
  var site=siteData.find(function(s){return String(s.id)===sid;});
  siteData=[site];
  renderTodayPanel();
  var cards=[].slice.call(document.querySelectorAll('#todayPanelBody .todayRankItem')).filter(function(el){return el.querySelector('.todayRankName').textContent.indexOf(site.name)>=0;});
  var holder=document.createElement('div'); holder.innerHTML=v23TodayWeatherHtml(site);
  var popupScore=holder.querySelector('.v23TodayScore');
  var entry=weeklyPanelRecommendations(weeklyInfo()).filter(function(e){return String(e.site.id)===sid;})[0]||null;
  return {cardCount:cards.length,
    cardScore:cards[0]?cards[0].querySelector('.todayRankScore').textContent:null,
    cardTide:cards[0]?[].slice.call(cards[0].querySelectorAll('div')).map(function(d){return d.textContent;}).join(' | '):null,
    popupScore:popupScore?popupScore.textContent:null,
    popupText:holder.textContent,
    bodyText:document.getElementById('todayPanelBody').innerText,
    rank:entry?weeklyRankScore(entry):null, rawScore:entry?entry.score:null};
})()`;

async function readAll(scenarios) {
  const page = await Page.open();
  try {
    const out = {};
    for (const [name, scenario] of Object.entries(scenarios)) {
      try { out[name] = await page.evaluate(READ(scenario)); } catch (error) { throw new Error('시나리오 ' + name + ': ' + error.message); }
    }
    return out;
  } finally { page.dispose(); }
}

const TIDE_NOON = tides([['12:00', '900']]);
const NORMAL = (extra, more = {}) => Object.assign({ today: { 14: raw(extra) }, tide: TIDE_NOON, week: null }, more);

/* 일반 장소(만조 기준 없음, 천수만 사기리 15) today fallback. */
const ORDINARY = (extra, more = {}) => Object.assign({ siteId: '15', today: { 15: raw(extra) }, tide: null, week: null }, more);

/* PR #13 R6: 참고(현재 적격이 아닌) today 자료 6종. 같은 raw 점수 92·명시 적격 true·정상 풍속/강수여도 현재 자료가 아니면 점수는 미확인이다. */
const REFERENCE_CASES = {
  delayed_0541: NORMAL({ generatedAt: DATE + ' 05:41 KST' }),                                  // 예정 갱신(10:17)이 지난 뒤의 이전 생성분
  future_1230: NORMAL({ generatedAt: DATE + ' 12:30 KST' }),                                   // 현재(11:00)보다 미래 생성
  malformed_generated: NORMAL({ generatedAt: 'not-a-timestamp' }),
  missing_generated: Object.assign(NORMAL({ generatedAt: undefined }), { todayGeneratedAt: null }),  // item·root 생성 시각 모두 없음
  yesterday_forecast: NORMAL({ forecastTime: '2026-10-09 12:00 KST' }),                       // date 는 오늘, 예보 시각은 어제
  sparse6h_builder: { today: { 14: SPARSE6H }, tide: TIDE_NOON, week: null },                  // 실제 builder 출력(생성 06:10, 예보 12:00)
};

let results;
test.before(async () => {
  if (!CHROME) return;
  const scenarios = {
    base: NORMAL({}, { sightings: BOOST }),
    zero: NORMAL({ score: 0, grade: '★' }),
    c925: NORMAL({ score: 92.5 }),
    hundred: NORMAL({ score: 100 }),
    noWeekSite: NORMAL({}, { week: weekWith({ 999: { name: '다른곳', days: {} } }), sightings: BOOST }),
    weekBased: { week: weekWith({ 14: { name: '걸매리', days: { [DATE]: { samples: [sample('12:00', 92)] } } } }), today: null, tide: TIDE_NOON, sightings: BOOST },
    windMissing: NORMAL({ wind: null }, { sightings: BOOST }),
    rainMissing: NORMAL({ rain: null }, { sightings: BOOST }),
    eligibleMissing: NORMAL({ scoreEligible: undefined }, { sightings: BOOST }),
    missingList: NORMAL({ missingScoreFields: ['precipitation'] }, { sightings: BOOST }),
    previousSaved: { today: { 14: raw({ date: '2026-10-09', forecastTime: '2026-10-09 12:00 KST', generatedAt: '2026-10-09 23:44 KST', stale: true, scoreEligible: false, fallbackSource: 'previous_saved' }) }, tide: TIDE_NOON },
    gap90: Object.assign(NORMAL({}), { tide: tides([['13:30', '900']]) }),
    gap91: Object.assign(NORMAL({}), { tide: tides([['13:31', '900']]) }),
    alternate: Object.assign(NORMAL({}), { tide: tides([['13:45', '900'], ['12:30', '870']]) }),
    ordinaryNormal: ORDINARY({}),
    counterexample1440: NORMAL({ forecastTime: '2026-10-09 12:00 KST' }, { sightings: BOOST }),
  };
  for (const [label, scenario] of Object.entries(REFERENCE_CASES)) {
    scenarios['tide_' + label] = Object.assign({}, scenario, { today: { 14: scenario.today[14] }, tide: TIDE_NOON });
    scenarios['ordinary_' + label] = Object.assign({}, scenario, { siteId: '15', today: { 15: scenario.today[14] }, tide: null });
  }
  results = await readAll(scenarios);
  if (process.env.R4_DUMP) writeFileSync(process.env.R4_DUMP, JSON.stringify(results, null, 1)); // 수정 전후 증거 보존용
});

const SCORE_TEXT = (grade, score) => grade + ' ' + score + '점';

test('R4-1 주간 자료 없음 + 정상 today·조석: 추천 카드와 팝업이 같은 92점을 표시하고 내부 순위 108 은 유지된다', { skip: SKIP }, () => {
  const r = results.base;
  assert.equal(r.cardCount, 1, '카드 1개');
  assert.equal(r.cardScore, SCORE_TEXT('★★★★★', 92));
  assert.equal(r.popupScore, r.cardScore, '카드와 팝업 표시 일치');
  assert.equal(r.rawScore, 92);
  assert.equal(r.rank, 108, '92 + 제보 가점 16');
  assert.ok(!/오늘 적합도 미확인/.test(r.cardScore));
});

test('R4-2 정상 today 점수 0·92.5·100 은 카드와 팝업이 같은 점수를 표시한다', { skip: SKIP }, () => {
  for (const [name, score] of [['zero', 0], ['c925', 92.5], ['hundred', 100]]) {
    const r = results[name];
    assert.equal(r.cardCount, 1, name);
    assert.ok(r.cardScore.endsWith(score + '점'), name + ': ' + r.cardScore);
    assert.equal(r.popupScore, r.cardScore, name);
    assert.equal(r.rawScore, score, name);
  }
});

test('R4-3 주간 자료는 있지만 해당 탐조지 항목이 없을 때도 같은 today fallback 표시를 쓴다', { skip: SKIP }, () => {
  const r = results.noWeekSite;
  assert.equal(r.cardCount, 1);
  assert.equal(r.cardScore, SCORE_TEXT('★★★★★', 92));
  assert.equal(r.popupScore, r.cardScore);
  assert.equal(r.rank, 108);
});

test('R4-4 주간 기상 기반 추천도 카드와 팝업이 일치한다(기존 동작 유지)', { skip: SKIP }, () => {
  const r = results.weekBased;
  assert.equal(r.cardCount, 1);
  assert.equal(r.cardScore, SCORE_TEXT('★★★★★', 92));
  assert.equal(r.popupScore, r.cardScore);
  assert.equal(r.rank, 108);
});

test('R4-5 필수 풍속·강수 결측, 적격 미확인·목록은 추천 카드에 나오지 않고 팝업은 미확인이며 참고 기상은 남는다', { skip: SKIP }, () => {
  for (const name of ['windMissing', 'rainMissing', 'eligibleMissing', 'missingList']) {
    const r = results[name];
    assert.equal(r.cardCount, 0, name + ': 추천 제외(공지·제보 가점으로도 되살아나지 않는다)');
    assert.equal(r.popupScore, '오늘 적합도 미확인', name);
    assert.ok(!/★/.test(r.popupScore), name);
    assert.ok(/20\.0°C/.test(r.popupText), name + ': 기온 참고 정보 유지');
  }
  assert.ok(/강수 없음/.test(results.windMissing.popupText) || /북풍/.test(results.rainMissing.popupText), '남은 참고 값 표시');
});

test('R4-6 이전 저장 자료는 카드에 나오지 않고 팝업은 점수 없이 참고 값만 보인다', { skip: SKIP }, () => {
  const r = results.previousSaved;
  assert.equal(r.cardCount, 0);
  assert.equal(r.popupScore, '오늘 적합도 미확인');
  assert.ok(/북풍/.test(r.popupText) && /20\.0°C/.test(r.popupText), '이전 저장 기상은 참고로 표시');
});

test('R4-7 만조 90분은 허용하고 91분은 막는다(카드 표시 포함)', { skip: SKIP }, () => {
  assert.equal(results.gap90.cardCount, 1);
  assert.equal(results.gap90.cardScore, SCORE_TEXT('★★★★★', 92));
  assert.equal(results.gap90.popupScore, results.gap90.cardScore);
  assert.equal(results.gap91.cardCount, 0);
});

test('R4-8 안전한 대체 만조: 예보와 90분을 넘는 높은 만조 대신 가까운 만조가 카드에 쓰인다', { skip: SKIP }, () => {
  const r = results.alternate;
  assert.equal(r.cardCount, 1);
  assert.ok(/12:30 · 870cm/.test(r.cardTide), r.cardTide);
  assert.ok(!/900cm/.test(r.cardTide));
  assert.equal(r.cardScore, SCORE_TEXT('★★★★★', 92));
  assert.equal(r.popupScore, r.cardScore);
});

/* 344·375·768·1024·1440 폭에서 실제 패널 카드와 지도 팝업의 점수가 같고 화면 안에 있다. */
const WIDTHS = [344, 375, 768, 1024, 1440];
const LAYOUT = `(async function(){
  var RealDate=Date, fixed=new RealDate(${JSON.stringify(NOW)}).getTime();
  window.Date=class extends RealDate{constructor(){var a=[].slice.call(arguments);super(...(a.length?a:[fixed]));}static now(){return fixed;}};
  weatherWeek=null; weatherToday={generatedAt:'${DATE} 10:30 KST',date:'${DATE}',sites:{14:${JSON.stringify(raw())}}};
  tideMonth=${JSON.stringify(TIDE_NOON)}; recentSiteSightings=${JSON.stringify(BOOST)}; loadedNotices=[];
  var site=siteData.find(function(s){return String(s.id)==='14';}); siteData=[site];
  /* 초기화(setTimeout) 가 끝나 마커 registry 와 탐조지 팝업 핸들러(setupResponsivePopups)가 준비될 때까지 기다린다. */
  function popupReady(){var ev=map_7010a44f6ac2025090f0fe07508ed485._events&&map_7010a44f6ac2025090f0fe07508ed485._events.popupopen;return !!markerRegistry[markerKey(site)]&&!!ev&&ev.some(function(h){return String(h.fn).indexOf('applyMobilePopupAutoPan')>=0;});}
  for(var tries=0;tries<100&&!popupReady();tries++)await new Promise(function(r){setTimeout(r,100);});
  function rectOf(el){var r=el.getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),clipped:el.scrollWidth>el.clientWidth+1};}
  toggleTodayPanel(true);
  await new Promise(function(r){setTimeout(r,200);});
  var card=[].slice.call(document.querySelectorAll('#todayPanelBody .todayRankItem')).filter(function(el){return el.querySelector('.todayRankName').textContent.indexOf('걸매리')>=0;})[0];
  var cardScore=card.querySelector('.todayRankScore');
  var out={vw:window.innerWidth, cardText:cardScore.textContent, cardRect:rectOf(cardScore)};
  toggleTodayPanel(false);
  /* moveToSite() 와 같은 동작이되 지도 이동 애니메이션만 끈다(moveend 의 popup.update() 가 렌더 시점과 겹쳐 시험이 흔들리지 않게). */
  var leafletMap=map_7010a44f6ac2025090f0fe07508ed485; leafletMap.setView([site.lat,site.lon],11,{animate:false});
  var marker=markerRegistry[markerKey(site)]; marker.addTo(leafletMap); marker.openPopup();
  for(var wait=0;wait<60&&!document.querySelector('.leaflet-popup-content .v23TodayScore');wait++)await new Promise(function(r){setTimeout(r,100);});  // 팝업 기상 영역 렌더 대기
  var popupScore=document.querySelector('.leaflet-popup-content .v23TodayScore');
  out.popupOpen=!!document.querySelector('.leaflet-popup'); out.popupSnippet=(document.querySelector('.leaflet-popup-content')||{innerText:''}).innerText.slice(0,120);
  out.popupText=popupScore?popupScore.textContent:null; out.popupRect=popupScore?rectOf(popupScore):null;
  return out;
})()`;

test('R4-9 344·375·768·1024·1440px: 카드와 팝업 점수가 같고 가로로 잘리거나 화면 밖으로 나가지 않는다', { skip: SKIP }, async () => {
  for (const width of WIDTHS) {
    const page = await Page.open();
    try {
      await page.setViewport(width, 800);
      const out = await page.evaluate(LAYOUT);
      assert.equal(out.vw, width, 'viewport');
      assert.equal(out.cardText, SCORE_TEXT('★★★★★', 92), width + ' 카드');
      assert.equal(out.popupText, out.cardText, width + ' 팝업: ' + JSON.stringify(out));
      for (const [name, rect] of [['카드', out.cardRect], ['팝업', out.popupRect]]) {
        assert.ok(rect.left >= 0 && rect.right <= width + 1, width + ' ' + name + ' 가로 범위: ' + JSON.stringify(rect));
        assert.equal(rect.clipped, false, width + ' ' + name + ' 가로 잘림');
      }
    } finally { page.dispose(); }
  }
});

const UNKNOWN = '오늘 적합도 미확인';

const EMPTY_NOTICE = '현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다. 자료 갱신 후 다시 확인해 주세요.';

test('R6-1 (C 정책) 참고 상태 today 6종: 만조·일반 fallback 모두 추천 후보·카드가 없고 빈 목록 안내가 나오며 팝업은 미확인+참고 값이다', { skip: SKIP }, () => {
  for (const route of ['tide', 'ordinary']) {
    for (const label of Object.keys(REFERENCE_CASES)) {
      const r = results[route + '_' + label];
      assert.equal(r.cardCount, 0, route + ' ' + label + ': 참고 자료는 추천 후보가 아니다');
      assert.equal(r.rank, null, route + ' ' + label + ': 내부 순위 근거로도 쓰지 않는다');
      assert.equal(r.popupScore, UNKNOWN, route + ' ' + label + ' 팝업: ' + r.popupScore);
      assert.ok(!/★/.test(r.popupScore), route + ' ' + label);
      assert.ok(/20\.0°C/.test(r.popupText), route + ' ' + label + ': 기온 참고 정보 유지');
      assert.ok(r.bodyText.includes(EMPTY_NOTICE), route + ' ' + label + ': 빈 목록 안내\n' + r.bodyText);
    }
  }
});

test('R6-1b (C 정책) 예보가 하루 전이면 시·분이 만조와 같아도 제외된다(1,440분 반례의 실제 카드·팝업)', { skip: SKIP }, () => {
  const r = results.counterexample1440;
  assert.equal(r.cardCount, 0);
  assert.equal(r.rank, null);
  assert.equal(r.popupScore, UNKNOWN);
  assert.ok(r.bodyText.includes(EMPTY_NOTICE));
  assert.equal(results.base.cardCount, 1, '같은 조건의 정상 자료는 추천');
});

test('R6-2 정상 최신 today(10:30 생성)는 만조·일반 fallback 모두 카드와 팝업이 같은 점수를 표시한다', { skip: SKIP }, () => {
  for (const name of ['base', 'ordinaryNormal']) {
    const r = results[name];
    assert.equal(r.cardCount, 1, name);
    assert.equal(r.cardScore, SCORE_TEXT('★★★★★', 92), name);
    assert.equal(r.popupScore, r.cardScore, name);
  }
  assert.equal(results.base.rank, 108);
});

/* 같은 시나리오를 5폭에서 실제 카드·Leaflet 마커 팝업으로 읽는다(폭마다 Chrome 한 번, 시나리오는 순차 주입). */
const MULTI = (cases) => `(async function(){
  var RealDate=Date, fixed=new RealDate(${JSON.stringify(NOW)}).getTime();
  window.Date=class extends RealDate{constructor(){var a=[].slice.call(arguments);super(...(a.length?a:[fixed]));}static now(){return fixed;}};
  var cases=${JSON.stringify(cases)};
  var site=siteData.find(function(s){return String(s.id)==='14';}); siteData=[site];
  var map=map_7010a44f6ac2025090f0fe07508ed485;
  function popupReady(){var ev=map._events&&map._events.popupopen;return !!markerRegistry[markerKey(site)]&&!!ev&&ev.some(function(h){return String(h.fn).indexOf('applyMobilePopupAutoPan')>=0;});}
  for(var tries=0;tries<100&&!popupReady();tries++)await new Promise(function(r){setTimeout(r,100);});
  var out={vw:window.innerWidth,rows:[]};
  function rectOf(el){var r=el.getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),clipped:el.scrollWidth>el.clientWidth+1};}
  for(var i=0;i<cases.length;i++){
    var c=cases[i];
    weatherWeek=null; tideMonth=${JSON.stringify(TIDE_NOON)}; recentSiteSightings={}; loadedNotices=[];
    weatherToday=Object.assign({date:'${DATE}',sites:{14:c.raw}},c.rootGenerated===null?{}:{generatedAt:'${DATE} 10:30 KST'});
    map.closePopup(); toggleTodayPanel(false); toggleTodayPanel(true);
    await new Promise(function(r){setTimeout(r,100);});
    var card=[].slice.call(document.querySelectorAll('#todayPanelBody .todayRankItem')).filter(function(el){return el.querySelector('.todayRankName').textContent.indexOf('걸매리')>=0;})[0];
    var cardScore=card?card.querySelector('.todayRankScore'):null;
    var cardRect=cardScore?rectOf(cardScore):null, cardText=cardScore?cardScore.textContent:null;
    var emptyEl=[].slice.call(document.querySelectorAll('#todayPanelBody .smallText')).filter(function(el){return el.textContent.indexOf('현재 검증된 기상자료가 없어')>=0;})[0];
    toggleTodayPanel(false);
    map.setView([site.lat,site.lon],11,{animate:false});
    var marker=markerRegistry[markerKey(site)]; marker.addTo(map); marker.openPopup();
    for(var wait=0;wait<60&&!document.querySelector('.leaflet-popup-content .v23TodayScore');wait++)await new Promise(function(r){setTimeout(r,100);});
    var popupScore=document.querySelector('.leaflet-popup-content .v23TodayScore');
    out.rows.push({name:c.name,emptyNotice:!!emptyEl,emptyRect:emptyEl?rectOf(emptyEl):null,cardText:cardText,cardRect:cardRect,popupText:popupScore?popupScore.textContent:null,popupRect:popupScore?rectOf(popupScore):null});
  }
  return out;
})()`;

test('R6-3 344·375·768·1024·1440px: 정상 자료는 점수, 참고 상태 6종은 카드와 팝업 모두 "미확인"이고 잘리지 않는다', { skip: SKIP }, async () => {
  const cases = [{ name: 'normal', raw: raw() }, ...Object.entries(REFERENCE_CASES).map(([name, sc]) => ({ name, raw: sc.today[14], rootGenerated: sc.todayGeneratedAt }))];
  for (const width of WIDTHS) {
    const page = await Page.open();
    try {
      await page.setViewport(width, 800);
      const out = await page.evaluate(MULTI(cases));
      assert.equal(out.vw, width);
      for (const row of out.rows) {
        const normal = row.name === 'normal';
        assert.equal(row.cardText, normal ? SCORE_TEXT('★★★★★', 92) : null, width + ' ' + row.name + ' 카드(C 정책: 참고 자료는 카드 없음): ' + JSON.stringify(row));
        assert.equal(row.popupText, normal ? SCORE_TEXT('★★★★★', 92) : UNKNOWN, width + ' ' + row.name + ' 팝업: ' + JSON.stringify(row));
        assert.equal(row.emptyNotice, !normal, width + ' ' + row.name + ' 빈 목록 안내');
        for (const rect of [row.cardRect, row.popupRect, row.emptyRect].filter(Boolean)) {
          assert.ok(rect.left >= 0 && rect.right <= width + 1 && rect.clipped === false, width + ' ' + row.name + ' 가로 범위: ' + JSON.stringify(rect));
        }
      }
    } finally { page.dispose(); }
  }
});

/* 추천 자료 갱신 흐름: 전부 참고 → 빈 목록 → 정상 자료 도착 → 복구, 대체 주간 예보의 뒤늦은 도착, 오류 뒤 복구, 늦은 응답.
   실제 loadWeatherToday()/loadWeatherWeek()/refreshTodayPanelIfOpen() 을 쓰고 fetch 만 메모리 응답으로 바꾼다. */
const LIFECYCLE = `(async function(){
  var RealDate=Date, fixed=new RealDate(${JSON.stringify(NOW)}).getTime();
  window.Date=class extends RealDate{constructor(){var a=[].slice.call(arguments);super(...(a.length?a:[fixed]));}static now(){return fixed;}};
  var cfg=${JSON.stringify({ reference: raw({ generatedAt: DATE + ' 05:41 KST' }), normal: raw(), week: weekWith({ 14: { name: '걸매리', days: { [DATE]: { samples: [sample('12:00', 92)] } } } }), tide: TIDE_NOON })};
  /* 페이지 자체의 최초 자료 확인(load 뒤 300ms)이 끝난 다음에 시작한다. 그렇지 않으면 그 요청이 아래 시험 요청의 순번을 가로챈다. */
  for(var wait=0;wait<100&&!(typeof birdmapDataStarted!=='undefined'&&birdmapDataStarted);wait++)await new Promise(function(r){setTimeout(r,100);});
  await new Promise(function(r){setTimeout(r,1200);});
  var site=siteData.find(function(s){return String(s.id)==='14';}); siteData=[site];
  var EMPTY='현재 검증된 기상자료가 없어 추천 탐조지를 표시할 수 없습니다';
  function snapshot(label){
    var body=document.getElementById('todayPanelBody');
    var card=[].slice.call(body.querySelectorAll('.todayRankItem')).filter(function(el){return el.querySelector('.todayRankName').textContent.indexOf('걸매리')>=0;})[0];
    return {label:label,cards:body.querySelectorAll('.todayRankItem').length,score:card?card.querySelector('.todayRankScore').textContent:null,empty:body.innerText.indexOf(EMPTY)>=0};
  }
  function doc(raw,generatedAt){return {date:'${DATE}',generatedAt:generatedAt,updated:generatedAt,sites:{14:raw}};}
  weatherWeek=null; weatherToday=doc(cfg.reference,'${DATE} 05:41 KST'); tideMonth=cfg.tide; recentSiteSightings={}; loadedNotices=[];
  toggleTodayPanel(true);
  var out=[]; out.push(snapshot('모두 참고 상태'));
  var realFetch=window.fetch;
  // 1) 네트워크 오류: 직전 자료를 유지하고 패널은 그대로 빈 목록이다.
  window.fetch=function(){return Promise.reject(new Error('offline'));};
  var failed=await loadWeatherToday(); refreshTodayPanelIfOpen(); out.push(Object.assign(snapshot('네트워크 오류'),{applied:failed}));
  // 2) 정상 갱신: 정상 자료가 도착하면 추천이 복구된다.
  window.fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(doc(cfg.normal,'${DATE} 10:30 KST'));}});};
  var applied=await loadWeatherToday(); refreshTodayPanelIfOpen(); out.push(Object.assign(snapshot('정상 갱신'),{applied:applied}));
  // 3) 늦은 응답: 먼저 보낸 요청(옛 참고 자료)이 나중에 도착해도 최신 정상 자료를 덮어쓰지 못한다.
  var calls=0;
  window.fetch=function(){var n=++calls;return new Promise(function(resolve){var body=n===1?doc(cfg.reference,'${DATE} 05:41 KST'):doc(cfg.normal,'${DATE} 10:31 KST');setTimeout(function(){resolve({ok:true,json:function(){return Promise.resolve(body);}});},n===1?150:0);});};
  var first=loadWeatherToday(), second=loadWeatherToday(); await Promise.all([first,second]); await new Promise(function(r){setTimeout(r,250);}); refreshTodayPanelIfOpen();
  out.push(Object.assign(snapshot('늦은 옛 응답 이후'),{stateKindOk:weatherToday.sites['14'].generatedAt==='${DATE} 10:30 KST'}));
  // 4) 정상 today 가 다시 참고 상태가 되고(예: 시간 경과) 주간 대체 예보가 뒤늦게 도착하면 정상 주간 예보로 복구된다.
  weatherToday=doc(cfg.reference,'${DATE} 05:41 KST'); refreshTodayPanelIfOpen(); out.push(snapshot('다시 참고 상태'));
  window.fetch=function(url){return Promise.resolve({ok:true,json:function(){return Promise.resolve(cfg.week);}});};
  var weekApplied=await loadWeatherWeek(); refreshTodayPanelIfOpen(); out.push(Object.assign(snapshot('주간 대체 예보 도착'),{applied:weekApplied}));
  window.fetch=realFetch;
  return out;
})()`;

test('R7 추천 자료 갱신: 전부 참고 → 빈 목록 안내, 오류 뒤에도 유지, 정상 갱신으로 복구, 늦은 옛 응답은 무시, 대체 주간 예보 도착 시 복구', { skip: SKIP }, async () => {
  const page = await Page.open();
  try {
    const out = await page.evaluate(LIFECYCLE);
    const by = Object.fromEntries(out.map((x) => [x.label, x]));
    assert.deepEqual([by['모두 참고 상태'].cards, by['모두 참고 상태'].empty], [0, true]);
    assert.deepEqual([by['네트워크 오류'].cards, by['네트워크 오류'].empty, by['네트워크 오류'].applied], [0, true, false], '오류는 직전 자료 유지');
    assert.deepEqual([by['정상 갱신'].cards, by['정상 갱신'].empty, by['정상 갱신'].applied], [1, false, true]);
    assert.equal(by['정상 갱신'].score, SCORE_TEXT('★★★★★', 92));
    assert.equal(by['늦은 옛 응답 이후'].stateKindOk, true, '옛 응답이 최신 자료를 덮어쓰지 않는다');
    assert.equal(by['늦은 옛 응답 이후'].cards, 1);
    assert.deepEqual([by['다시 참고 상태'].cards, by['다시 참고 상태'].empty], [0, true]);
    assert.equal(by['주간 대체 예보 도착'].cards, 1);
    assert.equal(by['주간 대체 예보 도착'].score, SCORE_TEXT('★★★★★', 92));
  } finally { page.dispose(); }
});
