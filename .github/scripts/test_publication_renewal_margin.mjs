/* 공개 권한 갱신 여유(PUBLICATION_RENEW_MARGIN_MS) 회귀 시험.
   index.html 의 실제 publication 함수와 실제 확인 주기 계산식을 가상 시계로 돌린다(네트워크·운영 요청 없음).
   - 응답 지연·타이머 지연이 여유 안이면 만료(데이터 삭제·경고 깜빡임)가 없어야 한다.
   - 여유를 넘으면 지금처럼 만료되어야 한다(fail-closed 유지).
   - 성공한 갱신은 언제나 "요청 시작 + 5000ms"에 끝나야 한다(5초 상한 불변).
   원형: docs/p1-free-capacity/client/pre-renewal-scheduling.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(process.env.INDEX_PATH || new URL('../../index.html', import.meta.url), 'utf8');
const num = (name) => Number(html.match(new RegExp(name + '=(\\d+)'))[1]);
const MAX_AGE = num('PUBLICATION_MAX_AGE'), POLL = num('PUBLICATION_POLL_MS'), MARGIN = num('PUBLICATION_RENEW_MARGIN_MS');
assert.ok(html.includes('setInterval(publicationRecheck,Math.min(PUBLICATION_POLL_MS,PUBLICATION_MAX_AGE-PUBLICATION_RENEW_MARGIN_MS))'), '실제 주기 계산식');
const PERIOD = Math.min(POLL, MAX_AGE - MARGIN);

function source(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const stop = html.indexOf('\nfunction ', start + 1), candidate = html.slice(start, stop), end = candidate.indexOf('\n}');
  return end < 0 ? candidate : candidate.slice(0, end + 2);
}

async function run({ rtt = 75, pollJitter = 0, until = 65000 }) {
  let mono = 0, id = 0, nonceSequence = 0;
  const wallStart = Date.parse('2026-10-14T00:00:00+09:00'), timers = new Map(), calls = [], invalidations = [], renewals = [];
  const anchor = { contract: 'publication-v1', projection: 'legacy-public-v1', epoch: 'a'.repeat(32), revision: '100' };
  const schedule = (fn, ms) => { const n = ++id; timers.set(n, { at: mono + ms, fn }); return n; };
  const ctx = {
    Promise, BigInt, Number, Error, Date: class extends Date { static now() { return wallStart + mono; } }, performance: { now: () => mono },
    setTimeout: schedule, clearTimeout: (n) => timers.delete(n), AbortController,
    PUBLICATION_CONTRACT: 'publication-v1', PUBLICATION_PROJECTION: 'legacy-public-v1', PUBLICATION_MAX_AGE: MAX_AGE, PUBLICATION_TIMEOUT: 4000, REPORTS_API_URL: 'https://synthetic.invalid',
    publicationHeadPromise: null, publicationExpiryTimer: 0, publicationRefreshPromise: null,
    publicationState: { generation: 2, ready: true, anchor: { ...anchor, nonce: 'b'.repeat(32) }, until: wallStart + MAX_AGE, checkedMono: 0 },
    document: { hidden: false, getElementById: () => ({ hidden: true }), querySelectorAll: () => [] },
    reportPublicSpots: {}, reportSearchIndex: [], reportFixedHistory: {}, recentSiteSightings: {}, reportSpotLayers: {}, reportPendingLayers: {}, fieldMarkers: {}, fieldUpdates: [], fieldLayer: null, fieldGuide: null,
    fieldNavChoiceClose: () => {}, clearSiteHistoryCache: () => {}, clearContributors: () => {}, reportsConfigured: () => true,
    publicationNonce: () => String(++nonceSequence).padStart(32, '0'),
    fetch(url) {
      const u = new URL(url), started = mono; calls.push({ path: u.pathname, started });
      return new Promise((resolve) => schedule(() => resolve({ ok: true, json: async () => ({ ok: true, spots: [], serverTime: new Date(wallStart + mono).toISOString(), publication: { ...anchor, nonce: u.searchParams.get('nonce') } }) }), rtt));
    },
  };
  for (const [name, path] of [['loadApprovedReports', '/reports/approved'], ['loadPendingReports', '/reports/pending'], ['loadRecentSiteSightings', '/reports/recent-sites?days=14'], ['loadFieldUpdates', '/field-updates']])
    ctx[name] = () => ctx.publicationFetch(path).then((body) => ctx.publicationDataAllowed(body)).catch(() => false);
  vm.createContext(ctx);
  vm.runInContext(['publicationRevision', 'publicationSame', 'publicationAllowed', 'publicationNotice', 'publicationForgetLayer', 'publicationInvalidate', 'publicationRenew', 'publicationJson', 'publicationValidate', 'publicationHead', 'publicationDataAllowed', 'publicationFetch', 'publicationRefresh', 'publicationRecheck'].map(source).join('\n'), ctx);
  const actualInvalidate = ctx.publicationInvalidate, actualRenew = ctx.publicationRenew;
  ctx.publicationInvalidate = (reason) => { invalidations.push({ reason, at: mono }); return actualInvalidate(reason); };
  ctx.publicationRenew = (body) => {
    const ok = actualRenew(body);
    if (ok) {
      assert.equal(ctx.publicationState.checkedMono, body._publicationStartedMono, '갱신 기준은 요청 시작 시각');
      assert.equal(ctx.publicationState.until - wallStart, body._publicationStartedMono + MAX_AGE, '만료는 요청 시작 + 5000ms');
      renewals.push(body._publicationStartedMono);
    }
    return ok;
  };
  ctx.publicationRenew({ _publicationStartedMono: 0, _publicationGeneration: 2, publication: ctx.publicationState.anchor, serverTime: new Date(wallStart).toISOString() });
  for (let t = PERIOD; t <= until; t += PERIOD) schedule(() => { ctx.publicationRecheck(); }, t + pollJitter);
  const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };
  while (true) {
    let next = null;
    for (const [key, item] of timers) if (item.at <= until && (!next || item.at < next.item.at || (item.at === next.item.at && key < next.key))) next = { key, item };
    if (!next) break;
    mono = next.item.at; timers.delete(next.key); next.item.fn(); await flush();
  }
  return { invalidations, renewals, dataReads: calls.filter((c) => c.path !== '/reports/public-state').length, heads: calls.filter((c) => c.path === '/reports/public-state').length };
}

test('확인 주기는 5초 상한에서 갱신 여유를 뺀 값이고, 5초 상한은 그대로다', () => {
  assert.equal(MAX_AGE, 5000);
  assert.ok(MARGIN >= 1000, '응답 250~300ms 에서 만료되던 여유 250ms 회귀 방지');
  assert.ok(PERIOD < MAX_AGE);
});
for (const [rtt, jitter] of [[75, 0], [300, 0], [600, 0], [900, 0], [300, 200], [75, 900]]) {
  test(`응답 ${rtt}ms·타이머 지연 ${jitter}ms: 만료·데이터 재조회 없이 권한이 유지된다`, async () => {
    const r = await run({ rtt, pollJitter: jitter });
    assert.deepEqual(r.invalidations, []);
    assert.equal(r.dataReads, 0, '만료 뒤 전체 재조회(목록 깜빡임)가 없다');
    assert.ok(r.renewals.length > 10);
  });
}
test('갱신 응답이 여유를 넘으면 지금처럼 만료되어 데이터를 닫는다(fail-closed)', async () => {
  const r = await run({ rtt: MARGIN + 100 });
  assert.ok(r.invalidations.some((x) => x.reason === 'expired'));
});
test('타이머가 여유보다 늦게 돌아도 만료된다(fail-closed)', async () => {
  const r = await run({ rtt: 75, pollJitter: MARGIN + 100 });
  assert.ok(r.invalidations.some((x) => x.reason === 'expired'));
});
