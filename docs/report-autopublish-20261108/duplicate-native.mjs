// Native D1 (Miniflare/workerd) concurrency checks for duplicate-suspect auto-publish. Synthetic data only, local D1, no network.
// Same date + same species + within 200 m => at most ONE auto-published report; later/concurrent ones are saved as review-pending.
// Usage: node docs/report-autopublish-20261108/duplicate-native.mjs <miniflare node_modules dir> [reports-api dir]
// Exact-duplicate policy (unchanged): same species set + coordinates rounded to 4 decimals (~10 m) + date => 409 DUPLICATE_REPORT.
// Test data avoids the existing protections: every request has its own request_id, CAPTCHA token, IP hash and distinct coordinates
// (so the exact-duplicate dedupe_hash and the per-IP spam limits never decide the outcome).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [toolchain, apiDir = resolve('reports-api')] = process.argv.slice(2);
const load = p => import(pathToFileURL(resolve(apiDir, p)).href);
const { localDb, installAuthStubs, environments, input, ORIGIN } = await load('local-test/helpers.mjs');
const { handleRequest } = await load('src/public.js');
const { AUTO_PUBLIC_REASON } = await load('src/autopublic.js');
const auth = await installAuthStubs();
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const M = 6371000 * Math.PI / 180;
// east/north offsets in meters from a base point
const at = (lat, lon, east = 0, north = 0) => ({ lat: Number((lat + north / M).toFixed(7)), lon: Number((lon + east / (M * Math.cos(lat * Math.PI / 180))).toFixed(7)) });
const results = []; let seq = 0;
const nextId = () => 120000 + (++seq);

async function withEnv(flags, fn) {
  const local = await localDb(toolchain), env = environments(local.db);
  Object.assign(env.pub, { REPORTS_PUBLICATION_REQUIRED: 'true', REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1', REPORTS_AUTO_PUBLIC_DAILY_MAX: '50', ...flags });
  const q = async (sql, ...v) => (await local.db.prepare(sql).bind(...v).all()).results;
  const post = (body, ip) => handleRequest(new Request('https://reports.example/reports', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env.pub);
  let ipn = 0;
  // submit many at once; each gets a distinct request id, token, IP and the caller's coordinates
  const burst = async specs => {
    const items = specs.map(s => { const n = nextId(); return { spec: s, body: input(n, { observedOn: today, note: null, birdCount: null, ...s }), ip: `198.18.${Math.floor(n / 250) % 250}.${n % 250}` }; });
    const res = await Promise.all(items.map(i => post(i.body, i.ip)));
    const receipts = await Promise.all(res.map(r => r.json()));
    return items.map((it, i) => ({ ...it, status: res[i].status, receipt: receipts[i] }));
  };
  try { return await fn({ q, post, burst, env, local }); } finally { await local.close(); }
}

// receipt == reports row == decision record == immutable original receipt
async function consistent(q, rs) {
  let ok = 0;
  for (const r of rs) {
    if (r.status !== 201) continue;
    const id = r.body.request_id, open = r.receipt.publicVisibility === 'public_unverified';
    const [row] = await q('SELECT pending_public FROM reports WHERE id=?', id);
    const [rv] = await q('SELECT reason_code FROM reviews WHERE checklist_id=? AND sequence=1', id);
    const [raw] = await q('SELECT payload_json FROM raw_submissions WHERE request_id=?', id);
    const held = r.receipt.holdReasons || [];
    if (row.pending_public === (open ? 1 : 0) && rv?.reason_code === (open ? AUTO_PUBLIC_REASON : 'hold:' + held.join(','))
        && JSON.parse(raw.payload_json).accepted.publicVisibility === r.receipt.publicVisibility && (open || held.length)) ok++;
  }
  return ok === rs.filter(r => r.status === 201).length;
}
const open = rs => rs.filter(r => r.receipt.publicVisibility === 'public_unverified');
const heldFor = (rs, reason) => rs.filter(r => (r.receipt.holdReasons || []).includes(reason));
async function scenario(name, flags, fn) {
  const checks = [];
  const check = (what, pass, detail) => checks.push({ what, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  try { await withEnv(flags, ctx => fn(ctx, check)); } catch (e) { check('시험 실행 오류 없음', false, String(e.stack || e).slice(0, 300)); }
  results.push({ name, pass: checks.every(c => c.pass), checks });
}
const A = [36.5, 127.5], B = [37.2, 128.2], C = [35.4, 126.4], D = [34.8, 127.9];

await scenario('1. 같은 날·같은 종·100 m 이내 20건 동시 접수', {}, async ({ q, burst }, check) => {
  const specs = Array.from({ length: 20 }, (_, i) => ({ species: '참새', ...at(...A, ((i % 5) - 2) * 20, (Math.floor(i / 5) - 2) * 20), reporter: '회원' + i }));
  const rs = await burst(specs);
  check('20건 모두 201(거절·삭제 없음)', rs.every(r => r.status === 201), rs.map(r => r.status).join());
  check('자동 공개는 정확히 1건', open(rs).length === 1, open(rs).length);
  check('나머지 19건은 검토 대기 + possible_duplicate', heldFor(rs, 'possible_duplicate').length === 19);
  check('20건 모두 저장됨', (await q('SELECT COUNT(*) n FROM reports'))[0].n === 20);
  check('reports.pending_public=1 은 1건, 판정 기록 자동 공개 1건', (await q('SELECT COUNT(*) n FROM reports WHERE pending_public=1'))[0].n === 1 && (await q('SELECT COUNT(*) n FROM reviews WHERE reason_code=?', AUTO_PUBLIC_REASON))[0].n === 1);
  check('접수증·DB·판정 기록·원자료 일치', await consistent(q, rs));
  check('임시 확인 행·CAPTCHA 기록 정합', (await q('SELECT COUNT(*) n FROM transaction_assertions'))[0].n === 0 && (await q('SELECT COUNT(*) n FROM captcha_redemptions'))[0].n === 20);
});

await scenario('2. 서로 다른 회원이 같은 종을 동시에 제보', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: '박새', ...at(...A, 0, 0), reporter: '회원가', namePublic: true }, { species: '박새', ...at(...A, 60, 40), reporter: '회원나', namePublic: true }]);
  check('둘 다 접수(201)', rs.every(r => r.status === 201));
  check('자동 공개 1건 + 중복 의심 1건', open(rs).length === 1 && heldFor(rs, 'possible_duplicate').length === 1);
  const rows = await q('SELECT reporter, spot_key FROM reports ORDER BY reporter');
  check('각자 독립 제보(제보자 유지, 연결·합침 없음)', rows.length === 2 && rows[0].reporter === '회원가' && rows[1].reporter === '회원나' && rows.every(r => r.spot_key === null));
  check('일치', await consistent(q, rs));
});

await scenario('3. 반경 200 m 경계(동시·순차)', {}, async ({ q, burst }, check) => {
  const near = await burst([{ species: '까치', ...at(...A, 0, 0) }, { species: '까치', ...at(...A, 199, 0) }]);
  const far = await burst([{ species: '까치', ...at(...B, 0, 0) }, { species: '까치', ...at(...B, 201, 0) }]);
  check('동시 199 m: 자동 공개 1건 + 중복 의심', open(near).length === 1 && heldFor(near, 'possible_duplicate').length === 1);
  check('동시 201 m: 둘 다 자동 공개', open(far).length === 2 && far.every(r => !(r.receipt.holdReasons || []).length));
  const seqIn = await burst([{ species: '까치', ...at(...C, 0, 0) }]); const seqIn2 = await burst([{ species: '까치', ...at(...C, 0, 199) }]);
  const seqOut = await burst([{ species: '까치', ...at(...C, 0, -201) }]);
  check('순차 199 m(북): 중복 의심', heldFor(seqIn2, 'possible_duplicate').length === 1);
  check('순차 201 m(남): 자동 공개', open(seqOut).length === 1);
  check('일치', await consistent(q, [...near, ...far, ...seqIn, ...seqIn2, ...seqOut]));
});

await scenario('4. 같은 장소의 서로 다른 종', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: '참새', ...at(...A, 0, 0) }, { species: '박새', ...at(...A, 5, 5) }, { species: '까치', ...at(...A, 10, 0) }]);
  check('모두 자동 공개(서로 다른 종)', open(rs).length === 3);
  check('일치', await consistent(q, rs));
});

await scenario('5. 복수 종 중 하나만 중복(수량 표기 포함)', {}, async ({ q, burst }, check) => {
  const r1 = await burst([{ species: '참새, 박새', ...at(...A, 0, 0) }, { species: '박새, 까치', ...at(...A, 30, 0) }]);
  check('동시: 박새가 겹쳐 자동 공개 1건 + 중복 의심', open(r1).length === 1 && heldFor(r1, 'possible_duplicate').length === 1);
  const r2 = await burst([{ species: '동박새3, 딱새2', ...at(...B, 0, 0) }, { species: '딱새1', ...at(...B, 20, 20) }]);
  check('동시: 딱새3·딱새1(수량 표기)도 같은 종으로 중복 의심', open(r2).length === 1 && heldFor(r2, 'possible_duplicate').length === 1);
  const r3 = await burst([{ species: '참새, 박새', ...at(...C, 0, 0) }, { species: '물까치, 까치', ...at(...C, 30, 0) }]);
  check('동시: 겹치는 종이 없으면 둘 다 자동 공개', open(r3).length === 2);
  check('일치', await consistent(q, [...r1, ...r2, ...r3]));
});

await scenario('6. 관찰 날짜가 다른 경우(KST 날짜 문자열 기준)', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: '참새', ...at(...A, 0, 0), observedOn: today }, { species: '참새', ...at(...A, 10, 0), observedOn: yesterday }]);
  check('날짜가 달라 둘 다 자동 공개', open(rs).length === 2);
  const same = await burst([{ species: '참새', ...at(...B, 0, 0), observedOn: yesterday }, { species: '참새', ...at(...B, 10, 0), observedOn: yesterday }]);
  check('같은 날짜면 1건만', open(same).length === 1);
  check('일치', await consistent(q, [...rs, ...same]));
});

await scenario('7. 같은 요청 ID 재전송(동시 포함)', {}, async ({ q, post }, check) => {
  const body = input(nextId(), { species: '딱새', ...at(...A, 0, 0), observedOn: today, note: null, birdCount: null });
  const first = await post(body, '198.19.0.1'); const firstReceipt = await first.json();
  const replays = await Promise.all([1, 2, 3, 4, 5].map(i => post(body, '198.19.0.' + (10 + i))));
  const bodies = await Promise.all(replays.map(r => r.json()));
  check('최초 201·자동 공개', first.status === 201 && firstReceipt.publicVisibility === 'public_unverified');
  check('동시 재전송 5건 모두 같은 접수증', replays.every(r => r.status === 201) && bodies.every(b => JSON.stringify(b) === JSON.stringify(firstReceipt)));
  check('저장은 1건, 판정 기록 1건, CAPTCHA 기록 1건', (await q('SELECT COUNT(*) n FROM reports'))[0].n === 1 && (await q('SELECT COUNT(*) n FROM reviews'))[0].n === 1 && (await q('SELECT COUNT(*) n FROM captcha_redemptions'))[0].n === 1);
  // 같은 종·좌표·날짜를 다른 요청 ID로 보내면 기존 정확한 중복 차단(409)이 그대로 동작한다.
  const exact = await post({ ...body, request_id: input(nextId()).request_id, turnstileToken: 'synthetic-token-exact' }, '198.19.1.1');
  check('정확히 같은 내용의 다른 요청은 기존대로 409 DUPLICATE_REPORT', exact.status === 409 && (await exact.json()).error?.code === 'DUPLICATE_REPORT');
  check('그 뒤에도 저장 1건', (await q('SELECT COUNT(*) n FROM reports'))[0].n === 1);
});

await scenario('8. 하루 한도와 중복 판정이 동시에 걸림(한도 2, 4곳×2건)', { REPORTS_AUTO_PUBLIC_DAILY_MAX: '2' }, async ({ q, burst }, check) => {
  const places = [A, B, C, D], specs = [];
  places.forEach((p, i) => { specs.push({ species: '직박구리', ...at(...p, 0, 0) }, { species: '직박구리', ...at(...p, 50, 50) }); });
  const rs = await burst(specs);
  check('8건 모두 201', rs.every(r => r.status === 201));
  check('자동 공개는 정확히 한도 2건', open(rs).length === 2, open(rs).length);
  const perPlace = places.map(p => open(rs).filter(r => Math.abs(r.body.lat - p[0]) < 0.01 && Math.abs(r.body.lon - p[1]) < 0.01).length);
  check('같은 곳에서 2건이 공개되지 않음', perPlace.every(n => n <= 1), perPlace.join());
  const held = rs.filter(r => r.receipt.publicVisibility === 'withheld');
  check('보류 6건 모두 사유(possible_duplicate 또는 global_cap) 기록', held.length === 6 && held.every(r => (r.receipt.holdReasons || []).some(x => ['possible_duplicate', 'global_cap'].includes(x))));
  check('판정 기록 자동 공개 수 = 2', (await q('SELECT COUNT(*) n FROM reviews WHERE reason_code=?', AUTO_PUBLIC_REASON))[0].n === 2);
  check('일치', await consistent(q, rs));
});

await scenario('9. 자동 공개 OFF: 기존 사전 승인제 유지', { REPORTS_AUTO_PUBLIC: '0', REPORTS_UNVERIFIED_READS: '0' }, async ({ q, burst }, check) => {
  const rs = await burst(Array.from({ length: 20 }, (_, i) => ({ species: '참새', ...at(...A, i * 25, 0) })));
  check('20건 모두 201·withheld·사유 목록 없음(접수증 4개 필드)', rs.every(r => r.status === 201 && r.receipt.publicVisibility === 'withheld' && Object.keys(r.receipt).sort().join() === 'id,ok,publicVisibility,status'));
  check('reports 공개 플래그 0, 판정 기록 0', (await q('SELECT COUNT(*) n FROM reports WHERE pending_public=1'))[0].n === 0 && (await q('SELECT COUNT(*) n FROM reviews'))[0].n === 0);
});

await scenario('10. 보호종·희귀종·일반종은 모두 자동 공개, 식별 불가 이름만 검토 유지', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: '참새', ...at(...A, 0, 0) }, { species: '매', ...at(...B, 0, 0) }, { species: '말똥가리', ...at(...C, 0, 0) }, { species: '처음보는새', ...at(...D, 0, 0) }, { species: '왜가리', ...at(...A, 5000, 0) }]);
  check('일반·보호·희귀·왜가리 4건 자동 공개', open(rs).length === 4 && !open(rs).some(r => r.body.species === '처음보는새'));
  const by = Object.fromEntries(rs.map(r => [r.body.species, r.receipt.holdReasons || []]));
  check('식별 불가 이름만 name_unconfirmed', by['처음보는새'].includes('name_unconfirmed') && ['매', '말똥가리', '왜가리', '참새'].every(k => by[k].length === 0));
  check('일치', await consistent(q, rs));
});

await scenario('11. 정확히 같은 내용(종·좌표 4자리·날짜)의 서로 다른 요청이 동시에 들어옴: 기존 409 정책 유지', {}, async ({ q, burst }, check) => {
  const p = at(...A, 0, 0);
  const rs = await burst([{ species: '직박구리', ...p, reporter: '가' }, { species: '직박구리', ...p, reporter: '나' }]);
  const ok = rs.filter(r => r.status === 201), dup = rs.filter(r => r.status === 409);
  check('한 건만 저장되고 다른 한 건은 기존대로 409 DUPLICATE_REPORT', ok.length === 1 && dup.length === 1 && dup[0].receipt.error?.code === 'DUPLICATE_REPORT', rs.map(r => r.status).join());
  check('저장 1건·판정 기록 1건·CAPTCHA 기록 1건(거절된 쪽은 흔적 없음)', (await q('SELECT COUNT(*) n FROM reports'))[0].n === 1 && (await q('SELECT COUNT(*) n FROM reviews'))[0].n === 1 && (await q('SELECT COUNT(*) n FROM captcha_redemptions'))[0].n === 1);
  check('일치', await consistent(q, ok));
});

auth.restore();
const out = { pass: results.every(r => r.pass), scenarios: results.map(r => ({ name: r.name, pass: r.pass, failed: r.checks.filter(c => !c.pass), checks: r.checks.length })) };
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + ` (${r.checks.length})` + r.checks.filter(c => !c.pass).map(c => '\n   ✗ ' + c.what + (c.detail !== undefined ? ' :: ' + c.detail : '')).join(''));
console.log(out.pass ? 'ALL PASS' : 'FAILURES');
process.exitCode = out.pass ? 0 : 1;
