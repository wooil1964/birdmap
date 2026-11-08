// Native D1 (Miniflare/workerd) concurrency check for the daily auto-publish cap. Synthetic data only, local D1, no network.
// Usage: node docs/report-autopublish-20261108/cap-native.mjs <miniflare node_modules dir> [reports-api dir] [N] [CAP]
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [toolchain, apiDir = resolve('reports-api'), N = '24', CAP = '3'] = process.argv.slice(2);
const load = p => import(pathToFileURL(resolve(apiDir, p)).href);
const { localDb, installAuthStubs, environments, input, ORIGIN } = await load('local-test/helpers.mjs');
const { handleRequest } = await load('src/public.js');
const { AUTO_PUBLIC_REASON } = await load('src/autopublic.js');
const local = await localDb(toolchain), auth = await installAuthStubs(), env = environments(local.db);
Object.assign(env.pub, { REPORTS_AUTO_PUBLIC: '1', REPORTS_UNVERIFIED_READS: '1', REPORTS_AUTO_PUBLIC_DAILY_MAX: CAP, REPORTS_PUBLICATION_REQUIRED: 'true' });
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const SPECIES = ['참새', '까치', '직박구리', '박새', '딱새', '동박새', '물까치', '쇠딱다구리'];
const post = (body, ip) => handleRequest(new Request('https://reports.example/reports', { method: 'POST',
  headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env.pub);
const q = async (sql, ...v) => (await local.db.prepare(sql).bind(...v).all()).results;
const out = { n: Number(N), cap: Number(CAP), checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, pass: !!ok, ...(detail === undefined ? {} : { detail }) }); };
try {
  const bodies = Array.from({ length: Number(N) }, (_, i) => input(90000 + i, { species: SPECIES[i % SPECIES.length], observedOn: today, lat: 35 + i / 100, lon: 127 + i / 100, note: null }));
  const responses = await Promise.all(bodies.map((b, i) => post(b, '203.0.113.' + (10 + i))));
  const receipts = await Promise.all(responses.map(r => r.json()));
  check('모든 접수가 201(거절·삭제 없음)', responses.every(r => r.status === 201), responses.map(r => r.status));
  const open = receipts.filter(r => r.publicVisibility === 'public_unverified').length;
  const reviewsAuto = (await q(`SELECT COUNT(*) n FROM reviews WHERE sequence=1 AND reason_code=?`, AUTO_PUBLIC_REASON))[0].n;
  const flags = (await q('SELECT COUNT(*) n FROM reports WHERE pending_public=1'))[0].n;
  out.open = open; out.reviewsAuto = reviewsAuto; out.flags = flags;
  check(`자동 공개 접수증 수 = 한도 ${CAP}`, open === Number(CAP), open);
  check('판정 기록 자동 공개 수 = 한도', reviewsAuto === Number(CAP), reviewsAuto);
  check('reports 공개 플래그 수 = 한도', flags === Number(CAP), flags);
  let consistent = 0;
  for (const [i, b] of bodies.entries()) {
    const id = b.request_id, rec = receipts[i];
    const [row] = await q('SELECT pending_public FROM reports WHERE id=?', id);
    const [rv] = await q('SELECT reason_code FROM reviews WHERE checklist_id=? AND sequence=1', id);
    const [raw] = await q('SELECT payload_json FROM raw_submissions WHERE request_id=?', id);
    const accepted = JSON.parse(raw.payload_json).accepted, pub = rec.publicVisibility === 'public_unverified';
    if (row.pending_public === (pub ? 1 : 0) && rv.reason_code === (pub ? AUTO_PUBLIC_REASON : 'hold:' + (rec.holdReasons || []).join(',')) &&
        accepted.publicVisibility === rec.publicVisibility && (pub || (rec.holdReasons || []).includes('global_cap'))) consistent++;
  }
  check('접수증·reports·판정 기록·원자료 모두 일치(보류는 global_cap 사유)', consistent === bodies.length, consistent);
  check('확인용 임시 행 없음', (await q('SELECT COUNT(*) n FROM transaction_assertions'))[0].n === 0);
  check('CAPTCHA 사용 기록 = 접수 수(재저장으로 중복 없음)', (await q('SELECT COUNT(*) n FROM captcha_redemptions'))[0].n === bodies.length);
  // 재전송 동시 실행: 같은 결과, 상태 변화 없음
  const again = await Promise.all((await Promise.all(bodies.map((b, i) => post(b, '203.0.113.' + (10 + i))))).map(r => r.json()));
  check('동시 재전송은 최초 접수증과 동일', again.every((r, i) => JSON.stringify(r) === JSON.stringify(receipts[i])));
  check('재전송 뒤에도 행·판정 수 변화 없음', (await q('SELECT COUNT(*) n FROM reports'))[0].n === bodies.length && (await q('SELECT COUNT(*) n FROM reviews'))[0].n === bodies.length);
} finally { auth.restore(); await local.close(); }
out.pass = out.checks.every(c => c.pass);
console.log(JSON.stringify(out, null, 1));
process.exitCode = out.pass ? 0 : 1;
