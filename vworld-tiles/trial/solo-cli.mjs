// solo-local-v1 operator commands. ONE operator, NO independent reviewer.
// Explicit commands only. Importing this file cannot contact a remote service.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { CloudflareAdapter, ROOT, localCheck } from './cloudflare.mjs';
import { safeFailure } from './cli.mjs';
import { validateSourceCI } from '../../.github/scripts/vworld_workflow_gate.mjs';
import { HARDWARE_KEY_TYPES, NAMESPACE, accountDigest, canonical, createApproval, parseSigner, validateApproval, verifyApprovalFile,
  soloBootstrap, soloHandoff, soloTrial, soloRecover, soloDrill } from './solo.mjs';

export const SIGNER_PATH = join(ROOT, 'vworld-tiles/trial/solo-signer.json');
const fail = code => { throw Error(code); };
const CREDENTIAL_NAMES = ['VWORLD_API_KEY', 'CF_CREATE_TOKEN', 'CF_EDIT_TOKEN', 'CF_READ_TOKEN'];
// Each stage gets only its own credentials; anything else present is refused.
export const STAGES = Object.freeze({
  bootstrap: { stage: 'bootstrap', mode: 'bootstrap', forbid: ['VWORLD_API_KEY', 'CF_EDIT_TOKEN'], ci: true },
  handoff: { stage: 'handoff', mode: 'recover', forbid: ['VWORLD_API_KEY', 'CF_READ_TOKEN'], ci: true },
  trial: { stage: 'secrets', mode: 'run', forbid: ['CF_CREATE_TOKEN'], ci: true },
  recover: { mode: 'recover', forbid: ['VWORLD_API_KEY', 'CF_CREATE_TOKEN', 'CF_READ_TOKEN'], ci: false },
  drill: { mode: 'recover', forbid: ['VWORLD_API_KEY', 'CF_CREATE_TOKEN', 'CF_READ_TOKEN'], ci: false }
});

export function assertSoloEnvironment(command, env, argv = process.argv) {
  if (!Object.hasOwn(STAGES, command)) fail('SOLO_EXPLICIT_COMMAND_REQUIRED');
  // Never inside Actions: this path must not be mistaken for the independent-approval workflow.
  if (env.GITHUB_ACTIONS === 'true' || env.CI === 'true') fail('SOLO_NOT_IN_CI');
  for (const key of ['NODE_OPTIONS', 'NODE_DEBUG', 'DEBUG']) if (env[key]) fail('DEBUG_FORBIDDEN');
  for (const key of STAGES[command].forbid) if (env[key]) fail('SOLO_CREDENTIAL_NOT_ALLOWED_IN_STAGE');
  for (const key of CREDENTIAL_NAMES) if (env[key] && argv.some(arg => arg.includes(env[key]))) fail('SOLO_CREDENTIAL_IN_ARGV');
}

/**
 * The committed signer policy (vworld-tiles/trial/solo-signer.json) names the key AND
 * its assurance, so a lower level is a reviewed decision in a new SHA, never a fallback:
 *   hardware-presence   : sk-ssh-ed25519 / sk-ecdsa (FIDO2 key or Windows Hello), touch/PIN per signature
 *   software-passphrase : ssh-ed25519 with a passphrase on this PC. Binds and detects tampering
 *                         only; it does NOT prove a human or resist malware on the same PC.
 */
export const ASSURANCES = ['hardware-presence', 'software-passphrase'];
export function loadSigner(path = SIGNER_PATH) {
  if (!existsSync(path)) fail('SOLO_SIGNER_NOT_REGISTERED');
  let policy;
  try { policy = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('SOLO_SIGNER_POLICY_INVALID'); }
  if (!policy || JSON.stringify(Object.keys(policy).sort()) !== '["assurance","publicKey"]' || !ASSURANCES.includes(policy.assurance)) fail('SOLO_SIGNER_POLICY_INVALID');
  const type = String(policy.publicKey).trim().split(/\s+/)[0];
  if (policy.assurance === 'hardware-presence' ? !HARDWARE_KEY_TYPES.has(type) : type !== 'ssh-ed25519') fail('SOLO_SIGNER_POLICY_MISMATCH');
  return { blob: parseSigner(policy.publicKey), assurance: policy.assurance, allowSoftwareKey: policy.assurance === 'software-passphrase' };
}

export function localLedger(directory) {
  if (!directory) fail('SOLO_STATE_DIR_REQUIRED');
  const dir = resolve(directory);
  if (dir === ROOT || dir.startsWith(ROOT + sep)) fail('SOLO_STATE_OUTSIDE_SOURCE_REQUIRED');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return async digest => {
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) fail('SOLO_APPROVAL_DIGEST_INVALID');
    try { writeFileSync(join(dir, digest + '.claimed'), JSON.stringify({ claimedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 }); }
    catch (error) { fail(error.code === 'EEXIST' ? 'SOLO_APPROVAL_ALREADY_USED_LOCALLY' : 'SOLO_LEDGER_WRITE_FAILED'); }
  };
}

const readApproval = path => ({ bytes: readFileSync(path), armored: readFileSync(path + '.sig', 'utf8') });
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const event = value => process.stdout.write(JSON.stringify(value) + '\n');

function args(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 2) {
    if (!/^--[a-z-]+$/.test(list[i] ?? '') || list[i + 1] === undefined) fail('SOLO_ARGUMENT_INVALID');
    out[list[i].slice(2)] = list[i + 1];
  }
  return out;
}

// Same PC: writes an UNSIGNED canonical approval for the operator to read, then sign
// with the registered key (see loadSigner for assurance levels). Contains no credential.
function approve(stage, options, env) {
  const o = args(options), now = new Date();
  if (!['bootstrap', 'handoff', 'secrets', 'activate'].includes(stage) || !o.out) fail('SOLO_ARGUMENT_INVALID');
  if (!/^[a-f0-9]{32}$/.test(env.CF_EXPECTED_ACCOUNT_ID ?? '')) fail('SOLO_ACCOUNT_REQUIRED');
  const approval = createApproval({ stage, sha: o.sha, accountId: env.CF_EXPECTED_ACCOUNT_ID, operationId: 'solo-' + randomUUID(),
    bootstrapOperationId: o['bootstrap-op'], parentOperationId: o['parent-op'], issuedAt: now.toISOString(),
    ttlMs: Number(o['ttl-minutes'] ?? 15) * 60000, windowStart: o['window-start'], windowMinutes: Number(o['window-minutes'] ?? 2),
    lastActivationAt: o['last-activation'] });
  validateApproval(approval, { sha: o.sha, accountSha256: accountDigest(env.CF_EXPECTED_ACCOUNT_ID), now: now.getTime() });
  writeFileSync(resolve(o.out), canonical(approval), { flag: 'wx', mode: 0o600 });
  const { accountSha256, nonce, ...summary } = approval;
  event({ event: 'approval-written-unsigned', ...summary,
    signWith: `ssh-keygen -Y sign -n ${NAMESPACE} -f <registered-key> ${o.out}` });
}

// Ctrl+C (signal) ends the wait at once so the finally path disables and checks 503.
export function readLine(deadline, signal, input = process.stdin) {
  const rl = createInterface({ input });
  process.stderr.write('{"event":"awaiting-signed-activation-approval-path"}\n');
  return new Promise((resolvePath, reject) => {
    // reject before close: rl.close() emits 'close' synchronously, which must not win.
    const stop = code => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(Error(code)); rl.close(); };
    const aborted = () => stop('SOLO_CANCELLED');
    const timer = setTimeout(() => stop('SOLO_ACTIVATION_APPROVAL_TIMEOUT'), Math.max(0, deadline - Date.now()));
    if (signal?.aborted) return aborted();
    signal?.addEventListener('abort', aborted, { once: true });
    rl.once('line', line => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolvePath(line.trim()); rl.close(); });
    rl.once('close', () => stop('SOLO_ACTIVATION_APPROVAL_TIMEOUT'));
  });
}

function accountGetter(env, fetchFn = fetch) {
  const tokens = { edit: env.CF_EDIT_TOKEN, create: env.CF_CREATE_TOKEN };
  return async (path, kind) => {
    if (!['/tokens/verify', '/d1/database', '/pages/projects'].includes(path) || !tokens[kind]) fail('SOLO_ACCOUNT_GET_INVALID');
    const response = await fetchFn('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + path, {
      method: 'GET', redirect: 'manual', headers: { Authorization: 'Bearer ' + tokens[kind] }, signal: AbortSignal.timeout(12000) });
    let value = {};
    try { value = JSON.parse(await response.text()); } catch { /* status alone decides */ }
    return { status: response.status, result: value?.result };
  };
}

export async function main(command, rest, env = { ...process.env }) {
  if (command === 'approve') return approve(rest[0], rest.slice(1), env);
  if (command === 'show') {
    const signer = loadSigner(), sha = head(), file = readApproval(rest[0]);
    const { approval } = verifyApprovalFile(file.bytes, file.armored, signer.blob, { sha, accountSha256: accountDigest(env.CF_EXPECTED_ACCOUNT_ID), ignoreExpiry: true }, signer);
    const { accountSha256, nonce, ...summary } = approval;
    return event({ event: 'approval-signature-ok', signerAssurance: signer.assurance, ...summary });
  }
  assertSoloEnvironment(command, env);
  const spec = STAGES[command], signer = loadSigner(), sha = head();
  localCheck(sha);
  const accountSha256 = accountDigest(env.CF_ACCOUNT_ID);
  const recovery = command === 'recover' || command === 'drill';
  const file = readApproval(rest[0]);
  const { approval, digest } = verifyApprovalFile(file.bytes, file.armored, signer.blob,
    { stage: spec.stage, sha, accountSha256, now: Date.now(), ignoreExpiry: recovery }, signer);
  process.stderr.write(JSON.stringify({ event: 'signer-assurance', assurance: signer.assurance }) + '\n');
  if (spec.ci) await validateSourceCI(sha);
  const op = approval.stage === 'activate' ? approval.parentOperationId : approval.operationId;
  const adapterEnv = { ...env, TRIAL_MODE: spec.mode, APPROVED_SHA: sha,
    APPROVED_RUN_ID: command === 'handoff' ? approval.bootstrapOperationId : op, APPROVED_BOOTSTRAP_RUN_ID: approval.bootstrapOperationId };
  delete adapterEnv.VWORLD_API_KEY;
  const adapter = new CloudflareAdapter(adapterEnv);
  const stopped = new AbortController(), cancel = () => { stopped.abort(); adapter.cancel(); };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (command === 'bootstrap') return await soloBootstrap(adapter, { approval, digest, claim: localLedger(env.SOLO_STATE_DIR) });
    if (command === 'handoff') {
      const reviewed = Buffer.from(env.CF_CREATE_TOKEN_SHA256 ?? '', 'hex'), actual = createHash('sha256').update(env.CF_CREATE_TOKEN ?? '').digest();
      if (!env.CF_CREATE_TOKEN || reviewed.length !== 32 || !timingSafeEqual(reviewed, actual)) fail('SOLO_CREATE_TOKEN_REVIEW_REQUIRED');
      return event(await soloHandoff(adapter, { approval, accountGet: accountGetter(env) }));
    }
    if (command === 'trial') {
      const key = env.VWORLD_API_KEY; delete env.VWORLD_API_KEY; delete process.env.VWORLD_API_KEY;
      return event(await soloTrial(adapter, { approval, digest, vworldKey: key, claim: localLedger(env.SOLO_STATE_DIR),
        readActivation: async deadline => readApproval(await readLine(deadline, stopped.signal)), recheckSource: () => validateSourceCI(sha),
        verifyActivation: (activation, now) => verifyApprovalFile(activation.bytes, activation.armored, signer.blob, { stage: 'activate', sha, accountSha256, now }, signer),
        announce: card => process.stderr.write(JSON.stringify(card) + '\n') }));
    }
    if (command === 'drill') return event(await soloDrill(adapter, { sha, op }));
    return event(await soloRecover(adapter, { approval, sleep }));
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv.slice(3)).catch(error => {
    // Only fixed SOLO_/stage codes are printed; never messages from responses or tools.
    if (/^SOLO_[A-Z_]+$/.test(error?.message ?? '')) process.stderr.write(JSON.stringify({ event: 'blocked', code: error.message }) + '\n');
    safeFailure(); process.exitCode = 1;
  });
}
