// Explicit commands only. Importing this file cannot contact a remote service.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CloudflareAdapter, ROOT, localCheck } from './cloudflare.mjs';
import { bootstrapTrial, runTrial, recoverTrial, identity } from './core.mjs';

const PHRASES = { bootstrap: 'APPROVE_DISABLED_VWORLD_BOOTSTRAP', run: 'APPROVE_ONE_VWORLD_TRIAL', recover: 'DISABLE_VWORLD_TRIAL' };

export function safeFailure() {
  // No error objects, arbitrary message, URL, response, argv, env or traceback.
  process.stderr.write('{"event":"failed-details-suppressed","action":"verify-disabled-or-use-independent-recovery"}\n');
}

function markerPath(env) {
  if (!env.TRIAL_STATE_PATH) throw Error('STATE_PATH_REQUIRED');
  const path = resolve(env.TRIAL_STATE_PATH);
  if (path === ROOT || path.startsWith(ROOT + sep)) throw Error('STATE_OUTSIDE_SOURCE_REQUIRED');
  return path;
}

export async function main(mode, env = { ...process.env }) {
  if (mode === 'check') {
    const sha = env.APPROVED_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    localCheck(sha);
    process.stdout.write('{"event":"local-exact-source-tools-config-ok","remoteRequests":0}\n');
    return;
  }
  if (!['bootstrap', 'run', 'recover', 'bootstrap-recover'].includes(mode)) throw Error('EXPLICIT_MODE_REQUIRED');
  for (const key of ['NODE_OPTIONS', 'NODE_DEBUG', 'DEBUG']) if (env[key]) throw Error('DEBUG_FORBIDDEN');
  for (const key of ['ACTIONS_STEP_DEBUG', 'ACTIONS_RUNNER_DEBUG']) if (env[key] === 'true') throw Error('DEBUG_FORBIDDEN');
  if (env.RUNNER_DEBUG === '1') throw Error('DEBUG_FORBIDDEN');
  env.TRIAL_MODE = mode;
  identity(env.APPROVED_SHA, env.APPROVED_RUN_ID);
  let marker;
  if (mode === 'bootstrap-recover') {
    const path = markerPath(env);
    if (!existsSync(path)) return; // No mutation intent: do not create a target to recover.
    marker = JSON.parse(readFileSync(path, 'utf8'));
    if (marker.sha !== env.APPROVED_SHA || marker.runId !== env.APPROVED_RUN_ID || marker.stage !== 'bootstrap') throw Error('BOOTSTRAP_RECOVERY_MARKER_INVALID');
    if (marker.completed === true) return;
  } else if (env.APPROVAL_PHRASE !== PHRASES[mode]) throw Error('SEPARATE_APPROVAL_REQUIRED');
  if (mode === 'bootstrap' || mode === 'run') {
    const { validateWorkflowContext } = await import('../../.github/scripts/vworld_workflow_gate.mjs');
    await validateWorkflowContext(env, { stage: 'approved', mode });
  }
  const adapter = new CloudflareAdapter(env);
  const path = (mode === 'bootstrap' || mode === 'run' || mode === 'bootstrap-recover') ? markerPath(env) : null;
  let restored = false;
  const report = adapter.report.bind(adapter);
  adapter.report = event => { if (event === 'restored-503' || event === 'bootstrap-disabled-503') restored = true; report(event); };
  adapter.markMutation = async stage => {
    marker = { sha: env.APPROVED_SHA, runId: env.APPROVED_RUN_ID, stage, completed: false };
    writeFileSync(path, JSON.stringify(marker), { mode: 0o600, flag: 'wx' });
  };
  const cancel = () => adapter.cancel();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    if (mode === 'bootstrap') await bootstrapTrial(adapter, { sha: env.APPROVED_SHA, runId: env.APPROVED_RUN_ID });
    else if (mode === 'run') {
      const key = env.VWORLD_API_KEY;
      delete env.VWORLD_API_KEY; delete process.env.VWORLD_API_KEY;
      await runTrial(adapter, { sha: env.APPROVED_SHA, runId: env.APPROVED_RUN_ID, vworldKey: key });
    } else await recoverTrial(adapter, { sha: env.APPROVED_SHA, runId: env.APPROVED_RUN_ID });
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (path && marker && restored) writeFileSync(path, JSON.stringify({ ...marker, completed: true }), { mode: 0o600 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(() => { safeFailure(); process.exitCode = 1; });
}
