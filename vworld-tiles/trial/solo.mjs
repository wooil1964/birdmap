// solo-local-v1: ONE operator, NO independent reviewer. This is a separate path from
// the GitHub independent-approval workflow and is never evidence for it.
// No network, credentials or files at import. All effects are injected by solo-cli.mjs.
import { createHash, createPublicKey, verify as ed25519Verify, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { bootstrapTrial, runTrial, recoverTrial, identity } from './core.mjs';
import { TARGET } from './cloudflare.mjs';
import { REPOSITORY, BRANCH } from '../../.github/scripts/vworld_workflow_gate.mjs';

export const NAMESPACE = 'birdmap-vworld-solo-approval-v1';
export const HARDWARE_KEY_TYPE = 'sk-ssh-ed25519@openssh.com';
export const MAX_TTL_MS = 30 * 60000;
export const SKEW_MS = 120000; // Allowed A/B clock difference against issuedAt only.
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

function parseKeyBlob(blob) {
  const r = reader(blob), type = r.string().toString('latin1'), pk = r.string();
  if (pk.length !== 32) fail('SOLO_SIGNER_KEY_INVALID');
  const application = type === HARDWARE_KEY_TYPE ? r.string() : null;
  if (!['ssh-ed25519', HARDWARE_KEY_TYPE].includes(type) || !r.done()) fail('SOLO_SIGNER_KEY_INVALID');
  return { type, pk, application };
}

// One OpenSSH public key line, pinned in the reviewed source (vworld-tiles/trial/solo-signer.pub).
export function parseSigner(line) {
  const [type, base64] = String(line ?? '').trim().split(/\s+/);
  const blob = Buffer.from(base64 ?? '', 'base64');
  if (!type || parseKeyBlob(blob).type !== type) fail('SOLO_SIGNER_KEY_INVALID');
  return blob;
}

/**
 * Verifies an armored SSHSIG over exact message bytes for the pinned key.
 * Production policy requires a FIDO hardware key (sk-ssh-ed25519) whose signature
 * asserts user presence (a physical touch). allowSoftwareKey exists ONLY for
 * synthetic tests; solo-cli.mjs never sets it, so a software key blocks execution.
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
  if (key.type !== HARDWARE_KEY_TYPE && !allowSoftwareKey) fail('SOLO_SIGNER_NOT_HARDWARE');
  const s = reader(sigBlob);
  if (s.string().toString('latin1') !== key.type) fail('SOLO_SIGNATURE_MALFORMED');
  const signature = s.string();
  const signed = Buffer.concat([Buffer.from('SSHSIG'), sshString(namespace), sshString(reserved), sshString(Buffer.from(hashName)),
    sshString(createHash(hashName).update(message).digest())]);
  let data = signed;
  if (key.type === HARDWARE_KEY_TYPE) {
    const flags = s.take(1)[0], counter = s.take(4);
    if (!(flags & 0x01)) fail('SOLO_SIGNATURE_NO_USER_PRESENCE');
    data = Buffer.concat([sha256(key.application), Buffer.from([flags]), counter, sha256(signed)]);
  }
  if (!s.done() || signature.length !== 64) fail('SOLO_SIGNATURE_MALFORMED');
  const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key.pk.toString('base64url') }, format: 'jwk' });
  if (!ed25519Verify(null, data, publicKey, signature)) fail('SOLO_SIGNATURE_INVALID');
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
export async function soloTrial(adapter, { approval, digest, vworldKey, claim, readActivation, verifyActivation, recheckSource, now = Date.now,
  monotonic = () => performance.now(), randomBytesFn = randomBytes }) {
  const { sha, operationId: op, bootstrapOperationId: boot } = approval;
  identity(sha, op);
  if (approval.stage !== 'secrets') fail('SOLO_APPROVAL_STAGE');
  const clock = clockGuard(now, monotonic), window = {};
  let deadline = Date.parse(approval.expiresAt);
  guardWrites(adapter, async args => {
    if (clock() >= deadline) fail('SOLO_APPROVAL_EXPIRED');
    await assertNotFenced(adapter, sha, new Set([boot, op]), { activating: args.enabled === true });
  });
  await claim(digest);
  return runTrial(adapter, { sha, runId: op, vworldKey, now: clock, randomBytesFn, window, beforeActivation: async () => {
    const verified = verifyActivation(await readActivation(deadline), clock()), activation = verified.approval;
    if (activation.stage !== 'activate' || activation.parentOperationId !== op || activation.bootstrapOperationId !== boot || activation.sha !== sha) fail('SOLO_ACTIVATION_NOT_BOUND');
    await claim(verified.digest);
    await recheckSource?.(); // exact Draft PR head and its CI again, right before activation
    Object.assign(window, { start: activation.windowStart, end: activation.windowEnd, lastActivation: activation.lastActivationAt });
    deadline = Date.parse(activation.lastActivationAt);
  } });
}

// P2: read-only proof of the narrowed state. No writes. Probes show denied READS on
// D1/Pages; they cannot prove absence of every write permission (policy review does).
export async function soloHandoff(adapter, { approval, accountGet }) {
  identity(approval.sha, approval.bootstrapOperationId);
  if (approval.stage !== 'handoff') fail('SOLO_APPROVAL_STAGE');
  const edit = await accountGet('/tokens/verify', 'edit');
  // A non-expiring executor credential is refused: expiry bounds a lost or stale token.
  if (edit.status !== 200 || edit.result?.status !== 'active' || !Number.isFinite(Date.parse(edit.result?.expires_on))) fail('SOLO_EDITOR_TOKEN_NOT_ACTIVE_WITH_EXPIRY');
  const create = await accountGet('/tokens/verify', 'create');
  if (create.status === 200 && create.result?.status === 'active') fail('SOLO_CREATE_TOKEN_STILL_ACTIVE');
  for (const path of ['/d1/database', '/pages/projects']) if ((await accountGet(path, 'edit')).status === 200) fail('SOLO_EDITOR_SCOPE_TOO_WIDE');
  const list = await adapter.api('/workers/scripts', adapter.writeToken);
  if (list.status === 200 && (!Array.isArray(list.result) || list.result.some(script => script?.id !== TARGET))) fail('SOLO_EDITOR_SCOPE_TOO_WIDE');
  return soloDrill(adapter, { sha: approval.sha, op: approval.bootstrapOperationId, secretNames: [] });
}

// Read-only recovery drill (computer B, or A after handoff). Never writes.
export async function soloDrill(adapter, { sha, op, secretNames }) {
  identity(sha, op);
  await adapter.preflight({ sha, runId: op, mode: 'recover' });
  adapter.recovering = true;
  await adapter.sourceOwnership();
  await adapter.verify({ enabled: false, bootstrap: true, secretNames });
  await adapter.probe({ x: 218, status: 503 });
  return { state: 'drill-disabled-503', writes: 0 };
}

// ---- External recovery (computer B) -------------------------------------------------
/**
 * Disable-only recovery from B's own copy of a signed approval plus remote state.
 * Needs no GitHub, CI, VWorld key, account-wide reader or A's local files.
 * 1. absent target: report absent-confirmed, never create.
 * 2. redeploy the same SHA false (fences A's later writes) and verify 503.
 * 3. overwrite TRIAL_ACCESS_TOKEN with a discarded random value: a delayed
 *    activation from A can no longer be used with A's token.
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
  // Takeover is complete only after the operator revokes A's executor credential.
  return { state: 'disabled-503', neutralized, incident, writes: 1 + Number(neutralized) + redeploys, executorQuiescence: 'unverified' };
}
