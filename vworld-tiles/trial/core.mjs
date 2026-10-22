// No network, credentials or files at import. All effects use the reviewed adapter.
import { randomBytes } from 'node:crypto';

export function identity(sha, runId) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[1-9][0-9]{0,19}$/.test(String(runId ?? ''))) throw Error('TRIAL_IDENTITY_INVALID');
}

async function closed(adapter, bootstrap = true, secretNames) {
  await adapter.verify({ enabled: false, bootstrap, secretNames });
  await adapter.probe({ x: 218, status: 503 });
}

// Recovery deliberately has no dependency on trial CI/expiry/namespace gates.
// It can only redeploy the same pinned source disabled, and must verify HTTP 503.
export async function recoverTrial(adapter, { sha, runId, preflight = true }) {
  identity(sha, runId);
  if (preflight) await adapter.preflight({ sha, runId, mode: 'recover' });
  await adapter.beginRecovery?.();
  await adapter.deploy({ enabled: false, bootstrap: true, phase: 'closed', create: false });
  await closed(adapter);
  adapter.report?.('restored-503');
  return { restored: true };
}

export async function bootstrapTrial(adapter, { sha, runId }) {
  identity(sha, runId);
  await adapter.preflight({ sha, runId, mode: 'bootstrap' });
  await adapter.audit({ allowTarget: false });
  await adapter.assertAbsent();
  let mutationAttempted = false;
  try {
    await adapter.markMutation?.('bootstrap');
    mutationAttempted = true; // Before deploy: a timeout does not prove no mutation.
    await adapter.deploy({ enabled: false, bootstrap: true, phase: 'bootstrap', create: true });
    await closed(adapter, true, []);
    adapter.report?.('bootstrap-disabled-503');
    return { restored: true };
  } catch {
    if (mutationAttempted) await recoverTrial(adapter, { sha, runId, preflight: false });
    throw Error('BOOTSTRAP_FAILED');
  }
}

export async function runTrial(adapter, { sha, runId, vworldKey, now = Date.now, randomBytesFn = randomBytes }) {
  identity(sha, runId);
  if (typeof vworldKey !== 'string' || !/^[A-Za-z0-9._~-]{8,256}$/.test(vworldKey)) throw Error('TRIAL_SECRET_INVALID');
  await adapter.preflight({ sha, runId, mode: 'run' });
  // Separate approved bootstrap is required. Never create with an editor token.
  await closed(adapter, true, []);
  await adapter.switchToEdit();
  const entropy = randomBytesFn(32);
  if (!(entropy instanceof Uint8Array) || entropy.length !== 32) throw Error('TRIAL_RANDOM_INVALID');
  let token = Buffer.from(entropy).toString('base64url');
  entropy.fill(0);
  let mutationAttempted = false, attemptedTiles = 0;
  try {
    await adapter.markMutation?.('run');
    mutationAttempted = true;
    // Consume the bootstrap before secret put. Closed/consumed metadata prevents reruns.
    await adapter.deploy({ enabled: false, bootstrap: true, phase: 'consumed', create: false });
    await closed(adapter, true, []);
    for (const [name, value, names] of [
      ['VWORLD_API_KEY', vworldKey, ['VWORLD_API_KEY']],
      ['TRIAL_ACCESS_TOKEN', token, ['TRIAL_ACCESS_TOKEN', 'VWORLD_API_KEY']]
    ]) {
      await adapter.verify({ enabled: false, bootstrap: true });
      await adapter.putSecret({ name, value }); // stdin only in the real adapter.
      await closed(adapter, true, names); // secret put itself deploys: assert false each time.
    }
    vworldKey = '';
    await adapter.deploy({ enabled: false, bootstrap: false, phase: 'consumed', create: false });
    await closed(adapter, false, ['TRIAL_ACCESS_TOKEN', 'VWORLD_API_KEY']);
    // Re-read ALL account scopes immediately before activation, never reuse old evidence.
    await adapter.audit({ allowTarget: true });
    const startMs = now();
    if (!Number.isSafeInteger(startMs)) throw Error('TRIAL_CLOCK_INVALID');
    const start = new Date(startMs).toISOString(), end = new Date(startMs + 600000).toISOString();
    await adapter.deploy({ enabled: true, bootstrap: false, phase: 'enabled', start, end, create: false });
    await adapter.verify({ enabled: true, bootstrap: false, start, end, secretNames: ['TRIAL_ACCESS_TOKEN', 'VWORLD_API_KEY'] });
    await adapter.probe({ x: 218, status: 403 }); // Valid tile, deliberately no token.
    for (const x of [218, 219, 220, 221]) {
      const time = now();
      if (!Number.isSafeInteger(time) || time < startMs || time >= startMs + 600000) throw Error('TRIAL_WINDOW_CLOSED');
      attemptedTiles++;
      await adapter.probe({ token, x, status: 200 }); // Sequential, exactly one attempt, first failure stops.
      adapter.report?.('tile-ok');
    }
    return { attemptedTiles, restored: true };
  } finally {
    token = ''; vworldKey = '';
    if (mutationAttempted) await recoverTrial(adapter, { sha, runId, preflight: false });
  }
}
