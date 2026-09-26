// Phase 2D.1 Turnstile D retest (root-cause of concurrent multi-success). Staging widget only.
// A human mints every token in their own browser. Tokens, secret and idempotency keys are never
// printed or written; only counts, success flags and error codes are recorded.
// usage: node docs/long-term-db-phase2d1/scripts/turnstile-retest.mjs   then open http://localhost:8791
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { http as remote, success } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, ROOT } from './staging.mjs';

const widget = JSON.parse(readFileSync(join(ROOT, 'docs/long-term-db-phase2d/.local/staging-widget.json'), 'utf8')).result;
assert.equal(widget.name, 'birdmap-phase2d-staging-browser');
const SECRET = widget.secret, PORT = 8791, OUT = join(LOCAL, 'turnstile-retest.json');
const result = { at: new Date().toISOString(), widget: widget.name, app_sends_idempotency_key: false, tests: [] };
const save = () => writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
const record = (name, pass, detail) => { result.tests.push({ name, result: pass ? 'PASS' : 'FAIL', at: new Date().toISOString(), ...detail }); save(); return { name, pass, ...detail }; };

async function siteverify(token, key) {
  const body = new URLSearchParams({ secret: SECRET, response: token }); if (key) body.set('idempotency_key', key);
  const t0 = Date.now(), j = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })).json();
  return { success: j.success === true, codes: j['error-codes'] ?? [], ms: Date.now() - t0 };
}
const summary = rs => ({ successes: rs.filter(r => r.success).length, failures: rs.filter(r => !r.success).map(r => r.codes.join('|') || 'none'), ms: rs.map(r => r.ms) });
const concurrent = (token, keyed) => { const keys = Array.from({ length: 5 }, () => keyed ? randomUUID() : null); return Promise.all(keys.map(k => siteverify(token, k))).then(rs => ({ ...summary(rs), distinct_keys: keyed ? new Set(keys).size : 0 })); };
const dupOnly = s => s.failures.every(c => /timeout-or-duplicate/.test(c));

let n = 500;
const payload = (id, token) => ({ request_id: id, non_breeding_confirmed: true, species: '합성재시험' + (++n), lat: 37.71, lon: 127.71 + n / 1000, observedOn: '2026-09-20', birdCount: 1, reporter: null, namePublic: false, note: 'Phase2D.1 Turnstile retest', turnstileToken: token });
const counts = async () => (await success('public', { op: 'state' })).counts;
const delta = (a, b) => Object.fromEntries(['reports', 'raw_submissions', 'checklists', 'sightings'].map(t => [t, b[t] - a[t]]));
let held = null;

const steps = [
  { id: 'expiry-hold', text: '만료 시험용 토큰 (보관만 함, 5분 10초 뒤 마지막 단계에서 사용)', async run(token) { held = { token, at: Date.now() }; return { held: true }; } },
  ...[1, 2].map(i => ({ id: 'A' + i, text: `TEST A (${i}/2): 같은 토큰, 서로 다른 새 UUID key로 동시 5회`, async run(token) {
    const s = await concurrent(token, true);
    return record(`TEST A${i} same token, 5 distinct keys, concurrent`, s.successes === 1 && dupOnly(s), s);
  } })),
  { id: 'BC', text: 'TEST B/C: key K1 검증 → 같은 K1 재시도 → 새 K2 → key 없음', async run(token) {
    const k1 = randomUUID(), b1 = await siteverify(token, k1), b2 = await siteverify(token, k1), c = await siteverify(token, randomUUID()), none = await siteverify(token);
    record('TEST B same token + same K1 retry (same logical validation)', b1.success, { first: b1, retry_same_key: b2, note: 'retry result recorded; not counted as a second use' });
    return record('TEST C same token + new K2 rejected', !c.success && /timeout-or-duplicate/.test(c.codes.join()), { new_key: c, no_key_after: none });
  } },
  ...[1, 2].map(i => ({ id: 'D' + i, text: `TEST D (${i}/2): 같은 토큰, key 없이 동시 5회`, async run(token) {
    const s = await concurrent(token, false);
    return record(`TEST D${i} same token, no key, concurrent`, s.successes === 1 && dupOnly(s), s);
  } })),
  { id: 'APP', text: 'APP: 같은 토큰으로 request_id A/B/C/D 4건 동시 제출 + replay', async run(token) {
    const bodies = Array.from({ length: 4 }, () => payload(randomUUID(), token)), c0 = await counts();
    const rs = await Promise.all(bodies.map(b => remote('public', '/reports', b)));
    const c1 = await counts(), won = rs.findIndex(r => r.status === 201), d = delta(c0, c1);
    const stored = rs.filter(r => r.status === 201).length;
    record('APP distinct request_ids A/B/C/D, same token: exactly one stored', stored === 1 && Object.values(d).every(v => v === 1),
      { statuses: rs.map(r => r.status), codes: rs.filter(r => r.status !== 201).map(r => r.body.error?.code), delta: d, siteverify_keys_sent_by_app: 'none (verifyTurnstile never sets idempotency_key)' });
    if (won < 0) return record('APP same request_id replay', false, { reason: 'nothing committed' });
    // identical request_id + payload; token is not part of the replay fingerprint, replay returns before Siteverify
    const again = await remote('public', '/reports', { ...bodies[won], turnstileToken: 'invalid.' + randomUUID() }), d2 = delta(c1, await counts());
    return record('APP same request_id replay: 201, no additional insert', again.status === 201 && again.body.id === bodies[won].request_id && Object.values(d2).every(v => v === 0), { status: again.status, delta: d2 });
  } },
  { id: 'INVALID', text: '토큰 불필요 (자동): invalid token', auto: true, async run() {
    const c0 = await counts(), r = await remote('public', '/reports', payload(randomUUID(), 'invalid.' + randomUUID())), d = delta(c0, await counts()), s = await siteverify('invalid.' + randomUUID());
    return record('invalid token rejected', r.status === 403 && Object.values(d).every(v => v === 0) && !s.success, { status: r.status, code: r.body.error?.code, delta: d, direct: s });
  } },
  { id: 'EXPIRY', text: '토큰 불필요 (자동): 보관한 토큰 만료 시험 — 5분 10초가 안 지났으면 서버가 기다림', auto: true, async run() {
    const wait = held.at + 310000 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const age = Math.round((Date.now() - held.at) / 1000), c0 = await counts(), r = await remote('public', '/reports', payload(randomUUID(), held.token)), d = delta(c0, await counts());
    held = null;
    return record('expired token (never used) rejected by app', r.status === 403 && Object.values(d).every(v => v === 0), { age_s: age, status: r.status, code: r.body.error?.code, delta: d });
  } },
];
let cursor = 0, busy = false;
const next = () => steps[cursor] ? { id: steps[cursor].id, text: steps[cursor].text, auto: !!steps[cursor].auto, index: cursor + 1, total: steps.length } : { done: true };
const page = `<!doctype html><meta charset="utf-8"><title>Phase 2D.1 Turnstile retest</title><style>body{font:17px system-ui;max-width:860px;margin:40px auto}button{padding:12px 18px;font-size:17px}pre{white-space:pre-wrap;background:#f4f4f4;padding:10px}</style>
<h1>Phase 2D.1 — Turnstile 재시험 (staging 전용)</h1><p>토큰 값은 화면·로그·파일에 남지 않습니다.</p>
<h2 id="step">…</h2><button id="mint" onclick="mint()">토큰 발급</button> <button id="auto" onclick="send(null)" hidden>자동 시험 실행</button><div id="widget" style="margin:14px 0"></div><p id="status"></p><pre id="log"></pre>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
<script>let wid=null;const $=s=>document.querySelector(s);
async function refresh(){const s=await (await fetch('/next')).json();if(s.done){$('#step').textContent='모든 시험 완료 — Claude에게 “재시험 완료”라고 알려 주세요';$('#mint').hidden=true;$('#auto').hidden=true;return;}$('#step').textContent='['+s.index+'/'+s.total+'] '+s.text;$('#mint').hidden=!!s.auto;$('#auto').hidden=!s.auto;$('#mint').disabled=false;$('#auto').disabled=false;}
function mint(){$('#mint').disabled=true;$('#status').textContent='토큰 발급 중 — 체크박스가 보이면 직접 눌러 주세요';if(wid!==null)turnstile.remove(wid);wid=turnstile.render('#widget',{sitekey:${JSON.stringify(widget.sitekey)},callback:t=>send(t),'error-callback':c=>{$('#status').textContent='발급 오류 '+c;$('#mint').disabled=false;}});}
async function send(token){$('#auto').disabled=true;$('#status').textContent='시험 중… (만료 단계는 최대 5분)';const r=await fetch('/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const j=await r.json();$('#log').textContent+=JSON.stringify(j)+'\\n';$('#status').textContent=r.ok?'완료':'실패 — 로그 확인';if(wid!==null){turnstile.remove(wid);wid=null;}refresh();}
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
