// 2026-11-14 사용자 최종 정책
// - 단순 문장부호 오기(호사비오리')는 공식 국명으로 정규화해 확정 종으로 센다. 원문은 보존한다.
// - ?·추정·류 등 동정 불확실 표현과 공식 목록에 없는 이름은 분류 미확인: 승인 후 공개, 명확한 개체수는 합산, 확정 종수에서는 제외.
// - 위치는 분류와 따로 판단한다(정규화된 보호종 포함).
// 합성 SQLite(canonicalDb)와 실제 접수·관리자 처리 경로만 쓴다. 운영 D1·Worker 와 무관하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import adminWorker from '../src/admin.js';
import { kstDateString, isUnclassifiedSpecies, normalizeSpeciesToken, isProtectedSpeciesReport, statsSpeciesItems, historyEntry, isLocationRestricted } from '../src/shared.js';
import { reporterLifetimeCounts, reporterSpeciesNames } from '../src/publication.js';

const TODAY = kstDateString(new Date());
const WHO = '분류시험';
async function setup(t) {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb();
  return { db, ...environments(db), token: auth.token };
}
let n = 7100;
const submit = async (s, patch) => {
  const body = input(n++, { observedOn: TODAY, lat: 36 + (n % 500) / 1e3, lon: 127 + (n % 500) / 1e3, reporter: WHO, namePublic: true, birdCount: null, ...patch });
  const r = await post(s.pub, body); assert.equal(r.status, 201, await r.clone().text());
  return body.request_id;
};
const rev = (s, id) => s.db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').get(id).revision;
const act = (s, id, extra = {}) => adminPost(s.admin, s.token, id, { action: 'approve', request_id: input(n++).request_id, expected_revision: rev(s, id), ...extra });
const stats = async (s, q) => (await (await adminWorker.fetch(new Request('https://admin.example/admin/api/stats?' + q, { headers: { 'Cf-Access-Jwt-Assertion': s.token } }), s.admin)).json());
async function get(env, path) {
  const url = new URL('https://synthetic.invalid' + path), nonce = 'c'.repeat(32);
  const h = await (await handleRequest(new Request('https://synthetic.invalid/reports/public-state?nonce=' + nonce, { headers: { Origin: ORIGIN } }), env)).json();
  for (const [k, v] of Object.entries({ contract: 'publication-v1', nonce, expectedEpoch: h.publication.epoch, expectedRevision: h.publication.revision })) url.searchParams.set(k, v);
  const r = await handleRequest(new Request(url, { headers: { Origin: ORIGIN } }), env);
  assert.equal(r.status, 200, path); return r.json();
}

test('정규화: 단순 문장부호만 지워 공식 국명과 정확히 맞을 때 확정, 불확실 표현·영문 문장부호·숫자 사이 부호는 그대로', () => {
  for (const [raw, out] of [["호사비오리'", '호사비오리'], ["호사비오리' 3마리", '호사비오리 3마리'], ['호사비오리.', '호사비오리'], ['호사비오리’', '호사비오리'], ['"호사비오리"', '호사비오리'], ['`동박새`3', '동박새3']])
    assert.equal(normalizeSpeciesToken(raw), out, raw);
  for (const raw of ['호사비오리?', '호사비오리추정', '호사비오리류', "호사비오리'류", '(호사비오리)', "가짜새'", "Ross's Gull", "Ross's Gull'", '고니3.5', "고니3'5", '호 사 비 오 리'])
    assert.equal(normalizeSpeciesToken(raw), raw, raw);
  for (const name of ['동박새', '동박새 3', 'Zosterops japonicus', '호사비오리', "호사비오리'", 'Calidris pygmaea', "Ross's Gull"]) assert.equal(isUnclassifiedSpecies(name), false, name);
  for (const name of ['호사비오리?', '호사비오리추정', '호사비오리류', '미확인종', '가짜새', '백로', '(호사비오리)', '', null]) assert.equal(isUnclassifiedSpecies(name), true, String(name));
  // 문장부호 오기로 보호종 판정을 피할 수 없다.
  for (const name of ["호사비오리'", '호사비오리.', "'호사비오리' 2마리", "동박새3 호사비오리'2"]) assert.equal(isProtectedSpeciesReport({ species: [name], speciesText: name }), true, name);
});

test('집계 예시 표: 읽기 해석은 원문을 바꾸지 않고 종수·개체수를 따로 판단', () => {
  const pick = text => statsSpeciesItems(text).map(i => [i.name, i.count, i.unclassified]);
  assert.deepEqual(pick('동박새 3마리'), [['동박새', 3, false]]);
  assert.deepEqual(pick("호사비오리' 3마리"), [['호사비오리', 3, false]]);
  assert.deepEqual(pick("호사비오리'"), [['호사비오리', null, false]]);
  assert.deepEqual(pick('동박새 3마리 · 미확인종 2마리'), [['동박새', 3, false], ['미확인종', 2, true]]);
  assert.deepEqual(pick('호사비오리추정 2마리'), [['호사비오리추정', 2, true]], '불확실 표현은 분류 미확인, 명확한 수량은 셈');
  // 수량 자체가 불확실하면 세지 않는다.
  for (const raw of ["호사비오리' 3~5마리", "호사비오리' 3마리?", "호사비오리' 약 3마리 이상", '3마리', "호사비오리' 0", '고니3.5']) assert.equal(statsSpeciesItems(raw)[0].count, null, raw);
  // 같은 종 두 번은 합산하지 않는다(기존 중복 원칙).
  assert.deepEqual(pick("호사비오리' 3 · 호사비오리' 2"), [['호사비오리', null, false]]);
  assert.deepEqual(reporterLifetimeCounts([{ species: "호사비오리' 3마리" }, { species: '동박새 3마리 · 미확인종 2마리' }]), { speciesCount: 2, reportCount: 2 });
  assert.deepEqual(reporterSpeciesNames([{ species: "호사비오리'" }, { species: '호사비오리추정' }, { species: '동박새' }, { species: '참새', note: '둥지' }]),
    { species: ['동박새', '호사비오리'], unclassified: ['호사비오리추정'], restricted: true });
  const entry = historyEntry({ id: 'x', observed_on: TODAY, species: "동박새 3 · 호사비오리' 2 · 미확인종 1" });
  // 공식 국명이 아닌 과거 원문 토큰은 기존처럼 원문 그대로 종명 칸에 남고(수량 포함), 개체수 칸에서만 나뉜다.
  assert.deepEqual(entry.species, ['동박새', '호사비오리', '미확인종 1']);
  assert.deepEqual(entry.unclassified, ['미확인종 1']);
  assert.deepEqual(entry.sightings, [{ name: '동박새', count: 3, countStatus: 'reported' }, { name: '호사비오리', count: 2, countStatus: 'reported' }, { name: '미확인종', count: 1, countStatus: 'reported', unclassified: true }]);
});

test('승인 후 공개·종수·개체수, 관리자 동정 후 종수 반영과 개체수 중복 없음, 원문 보존', async t => {
  const s = await setup(t);
  const ids = {
    a: await submit(s, { species: '동박새 3마리' }),                      // 동박새, 3
    b: await submit(s, { species: "호사비오리' 3마리" }),                // 호사비오리(정규화), 3
    c: await submit(s, { species: "호사비오리'" }),                      // 호사비오리(정규화), 미기록
    d: await submit(s, { species: '동박새 3마리, 미확인종 2마리' }),     // 동박새 + 분류 미확인, 5
    e: await submit(s, { species: '가짜새', birdCount: 4 }),             // 분류 미확인, 양식 개체수 4
    f: await submit(s, { species: '가짜새 3마리', birdCount: 5 }),       // 분류 미확인, 수량 상충 → 미기록
    g: await submit(s, { species: '호사비오리추정 2마리' }),             // 불확실 표현: 분류 미확인, 2
  };
  const before = JSON.stringify(s.db.sqlite.prepare('SELECT id,species,bird_count FROM reports ORDER BY id').all());
  for (const id of Object.values(ids)) assert.equal((await act(s, id)).status, 200, id);
  let sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.approved, 7, '분류 미확인·문장부호 오기 제보도 승인된다');
  assert.equal(sum.species, 2, '확정 종: 동박새·호사비오리');
  assert.equal(sum.individuals, 3 + 3 + 5 + 4 + 2, '명확한 개체수만');
  const sp = Object.fromEntries((await stats(s, 'view=species')).rows.map(r => [r.species, r]));
  assert.equal(sp['호사비오리'].unclassified, 0); assert.equal(sp['호사비오리'].total, 2); assert.equal(sp['호사비오리'].individuals, 3);
  assert.equal(sp["호사비오리'"], undefined, '오기 원문이 별도 종으로 남지 않음');
  assert.equal(sp['동박새'].individuals, 6);
  assert.equal(sp['미확인종'].unclassified, 1); assert.equal(sp['미확인종'].individuals, 2);
  assert.equal(sp['호사비오리추정'].unclassified, 1); assert.equal(sp['호사비오리추정'].individuals, 2);
  assert.equal(sp['가짜새'].individuals, 4, 'e 의 양식 개체수, f 는 상충이라 제외');
  assert.equal((await stats(s, 'view=reporters')).rows.find(r => r.reporter === WHO).species, 2);
  // 공개: 비번식 확인 신규 제보라 지도에 오른다(보호종도 제보자 선택). 정규화 이름으로 보이고 분류 미확인만 표시가 붙는다.
  const spots = (await get(s.pub, '/reports/approved')).spots;
  assert.ok(Object.values(ids).every(id => spots.find(x => x.id === id)));
  const c = spots.find(x => x.id === ids.c);
  assert.deepEqual(c.species, ['호사비오리']); assert.equal(c.unclassified, undefined);
  assert.deepEqual(spots.find(x => x.id === ids.g).unclassified, ['호사비오리추정']);
  const d = spots.find(x => x.id === ids.d).history[0];
  assert.deepEqual(d.sightings.map(i => [i.name, i.count, i.unclassified === true]), [['동박새', 3, false], ['미확인종', 2, true]]);
  const found = (await get(s.pub, '/reports/search?q=' + encodeURIComponent('호사비오리'))).reports;
  assert.deepEqual(found.map(r => r.id).sort(), [ids.b, ids.c, ids.g].sort());
  const rs = await get(s.pub, '/reports/reporter-stats?reporter=' + encodeURIComponent(WHO) + '&source=all');
  assert.deepEqual([rs.speciesCount, rs.reportCount], [2, 7]);
  const names = await get(s.pub, '/reports/reporter-species?reporter=' + encodeURIComponent(WHO) + '&source=all');
  assert.deepEqual(names.species, ['동박새', '호사비오리']);
  assert.deepEqual(names.unclassified, ['가짜새', '미확인종', '호사비오리추정']);
  // 원문·양식 개체수는 읽기·승인 중 바뀌지 않는다.
  assert.equal(JSON.stringify(s.db.sqlite.prepare('SELECT id,species,bird_count FROM reports ORDER BY id').all()), before);
  assert.equal(s.db.sqlite.prepare('SELECT species_original FROM sightings WHERE checklist_id=?').get(ids.b).species_original, "호사비오리' 3마리");
  // 관리자 동정: e(가짜새, 4)를 참새 4 로 확정 → 종수 +1, 개체수는 그대로(중복 합산 없음). 정본 원문은 보존.
  assert.equal((await act(s, ids.e, { species: '참새 4' })).status, 200);
  sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.species, 3); assert.equal(sum.individuals, 17);
  assert.equal(s.db.sqlite.prepare('SELECT species_original FROM sightings WHERE checklist_id=? ORDER BY source_ordinal').get(ids.e).species_original, '가짜새');
  assert.equal((await get(s.pub, '/reports/reporter-stats?reporter=' + encodeURIComponent(WHO) + '&source=all')).speciesCount, 3);
});

test('위치는 분류와 따로: 번식은 항상, 비번식 확인 없으면 정규화된 보호종·분류 미확인 모두 좌표 비공개', () => {
  const base = { id: 'legacy', species: "호사비오리'", lat: 36.987654, lon: 126.876543, observed_on: TODAY };
  assert.equal(isLocationRestricted(base), true, '문장부호 오기 보호종(과거 자료)은 보호종 규칙으로 가린다');
  assert.equal(isLocationRestricted({ ...base, species: '호사비오리추정' }), true, '불확실 표현은 보호종일 수 있어 가린다');
  assert.equal(isLocationRestricted({ ...base, species: '참새' }), false, '확인된 일반종 과거 자료는 기존대로');
  assert.equal(isLocationRestricted({ ...base, species: "참새'" }), false, '일반종 오기도 정규화되어 일반종 규칙');
  assert.equal(isLocationRestricted({ ...base, species: '참새', note: '포란 중' }), true);
});
