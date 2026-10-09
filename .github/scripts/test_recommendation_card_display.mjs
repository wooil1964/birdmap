/* PR #13 R4: 정상 today 만조 fallback 에서 추천 카드와 탐조지 팝업의 점수·유효성 표시가 같아야 한다.
   실제 index.html 을 Chrome 으로 띄워 renderTodayPanel() 이 만든 카드 DOM 과 v23TodayWeatherHtml() 이 만든 팝업 DOM 을 함께 읽는다.
   (함수 반환값만 비교하지 않는다.) 화면 라이브러리 CDN 외의 네트워크(제보 API·분석·Turnstile)는 DNS 로 막고 시계·자료는 메모리에서 주입한다.
   실행: CHROME_PATH=<chrome> node --test .github/scripts/test_recommendation_card_display.mjs (Chrome 이 없으면 skip) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
  weatherWeek=sc.week||null; weatherToday=sc.today?{generatedAt:sc.todayGeneratedAt||'${DATE} 10:30 KST',date:'${DATE}',sites:sc.today}:null;
  tideMonth=sc.tide||null; recentSiteSightings=sc.sightings||{}; loadedNotices=[];
  var site=siteData.find(function(s){return String(s.id)==='14';});
  siteData=[site];
  renderTodayPanel();
  var cards=[].slice.call(document.querySelectorAll('#todayPanelBody .todayRankItem')).filter(function(el){return el.querySelector('.todayRankName').textContent.indexOf('걸매리')>=0;});
  var holder=document.createElement('div'); holder.innerHTML=v23TodayWeatherHtml(site);
  var popupScore=holder.querySelector('.v23TodayScore');
  var entry=weeklyPanelRecommendations(weeklyInfo()).filter(function(e){return String(e.site.id)==='14';})[0]||null;
  return {cardCount:cards.length,
    cardScore:cards[0]?cards[0].querySelector('.todayRankScore').textContent:null,
    cardTide:cards[0]?[].slice.call(cards[0].querySelectorAll('div')).map(function(d){return d.textContent;}).join(' | '):null,
    popupScore:popupScore?popupScore.textContent:null,
    popupText:holder.textContent,
    rank:entry?weeklyRankScore(entry):null, rawScore:entry?entry.score:null};
})()`;

async function readAll(scenarios) {
  const page = await Page.open();
  try {
    const out = {};
    for (const [name, scenario] of Object.entries(scenarios)) out[name] = await page.evaluate(READ(scenario));
    return out;
  } finally { page.dispose(); }
}

const TIDE_NOON = tides([['12:00', '900']]);
const NORMAL = (extra, more = {}) => Object.assign({ today: { 14: raw(extra) }, tide: TIDE_NOON, week: null }, more);

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
  };
  results = await readAll(scenarios);
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
