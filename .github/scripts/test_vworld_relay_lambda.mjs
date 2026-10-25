// Offline: the Seoul relay Lambda alone, and the Worker -> Lambda -> VWorld chain with every network hop simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { relay } from '../../vworld-relay/index.mjs';
import { handleRequest } from '../../vworld-tiles/src/worker.mjs';

const KEY = 'SYNTHETIC_VWORLD_KEY_ONLY_FOR_TESTS';
const SECRET = 'synthetic-relay-secret-0123456789abcdef0123456789';
const RELAY_URL = 'https://abcdefghijklmnopqrstuvwxyz012345.lambda-url.ap-northeast-2.on.aws';
const ORIGIN = 'https://wooil1964.github.io';
function png(width = 256) {
  const crc = b => { let v = 0xffffffff; for (const x of b) { v ^= x; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ ((v & 1) ? 0xedb88320 : 0); } return (v ^ 0xffffffff) >>> 0; };
  const chunk = (tag, b) => { const type = Buffer.from(tag), size = Buffer.alloc(4), sum = Buffer.alloc(4); size.writeUInt32BE(b.length); sum.writeUInt32BE(crc(Buffer.concat([type, b]))); return Buffer.concat([size, type, b, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + width * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
const ENV = { VWORLD_API_KEY: KEY, RELAY_SHARED_SECRET: SECRET };
const event = (path = '/tiles/8/218/100.png', headers = { 'x-relay-auth': SECRET }, method = 'GET', rawQueryString = '') => ({ rawPath: path, rawQueryString, headers, requestContext: { http: { method } } });
const vworld = (response = () => new Response(png(), { headers: { 'Content-Type': 'image/png' } })) => { const calls = []; return { calls, fetch: async (url, init) => { calls.push([url, init]); return response(url, init); } }; };
const leaks = r => JSON.stringify(r).includes(KEY) || JSON.stringify(r).includes(SECRET);

test('authorised in-bounds tile: one fixed VWorld Base request, PNG returned base64 with no-store', async () => {
  const v = vworld(), r = await relay(event(), ENV, { fetch: v.fetch });
  assert.equal(r.statusCode, 200); assert.equal(r.isBase64Encoded, true); assert.deepEqual(Buffer.from(r.body, 'base64'), png());
  assert.deepEqual(r.headers, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  assert.equal(v.calls.length, 1); const [url, init] = v.calls[0];
  assert.equal(url, 'https://api.vworld.kr/req/wmts/1.0.0/' + KEY + '/Base/8/100/218.png');
  assert.deepEqual(init.headers, { Accept: 'image/png' }); assert.equal(init.redirect, 'manual'); assert.equal(init.method, 'GET');
});
test('missing, wrong, longer, shorter or non-string secret is refused before any upstream call or path check', async () => {
  for (const headers of [{}, { 'x-relay-auth': '' }, { 'x-relay-auth': SECRET + 'x' }, { 'x-relay-auth': SECRET.slice(0, -1) }, { 'x-relay-auth': SECRET.toUpperCase() }, { 'X-Relay-Auth-Other': SECRET }]) {
    for (const path of ['/tiles/8/218/100.png', '/tiles/8/0/0.png', '/anything']) {
      const v = vworld(), r = await relay(event(path, headers), ENV, { fetch: v.fetch });
      assert.deepEqual([r.statusCode, r.body], [403, 'relay_auth_required'], JSON.stringify(headers)); assert.equal(v.calls.length, 0); assert.ok(!leaks(r));
    }
  }
});
test('non-GET, invalid configuration, out-of-bounds, query strings and arbitrary paths never reach VWorld', async () => {
  let v = vworld(); assert.equal((await relay(event(undefined, undefined, 'POST'), ENV, { fetch: v.fetch })).statusCode, 405);
  for (const env of [{}, { ...ENV, VWORLD_API_KEY: 'bad key' }, { ...ENV, RELAY_SHARED_SECRET: 'short' }, { VWORLD_API_KEY: KEY }]) {
    const r = await relay(event(), env, { fetch: v.fetch }); assert.deepEqual([r.statusCode, r.body], [503, 'relay_unavailable']); assert.ok(!leaks(r));
  }
  for (const [path, q] of [['/tiles/8/0/0.png', ''], ['/tiles/5/27/12.png', ''], ['/tiles/8/218/100.png', 'key=x'], ['/tiles/8/218/100.jpg', ''], ['/proxy', ''], ['/tiles/8/0218/100.png', '']]) {
    const r = await relay(event(path, undefined, 'GET', q), ENV, { fetch: v.fetch }); assert.equal(r.statusCode, 404, path);
  }
  assert.equal(v.calls.length, 0);
});
test('VWorld failures become a fixed 502 class; fake-key XML is xml-exception; nothing upstream is echoed', async () => {
  const cases = [[() => new Response('<ExceptionReport>' + KEY + '</ExceptionReport>', { headers: { 'Content-Type': 'application/xml;charset=UTF-8' } }), 'xml-exception'],
    [() => new Response(KEY, { status: 403 }), 'http-403'], [() => new Response(KEY, { status: 502, headers: { 'X-Tile-Upstream': 'body' } }), 'relay-body'],
    [() => { throw Error('reset ' + KEY); }, 'network'], [() => new Response(png(128), { headers: { 'Content-Type': 'image/png' } }), 'png'],
    [() => new Response(png(), { headers: { 'Content-Type': 'image/png', 'Content-Length': String(2 * 1024 * 1024 + 1) } }), 'body']];
  for (const [response, cls] of cases) {
    const v = vworld(response), r = await relay(event(), ENV, { fetch: v.fetch });
    assert.deepEqual([r.statusCode, r.body, r.headers['X-Tile-Upstream']], [502, 'tiles_unavailable', cls]); assert.ok(!leaks(r)); assert.equal(v.calls.length, 1);
  }
  const r = await relay(event(), ENV, { fetch: async () => new Promise(() => {}), timeoutMs: 20 }); assert.equal(r.headers['X-Tile-Upstream'], 'timeout');
});

// Worker -> Lambda: the Worker's relay fetch is answered by the real relay() through a function-URL-shaped event.
function chain({ secretSeenByLambda = SECRET, vworldResponse } = {}) {
  const v = vworld(vworldResponse), seen = [];
  const fetch = async (url, init) => {
    seen.push(url);
    const u = new URL(url); assert.equal(u.origin, RELAY_URL, 'the Worker only ever calls the relay');
    const headers = Object.fromEntries(Object.entries(init.headers).map(([k, x]) => [k.toLowerCase(), x]));
    const r = await relay({ rawPath: u.pathname, rawQueryString: u.search.slice(1), headers, requestContext: { http: { method: init.method } } }, { ...ENV, RELAY_SHARED_SECRET: secretSeenByLambda }, { fetch: v.fetch });
    return new Response(r.isBase64Encoded ? Buffer.from(r.body, 'base64') : r.body, { status: r.statusCode, headers: r.headers });
  };
  const env = { TILES_ENABLED: 'true', RELAY_URL, RELAY_SHARED_SECRET: SECRET, CLIENT_TILE_LIMITER: { limit: async () => ({ success: true }) }, GLOBAL_TILE_LIMITER: { limit: async () => ({ success: true }) } };
  const run = (path = '/tiles/8/218/100.png', headers = { Referer: ORIGIN + '/birdmap/' }, e = env) =>
    handleRequest(new Request('https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev' + path, { headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers } }), e, { fetch });
  return { v, seen, env, run };
}
test('chain: site tile is served through the relay; the Worker sends only the shared secret and never the key', async () => {
  const c = chain(), r = await c.run();
  assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), png()); assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(c.seen, [RELAY_URL + '/tiles/8/218/100.png']); assert.equal(c.v.calls.length, 1);
  assert.ok(!JSON.stringify([...r.headers]).includes(SECRET));
  const withKey = chain(); const r2 = await withKey.run(undefined, undefined, { ...withKey.env, VWORLD_API_KEY: KEY });
  assert.equal(r2.status, 200); assert.ok(withKey.seen.every(u => !u.includes(KEY)), 'a leftover Worker key is never used once RELAY_URL is set');
});
test('chain: relay refusals and VWorld failures reach the browser as 502 (OSM fallback) with a fixed class only', async () => {
  for (const [opts, cls] of [[{ secretSeenByLambda: SECRET + 'rotated' }, 'http-403'],
    [{ vworldResponse: () => new Response('<ExceptionReport/>', { headers: { 'Content-Type': 'application/xml' } }) }, 'relay-xml-exception'],
    [{ vworldResponse: () => { throw Error('reset'); } }, 'relay-network']]) {
    const c = chain(opts), r = await c.run(); const body = await r.text();
    assert.deepEqual([r.status, body, r.headers.get('X-Tile-Upstream')], [502, 'tiles_unavailable', cls]);
    assert.ok(![...r.headers.values(), body].some(x => x.includes(KEY) || x.includes(SECRET)));
  }
});
test('chain: access control and limiters still run first; bad relay configuration fails closed without any fetch', async () => {
  for (const [path, headers, status] of [['/tiles/8/218/100.png', {}, 403], ['/tiles/8/218/100.png', { Origin: 'https://example.com' }, 403], ['/tiles/8/0/0.png', { Referer: ORIGIN + '/' }, 404], ['/', { Referer: ORIGIN + '/' }, 404]]) {
    const c = chain(); assert.equal((await c.run(path, headers)).status, status); assert.equal(c.seen.length, 0);
  }
  for (const over of [{ RELAY_URL: 'https://evil.example' }, { RELAY_URL: RELAY_URL + '/' }, { RELAY_URL: RELAY_URL.replace('ap-northeast-2', 'us-east-1') }, { RELAY_SHARED_SECRET: 'short' }, { RELAY_SHARED_SECRET: undefined }]) {
    const c = chain(); assert.equal((await c.run(undefined, undefined, { ...c.env, ...over })).status, 503, JSON.stringify(over)); assert.equal(c.seen.length, 0);
  }
  const c = chain(); assert.equal((await c.run(undefined, undefined, { ...c.env, GLOBAL_TILE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429); assert.equal(c.seen.length, 0);
});
