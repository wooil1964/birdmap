// Real-browser staging test of the application-level Turnstile redemption guard.
// A human mints each token. Tokens, token hashes, secrets and keys are never printed or written.
// usage: node docs/long-term-db-phase2d1/scripts/turnstile-guard-browser.mjs   then open http://localhost:8792
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { http as remote } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, ROOT, P2C } from './staging.mjs';

const widget = JSON.parse(readFileSync(join(ROOT, 'docs/long-term-db-phase2d/.local/staging-widget.json'), 'utf8')).result;
assert.equal(widget.name, 'birdmap-phase2d-staging-browser');
const SECRET = widget.secret, PORT = 8792, OUT = join(LOCAL, 'turnstile-guard-browser.json');
const jwt = readFileSync(join(P2C, 'staging-access-jwt.txt'), 'utf8').trim(), adminAuth = { 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt };
const result = { at: new Date().toISOString(), widget: widget.name, criterion: 'application boundary: one canonical submission per token', tests: [] };
const save = () => writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const record = (name, pass, detail) => { result.tests.push({ name, result: pass ? 'PASS' : 'FAIL', at: new Date().toISOString(), ...detail }); save(); return { name, pass, ...detail }; };
const hashes = new Set(), sha = t => { const h = createHash('sha256').update(t).digest('hex'); hashes.add(h); return h; };

const TABLES = ['reports', 'raw_submissions', 'checklists', 'sightings', 'captcha_redemptions'];
const counts = async () => { const r = await remote('public', '/_phase2d1', { op: 'state' }); assert.equal(r.status, 200); return r.body.value.counts; };
const delta = (a, b) => Object.fromEntries(TABLES.map(t => [t, b[t] - a[t]]));
const all = (d, v) => TABLES.every(t => d[t] === v);
let n = 700;
const payload = (id, token) => ({ request_id: id, non_breeding_confirmed: true, species: '합성가드' + (++n), lat: 37.81, lon: 127.81 + n / 1000, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'Phase2D.1 redemption guard browser test', turnstileToken: token });
const app = body => remote('public', '/reports', body);
async function siteverify(token, key) {
  const body = new URLSearchParams({ secret: SECRET, response: token }); if (key) body.set('idempotency_key', key);
  const j = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })).json();
  return { success: j.success === true, codes: j['error-codes'] ?? [] };
}
let held = null, fresh = null;

const concurrentRound = i => ({ id: 'B' + i, text: `B (${i}/3): 같은 토큰으로 서로 다른 request_id 4건 동시 제출`, async run(token) {
  sha(token);
  const bodies = Array.from({ length: 4 }, () => payload(randomUUID(), token)), c0 = await counts();
  const rs = await Promise.all(bodies.map(app)), d = delta(c0, await counts());
  const statuses = rs.map(r => r.status), codes = rs.filter(r => r.status !== 201).map(r => r.body.error?.code);
  return record(`B${i} same token, 4 request_ids concurrent: exactly one canonical submission`,
    statuses.filter(s => s === 201).length === 1 && all(d, 1) && codes.length === 3 && codes.every(c => ['CAPTCHA_REUSED', 'CAPTCHA_FAILED'].includes(c)),
    { statuses: statuses.slice().sort(), rejected_codes: codes.slice().sort(), delta: d });
} });
const steps = [
  { id: 'hold', text: '만료 시험용 토큰 (보관만 함, 마지막 단계에서 5분 10초 뒤 사용)', async run(token) { sha(token); held = { token, at: Date.now() }; return { held: true }; } },
  { id: 'A', text: 'A: 새 토큰으로 정상 제출 1건', async run(token) {
    sha(token); const body = payload(randomUUID(), token), c0 = await counts(), r = await app(body), d = delta(c0, await counts());
    fresh = { body, response: r.body };
    return record('A fresh token: one submission + one redemption', r.status === 201 && all(d, 1), { status: r.status, delta: d });
  } },
  concurrentRound(1), concurrentRound(2), concurrentRound(3),
  { id: 'OBS', text: '관찰용: 같은 토큰 직접 Siteverify 동시 5회 (서로 다른 key) — PASS 기준 아님', async run(token) {
    sha(token); const rs = await Promise.all(Array.from({ length: 5 }, () => siteverify(token, randomUUID())));
    result.external_observation = { at: new Date().toISOString(), successes: rs.filter(r => r.success).length, failures: rs.filter(r => !r.success).map(r => r.codes.join('|')) }; save();
    return { observation: result.external_observation };
  } },
  { id: 'C', text: '자동: 같은 request_id + 같은 payload replay', auto: true, async run() {
    const c0 = await counts(), r = await app({ ...fresh.body, turnstileToken: 'invalid.' + randomUUID() }), d = delta(c0, await counts());
    let equal = true; try { assert.deepStrictEqual(r.body, fresh.response); } catch { equal = false; }
    return record('C same request_id replay: original result, no insert', r.status === 201 && equal && all(d, 0), { status: r.status, body_equal_order_insensitive: equal, delta: d });
  } },
  { id: 'D', text: '자동: 같은 request_id + 변경 payload', auto: true, async run() {
    const c0 = await counts(), r = await app({ ...fresh.body, species: '합성변경', turnstileToken: 'invalid.' + randomUUID() }), d = delta(c0, await counts());
    return record('D same request_id, changed payload: rejected by idempotency policy', r.status === 409 && r.body.error?.code === 'IDEMPOTENCY_CONFLICT' && all(d, 0), { status: r.status, code: r.body.error?.code, delta: d });
  } },
  { id: 'E', text: '자동: invalid token', auto: true, async run() {
    const c0 = await counts(), r = await app(payload(randomUUID(), 'invalid.' + randomUUID())), d = delta(c0, await counts());
    return record('E invalid token: redemption 0, canonical 0', r.status === 403 && all(d, 0), { status: r.status, code: r.body.error?.code, delta: d });
  } },
  { id: 'J', text: '자동: 공개/관리자 API에 redemption 노출 여부', auto: true, async run() {
    const bodies = [];
    for (const p of ['/reports/approved', '/reports/pending', '/reports/site/1', `/reports/${fresh.body.request_id}/status`, '/reports/capabilities']) bodies.push([p, JSON.stringify((await remote('public', p)).body)]);
    for (const p of ['/admin/api/reports?status=all', '/admin/api/capabilities']) bodies.push([p, JSON.stringify((await remote('admin', p, undefined, adminAuth)).body)]);
    const leaks = bodies.filter(([, t]) => [...hashes].some(h => t.includes(h)) || /captcha_redemptions|token_hash/.test(t)).map(([p]) => p);
    return record('J captcha_redemptions not exposed by public/admin APIs', leaks.length === 0, { endpoints: bodies.map(([p]) => p), leaks });
  } },
  { id: 'F', text: '자동: 보관한 토큰 만료 시험 (5분 10초 경과까지 대기)', auto: true, async run() {
    const wait = held.at + 310000 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const age = Math.round((Date.now() - held.at) / 1000), c0 = await counts(), r = await app(payload(randomUUID(), held.token)), d = delta(c0, await counts());
    held = null;
    return record('F expired token: redemption 0, canonical 0', r.status === 403 && all(d, 0), { age_s: age, status: r.status, code: r.body.error?.code, delta: d });
  } },
];
let cursor = 0, busy = false;
const next = () => steps[cursor] ? { id: steps[cursor].id, text: steps[cursor].text, auto: !!steps[cursor].auto, index: cursor + 1, total: steps.length } : { done: true };
const page = `<!doctype html><meta charset="utf-8"><title>Phase 2D.1 Turnstile guard</title><style>body{font:17px system-ui;max-width:860px;margin:40px auto}button{padding:12px 18px;font-size:17px}pre{white-space:pre-wrap;background:#f4f4f4;padding:10px}</style>
<h1>Phase 2D.1 — Turnstile redemption guard 시험 (staging 전용)</h1><p>토큰 값은 화면·로그·파일에 남지 않습니다.</p>
<h2 id="step">…</h2><button id="mint" onclick="mint()">토큰 발급</button> <button id="auto" onclick="send(null)" hidden>자동 시험 실행</button><div id="widget" style="margin:14px 0"></div><p id="status"></p><pre id="log"></pre>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
<script>let wid=null;const $=s=>document.querySelector(s);
async function refresh(){const s=await (await fetch('/next')).json();if(s.done){$('#step').textContent='모든 시험 완료 — Claude에게 “가드 시험 완료”라고 알려 주세요';$('#mint').hidden=true;$('#auto').hidden=true;return;}$('#step').textContent='['+s.index+'/'+s.total+'] '+s.text;$('#mint').hidden=!!s.auto;$('#auto').hidden=!s.auto;$('#mint').disabled=false;$('#auto').disabled=false;}
function mint(){$('#mint').disabled=true;$('#status').textContent='토큰 발급 중 — 체크박스가 보이면 직접 눌러 주세요';if(wid!==null)turnstile.remove(wid);wid=turnstile.render('#widget',{sitekey:${JSON.stringify(widget.sitekey)},callback:t=>send(t),'error-callback':c=>{$('#status').textContent='발급 오류 '+c;$('#mint').disabled=false;}});}
async function send(token){$('#auto').disabled=true;$('#status').textContent='시험 중… (마지막 만료 단계는 최대 5분)';const r=await fetch('/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const j=await r.json();$('#log').textContent+=JSON.stringify(j)+'\\n';$('#status').textContent=r.ok?'완료':'실패 — 로그 확인';if(wid!==null){turnstile.remove(wid);wid=null;}refresh();}
refresh();</script>`;
http.createServer(async (req, res) => {
  const reply = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
  try {
    if (req.method === 'GET' && req.url === '/') return reply(200, page, 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/next') return reply(200, next());
    if (req.method === 'POST' && req.url === '/token') {
      if (req.headers.origin !== `http://localhost:${PORT}` || busy || !steps[cursor]) return reply(409, { error: 'not accepted' });
      let text = ''; for await (const c of req) { text += c; if (text.length > 8000) throw Error('too large'); }
      const { token } = JSON.parse(text), step = steps[cursor];
      if (!step.auto && (typeof token !== 'string' || token.length < 30)) return reply(400, { error: 'token required' });
      busy = true; try { const out = await step.run(token); cursor++; console.log(JSON.stringify({ step: step.id, ...out })); return reply(200, { step: step.id, ...out }); } finally { busy = false; }
    }
    reply(404, { error: 'not found' });
  } catch (e) { result.errors ??= []; result.errors.push({ at: new Date().toISOString(), message: String(e.message).slice(0, 200) }); save(); reply(500, { error: String(e.message).slice(0, 200) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`READY http://localhost:${PORT}`));
