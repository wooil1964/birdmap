// Seoul relay: AWS Lambda function URL in ap-northeast-2 between the birdmap-vworld-tiles Worker and VWorld, which
// refuses Cloudflare egress but accepts Korean cloud addresses. It alone holds the VWorld key. Its function URL uses auth
// type AWS_IAM, so unsigned or wrongly signed requests are rejected before this code runs (and are not invocations);
// here only the dedicated invoker user passes, only for in-bounds Base/Satellite/Hybrid tiles, only with a validated
// PNG or JPEG. No logging.
// Package: this file and ../vworld-tiles/src/worker.mjs at the same relative paths; handler vworld-relay/index.handler.
import { tileAt, fetchTile, vworldTileUrl, LAYERS } from '../vworld-tiles/src/worker.mjs';

const KEY = /^[A-Za-z0-9._~-]{8,256}$/;
const INVOKER = /^arn:aws:iam::\d{12}:user\/[A-Za-z0-9+=,.@_-]{1,64}$/;
// Inside the Worker's 8 s deadline; the function timeout is 10 s.
const UPSTREAM_TIMEOUT_MS = 6000;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const text = (statusCode, body, extra = {}) => ({ statusCode, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...HEADERS, ...extra }, body });

export async function relay(event, env, testDependencies = {}) {
  const key = env.VWORLD_API_KEY, invoker = env.RELAY_INVOKER_ARN;
  if (typeof key !== 'string' || !KEY.test(key) || typeof invoker !== 'string' || !INVOKER.test(invoker)) return text(503, 'relay_unavailable');
  if (event?.requestContext?.http?.method !== 'GET') return text(405, 'method_not_allowed');
  // IAM already authenticated the signature; also require the dedicated invoker (not any other account principal),
  // before looking at the path.
  if (event?.requestContext?.authorizer?.iam?.userArn !== invoker) return text(403, 'relay_caller_not_allowed');
  let tile = null;
  try { if (!event.rawQueryString) tile = tileAt(new URL('https://relay.invalid' + event.rawPath)); } catch { /* 404 below */ }
  if (!tile) return text(404, 'tile_not_available');
  const layer = LAYERS[tile.layer];
  const result = await fetchTile(vworldTileUrl(key, tile), { Accept: layer.type }, { timeoutMs: UPSTREAM_TIMEOUT_MS, ...testDependencies }, layer.ext);
  if (!result.bytes) return text(502, 'tiles_unavailable', { 'X-Tile-Upstream': result.failure });
  return { statusCode: 200, headers: { 'Content-Type': layer.type, ...HEADERS }, body: Buffer.from(result.bytes).toString('base64'), isBase64Encoded: true };
}

export const handler = event => relay(event, process.env);
