// solo-local-v1: ONE operator, NO independent reviewer. This is a separate path from
// the GitHub independent-approval workflow and is never evidence for it.
// No network, credentials or files at import. All effects are injected by solo-cli.mjs.
import { createHash, createPublicKey, verify as cryptoVerify, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { bootstrapTrial, runTrial, recoverTrial, identity } from './core.mjs';
import { TARGET } from './cloudflare.mjs';
import { REPOSITORY, BRANCH } from '../../.github/scripts/vworld_workflow_gate.mjs';

export const NAMESPACE = 'birdmap-vworld-solo-approval-v1';
export const HARDWARE_KEY_TYPE = 'sk-ssh-ed25519@openssh.com';
export const MAX_TTL_MS = 30 * 60000;
export const SKEW_MS = 120000; // Allowed clock difference against issuedAt only.
export const MAX_DRIFT_MS = 2000; // UTC vs monotonic divergence inside one process.
const SOLO_ID = /^solo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMON = ['accountSha256', 'bootstrapOperationId', 'branch', 'expiresAt', 'independentReviewer', 'issuedAt', 'mode',
  'nonce', 'operationId', 'pr', 'recovery', 'repository', 'schema', 'sha', 'stage', 'target'];
const EXTRA = { bootstrap: [], handoff: [], secrets: [],
  activate: ['lastActivationAt', 'maxTiles', 'parentOperationId', 'retries', 'windowEnd', 'windowStart'] };
const fail = code => { throw Error(code); };
const sha256 = data => createHash('sha256').update(data).digest();
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  new Date(Date.parse(value)).toISOString() === value ? Date.parse(value) : NaN;

export const canonical = approval => JSON.stringify(Object.fromEntries(Object.keys(approval).sort().map(k => [k, approval[k]]))) + '\n';
export const accountDigest = accountId => sha256(String(accountId)).toString('hex');

// ---- OpenSSH SSHSIG (ssh-keygen -Y sign) verification -------------------------
function reader(buffer) {
  let pos = 0;
  const take = n => { if (n > buffer.length - pos) fail('SOLO_SIGNATURE_MALFORMED'); return buffer.subarray(pos, pos += n); };
  return { take, u32: () => take(4).readUInt32BE(0), string() { return take(this.u32()); }, done: () => pos === buffer.length };
}
const sshString = bytes => { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); return Buffer.concat([length, bytes]); };

// sk-ecdsa is what Windows Hello (platform authenticator) can produce through Windows
// OpenSSH; most FIDO2 keys support both. Whether THIS PC's Windows Hello works is unverified.
export const ECDSA_SK_TYPE = 'sk-ecdsa-sha2-nistp256@openssh.com';
export const HARDWARE_KEY_TYPES = new Set([HARDWARE_KEY_TYPE, ECDSA_SK_TYPE]);

function parseKeyBlob(blob) {
  const r = reader(blob), type = r.string().toString('latin1');
  let key;
  if (type === ECDSA_SK_TYPE) {
    const curve = r.string().toString('latin1'), q = r.string();
    if (curve !== 'nistp256' || q.length !== 65 || q[0] !== 4) fail('SOLO_SIGNER_KEY_INVALID');
    key = { type, publicKey: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: q.subarray(1, 33).toString('base64url'), y: q.subarray(33).toString('base64url') }, format: 'jwk' }) };
  } else if (type === 'ssh-ed25519' || type === HARDWARE_KEY_TYPE) {
    const pk = r.string();
    if (pk.length !== 32) fail('SOLO_SIGNER_KEY_INVALID');
    key = { type, publicKey: createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pk.toString('base64url') }, format: 'jwk' }) };
  } else fail('SOLO_SIGNER_KEY_INVALID');
  if (HARDWARE_KEY_TYPES.has(type)) key.application = r.string();
  if (!r.done()) fail('SOLO_SIGNER_KEY_INVALID');
  return key;
}

// One OpenSSH public key line, pinned in the reviewed source (see solo-cli.mjs loadSigner).
export function parseSigner(line) {
  const [type, base64] = String(line ?? '').trim().split(/\s+/);
  const blob = Buffer.from(base64 ?? '', 'base64');
  if (!type || parseKeyBlob(blob).type !== type) fail('SOLO_SIGNER_KEY_INVALID');
  return blob;
}

// SSH mpint pair (r, s) -> 64-byte IEEE P1363 for node's ECDSA verify.
function ecdsaSignature(blob) {
  const r = reader(blob), part = () => {
    const v = r.string();
    if (v.length > 33 || (v.length === 33 && v[0] !== 0)) fail('SOLO_SIGNATURE_MALFORMED');
    const out = Buffer.alloc(32); v.subarray(-32).copy(out, 32 - Math.min(32, v.length)); return out;
  };
  const out = Buffer.concat([part(), part()]);
  if (!r.done()) fail('SOLO_SIGNATURE_MALFORMED');
  return out;
}

/**
 * Verifies an armored SSHSIG over exact message bytes for the pinned key.
 * Hardware (sk-*) keys must assert user presence (touch/PIN gesture). Software keys
 * are accepted only with allowSoftwareKey, which solo-cli.mjs sets solely when the
 * committed signer policy explicitly declares the lower "software-passphrase" level.
 */
export function verifySshSignature(message, armored, signerBlob, { allowSoftwareKey = false } = {}) {
  const body = String(armored ?? '').replace(/\r/g, '').trim();
  const match = /^-----BEGIN SSH SIGNATURE-----\n([A-Za-z0-9+/=\n]+)\n-----END SSH SIGNATURE-----$/.exec(body);
  if (!match) fail('SOLO_SIGNATURE_MALFORMED');
  const r = reader(Buffer.from(match[1].replace(/\n/g, ''), 'base64'));
  if (r.take(6).toString('latin1') !== 'SSHSIG' || r.u32() !== 1) fail('SOLO_SIGNATURE_MALFORMED');
  const keyBlob = r.string(), namespace = r.string(), reserved = r.string(), hashName = r.string().toString('latin1'), sigBlob = r.string();
  if (!r.done()) fail('SOLO_SIGNATURE_MALFORMED');
  if (!Buffer.isBuffer(signerBlob) || !keyBlob.equals(signerBlob)) fail('SOLO_SIGNER_NOT_PINNED');
  if (namespace.toString('latin1') !== NAMESPACE) fail('SOLO_SIGNATURE_NAMESPACE');
  if (!['sha256', 'sha512'].includes(hashName)) fail('SOLO_SIGNATURE_MALFORMED');
  const key = parseKeyBlob(keyBlob);
  const hardware = HARDWARE_KEY_TYPES.has(key.type);
  if (!hardware && !allowSoftwareKey) fail('SOLO_SIGNER_NOT_HARDWARE');
  const s = reader(sigBlob);
  if (s.string().toString('latin1') !== key.type) fail('SOLO_SIGNATURE_MALFORMED');
  let signature = s.string();
  const signed = Buffer.concat([Buffer.from('SSHSIG'), sshString(namespace), sshString(reserved), sshString(Buffer.from(hashName)),
    sshString(createHash(hashName).update(message).digest())]);
  let data = signed;
  if (hardware) {
    const flags = s.take(1)[0], counter = s.take(4);
    if (!(flags & 0x01)) fail('SOLO_SIGNATURE_NO_USER_PRESENCE');
    data = Buffer.concat([sha256(key.application), Buffer.from([flags]), counter, sha256(signed)]);
  }
  if (!s.done()) fail('SOLO_SIGNATURE_MALFORMED');
  let valid;
  if (key.type === ECDSA_SK_TYPE) valid = cryptoVerify('sha256', data, { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, ecdsaSignature(signature));
  else valid = signature.length === 64 && cryptoVerify(null, data, key.publicKey, signature);
  if (!valid) fail('SOLO_SIGNATURE_INVALID');
}

// ---- Approval record ----------------------------------------------------------
export function createApproval({ stage, sha, accountId, operationId, bootstrapOperationId, parentOperationId,
  issuedAt, ttlMs = 15 * 60000, windowStart, windowMinutes = 2, lastActivationAt, nonce = randomBytes(32).toString('hex') }) {
  const approval = { schema: 'birdmap-vworld-solo-approval/v1', mode: 'solo-local-v1', independentReviewer: false,
    repository: REPOSITORY, pr: 40, branch: BRANCH, sha, target: TARGET, accountSha256: accountDigest(accountId),
    stage, operationId, bootstrapOperationId: stage === 'bootstrap' ? operationId : bootstrapOperationId,
    issuedAt, expiresAt: new Date(Date.parse(issuedAt) + ttlMs).toISOString(), nonce, recovery: 'disable-only' };
  if (stage === 'activate') {
    const start = Date.parse(windowStart);
    Object.assign(approval, { parentOperationId, windowStart, windowEnd: new Date(start + windowMinutes * 60000).toISOString(),
      lastActivationAt, expiresAt: lastActivationAt, maxTiles: 4, retries: 0 });
  }
  return approval;
}

/**
 * Checks content binding: exact SHA, stage, operation IDs, account and validity.
 * ignoreExpiry is only for disable-only recovery, which must never be blocked by
 * an expired normal-execution approval.
 */
export function validateApproval(approval, { stage, sha, accountSha256, now, ignoreExpiry = false }) {
  const a = approval;
  if (!a || typeof a !== 'object' || Array.isArray(a) || !Object.hasOwn(EXTRA, a.stage)) fail('SOLO_APPROVAL_INVALID');
  if (stage !== undefined && a.stage !== stage) fail('SOLO_APPROVAL_STAGE');
  const keys = [...COMMON, ...EXTRA[a.stage]].sort();
  if (JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(keys)) fail('SOLO_APPROVAL_FIELDS');
  if (a.schema !== 'birdmap-vworld-solo-approval/v1' || a.mode !== 'solo-local-v1' || a.independentReviewer !== false ||
      a.repository !== REPOSITORY || a.pr !== 40 || a.branch !== BRANCH || a.target !== TARGET || a.recovery !== 'disable-only' ||
      !/^[a-f0-9]{64}$/.test(a.nonce) || !/^[a-f0-9]{64}$/.test(a.accountSha256)) fail('SOLO_APPROVAL_INVALID');
  if (!/^[a-f0-9]{40}$/.test(a.sha ?? '') || a.sha !== sha) fail('SOLO_APPROVAL_SHA');
  if (a.accountSha256 !== accountSha256) fail('SOLO_APPROVAL_ACCOUNT');
  if (!SOLO_ID.test(a.operationId) || !SOLO_ID.test(a.bootstrapOperationId) ||
      (a.stage === 'bootstrap') !== (a.operationId === a.bootstrapOperationId)) fail('SOLO_APPROVAL_OPERATION');
  const issued = iso(a.issuedAt), expires = iso(a.expiresAt);
  if (!(expires > issued && expires - issued <= MAX_TTL_MS)) fail('SOLO_APPROVAL_TTL');
  if (a.stage === 'activate') {
    const start = iso(a.windowStart), end = iso(a.windowEnd), last = iso(a.lastActivationAt);
    if (!SOLO_ID.test(a.parentOperationId) || new Set([a.operationId, a.parentOperationId, a.bootstrapOperationId]).size !== 3) fail('SOLO_APPROVAL_OPERATION');
    if (!(end - start > 0 && end - start <= 600000 && last >= start && last <= end - 60000 && expires === last)) fail('SOLO_APPROVAL_WINDOW');
    if (a.maxTiles !== 4 || a.retries !== 0) fail('SOLO_APPROVAL_LIMITS');
  }
  if (!ignoreExpiry && !(Number.isSafeInteger(now) && now >= issued - SKEW_MS && now < expires)) fail('SOLO_APPROVAL_EXPIRED');
  return a;
}

// Signature first, then exact canonical bytes, then content. Returns the replay digest.
export function verifyApprovalFile(bytes, armored, signerBlob, expect, policy) {
  verifySshSignature(bytes, armored, signerBlob, policy);
  let approval;
  try { approval = JSON.parse(bytes.toString('utf8')); } catch { fail('SOLO_APPROVAL_INVALID'); }
  if (!approval || typeof approval !== 'object' || canonical(approval) !== bytes.toString('utf8')) fail('SOLO_APPROVAL_NOT_CANONICAL');
  return { approval: validateApproval(approval, expect), digest: sha256(bytes).toString('hex') };
}

// ---- Execution guards ------------------------------------------------------------
export function clockGuard(now = Date.now, monotonic = () => performance.now()) {
  const t0 = now(), m0 = monotonic();
  return () => {
    const t = now();
    if (!Number.isSafeInteger(t) || !Number.isSafeInteger(t0) || Math.abs((t - t0) - (monotonic() - m0)) > MAX_DRIFT_MS) fail('SOLO_CLOCK_JUMP');
    return t;
  };
}

// Remote fence: any disable-only recovery (closed) or a foreign operation in the
// target's retained history stops every later non-recovery write. This is a check
// before each write, not an atomic Cloudflare compare-and-swap.
// activating: an operation may enable at most once; a duplicate process holding the
// same approval that already enabled is detected here (check-then-act, not atomic).
export async function assertNotFenced(adapter, sha, allowed, { activating = false } = {}) {
  for (const item of await adapter.versionList()) {
    const v = await adapter.get(`/workers/scripts/${TARGET}/versions/${encodeURIComponent(item.id)}`);
    const message = v.annotations?.['workers/message'];
    if (!message) continue; // secret put versions may carry no annotations
    const [, source, phase, id] = /^bm:([a-f0-9]{40}):([a-z]+):(.+)$/.exec(message) ?? [];
    if (source !== sha || v.annotations['workers/tag'] !== 'bm-' + sha || !allowed.has(id)) fail('SOLO_FOREIGN_HISTORY');
    if (phase === 'closed') fail('SOLO_FENCED_BY_RECOVERY');
    if (activating && phase === 'enabled') fail('SOLO_ALREADY_ACTIVATED');
  }
}

// Out-of-band change detector. Between two of our own writes exactly one new version (ours)
// may appear, and the active deployment must be that newest version. A dashboard variable
// edit (extra, unannotated version) or a dashboard Rollback (older version made active) stops
// every later write. Still check-then-act: a write already in flight is not covered.
export function outOfBandGuard(adapter) {
  let known = null, active = null;
  return async () => {
    const ids = (await adapter.versionList()).map(item => item.id);
    const current = (await adapter.activeVersion()).id;
    if (known) {
      const added = ids.filter(id => !known.has(id));
      if (added.length > 1 || current !== (added[0] ?? active)) fail('SOLO_OUT_OF_BAND_CHANGE');
    }
    known = new Set(ids); active = current;
  };
}

function guardWrites(adapter, guard) {
  for (const name of ['deploy', 'putSecret']) {
    const original = adapter[name].bind(adapter);
    // Recovery writes (closed/false) are never blocked by a guard.
    adapter[name] = async args => { if (!adapter.recovering && args.phase !== 'closed') await guard(args); return original(args); };
  }
}

// ---- Stages (operator computer A) ----------------------------------------------------
export async function soloBootstrap(adapter, { approval, digest, claim }) {
  identity(approval.sha, approval.operationId);
  if (approval.stage !== 'bootstrap') fail('SOLO_APPROVAL_STAGE');
  await claim(digest); // local single-use; remote absence check is the cross-machine guarantee
  return bootstrapTrial(adapter, { sha: approval.sha, runId: approval.operationId });
}

/**
 * P3 + P4 in ONE process. Secrets are supplied while false; the trial token lives only
 * in this process. Activation needs a second signed approval read while waiting. A
 * restart loses the token and the remote history is already consumed, so a past
 * approval can never resume or activate. Every exit path redeploys false and checks 503.
 */
// The single-PC fail-safe: if this PC dies at any point, the trial token dies with this
// process (no client can authorize a tile) and the Worker answers 503 by itself after
// the approved windowEnd. The phone card below is for restoring the clean disabled state.
export function recoveryCard(activation) {
  return { event: 'phone-recovery-card', target: TARGET, checkPath: '/tiles/8/218/100.png',
    expectAfterRecovery: 'trial_disabled', windowStart: activation.windowStart, windowEnd: activation.windowEnd,
    steps: ['revoke-or-roll-the-PC-worker-editor-token', 'deployments-rollback-to-a-bm-bootstrap-or-bm-consumed-version(both-false)-or-set-TILES_ENABLED-false-and-deploy',
      'open-checkPath-on-workers.dev-expect-trial_disabled', 'recheck-after-5-minutes'] };
}

export async function soloTrial(adapter, { approval, digest, vworldKey, claim, readActivation, verifyActivation, recheckSource, announce, now = Date.now,
  monotonic = () => performance.now(), randomBytesFn = randomBytes }) {
  const { sha, operationId: op, bootstrapOperationId: boot } = approval;
  identity(sha, op);
  if (approval.stage !== 'secrets') fail('SOLO_APPROVAL_STAGE');
  const clock = clockGuard(now, monotonic), window = {};
  let deadline = Date.parse(approval.expiresAt);
  const outOfBand = outOfBandGuard(adapter);
  // Once anyone else changed the target (phone Rollback/variable edit, a recover run, a
  // duplicate process), this run never writes again, not even its own false cleanup: a
  // Wrangler deploy would override the operator and re-enable a workers.dev route the
  // phone turned off. A failing read (e.g. network) does not count; cleanup then proceeds.
  let takenOver = false;
  const detect = async check => {
    try { await check(); }
    catch (error) { if (['SOLO_OUT_OF_BAND_CHANGE', 'SOLO_FENCED_BY_RECOVERY', 'SOLO_FOREIGN_HISTORY', 'SOLO_ALREADY_ACTIVATED'].includes(error.message)) takenOver = true; throw error; }
  };
  guardWrites(adapter, async args => {
    if (clock() >= deadline) fail('SOLO_APPROVAL_EXPIRED');
    await detect(() => assertNotFenced(adapter, sha, new Set([boot, op]), { activating: args.enabled === true }));
    await detect(outOfBand);
  });
  const beginRecovery = adapter.beginRecovery.bind(adapter);
  adapter.beginRecovery = async () => {
    if (!takenOver) await detect(outOfBand).catch(() => {});
    if (takenOver) fail('SOLO_OPERATOR_TOOK_OVER_NO_PC_WRITE');
    return beginRecovery();
  };
  await claim(digest);
  return runTrial(adapter, { sha, runId: op, vworldKey, now: clock, randomBytesFn, window, beforeActivation: async () => {
    const verified = verifyActivation(await readActivation(deadline), clock()), activation = verified.approval;
    if (activation.stage !== 'activate' || activation.parentOperationId !== op || activation.bootstrapOperationId !== boot || activation.sha !== sha) fail('SOLO_ACTIVATION_NOT_BOUND');
    await claim(verified.digest);
    await recheckSource?.(); // exact Draft PR head and its CI again, right before activation
    await announce?.(recoveryCard(activation));
    Object.assign(window, { start: activation.windowStart, end: activation.windowEnd, lastActivation: activation.lastActivationAt });
    deadline = Date.parse(activation.lastActivationAt);
  } });
}

// P2: read-only proof of the narrowed state. No writes. Probes show denied READS on
// D1/Pages; they cannot prove absence of every write permission (policy review does).
export const MAX_EDITOR_TOKEN_LIFETIME_MS = 7 * 86400000;
export async function soloHandoff(adapter, { approval, accountGet, now = Date.now() }) {
  identity(approval.sha, approval.bootstrapOperationId);
  if (approval.stage !== 'handoff') fail('SOLO_APPROVAL_STAGE');
  const edit = await accountGet('/tokens/verify', 'edit');
  // A forgotten PC token must die on its own: require an expiry within 7 days.
  const expires = Date.parse(edit.result?.expires_on);
  if (edit.status !== 200 || edit.result?.status !== 'active' || !(expires > now && expires - now <= MAX_EDITOR_TOKEN_LIFETIME_MS)) fail('SOLO_EDITOR_TOKEN_NOT_ACTIVE_WITH_SHORT_EXPIRY');
  const create = await accountGet('/tokens/verify', 'create');
  if (create.status === 200 && create.result?.status === 'active') fail('SOLO_CREATE_TOKEN_STILL_ACTIVE');
  for (const path of ['/d1/database', '/pages/projects']) if ((await accountGet(path, 'edit')).status === 200) fail('SOLO_EDITOR_SCOPE_TOO_WIDE');
  const list = await adapter.api('/workers/scripts', adapter.writeToken);
  if (list.status === 200 && (!Array.isArray(list.result) || list.result.some(script => script?.id !== TARGET))) fail('SOLO_EDITOR_SCOPE_TOO_WIDE');
  return soloDrill(adapter, { sha: approval.sha, op: approval.bootstrapOperationId, secretNames: [] });
}

// Read-only recovery drill on the same PC after handoff. Never writes.
export async function soloDrill(adapter, { sha, op, secretNames }) {
  identity(sha, op);
  await adapter.preflight({ sha, runId: op, mode: 'recover' });
  adapter.recovering = true;
  await adapter.sourceOwnership();
  await adapter.verify({ enabled: false, bootstrap: true, secretNames });
  await adapter.probe({ x: 218, status: 503 });
  return { state: 'drill-disabled-503', writes: 0 };
}

// ---- Optional PC-side recovery (the primary emergency path is the phone dashboard) ----
/**
 * Disable-only recovery after a crash/restart of the SAME PC, from the signed approval
 * plus remote state. Needs no GitHub, CI, VWorld key, account-wide reader or ledger.
 * Impossible once the PC token was revoked from the phone, which is intended.
 * 1. absent target: report absent-confirmed, never create.
 * 2. redeploy the same SHA false (fences the dead process's later writes) and verify 503.
 * 3. overwrite TRIAL_ACCESS_TOKEN with a discarded random value: a delayed activation
 *    from an orphaned Wrangler child can no longer be used with the old token.
 * 4. watch: re-verify; any re-enable is disabled again (bounded) and is an incident.
 */
export async function soloRecover(adapter, { approval, sleep, watchChecks = 3, watchIntervalMs = 10000, maxRedeploys = 2, randomBytesFn = randomBytes }) {
  const sha = approval.sha, op = approval.stage === 'activate' ? approval.parentOperationId : approval.operationId;
  identity(sha, op);
  const probe = await adapter.api(`/workers/scripts/${TARGET}/settings`, adapter.writeToken);
  if (probe.status === 404) return { state: 'absent-confirmed', writes: 0 };
  if (probe.status !== 200 || !probe.success) fail('SOLO_RECOVERY_TARGET_UNREADABLE');
  await recoverTrial(adapter, { sha, runId: op });
  let neutralized = false;
  const bindings = (await adapter.get(`/workers/scripts/${TARGET}/settings`)).bindings;
  if (Array.isArray(bindings) && bindings.some(b => b.type === 'secret_text' && b.name === 'TRIAL_ACCESS_TOKEN')) {
    const entropy = randomBytesFn(32);
    await adapter.putSecret({ name: 'TRIAL_ACCESS_TOKEN', value: Buffer.from(entropy).toString('base64url') });
    entropy.fill(0); neutralized = true;
    await adapter.verify({ enabled: false, bootstrap: true });
    await adapter.probe({ x: 218, status: 503 });
  }
  let incident = false, redeploys = 0;
  for (let check = 0; check < watchChecks; check++) {
    await sleep(watchIntervalMs);
    try { await adapter.verify({ enabled: false, bootstrap: true }); await adapter.probe({ x: 218, status: 503 }); }
    catch {
      incident = true;
      if (++redeploys > maxRedeploys) fail('SOLO_RECOVERY_UNCONFIRMED_REVOKE_EXECUTOR_TOKEN');
      await recoverTrial(adapter, { sha, runId: op, preflight: false });
      check = -1; // a re-disable restarts the full watch
    }
  }
  // 503 here does not prove A has stopped: an in-flight A request can still land later.
  // Recovery is final only after the operator revokes the PC's Editor token (phone).
  return { state: 'disabled-503', neutralized, incident, writes: 1 + Number(neutralized) + redeploys, executorQuiescence: 'unverified' };
}
