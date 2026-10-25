// Offline: the Seoul relay Lambda alone, SigV4 signing, and the Worker -> function URL (AWS_IAM) -> Lambda -> VWorld chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { relay } from '../../vworld-relay/index.mjs';
import { handleRequest, sigv4 } from '../../vworld-tiles/src/worker.mjs';

const KEY = 'SYNTHETIC_VWORLD_KEY_ONLY_FOR_TESTS';
const INVOKER = 'arn:aws:iam::123456789012:user/birdmap-vworld-relay-invoker';
const AKID = 'AKIASYNTHETIC0000001', SECRET = 'SyntheticSecretAccessKey0000000000000000';
const RELAY_URL = 'https://abcdefghijklmnopqrstuvwxyz012345.lambda-url.ap-northeast-2.on.aws';
const ORIGIN = 'https://wooil1964.github.io';
function png(width = 256) {
  const crc = b => { let v = 0xffffffff; for (const x of b) { v ^= x; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ ((v & 1) ? 0xedb88320 : 0); } return (v ^ 0xffffffff) >>> 0; };
  const chunk = (tag, b) => { const type = Buffer.from(tag), size = Buffer.alloc(4), sum = Buffer.alloc(4); size.writeUInt32BE(b.length); sum.writeUInt32BE(crc(Buffer.concat([type, b]))); return Buffer.concat([size, type, b, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(256 * (1 + width * 4)))), chunk('IEND', Buffer.alloc(0))]);
}
const ENV = { VWORLD_API_KEY: KEY, RELAY_INVOKER_ARN: INVOKER };
const event = (path = '/tiles/8/218/100.png', userArn = INVOKER, method = 'GET', rawQueryString = '') =>
  ({ rawPath: path, rawQueryString, headers: {}, requestContext: { http: { method }, authorizer: userArn === null ? null : { iam: { userArn } } } });
const vworld = (response = () => new Response(png(), { headers: { 'Content-Type': 'image/png' } })) => { const calls = []; return { calls, fetch: async (url, init) => { calls.push([url, init]); return response(url, init); } }; };
const leaks = r => [KEY, SECRET].some(s => JSON.stringify(r).includes(s));

test('SigV4: AWS get-vanilla test vector, and the relay request signs host + x-amz-date for lambda/ap-northeast-2', async () => {
  const v = await sigv4('https://example.amazonaws.com/', { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'service' }, new Date('2015-08-30T12:36:00Z'));
  assert.deepEqual(v, { 'X-Amz-Date': '20150830T123600Z', Authorization: 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31' });
  const h = await sigv4(RELAY_URL + '/tiles/8/218/100.png', { accessKeyId: AKID, secretAccessKey: SECRET, region: 'ap-northeast-2', service: 'lambda' }, new Date('2026-10-25T09:00:00Z'));
  assert.match(h.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIASYNTHETIC0000001\/20261025\/ap-northeast-2\/lambda\/aws4_request, SignedHeaders=host;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.ok(!h.Authorization.includes(SECRET));
});
test('authorised in-bounds tile: one fixed VWorld Base request, PNG returned base64 with no-store', async () => {
  const v = vworld(), r = await relay(event(), ENV, { fetch: v.fetch });
  assert.equal(r.statusCode, 200); assert.equal(r.isBase64Encoded, true); assert.deepEqual(Buffer.from(r.body, 'base64'), png());
  assert.deepEqual(r.headers, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  assert.equal(v.calls.length, 1); const [url, init] = v.calls[0];
  assert.equal(url, 'https://api.vworld.kr/req/wmts/1.0.0/' + KEY + '/Base/8/100/218.png');
  assert.deepEqual(init.headers, { Accept: 'image/png' }); assert.equal(init.redirect, 'manual'); assert.equal(init.method, 'GET');
});
test('any caller other than the dedicated invoker is refused before any upstream call or path check', async () => {
  for (const userArn of [null, '', 'arn:aws:iam::123456789012:user/admin', INVOKER + 'x', 'arn:aws:iam::999999999999:user/birdmap-vworld-relay-invoker', 'arn:aws:sts::123456789012:assumed-role/x/y']) {
    for (const path of ['/tiles/8/218/100.png', '/tiles/8/0/0.png', '/anything']) {
      const v = vworld(), r = await relay(event(path, userArn), ENV, { fetch: v.fetch });
      assert.deepEqual([r.statusCode, r.body], [403, 'relay_caller_not_allowed'], String(userArn)); assert.equal(v.calls.length, 0); assert.ok(!leaks(r));
    }
  }
});
test('non-GET, invalid configuration, out-of-bounds, query strings and arbitrary paths never reach VWorld', async () => {
  const v = vworld(); assert.equal((await relay(event(undefined, undefined, 'POST'), ENV, { fetch: v.fetch })).statusCode, 405);
  for (const env of [{}, { ...ENV, VWORLD_API_KEY: 'bad key' }, { ...ENV, RELAY_INVOKER_ARN: 'arn:aws:iam::123:user/x' }, { VWORLD_API_KEY: KEY }]) {
    const r = await relay(event(), env, { fetch: v.fetch }); assert.deepEqual([r.statusCode, r.body], [503, 'relay_unavailable']); assert.ok(!leaks(r));
  }
  for (const [path, q] of [['/tiles/8/0/0.png', ''], ['/tiles/5/27/12.png', ''], ['/tiles/8/218/100.png', 'key=x'], ['/tiles/8/218/100.jpg', ''], ['/proxy', ''], ['/tiles/8/0218/100.png', '']]) {
    const r = await relay(event(path, INVOKER, 'GET', q), ENV, { fetch: v.fetch }); assert.equal(r.statusCode, 404, path);
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

// Independent SigV4 check (node:crypto, not the Worker's WebCrypto code) standing in for the function URL's IAM auth.
function iamAccepts(url, headers, { accessKeyId, secretAccessKey }) {
  const auth = headers.Authorization ?? '', date = headers['X-Amz-Date'] ?? '';
  const m = /^AWS4-HMAC-SHA256 Credential=([A-Z0-9]+)\/(\d{8})\/ap-northeast-2\/lambda\/aws4_request, SignedHeaders=host;x-amz-date, Signature=([0-9a-f]{64})$/.exec(auth);
  if (!m || m[1] !== accessKeyId || date.slice(0, 8) !== m[2]) return false;
  const u = new URL(url), sha = s => createHash('sha256').update(s).digest('hex'), h = (k, s) => createHmac('sha256', k).update(s).digest();
  const canonical = `GET\n${u.pathname}\n\nhost:${u.host}\nx-amz-date:${date}\n\nhost;x-amz-date\n${sha('')}`;
  const scope = `${m[2]}/ap-northeast-2/lambda/aws4_request`;
  const key = h(h(h(h('AWS4' + secretAccessKey, m[2]), 'ap-northeast-2'), 'lambda'), 'aws4_request');
  return createHmac('sha256', key).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`).digest('hex') === m[3];
}
function chain({ iamKey = { accessKeyId: AKID, secretAccessKey: SECRET }, callerArn = INVOKER, vworldResponse } = {}) {
  const v = vworld(vworldResponse), seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, headers: init.headers });
    const u = new URL(url); assert.equal(u.origin, RELAY_URL, 'the Worker only ever calls the relay');
    // Function URL with AWS_IAM: a bad signature is answered by AWS itself; the function is not invoked.
    if (!iamAccepts(url, init.headers, iamKey)) return new Response('{"Message":"Forbidden"}', { status: 403, headers: { 'Content-Type': 'application/json' } });
    const r = await relay({ rawPath: u.pathname, rawQueryString: u.search.slice(1), headers: {}, requestContext: { http: { method: init.method }, authorizer: { iam: { userArn: callerArn } } } }, ENV, { fetch: v.fetch });
    return new Response(r.isBase64Encoded ? Buffer.from(r.body, 'base64') : r.body, { status: r.statusCode, headers: r.headers });
  };
  const env = { TILES_ENABLED: 'true', RELAY_URL, RELAY_ACCESS_KEY_ID: AKID, RELAY_SECRET_ACCESS_KEY: SECRET, CLIENT_TILE_LIMITER: { limit: async () => ({ success: true }) }, GLOBAL_TILE_LIMITER: { limit: async () => ({ success: true }) } };
  const run = (path = '/tiles/8/218/100.png', headers = { Referer: ORIGIN + '/birdmap/' }, e = env) =>
    handleRequest(new Request('https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev' + path, { headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers } }), e, { fetch });
  return { v, seen, env, run };
}
test('chain: a site tile is served through the signed relay; the Worker sends a signature, never the secret key or the VWorld key', async () => {
  const c = chain(), r = await c.run();
  assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), png()); assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(c.seen.length, 1); assert.equal(c.seen[0].url, RELAY_URL + '/tiles/base/8/218/100.png'); assert.equal(c.v.calls.length, 1);
  assert.deepEqual(Object.keys(c.seen[0].headers).sort(), ['Accept', 'Authorization', 'X-Amz-Date']);
  assert.ok(!JSON.stringify(c.seen).includes(SECRET) && !JSON.stringify([...r.headers]).includes(SECRET));
  const withKey = chain(); const r2 = await withKey.run(undefined, undefined, { ...withKey.env, VWORLD_API_KEY: KEY });
  assert.equal(r2.status, 200); assert.ok(!JSON.stringify(withKey.seen).includes(KEY), 'a leftover Worker key is never used once RELAY_URL is set');
});
test('chain: IAM refusal, wrong caller and VWorld failures reach the browser as 502 (OSM fallback) with a fixed class only', async () => {
  for (const [opts, cls] of [[{ iamKey: { accessKeyId: AKID, secretAccessKey: 'RotatedSecretAccessKey00000000000000000' } }, 'http-403'],
    [{ iamKey: { accessKeyId: 'AKIAOTHERKEY00000001', secretAccessKey: SECRET } }, 'http-403'],
    [{ callerArn: 'arn:aws:iam::123456789012:user/admin' }, 'http-403'],
    [{ vworldResponse: () => new Response('<ExceptionReport/>', { headers: { 'Content-Type': 'application/xml' } }) }, 'relay-xml-exception'],
    [{ vworldResponse: () => { throw Error('reset'); } }, 'relay-network']]) {
    const c = chain(opts), r = await c.run(); const body = await r.text();
    assert.deepEqual([r.status, body, r.headers.get('X-Tile-Upstream')], [502, 'tiles_unavailable', cls], JSON.stringify(opts).slice(0, 60));
    assert.ok(![...r.headers.values(), body].some(x => x.includes(KEY) || x.includes(SECRET)));
  }
});
test('chain: access control and limiters still run first; bad relay configuration fails closed without any fetch', async () => {
  for (const [path, headers, status] of [['/tiles/8/218/100.png', {}, 403], ['/tiles/8/218/100.png', { Origin: 'https://example.com' }, 403], ['/tiles/8/0/0.png', { Referer: ORIGIN + '/' }, 404], ['/', { Referer: ORIGIN + '/' }, 404]]) {
    const c = chain(); assert.equal((await c.run(path, headers)).status, status); assert.equal(c.seen.length, 0);
  }
  for (const over of [{ RELAY_URL: 'https://evil.example' }, { RELAY_URL: RELAY_URL + '/' }, { RELAY_URL: RELAY_URL.replace('ap-northeast-2', 'us-east-1') },
    { RELAY_ACCESS_KEY_ID: 'ASIATEMPORARY0000001' }, { RELAY_ACCESS_KEY_ID: undefined }, { RELAY_SECRET_ACCESS_KEY: 'short' }, { RELAY_SECRET_ACCESS_KEY: undefined }]) {
    const c = chain(); assert.equal((await c.run(undefined, undefined, { ...c.env, ...over })).status, 503, JSON.stringify(over)); assert.equal(c.seen.length, 0);
  }
  const c = chain(); assert.equal((await c.run(undefined, undefined, { ...c.env, GLOBAL_TILE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429); assert.equal(c.seen.length, 0);
});

// Satellite (JPEG) and Hybrid (transparent PNG overlay) next to Base.
function jpeg({ width = 256, height = 256, eoi = true, sof = true } = {}) {
  const seg = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  const frame = Buffer.from([8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')), seg(0xdb, Buffer.alloc(65)),
    ...(sof ? [seg(0xc0, frame)] : []), seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])), Buffer.alloc(200, 0x5a), Buffer.from(eoi ? [0xff, 0xd9] : [0x12, 0x34])]);
}
const satelliteOk = () => new Response(jpeg(), { headers: { 'Content-Type': 'image/jpeg' } });
test('layers: Satellite is JPEG and Hybrid is PNG on the same z/x/y grid as Base; mismatched extensions are refused', async () => {
  const v = vworld((url) => url.includes('/Satellite/') ? satelliteOk() : new Response(png(), { headers: { 'Content-Type': 'image/png' } }));
  for (const [path, type, wmts] of [['/tiles/8/218/100.png', 'image/png', 'Base/8/100/218.png'], ['/tiles/base/8/218/100.png', 'image/png', 'Base/8/100/218.png'],
    ['/tiles/satellite/8/218/100.jpeg', 'image/jpeg', 'Satellite/8/100/218.jpeg'], ['/tiles/hybrid/8/218/100.png', 'image/png', 'Hybrid/8/100/218.png']]) {
    const r = await relay(event(path), ENV, { fetch: v.fetch });
    assert.deepEqual([r.statusCode, r.headers['Content-Type']], [200, type], path);
    assert.equal(v.calls.at(-1)[0], 'https://api.vworld.kr/req/wmts/1.0.0/' + KEY + '/' + wmts); assert.deepEqual(v.calls.at(-1)[1].headers, { Accept: type });
  }
  const calls = v.calls.length;
  for (const path of ['/tiles/satellite/8/218/100.png', '/tiles/hybrid/8/218/100.jpeg', '/tiles/base/8/218/100.jpeg', '/tiles/8/218/100.jpeg', '/tiles/gray/8/218/100.png', '/tiles/Satellite/8/218/100.jpeg', '/tiles/satellite/5/27/12.jpeg', '/tiles/hybrid/8/0/0.png'])
    assert.equal((await relay(event(path), ENV, { fetch: v.fetch })).statusCode, 404, path);
  assert.equal(v.calls.length, calls);
});
test('Satellite JPEG check: SOI, 256x256 frame before the scan, EOI; anything else is a fixed 502 class', async () => {
  for (const [response, cls] of [[() => new Response(jpeg({ width: 128 }), { headers: { 'Content-Type': 'image/jpeg' } }), 'jpeg'],
    [() => new Response(jpeg({ eoi: false }), { headers: { 'Content-Type': 'image/jpeg' } }), 'jpeg'], [() => new Response(jpeg({ sof: false }), { headers: { 'Content-Type': 'image/jpeg' } }), 'jpeg'],
    [() => new Response(png(), { headers: { 'Content-Type': 'image/jpeg' } }), 'jpeg'], [() => new Response(jpeg(), { headers: { 'Content-Type': 'image/png' } }), 'not-jpeg-type'],
    [() => new Response('<ExceptionReport/>', { headers: { 'Content-Type': 'application/xml' } }), 'xml-exception']]) {
    const r = await relay(event('/tiles/satellite/8/218/100.jpeg'), ENV, { fetch: vworld(response).fetch });
    assert.deepEqual([r.statusCode, r.headers['X-Tile-Upstream']], [502, cls], cls);
  }
  const ok = await relay(event('/tiles/satellite/8/218/100.jpeg'), ENV, { fetch: vworld(satelliteOk).fetch });
  assert.deepEqual([ok.statusCode, Buffer.from(ok.body, 'base64').subarray(0, 3).toString('hex')], [200, 'ffd8ff']);
  const hybridAsJpeg = await relay(event('/tiles/hybrid/8/218/100.png'), ENV, { fetch: vworld(satelliteOk).fetch });
  assert.deepEqual([hybridAsJpeg.statusCode, hybridAsJpeg.headers['X-Tile-Upstream']], [502, 'not-png-type']);
});
test('chain: Satellite and Hybrid tiles reach the browser through the signed relay with their own type; access control unchanged', async () => {
  const c = chain({ vworldResponse: url => url.includes('/Satellite/') ? satelliteOk() : new Response(png(), { headers: { 'Content-Type': 'image/png' } }) });
  const s = await c.run('/tiles/satellite/8/218/100.jpeg'), h = await c.run('/tiles/hybrid/8/218/100.png');
  assert.deepEqual([s.status, s.headers.get('Content-Type'), h.status, h.headers.get('Content-Type')], [200, 'image/jpeg', 200, 'image/png']);
  assert.deepEqual(c.seen.map(x => x.url), [RELAY_URL + '/tiles/satellite/8/218/100.jpeg', RELAY_URL + '/tiles/hybrid/8/218/100.png']);
  assert.deepEqual(c.seen.map(x => x.headers.Accept), ['image/jpeg', 'image/png']);
  for (const [path, headers, status] of [['/tiles/satellite/8/218/100.jpeg', {}, 403], ['/tiles/hybrid/8/0/0.png', { Referer: ORIGIN + '/' }, 404], ['/tiles/satellite/8/218/100.png', { Referer: ORIGIN + '/' }, 404]]) {
    const d = chain(); assert.equal((await d.run(path, headers)).status, status, path); assert.equal(d.seen.length, 0);
  }
});