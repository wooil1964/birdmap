// Dedicated, read-only relay. No storage, application logging, retries or client
// credentials. Origin/Referer checks are supplemental, not caller authentication.
const ORIGIN = 'https://wooil1964.github.io';
const BYTE_LIMIT = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

function reply(status, body, png = false, diagnostic = {}) {
  return new Response(body, { status, headers: {
    'Content-Type': png ? 'image/png' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGIN,
    'Vary': 'Origin, Referer',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...diagnostic
  }});
}

function allowedSource(headers) {
  const origin = headers.get('Origin'), referer = headers.get('Referer');
  if (origin && origin !== ORIGIN) return false;
  let refOrigin = '';
  if (referer) {
    try { refOrigin = new URL(referer).origin; } catch { return false; }
    if (refOrigin !== ORIGIN) return false;
  }
  return origin === ORIGIN || refOrigin === ORIGIN;
}

export function tileAt(url) {
  if (url.search || url.hash) return null;
  const parts = /^\/tiles\/(\d{1,2})\/(0|[1-9]\d{0,5})\/(0|[1-9]\d{0,5})\.png$/.exec(url.pathname);
  if (!parts) return null;
  const [z, x, y] = parts.slice(1).map(Number), n = 2 ** z;
  if (z < 6 || z > 19 || String(z) !== parts[1] || x >= n || y >= n) return null;
  const lat = row => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / n))) * 180 / Math.PI;
  // Tile footprints intersect the existing domestic view. Border tiles naturally
  // extend beyond it; this is a request bound, not a geographic coverage claim.
  if ((x + 1) / n * 360 - 180 <= 124.5 || x / n * 360 - 180 >= 132 || lat(y) <= 32.9 || lat(y + 1) >= 38.75) return null;
  return { z, x, y };
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(bytes) {
  if (bytes.length < 57 || bytes.length > BYTE_LIMIT || !PNG_MAGIC.every((v, i) => bytes[i] === v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, header = false, data = false;
  while (pos + 12 <= bytes.length) {
    const size = view.getUint32(pos), end = pos + 12 + size;
    if (size > BYTE_LIMIT || end > bytes.length) return false;
    const tag = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (view.getUint32(pos + 8 + size) !== crc32(bytes, pos + 4, pos + 8 + size)) return false;
    if (!header) {
      if (tag !== 'IHDR' || size !== 13 || view.getUint32(pos + 8) !== 256 || view.getUint32(pos + 12) !== 256) return false;
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[bytes[pos + 17]]?.includes(bytes[pos + 16]) || bytes[pos + 18] !== 0 || bytes[pos + 19] !== 0 || bytes[pos + 20] > 1) return false;
      header = true;
    } else if (tag === 'IHDR') return false;
    if (tag === 'IDAT' && size > 0) data = true;
    if (tag === 'IEND') return size === 0 && data && end === bytes.length;
    pos = end;
  }
  return false;
}

async function boundedBody(response, onReader) {
  const declared = response.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > BYTE_LIMIT)) {
    if (response.body) void response.body.cancel().catch(() => {});
    throw Error('invalid_size');
  }
  if (!response.body) throw Error('missing_body');
  const reader = response.body.getReader();
  onReader(reader);
  const chunks = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > BYTE_LIMIT) throw Error('oversize');
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

// Fixed vocabulary of upstream failure classes for the 502 diagnostic header. A relay's own class is carried through
// once with a 'relay-' prefix; anything else from an upstream is reduced to its HTTP status.
const FAILURE = /^(http-(\d{3}|other)|xml-exception|not-png-type|network|timeout|body|png)$/;
// The Seoul relay (AWS Lambda function URL, auth type AWS_IAM) that calls VWorld, which refuses Cloudflare egress.
// Requests are SigV4-signed with a key allowed to invoke only that function URL; unsigned calls never reach it.
const RELAY = /^https:\/\/[a-z0-9]{20,64}\.lambda-url\.ap-northeast-2\.on\.aws$/;
const ACCESS_KEY_ID = /^AKIA[A-Z0-9]{16}$/;
const SECRET_ACCESS_KEY = /^[A-Za-z0-9/+]{40}$/;
const KEY = /^[A-Za-z0-9._~-]{8,256}$/;
export const vworldTileUrl = (key, tile) => 'https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/Base/' + tile.z + '/' + tile.y + '/' + tile.x + '.png';

const utf8 = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async text => hex(await crypto.subtle.digest('SHA-256', utf8.encode(text)));
const hmac = async (key, text) => crypto.subtle.sign('HMAC',
  await crypto.subtle.importKey('raw', typeof key === 'string' ? utf8.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), utf8.encode(text));
// AWS Signature Version 4 for one GET without query string or body (checked against AWS's get-vanilla test vector).
// Relay paths are 'tiles', digits and '*.png', so single and double URI encoding of the path coincide.
export async function sigv4(url, { accessKeyId, secretAccessKey, region, service }, now = new Date()) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), day = amzDate.slice(0, 8);
  const scope = day + '/' + region + '/' + service + '/aws4_request';
  const canonical = ['GET', u.pathname, '', 'host:' + u.host, 'x-amz-date:' + amzDate, '', 'host;x-amz-date', await sha256Hex('')].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let key = await hmac('AWS4' + secretAccessKey, day);
  for (const part of [region, service, 'aws4_request']) key = await hmac(key, part);
  return { 'X-Amz-Date': amzDate, Authorization: 'AWS4-HMAC-SHA256 Credential=' + accessKeyId + '/' + scope + ', SignedHeaders=host;x-amz-date, Signature=' + hex(await hmac(key, toSign)) };
}

// One fixed GET with a deadline, a size bound and a strict PNG check, shared by this Worker and the Seoul relay
// Lambda. Resolves to { bytes } or { failure } (fixed vocabulary). Never throws, never retries. The request is
// started synchronously, before the first await.
export async function fetchTile(url, headers, testDependencies = {}) {
  const abort = new AbortController();
  let timer, reader, failure = 'network';
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        failure = 'timeout';
        abort.abort();
        if (reader) void reader.cancel().catch(() => {});
        reject(Error('upstream_timeout'));
      }, testDependencies.timeoutMs ?? TIMEOUT_MS);
    });
    const operation = (async () => {
      const upstream = await (testDependencies.fetch ?? globalThis.fetch)(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: abort.signal, headers });
      // Do not impersonate the Pages Referer/Origin.
      const type = upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (upstream.status !== 200 || type !== 'image/png') {
        const relayed = upstream.headers.get('X-Tile-Upstream') ?? '';
        failure = upstream.status !== 200 ? (FAILURE.test(relayed) ? 'relay-' + relayed : 'http-' + (/^[1-5]\d\d$/.test(String(upstream.status)) ? upstream.status : 'other'))
          : /xml/.test(type) ? 'xml-exception' : 'not-png-type';
        if (upstream.body) void upstream.body.cancel().catch(() => {});
        throw Error('upstream_rejected');
      }
      failure = 'body';
      const bytes = await boundedBody(upstream, value => { reader = value; });
      failure = 'png';
      if (!validPng(bytes)) throw Error('invalid_png');
      return { bytes };
    })();
    return await Promise.race([operation, timeout]);
  } catch {
    // Never log/return the URL, arbitrary exceptions, bodies or headers: only the fixed failure class.
    return { failure };
  } finally {
    clearTimeout(timer);
    abort.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

export async function handleRequest(request, env, testDependencies = {}, upstreamAllowed = () => true) {
  if (request.method !== 'GET') return reply(405, 'method_not_allowed');
  let tile;
  try { tile = tileAt(new URL(request.url)); } catch { /* Finite response below. */ }
  if (!tile) return reply(404, 'tile_not_available');
  if (!allowedSource(request.headers)) return reply(403, 'source_not_allowed');
  if (env.TILES_ENABLED !== 'true') return reply(503, 'tiles_unavailable');
  // With RELAY_URL the tile comes from the Seoul relay and this Worker holds no VWorld key. Without it the original
  // direct call remains, used only by the retired trial Worker.
  let url, headers = { Accept: 'image/png' }, signing = null;
  if (env.RELAY_URL !== undefined) {
    const relay = env.RELAY_URL, accessKeyId = env.RELAY_ACCESS_KEY_ID, secretAccessKey = env.RELAY_SECRET_ACCESS_KEY;
    if (typeof relay !== 'string' || !RELAY.test(relay) || typeof accessKeyId !== 'string' || !ACCESS_KEY_ID.test(accessKeyId)
      || typeof secretAccessKey !== 'string' || !SECRET_ACCESS_KEY.test(secretAccessKey)) return reply(503, 'tiles_unavailable');
    url = relay + '/tiles/' + tile.z + '/' + tile.x + '/' + tile.y + '.png';
    signing = { accessKeyId, secretAccessKey, region: 'ap-northeast-2', service: 'lambda' };
  } else {
    const key = env.VWORLD_API_KEY;
    if (typeof key !== 'string' || !KEY.test(key)) return reply(503, 'tiles_unavailable');
    url = vworldTileUrl(key, tile);
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !/^[a-fA-F0-9:.]{3,45}$/.test(ip)) return reply(403, 'source_not_allowed');
  try {
    // Fail closed if bindings are missing or unavailable. These location-local
    // counters cannot enforce the provider's exact account-wide daily quota.
    if ((await env.CLIENT_TILE_LIMITER.limit({ key: ip })).success !== true) return reply(429, 'tile_rate_limited');
    if ((await env.GLOBAL_TILE_LIMITER.limit({ key: 'birdmap-vworld-base' })).success !== true) return reply(429, 'tile_rate_limited');
  } catch { return reply(503, 'tiles_unavailable'); }
  if (signing) {
    try { headers = { ...headers, ...(await sigv4(url, signing, testDependencies.now?.())) }; } catch { return reply(503, 'tiles_unavailable'); }
  }
  // Synchronous final policy check: no await between the fresh trial clock and starting fetch (fetchTile starts it
  // synchronously), after both asynchronous native limiters settle.
  if (upstreamAllowed() !== true) return reply(503, 'tiles_unavailable');
  const result = await fetchTile(url, headers, testDependencies);
  return result.bytes ? reply(200, result.bytes, true) : reply(502, 'tiles_unavailable', false, { 'X-Tile-Upstream': result.failure });
}

export default { fetch(request, env) { return handleRequest(request, env); } };
