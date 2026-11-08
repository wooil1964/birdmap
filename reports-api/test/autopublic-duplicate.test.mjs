// 중복 의심(같은 관찰일·같은 종·200 m) 저장 batch 보호: SQL 거리 판정의 정확성, KST 날짜 경계, fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDb } from './helpers.mjs';
import { environments, installAuthStubs, input, ORIGIN } from '../local-test/helpers.mjs';
import { handleRequest } from '../src/public.js';
import { duplicateGuard, capGuard, classifySubmission, DUPLICATE_METERS } from '../src/autopublic.js';
import { kstDateString } from '../src/shared.js';

const haversine = (a, b) => { const r = 6371000, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const M = 6371000 * Math.PI / 180;
const shift = (p, east, north) => ({ lat: p.lat + north / M, lon: p.lon + east / (M * Math.cos(p.lat * Math.PI / 180)) });
const DAY = '2026-11-08';
const row = (id, species, p, date = DAY, status = 'pending') => ({ id, species, lat: p.lat, lon: p.lon, observed_on: date, status });

function dbWith(rows) {
  const db = canonicalDb();
  for (const r of rows) db.sqlite.prepare("INSERT INTO reports(id,status,species,lat,lon,observed_on,received_at,ip_hash,dedupe_hash) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(r.id, r.status, r.species, r.lat, r.lon, r.observed_on, '2026-11-08T01:00:00.000Z', 'h', 'd' + r.id);
  return db;
}
// 보호 조건이 "중복 있음"이라고 판단하는지(조건이 거짓 = 중복 의심)
async function dupFound(db, report, selfId = 'self') {
  const g = duplicateGuard(report, selfId);
  return Number((await db.prepare(g.reachedSql).bind(...g.values).first()).possible_duplicate) === 1;
}

test('거리: SQL 평면 근사가 haversine 판정과 위도·방향·거리에 걸쳐 같은 결과(200 m 경계 ±0.05 m 제외)', async () => {
  let checked = 0, mismatches = [];
  for (const lat of [33.2, 35.5, 37.5, 38.3]) for (const dir of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071]]) for (const dist of [100, 150, 199, 199.9, 200.1, 201, 250]) {
    const base = { lat, lon: 127 + lat / 100 }, other = shift(base, dir[0] * dist, dir[1] * dist);
    const db = dbWith([row('o', '참새', other)]);
    const truth = haversine(base, other);
    if (Math.abs(truth - DUPLICATE_METERS) < 0.05) continue;
    const got = await dupFound(db, { species: ['참새'], ...base, observedOn: DAY });
    checked++; if (got !== (truth <= DUPLICATE_METERS)) mismatches.push([lat, dir, dist, truth.toFixed(3), got]);
  }
  assert.ok(checked > 150); assert.deepEqual(mismatches, []);
});

test('조건: 날짜·종·상태·자기 자신 규칙(반려는 제외, 복수 종, 수량 표기, 비슷한 이름 비일치)', async () => {
  const p = { lat: 36.5, lon: 127.5 }, near = shift(p, 30, 0);
  const g = (rows, report) => dupFound(dbWith(rows), { species: ['박새'], ...p, observedOn: DAY, ...report });
  assert.equal(await g([row('o', '박새', near)]), true);
  assert.equal(await g([row('o', '박새', near, '2026-11-07')]), false, '날짜가 다르면 아님');
  assert.equal(await g([row('o', '박새', near, DAY, 'rejected')]), false, '반려된 제보는 세지 않음(접수 판정과 같음)');
  assert.equal(await g([row('o', '박새', near, DAY, 'approved')]), true, '승인된 제보도 셈');
  assert.equal(await g([row('o', '참새', near)]), false, '다른 종');
  assert.equal(await g([row('o', '동박새3 · 박새2', near)]), true, '복수 종 중 하나가 겹침(수량 표기 포함)');
  assert.equal(await g([row('o', '박새 3마리', near)]), true); assert.equal(await g([row('o', '박새 3개체', near)]), true);
  assert.equal(await g([row('o', '큰박새', near)]), false, '이름 일부만 같은 다른 종은 아님');
  assert.equal(await g([row('o', '박새류', near)]), false, '"박새류"는 같은 종으로 보지 않음(접수 판정과 같음)');
  assert.equal(await g([row('self', '박새', near)]), false, '자기 자신은 제외');
  assert.equal(await g([row('o', '참새 · 까치', near)], { species: ['박새', '까치'] }), true, '내 종 중 하나라도 겹침');
});

test('fail-closed: 판정할 수 없는 이름·좌표면 항상 "중복 있음"으로 막고, 판정 조회 오류는 공개 없이 저장 실패', async t => {
  for (const bad of [{ species: ['Zosterops'] }, { species: [] }, { species: ['참새?'] }, { species: ['참새'], lat: NaN }]) {
    const g = duplicateGuard({ species: ['참새'], lat: 36.5, lon: 127.5, observedOn: DAY, ...bad }, 'x');
    assert.equal(g.condition, '0=1', JSON.stringify(bad)); assert.equal(g.values.length, 0);
  }
  // 접수 판정 중 DB 오류: 공개로 우회하지 않고 오류로 끝나며 아무것도 저장되지 않는다.
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = canonicalDb(), envs = environments(db);
  Object.assign(envs.pub, { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1' });
  const broken = sql => /FROM reports WHERE observed_on=\?1/.test(sql) ? { bind: () => ({ all: async () => { throw new Error('synthetic D1 failure'); } }) } : db.prepare(sql);
  envs.pub.REPORTS_DB = new Proxy(db, { get: (t0, k) => k === 'prepare' ? broken : (typeof t0[k] === 'function' ? t0[k].bind(t0) : t0[k]) });
  const body = input(9301, { species: '참새', observedOn: kstDateString(new Date()), lat: 36.1, lon: 127.1 });
  const res = await handleRequest(new Request('https://reports.example/reports', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' }, body: JSON.stringify(body) }), envs.pub);
  envs.pub.REPORTS_DB = db;
  assert.ok(res.status >= 500, 'status ' + res.status);
  for (const table of ['reports', 'reviews', 'captcha_redemptions']) assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0, table + ' 저장 없음');
});

test('KST 날짜 경계: 하루 한도의 하루는 KST 00:00 에 바뀌고, 관찰일 비교는 KST 날짜 문자열이다', () => {
  const start = now => capGuard({}, 'h', new Date(now)).values[0];
  assert.equal(start('2026-11-08T14:59:59.999Z'), '2026-11-07T15:00:00.000Z', 'KST 11/08 23:59:59.999');
  assert.equal(start('2026-11-08T15:00:00.000Z'), '2026-11-08T15:00:00.000Z', 'KST 11/09 00:00:00');
  assert.equal(start('2026-11-08T00:00:00.000Z'), '2026-11-07T15:00:00.000Z', 'KST 11/08 09:00');
  assert.equal(kstDateString(new Date('2026-11-08T14:59:59Z')), '2026-11-08'); assert.equal(kstDateString(new Date('2026-11-08T15:00:00Z')), '2026-11-09');
});

test('접수 판정과 저장 보호가 같은 규칙: 판정이 중복이라 한 것은 보호 조건도 중복이라 한다', async () => {
  const db = dbWith([row('o', '참새', { lat: 36.5, lon: 127.5 })]);
  const env = { REPORTS_AUTO_PUBLIC: '1', REPORTS_WRITE_MODE: 'CANONICAL_DUAL_WRITE' };
  for (const [dist, expected] of [[100, true], [199, true], [201, false], [400, false]]) {
    const report = { species: ['참새'], speciesText: '참새', birdCount: null, note: null, observedOn: DAY, ...shift({ lat: 36.5, lon: 127.5 }, dist, 0) };
    const judged = (await classifySubmission(db, env, report, 'h', new Date('2026-11-08T03:00:00Z'))).reasons.includes('possible_duplicate');
    assert.equal(judged, expected, `판정 ${dist} m`); assert.equal(await dupFound(db, report), expected, `보호 조건 ${dist} m`);
  }
});
