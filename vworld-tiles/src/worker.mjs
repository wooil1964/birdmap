// Dedicated, read-only relay. No storage, application logging, retries or client
// credentials. Origin/Referer checks are supplemental, not caller authentication.
const ORIGIN = 'https://wooil1964.github.io';
const BYTE_LIMIT = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

function reply(status, body, png = false) {
  return new Response(body, { status, headers: {
    'Content-Type': png ? 'image/png' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGIN,
    'Vary': 'Origin, Referer',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
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

export async function handleRequest(request, env, testDependencies = {}) {
  if (request.method !== 'GET') return reply(405, 'method_not_allowed');
  let tile;
  try { tile = tileAt(new URL(request.url)); } catch { /* Finite response below. */ }
  if (!tile) return reply(404, 'tile_not_available');
  if (!allowedSource(request.headers)) return reply(403, 'source_not_allowed');
  if (env.TILES_ENABLED !== 'true') return reply(503, 'tiles_unavailable');
  const key = env.VWORLD_API_KEY;
  if (typeof key !== 'string' || !/^[A-Za-z0-9._~-]{8,256}$/.test(key)) return reply(503, 'tiles_unavailable');
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !/^[a-fA-F0-9:.]{3,45}$/.test(ip)) return reply(403, 'source_not_allowed');
  try {
    // Fail closed if bindings are missing or unavailable. These location-local
    // counters cannot enforce the provider's exact account-wide daily quota.
    if (!(await env.CLIENT_TILE_LIMITER.limit({ key: ip })).success) return reply(429, 'tile_rate_limited');
    if (!(await env.GLOBAL_TILE_LIMITER.limit({ key: 'birdmap-vworld-base' })).success) return reply(429, 'tile_rate_limited');
  } catch { return reply(503, 'tiles_unavailable'); }

  const abort = new AbortController();
  let timer, reader;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        if (reader) void reader.cancel().catch(() => {});
        reject(Error('upstream_timeout'));
      }, testDependencies.timeoutMs ?? TIMEOUT_MS);
    });
    const operation = (async () => {
      const upstream = await (testDependencies.fetch ?? globalThis.fetch)(
        'https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/Base/' + tile.z + '/' + tile.y + '/' + tile.x + '.png',
        { method: 'GET', redirect: 'manual', cache: 'no-store', signal: abort.signal, headers: { Accept: 'image/png' } }
      );
      // Do not impersonate the Pages Referer/Origin. Server-call authorization
      // and actual Cloudflare egress must be verified after deployment approval.
      if (upstream.status !== 200 || upstream.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'image/png') {
        if (upstream.body) void upstream.body.cancel().catch(() => {});
        throw Error('upstream_rejected');
      }
      const bytes = await boundedBody(upstream, value => { reader = value; });
      if (!validPng(bytes)) throw Error('invalid_png');
      return reply(200, bytes, true);
    })();
    return await Promise.race([operation, timeout]);
  } catch {
    // Never log/return upstream URL, arbitrary exceptions, bodies or headers.
    return reply(502, 'tiles_unavailable');
  } finally {
    clearTimeout(timer);
    abort.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

export default { fetch(request, env) { return handleRequest(request, env); } };
