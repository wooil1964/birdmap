// Phase 2D.1 real-browser Turnstile tests. Staging widget birdmap-phase2d-staging-browser only.
// A human mints each token in their own browser; this server never solves or bypasses a challenge.
// Tokens and the widget secret stay in memory: never printed, logged or written to disk.
// usage: node docs/long-term-db-phase2d1/scripts/turnstile-browser.mjs   then open http://localhost:8790
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { http as remote, success } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, ROOT } from './staging.mjs';

const widget = JSON.parse(readFileSync(join(ROOT, 'docs/long-term-db-phase2d/.local/staging-widget.json'), 'utf8')).result;
assert.equal(widget.name, 'birdmap-phase2d-staging-browser');
const SECRET = widget.secret, PORT = 8790, OUT = join(LOCAL, 'turnstile-browser.json');
const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { at: new Date().toISOString(), widget: widget.name, mode: widget.mode, tests: [] };
const save = () => writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const record = (name, pass, detail) => { result.tests.push({ name, result: pass ? 'PASS' : 'FAIL', at: new Date().toISOString(), ...detail }); save(); return { name, pass, ...detail }; };

const rid = () => randomUUID();
const payload = (id, n, token) => ({ request_id: id, non_breeding_confirmed: true, species: '합성브라우저' + n, lat: 37.61, lon: 127.61 + n / 1000, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'Phase2D.1 synthetic browser test', turnstileToken: token });
const app = (body) => remote('public', '/reports', body);                                   // real public Worker route, real Siteverify
const counts = async () => { const s = await success('public', { op: 'state' }); return s.counts; };
const delta = (a, b) => Object.fromEntries(['reports', 'raw_submissions', 'checklists', 'sightings'].map(t => [t, b[t] - a[t]]));
async function siteverify(token, idempotencyKey) {                                         // direct call, same endpoint the Worker uses
  const body = new URLSearchParams({ secret: SECRET, response: token }); if (idempotencyKey) body.set('idempotency_key', idempotencyKey);
  const j = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })).json();
  return { success: j.success === true, codes: j['error-codes'] ?? [], hostname: j.hostname ?? null };
}
let n = Number(result.tests.length) * 10 + 100, first = null;   // payload numbering; first = committed request for replay test
const expiry = [];

const steps = [
  { id: 'fresh-reuse', text: '새 토큰 1개: 정상 제출 → 같은 토큰 재사용', async run(token) {
    const c0 = await counts(), id = rid(), body = payload(id, ++n, token), r = await app(body), c1 = await counts();
    const reuse = await app(payload(rid(), ++n, token)), c2 = await counts(), direct = await siteverify(token);
    first = { id, body: { ...body, turnstileToken: null }, response: r.body };
    const d1 = delta(c0, c1), d2 = delta(c1, c2);
    record('A fresh token: exactly one validation, 4 tables +1', r.status === 201 && Object.values(d1).every(v => v === 1), { status: r.status, delta: d1 });
    return record('B reuse of validated token rejected, DB unchanged', reuse.status === 403 && reuse.body.error?.code === 'CAPTCHA_FAILED' && Object.values(d2).every(v => v === 0) && !direct.success,
      { status: reuse.status, code: reuse.body.error?.code, delta: d2, direct_siteverify: direct });
  } },
  { id: 'invalid', text: '토큰 불필요 (자동)', auto: true, async run() {
    const c0 = await counts(), r = await app(payload(rid(), ++n, 'invalid.' + randomUUID())), d = delta(c0, await counts()), direct = await siteverify('invalid.' + randomUUID());
    return record('D invalid token rejected', r.status === 403 && Object.values(d).every(v => v === 0) && !direct.success, { status: r.status, code: r.body.error?.code, delta: d, direct_siteverify: direct });
  } },
  { id: 'replay', text: '새 토큰 1개: 커밋된 요청 replay가 토큰을 소비하지 않는지', async run(token) {
    const c0 = await counts(), replay = await app({ ...first.body, turnstileToken: token }), c1 = await counts();
    const fresh = await app(payload(rid(), ++n, token)), c2 = await counts();
    return record('34 same request_id+payload replay: no insert, no token consumption', replay.status === 201 && JSON.stringify(replay.body) === JSON.stringify(first.response) && Object.values(delta(c0, c1)).every(v => v === 0) && fresh.status === 201 && Object.values(delta(c1, c2)).every(v => v === 1),
      { replay_status: replay.status, replay_body_equal: JSON.stringify(replay.body) === JSON.stringify(first.response), replay_delta: delta(c0, c1), same_token_after_replay_status: fresh.status, after_delta: delta(c1, c2) });
  } },
  { id: 'idempotency', text: '새 토큰 1개: Siteverify idempotency_key 재시도', async run(token) {
    const k = randomUUID(), a = await siteverify(token, k), b = await siteverify(token, k), c = await siteverify(token, randomUUID()), d = await siteverify(token);
    return record('35 idempotency_key: same key retry vs new key vs no key', a.success, { first_with_key: a, retry_same_key: b, new_key: c, no_key: d });
  } },
  ...[1, 2].map(i => ({ id: 'direct-concurrent-' + i, text: `새 토큰 1개: 같은 토큰 Siteverify 동시 5회 (${i}/2)`, async run(token) {
    const rs = await Promise.all(Array.from({ length: 5 }, () => siteverify(token)));
    return record(`33 direct concurrent Siteverify round ${i}: exactly one success`, rs.filter(r => r.success).length === 1, { successes: rs.filter(r => r.success).length, failure_codes: rs.filter(r => !r.success).map(r => r.codes.join('|')) });
  } })),
  { id: 'expiry-1', text: '만료 시험용 토큰 1 (발급 후 5분 10초 대기)', async run(token) { expiry.push({ token, at: Date.now() }); return { held: 1 }; } },
  { id: 'expiry-2', text: '만료 시험용 토큰 2 — 발급 후 서버가 5분 10초 기다린 뒤 자동 시험', async run(token) {
    expiry.push({ token, at: Date.now() });
    const wait = expiry[0].at + 310000 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const age = Math.round((Date.now() - expiry[0].at) / 1000), c0 = await counts(), r = await app(payload(rid(), ++n, expiry[0].token)), d = delta(c0, await counts());
    const w2 = expiry[1].at + 310000 - Date.now(); if (w2 > 0) await new Promise(r2 => setTimeout(r2, w2));
    const direct = await siteverify(expiry[1].token), age2 = Math.round((Date.now() - expiry[1].at) / 1000);
    expiry.length = 0;
    return record('C expired token (never used before) rejected', r.status === 403 && Object.values(d).every(v => v === 0) && !direct.success, { app_token_age_s: age, status: r.status, code: r.body.error?.code, delta: d, direct_first_use_age_s: age2, direct_siteverify: direct });
  } },
  ...[1, 2, 3].map(i => ({ id: 'app-concurrent-' + i, text: `새 토큰 1개: 서로 다른 제보 4건에 같은 토큰 동시 제출 (${i}/3)`, async run(token) {
    const c0 = await counts(), rs = await Promise.all(Array.from({ length: 4 }, () => app(payload(rid(), ++n, token)))), d = delta(c0, await counts());
    return record(`33 app concurrent same token round ${i}: exactly one commit`, rs.filter(r => r.status === 201).length === 1 && rs.filter(r => r.status === 403).length === 3 && Object.values(d).every(v => v === 1),
      { statuses: rs.map(r => r.status).sort(), codes: rs.filter(r => r.status !== 201).map(r => r.body.error?.code), delta: d });
  } })),
];
let cursor = 0;
const next = () => steps[cursor] ? { id: steps[cursor].id, text: steps[cursor].text, auto: !!steps[cursor].auto, index: cursor + 1, total: steps.length } : { done: true };
const page = `<!doctype html><meta charset="utf-8"><title>Phase 2D.1 Turnstile</title><style>body{font:17px system-ui;max-width:860px;margin:40px auto}button{padding:12px 18px;font-size:17px}pre{white-space:pre-wrap;background:#f4f4f4;padding:10px}</style>
<h1>Phase 2D.1 — staging 전용 Turnstile 실제 브라우저 시험</h1><p>staging 위젯만 사용합니다. 토큰 값은 화면·로그·파일에 남지 않습니다.</p>
<h2 id="step">…</h2><button id="mint" onclick="mint()">토큰 발급</button> <button id="auto" onclick="send(null)" hidden>자동 시험 실행</button><div id="widget" style="margin:14px 0"></div><p id="status"></p><pre id="log"></pre>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
<script>let wid=null;const $=s=>document.querySelector(s);
async function refresh(){const s=await (await fetch('/next')).json();if(s.done){$('#step').textContent='모든 시험 완료 — 창을 닫고 Claude에게 “Turnstile 완료”라고 알려 주세요';$('#mint').hidden=true;$('#auto').hidden=true;return;}$('#step').textContent='['+s.index+'/'+s.total+'] '+s.text;$('#mint').hidden=!!s.auto;$('#auto').hidden=!s.auto;$('#mint').disabled=false;$('#auto').disabled=false;}
function mint(){$('#mint').disabled=true;$('#status').textContent='토큰 발급 중 — 체크박스가 보이면 직접 눌러 주세요';if(wid!==null)turnstile.remove(wid);wid=turnstile.render('#widget',{sitekey:${JSON.stringify(widget.sitekey)},callback:t=>send(t),'error-callback':c=>{$('#status').textContent='발급 오류 '+c;$('#mint').disabled=false;}});}
async function send(token){$('#auto').disabled=true;$('#status').textContent=token?'토큰 발급됨(값 비공개) — 시험 중… 만료 시험은 약 5분 걸립니다':'시험 중…';const r=await fetch('/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const j=await r.json();$('#log').textContent+=JSON.stringify(j)+'\\n';$('#status').textContent=r.ok?'완료':'실패 — 로그 확인';if(wid!==null){turnstile.remove(wid);wid=null;}refresh();}
refresh();</script>`;
let busy = false;
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
