import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as ed25519Sign, createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTrial } from '../../vworld-tiles/trial/core.mjs';
import { HARDWARE_KEY_TYPE, ECDSA_SK_TYPE, NAMESPACE, recoveryCard, MAX_DRIFT_MS, accountDigest, canonical, createApproval, parseSigner, validateApproval,
  verifyApprovalFile, verifySshSignature, soloBootstrap, soloTrial, soloRecover, soloDrill, soloHandoff } from '../../vworld-tiles/trial/solo.mjs';
import { STAGES, assertSoloEnvironment, loadSigner, localLedger, readLine, SIGNER_PATH } from '../../vworld-tiles/trial/solo-cli.mjs';
import { handleTrialRequest } from '../../vworld-tiles/src/trial-worker.mjs';
import { PassThrough } from 'node:stream';
import { SHA, BOOT, RUN, TARGET, KEY, NOW, TOKEN, environment, fixture } from './vworld_synthetic_cloudflare.mjs';
import { validateSourceCI } from './vworld_workflow_gate.mjs';

// Synthetic only: generated keys, a simulated FIDO authenticator, the shared fake
// Cloudflare/Wrangler fixture. No real signer, account, credential, network or tile.
const ACCOUNT = '0'.repeat(32), ACCOUNT_SHA = accountDigest(ACCOUNT);
const iso = ms => new Date(ms).toISOString();
const soloId = () => 'solo-' + randomUUID();
const str = value => { const b = Buffer.from(value), n = Buffer.alloc(4); n.writeUInt32BE(b.length); return Buffer.concat([n, b]); };
const digest = (name, value) => createHash(name).update(value).digest();

function keypair(type = HARDWARE_KEY_TYPE) {
  if (type === ECDSA_SK_TYPE) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const q = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
    const blob = Buffer.concat([str(type), str('nistp256'), str(q), str('ssh:')]);
    return { privateKey, blob, type, line: `${type} ${blob.toString('base64')} synthetic-test-only\n` };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const blob = Buffer.concat([str(type), str(pk), ...(type === HARDWARE_KEY_TYPE ? [str('ssh:')] : [])]);
  return { privateKey, blob, type, line: `${type} ${blob.toString('base64')} synthetic-test-only\n` };
}
const mpint = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.subarray(i); return str(b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b); };
// Produces the same SSHSIG bytes as `ssh-keygen -Y sign`; for sk keys it plays the authenticator.
function sshSign(key, message, { namespace = NAMESPACE, flags = 0x01, hash = 'sha512' } = {}) {
  const signed = Buffer.concat([Buffer.from('SSHSIG'), str(namespace), str(''), str(hash), str(digest(hash, message))]);
  let sig;
  if (key.type === HARDWARE_KEY_TYPE || key.type === ECDSA_SK_TYPE) {
    const counter = Buffer.from([0, 0, 0, 7]);
    const data = Buffer.concat([digest('sha256', 'ssh:'), Buffer.from([flags]), counter, digest('sha256', signed)]);
    let raw;
    if (key.type === ECDSA_SK_TYPE) {
      const rs = ed25519Sign('sha256', data, { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
      raw = Buffer.concat([mpint(rs.subarray(0, 32)), mpint(rs.subarray(32))]);
    } else raw = ed25519Sign(null, data, key.privateKey);
    sig = Buffer.concat([str(key.type), str(raw), Buffer.from([flags]), counter]);
  } else sig = Buffer.concat([str(key.type), str(ed25519Sign(null, signed, key.privateKey))]);
  const blob = Buffer.concat([Buffer.from('SSHSIG'), Buffer.from([0, 0, 0, 1]), str(key.blob), str(namespace), str(''), str(hash), str(sig)]);
  return `-----BEGIN SSH SIGNATURE-----\n${blob.toString('base64').match(/.{1,70}/g).join('\n')}\n-----END SSH SIGNATURE-----\n`;
}
const SIGNER = keypair();
const signed = (approval, key = SIGNER, options) => { const bytes = Buffer.from(canonical(approval)); return { bytes, armored: sshSign(key, bytes, options) }; };
const verify = (file, expect = {}) => verifyApprovalFile(file.bytes, file.armored, SIGNER.blob, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW, ...expect });

const approval = (stage, extra = {}) => createApproval({ stage, sha: SHA, accountId: ACCOUNT, operationId: soloId(), issuedAt: iso(NOW), ...extra });
function activationFor(secrets, extra = {}) {
  return approval('activate', { bootstrapOperationId: secrets.bootstrapOperationId, parentOperationId: secrets.operationId,
    windowStart: iso(NOW + 60000), windowMinutes: 2, lastActivationAt: iso(NOW + 120000), ...extra });
}
const ledger = () => localLedger(mkdtempSync(join(tmpdir(), 'birdmap-solo-ledger-')));
const claimAll = () => { const used = []; return { used, claim: async d => { used.push(d); } }; };

// ---- Signature and approval binding --------------------------------------------------

test('a signature produced by the real ssh-keygen verifies (software key, test policy only)', { skip: !hasSshKeygen() }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'birdmap-solo-ssh-'));
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'synthetic', '-f', join(dir, 'k')], { stdio: 'ignore' });
  const bytes = Buffer.from(canonical(approval('bootstrap')));
  writeFileSync(join(dir, 'a.json'), bytes);
  execFileSync('ssh-keygen', ['-Y', 'sign', '-n', NAMESPACE, '-f', join(dir, 'k'), join(dir, 'a.json')], { stdio: 'ignore' });
  const blob = parseSigner(readFileSync(join(dir, 'k.pub'), 'utf8'));
  const armored = readFileSync(join(dir, 'a.json.sig'), 'utf8');
  verifySshSignature(bytes, armored, blob, { allowSoftwareKey: true });
  assert.throws(() => verifySshSignature(bytes, armored, blob), /SOLO_SIGNER_NOT_HARDWARE/);
});

// OpenSSH's own `-Y verify` was observed to accept an sk signature WITHOUT the user-presence
// flag, so touch enforcement must come from this verifier, not from ssh-keygen.
for (const type of [HARDWARE_KEY_TYPE, ECDSA_SK_TYPE]) test(`the real ssh-keygen accepts the simulated ${type} signature; only our verifier enforces user presence`, { skip: !hasSshKeygen() }, () => {
  const key = type === HARDWARE_KEY_TYPE ? SIGNER : keypair(ECDSA_SK_TYPE);
  const dir = mkdtempSync(join(tmpdir(), 'birdmap-solo-sk-'));
  const bytes = Buffer.from(canonical(approval('bootstrap')));
  writeFileSync(join(dir, 'a.json'), bytes); writeFileSync(join(dir, 'signers'), 'op ' + key.line);
  const run = flags => { writeFileSync(join(dir, 'a.sig'), sshSign(key, bytes, { flags }));
    try { execFileSync('ssh-keygen', ['-Y', 'verify', '-f', join(dir, 'signers'), '-I', 'op', '-n', NAMESPACE, '-s', join(dir, 'a.sig')], { input: bytes, stdio: ['pipe', 'ignore', 'ignore'] }); return true; } catch { return false; } };
  assert.equal(run(0x01), true);
  verifySshSignature(bytes, sshSign(key, bytes), key.blob);
  assert.throws(() => verifySshSignature(bytes, sshSign(key, bytes, { flags: 0 }), key.blob), /SOLO_SIGNATURE_NO_USER_PRESENCE/);
  const other = Buffer.from(bytes); other[0] ^= 1;
  assert.throws(() => verifySshSignature(other, sshSign(key, bytes), key.blob), /SOLO_SIGNATURE_INVALID/);
});

test('signature tampering, wrong key, wrong namespace and malformed armor are rejected', () => {
  const file = signed(approval('bootstrap'));
  verify(file);
  const tampered = Buffer.from(file.bytes); tampered[tampered.indexOf('bootstrap') + 1] ^= 1;
  assert.throws(() => verify({ ...file, bytes: tampered }), /SOLO_SIGNATURE_INVALID/);
  assert.throws(() => verify(signed(approval('bootstrap'), keypair())), /SOLO_SIGNER_NOT_PINNED/);
  assert.throws(() => verify(signed(approval('bootstrap'), SIGNER, { namespace: 'file' })), /SOLO_SIGNATURE_NAMESPACE/);
  assert.throws(() => verify({ ...file, armored: 'APPROVE' }), /SOLO_SIGNATURE_MALFORMED/);
  const software = keypair('ssh-ed25519'), bytes = Buffer.from(canonical(approval('bootstrap')));
  assert.throws(() => verifyApprovalFile(bytes, sshSign(software, bytes), software.blob, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_SIGNER_NOT_HARDWARE/);
});

test('approval text must be the exact canonical bytes that were signed', () => {
  const a = approval('bootstrap');
  for (const text of [JSON.stringify(a, null, 1), JSON.stringify(a) + '\n', canonical(a).replace('"pr":40', '"pr":40,"pr":40')]) {
    const bytes = Buffer.from(text);
    assert.throws(() => verifyApprovalFile(bytes, sshSign(SIGNER, bytes), SIGNER.blob, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_NOT_CANONICAL/);
  }
});

test('approval is bound to the full SHA, stage, account, operation IDs and its validity window', () => {
  const base = approval('bootstrap');
  assert.throws(() => validateApproval(base, { sha: 'b'.repeat(40), accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_SHA/);
  assert.throws(() => validateApproval({ ...base, sha: SHA.slice(0, 7) }, { sha: SHA.slice(0, 7), accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_SHA/);
  assert.throws(() => validateApproval(base, { stage: 'secrets', sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_STAGE/);
  assert.throws(() => validateApproval(base, { sha: SHA, accountSha256: accountDigest('1'.repeat(32)), now: NOW }), /SOLO_APPROVAL_ACCOUNT/);
  assert.throws(() => validateApproval({ ...base, operationId: RUN, bootstrapOperationId: RUN }, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_OPERATION/);
  assert.throws(() => validateApproval({ ...base, independentReviewer: true }, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_INVALID/);
  assert.throws(() => validateApproval({ ...base, extra: 1 }, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_FIELDS/);
  const { nonce, ...missing } = base;
  assert.throws(() => validateApproval(missing, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_FIELDS/);
  for (const now of [NOW - 120001, NOW + 15 * 60000, NaN]) assert.throws(() => validateApproval(base, { sha: SHA, accountSha256: ACCOUNT_SHA, now }), /SOLO_APPROVAL_EXPIRED/);
  validateApproval(base, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW - 120000 });
  assert.throws(() => validateApproval(approval('bootstrap', { ttlMs: 30 * 60000 + 1 }), { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_APPROVAL_TTL/);
  // Disable-only recovery ignores expiry but nothing else.
  validateApproval(base, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW + 86400000, ignoreExpiry: true });
  assert.throws(() => validateApproval(base, { sha: 'b'.repeat(40), accountSha256: ACCOUNT_SHA, ignoreExpiry: true }), /SOLO_APPROVAL_SHA/);
});

test('activation approval fixes an absolute window of at most 10 minutes, 4 tiles and zero retries', () => {
  const secrets = approval('secrets', { bootstrapOperationId: soloId() });
  const ok = activationFor(secrets);
  validateApproval(ok, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW });
  const check = (a, code) => assert.throws(() => validateApproval(a, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), code);
  check(activationFor(secrets, { windowMinutes: 11, lastActivationAt: iso(NOW + 120000) }), /SOLO_APPROVAL_WINDOW/);
  check(activationFor(secrets, { lastActivationAt: iso(NOW + 60000 + 90000) }), /SOLO_APPROVAL_WINDOW/); // inside last minute
  check(activationFor(secrets, { lastActivationAt: iso(NOW + 59000) }), /SOLO_APPROVAL_WINDOW/); // before start
  check({ ...ok, windowStart: ok.windowStart.replace('.000Z', 'Z') }, /SOLO_APPROVAL_WINDOW/);
  check({ ...ok, maxTiles: 5 }, /SOLO_APPROVAL_LIMITS/); check({ ...ok, retries: 1 }, /SOLO_APPROVAL_LIMITS/);
  check({ ...ok, parentOperationId: ok.bootstrapOperationId }, /SOLO_APPROVAL_OPERATION/);
});

// The operator explicitly chose a passphrase-protected software key (no FIDO2). Changing
// the key or its assurance must also change this pinned fingerprint in review.
test('the committed signer is the operator\'s software key at the explicit software-passphrase level', () => {
  assert.ok(SIGNER_PATH.endsWith(join('vworld-tiles', 'trial', 'solo-signer.json')));
  const signer = loadSigner();
  assert.equal(signer.assurance, 'software-passphrase');
  assert.equal(signer.allowSoftwareKey, true);
  assert.equal('SHA256:' + createHash('sha256').update(signer.blob).digest('base64').replace(/=+$/, ''), 'SHA256:79CPkn79g+rjRsujSY/0HjQSbkAdkSULkyLQ/izDYdI');
  assert.doesNotMatch(readFileSync(SIGNER_PATH, 'utf8'), /PRIVATE KEY|BEGIN OPENSSH/);
});

test('signer assurance is an explicit committed policy, never inferred or downgraded silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'birdmap-solo-signer-'));
  const policy = (name, value) => { writeFileSync(join(dir, name), JSON.stringify(value)); return loadSigner(join(dir, name)); };
  const soft = keypair('ssh-ed25519'), hello = keypair(ECDSA_SK_TYPE);
  assert.equal(policy('hw.json', { publicKey: SIGNER.line, assurance: 'hardware-presence' }).allowSoftwareKey, false);
  assert.equal(policy('hello.json', { publicKey: hello.line, assurance: 'hardware-presence' }).assurance, 'hardware-presence');
  const declared = policy('soft.json', { publicKey: soft.line, assurance: 'software-passphrase' });
  assert.equal(declared.allowSoftwareKey, true);
  // A software key cannot claim hardware assurance, and a hardware key cannot be weakened by mistake.
  assert.throws(() => policy('lie.json', { publicKey: soft.line, assurance: 'hardware-presence' }), /SOLO_SIGNER_POLICY_MISMATCH/);
  assert.throws(() => policy('mix.json', { publicKey: SIGNER.line, assurance: 'software-passphrase' }), /SOLO_SIGNER_POLICY_MISMATCH/);
  assert.throws(() => policy('bad.json', { publicKey: soft.line }), /SOLO_SIGNER_POLICY_INVALID/);
  assert.throws(() => policy('none.json', { publicKey: soft.line, assurance: 'none' }), /SOLO_SIGNER_POLICY_INVALID/);
  writeFileSync(join(dir, 'raw.pub'), SIGNER.line);
  assert.throws(() => loadSigner(join(dir, 'raw.pub')), /SOLO_SIGNER_POLICY_INVALID/);
  // Software signature: accepted only with the declared policy, still bound to SHA etc.
  const file = signed(approval('bootstrap'), soft);
  assert.throws(() => verifyApprovalFile(file.bytes, file.armored, soft.blob, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }), /SOLO_SIGNER_NOT_HARDWARE/);
  verifyApprovalFile(file.bytes, file.armored, declared.blob, { sha: SHA, accountSha256: ACCOUNT_SHA, now: NOW }, declared);
  assert.throws(() => verifyApprovalFile(file.bytes, file.armored, declared.blob, { sha: 'b'.repeat(40), accountSha256: ACCOUNT_SHA, now: NOW }, declared), /SOLO_APPROVAL_SHA/);
});

test('each stage refuses credentials that belong to another stage, CI and argv exposure', () => {
  const base = { CF_EDIT_TOKEN: 'SYNTHETIC_EDIT_TOKEN_ONLY_333' };
  assertSoloEnvironment('trial', { ...base, VWORLD_API_KEY: KEY, CF_READ_TOKEN: 'r' }, []);
  assert.throws(() => assertSoloEnvironment('bootstrap', { VWORLD_API_KEY: KEY }, []), /SOLO_CREDENTIAL_NOT_ALLOWED_IN_STAGE/);
  assert.throws(() => assertSoloEnvironment('bootstrap', base, []), /SOLO_CREDENTIAL_NOT_ALLOWED_IN_STAGE/);
  assert.throws(() => assertSoloEnvironment('trial', { ...base, CF_CREATE_TOKEN: 'c' }, []), /SOLO_CREDENTIAL_NOT_ALLOWED_IN_STAGE/);
  for (const command of ['recover', 'drill']) for (const name of ['VWORLD_API_KEY', 'CF_CREATE_TOKEN', 'CF_READ_TOKEN'])
    assert.throws(() => assertSoloEnvironment(command, { ...base, [name]: 'x' }, []), /SOLO_CREDENTIAL_NOT_ALLOWED_IN_STAGE/);
  assert.throws(() => assertSoloEnvironment('recover', { ...base, GITHUB_ACTIONS: 'true' }, []), /SOLO_NOT_IN_CI/);
  assert.throws(() => assertSoloEnvironment('recover', { ...base, NODE_OPTIONS: '--inspect' }, []), /DEBUG_FORBIDDEN/);
  assert.throws(() => assertSoloEnvironment('recover', base, ['node', 'solo-cli.mjs', base.CF_EDIT_TOKEN]), /SOLO_CREDENTIAL_IN_ARGV/);
  assert.throws(() => assertSoloEnvironment('enable', base, []), /SOLO_EXPLICIT_COMMAND_REQUIRED/);
  assert.deepEqual(Object.keys(STAGES).sort(), ['bootstrap', 'drill', 'handoff', 'recover', 'trial']); // no enable/activate command
});

test('local ledger is single-use per approval digest and must live outside the source tree', async () => {
  const claim = ledger(), d = 'f'.repeat(64);
  await claim(d); await assert.rejects(claim(d), /SOLO_APPROVAL_ALREADY_USED_LOCALLY/);
  await assert.rejects(claim('../x'), /SOLO_APPROVAL_DIGEST_INVALID/);
  assert.throws(() => localLedger(join(SIGNER_PATH, '..')), /SOLO_STATE_OUTSIDE_SOURCE_REQUIRED/);
  assert.throws(() => localLedger(''), /SOLO_STATE_DIR_REQUIRED/);
});

// ---- Stage orchestration through the real adapter and the synthetic fixture ---------

function solo(options = {}) {
  const f = fixture(options);
  const boot = approval('bootstrap'), secrets = approval('secrets', { bootstrapOperationId: boot.operationId });
  const extra = { APPROVED_BOOTSTRAP_RUN_ID: boot.operationId };
  const ctx = { f, boot, secrets, t: NOW, mono: NOW, /* equal advances = no drift */enabledDeploys: () => f.toolCalls.filter(c => c.enabled === 'true').length,
    authorized: 0, a: mode => f.adapter(mode, mode === 'bootstrap' ? boot.operationId : secrets.operationId, false, extra),
    b: (env = {}) => f.adapter('recover', secrets.operationId, true, { ...extra, ...env }) };
  ctx.bootstrap = () => soloBootstrap(ctx.a('bootstrap'), { approval: boot, digest: 'a'.repeat(64), claim: async () => {} });
  ctx.trial = (activation = activationFor(secrets), { claim = async () => {}, wait, adapter = ctx.a('run'), randomBytesFn = () => Buffer.alloc(32, 17) } = {}) =>
    soloTrial(adapter, { approval: secrets, digest: 'b'.repeat(64), vworldKey: KEY, claim, now: () => ctx.t, monotonic: () => ctx.mono,
      randomBytesFn,
      readActivation: async deadline => {
        ctx.deadline = deadline;
        if (wait) return wait();
        if (activation.windowStart) ctx.t = ctx.mono = Date.parse(activation.windowStart) + 1000; // operator signs and copies the file
        return signed(activation);
      },
      verifyActivation: (file, now) => verify(file, { stage: 'activate', now }) });
  ctx.recover = (a = secrets, env) => soloRecover(ctx.b(env), { approval: a, sleep: async () => {} });
  return ctx;
}
function disabled(ctx) {
  assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
  assert.equal(ctx.f.probes.at(-1).token, undefined);
  assert.equal(ctx.f.reports.at(-1), 'restored-503');
  assert.deepEqual(ctx.f.syntheticErrors, []);
}
const authorizedTiles = f => f.probes.filter(p => p.token).length;

test('solo bootstrap creates only a disabled secretless target, annotated with the solo operation', async () => {
  const ctx = solo(); await ctx.bootstrap();
  assert.equal(ctx.f.variables().TILES_ENABLED, 'false'); assert.equal(ctx.f.secrets.size, 0);
  assert.equal(ctx.f.currentVersion().annotations['workers/message'], `bm:${SHA}:bootstrap:${ctx.boot.operationId}`);
  assert.equal(ctx.f.toolCalls.length, 1); assert.equal(ctx.f.toolCalls[0].env.CLOUDFLARE_API_TOKEN, environment('bootstrap').CF_CREATE_TOKEN);
  assert.equal(ctx.f.reports.at(-1), 'bootstrap-disabled-503');
});

test('solo secrets + separately signed activation run 4 tiles in the approved absolute window, then restore 503', async () => {
  const ctx = solo(); await ctx.bootstrap();
  const activation = activationFor(ctx.secrets), claims = claimAll();
  assert.deepEqual(await ctx.trial(activation, { claim: claims.claim }), { attemptedTiles: 4, restored: true });
  disabled(ctx); assert.equal(authorizedTiles(ctx.f), 4); assert.equal(claims.used.length, 2);
  const enable = ctx.f.toolCalls.find(c => c.enabled === 'true');
  assert.ok(enable.args.includes('TRIAL_STARTS_AT:' + activation.windowStart) && enable.args.includes('TRIAL_EXPIRES_AT:' + activation.windowEnd));
  assert.ok(enable.args.includes(`bm:${SHA}:enabled:${ctx.secrets.operationId}`));
  assert.equal(ctx.deadline, Date.parse(ctx.secrets.expiresAt));
  // Secrets were supplied while false, each followed by 503 (shared fixture asserts false on secret put).
  assert.ok(ctx.f.toolCalls.filter(c => c.args[0] === 'secret').every(c => c.env.CLOUDFLARE_API_TOKEN === environment('run').CF_EDIT_TOKEN));
});

for (const [label, change, code] of [
  ['activation bound to another secrets operation', s => activationFor({ ...s, operationId: soloId() }), /SOLO_ACTIVATION_NOT_BOUND/],
  ['activation for another bootstrap', s => activationFor({ ...s, bootstrapOperationId: soloId() }), /SOLO_ACTIVATION_NOT_BOUND/],
  ['a secrets approval offered as activation', s => s, /SOLO_APPROVAL_STAGE/]
]) test(`${label} is refused; the target returns to false without ever enabling`, async () => {
  const ctx = solo(); await ctx.bootstrap();
  await assert.rejects(ctx.trial(change(ctx.secrets)), code);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0); assert.equal(authorizedTiles(ctx.f), 0);
});

test('source/CI recheck failing right before activation ends false with no activation', async () => {
  const ctx = solo(); await ctx.bootstrap(); const a = ctx.a('run'), activation = activationFor(ctx.secrets);
  await assert.rejects(soloTrial(a, { approval: ctx.secrets, digest: 'b'.repeat(64), vworldKey: KEY, claim: async () => {},
    now: () => ctx.t, monotonic: () => ctx.mono, randomBytesFn: () => Buffer.alloc(32, 17),
    readActivation: async () => { ctx.t = ctx.mono = Date.parse(activation.windowStart) + 1000; return signed(activation); },
    verifyActivation: (file, now) => verify(file, { stage: 'activate', now }),
    recheckSource: async () => { throw Error('VWORLD_GITHUB_GATE_DRAFT_PR_HEAD'); } }), /DRAFT_PR_HEAD/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0);
});

test('solo source gate requires the exact Draft PR head and a successful latest CI for that SHA', async () => {
  const pr = sha => ({ number: 40, state: 'open', draft: true, merged: false, head: { sha, ref: 'review/vworld-default-keyless-20261021', repo: { full_name: 'wooil1964/birdmap' } }, base: { ref: 'main', repo: { full_name: 'wooil1964/birdmap' } } });
  const runs = conclusion => ({ total_count: 1, workflow_runs: [{ id: 67, head_sha: SHA, event: 'pull_request', path: '.github/workflows/publication-security-ci.yml', status: 'completed', conclusion }] });
  const fake = (p, r) => async url => Response.json(url.includes('/pulls/40') ? p : r);
  await validateSourceCI(SHA, fake(pr(SHA), runs('success')));
  await assert.rejects(validateSourceCI(SHA, fake(pr('b'.repeat(40)), runs('success'))), /DRAFT_PR_HEAD/);
  await assert.rejects(validateSourceCI(SHA, fake(pr(SHA), runs('failure'))), /LATEST_CI/);
  await assert.rejects(validateSourceCI(SHA, async () => { throw Error('offline'); }), /PUBLIC_READ_UNAVAILABLE/);
});

test('activation approval that never arrives ends false with no activation', async () => {
  const ctx = solo(); await ctx.bootstrap();
  await assert.rejects(ctx.trial(undefined, { wait: async () => { throw Error('SOLO_ACTIVATION_APPROVAL_TIMEOUT'); } }), /TIMEOUT/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0); assert.equal(ctx.f.secrets.size, 2);
});

test('an activation approval presented after its last activation time is refused (no fresh window)', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets);
  await assert.rejects(ctx.trial(activation, { wait: async () => { ctx.t = ctx.mono = Date.parse(activation.lastActivationAt) + 1; return signed(activation); } }), /SOLO_APPROVAL_EXPIRED/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0);
});

test('activation before the approved start is refused rather than shifting the window', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets);
  await assert.rejects(ctx.trial(activation, { wait: async () => signed(activation) }), /TRIAL_WINDOW_CLOSED/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0);
});

test('a UTC clock jump against the monotonic clock aborts before the next write and restores', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets);
  await assert.rejects(ctx.trial(activation, { wait: async () => {
    ctx.mono = Date.parse(activation.windowStart) + 1000; ctx.t = ctx.mono + MAX_DRIFT_MS + 1; return signed(activation);
  } }), /SOLO_CLOCK_JUMP/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0);
});

test('same approval twice on one machine is refused by the local ledger before any write', async () => {
  const ctx = solo(); await ctx.bootstrap(); const claim = ledger();
  await ctx.trial(undefined, { claim }); const calls = ctx.f.toolCalls.length;
  await assert.rejects(ctx.trial(undefined, { claim }), /SOLO_APPROVAL_ALREADY_USED_LOCALLY/);
  assert.equal(ctx.f.toolCalls.length, calls);
});

test('after a restart with the local ledger lost, remote history still refuses reuse of past approvals', async () => {
  const ctx = solo(); await ctx.bootstrap();
  await assert.rejects(ctx.bootstrap()); // initial namespace audit / absence check refuses an existing target
  assert.equal(ctx.f.toolCalls.length, 1);
  // Process died while waiting for activation: token gone, history consumed.
  await assert.rejects(ctx.trial(undefined, { wait: async () => { throw Error('SYNTHETIC_PROCESS_LOST'); } }));
  const calls = ctx.f.toolCalls.length;
  await assert.rejects(ctx.trial(), /NOT_UNUSED_APPROVED_BOOTSTRAP|BOOTSTRAP_ALREADY_CONSUMED/);
  assert.equal(ctx.f.toolCalls.length, calls); assert.equal(ctx.enabledDeploys(), 0);
});

test('solo and GitHub-run identities cannot consume each other\'s bootstrap', async () => {
  const ctx = solo(); await ctx.bootstrap();
  const github = ctx.f.adapter('run', RUN, false, { APPROVED_BOOTSTRAP_RUN_ID: ctx.boot.operationId });
  await assert.rejects(runTrial(github, { sha: SHA, runId: RUN, vworldKey: KEY, now: () => NOW, randomBytesFn: () => Buffer.alloc(32, 17) }), /NOT_UNUSED_APPROVED_BOOTSTRAP/);
  const other = fixture();
  await (await import('../../vworld-tiles/trial/core.mjs')).bootstrapTrial(other.adapter('bootstrap', BOOT), { sha: SHA, runId: BOOT });
  const adapter = other.adapter('run', ctx.secrets.operationId, false, { APPROVED_BOOTSTRAP_RUN_ID: BOOT });
  await assert.rejects(soloTrial(adapter, { approval: ctx.secrets, digest: 'c'.repeat(64), vworldKey: KEY, claim: async () => {} }), /NOT_UNUSED_APPROVED_BOOTSTRAP/);
  assert.equal(ctx.f.toolCalls.length, 1); assert.equal(other.toolCalls.length, 1);
});

test('first failing tile stops without retry and the same SHA is redeployed false', async () => {
  const ctx = solo({ failTile: 2 }); await ctx.bootstrap();
  await assert.rejects(ctx.trial(), /PROBE_STATUS_FAILED/);
  disabled(ctx); assert.equal(authorizedTiles(ctx.f), 2);
});

test('network loss during secret supply: the run cannot finish its own recovery; PC recovery after reconnect restores', async () => {
  let down = false;
  const ctx = solo({ beforeTool: async call => { if (call.args[0] === 'secret') down = true; if (down) throw Error('SYNTHETIC_NETWORK_DOWN'); } });
  await ctx.bootstrap();
  await assert.rejects(ctx.trial());
  assert.notEqual(ctx.f.reports.at(-1), 'restored-503'); assert.equal(ctx.enabledDeploys(), 0);
  down = false; ctx.f.syntheticErrors.length = 0;
  const calls = ctx.f.toolCalls.length;
  const restore = ctx.f.adapter('recover', ctx.secrets.operationId, true, { APPROVED_BOOTSTRAP_RUN_ID: ctx.boot.operationId });
  // beforeTool still sees the network as down until reset; recovery runs after connectivity returns.
  const result = await soloRecover(restore, { approval: ctx.secrets, sleep: async () => {} });
  assert.equal(result.state, 'disabled-503'); assert.ok(ctx.f.toolCalls.length > calls); disabled(ctx);
});

// ---- PC-side recovery after a crash or restart (same PC) ---------------------------------

test('after the run was killed while enabled, PC recovery restores false without ledger, GitHub, key or account reader', async () => {
  const ctx = solo(); await ctx.bootstrap();
  ctx.f.secrets.set('VWORLD_API_KEY', KEY); ctx.f.secrets.set('TRIAL_ACCESS_TOKEN', TOKEN);
  ctx.f.snapshot({ enabled: true, start: iso(NOW), end: iso(NOW + 600000), message: `bm:${SHA}:enabled:${ctx.secrets.operationId}` });
  const tokenB = 'SYNTHETIC_PC_RECOVERY_EDITOR_444'; // re-issued token after restart
  const before = ctx.f.apiCalls.length, tools = ctx.f.toolCalls.length;
  const activation = activationFor(ctx.secrets);
  const result = await ctx.recover(activation, { CF_EDIT_TOKEN: tokenB, CF_EDIT_TOKEN_SHA256: createHash('sha256').update(tokenB).digest('hex') });
  assert.deepEqual(result, { state: 'disabled-503', neutralized: true, incident: false, writes: 2, executorQuiescence: 'unverified' });
  disabled(ctx); assert.notEqual(ctx.f.secrets.get('TRIAL_ACCESS_TOKEN'), TOKEN);
  assert.ok(ctx.f.apiCalls.slice(before).every(c => c.path.startsWith('/workers/scripts/' + TARGET + '/') && c.authorization === 'Bearer ' + tokenB));
  assert.ok(ctx.f.toolCalls.slice(tools).every(c => c.env.CLOUDFLARE_API_TOKEN === tokenB));
  assert.ok(ctx.f.toolCalls.slice(tools).every(c => c.enabled !== 'true'));
  assert.ok(!ctx.f.toolCalls.slice(tools).some(c => c.input.includes(TOKEN) || c.input.includes(KEY)));
});

test('recovery started while the run waits for activation fences it: it can never enable or write afterwards', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets); let after;
  await assert.rejects(ctx.trial(activation, { wait: async () => {
    assert.equal((await ctx.recover()).state, 'disabled-503'); after = ctx.f.toolCalls.length;
    ctx.t = ctx.mono = Date.parse(activation.windowStart) + 1000; return signed(activation);
  } }), /SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE/);
  assert.equal(ctx.f.toolCalls.length, after); // the old run made no write at all after the recovery
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0); assert.equal(authorizedTiles(ctx.f), 0);
});

test('a killed run\'s delayed activation landing after recovery is unusable and re-disabled', async () => {
  let release, recovery;
  const released = new Promise(resolve => { release = resolve; });
  const ctx = solo({ beforeTool: async call => {
    if (call.enabled === undefined && call.args.includes('TILES_ENABLED:true') && !recovery) {
      // The run's enable request is in flight (already past its fence). Recovery starts now.
      recovery = soloRecover(ctx.b(), { approval: ctx.secrets, sleep: async () => { release(); await new Promise(r => setTimeout(r, 5)); } });
      await released;
    }
  } });
  await ctx.bootstrap();
  await assert.rejects(ctx.trial(), /PROBE_STATUS_FAILED|REMOTE_|SOLO_/);
  const result = await recovery;
  assert.equal(result.state, 'disabled-503'); assert.equal(result.neutralized, true);
  assert.equal(ctx.enabledDeploys(), 1); // the delayed enable did land remotely ...
  assert.equal(ctx.f.probes.filter(p => p.token).length <= 1, true); // ... but A's token was already invalid
  assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
  const tokenProbes = ctx.f.probes.filter(p => p.token);
  assert.ok(tokenProbes.every(p => p.token !== ctx.f.secrets.get('TRIAL_ACCESS_TOKEN')));
});

test('recovery watch re-disables a re-enabled target and flags the incident', async () => {
  const ctx = solo(); await ctx.bootstrap(); let checks = 0;
  const result = await soloRecover(ctx.b(), { approval: ctx.secrets, sleep: async () => {
    if (checks++ === 0) ctx.f.snapshot({ enabled: true, start: iso(NOW), end: iso(NOW + 600000), message: `bm:${SHA}:enabled:${ctx.secrets.operationId}` });
  } });
  assert.equal(result.incident, true); disabled(ctx);
});

test('recovery watch gives up after bounded redeploys and never reports success', async () => {
  const ctx = solo(); await ctx.bootstrap();
  await assert.rejects(soloRecover(ctx.b(), { approval: ctx.secrets, maxRedeploys: 2, sleep: async () => {
    ctx.f.snapshot({ enabled: true, start: iso(NOW), end: iso(NOW + 600000), message: `bm:${SHA}:enabled:${ctx.secrets.operationId}` });
  } }), /SOLO_RECOVERY_UNCONFIRMED_REVOKE_EXECUTOR_TOKEN/);
});

test('recovery reports an absent target as absent-confirmed and never creates it', async () => {
  const ctx = solo();
  assert.deepEqual(await ctx.recover(), { state: 'absent-confirmed', writes: 0 });
  assert.equal(ctx.f.exists, false); assert.equal(ctx.f.toolCalls.length, 0);
});

test('PC recovery with an expired or phone-revoked token fails without claiming recovery', async () => {
  const ctx = solo(); await ctx.bootstrap(); const b = ctx.b(), original = b.fetch;
  b.fetch = async (url, init) => url.startsWith('https://api.cloudflare.com/') ? Response.json({ success: false }, { status: 401 }) : original(url, init);
  const before = ctx.f.reports.length;
  await assert.rejects(soloRecover(b, { approval: ctx.secrets, sleep: async () => {} }), /SOLO_RECOVERY_TARGET_UNREADABLE/);
  assert.equal(ctx.f.toolCalls.length, 1); assert.equal(ctx.f.reports.length, before);
});

test('recovery deploy success followed by a failed 503 check is not reported as recovered', async () => {
  const ctx = solo({ tileStatus: () => 200 }); await ctx.bootstrap().catch(() => {});
  const before = ctx.f.reports.filter(r => r === 'restored-503').length;
  await assert.rejects(ctx.recover(), /PROBE_/);
  assert.equal(ctx.f.reports.filter(r => r === 'restored-503').length, before);
});

test('recovery on a slow Cloudflare control plane still requires false and 503 before success', async () => {
  const ctx = solo({ beforeTool: () => new Promise(r => setTimeout(r, 30)) }); await ctx.bootstrap();
  assert.equal((await ctx.recover()).state, 'disabled-503'); disabled(ctx);
});

// Detection, not prevention: duplicates are not atomically excluded (no Cloudflare CAS).
// In this interleaving the token overwrite and the activation fence keep upstream 200s at 4.
test('two concurrent processes holding the same approval (separate ledgers) end false with at most 4 upstream tiles here', async () => {
  let upstream = 0;
  const ctx = solo({ tileStatus: ({ enabled, allowed }) => { const s = !enabled ? 503 : !allowed ? 403 : 200; if (s === 200) upstream++; return s; } });
  await ctx.bootstrap();
  const random = fill => () => Buffer.alloc(32, fill); // each real process draws its own token
  const results = await Promise.allSettled([ctx.trial(undefined, { randomBytesFn: random(17) }), ctx.trial(undefined, { randomBytesFn: random(18) })]);
  assert.ok(results.some(r => r.status === 'rejected'));
  assert.ok(upstream <= 4); assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
});

test('a second activation of the same operation is refused before its enable write', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets); let after;
  await assert.rejects(ctx.trial(activation, { wait: async () => {
    // Another process holding the same approval already enabled (and was disabled again).
    ctx.f.snapshot({ enabled: false, message: `bm:${SHA}:enabled:${ctx.secrets.operationId}` }); after = ctx.f.toolCalls.length;
    ctx.t = ctx.mono = Date.parse(activation.windowStart) + 1000; return signed(activation);
  } }), /SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE/);
  assert.equal(ctx.enabledDeploys(), 0); assert.equal(ctx.f.toolCalls.length, after); assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
});

// ---- P2 handoff and read-only drill -------------------------------------------------

function handoffFixture({ createActive = false, d1 = 403, pages = 403, scripts, expiresOn = '2026-10-29T00:00:00Z' } = {}) {
  const env = environment('recover');
  const ctx = solo({ accountApi: (path, init) => {
    if (path === '/tokens/verify') {
      const edit = init.headers.Authorization === 'Bearer ' + env.CF_EDIT_TOKEN;
      return Response.json({ success: true, result: { status: edit || createActive ? 'active' : 'disabled', ...(edit && expiresOn ? { expires_on: expiresOn } : {}) } }, { status: edit || createActive ? 200 : 401 });
    }
    return Response.json({ success: false }, { status: path === '/d1/database' ? d1 : pages });
  } });
  const handoff = approval('handoff', { bootstrapOperationId: ctx.boot.operationId });
  ctx.handoff = async () => {
    const a = ctx.f.adapter('recover', ctx.boot.operationId, true, { APPROVED_BOOTSTRAP_RUN_ID: ctx.boot.operationId });
    if (scripts) { const api = a.api.bind(a); a.api = async (p, t) => p === '/workers/scripts' ? { status: 200, success: true, result: scripts } : api(p, t); }
    const accountGet = async (path, kind) => {
      const token = kind === 'edit' ? env.CF_EDIT_TOKEN : env.CF_CREATE_TOKEN;
      const r = await a.fetch('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + path, { method: 'GET', redirect: 'manual', headers: { Authorization: 'Bearer ' + token } });
      return { status: r.status, result: (await r.json()).result };
    };
    return soloHandoff(a, { approval: handoff, accountGet, now: NOW });
  };
  return ctx;
}

test('handoff accepts a revoked creator and a target-only editor, with zero writes', async () => {
  const ctx = handoffFixture(); await ctx.bootstrap(); const calls = ctx.f.toolCalls.length;
  assert.deepEqual(await ctx.handoff(), { state: 'drill-disabled-503', writes: 0 });
  assert.equal(ctx.f.toolCalls.length, calls);
});
for (const [label, options, code] of [
  ['an still-active creation credential', { createActive: true }, /SOLO_CREATE_TOKEN_STILL_ACTIVE/],
  ['an editor that can read D1', { d1: 200 }, /SOLO_EDITOR_SCOPE_TOO_WIDE/],
  ['an editor that can read Pages', { pages: 200 }, /SOLO_EDITOR_SCOPE_TOO_WIDE/],
  ['an editor that lists other Workers', { scripts: [{ id: TARGET }, { id: 'birdmap-reports' }] }, /SOLO_EDITOR_SCOPE_TOO_WIDE/],
  ['a PC editor token without expiry', { expiresOn: null }, /SOLO_EDITOR_TOKEN_NOT_ACTIVE_WITH_SHORT_EXPIRY/],
  ['a PC editor token living longer than 7 days', { expiresOn: '2026-10-30T00:00:00Z' }, /SOLO_EDITOR_TOKEN_NOT_ACTIVE_WITH_SHORT_EXPIRY/]
]) test(`handoff refuses ${label}`, async () => {
  const ctx = handoffFixture(options); await ctx.bootstrap(); const calls = ctx.f.toolCalls.length;
  await assert.rejects(ctx.handoff(), code); assert.equal(ctx.f.toolCalls.length, calls);
});

test('read-only drill proves target access, false and 503 with no writes', async () => {
  const ctx = solo(); await ctx.bootstrap(); const calls = ctx.f.toolCalls.length;
  assert.deepEqual(await soloDrill(ctx.b(), { sha: SHA, op: ctx.secrets.operationId }), { state: 'drill-disabled-503', writes: 0 });
  assert.equal(ctx.f.toolCalls.length, calls);
});

// ---- Single PC + phone dashboard model --------------------------------------------------
// The phone's actions (revoke token, roll back / set false, open the URL) are modelled on the
// synthetic Cloudflare state. Real dashboard screens and behavior on a phone are unverified.

const bootstrapVersion = ctx => [...ctx.f.versions.values()].find(v => v.annotations['workers/message'] === `bm:${SHA}:bootstrap:${ctx.boot.operationId}`).id;
const phoneGet = (env, now, path = '/tiles/8/218/100.png') => handleTrialRequest(new Request('https://trial.invalid' + path), env,
  { nowMs: now, fetch: async () => { throw Error('must_not_fetch'); } }); // plain browser: no Origin, no token
const trialEnv = (enabled, start = iso(NOW), end = iso(NOW + 600000)) => ({ TILES_ENABLED: String(enabled), TRIAL_STARTS_AT: start, TRIAL_EXPIRES_AT: end,
  TRIAL_ACCESS_TOKEN: TOKEN, VWORLD_API_KEY: 'SYNTHETIC_WORKER_CREDENTIAL_ONLY',
  CLIENT_TILE_LIMITER: { async limit() { throw Error('must_not_limit'); } }, GLOBAL_TILE_LIMITER: { async limit() { throw Error('must_not_limit'); } } });

test('a plain phone browser can tell disabled (503 trial_disabled) from enabled (403) without any header', async () => {
  for (const [env, now, status, body] of [
    [trialEnv(false), NOW, 503, 'trial_disabled'],
    [trialEnv(true), NOW + 1000, 403, 'tiles_unavailable'],
    [trialEnv(true), NOW + 600000, 503, 'trial_disabled'], // window ended: closed by itself
    [trialEnv(true), NOW - 1, 503, 'trial_disabled']
  ]) {
    const r = await phoneGet(env, now);
    assert.equal(r.status, status); assert.equal(await r.text(), body); assert.equal(r.headers.get('Cache-Control'), 'no-store');
  }
  for (const path of ['/', '/tiles/8/0/0.png', '/anything']) assert.equal(await (await phoneGet(trialEnv(false), NOW, path)).text(), 'trial_disabled');
});

test('PC power loss mid-window: no client holds the token, and the Worker closes itself at windowEnd', async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets);
  // Simulate the process vanishing right after the enable deploy: no finally, no recovery.
  const a = ctx.a('run'), deploy = a.deploy.bind(a);
  a.deploy = async args => { await deploy(args); if (args.enabled === true) throw Object.assign(Error('SYNTHETIC_POWER_LOSS'), { powerLoss: true }); };
  a.beginRecovery = async () => { throw Error('SYNTHETIC_POWER_LOSS_NO_FINALLY'); };
  await assert.rejects(ctx.trial(activation, { adapter: a }));
  assert.equal(ctx.f.variables().TILES_ENABLED, 'true'); // left enabled
  const env = { ...trialEnv(true, activation.windowStart, activation.windowEnd), TRIAL_ACCESS_TOKEN: ctx.f.secrets.get('TRIAL_ACCESS_TOKEN') };
  // The only token copy was in the dead process; anyone else gets 403 and no upstream call.
  assert.equal((await phoneGet(env, Date.parse(activation.windowStart) + 5000)).status, 403);
  assert.equal(await (await phoneGet(env, Date.parse(activation.windowEnd))).text(), 'trial_disabled');
});

test('phone order matters: revoke the PC token first, then disable; a delayed PC deploy then cannot re-enable', async () => {
  let revoked = false, held;
  const ctx = solo({ beforeTool: async call => {
    if (call.args.includes('TILES_ENABLED:true') && !held) { held = new Promise(r => { ctx.landDelayed = r; }); await held; }
    if (revoked && call.env.CLOUDFLARE_API_TOKEN === environment('run').CF_EDIT_TOKEN) throw Error('SYNTHETIC_TOKEN_REVOKED');
  } });
  await ctx.bootstrap();
  const run = ctx.trial().catch(error => error);
  while (!ctx.landDelayed) await new Promise(r => setImmediate(r)); // the enable request is in flight
  revoked = true; // phone step 1: roll/delete the PC token
  ctx.f.rollbackTo(bootstrapVersion(ctx)); // phone step 2: dashboard Rollback (no annotation, no new version)
  ctx.landDelayed(); // the stale request finally arrives
  await run;
  assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
  assert.equal(await (await phoneGet(trialEnv(ctx.f.variables().TILES_ENABLED === 'true'), NOW)).text(), 'trial_disabled'); // phone step 3
});

test('without revocation first, a delayed PC deploy re-enables after the phone disabled (why the order is required)', async () => {
  let held;
  const ctx = solo({ beforeTool: async call => {
    if (call.args.includes('TILES_ENABLED:true') && !held) { held = new Promise(r => { ctx.landDelayed = r; }); await held; }
  } });
  await ctx.bootstrap();
  const a = ctx.a('run'); a.beginRecovery = async () => { throw Error('SYNTHETIC_PROCESS_GONE'); };
  const run = ctx.trial(undefined, { adapter: a }).catch(error => error);
  while (!ctx.landDelayed) await new Promise(r => setImmediate(r));
  ctx.f.rollbackTo(bootstrapVersion(ctx)); // phone disables only (the enable request is already in flight)
  ctx.landDelayed(); await run;
  assert.equal(ctx.f.variables().TILES_ENABLED, 'true'); // re-enabled by the stale request
});

for (const [label, phoneAction] of [
  ['dashboard Rollback to the bootstrap version', ctx => ctx.f.rollbackTo(bootstrapVersion(ctx))],
  ['dashboard TILES_ENABLED=false edit (new unannotated version)', ctx => ctx.f.snapshot({ enabled: false })]
]) test(`phone ${label} WITHOUT revoking the token: the live PC run neither enables nor writes over the phone`, async () => {
  const ctx = solo(); await ctx.bootstrap(); const activation = activationFor(ctx.secrets); let after, phoneVersion;
  await assert.rejects(ctx.trial(activation, { wait: async () => {
    phoneAction(ctx); after = ctx.f.toolCalls.length; phoneVersion = ctx.f.currentVersion().id;
    ctx.t = ctx.mono = Date.parse(activation.windowStart) + 1000; return signed(activation);
  } }), /SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE/);
  assert.equal(ctx.enabledDeploys(), 0); assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
  assert.equal(ctx.f.toolCalls.length, after); assert.equal(ctx.f.currentVersion().id, phoneVersion); // phone state kept
});

test('an out-of-band change between secret puts also stops the run before the next write', async () => {
  let after;
  const ctx = solo({ beforeTool: async call => { if (call.args[2] === 'VWORLD_API_KEY') queueMicrotask(() => { ctx.f.snapshot({ enabled: false }); after = ctx.f.toolCalls.length; }); } });
  await ctx.bootstrap();
  await assert.rejects(ctx.trial(), /SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE/);
  assert.equal(ctx.f.secrets.has('TRIAL_ACCESS_TOKEN'), false); assert.equal(ctx.enabledDeploys(), 0); assert.equal(ctx.f.toolCalls.length, after);
});

test('a phone disable during the tile phase is detected by the cleanup, which then makes no write', async () => {
  let phoneVersion;
  const ctx = solo({ tileStatus: ({ enabled, allowed }) => {
    if (enabled && allowed && !phoneVersion) { ctx.f.rollbackTo(bootstrapVersion(ctx)); phoneVersion = ctx.f.currentVersion().id; return 503; }
    return !enabled ? 503 : !allowed ? 403 : 200;
  } });
  await ctx.bootstrap(); const calls = () => ctx.f.toolCalls.length;
  const before = { calls: 0 };
  await assert.rejects(ctx.trial(undefined, { adapter: (() => { const a = ctx.a('run'); const d = a.deploy.bind(a); a.deploy = async x => { const r = await d(x); before.calls = calls(); return r; }; return a; })() }), /SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE/);
  assert.equal(calls(), before.calls); assert.equal(ctx.f.currentVersion().id, phoneVersion); assert.equal(ctx.f.variables().TILES_ENABLED, 'false');
});

test('a network failure (not a takeover) during the recovery read still lets cleanup disable', async () => {
  const ctx = solo({ failTile: 1 }); await ctx.bootstrap();
  const a = ctx.a('run'), list = a.versionList.bind(a); let failed = false;
  a.versionList = async () => { if (a.recovering === undefined && ctx.f.probes.some(p => p.token) && !failed) { failed = true; throw Error('SYNTHETIC_NETWORK_BLIP'); } return list(); };
  await assert.rejects(ctx.trial(undefined, { adapter: a }), /PROBE_STATUS_FAILED/);
  assert.equal(failed, true); disabled(ctx);
});

test('no upstream fetch and no limiter use when disabled, outside the window, or without the exact token', async () => {
  const fullHeaders = token => ({ Origin: 'https://wooil1964.github.io', 'CF-Connecting-IP': '203.0.113.7', ...(token ? { 'X-Birdmap-Trial-Token': token } : {}) });
  for (const [label, env, now, headers, status] of [
    ['disabled, valid token and origin', trialEnv(false), NOW + 1000, fullHeaders(TOKEN), 503],
    ['before start', trialEnv(true), NOW - 1, fullHeaders(TOKEN), 503],
    ['exactly at end', trialEnv(true), NOW + 600000, fullHeaders(TOKEN), 503],
    ['after end', trialEnv(true), NOW + 3600000, fullHeaders(TOKEN), 503],
    ['window longer than 10 minutes', trialEnv(true, iso(NOW), iso(NOW + 600001)), NOW + 1000, fullHeaders(TOKEN), 503],
    ['missing token', trialEnv(true), NOW + 1000, fullHeaders(), 403],
    ['wrong token', trialEnv(true), NOW + 1000, fullHeaders('x'.repeat(43)), 403],
    ['neutralized token (old token after recovery)', { ...trialEnv(true), TRIAL_ACCESS_TOKEN: 'y'.repeat(43) }, NOW + 1000, fullHeaders(TOKEN), 403],
    ['plain browser, disabled', trialEnv(false), NOW + 1000, {}, 503]
  ]) {
    let fetches = 0, limits = 0;
    const counted = { ...env, CLIENT_TILE_LIMITER: { async limit() { limits++; return { success: true }; } }, GLOBAL_TILE_LIMITER: { async limit() { limits++; return { success: true }; } } };
    const r = await handleTrialRequest(new Request('https://trial.invalid/tiles/8/218/100.png', { headers }), counted, { nowMs: now, fetch: async () => { fetches++; throw Error('x'); } });
    assert.equal(r.status, status, label); assert.equal(fetches, 0, label); assert.equal(limits, 0, label);
  }
});

test('Preview/version URLs switched on: drill, recovery and a new trial all refuse to report the target as safe', async () => {
  const subdomain = { enabled: true, previews_enabled: false };
  const ctx = solo({ subdomain }); await ctx.bootstrap();
  subdomain.previews_enabled = true; // e.g. changed in the dashboard; a version URL could then be reachable
  await assert.rejects(soloDrill(ctx.b(), { sha: SHA, op: ctx.secrets.operationId }), /REMOTE_PREVIEW_NOT_DISABLED/);
  const restored = ctx.f.reports.filter(r => r === 'restored-503').length;
  await assert.rejects(ctx.recover(), /REMOTE_PREVIEW_NOT_DISABLED/);
  assert.equal(ctx.f.reports.filter(r => r === 'restored-503').length, restored);
  const fresh = { enabled: true, previews_enabled: false }, other = solo({ subdomain: fresh }); await other.bootstrap();
  fresh.previews_enabled = true;
  await assert.rejects(other.trial(), /REMOTE_PREVIEW_NOT_DISABLED/); assert.equal(other.enabledDeploys(), 0);
  assert.equal(other.f.toolCalls.length, 1); // refused before its first write
});

test('workers.dev switched off from the phone: the PC cannot confirm 503 and never claims recovery', async () => {
  const subdomain = { enabled: true, previews_enabled: false };
  const ctx = solo({ subdomain }); await ctx.bootstrap();
  subdomain.enabled = false; // the switch alone is not proof that every path is closed
  await assert.rejects(soloDrill(ctx.b(), { sha: SHA, op: ctx.secrets.operationId }), /REMOTE_PREVIEW_NOT_DISABLED/);
  const restored = ctx.f.reports.filter(r => r === 'restored-503').length;
  await assert.rejects(ctx.recover());
  assert.equal(ctx.f.reports.filter(r => r === 'restored-503').length, restored);
});

test('every version of the trial code itself needs the exact token inside the window (defence if a version URL is reachable)', async () => {
  // An old "enabled" version reached through a version URL after its window: closed, no upstream.
  let fetches = 0;
  const env = { ...trialEnv(true), CLIENT_TILE_LIMITER: { async limit() { return { success: true }; } }, GLOBAL_TILE_LIMITER: { async limit() { return { success: true }; } } };
  for (const now of [NOW + 600000, NOW + 86400000]) {
    const r = await handleTrialRequest(new Request('https://version.invalid/tiles/8/218/100.png', { headers: { Origin: 'https://wooil1964.github.io', 'CF-Connecting-IP': '203.0.113.7', 'X-Birdmap-Trial-Token': TOKEN } }), env, { nowMs: now, fetch: async () => { fetches++; } });
    assert.equal(r.status, 503); assert.equal(await r.text(), 'trial_disabled');
  }
  assert.equal(fetches, 0);
});

test('the activation prints a phone recovery card with no secret, account or host', () => {
  const card = recoveryCard(activationFor(approval('secrets', { bootstrapOperationId: soloId() })));
  assert.equal(card.expectAfterRecovery, 'trial_disabled'); assert.equal(card.steps[0], 'revoke-or-roll-the-PC-worker-editor-token');
  assert.doesNotMatch(JSON.stringify(card), /workers\.dev\/|[a-f0-9]{32}|TOKEN_ONLY|KEY/);
});

test('Ctrl+C while waiting for the activation approval ends the wait immediately', async () => {
  const input = new PassThrough(), stop = new AbortController();
  const waiting = readLine(Date.now() + 60000, stop.signal, input);
  stop.abort(); await assert.rejects(waiting, /SOLO_CANCELLED/);
  const next = new PassThrough(), got = readLine(Date.now() + 60000, undefined, next);
  next.write('approval.json\n'); assert.equal(await got, 'approval.json');
  await assert.rejects(readLine(Date.now() + 20, undefined, new PassThrough()), /SOLO_ACTIVATION_APPROVAL_TIMEOUT/);
});

test('Ctrl+C during the activation wait still disables and confirms 503', async () => {
  const ctx = solo(); await ctx.bootstrap();
  await assert.rejects(ctx.trial(undefined, { wait: async () => { throw Error('SOLO_CANCELLED'); } }), /SOLO_CANCELLED/);
  disabled(ctx); assert.equal(ctx.enabledDeploys(), 0);
});

test('solo sources keep secrets out of output and never touch D1, Pages or other Workers', () => {
  for (const file of ['solo.mjs', 'solo-cli.mjs']) {
    const source = readFileSync(new URL('../../vworld-tiles/trial/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.(log|error)|process\.env\.(CF_|VWORLD)[A-Z_]*\s*\)/);
    assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
    assert.doesNotMatch(source, /birdmap-reports|wrangler d1|pages deploy/);
  }
  assert.deepEqual(readdirSync(new URL('../../vworld-tiles/trial/', import.meta.url)).filter(n => n.includes('signer')), ['solo-signer.json']);
});

function hasSshKeygen() {
  try { execFileSync('ssh-keygen', ['-Y', 'sign'], { stdio: 'ignore' }); return true; }
  catch (error) { return error.status !== undefined && error.code !== 'ENOENT'; }
}
