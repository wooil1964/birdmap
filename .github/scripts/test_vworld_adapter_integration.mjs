import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapTrial, runTrial, recoverTrial } from '../../vworld-tiles/trial/core.mjs';
import { CloudflareAdapter } from '../../vworld-tiles/trial/cloudflare.mjs';
import { SHA, BOOT, RUN, TARGET, KEY, NOW, TOKEN, HOST, environment, png, headers, fixture } from './vworld_synthetic_cloudflare.mjs';

const runOptions = () => ({ sha: SHA, runId: RUN, vworldKey: KEY, now: () => NOW, randomBytesFn: () => Buffer.alloc(32, 17) });
const bootstrap = f => bootstrapTrial(f.adapter('bootstrap', BOOT), { sha: SHA, runId: BOOT });
const approvedRun = f => runTrial(f.adapter('run'), runOptions());
const recover = f => recoverTrial(f.adapter('recover', RUN, true), { sha: SHA, runId: RUN });
const successfulTiles = f => f.probes.filter(p => p.token);
function disabled(f) {
  assert.equal(f.variables().TILES_ENABLED, 'false');
  assert.equal(f.probes.at(-1).token, undefined);
  assert.equal(f.reports.at(-1), 'restored-503');
  assert.deepEqual(f.syntheticErrors, []);
}
test('complete synthetic bootstrap and trial preserve false through secret deployment and restore after four tiles', async () => {
  const f = fixture(); await bootstrap(f);
  assert.equal(f.variables().TILES_ENABLED, 'false'); assert.equal(f.secrets.size, 0);
  assert.deepEqual(await approvedRun(f), { attemptedTiles: 4, restored: true }); disabled(f);
  assert.deepEqual(successfulTiles(f).map(p => new URL(p.url).pathname), ['/tiles/8/218/100.png', '/tiles/8/219/100.png', '/tiles/8/220/100.png', '/tiles/8/221/100.png']);
  assert.deepEqual([...f.secrets.keys()].sort(), ['TRIAL_ACCESS_TOKEN', 'VWORLD_API_KEY']);
  const puts = f.toolCalls.filter(c => c.args[0] === 'secret');
  assert.equal(puts.length, 2); assert.equal(puts[0].input, KEY + '\n'); assert.equal(puts[1].input, TOKEN + '\n');
  assert.equal(f.toolCalls[0].env.CLOUDFLARE_API_TOKEN, environment('bootstrap').CF_CREATE_TOKEN);
  assert.ok(f.toolCalls.slice(1).every(c => c.env.CLOUDFLARE_API_TOKEN === environment('run').CF_EDIT_TOKEN));
  assert.deepEqual(f.toolCalls.filter(c => c.args[0] === 'deploy').map(c => c.enabled), ['false', 'false', 'false', 'true', 'false']);
});
test('ambiguous initial create completion is disabled again through the real adapter', async () => {
  const f = fixture({ failDeploy: 1 }); await assert.rejects(bootstrap(f));
  assert.equal(f.exists, true); disabled(f); assert.equal(f.secrets.size, 0); assert.equal(successfulTiles(f).length, 0);
  assert.deepEqual(f.toolCalls.map(c => c.enabled), ['false', 'false']);
});

test('a retained consumed version blocks reuse even if current version was reset to bootstrap', async () => {
  const f = fixture(); await bootstrap(f);
  f.snapshot({ message: `bm:${SHA}:consumed:${RUN}` });
  f.snapshot({ message: `bm:${SHA}:bootstrap:${BOOT}` });
  const before = f.toolCalls.length;
  await assert.rejects(approvedRun(f), /BOOTSTRAP_ALREADY_CONSUMED_OR_FOREIGN_HISTORY/);
  assert.equal(f.toolCalls.length, before); assert.equal(f.secrets.size, 0);
});

test('missing target history pagination metadata blocks reuse before the first write', async () => {
  const f = fixture(); await bootstrap(f);
  const adapter = f.adapter('run'), api = adapter.api.bind(adapter);
  adapter.api = async (...args) => { const r = await api(...args); if (args[0].includes('/versions?')) delete r.info; return r; };
  const before = f.toolCalls.length;
  await assert.rejects(runTrial(adapter, runOptions()), /TARGET_HISTORY_UNVERIFIED/);
  assert.equal(f.toolCalls.length, before); assert.equal(f.secrets.size, 0);
});
test('secret put failure after remote mutation restores false with existing secret preserved', async () => {
  const f = fixture({ failSecret: 1 }); await bootstrap(f); await assert.rejects(approvedRun(f));
  disabled(f); assert.equal(f.secrets.get('VWORLD_API_KEY'), KEY); assert.equal(f.secrets.has('TRIAL_ACCESS_TOKEN'), false);
  assert.equal(successfulTiles(f).length, 0); assert.ok(f.toolCalls.every(c => c.enabled !== 'true'));
});
test('second synthetic tile failure stops immediately without retry and restores through real adapter', async () => {
  const f = fixture({ failTile: 2 }); await bootstrap(f); await assert.rejects(approvedRun(f)); disabled(f);
  assert.deepEqual(successfulTiles(f).map(p => new URL(p.url).pathname), ['/tiles/8/218/100.png', '/tiles/8/219/100.png']);
  assert.equal(f.toolCalls.filter(c => c.enabled === 'true').length, 1);
});
test('independent narrow-editor recovery finds owned history after annotations disappear without account-wide reads', async () => {
  const f = fixture(); await bootstrap(f); await approvedRun(f);
  f.snapshot({ enabled: true, start: new Date(NOW).toISOString(), end: new Date(NOW + 600000).toISOString(), message: '' });
  const callsBefore = f.apiCalls.length; await recover(f); disabled(f);
  assert.ok(f.apiCalls.slice(callsBefore).every(call => call.path.startsWith('/workers/scripts/' + TARGET + '/')));
  assert.ok(f.apiCalls.slice(callsBefore).every(call => call.authorization === 'Bearer ' + environment('recover').CF_EDIT_TOKEN));
});
test('independent recovery never creates an absent target', async () => {
  const f = fixture(); await assert.rejects(recover(f)); assert.equal(f.exists, false); assert.equal(f.toolCalls.length, 0);
});
test('independent recovery refuses an unrelated source without any deployment', async () => {
  const f = fixture(); f.snapshot({ message: 'unrelated-synthetic-source', tag: 'unrelated', etag: 'synthetic-foreign-code' });
  await assert.rejects(recover(f), /TARGET_SOURCE_OWNERSHIP_UNVERIFIED/); assert.equal(f.toolCalls.length, 0);
});
for (const type of ['d1', 'service']) test('owned source with an unexpected ' + type + ' binding is never overwritten during recovery', async () => {
  const f = fixture(); await bootstrap(f);
  f.currentVersion().resources.bindings.push({ type, name: 'UNRELATED_BINDING', id: 'synthetic-unrelated-resource' });
  const before = f.toolCalls.length;
  await assert.rejects(recover(f)); assert.equal(f.toolCalls.length, before);
  assert.ok(f.currentVersion().resources.bindings.some(b => b.name === 'UNRELATED_BINDING'));
});
test('a consumed or differently approved bootstrap cannot start another trial', async () => {
  for (const message of ['bm:' + SHA + ':consumed:' + BOOT, 'bm:' + SHA + ':bootstrap:9999999']) {
    const f = fixture(); f.snapshot({ message }); await assert.rejects(approvedRun(f), /NOT_UNUSED_APPROVED_BOOTSTRAP/);
    assert.equal(f.toolCalls.length, 0); assert.equal(successfulTiles(f).length, 0);
  }
});

test('automatic recovery uses narrow editing when the account-wide reader fails after activation', async () => {
  const f = fixture({ revokeReadWhenEnabled: true }); await bootstrap(f); await assert.rejects(approvedRun(f)); disabled(f);
  assert.equal(f.toolCalls.filter(c => c.enabled === 'true').length, 1); assert.equal(successfulTiles(f).length, 0);
});

test('independent recovery ignores a stale supplied account reader and uses target-only editing', async () => {
  const f = fixture({ revokeReadWhenEnabled: true }); await bootstrap(f);
  f.snapshot({ enabled: true, start: new Date(NOW).toISOString(), end: new Date(NOW + 600000).toISOString(), message: 'bm:' + SHA + ':enabled:' + RUN });
  const before = f.apiCalls.length;
  await recoverTrial(f.adapter('recover', RUN), { sha: SHA, runId: RUN }); disabled(f);
  assert.ok(f.apiCalls.slice(before).every(call => call.authorization === 'Bearer ' + environment('recover').CF_EDIT_TOKEN));
  assert.ok(f.apiCalls.slice(before).every(call => call.path.startsWith('/workers/scripts/' + TARGET + '/')));
});
test('recovery refuses unrelated current settings even if immutable active bindings remain isolated', async () => {
  const f = fixture(); await bootstrap(f);
  f.setCurrentSettings([...f.currentVersion().resources.bindings, { type: 'd1', name: 'UNRELATED_CURRENT_DB', id: 'synthetic-resource' }]);
  const before = f.toolCalls.length; await assert.rejects(recover(f)); assert.equal(f.toolCalls.length, before);
});

test('external probe accepts Cloudflare-consumed CDN policy headers with a noncacheable response', async () => {
  const adapter = new CloudflareAdapter({ TRIAL_HOST: HOST }, { fetchFn: async () => new Response(png(), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'CF-Cache-Status': 'DYNAMIC' } }) });
  await adapter.probe({ x: 218, token: TOKEN, status: 200 });
});
for (const status of ['HIT', 'STALE', 'REVALIDATED', 'UPDATING']) test('external probe rejects cached CF status ' + status, async () => {
  let calls = 0;
  const adapter = new CloudflareAdapter({ TRIAL_HOST: HOST }, { fetchFn: async () => { calls++; return new Response(png(), { status: 200, headers: { ...headers, 'CF-Cache-Status': status } }); } });
  await assert.rejects(adapter.probe({ x: 218, token: TOKEN, status: 200 })); assert.equal(calls, 1);
});

