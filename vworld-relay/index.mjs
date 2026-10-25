// Seoul relay: AWS Lambda function URL in ap-northeast-2 between the birdmap-vworld-tiles Worker and VWorld, which
// refuses Cloudflare egress but accepts Korean cloud addresses. It alone holds the VWorld key. It answers only requests
// carrying the Worker's shared secret, only for in-bounds Base tiles, only with a validated PNG. No logging, no retry.
// Package: this file and ../vworld-tiles/src/worker.mjs at the same relative paths; handler vworld-relay/index.handler.
import { createHash, timingSafeEqual } from 'node:crypto';
import { tileAt, fetchTile, vworldTileUrl } from '../vworld-tiles/src/worker.mjs';

const KEY = /^[A-Za-z0-9._~-]{8,256}$/;
const SECRET = /^[A-Za-z0-9_-]{32,256}$/;
// Inside the Worker's 8 s deadline; the function timeout is 10 s.
const UPSTREAM_TIMEOUT_MS = 6000;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const digest = value => createHash('sha256').update(value).digest();
// Equal-length digests: the comparison time does not depend on where a guess differs.
const sameSecret = (given, expected) => typeof given === 'string' && timingSafeEqual(digest(given), digest(expected));
const text = (statusCode, body, extra = {}) => ({ statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...HEADERS, ...extra }, body });

export async function relay(event, env, testDependencies = {}) {
  const key = env.VWORLD_API_KEY, secret = env.RELAY_SHARED_SECRET;
  if (typeof key !== 'string' || !KEY.test(key) || typeof secret !== 'string' || !SECRET.test(secret)) return text(503, 'relay_unavailable');
  if (event?.requestContext?.http?.method !== 'GET') return text(405, 'method_not_allowed');
  // Authenticate before looking at the path, so an unauthenticated caller learns nothing about valid tiles.
  if (!sameSecret(event.headers?.['x-relay-auth'], secret)) return text(403, 'relay_auth_required');
  let tile = null;
  try { if (!event.rawQueryString) tile = tileAt(new URL('https://relay.invalid' + event.rawPath)); } catch { /* 404 below */ }
  if (!tile) return text(404, 'tile_not_available');
  const result = await fetchTile(vworldTileUrl(key, tile), { Accept: 'image/png' }, { timeoutMs: UPSTREAM_TIMEOUT_MS, ...testDependencies });
  if (!result.bytes) return text(502, 'tiles_unavailable', { 'X-Tile-Upstream': result.failure });
  return { statusCode: 200, headers: { 'Content-Type': 'image/png', ...HEADERS }, body: Buffer.from(result.bytes).toString('base64'), isBase64Encoded: true };
}

export const handler = event => relay(event, process.env);
