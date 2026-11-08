// Native D1 (Miniflare/workerd) checks for "all birds auto-published, admin post-moderation". Synthetic data only, local D1, no network.
// Usage: node docs/report-autopublish-20261108/allbirds-native.mjs <miniflare node_modules dir> [reports-api dir]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [toolchain, apiDir = resolve('reports-api')] = process.argv.slice(2);
const load = p => import(pathToFileURL(resolve(apiDir, p)).href);
const { localDb, installAuthStubs, environments, input, adminPost, ORIGIN } = await load('local-test/helpers.mjs');
const { handleRequest } = await load('src/public.js');
const { identifyBird } = await load('src/bird-names.js');
const { AUTO_PUBLIC_REASON } = await load('src/autopublic.js');
const auth = await installAuthStubs();
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const M = 6371000 * Math.PI / 180;
const at = (lat, lon, east = 0, north = 0) => ({ lat: Number((lat + north / M).toFixed(7)), lon: Number((lon + east / (M * Math.cos(lat * Math.PI / 180))).toFixed(7)) });
const results = []; let seq = 0; const nextId = () => 140000 + (++seq);

async function withEnv(flags, fn) {
  const local = await localDb(toolchain), env = environments(local.db);
  Object.assign(env.pub, { REPORTS_PUBLICATION_REQUIRED: 'true', REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1', REPORTS_AUTO_PUBLIC_DAILY_MAX: '50', ...flags });
  const q = async (sql, ...v) => (await local.db.prepare(sql).bind(...v).all()).results;
  const post = (body, ip) => handleRequest(new Request('https://reports.example/reports', { method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env.pub);
  const burst = async specs => {
    const items = specs.map(s => { const n = nextId(); return { spec: s, body: input(n, { observedOn: today, note: null, birdCount: null, ...s }), ip: `198.18.${Math.floor(n / 250) % 250}.${n % 250}` }; });
    const res = await Promise.all(items.map(i => post(i.body, i.ip)));
    const receipts = await Promise.all(res.map(r => r.json()));
    return items.map((it, i) => ({ ...it, status: res[i].status, receipt: receipts[i] }));
  };
  const get = async path => {
    const nonce = 'c'.repeat(32), head = await (await handleRequest(new Request('https://x.invalid/reports/public-state?nonce=' + nonce, { headers: { Origin: ORIGIN } }), env.pub)).json();
    const u = new URL('https://x.invalid' + path);
    for (const [k, v] of Object.entries({ nonce, contract: 'publication-v1', expectedEpoch: head.publication.epoch, expectedRevision: head.publication.revision })) u.searchParams.set(k, v);
    return (await handleRequest(new Request(u, { headers: { Origin: ORIGIN } }), env.pub)).json();
  };
  const act = async (id, action, extra = {}) => {
    const [{ revision }] = await q('SELECT revision FROM checklists WHERE checklist_id=?', id);
    const r = await adminPost(env.admin, auth.token, id, { action, request_id: input(nextId()).request_id, expected_revision: revision, ...extra });
    return { status: r.status, body: await r.json() };
  };
  try { return await fn({ q, post, burst, get, act, env, local }); } finally { await local.close(); }
}
const open = rs => rs.filter(r => r.receipt.publicVisibility === 'public_unverified');
const held = (rs, why) => rs.filter(r => (r.receipt.holdReasons || []).includes(why));
async function consistent(q, rs) {
  let ok = 0;
  for (const r of rs) {
    if (r.status !== 201) continue;
    const id = r.body.request_id, isOpen = r.receipt.publicVisibility === 'public_unverified';
    const [row] = await q('SELECT pending_public FROM reports WHERE id=?', id), [rv] = await q('SELECT reason_code FROM reviews WHERE checklist_id=? AND sequence=1', id);
    const [raw] = await q('SELECT payload_json FROM raw_submissions WHERE request_id=?', id), why = r.receipt.holdReasons || [];
    if (row.pending_public === (isOpen ? 1 : 0) && rv?.reason_code === (isOpen ? AUTO_PUBLIC_REASON : 'hold:' + why.join(',')) && JSON.parse(raw.payload_json).accepted.publicVisibility === r.receipt.publicVisibility) ok++;
  }
  return ok === rs.filter(r => r.status === 201).length;
}
async function scenario(name, flags, fn) {
  const checks = []; const check = (what, pass, detail) => checks.push({ what, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  try { await withEnv(flags, ctx => fn(ctx, check)); } catch (e) { check('시험 실행 오류 없음', false, String(e.stack || e).slice(0, 300)); }
  results.push({ name, pass: checks.every(c => c.pass), checks });
}
const P = [36.5, 127.5], Q = [37.2, 128.2], R = [35.4, 126.4], S = [34.8, 127.9], T = [37.9, 127.2], U = [36.0, 129.0];
const UNLISTED = 'Pterodroma feae';

await scenario('1. 일반종·희귀종·미조·미기록 가능 학명이 모두 자동 공개되고 원문이 보존된다', {}, async ({ q, burst, get }, check) => {
  check('시험 전제: 대상 학명은 2025 한국 목록 밖의 IOC 종', identifyBird(UNLISTED)?.kind === 'avilist_scientific', JSON.stringify(identifyBird(UNLISTED)));
  const specs = [{ species: '참새 3', ...at(...P) }, { species: '말똥가리', ...at(...Q) }, { species: 'Calidris pygmaea 2', ...at(...R) },
    { species: UNLISTED, ...at(...S) }, { species: 'Spoon-billed Sandpiper', ...at(...T) }, { species: '저어새 4', ...at(...U) }];
  const rs = await burst(specs);
  check('6건 모두 201·자동 공개', rs.every(r => r.status === 201) && open(rs).length === 6, rs.map(r => r.receipt.publicVisibility).join());
  const spots = (await get('/reports/pending')).spots;
  check('공개 응답에 6건, 제보자가 쓴 이름 그대로', rs.every(r => { const sp = spots.find(x => x.id === r.body.request_id); return sp && sp.species.some(n => r.body.species.startsWith(n)); }));
  const raw = await q('SELECT species FROM reports ORDER BY received_at');
  check('reports 원문 보존(수정·치환 없음)', specs.every(s => raw.some(r => r.species === s.species)));
  const sight = await q('SELECT species_original, species_identified FROM sightings ORDER BY species_original');
  check('sightings 원문 보존 + 식별 이름(학명은 학명 그대로)', specs.every(s => sight.some(x => x.species_original === s.species)) && sight.some(x => x.species_identified === UNLISTED));
  check('어떤 이름도 국내 미기록으로 표시·확정하지 않음(별도 상태·사유 없음)', (await q("SELECT COUNT(*) n FROM reviews WHERE reason_code NOT IN ('" + AUTO_PUBLIC_REASON + "')"))[0].n === 0);
  check('일치', await consistent(q, rs));
});

await scenario('2. 보호종: 위치 가림 선택은 대략점만, 가리지 않으면 위치 정책 v2 범위(비번식 확인)로 공개', {}, async ({ q, burst, get }, check) => {
  const exact = at(...P), hidden = at(...Q);
  const rs = await burst([{ species: '저어새', ...exact }, { species: '매, 참새', ...hidden, hideLocation: true }, { species: 'Calidris pygmaea', ...at(...R), hideLocation: true }]);
  check('모두 자동 공개', open(rs).length === 3);
  const spots = (await get('/reports/pending')).spots, byId = id => spots.find(x => x.id === id);
  check('가리지 않은 보호종: v2 범위(원본 비번식 확인이 일치)로 실제 좌표 공개', byId(rs[0].body.request_id).lat === exact.lat && !byId(rs[0].body.request_id).locationHidden);
  const h = byId(rs[1].body.request_id), h2 = byId(rs[2].body.request_id);
  check('위치 가림 선택: 가림 표시 + 실제 좌표 아님(1 km 이상 이동)', h.locationHidden === true && h2.locationHidden === true && Math.hypot((h.lat - hidden.lat) * M, (h.lon - hidden.lon) * M * Math.cos(hidden.lat * Math.PI / 180)) > 1000);
  const paths = ['/reports/pending', '/reports/approved', '/reports/search?q=', '/reports/recent-sites?days=30', '/contributors/all'];
  let leaked = false; const text = JSON.stringify(await Promise.all(paths.map(get)));
  for (const d of [hidden.lat.toFixed(5), hidden.lon.toFixed(5), at(...R).lat.toFixed(5), at(...R).lon.toFixed(5)]) if (text.includes(d)) leaked = true;
  check('가린 제보의 실제 좌표는 어떤 공개 응답에도 없음', !leaked);
  check('일치', await consistent(q, rs));
});

await scenario('3. 번식·둥지 입력은 접수 단계에서 거절(저장 없음), 식별 불가·불확실 표기는 검토 대기', {}, async ({ q, burst, post }, check) => {
  const bad = input(nextId(), { species: '저어새', note: '둥지에서 새끼 확인', observedOn: today, ...at(...P) });
  const r1 = await post(bad, '198.19.0.1'); check('번식 입력 400(BREEDING_REPORT_NOT_ALLOWED), 저장 0건', r1.status === 400 && (await q('SELECT COUNT(*) n FROM reports'))[0].n === 0);
  const bad2 = input(nextId(), { species: '저어새 번식', observedOn: today, ...at(...P) });
  const r2 = await post(bad2, '198.19.0.2'); check('종명에 번식 표현도 400', r2.status === 400);
  const rs = await burst([{ species: '처음보는새', ...at(...Q) }, { species: 'Imaginary Warbler', ...at(...R) }, { species: 'Calidris sp.', ...at(...S) }, { species: '참새 같음', ...at(...T) }, { species: 'Zzzzus abcdef', ...at(...U) }]);
  check('5건 모두 접수(201)·자동 공개 0건', rs.every(r => r.status === 201) && open(rs).length === 0);
  check('사유: name_unconfirmed 또는 species_parse', rs.every(r => (r.receipt.holdReasons || []).some(x => ['name_unconfirmed', 'species_parse'].includes(x))));
  check('일치', await consistent(q, rs));
});

await scenario('4. 같은 종을 국명·학명·영명으로 달리 적어도 같은 종: 200 m 이내 동시 접수는 자동 공개 1건', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: '넓적부리도요', ...at(...P, 0, 0) }, { species: 'Calidris pygmaea', ...at(...P, 40, 0) }, { species: 'Spoon-billed Sandpiper', ...at(...P, 0, 60) },
    { species: 'calidris pygmaea 2', ...at(...P, 30, 30) }, { species: 'SPOON-BILLED SANDPIPER', ...at(...P, 70, 70) }]);
  check('5건 모두 접수', rs.every(r => r.status === 201));
  check('자동 공개 정확히 1건, 나머지 possible_duplicate', open(rs).length === 1 && held(rs, 'possible_duplicate').length === 4);
  const far = await burst([{ species: 'Calidris pygmaea', ...at(...Q, 0, 0) }, { species: '넓적부리도요', ...at(...Q, 201, 0) }]);
  check('201 m 밖이면 둘 다 공개', open(far).length === 2);
  const lat = await burst([{ species: UNLISTED, ...at(...R, 0, 0) }, { species: "Fea's Petrel", ...at(...R, 90, 0) }]);
  check('목록 밖 학명끼리도 같은 종(같은 날·200 m)으로 1건', open(lat).length === 1 && held(lat, 'possible_duplicate').length === 1);
  check('일치', await consistent(q, [...rs, ...far, ...lat]));
});

await scenario('5. 하루 한도 3 + 서로 다른 장소·종류 8건 동시: 자동 공개 정확히 3건', { REPORTS_AUTO_PUBLIC_DAILY_MAX: '3' }, async ({ q, burst }, check) => {
  const places = [P, Q, R, S, T, U, [35.0, 126.0], [37.5, 126.6]];
  const kinds = ['참새', '저어새', 'Calidris pygmaea', UNLISTED, '말똥가리', '왜가리', '큰기러기', 'Anser fabalis middendorffii'];
  const rs = await burst(places.map((p, i) => ({ species: kinds[i], ...at(...p) })));
  check('8건 모두 접수', rs.every(r => r.status === 201));
  check('자동 공개 정확히 3건, 나머지 5건 global_cap', open(rs).length === 3 && held(rs, 'global_cap').length === 5);
  check('판정 기록 자동 공개 3건, 공개 플래그 3건', (await q('SELECT COUNT(*) n FROM reviews WHERE reason_code=?', AUTO_PUBLIC_REASON))[0].n === 3 && (await q('SELECT COUNT(*) n FROM reports WHERE pending_public=1'))[0].n === 3);
  check('일치', await consistent(q, rs));
});

await scenario('6. 관리자 사후 처리: 종명·개체수 정정, 공개 중지, 반려, 반려 후 재승인, 감사 이력', {}, async ({ q, burst, get, act }, check) => {
  const rs = await burst([{ species: '참새 3', ...at(...P) }, { species: 'Calidris pygmaea', ...at(...Q) }, { species: '저어새', ...at(...R) }, { species: UNLISTED, ...at(...S) }]);
  const [a, b, c, d] = rs.map(r => r.body.request_id);
  check('4건 자동 공개', open(rs).length === 4);
  const fix = await act(a, 'approve', { species: '박새 5' });
  const sight = await q('SELECT species_original, species_identified, count_value FROM sightings WHERE checklist_id=? ORDER BY source_ordinal', a);
  check('종명·개체수 정정(정정 후 확인): 승인 처리, 원문 유지, 식별 이름·개체수 갱신', fix.status === 200 && sight[0].species_original === '참새 3' && sight[0].species_identified === '박새' && sight[0].count_value === 5);
  const stop = await act(b, 'visibility', { public: false });
  check('공개 중지: 즉시 공개 목록에서 사라짐', stop.status === 200 && !(await get('/reports/pending')).spots.some(x => x.id === b));
  check('공개 중지 후 다시 공개할 수 없음(400)', (await act(b, 'visibility', { public: true })).status === 400);
  check('사유 없이/잘못된 사유 반려는 거절', (await act(c, 'reject', { reasonCode: 'nonsense' })).status === 400);
  const rej = await act(c, 'reject', { reasonCode: 'misidentification' });
  check('반려: 공개 목록·상태에서 제거, 감사 이력에 사유', rej.status === 200 && !(await get('/reports/pending')).spots.some(x => x.id === c)
    && (await q("SELECT COUNT(*) n FROM reviews WHERE checklist_id=? AND reason_code='reject:misidentification'", c))[0].n === 1);
  const re = await act(c, 'approve');
  check('반려 후 재승인', re.status === 200 && (await q('SELECT status FROM reports WHERE id=?', c))[0].status === 'approved');
  const approved = (await get('/reports/approved')).spots.map(x => x.id);
  check('승인된 건은 승인 목록에 있고 중지·미처리 건은 없음', approved.includes(a) && approved.includes(c) && !approved.includes(b));
  check('미처리 건 d는 계속 자동 공개', (await get('/reports/pending')).spots.some(x => x.id === d));
  check('관리자 처리마다 감사 기록(audit_log)', (await q("SELECT COUNT(*) n FROM audit_log WHERE target_type='checklist'"))[0].n === 4);
});

await scenario('7. 자동 공개 OFF: 기존 사전 승인제 그대로(접수 전부 비공개, 관리자 승인으로만 공개)', { REPORTS_AUTO_PUBLIC: '0', REPORTS_UNVERIFIED_READS: '0' }, async ({ q, burst, get, act }, check) => {
  const rs = await burst([{ species: '참새', ...at(...P) }, { species: '저어새', ...at(...Q) }, { species: 'Calidris pygmaea', ...at(...R) }, { species: '처음보는새', ...at(...S) }]);
  check('모두 withheld·접수증 4개 필드·판정 기록 0·공개 플래그 0', rs.every(r => r.status === 201 && r.receipt.publicVisibility === 'withheld' && Object.keys(r.receipt).sort().join() === 'id,ok,publicVisibility,status')
    && (await q('SELECT COUNT(*) n FROM reviews'))[0].n === 0 && (await q('SELECT COUNT(*) n FROM reports WHERE pending_public=1'))[0].n === 0);
  check('공개 대기 목록 비어 있음', (await get('/reports/pending')).spots.length === 0);
  const ok = await act(rs[0].body.request_id, 'approve');
  check('관리자 승인으로만 공개', ok.status === 200 && (await get('/reports/approved')).spots.some(x => x.id === rs[0].body.request_id) && (await get('/reports/pending')).spots.length === 0);
});

await scenario('8. 기존 보호 유지: CAPTCHA 재사용·같은 IP 스팸 제한·정확한 중복 요청 차단', {}, async ({ q, post }, check) => {
  const a = input(nextId(), { species: '참새', observedOn: today, ...at(...P), turnstileToken: 'shared-token' });
  const b = input(nextId(), { species: '박새', observedOn: today, ...at(...Q), turnstileToken: 'shared-token' });
  const ra = await post(a, '198.19.5.1'), rb = await post(b, '198.19.5.2');
  check('같은 CAPTCHA 토큰 재사용은 403', ra.status === 201 && rb.status === 403 && (await rb.json()).error?.code === 'CAPTCHA_REUSED');
  const sts = []; for (let i = 0; i < 7; i++) sts.push((await post(input(nextId(), { species: '까치', observedOn: today, ...at(...R, i * 500, 0) }), '198.19.9.9')).status);
  check('같은 IP 10분 5건 제한: 6번째부터 429', sts.slice(0, 5).every(s => s === 201) && sts.slice(5).every(s => s === 429), sts.join());
  const dupBody = input(nextId(), { species: '딱새', observedOn: today, ...at(...S) });
  await post(dupBody, '198.19.7.1');
  const exact = await post({ ...dupBody, request_id: input(nextId()).request_id, turnstileToken: 'synthetic-other' }, '198.19.7.2');
  check('정확히 같은 내용(종·좌표 4자리·날짜)은 기존대로 409', exact.status === 409 && (await exact.json()).error?.code === 'DUPLICATE_REPORT');
});

await scenario('9. 국제 분류목록(IOC 15.2) 대조: 목록 밖 미조의 학명·영명은 같은 종, 속만 맞는 이름·속도 없는 이름은 보류', {}, async ({ q, burst, get, env, local }, check) => {
  const rs = await burst([{ species: "Ross's Gull", ...at(...P, 0, 0) }, { species: 'Rhodostethia rosea', ...at(...P, 50, 0) }, { species: "ROSS'S GULL 2", ...at(...P, 0, 80) },
    { species: 'Pterodroma feae', ...at(...Q) }, { species: 'Larus imaginarius', ...at(...R) }, { species: 'Zzzzus abcdef', ...at(...S) }, { species: 'Imaginary Warbler', ...at(...T) }]);
  check('7건 모두 접수', rs.every(r => r.status === 201), rs.map(r => r.status).join());
  const gull = rs.slice(0, 3);
  check("Ross's Gull = Rhodostethia rosea: 200 m 안 동시 3건 중 자동 공개 정확히 1건", open(gull).length === 1 && held(gull, 'possible_duplicate').length === 2);
  check('IOC 에만 있는 종(Pterodroma feae)은 공개, 속만 맞는 이름(Larus imaginarius)은 실존 종으로 판정하지 않고 name_unconfirmed 보류', open([rs[3]]).length === 1 && held([rs[4]], 'name_unconfirmed').length === 1 && open([rs[4]]).length === 0);
  check('속명도 IOC 에 없는 라틴어 꼴·IOC 에 없는 영명은 name_unconfirmed 보류', held([rs[5], rs[6]], 'name_unconfirmed').length === 2 && open([rs[5], rs[6]]).length === 0);
  const names = (await q('SELECT species_original, species_identified FROM sightings')).map(x => x.species_original);
  check('원문 보존(식별 이름으로 바꾸지 않음)', ["Ross's Gull", 'Rhodostethia rosea', 'Larus imaginarius'].every(n => names.includes(n)));
  const kos = await burst([{ species: 'Calidris pygmaea', ...at(...U, 0, 0) }, { species: 'Spoon-billed Sandpiper', ...at(...U, 40, 0) }, { species: 'calidris pygmaea 3', ...at(...U, 0, 60) }, { species: 'SPOON-BILLED SANDPIPER', ...at(...U, 60, 60) }]);
  check('2025 목록 종을 학명·영명으로만(국명 없이) 적은 동시 4건도 자동 공개 1건', open(kos).length === 1 && held(kos, 'possible_duplicate').length === 3, kos.map(r => r.receipt.publicVisibility).join());
  const syn = await burst([{ species: 'Tachyspiza haplochroa', ...at(...T, 0, 0) }, { species: 'Accipiter haplochrous', ...at(...T, 50, 0) }, { species: 'Tachyspiza haplochrous', ...at(...T, 0, 70) }, { species: 'White-bellied Goshawk', ...at(...T, 60, 60) }]);
  check('다른 분류목록의 동의어 학명(AviList·Clements 등)도 같은 종: 동시 4건 중 자동 공개 1건', open(syn).length === 1 && held(syn, 'possible_duplicate').length === 3, syn.map(r => r.receipt.publicVisibility).join());
  const syn2 = await burst([{ species: 'Accipiter haplochrous', ...at(...U, 0, 0) }, { species: 'Tachyspiza haplochrous', ...at(...U, 80, 0) }, { species: 'Accipiter haplochrous', ...at(...U, 0, 90) }]);
  check('동의어끼리만(IOC 학명·영명 없이) 적은 동시 3건도 자동 공개 1건', open(syn2).length === 1 && held(syn2, 'possible_duplicate').length === 2, syn2.map(r => r.receipt.publicVisibility + ':' + r.status).join());
  check('일치(동의어)', await consistent(q, syn));
  check('일치', await consistent(q, rs));
});

await scenario('10. [조사] 위치 정책 v2 19종: 가리지 않은 제보의 실제 좌표가 나가는 공개 경로, 가린 제보는 어디에도 없음', { REPORTS_AUTO_PUBLIC_DAILY_MAX: '50' }, async ({ q, burst, get }, check) => {
  const { SENSITIVE_SPECIES } = await load('src/shared.js');
  const specs = SENSITIVE_SPECIES.flatMap((name, i) => [{ species: name, ...at(34 + i * 0.1, 126 + i * 0.1) }, { species: name, ...at(34.05 + i * 0.1, 126.05 + i * 0.1), hideLocation: true }]);
  const rs = await burst(specs);
  check('38건 모두 자동 공개', rs.every(r => r.status === 201) && open(rs).length === 38, rs.map(r => r.status + ':' + r.receipt.publicVisibility).join().slice(0, 120));
  const paths = ['/reports/pending', '/reports/approved', '/reports/recent-sites?days=30', '/reports/search?q=', '/contributors/monthly', '/contributors/all'];
  const nums = o => (typeof o === 'number' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(nums) : []);
  const bodies = Object.fromEntries(await Promise.all(paths.map(async p => [p, nums(await get(p))])));
  const exposure = {};
  rs.forEach((r, i) => { const s = specs[i], key = s.hideLocation ? 'hidden' : 'exact';
    for (const p of paths) if (bodies[p].some(n => Math.abs(n - s.lat) < 1e-5) && bodies[p].some(n => Math.abs(n - s.lon) < 1e-5)) exposure[key + ' ' + p] = (exposure[key + ' ' + p] || 0) + 1; });
  console.log('   EXPOSURE ' + JSON.stringify(exposure));
  check('가리지 않은 19건의 실제 좌표 노출 경로가 있다(조사 기록)', Object.keys(exposure).some(k => k.startsWith('exact')));
  check('가린 19건의 실제 좌표는 어떤 공개 응답에도 없다', !Object.keys(exposure).some(k => k.startsWith('hidden')), JSON.stringify(exposure));
  const spots = (await get('/reports/pending')).spots;
  const off = specs.filter(s => s.hideLocation).map((s, i) => spots.find(x => x.locationHidden && Math.abs(x.lat - s.lat) < 0.5 && Math.abs(x.lon - s.lon) < 0.5));
  check('가린 19건은 대략점(최소 1 km 이동)으로만 표시', off.length === 19 && off.every(Boolean));
});

await scenario('11. AviList v2026 에서 새로 생긴·분할된 종(IOC 15.2 이전 목록에 없음)도 학명·영명 어느 쪽이든 자동 공개되고 동일종 중복은 1건', {}, async ({ q, burst }, check) => {
  const rs = await burst([{ species: 'Tringa inornata', ...at(...P, 0, 0) }, { species: 'Prairie Willet', ...at(...P, 60, 0) }, { species: 'prairie willet 2', ...at(...P, 0, 80) },
    { species: 'Muscicapa tyrrhenica', ...at(...Q) }, { species: 'Mediterranean Flycatcher', ...at(...R) }, { species: 'Hierococcyx tiganada', ...at(...S) }]);
  check('6건 모두 접수', rs.every(r => r.status === 201), rs.map(r => r.status).join());
  check('Tringa inornata = Prairie Willet: 동시 3건 중 자동 공개 1건', open(rs.slice(0, 3)).length === 1 && held(rs.slice(0, 3), 'possible_duplicate').length === 2);
  check('Muscicapa tyrrhenica·Mediterranean Flycatcher(다른 장소)·신종 Hierococcyx tiganada 공개', open(rs.slice(3)).length === 3);
  check('일치', await consistent(q, rs));
});

auth.restore();
const out = { pass: results.every(r => r.pass) };
for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + ` (${r.checks.length})` + r.checks.filter(c => !c.pass).map(c => '\n   ✗ ' + c.what + (c.detail !== undefined ? ' :: ' + c.detail : '')).join(''));
console.log(out.pass ? 'ALL PASS' : 'FAILURES');
process.exitCode = out.pass ? 0 : 1;
