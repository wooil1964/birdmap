// Temporary server-to-server trial only. The normal map client has no trial
// credential. No storage, logging, deployment automation or new service binding.
import { handleRequest } from './worker.mjs';

const MAX_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url.

// 503 'trial_disabled' answers ANY request (no Origin needed), so a plain phone browser
// can confirm the closed state; 403 keeps the generic body.
function denied(status) {
  return new Response(status === 503 ? 'trial_disabled' : 'tiles_unavailable', { status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }});
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
}

function tokenMatches(actual, expected) {
  if (typeof expected !== 'string' || !TOKEN_PATTERN.test(expected) ||
      typeof actual !== 'string' || !TOKEN_PATTERN.test(actual)) return false;
  let different = 0;
  for (let i = 0; i < 43; i++) different |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}

export async function handleTrialRequest(request, env, testDependencies = {}) {
  if (env.TILES_ENABLED !== 'true') return denied(503);
  const start = timestamp(env.TRIAL_STARTS_AT), end = timestamp(env.TRIAL_EXPIRES_AT);
  const windowOpen = () => {
    try {
      const now = testDependencies.nowMs ?? Date.now();
      return Number.isFinite(now) && now >= start && now < end;
    } catch { return false; }
  };
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || end - start > MAX_WINDOW_MS || !windowOpen()) return denied(503);
  if (!tokenMatches(request.headers.get('X-Birdmap-Trial-Token'), env.TRIAL_ACCESS_TOKEN)) return denied(403);
  return handleRequest(request, env, testDependencies, windowOpen);
}

export default { fetch(request, env) { return handleTrialRequest(request, env); } };
