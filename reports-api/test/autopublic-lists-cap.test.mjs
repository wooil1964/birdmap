// 자동 공개: 허용 목록 없이 전체 조류, 법정 보호 조류 목록 자료 무결성, 하루 한도 동시성.


import test from 'node:test';


import assert from 'node:assert/strict';


import { canonicalDb } from './helpers.mjs';


import { environments, installAuthStubs, input, ORIGIN } from '../local-test/helpers.mjs';


import { handleRequest } from '../src/public.js';


import { contentReasons, AUTO_PUBLIC_REASON } from '../src/autopublic.js';


import { ENDANGERED_I, ENDANGERED_II, NATURAL_MONUMENT_BIRDS, MARINE_PROTECTED_BIRDS, LEGAL_NAME_LINKS, PENDING_DESIGNATIONS, LEGAL_PROTECTED_NAMES, MAP_LOCATION_SENSITIVE } from '../src/protected-birds.js';


import { OFFICIAL_BIRD_NAMES } from '../src/official-bird-names.js';


import { SENSITIVE_SPECIES, kstDateString } from '../src/shared.js';





const reasons = name => [...contentReasons({ species: [name], speciesText: name, birdCount: null, note: null })].sort();


const official = new Set(OFFICIAL_BIRD_NAMES);





test('허용 목록 폐지: 15종 제한 없이 이전에 보류하던 종도 이름만으로는 보류하지 않는다', () => {


  for (const name of ['집비둘기'].filter(n => official.has(n))) assert.fail(name + ' 은 공식 목록에 없어야 이 시험의 전제가 맞다');


  for (const name of ['노랑턱멧새', '왜가리', '털발말똥가리', '말똥가리', '쇠백로', '중대백로', '가창오리', '쇠가마우지']) assert.deepEqual(reasons(name), [], name);


  // 공식 목록에 없는 한글 이름은 식별할 수 없으므로 여전히 관리자 검토(집비둘기 등).


  assert.deepEqual(reasons('집비둘기'), ['name_unconfirmed']);


  // 지도 자체 위치 민감 목록은 자료로만 남기고 더 이상 보류 사유가 아니다(위치 보호는 위치 가리기·번식 입력 차단·정책 v2가 담당).


  for (const name of Object.keys(MAP_LOCATION_SENSITIVE)) assert.ok(!reasons(name).includes('location_sensitive'), name);


});





test('법정 보호 조류 자료: 출처별 건수, 공식 국명 일치, 법령명↔국명 연결(학명 근거), 지정 예정종 분리', () => {


  assert.equal(ENDANGERED_I.length, 16); assert.equal(ENDANGERED_II.length, 53);


  assert.equal(MARINE_PROTECTED_BIRDS.length, 16); assert.equal(NATURAL_MONUMENT_BIRDS.length, 44);


  for (const name of [...ENDANGERED_I, ...ENDANGERED_II, ...NATURAL_MONUMENT_BIRDS, ...MARINE_PROTECTED_BIRDS])


    assert.ok(official.has(name) || Object.hasOwn(LEGAL_NAME_LINKS, name), name + ' 은 2025 국명이거나 연결된 법령명이어야 함');


  assert.ok(!official.has('양비둘기') && official.has('낭비둘기'));


  for (const [law, link] of Object.entries(LEGAL_NAME_LINKS)) {


    assert.ok(LEGAL_PROTECTED_NAMES.has(law), law);


    for (const kos of link.kos) { assert.ok(official.has(kos), kos + ' 공식 국명'); assert.ok(LEGAL_PROTECTED_NAMES.has(kos), kos + ' 보호'); }


  }


  // 보호종·희귀종·미조라는 이유만으로는 보류되지 않는다(공식 국명인 법정 보호종 전부).


  for (const name of LEGAL_PROTECTED_NAMES) if (official.has(name)) assert.deepEqual(reasons(name), [], name);


  // 지정 예정종은 현행 법정 목록과 구분한다.


  assert.ok(!LEGAL_PROTECTED_NAMES.has('붉은갯도요') && Object.hasOwn(PENDING_DESIGNATIONS, '붉은갯도요') && LEGAL_PROTECTED_NAMES.has('붉은어깨도요'), '붉은어깨도요는 현행 II급');


  // 위치 정책 v2 의 19종은 이번 변경과 무관하게 그대로다.


  assert.equal(SENSITIVE_SPECIES.length, 19);


  for (const name of SENSITIVE_SPECIES) assert.ok(LEGAL_PROTECTED_NAMES.has(name), 'v2 ' + name + ' 은 법정 목록에도 있음');


});





const TODAY = kstDateString(new Date());


const ON = { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1' };


function post(env, body, ip) {


  return handleRequest(new Request('https://reports.example/reports', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env);


}


const state = (db, id) => ({


  row: db.sqlite.prepare('SELECT pending_public FROM reports WHERE id=?').get(id),


  review: db.sqlite.prepare('SELECT reason_code FROM reviews WHERE checklist_id=? AND sequence=1').get(id),


  raw: JSON.parse(db.sqlite.prepare('SELECT payload_json FROM raw_submissions WHERE request_id=?').get(id).payload_json).accepted,


});





test('동시성: 둘 다 적격으로 판정된 뒤 늦게 확정되는 접수는 한도 초과 대신 검토 대기로 저장(접수증·판정·DB 일치)', async t => {


  const auth = await installAuthStubs(); t.after(auth.restore);


  const db = canonicalDb(), envs = environments(db);


  Object.assign(envs.pub, ON, { REPORTS_AUTO_PUBLIC_DAILY_MAX: '1' });


  // 첫 저장 batch 를 두 번째 요청이 판정을 마치고 저장에 들어올 때까지 붙잡아, 두 판정이 모두 0건을 보게 만든다.


  let waiting = false, release;


  const gate = new Promise(r => { release = r; });


  const gated = async statements => {


    const autoPublic = statements.length > 10; // 1종 제보: 기본 9문장 + 판정 기록 + 한도 확인 2문장 = 12


    if (autoPublic && !waiting) { waiting = true; await gate; } else if (autoPublic) release();


    return db.batch(statements);


  };


  envs.pub.REPORTS_DB = new Proxy(db, { get: (t, k) => k === 'batch' ? gated : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });


  const a = input(7101, { species: '참새', observedOn: TODAY, lat: 36.11, lon: 127.11 }), b = input(7102, { species: '박새', observedOn: TODAY, lat: 36.22, lon: 127.22 });


  const [ra, rb] = await Promise.all([post(envs.pub, a, '198.51.100.1'), post(envs.pub, b, '198.51.100.2')]);


  envs.pub.REPORTS_DB = db;


  const [ja, jb] = [await ra.json(), await rb.json()];


  assert.equal(ra.status, 201); assert.equal(rb.status, 201);


  const results = [[a, ja], [b, jb]].map(([body, receipt]) => ({ receipt, ...state(db, body.request_id) }));


  const published = results.filter(r => r.receipt.publicVisibility === 'public_unverified');


  assert.equal(published.length, 1, '한도 1을 넘지 않음');


  const held = results.find(r => r.receipt.publicVisibility === 'withheld');


  assert.deepEqual(held.receipt.holdReasons, ['global_cap']);


  for (const r of results) {


    const open = r.receipt.publicVisibility === 'public_unverified';


    assert.equal(r.row.pending_public, open ? 1 : 0, 'DB 와 접수증 일치');


    assert.equal(r.review.reason_code, open ? AUTO_PUBLIC_REASON : 'hold:global_cap', '판정 기록과 접수증 일치');


    assert.equal(r.raw.publicVisibility, r.receipt.publicVisibility, '원자료 접수증 일치');


  }


  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM reports').get().n, 2, '제보는 버리지 않고 둘 다 접수');


  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM transaction_assertions").get().n, 0, '확인용 임시 행이 남지 않음');


  // 재전송: 저장된 최종 상태 그대로


  for (const [body, receipt] of [[a, ja], [b, jb]]) assert.deepEqual(await (await post(envs.pub, body, '198.51.100.9')).json(), receipt);


});





test('동시성: 같은 IP 하루 5건 한도도 batch 안에서 지켜진다', async t => {


  const auth = await installAuthStubs(); t.after(auth.restore);


  const db = canonicalDb(), envs = environments(db);


  Object.assign(envs.pub, ON);


  // 같은 IP 로 5건을 먼저 공개시킨 뒤, 판정은 통과한 것처럼 보이게 하는 경합을 흉내 낸다(판정 COUNT 를 0 으로 응답).


  for (let i = 0; i < 5; i++) {


    const r = await (await post(envs.pub, input(7200 + i, { species: '참새', observedOn: TODAY, lat: 35 + i / 10, lon: 128 + i / 10 }), '198.51.100.50')).json();


    assert.equal(r.publicVisibility, 'public_unverified');


  }


  // 기존 스팸 방지(같은 IP 10분 5건)는 그대로 두고, 앞선 5건을 11분 전 접수로 옮겨 하루 IP 한도만 본다(판정 기록 시각은 오늘 그대로).


  db.sqlite.prepare("UPDATE reports SET received_at=? WHERE ip_hash=(SELECT ip_hash FROM reports LIMIT 1)").run(new Date(Date.now() - 11 * 60000).toISOString());


  const stale = sql => /AS total, \(/.test(sql) ? { bind: () => ({ first: async () => ({ total: 0, ip: 0 }) }) } : db.prepare(sql);


  envs.pub.REPORTS_DB = new Proxy(db, { get: (t, k) => k === 'prepare' ? stale : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });


  const late = input(7299, { species: '박새', observedOn: TODAY, lat: 34.5, lon: 127.5 });


  const res = await post(envs.pub, late, '198.51.100.50');


  envs.pub.REPORTS_DB = db;


  const receipt = await res.json();


  assert.equal(res.status, 201);


  assert.equal(receipt.publicVisibility, 'withheld');


  assert.deepEqual(receipt.holdReasons, ['rate_review']);


  assert.equal(state(db, late.request_id).review.reason_code, 'hold:rate_review');


  assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM reviews WHERE reason_code='${AUTO_PUBLIC_REASON}'`).get().n, 5);


});





test('누적 건수: 관리자가 공개를 중지해도 그날 자동 공개 판정 수는 줄지 않는다', async t => {


  const auth = await installAuthStubs(); t.after(auth.restore);


  const db = canonicalDb(), envs = environments(db);


  Object.assign(envs.pub, ON, { REPORTS_AUTO_PUBLIC_DAILY_MAX: '1' });


  const first = input(7301, { species: '참새', observedOn: TODAY, lat: 36.31, lon: 127.31 });


  assert.equal((await (await post(envs.pub, first, '198.51.100.70')).json()).publicVisibility, 'public_unverified');


  db.sqlite.prepare('UPDATE reports SET pending_public=0 WHERE id=?').run(first.request_id); // 공개 중지와 같은 효과


  const second = await (await post(envs.pub, input(7302, { species: '박새', observedOn: TODAY, lat: 36.32, lon: 127.32 }), '198.51.100.71')).json();


  assert.deepEqual(second.holdReasons, ['global_cap']);


});



import { identifyBird } from '../src/bird-names.js';

import { BIRD_NAME_TABLE } from '../src/official-bird-aliases.js';

import { IOC_SPECIES, IOC_ENGLISH, IOC_VERSION } from '../src/ioc-taxa.js';



test('같은 종 판정: 598종 모두 국명·학명·영명(대소문자 무관)이 같은 key, IOC 전 종의 학명↔영명도 같은 key', () => {

  for (const [ko, sci, eng] of BIRD_NAME_TABLE) for (const n of [ko, sci, eng, sci.toUpperCase(), eng.toLowerCase()])

    assert.equal(identifyBird(n)?.key, ko, ko + ' / ' + n);

  const lines = IOC_ENGLISH.split(String.fromCharCode(10));

  assert.ok(lines.length > 10000 && IOC_VERSION);

  let checked = 0;

  for (const line of lines) { const [eng, bin] = line.split('|'); const a = identifyBird(eng), b = identifyBird(bin);

    assert.ok(a && b, line); assert.equal(a.key, b.key, line); checked++; }

  assert.equal(checked, lines.length);

  // 속만 맞는 이름은 식별은 되지만 IOC 확인 종으로 취급하지 않는다. 속도 모르면 식별 불가.

  assert.equal(identifyBird('Larus imaginarius').kind, 'scientific_genus_only');

  assert.equal(identifyBird('Zzzzus abcdef'), null);

  assert.ok(IOC_SPECIES.length > 100000);

});

import { isSensitiveReport, isLocationRestricted } from '../src/shared.js';

test('위치 정책 v2: 19종은 국명·학명·영명 어느 쪽으로 적어도 같이 보호된다(목록은 그대로 19종)', () => {
  assert.equal(SENSITIVE_SPECIES.length, 19);
  for (const ko of SENSITIVE_SPECIES) {
    const [, sci, eng] = BIRD_NAME_TABLE.find(r => r[0] === ko) || [];
    for (const n of [ko, sci, eng].filter(Boolean)) assert.equal(isSensitiveReport({ note: null, speciesText: n, species: [n] }), true, ko + ' / ' + n);
    assert.equal(isLocationRestricted({ species: eng || ko, note: null, lat: 36.5, lon: 127.5, observed_on: '2026-11-08' }), true, ko + ' 확인 없는 영명 행은 제한');
  }
  for (const n of ['참새', 'Passer montanus', 'Eurasian Tree Sparrow', 'Larus crassirostris', "Ross's Gull", 'Larus imaginarius'])
    assert.equal(isSensitiveReport({ note: null, speciesText: n, species: [n] }), false, n);
});
