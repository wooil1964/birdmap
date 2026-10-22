// Temporary server-to-server trial only. The normal map client has no trial
// credential. No storage, logging, deployment automation or new service binding.
import { handleRequest } from './worker.mjs';

const MAX_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url.

function denied(status) {
  return new Response('tiles_unavailable', { status, headers: {
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
  if (env.TILES_ENABLED !== 'true') return handleRequest(request, env, testDependencies);
  const start = timestamp(env.TRIAL_STARTS_AT), end = timestamp(env.TRIAL_EXPIRES_AT);
  const now = testDependencies.nowMs ?? Date.now();
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || end - start > MAX_WINDOW_MS || now < start || now >= end) return denied(503);
  if (!tokenMatches(request.headers.get('X-Birdmap-Trial-Token'), env.TRIAL_ACCESS_TOKEN)) return denied(403);
  return handleRequest(request, env, testDependencies);
}

export default { fetch(request, env) { return handleTrialRequest(request, env); } };
