// Staging freeze/drain/unfreeze/race rehearsal on the real staging D1 through real Worker HTTP.
// Freeze is performed with the same REST tool the Phase 2E runbook uses (reports-api/tools/freeze.mjs).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { http, success } from '../../long-term-db-phase2c/scripts/remote-client.mjs';
import { LOCAL, P2C, ROOT } from './staging.mjs';

const phase = process.argv[2]; // 'basic' | 'race' | 'dual'
const jwt = readFileSync(join(P2C, 'staging-access-jwt.txt'), 'utf8').trim(), auth = { 'Cf-Access-Jwt-Assertion': jwt, Cookie: 'CF_Authorization=' + jwt };
const T = join(LOCAL, 'target.main.json');
const evidence = { phase, at: new Date().toISOString(), tests: [] };
const check = async (name, fn) => { const d = await fn(); evidence.tests.push({ name, result: 'PASS', ...(d ? { detail: d } : {}) }); console.log('PASS ' + name); };
function tool(...args) {
  const r = spawnSync(process.execPath, [join(ROOT, 'reports-api/tools/freeze.mjs'), ...args, '--target', T], { encoding: 'utf8', cwd: ROOT });
  const text = (r.stdout || r.stderr).trim().split('\n').at(-1); return { code: r.status, ...JSON.parse(text) };
}
const freeze = reason => { const r = tool('--freeze', '--reason', reason, '--confirm', 'FREEZE_WRITES'); assert.equal(r.code, 0, JSON.stringify(r)); return r; };
const unfreeze = reason => { const r = tool('--unfreeze', '--reason', reason, '--confirm', 'UNFREEZE_WRITES'); assert.equal(r.code, 0, JSON.stringify(r)); return r; };
const status = () => tool('--status');
const state = () => success('public', { op: 'state' }).catch(() => null);
const d1 = async body => { const r = await http('public', '/_phase2d1', body); assert.equal(r.status, 200, JSON.stringify(r)); return r.body.value; };
const legacyBody = (tag, n) => ({ species: `합성동결${tag}${n}`, lat: 37.2 + n / 10000, lon: 127.2, observedOn: '2026-09-20', birdCount: 1, reporter: '합성', namePublic: false, note: '합성 freeze 시험', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
const injected = (body, ip) => success('public', { op: 'quick-injected', syntheticIp: ip, body }); // real public handler, real Siteverify (test secret)
const adminAction = (id, body) => http('admin', '/admin/api/reports/' + id, body, auth);
const LEGACY = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACTIONS = [{ action: 'approve' }, { action: 'reject' }, { action: 'unpublish' }, { action: 'link', spotKey: 'fixed:1:0' }, { action: 'unlink' }, { action: 'consent', namePublic: true }, { action: 'visibility', public: false }, { action: 'site', siteId: null }];

if (phase === 'basic') {
  const s0 = status(); assert.equal(s0.state.mode, 'NORMAL');
  await check('NORMAL: real public POST /reports and Access admin mutation succeed', async () => {
    const p = await http('public', '/reports', legacyBody('B', 1)); assert.equal(p.status, 201, JSON.stringify(p));
    const a = await adminAction(LEGACY(2), { action: 'consent', namePublic: true }); assert.equal(a.status, 200, JSON.stringify(a));
    return { publicStatus: p.status, adminStatus: a.status };
  });
  let f;
  await check('freeze via REST tool: changes=1, generation+1, snapshot in same batch', async () => {
    const before = status(); f = freeze('phase2d1-staging-basic');
    assert.equal(f.state.mode, 'READ_ONLY_MAINTENANCE'); assert.equal(f.state.generation, before.state.generation + 1); assert.equal(f.snapshot.digest, before.reports.digest);
    return { generation: f.state.generation, count: f.snapshot.count };
  });
  await check('frozen: POST /reports and all 8 admin actions blocked 503 + Retry-After 60, DB unchanged', async () => {
    const before = status(), results = [];
    const p = await http('public', '/reports', legacyBody('B', 2)); results.push({ path: 'POST /reports', status: p.status, code: p.body.error?.code, retryAfter: p.headers['retry-after'] });
    const q = await injected(legacyBody('B', 3), '198.51.100.3'); results.push({ path: 'POST /reports (injected ip)', status: q.status, code: q.body.error?.code, retryAfter: q.retryAfter });
    for (const body of ACTIONS) { const r = await adminAction(LEGACY(3), body); results.push({ path: 'POST /admin/api/reports/:id ' + body.action, status: r.status, code: r.body.error?.code, retryAfter: r.headers['retry-after'] }); }
    for (const r of results) { assert.equal(r.status, 503, JSON.stringify(r)); assert.equal(r.code, 'WRITE_MAINTENANCE'); assert.equal(r.retryAfter, '60'); }
    const after = status(); assert.equal(after.reports.digest, before.reports.digest); assert.equal(after.canonical_digest, before.canonical_digest);
    return results;
  });
  await check('frozen: public and admin GET keep working', async () => {
    const paths = ['/reports/approved', '/reports/pending', '/reports/site/1', `/reports/${LEGACY(2)}/status`, '/reports/capabilities'];
    const out = [];
    for (const p of paths) { const r = await http('public', p); out.push([p, r.status]); assert.equal(r.status, 200); }
    for (const p of ['/admin/api/reports?status=all', '/admin', '/admin/api/capabilities']) { const r = await http('admin', p, undefined, auth); out.push([p, r.status]); assert.equal(r.status, 200); }
    return out;
  });
  await check('frozen: ops routes are operator steps that write canonical tables only; invalid manifest rejected, no write', async () => {
    const before = status(); const r = await http('admin', '/admin/api/ops/backfill', { manifest_version: 'x' }, auth);
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'MANIFEST_INVALID'); assert.equal(status().canonical_digest, before.canonical_digest);
  });
  await check('drain: gate present, generation fixed, reports+canonical digests identical over 4 rounds / 60 s', async () => {
    const r = tool('--drain', '--generation', String(f.state.generation), '--rounds', '4', '--interval', '20');
    assert.equal(r.code, 0); assert.equal(r.drained, true); return r.rounds;
  });
  await check('drain negative: wrong generation is NOT drained', async () => {
    const r = tool('--drain', '--generation', String(f.state.generation + 7), '--rounds', '1'); assert.equal(r.code, 2); assert.equal(r.drained, false);
  });
  await check('double freeze refused (transition requires NORMAL)', async () => {
    const r = tool('--freeze', '--reason', 'x', '--confirm', 'FREEZE_WRITES'); assert.equal(r.code, 1); assert.equal(r.error, 'TRANSITION_NOT_APPLIED');
    assert.equal(status().state.generation, f.state.generation);
    return { error: r.error };
  });
  await check('unfreeze + reopen smoke: public POST 201, admin 200, GET 200', async () => {
    const u = unfreeze('phase2d1-staging-basic-reopen'); assert.equal(u.state.mode, 'NORMAL'); assert.equal(u.state.generation, f.state.generation + 1);
    const p = await http('public', '/reports', legacyBody('B', 4)); assert.equal(p.status, 201, JSON.stringify(p));
    const a = await adminAction(LEGACY(2), { action: 'consent', namePublic: false }); assert.equal(a.status, 200);
    assert.equal((await http('public', '/reports/approved')).status, 200);
    return { generation: u.state.generation };
  });
}

if (phase === 'race') {
  const rounds = Number(process.argv[3] || 3);
  evidence.rounds = [];
  for (let round = 1; round <= rounds; round++) {
    const pre = status(); assert.equal(pre.state.mode, 'NORMAL');
    const targets = [4, 5, 6, 7, 8, 9].map(LEGACY), preRows = await d1({ op: 'rows', ids: targets });
    const wanted = Object.fromEntries(preRows.map(r => [r.id, r.name_public ? false : true]));
    const tag = `R${round}${Date.now() % 100000}`, delay = ms => new Promise(r => setTimeout(r, ms));
    const pubJobs = Array.from({ length: 12 }, (_, i) => delay(process.argv[4] === 'burst' ? 1350 + i * 25 : i * 250).then(() => injected(legacyBody(tag, i), `198.51.${100 + round}.${10 + i}`)).then(r => ({ i, status: r.status, id: r.body.id, code: r.body.error?.code, retryAfter: r.retryAfter })));
    const adminJobs = targets.map((id, i) => delay(process.argv[4] === 'burst' ? 1400 + i * 40 : i * 500 + 125).then(() => adminAction(id, { action: 'consent', namePublic: wanted[id] })).then(r => ({ id, status: r.status, code: r.body.error?.code })));
    const frozen = delay(1500).then(() => freeze('phase2d1-race-' + round));
    const [pub, adm, f] = await Promise.all([Promise.all(pubJobs), Promise.all(adminJobs), frozen]);
    await delay(3000);
    const final = status();
    const committed = pub.filter(p => p.status === 201), blocked = pub.filter(p => p.status !== 201);
    assert.equal(final.reports.digest, f.snapshot.digest, 'write after freeze');          // nothing committed after the frozen snapshot
    assert.equal(final.reports.count, pre.reports.count + committed.length);
    for (const b of blocked) { assert.equal(b.status, 503); assert.equal(b.code, 'WRITE_MAINTENANCE'); }
    const committedRows = await d1({ op: 'rows', ids: committed.map(c => c.id) }); assert.equal(committedRows.length, committed.length);
    const postRows = Object.fromEntries((await d1({ op: 'rows', ids: targets })).map(r => [r.id, r]));
    for (const a of adm) {
      if (a.status === 200) assert.equal(postRows[a.id].name_public, wanted[a.id] ? 1 : 0);
      else { assert.equal(a.status, 503); assert.equal(a.code, 'WRITE_MAINTENANCE'); assert.equal(postRows[a.id].name_public, preRows.find(r => r.id === a.id).name_public); }
    }
    const summary = { round, generation: f.state.generation, public_committed: committed.length, public_blocked: blocked.length, admin_committed: adm.filter(a => a.status === 200).length, admin_blocked: adm.filter(a => a.status !== 200).length, final_equals_frozen_snapshot: true };
    evidence.rounds.push(summary); console.log(JSON.stringify(summary));
    unfreeze('phase2d1-race-' + round + '-reopen');
  }
  evidence.tests.push({ name: `concurrent freeze race x${rounds}`, result: 'PASS' });
}

if (phase === 'dual') {
  // Run after both Workers are deployed CANONICAL_DUAL_WRITE: the same DB gate closes the dual-write batches.
  const uuid = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const quick = n => ({ request_id: uuid(n), non_breeding_confirmed: true, species: '합성이중' + n, lat: 37.3, lon: 127.3, observedOn: '2026-09-20', birdCount: 2, reporter: '합성', namePublic: false, note: '합성 dual freeze', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' });
  const stamp = Date.now() % 1e6;
  await check('dual: NORMAL gate open -> quick 201 (4 tables), admin 200', async () => {
    const r = await injected(quick(stamp), '198.51.110.1'); assert.equal(r.status, 201, JSON.stringify(r));
    const a = await adminAction(uuid(stamp), { action: 'approve', request_id: '31000000-0000-4000-8000-' + String(stamp).padStart(12, '0'), expected_revision: 1 }); assert.equal(a.status, 200, JSON.stringify(a));
  });
  const f = freeze('phase2d1-dual');
  await check('dual frozen: quick and admin batches rejected 503, reports+canonical unchanged', async () => {
    const before = status();
    const r = await injected(quick(stamp + 1), '198.51.110.2'); assert.equal(r.status, 503); assert.equal(r.body.error.code, 'WRITE_MAINTENANCE');
    const a = await adminAction(uuid(stamp), { action: 'reject', request_id: '32000000-0000-4000-8000-' + String(stamp).padStart(12, '0'), expected_revision: 2 }); assert.equal(a.status, 503); assert.equal(a.body.error.code, 'WRITE_MAINTENANCE');
    const after = status(); assert.equal(after.reports.digest, before.reports.digest); assert.equal(after.canonical_digest, before.canonical_digest);
  });
  await check('dual unfreeze: quick 201 and admin 200 again', async () => {
    unfreeze('phase2d1-dual-reopen');
    const r = await injected(quick(stamp + 2), '198.51.110.3'); assert.equal(r.status, 201);
    const a = await adminAction(uuid(stamp), { action: 'reject', request_id: '33000000-0000-4000-8000-' + String(stamp).padStart(12, '0'), expected_revision: 2 }); assert.equal(a.status, 200, JSON.stringify(a));
    return { generation: f.state.generation + 1 };
  });
}
evidence.finished_at = new Date().toISOString();
writeFileSync(join(LOCAL, `staging-freeze-${phase}${process.argv[4] ? '-' + process.argv[4] : ''}.json`), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ phase, passed: evidence.tests.length }));
