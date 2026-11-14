// 독립 보안 행렬: 분류기를 거치지 않고 DB 행·검토 기록을 직접 꾸며, 공개 응답(대기·검색·상태·승인·최근·기여자)만으로
// "공개되면 안 되는 대기 제보"가 어디에도 좌표를 내보내지 않는지 확인한다. 양성 대조군(정상 자동 공개 1건)이
// 실제로 보이는지도 함께 확인해, 검사 자체가 누출을 잡을 수 있음을 보인다. 스위치 ON/OFF 두 상태 모두.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import { kstDateString } from '../src/shared.js';

const TODAY = kstDateString(new Date());
const MARK = { actor: 'system:auto-public', reason: 'auto_public:auto-public-v1' };
// 각 사례: 좌표를 고유하게 주고, 그 숫자가 어떤 공개 응답에도 나오면 실패.
const CASES = [
  { key: 'legacy_flag_only', patch: {}, review: null },                                            // 과거 pending_public=1 만
  { key: 'hold_record', patch: {}, review: { reason: 'hold:protected' } },                          // 보류 판정인데 플래그만 1
  { key: 'unknown_policy', patch: {}, review: { reason: 'auto_public:auto-public-v0' } },           // 판정 근거 불충분(다른 정책)
  { key: 'wrong_actor', patch: {}, review: { actor: 'admin@example.test' } },                       // 시스템 판정이 아님
  { key: 'wrong_sequence', patch: {}, review: { sequence: 2, withFirst: true } },                   // 접수 판정 위치가 아님
  { key: 'wrong_decision', patch: {}, review: { decision: 'corrected' } },
  { key: 'v2_edited_protected', patch: { species: '매' }, review: {} },                                 // 제보 뒤 보호종으로 정정된 행: 위치 정책 v2 가 비공개 유지(비번식 확인이 원본과 달라짐)
  { key: 'v2_edited_protected_mixed', patch: { species: '참새 · 저어새' }, review: {} },
  { key: 'unknown_name', patch: { species: '처음보는새' }, review: {} },
  { key: 'uncertain_name', patch: { species: '참새?' }, review: {} },
  { key: 'breeding_note', patch: { note: '둥지에서 새끼 확인' }, review: {} },
  { key: 'breeding_species', patch: { species: '참새 번식' }, review: {} },
  { key: 'count_anomaly', patch: { bird_count: 5000 }, review: {} },
  { key: 'expired', patch: { received_at: new Date(Date.now() - 20 * 86400000).toISOString() }, review: {} },
  { key: 'withdrawn', patch: { pending_public: 0 }, review: {} },
  { key: 'rejected', patch: { status: 'rejected' }, review: {} },
];
const coord = i => ({ lat: Number((35.1 + i * 0.0137).toFixed(6)), lon: Number((126.3 + i * 0.0173).toFixed(6)) });
const needles = c => [String(c.lat), String(c.lon), c.lat.toFixed(4), c.lon.toFixed(4)];
// 짧은 좌표(예: 35.1)가 시각 문자열("...:35.123Z")의 일부와 우연히 겹치면 거짓 경보가 난다(초가 35이고 밀리초가 1로 시작할 때만 실패하던 간헐 실패의 원인).
// 시각 문자열을 먼저 빼고, 앞뒤가 숫자·소수점이 아닌 독립된 수일 때만 노출로 센다. 두 번째 원인: 초.밀리초가 좌표 전체(35.237)와 같아질 때도 있었다. 실제 좌표 값(JSON 수)은 그대로 잡힌다.
const ISO_TIME = /\d{4}-\d\d-\d\dT[0-9:.]+Z/g;
const hasNumber = (text, d) => new RegExp('(?<![0-9.])' + d.replace(/\./g, '\\.') + '(?![0-9])').test(text.replace(ISO_TIME, '""'));

async function build(t, flags) {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), envs = environments(db);
  Object.assign(envs.pub, { REPORTS_AUTO_PUBLIC: '0', REPORTS_UNVERIFIED_READS: '0' }); // 접수는 판정 없이(기록 0건)
  const rows = [];
  for (const [i, c] of [...CASES, { key: 'positive_control', patch: {}, review: {} }, { key: 'positive_hidden', patch: {}, review: {}, hide: true }, { key: 'positive_protected', species: '저어새', patch: {}, review: {} }, { key: 'positive_rare', species: '말똥가리', patch: {}, review: {} }].entries()) {
    // 가림 대조군의 무작위 대략점(1.5~4.5 km)이 다른 행의 좌표 숫자와 우연히 겹치지 않게 멀리 둔다.
    const p = c.hide ? { lat: 33.214567, lon: 128.937891 } : coord(i), body = input(3000 + i, { species: c.species || '참새', observedOn: TODAY, ...p, hideLocation: !!c.hide });
    assert.equal((await post(envs.pub, body)).status, 201);
    const id = body.request_id, sql = db.sqlite;
    const patch = { pending_public: 1, ...c.patch };
    sql.prepare(`UPDATE reports SET ${Object.keys(patch).map(k => k + '=?').join(',')} WHERE id=?`).run(...Object.values(patch), id);
    if (c.review) {
      const r = c.review, ins = (seq, actor, reason, decision) => sql.prepare(`INSERT INTO reviews(review_id,checklist_id,sequence,decision,sighting_id,validated_taxon_id,validated_count,validated_count_accuracy,from_status,to_status,actor_id,request_id,event_index,reason_code,note,created_at)
        VALUES (?,?,?,?,NULL,NULL,NULL,NULL,NULL,'pending',?,?,0,?,NULL,?)`).run(`review:matrix:${id}:${seq}`, id, seq, decision, actor, `${id}:${seq}`, reason, new Date().toISOString());
      if (r.withFirst) ins(1, 'admin@example.test', 'corrected', 'corrected');
      ins(r.sequence || 1, r.actor || MARK.actor, r.reason || MARK.reason, r.decision || 'submitted');
    }
    rows.push({ key: c.key, id, p, hide: !!c.hide });
  }
  Object.assign(envs.pub, flags);
  return { ...envs, rows, db };
}
async function get(env, path, strict) {
  const url = new URL('https://synthetic.invalid' + path);
  if (strict) {
    const h = await (await handleRequest(new Request('https://synthetic.invalid/reports/public-state?nonce=' + 'e'.repeat(32), { headers: { Origin: ORIGIN } }), env)).json();
    for (const [k, v] of Object.entries({ contract: 'publication-v1', nonce: 'e'.repeat(32), expectedEpoch: h.publication.epoch, expectedRevision: h.publication.revision })) url.searchParams.set(k, v);
  }
  const r = await handleRequest(new Request(url, { headers: { Origin: ORIGIN } }), env);
  return await r.json();
}
async function publicDump(s) {
  const out = [];
  for (const strict of [false, true]) {
    s.pub.REPORTS_PUBLICATION_REQUIRED = String(strict);
    for (const p of ['/reports/pending', '/reports/approved', '/reports/search?q=', '/reports/search?q=' + encodeURIComponent('참새'), '/reports/recent-sites?days=30', '/contributors/monthly', '/contributors/all'])
      out.push({ path: p, strict, body: await get(s.pub, p, strict) });
    for (const r of s.rows) out.push({ path: 'status:' + r.key, strict, body: await get(s.pub, '/reports/' + r.id + '/status', false) });
  }
  return out;
}

for (const [label, flags] of [['ON', { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1' }], ['OFF', { REPORTS_AUTO_PUBLIC: '0', REPORTS_UNVERIFIED_READS: '0' }], ['reads-only-ON', { REPORTS_AUTO_PUBLIC: '0', REPORTS_UNVERIFIED_READS: '1' }]]) {
  test(`보안 행렬(스위치 ${label}): 근거 없는·정정으로 보호종이 된·번식·미확인·불확실·개체수 이상·만료·중지·반려 대기 제보는 좌표가 어디에도 없다`, async t => {
    const s = await build(t, flags);
    const dump = await publicDump(s);
    const text = JSON.stringify(dump);
    for (const r of s.rows.filter(r => !r.key.startsWith('positive')))
      for (const d of needles(r.p)) assert.ok(!hasNumber(text, d), `${label}: ${r.key} 좌표 ${d} 노출`);
    for (const r of s.rows.filter(r => !r.key.startsWith('positive')))
      for (const strict of [false, true])
        assert.notEqual(dump.find(x => x.path === 'status:' + r.key && x.strict === strict).body.publicVisibility, 'public_unverified', r.key);
    const pending = dump.filter(x => x.path === '/reports/pending').map(x => x.body.spots.map(sp => sp.id).sort());
    const control = s.rows.find(r => r.key === 'positive_control'), hidden = s.rows.find(r => r.key === 'positive_hidden');
    const positives = s.rows.filter(r => r.key.startsWith('positive') && r.key !== 'positive_protected');
    const protectedRow=s.rows.find(r=>r.key==='positive_protected');
    for(const d of needles(protectedRow.p)) assert.ok(!hasNumber(text,d),'protected positive is now withheld');
    if (flags.REPORTS_UNVERIFIED_READS === '1') {
      // 양성 대조군: 정상 판정 기록이 있는 제보(일반종·보호종·희귀종 원본 제보)만 보인다(검사가 누출을 잡을 수 있음).
      for (const ids of pending) assert.deepEqual(ids, positives.map(r => r.id).sort());
      for (const r of positives.filter(r => r.key !== 'positive_hidden')) assert.ok(text.includes(String(r.p.lat)), r.key + ' 좌표는 위치 정책 v2 범위에서 보여야 한다');
      // 가림 대조군: 실제 좌표(소수 6자리)는 어디에도 없고, 공개점은 실제 위치에서 1 km 이상 떨어져 있다(대략점 1.5~4.5 km).
      for (const d of [hidden.p.lat.toFixed(6), hidden.p.lon.toFixed(6)]) assert.ok(!text.includes(d), '위치 가리기 대조군은 실제 좌표가 없어야 한다');
      for (const x of dump.filter(x => x.path === '/reports/pending')) {
        const sp = x.body.spots.find(sp => sp.id === hidden.id), rad = Math.PI / 180;
        const m = 6371000 * Math.acos(Math.min(1, Math.sin(sp.lat * rad) * Math.sin(hidden.p.lat * rad) + Math.cos(sp.lat * rad) * Math.cos(hidden.p.lat * rad) * Math.cos((sp.lon - hidden.p.lon) * rad)));
        assert.ok(sp.locationHidden === true && m >= 1000, '가림 대조군 공개점 거리 ' + Math.round(m));
      }
    } else {
      // 스위치 OFF: PR #78 과 같이 대기 제보는 전부 비공개.
      for (const ids of pending) assert.deepEqual(ids, []);
      for (const r of positives) for (const d of needles(r.p)) assert.ok(!hasNumber(text, d), 'OFF 에서는 대조군(' + r.key + ')도 비공개');
    }
  });
}

test('좌표 노출 검사 보조: 시각 문자열 속 우연한 일치는 세지 않고 실제 좌표 수는 잡는다(간헐 실패 회귀)', () => {
  assert.equal(hasNumber('{"received_at":"2026-11-08T08:43:35.123Z"}', '35.1'), false);
  assert.equal(hasNumber('{"received_at":"2026-11-08T08:44:35.237Z"}', '35.237'), false, '밀리초까지 같은 경우');
  assert.equal(JSON.stringify({ at: '2026-11-08T08:43:35.123Z' }).includes('35.1'), true, '예전 검사는 여기서 거짓 경보');
  assert.equal(hasNumber('{"lat":35.1,"lon":127.2}', '35.1'), true);
  assert.equal(hasNumber('{"lat":35.1234}', '35.1'), false);
  assert.equal(hasNumber('{"lat":35.1234}', '35.1234'), true);
  assert.equal(hasNumber('[35.1]', '35.1'), true);
});
