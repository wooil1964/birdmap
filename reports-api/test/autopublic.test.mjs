// 일반종 자동 공개(미검증): 분류 규칙, 접수·공개·관리자 흐름, 스위치, 위치 보호.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost, ORIGIN, ADMIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import adminWorker from '../src/admin.js';
import { quickInput, persistQuick } from '../src/canonical/persistence.js';
import { dedupeHash, sha256Hex, kstDateString } from '../src/shared.js';
import { classifySubmission, contentReasons, AUTO_PUBLIC_REASON } from '../src/autopublic.js';
import { OFFICIAL_BIRD_NAMES } from '../src/official-bird-names.js';
import { LEGAL_PROTECTED_NAMES } from '../src/protected-birds.js';

const TODAY = kstDateString(new Date());
const reasons = (species, extra = {}) => [...contentReasons({ species, speciesText: species.join(' · '), birdCount: null, note: null, ...extra })].sort();

test('분류: 식별 가능한 이름은 종류와 상관없이 적격, 식별 불가·불확실·나눌 수 없는 입력은 보류', () => {
  assert.deepEqual(reasons(['참새']), []);
  assert.deepEqual(reasons(['참새 30마리', '까치']), []);
  assert.deepEqual(reasons(['청둥오리'], { birdCount: 3000 }), []);
  assert.deepEqual(reasons(['참새'], { birdCount: 301 }), ['count_anomaly']);
  assert.deepEqual(reasons(['청둥오리', '참새'], { birdCount: 301 }), ['count_anomaly'], '여러 종이면 가장 낮은 상한');
  assert.deepEqual(reasons(['참새 5000마리']), ['count_anomaly'], '종명 뒤 수량도 상한 검사');
  assert.deepEqual(reasons(['참새301']), ['count_anomaly']);
  assert.deepEqual(reasons(['참새 300마리', '청둥오리 3000개체']), [], '종별 상한 이내');
  assert.deepEqual(reasons(['동박새3', '박새2', '직박구리1']), [], '수량 붙은 복수 일반종은 3종으로 인식해 적격');
  assert.deepEqual(reasons(['동박새3', '박새2', '매1']), [], '보호종이 섞여도 이름만으로는 보류하지 않음(위치 보호는 v2·위치 가리기가 담당)');
  assert.deepEqual(reasons(['동박새3', '박새?2']), ['name_unconfirmed', 'species_parse'], '불확실 종명 혼합은 보류');
  assert.deepEqual(reasons(['매']), [], '보호종도 종 이름만으로 보류하지 않음');
  assert.deepEqual(reasons(['말똥가리']), []);
  assert.deepEqual(reasons(['Calidris pygmaea']), [], '학명(2025 목록)으로 식별');
  assert.deepEqual(reasons(['Anser fabalis middendorffii']), [], '목록 밖 학명 꼴(미조·미기록 가능종 포함)은 원문 보존 + 공개');
  assert.deepEqual(reasons(["Ross's Gull"]), [], '2025 목록 밖이라도 IOC 영명이면 식별(미조 즉시 공개)');
  assert.deepEqual(reasons(['Rhodostethia rosea']), [], 'IOC 학명');
  assert.deepEqual(reasons(['Larus imaginarius']), ['name_unconfirmed'], '속만 맞고 종소명이 어느 목록에도 없으면 실존 종으로 판정하지 않고 관리자 검토');
  assert.deepEqual(reasons(['Accipiter haplochrous']), [], '다른 분류목록(AviList 등)의 동의어는 근거가 있으므로 식별');
  assert.deepEqual(reasons(['Zzzzus abcdef']), ['name_unconfirmed'], '속명이 IOC 에도 없으면 라틴어 꼴이어도 보류');
  assert.deepEqual(reasons(['Imaginary Warbler']), ['name_unconfirmed'], 'IOC 에 없는 영명은 보류');
  assert.deepEqual(reasons(['처음보는새']), ['name_unconfirmed']);
  for (const doubt of ['참새?', '참새 추정', '참새류', '참새 또는 까치'])assert.ok(reasons([doubt]).includes('name_unconfirmed'), doubt);
  assert.deepEqual(reasons(['참새', '까치', '박새', '딱새', '동박새', '물까치']), ['name_unconfirmed'], '6종은 보류');
  assert.deepEqual(reasons(['참새', '매']), [], '보호종이 섞여도 보류하지 않음');
  assert.deepEqual(reasons(['참새', '처음보는새']), ['name_unconfirmed'], '하나라도 식별할 수 없으면 전체 보류');
  assert.deepEqual(reasons(['참새'], { note: '자세한 건 https://example.com' }), ['note_review']);
  assert.deepEqual(reasons(['참새'], { note: '연락 010-1234-5678' }), ['note_review']);
  assert.deepEqual(reasons(['참새'], { note: '둥지 근처' }), ['breeding']);
  assert.deepEqual(reasons([]), ['name_unconfirmed', 'species_parse']);
});

test('분류: 같은 IP 하루 자동 공개 5건, 전체 한도, 스위치 끔', async () => {
  const stub = (ip, total) => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => ({ ip, total }) }) }) });
  const report = { species: ['참새'], speciesText: '참새', birdCount: null, note: null, observedOn: TODAY, lat: 36, lon: 127 };
  const env = { ...ON, REPORTS_WRITE_MODE: 'CANONICAL_DUAL_WRITE' };
  assert.deepEqual(await classifySubmission(stub(4, 0), env, report, 'h'), { eligible: true, reasons: [] });
  assert.deepEqual(await classifySubmission(stub(5, 0), env, report, 'h'), { eligible: false, reasons: ['rate_review'] });
  assert.deepEqual(await classifySubmission(stub(0, 50), env, report, 'h'), { eligible: false, reasons: ['global_cap'] });
  assert.deepEqual(await classifySubmission(stub(0, 0), { ...env, REPORTS_AUTO_PUBLIC: '0' }, report, 'h'), { eligible: false, reasons: ['auto_public_disabled'] });
  assert.deepEqual(await classifySubmission(stub(0, 0), { ...env, REPORTS_WRITE_MODE: 'NORMAL' }, report, 'h'), { eligible: false, reasons: ['auto_public_disabled'] }, '정본 모드에서만');
});

test('전체 조류: 2025 한국조류목록 598종과 법정 보호 조류 전부가 이름만으로는 보류되지 않는다', () => {
  assert.equal(OFFICIAL_BIRD_NAMES.length, 598);
  for (const name of OFFICIAL_BIRD_NAMES) assert.deepEqual(reasons([name]), [], name);
  for (const name of LEGAL_PROTECTED_NAMES) if (OFFICIAL_BIRD_NAMES.includes(name)) assert.deepEqual(reasons([name]), [], name + ' (법정 보호종)');
});

const ON = { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1' };
async function setup(t, flags = ON) {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), envs = environments(db);
  Object.assign(envs.pub, flags);
  return { db, ...envs, token: auth.token };
}
async function get(env, path, strict = false) {
  const url = new URL('https://synthetic.invalid' + path);
  if (strict) {
    const h = await get(env, '/reports/public-state?nonce=' + 'd'.repeat(32));
    for (const [k, v] of Object.entries({ contract: 'publication-v1', nonce: 'd'.repeat(32), expectedEpoch: h.body.publication.epoch, expectedRevision: h.body.publication.revision })) url.searchParams.set(k, v);
  }
  const r = await handleRequest(new Request(url, { headers: { Origin: ORIGIN } }), env);
  return { status: r.status, body: await r.json() };
}
async function pending(s) {
  const out = [];
  for (const strict of [false, true]) { s.pub.REPORTS_PUBLICATION_REQUIRED = String(strict); out.push((await get(s.pub, '/reports/pending', strict)).body.spots); }
  assert.deepEqual(out[0], out[1], 'strict 와 legacy 가 같은 결과');
  return out[1];
}
const adminList = async (s, status) => (await (await adminWorker.fetch(new Request('https://admin.example/admin/api/reports?status=' + status, { headers: { 'Cf-Access-Jwt-Assertion': s.token } }), s.admin)).json()).reports;
const row = (s, id) => s.db.sqlite.prepare('SELECT * FROM reports WHERE id=?').get(id);
let n = 1000;
const submit = async (s, patch) => { const body = input(n++, { observedOn: TODAY, lat: 36 + n / 1e3, lon: 127 + n / 1e3, ...patch }); const r = await post(s.pub, body); return { body, status: r.status, receipt: await r.json() }; };
function rev(s, id) { return s.db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').get(id).revision; }
const act = (s, id, action, extra = {}) => adminPost(s.admin, s.token, id, { action, request_id: input(n++).request_id, expected_revision: rev(s, id), ...extra });

test('흐름: 일반종은 즉시 미검증 공개, 재전송·상태·검색이 일치하고 승인 자료·통계에는 섞이지 않는다', async t => {
  const s = await setup(t);
  const { body, status, receipt } = await submit(s, { species: '참새', lat: 36.111111, lon: 127.222222, birdCount: 12 });
  assert.equal(status, 201);
  assert.deepEqual(receipt, { ok: true, id: body.request_id, status: 'pending', publicVisibility: 'public_unverified' });
  assert.equal(row(s, body.request_id).pending_public, 1);
  const review = s.db.sqlite.prepare('SELECT * FROM reviews WHERE checklist_id=?').all(body.request_id);
  assert.equal(review.length, 1); assert.equal(review[0].decision, 'submitted'); assert.equal(review[0].actor_id, 'system:auto-public'); assert.equal(review[0].reason_code, AUTO_PUBLIC_REASON);
  const spots = await pending(s);
  assert.deepEqual(spots, [{ id: body.request_id, status: 'pending', verified: false, lat: 36.111111, lon: 127.222222, species: ['참새'], date: TODAY, reporter: '합성테스터', sightings: [{name:'참새',count:12,countStatus:'reported'}] }]);
  assert.ok(!/메모|note/.test(JSON.stringify(spots)), '메모는 내보내지 않는다(이름은 공개에 동의한 제보만)');
  assert.equal((await post(s.pub, body)).status, 201);
  assert.equal((await (await post(s.pub, body)).json()).publicVisibility, 'public_unverified', '재전송도 같은 결과');
  assert.equal((await get(s.pub, '/reports/' + body.request_id + '/status')).body.publicVisibility, 'public_unverified');
  s.pub.REPORTS_PUBLICATION_REQUIRED = 'true';
  const search = (await get(s.pub, '/reports/search?q=' + encodeURIComponent('참새'), true)).body.reports;
  assert.deepEqual(search, [{ id: body.request_id, date: TODAY, species: ['참새'], verified: false }], '검색에는 미검증 표시, 이동 대상·제보자 없음');
  assert.deepEqual((await get(s.pub, '/reports/approved', true)).body.spots, [], '승인 자료에는 섞이지 않는다');
  const list = await adminList(s, 'unverified');
  assert.equal(list.length, 1); assert.equal(list[0].display_state, 'unverified');
  assert.equal((await adminList(s, 'pending')).length, 0, '검토 대기 탭에서는 빠진다');
});

test('흐름: 위치 가리기는 대략점만, 식별 불가·중복·한도·오래된 관찰은 보류하고 가린 제보의 실제 좌표는 어디에도 내보내지 않는다', async t => {
  const s = await setup(t, { ...ON, REPORTS_AUTO_PUBLIC_DAILY_MAX: '4' });
  const hidden = await submit(s, { species: '까치', lat: 36.5, lon: 127.5, hideLocation: true });
  assert.equal(hidden.receipt.publicVisibility, 'public_unverified');
  const spot = (await pending(s)).find(x => x.id === hidden.body.request_id);
  assert.equal(spot.locationHidden, true);
  assert.ok(spot.lat !== 36.5 || spot.lon !== 127.5, '가림 점');
  const r = row(s, hidden.body.request_id); assert.equal(spot.lat, r.public_lat); assert.equal(spot.lon, r.public_lon);

  // 보호종도 종 이름만으로는 보류하지 않는다. 제보자가 위치를 가리면 대략점만, 가리지 않으면 위치 정책 v2(비번식 확인)대로 공개된다.
  const protectedHidden = await submit(s, { species: '매, 참새', lat: 36.987654, lon: 126.876543, note: '비행', hideLocation: true });
  assert.equal(protectedHidden.receipt.publicVisibility, 'public_unverified');
  const protectedOpen = await submit(s, { species: '저어새', lat: 35.123456, lon: 126.234567 });
  assert.equal(protectedOpen.receipt.publicVisibility, 'public_unverified');
  const unknown = await submit(s, { species: '처음보는새' });
  assert.deepEqual(unknown.receipt.holdReasons, ['name_unconfirmed']);
  const dup = await submit(s, { species: '까치', lat: 36.5005, lon: 127.5005 });
  assert.deepEqual(dup.receipt.holdReasons, ['possible_duplicate']);
  const vagrant = await submit(s, { species: 'Anser fabalis middendorffii', lat: 34.5, lon: 128.5 });
  assert.equal(vagrant.receipt.publicVisibility, 'public_unverified', '목록 밖 학명 꼴(미조·미기록 가능종)도 공개');
  const capped = await submit(s, { species: '딱새' });
  assert.deepEqual(capped.receipt.holdReasons, ['global_cap']);
  const stale = await submit(s, { species: '참새', observedOn: '2026-09-20' });
  assert.ok(stale.receipt.holdReasons.includes('stale_observation'));
  const ids = [hidden, protectedHidden, protectedOpen, vagrant].map(x => x.body.request_id).sort();
  assert.deepEqual((await pending(s)).map(x => x.id).sort(), ids);
  const shownHidden = (await pending(s)).find(x => x.id === protectedHidden.body.request_id);
  assert.equal(shownHidden.locationHidden, true);
  const shownOpen = (await pending(s)).find(x => x.id === protectedOpen.body.request_id);
  assert.equal(shownOpen.lat, 35.123456, '가리지 않은 보호종은 v2(승인 후 공개와 같은 범위)대로 공개');
  // 가린 보호종 제보의 실제 좌표는 공개 GET 어디에도 없다.
  const paths = ['/reports/pending', '/reports/approved', '/reports/search?q=' + encodeURIComponent('매'), '/reports/search?q=', '/reports/recent-sites?days=30',
    '/reports/' + protectedHidden.body.request_id + '/status', '/contributors/monthly', '/contributors/all'];
  for (const strict of [false, true]) for (const p of paths) {
    s.pub.REPORTS_PUBLICATION_REQUIRED = String(strict);
    const text = JSON.stringify((await get(s.pub, p, strict)).body);
    for (const d of ['36.98765', '126.87654', '36.9877', '126.8765']) assert.ok(!text.includes(d), `${p} strict=${strict} leaked ${d}`);
  }
  const held = (await adminList(s, 'pending')).find(x => x.id === unknown.body.request_id);
  assert.equal(held.display_state, 'review'); assert.deepEqual(held.hold_reasons, ['name_unconfirmed']);
});

test('관리자: 확인 완료·공개 중지·반려(사유)·재승인, 과거 플래그·재판정·만료는 공개되지 않는다', async t => {
  const s = await setup(t);
  const a = await submit(s, { species: '직박구리' }), b = await submit(s, { species: '멧비둘기' }), c = await submit(s, { species: '물까치' }), d = await submit(s, { species: '쇠딱다구리' });
  assert.equal((await pending(s)).length, 4);
  // 확인 완료(승인) → 승인 자료로 이동, 미검증 목록에서 빠짐
  assert.equal((await act(s, a.body.request_id, 'approve')).status, 200);
  s.pub.REPORTS_PUBLICATION_REQUIRED = 'true';
  assert.ok((await get(s.pub, '/reports/approved', true)).body.spots.some(x => x.id === a.body.request_id));
  // 공개 중지 → 즉시 제거, 다시 공개할 수 없음
  assert.equal((await act(s, b.body.request_id, 'visibility', { public: false })).status, 200);
  assert.equal((await act(s, b.body.request_id, 'visibility', { public: true })).status, 400);
  assert.equal((await adminList(s, 'pending')).find(x => x.id === b.body.request_id).display_state, 'withdrawn');
  // 반려: 사유 코드 필수 형식, 기타는 메모 필수, 감사 이력에 남음
  assert.equal((await act(s, c.body.request_id, 'reject', { reasonCode: 'nonsense' })).status, 400);
  assert.equal((await act(s, c.body.request_id, 'reject', { reasonCode: 'other' })).status, 400);
  assert.equal((await act(s, c.body.request_id, 'reject', { reasonCode: 'misidentification' })).status, 200);
  assert.equal(s.db.sqlite.prepare("SELECT reason_code FROM reviews WHERE checklist_id=? ORDER BY sequence DESC LIMIT 1").get(c.body.request_id).reason_code, 'reject:misidentification');
  assert.equal((await get(s.pub, '/reports/' + c.body.request_id + '/status')).body.publicVisibility, 'not_published');
  assert.deepEqual((await pending(s)).map(x => x.id), [d.body.request_id]);
  // 반려 후 재승인 → 확인 완료
  assert.equal((await act(s, c.body.request_id, 'approve')).status, 200);
  assert.equal(row(s, c.body.request_id).status, 'approved');
  // 재판정: 내용이 보호종이 되면(목록 변경·보정) 읽기에서 바로 빠진다
  s.db.sqlite.prepare("UPDATE reports SET species='매' WHERE id=?").run(d.body.request_id);
  assert.deepEqual(await pending(s), []);
  assert.equal((await adminList(s, 'pending')).find(x => x.id === d.body.request_id).display_state, 'auto_stopped');
  s.db.sqlite.prepare("UPDATE reports SET species='쇠딱다구리' WHERE id=?").run(d.body.request_id);
  assert.equal((await pending(s)).length, 1);
  // 14일 넘게 확인되지 않으면 내려간다
  s.db.sqlite.prepare('UPDATE reports SET received_at=? WHERE id=?').run(new Date(Date.now() - 15 * 86400000).toISOString(), d.body.request_id);
  assert.deepEqual(await pending(s), []);
});

test('과거 pending_public=1(자동 판정 기록 없음)과 스위치 끔은 현행 사전 승인제와 같다', async t => {
  const s = await setup(t);
  // 판정 기록 없이 pending_public=1 로 남은 과거 행
  const body = input(1900, { species: '참새', observedOn: TODAY, lat: 37.3, lon: 127.3, hideLocation: false });
  const { report, input: original } = quickInput(body);
  const legacy = { id: body.request_id, status: 'pending', species: report.speciesText, lat: report.lat, lon: report.lon, public_lat: null, public_lon: null, approx_lat: report.lat, approx_lon: report.lon, pending_public: 1, observed_on: report.observedOn, received_at: new Date().toISOString(), decided_at: null, bird_count: null, reporter: null, note: null, admin_note: null, site_id: null, name_public: 0, spot_key: null, ip_hash: 's', dedupe_hash: await dedupeHash(report) };
  await persistQuick(s.db, legacy, original, { ok: true, id: legacy.id, status: 'pending', publicVisibility: 'approximate' }, await sha256Hex('legacy-1900'));
  assert.deepEqual(await pending(s), [], '과거 플래그만으로는 공개되지 않는다');
  const fresh = await submit(s, { species: '참새' });
  assert.equal((await pending(s)).length, 1);
  // 읽기 스위치 끔: 이미 공개된 미검증분도 즉시 내려간다
  s.pub.REPORTS_UNVERIFIED_READS = '0';
  assert.deepEqual(await pending(s), []);
  assert.equal((await get(s.pub, '/reports/' + fresh.body.request_id + '/status')).body.publicVisibility, 'withheld');
  assert.equal((await (await post(s.pub, fresh.body)).json()).publicVisibility, 'withheld', '재전송 접수증도 읽기 스위치를 따른다');
  // 자동 공개 끔: 접수증·DB·검토 이력 모두 현행과 같다
  s.pub.REPORTS_AUTO_PUBLIC = '0';
  const off = await submit(s, { species: '참새', lat: 35.1, lon: 128.1 });
  assert.deepEqual(Object.keys(off.receipt).sort(), ['id', 'ok', 'publicVisibility', 'status']);
  assert.equal(off.receipt.publicVisibility, 'withheld');
  assert.equal(row(s, off.body.request_id).pending_public, 0);
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) AS n FROM reviews WHERE checklist_id=?').get(off.body.request_id).n, 0);
  assert.equal(ADMIN.length > 0, true);
});

test('제보자 이름: 공개에 동의한 자동 공개 제보만 이름을 내보내고, 동의하지 않았거나 이름이 없으면 필드 자체가 없다', async t => {
  const s = await setup(t);
  const yes = await submit(s, { species: '까치', lat: 36.1, lon: 127.1, reporter: '동의탐조', namePublic: true });
  const no = await submit(s, { species: '박새', lat: 36.3, lon: 127.3, reporter: '비동의탐조', namePublic: false });
  const blank = await submit(s, { species: '딱새', lat: 36.5, lon: 127.5, reporter: '', namePublic: true });
  const spots = await pending(s), by = id => spots.find(x => x.id === id);
  assert.equal(by(yes.body.request_id).reporter, '동의탐조');
  assert.ok(!('reporter' in by(no.body.request_id)) && !('reporter' in by(blank.body.request_id)));
  for (const strict of [false, true]) for (const p of ['/reports/pending', '/reports/search?q=' + encodeURIComponent('박새'), '/reports/recent-sites?days=30', '/reports/approved']) {
    s.pub.REPORTS_PUBLICATION_REQUIRED = String(strict);
    assert.ok(!JSON.stringify((await get(s.pub, p, strict)).body).includes('비동의탐조'), p + ' 에 동의하지 않은 이름이 없다');
  }
});

test('자동 공개 유효기간: 14일 안에는 공개 목록·검색에 있고 넘으면 둘 다에서 내려가며, 공개 중지·반려는 즉시 내려간다(응답 순서와 무관)', async t => {
  const s = await setup(t);
  const a = await submit(s, { species: '까치', lat: 36.1, lon: 127.1 }), b = await submit(s, { species: '박새', lat: 36.3, lon: 127.3 }), c = await submit(s, { species: '딱새', lat: 36.5, lon: 127.5 });
  const ids = [a, b, c].map(x => x.body.request_id), upd = s.db.sqlite.prepare('UPDATE reports SET received_at=? WHERE id=?');
  const at = days => new Date(Date.now() - days * 86400000).toISOString();
  const visible = async () => (await pending(s)).map(x => x.id).sort();
  assert.deepEqual(await visible(), [...ids].sort());
  upd.run(at(13.9), ids[0]); upd.run(at(14.1), ids[1]);
  assert.deepEqual(await visible(), [ids[0], ids[2]].sort(), '14일을 넘긴 건만 내려간다');
  s.pub.REPORTS_PUBLICATION_REQUIRED = 'true';
  const found = async q => (await get(s.pub, '/reports/search?q=' + encodeURIComponent(q), true)).body.reports.map(x => x.id);
  assert.deepEqual(await found('박새'), [], '만료된 건은 검색에서도 내려간다');
  assert.deepEqual(await found('까치'), [ids[0]]);
  // 응답 순서: 같은 자료를 여러 번 읽어도 같은 집합이고 중복이 없다.
  for (let i = 0; i < 4; i++) { const got = (await pending(s)).map(x => x.id); assert.equal(new Set(got).size, got.length); assert.deepEqual([...got].sort(), [ids[0], ids[2]].sort()); }
  // 공개 중지(관리자): 즉시 내려간다. 원본 기록은 그대로 남는다.
  const [{ revision }] = s.db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').all(ids[2]);
  const stop = await adminPost(s.admin, s.token, ids[2], { action: 'visibility', public: false, request_id: input(990).request_id, expected_revision: revision });
  assert.equal(stop.status, 200, await stop.clone().text());
  assert.deepEqual(await visible(), [ids[0]]);
  assert.equal(s.db.sqlite.prepare('SELECT COUNT(*) n FROM reports WHERE id=?').get(ids[2]).n, 1);
});
