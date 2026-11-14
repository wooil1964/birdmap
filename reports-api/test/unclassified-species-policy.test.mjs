// 2026-11-14 사용자 정책: 분류 미확인 제보도 관리자 승인 후 공개, 명확한 개체수는 합산, 확정 종수에서는 제외.
// 합성 SQLite(canonicalDb)와 실제 접수·관리자 처리 경로만 쓴다. 운영 D1·Worker 와 무관하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import adminWorker from '../src/admin.js';
import { kstDateString, isUnclassifiedSpecies, statsSpeciesItems, historyEntry, isLocationRestricted } from '../src/shared.js';
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

test('분류 판정: 공식 국명·학명·영명만 확인, 오기·임의 표기는 자동 교정 없이 분류 미확인', () => {
  for (const name of ['동박새', '동박새 3', 'Zosterops japonicus', '호사비오리', 'Calidris pygmaea']) assert.equal(isUnclassifiedSpecies(name), false, name);
  for (const name of ["호사비오리'", '미확인종', '가짜새', '백로', '호사비오리.', '', null]) assert.equal(isUnclassifiedSpecies(name), true, String(name));
});

test('집계 예시 표: 읽기 해석은 원문을 바꾸지 않고 종수·개체수를 따로 판단', () => {
  const pick = text => statsSpeciesItems(text).map(i => [i.name, i.count, i.unclassified]);
  assert.deepEqual(pick('동박새 3마리'), [['동박새', 3, false]]);
  assert.deepEqual(pick("호사비오리' 3마리"), [["호사비오리'", 3, true]]);
  assert.deepEqual(pick("호사비오리'"), [["호사비오리'", null, true]]);
  assert.deepEqual(pick('동박새 3마리 · 미확인종 2마리'), [['동박새', 3, false], ['미확인종', 2, true]]);
  // 수량 자체가 불확실하면 세지 않는다.
  for (const raw of ["호사비오리' 3~5마리", "호사비오리' 3마리?", "호사비오리' 약 3마리 이상", '3마리', "호사비오리' 0"]) assert.equal(statsSpeciesItems(raw)[0].count, null, raw);
  // 같은 이름 두 번은 합산하지 않는다(기존 중복 원칙).
  assert.deepEqual(pick("호사비오리' 3 · 호사비오리' 2"), [["호사비오리'", null, true]]);
  assert.deepEqual(reporterLifetimeCounts([{ species: "호사비오리' 3마리" }, { species: '동박새 3마리 · 미확인종 2마리' }]), { speciesCount: 1, reportCount: 2 });
  assert.deepEqual(reporterSpeciesNames([{ species: "호사비오리'" }, { species: '동박새' }, { species: '참새', note: '둥지' }]),
    { species: ['동박새'], unclassified: ["호사비오리'"], restricted: true });
  const entry = historyEntry({ id: 'x', observed_on: TODAY, species: "동박새 3 · 호사비오리' 2" });
  assert.deepEqual(entry.species, ['동박새', "호사비오리' 2"]);
  assert.deepEqual(entry.unclassified, ["호사비오리' 2"]);
  assert.deepEqual(entry.sightings, [{ name: '동박새', count: 3, countStatus: 'reported' }, { name: "호사비오리'", count: 2, countStatus: 'reported', unclassified: true }]);
});

test('승인 후 공개·종수 제외·개체수 포함, 관리자 동정 후 종수 반영과 개체수 중복 없음', async t => {
  const s = await setup(t);
  const ids = {
    a: await submit(s, { species: '동박새 3마리' }),                      // 1종, 3
    b: await submit(s, { species: "호사비오리' 3마리" }),                // 0종, 3
    c: await submit(s, { species: "호사비오리'" }),                      // 0종, 미기록
    d: await submit(s, { species: '동박새 3마리, 미확인종 2마리' }),     // (동박새 중복) 5
    e: await submit(s, { species: '가짜새', birdCount: 4 }),             // 양식 개체수만: 0종, 4
    f: await submit(s, { species: '가짜새 3마리', birdCount: 5 }),       // 수량 상충: 0종, 미기록
  };
  const before = JSON.stringify(s.db.sqlite.prepare('SELECT id,species,bird_count FROM reports ORDER BY id').all());
  for (const id of Object.values(ids)) assert.equal((await act(s, id)).status, 200, id);
  let sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.approved, 6, '분류 미확인 제보도 승인된다');
  assert.equal(sum.species, 1, '확정 종은 동박새 1종');
  assert.equal(sum.individuals, 3 + 3 + 5 + 4, '명확한 개체수만: a3 + b3 + d(3+2) + e4');
  const rows = (await stats(s, 'view=species')).rows, sp = Object.fromEntries(rows.map(r => [r.species, r]));
  assert.equal(sp['동박새'].unclassified, 0); assert.equal(sp['동박새'].individuals, 6);
  assert.equal(sp['미확인종'].unclassified, 1); assert.equal(sp['미확인종'].individuals, 2);
  assert.equal(sp["호사비오리'"].unclassified, 1); assert.equal(sp["호사비오리'"].individuals, 3, 'b 의 3, c 는 미기록');
  assert.equal(sp['가짜새'].individuals, 4, 'e 의 양식 개체수, f 는 상충이라 제외');
  assert.equal((await stats(s, 'view=reporters')).rows.find(r => r.reporter === WHO).species, 1);
  assert.deepEqual((await stats(s, 'view=monthly')).rows.map(r => r.species), [1]);
  // 공개: 비번식 확인 신규 제보라 지도에 오른다. 종명은 원문 그대로, 분류 미확인 표시만 붙는다.
  const spots = (await get(s.pub, '/reports/approved')).spots;
  assert.deepEqual(Object.values(ids).map(id => !!spots.find(x => x.id === id)), [true, true, true, true, true, true]);
  const c = spots.find(x => x.id === ids.c);
  assert.deepEqual(c.species, ["호사비오리'"]); assert.deepEqual(c.unclassified, ["호사비오리'"]);
  const d = spots.find(x => x.id === ids.d).history[0];
  assert.deepEqual(d.sightings.map(i => [i.name, i.count, i.unclassified === true]), [['동박새', 3, false], ['미확인종', 2, true]]);
  const found = (await get(s.pub, '/reports/search?q=' + encodeURIComponent('호사비오리'))).reports;
  assert.deepEqual(found.map(r => r.id).sort(), [ids.b, ids.c].sort());
  const rs = await get(s.pub, '/reports/reporter-stats?reporter=' + encodeURIComponent(WHO) + '&source=all');
  assert.deepEqual([rs.speciesCount, rs.reportCount], [1, 6]);
  const names = await get(s.pub, '/reports/reporter-species?reporter=' + encodeURIComponent(WHO) + '&source=all');
  assert.deepEqual(names.species, ['동박새']);
  assert.ok(names.unclassified.includes("호사비오리'") && names.unclassified.includes('미확인종'), JSON.stringify(names));
  assert.equal(names.restricted, false);
  // 원문·양식 개체수는 읽기·승인 중 바뀌지 않는다.
  assert.equal(JSON.stringify(s.db.sqlite.prepare('SELECT id,species,bird_count FROM reports ORDER BY id').all()), before);
  // 관리자 동정: b 를 호사비오리 3 으로 확정 → 종수 +1, 개체수는 그대로(중복 합산 없음). 정본 원문은 보존.
  assert.equal((await act(s, ids.b, { species: '호사비오리 3' })).status, 200);
  sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.species, 2); assert.equal(sum.individuals, 15);
  assert.equal(s.db.sqlite.prepare('SELECT species_original FROM sightings WHERE checklist_id=? ORDER BY source_ordinal').get(ids.b).species_original, "호사비오리' 3마리");
  assert.equal((await get(s.pub, '/reports/reporter-stats?reporter=' + encodeURIComponent(WHO) + '&source=all')).speciesCount, 2);
});

test('위치는 분류와 따로: 번식은 항상, 비번식 확인 없는 분류 미확인은 보호종처럼 좌표 비공개', () => {
  const base = { id: 'legacy', species: "호사비오리'", lat: 36.987654, lon: 126.876543, observed_on: TODAY };
  assert.equal(isLocationRestricted(base), true, '과거 자료(비번식 확인 없음)는 보호종 가능성으로 가린다');
  assert.equal(isLocationRestricted({ ...base, species: '참새' }), false, '확인된 일반종 과거 자료는 기존대로');
  assert.equal(isLocationRestricted({ ...base, species: '호사비오리' }), true, '보호종 과거 자료는 기존대로');
  assert.equal(isLocationRestricted({ ...base, note: '포란 중' }), true);
});
