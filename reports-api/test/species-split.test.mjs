// 종명·개체수 분리: 접수 때 종별 sightings 저장, 자동 공개 판정, 관리자 정정, 검색·관리자 통계·회원별 통계의 일관성.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, post, adminPost, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import adminWorker from '../src/admin.js';
import { parseSpeciesItems, kstDateString, splitSpecies, normalizeSpecies } from '../src/shared.js';
import { contentReasons } from '../src/autopublic.js';
import { quickInput, persistQuick } from '../src/canonical/persistence.js';
import { dedupeHash, sha256Hex } from '../src/shared.js';

const TODAY = kstDateString(new Date());
const parse = text => parseSpeciesItems(normalizeSpecies(text));
const reasons = (text, birdCount = null) => [...contentReasons({ species: normalizeSpecies(text), speciesText: normalizeSpecies(text).join(' · '), birdCount, note: null })].sort();

test('분리: 동박새3 = 동박새 3 = 동박새 3마리 = 동박새 3개체, 숫자 없으면 미입력(1로 보지 않음)', () => {
  for (const t of ['동박새3', '동박새 3', '동박새 3마리', '동박새 3개체', '동박새3개체']) {
    const p = parse(t);
    assert.equal(p.clean, true, t); assert.deepEqual(p.items.map(i => [i.name, i.count]), [['동박새', 3]], t);
  }
  assert.deepEqual(parse('동박새').items.map(i => [i.name, i.count]), [['동박새', null]]);
});

test('분리: 동박새3, 박새2, 직박구리1 → 3종 6개체 / 쇠딱다구리 미입력 / 같은 종 두 번은 합산하지 않음', () => {
  const a = parse('동박새3, 박새2, 직박구리1');
  assert.deepEqual(a.items.map(i => [i.name, i.count]), [['동박새', 3], ['박새', 2], ['직박구리', 1]]);
  assert.equal(a.species.length, 3); assert.equal(a.items.reduce((n, i) => n + i.count, 0), 6);
  const b = parse('동박새3, 박새2, 쇠딱다구리');
  assert.deepEqual(b.items.map(i => [i.name, i.count]), [['동박새', 3], ['박새', 2], ['쇠딱다구리', null]]);
  const c = parse('동박새3, 동박새5');
  assert.equal(c.clean, true); assert.deepEqual(c.species, ['동박새']); assert.deepEqual(c.duplicates, ['동박새']);
});

test('분리 실패(관리자 검토): 종명 미확정·숫자 오인식·형식 밖 입력', () => {
  for (const t of ['3동박새', '동박새 3 5', '동박새 03', '동박새 0', '동박새3마리2', '동박새?3', '동3박새', 'Zosterops japonicus 3쌍', '동박새 3쌍', '동박새 1000000'])
    assert.equal(parseSpeciesItems([t]).clean, false, t);
});

test('자동 공개 판정: 복수 종은 모두 적격이어야, 수량 표기마다 상한, 혼합·불확실·중복은 보류', () => {
  assert.deepEqual(reasons('동박새3'), []);
  assert.deepEqual(reasons('동박새 3개체'), []);
  assert.deepEqual(reasons('동박새3, 박새2, 직박구리1'), []);
  assert.deepEqual(reasons('동박새3, 박새2, 쇠딱다구리'), []);
  assert.deepEqual(reasons('동박새3, 동박새5'), ['species_parse'], '같은 종 두 번은 보류');
  assert.deepEqual(reasons('동박새3, 박새2, 매1'), [], '보호종이 섞여도 이름만으로는 보류하지 않음');
  assert.deepEqual(reasons('동박새3, 말똥가리1'), [], '희귀종도 이름만으로는 보류하지 않음');
  assert.deepEqual(reasons('동박새 3 5'), ['name_unconfirmed', 'species_parse']);
  assert.deepEqual(reasons('동박새 301'), ['count_anomaly']);
  assert.deepEqual(reasons('동박새3, 박새301'), ['count_anomaly'], '복수 종의 각 수량에 같은 상한');
  assert.deepEqual(reasons('청둥오리 3000, 참새 300'), []);
  assert.deepEqual(reasons('동박새3', 5), ['species_parse'], '양식 개체수와 다르면 보류');
  assert.deepEqual(reasons('동박새3', 3), []);
});

const ON = { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1' };
async function setup(t) {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), envs = environments(db); Object.assign(envs.pub, ON);
  return { db, ...envs, token: auth.token };
}
let n = 6000;
const submit = async (s, patch) => { const body = input(n++, { observedOn: TODAY, lat: 36 + (n % 500) / 1e3, lon: 127 + (n % 500) / 1e3, ...patch }); const r = await post(s.pub, body); return { body, receipt: await r.json(), status: r.status }; };
const sightings = (s, id) => s.db.sqlite.prepare('SELECT source_ordinal,species_original,species_identified,interpretation,count_value,count_source,interpretation_note FROM sightings WHERE checklist_id=? ORDER BY source_ordinal').all(id).map(r => ({ ...r }));
const rev = (s, id) => s.db.sqlite.prepare('SELECT revision FROM checklists WHERE checklist_id=?').get(id).revision;
const act = (s, id, action, extra = {}) => adminPost(s.admin, s.token, id, { action, request_id: input(n++).request_id, expected_revision: rev(s, id), ...extra });
async function get(env, path) {
  const url = new URL('https://synthetic.invalid' + path);
  const h = await (await handleRequest(new Request('https://synthetic.invalid/reports/public-state?nonce=' + 'f'.repeat(32), { headers: { Origin: ORIGIN } }), env)).json();
  for (const [k, v] of Object.entries({ contract: 'publication-v1', nonce: 'f'.repeat(32), expectedEpoch: h.publication.epoch, expectedRevision: h.publication.revision })) url.searchParams.set(k, v);
  return (await handleRequest(new Request(url, { headers: { Origin: ORIGIN } }), env)).json();
}
const stats = async (s, q) => (await (await adminWorker.fetch(new Request('https://admin.example/admin/api/stats?' + q, { headers: { 'Cf-Access-Jwt-Assertion': s.token } }), s.admin)).json());

test('저장: 한 제보 ID 안에 종별 sightings, 원문 보존, 미입력·중복 구분, 재전송은 중복 저장 없음', async t => {
  const s = await setup(t);
  const a = await submit(s, { species: '동박새3, 박새2, 직박구리1' });
  assert.equal(a.receipt.publicVisibility, 'public_unverified');
  assert.equal(s.db.sqlite.prepare('SELECT species FROM reports WHERE id=?').get(a.body.request_id).species, '동박새3 · 박새2 · 직박구리1', '원문 보존');
  assert.deepEqual(sightings(s, a.body.request_id).map(r => [r.source_ordinal, r.species_original, r.species_identified, r.interpretation, r.count_value, r.count_source]),
    [[1, '동박새3', '동박새', 'single', 3, 'reported'], [2, '박새2', '박새', 'single', 2, 'reported'], [3, '직박구리1', '직박구리', 'single', 1, 'reported']]);
  const b = await submit(s, { species: '동박새3, 박새2, 쇠딱다구리', lat: 35.5, lon: 128.5 });
  assert.deepEqual(sightings(s, b.body.request_id).map(r => [r.species_identified, r.count_value, r.count_source]), [['동박새', 3, 'reported'], ['박새', 2, 'reported'], ['쇠딱다구리', null, 'not_recorded']]);
  const c = await submit(s, { species: '동박새3, 동박새5', lat: 35.1, lon: 128.1 });
  assert.deepEqual(c.receipt.holdReasons, ['species_parse']);
  assert.deepEqual(sightings(s, c.body.request_id).map(r => [r.species_identified, r.interpretation, r.count_value, r.interpretation_note]), [['동박새', 'unknown', null, 'duplicate_species'], ['동박새', 'unknown', null, 'duplicate_species']]);
  const d = await submit(s, { species: '동박새 3 5', lat: 35.2, lon: 128.2 });
  assert.ok(d.receipt.holdReasons.includes('species_parse'));
  assert.deepEqual(sightings(s, d.body.request_id).map(r => [r.species_identified, r.interpretation]), [[null, 'single']], '분리 실패는 기존처럼 원문 한 행');
  const e = await submit(s, { species: '동박새3, 박새2, 처음보는새1', lat: 35.3, lon: 128.3 });
  assert.deepEqual(e.receipt.holdReasons, ['name_unconfirmed']);
  // 재전송: 같은 결과, sightings 중복 없음
  for (let i = 0; i < 2; i++) assert.equal((await (await post(s.pub, a.body)).json()).publicVisibility, 'public_unverified');
  assert.equal(sightings(s, a.body.request_id).length, 3);
  // 공개 응답은 수량 없는 국명으로
  const spots = (await get(s.pub, '/reports/pending')).spots;
  assert.deepEqual(spots.find(x => x.id === a.body.request_id).species, ['동박새', '박새', '직박구리']);
});

test('통계·검색: 동박새3과 동박새5는 1종, 개체수는 독립 집계(미입력·중복 제외), 기존 자료는 공식 국명으로 읽기 해석', async t => {
  const s = await setup(t);
  const a = await submit(s, { species: '동박새3, 박새2, 직박구리1', reporter: '통계테스터', namePublic: true });
  const b = await submit(s, { species: '동박새5, 쇠딱다구리', lat: 35.7, lon: 128.7, reporter: '통계테스터', namePublic: true });
  const dup = await submit(s, { species: '동박새3, 동박새5', lat: 35.8, lon: 128.8, reporter: '통계테스터', namePublic: true });
  // 기존(구조화 이전) 자료: 원문·정본은 그대로, 공식 국명 확인 후 읽기 단계에서만 고니+3으로 분리
  const lb = input(6900, { species: '고니3', observedOn: TODAY, lat: 37.9, lon: 127.9, reporter: '통계테스터', namePublic: true });
  const { report, input: original } = quickInput(lb);
  const legacy = { id: lb.request_id, status: 'pending', species: report.speciesText, lat: report.lat, lon: report.lon, public_lat: null, public_lon: null, approx_lat: report.lat, approx_lon: report.lon, pending_public: 0, observed_on: report.observedOn, received_at: new Date().toISOString(), decided_at: null, bird_count: null, reporter: '통계테스터', note: null, admin_note: null, site_id: null, name_public: 1, spot_key: null, ip_hash: 's', dedupe_hash: await dedupeHash(report) };
  await persistQuick(s.db, legacy, original, { ok: true, id: legacy.id, status: 'pending', publicVisibility: 'withheld' }, await sha256Hex('legacy-6900'));
  s.db.sqlite.prepare('UPDATE sightings SET species_identified=NULL,interpretation=?,count_value=NULL,count_source=? WHERE checklist_id=?').run('single', 'not_recorded', legacy.id);
  for (const x of [a.body.request_id, b.body.request_id, dup.body.request_id, legacy.id]) assert.equal((await act(s, x, 'approve')).status, 200);
  // 관리자 통계
  const sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.approved, 4, '제보 건수');
  assert.equal(sum.species, 5, '동박새·박새·직박구리·쇠딱다구리 + 기존 고니 = 5종');
  assert.equal(sum.individuals, 14, '3+2+1 + 5 + 기존 고니3 (+미입력·중복 제보 제외)');
  assert.equal(sum.counted_reports, 3);
  const sp = Object.fromEntries((await stats(s, 'view=species')).rows.map(r => [r.species, r]));
  assert.equal(sp['동박새'].total, 3, '동박새3·동박새5·중복 제보 모두 같은 종'); assert.equal(sp['동박새'].individuals, 8, '3+5, 중복 제보는 더하지 않음');
  assert.equal(sp['쇠딱다구리'].individuals, null); assert.ok(sp['고니'], '기존 자료는 공식 국명으로 읽기 해석'); assert.ok(!sp['동박새3']);
  assert.equal((await stats(s, 'view=species&species=' + encodeURIComponent('동박새'))).rows[0].total, 3, '종 필터도 구조화 국명으로');
  // 회원별 공개 통계
  const rs = await get(s.pub, '/reports/reporter-stats?reporter=' + encodeURIComponent('통계테스터') + '&source=all');
  assert.equal(rs.speciesCount, 5, JSON.stringify(rs)); assert.equal(rs.reportCount, 4);
  const names = await get(s.pub, '/reports/reporter-species?reporter=' + encodeURIComponent('통계테스터') + '&source=all');
  assert.deepEqual(names.species, ['고니','동박새', '박새', '쇠딱다구리', '직박구리'].sort((x, y) => x < y ? -1 : x > y ? 1 : 0));
  // 검색·지도: 수량 없는 국명, 동박새로 검색하면 3건
  const search = (await get(s.pub, '/reports/search?q=' + encodeURIComponent('동박새'))).reports;
  assert.equal(search.length, 3); assert.ok(search.every(r => r.species.includes('동박새') && !r.species.some(x => /\d/.test(x))));
  const approved = (await get(s.pub, '/reports/approved')).spots;
  assert.deepEqual(approved.find(x => x.id === a.body.request_id).species, ['동박새', '박새', '직박구리']);
  assert.ok(approved.find(x => x.id === legacy.id),'원본에 비번식 확인된 고니도 승인 후 공개');
});

test('관리자 정정: 종명·개체수 수정이 종별 행·이력·통계에 일관되게 반영', async t => {
  const s = await setup(t);
  const a = await submit(s, { species: '동박새3, 박새2, 직박구리1' });
  const id = a.body.request_id;
  assert.equal((await act(s, id, 'approve', { species: '동박새4, 박새2' })).status, 200);
  assert.deepEqual(sightings(s, id).map(r => [r.source_ordinal, r.species_original, r.species_identified, r.interpretation, r.count_value, r.interpretation_note]),
    [[1, '동박새3', '동박새', 'single', 4, null], [2, '박새2', '박새', 'single', 2, null], [3, '직박구리1', null, 'unknown', null, 'superseded']], '원문은 그대로, 정정값만 바뀜');
  const hist = s.db.sqlite.prepare("SELECT sighting_id,validated_count FROM reviews WHERE checklist_id=? AND sighting_id IS NOT NULL ORDER BY sequence").all(id).map(r => ({ ...r }));
  assert.equal(hist.length, 3, '종별 수정 이력'); assert.equal(hist[0].validated_count, 4);
  let sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.species, 2); assert.equal(sum.individuals, 6);
  assert.equal((await act(s, id, 'approve', { species: '동박새4, 박새2, 직박구리1, 참새5' })).status, 200);
  assert.deepEqual(sightings(s, id).map(r => [r.source_ordinal, r.species_identified, r.count_value]), [[1, '동박새', 4], [2, '박새', 2], [3, '직박구리', 1], [4, '참새', 5]]);
  sum = (await stats(s, 'view=summary')).summary;
  assert.equal(sum.species, 4); assert.equal(sum.individuals, 12);
  assert.deepEqual((await get(s.pub, '/reports/approved')).spots.find(x => x.id === id).species, ['동박새', '박새', '직박구리', '참새']);
});

test('공개 개체수 DTO: 미검증·승인 상세에서 종별 값, 미입력·위치 보호·관리자 정정 유지',async t=>{
 const s=await setup(t);
 const a=await submit(s,{species:'동박새3, 박새2, 직박구리1'});
 const b=await submit(s,{species:'동박새3, 박새2, 쇠딱다구리',lat:35.01,lon:128.01,hideLocation:true});
 const pending=(await get(s.pub,'/reports/pending')).spots;
 const full=pending.find(x=>x.id===a.body.request_id);
 assert.equal(full.verified,false);assert.deepEqual(full.sightings.map(x=>[x.name,x.count]),[['동박새',3],['박새',2],['직박구리',1]]);
 const partial=pending.find(x=>x.id===b.body.request_id);
 assert.equal(partial.locationHidden,true);assert.notEqual(partial.lat,b.body.lat);
 assert.deepEqual(partial.sightings.at(-1),{name:'쇠딱다구리',count:null,countStatus:'not_recorded'});
 assert.equal((await act(s,a.body.request_id,'approve',{species:'동박새4, 박새2'})).status,200);
 const approved=(await get(s.pub,'/reports/approved')).spots.find(x=>x.id===a.body.request_id);
 assert.deepEqual(approved.history[0].sightings.map(x=>[x.name,x.count]),[['동박새',4],['박새',2]]);
 const search=(await get(s.pub,'/reports/search?q='+encodeURIComponent('동박새'))).reports.find(x=>x.id===a.body.request_id);
 assert.deepEqual(search.sightings,approved.history[0].sightings);
 const allowed=['name','count','countStatus'];
 for(const item of approved.history[0].sightings)assert.deepEqual(Object.keys(item).filter(k=>!allowed.includes(k)),[]);
});
