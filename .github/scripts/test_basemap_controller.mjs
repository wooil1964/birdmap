import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// In-memory controller regression. No browser, real credentials or network calls.
const source = readFileSync(new URL('../../assets/birdmap-basemap.js', import.meta.url), 'utf8');

class Events {
  constructor() { this.events = new Map(); }
  on(names, fn) {
    if (typeof names === 'object') { for (const [name, handler] of Object.entries(names)) this.on(name, handler); return this; }
    for (const name of names.split(' ')) this.events.set(name, [...(this.events.get(name) || []), fn]);
    return this;
  }
  off(names, fn) {
    if (typeof names === 'object') { for (const [name, handler] of Object.entries(names)) this.off(name, handler); return this; }
    for (const name of names.split(' ')) this.events.set(name, (this.events.get(name) || []).filter(handler => handler !== fn));
    return this;
  }
  fire(name) { for (const fn of [...(this.events.get(name) || [])]) fn(); return this; }
}
class Element {
  constructor(name) { this.name = name; this.children = []; this.attrs = {}; this.listeners = new Map(); this.hidden = false; this.disabled = false; this.textContent = ''; }
  setAttribute(name, value) { this.attrs[name] = value; }
  appendChild(node) { this.children.push(node); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  click() { if (!this.disabled) this.listeners.get('click')?.(); }
}
function environment({ stored = null, blockedStorage = false, key = '', tileCreationThrows = false, config = null } = {}) {
  let nextTimer = 1;
  const timers = new Map(), values = new Map(), storageWrites = [], created = [], controls = [];
  if (stored !== null) values.set('birdmap.basemap.preference', stored);
  const map = new Events();
  Object.assign(map, {
    center: { lat: 36, lng: 127 }, zoom: 10, minZoom: null, layers: new Set(),
    getCenter() { return this.center; }, getZoom() { return this.zoom; },
    setMinZoom(value) { this.minZoom = value; }, hasLayer(layer) { return this.layers.has(layer); },
    removeLayer(layer) { this.layers.delete(layer); },
    move(lat, lng, zoom = this.zoom) { this.center = { lat, lng }; this.zoom = zoom; this.fire('moveend'); this.fire('zoomend'); }
  });
  const osm = { addTo(target) { target.layers.add(this); return this; } };
  const window = {
    localStorage: {
      getItem(name) { if (blockedStorage) throw new Error('storage unavailable'); return values.get(name) || null; },
      setItem(name, value) { if (blockedStorage) throw new Error('storage unavailable'); storageWrites.push([name, value]); values.set(name, value); }
    },
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    L: {
      latLngBounds() { return { contains({ lat, lng }) { return lat >= 32.9 && lat <= 38.75 && lng >= 124.5 && lng <= 132; } }; },
      control(options) {
        const control = { options, addTo(target) { this.container = this.onAdd(target); controls.push(this); return this; }, remove() { this.removed = true; } };
        return control;
      },
      tileLayer(url, options) {
        if (tileCreationThrows) throw new Error('Tile construction failed');
        const layer = new Events();
        Object.assign(layer, { options, _url: url, addTo(target) { target.layers.add(this); this.fire('loading'); return this; } });
        created.push(layer); return layer;
      },
      DomEvent: { disableClickPropagation(el) { el.clickPropagationDisabled = true; }, disableScrollPropagation(el) { el.scrollPropagationDisabled = true; } }
    }
  };
  vm.runInNewContext(source, { window, document: { createElement: name => new Element(name) }, WeakMap, Set });
  const args = { map, osm, domesticBounds: [[32.9, 124.5], [38.75, 132]], config: config || { vworldMode: 'direct', vworldKey: key } };
  const api = window.BirdmapBasemap.mount(args);
  return { api, window, args, map, osm, created, controls, timers, values, storageWrites, last: () => created.at(-1),
    expire() { const [id, { fn }] = timers.entries().next().value; timers.delete(id); fn(); },
    state: () => JSON.parse(JSON.stringify(api.getState())) };
}

// Run sequentially: these checks exercise one controller's lifecycle in order.
test('basemap controller with in-memory map, storage and timers', async (t) => {
  const testKey = 'LOCAL_SIMULATION_CREDENTIAL_A';
  const secondKey = 'LOCAL_SIMULATION_CREDENTIAL_B';
  let e = environment();
  await t.test('default-without-config-keeps-OSM-and-friendly-status', () => {
    assert.equal(e.state().preference, 'vworld'); assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'no_config');
    assert.equal(e.map.hasLayer(e.osm), true); assert.equal(e.created.length, 0); assert.equal(e.map.minZoom, 4);
    assert.match(e.controls[0].container.children[1].textContent, /브이월드 준비 중/); assert.equal(e.storageWrites.length, 0);
  });
  await t.test('runtime-config-activates-only-tile-layer-preserving-camera', () => {
    const before = { ...e.map.center, zoom: e.map.zoom }; e.api.updateConfig({ vworldKey: testKey });
    assert.equal(e.state().active, 'vworld'); assert.deepEqual({ ...e.map.center, zoom: e.map.zoom }, before);
    assert.equal(e.map.layers.size, 1); assert.equal(e.map.hasLayer(e.osm), false);
    assert.deepEqual(JSON.parse(JSON.stringify(e.last().options)), { minZoom: 6, maxZoom: 19, maxNativeZoom: 19, tms: false, detectRetina: false, noWrap: true, attribution: '&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부' });
    assert.equal(e.timers.size, 1); e.last().fire('load'); assert.equal(e.timers.size, 0); assert.equal(e.state().reason, 'ready');
  });
  await t.test('coverage-and-zoom-fallback-and-automatic-return', () => {
    const old = e.last(), late = old.events.get('loading')[0];
    e.map.move(51, 0); assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'outside_view');
    late(); assert.equal(e.timers.size, 0); assert.equal(e.state().active, 'osm');
    e.map.move(36, 127); assert.equal(e.state().active, 'vworld'); assert.equal(e.created.length, 2);
    e.map.move(36, 127, 4); assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'zoom_out');
    e.map.move(36, 127, 6); assert.equal(e.state().active, 'vworld'); assert.equal(e.created.length, 3);
  });
  await t.test('explicit-OSM-choice-survives-view-and-config-changes', () => {
    e.api.setPreference('osm'); const count = e.created.length;
    e.map.move(55, 0, 4); e.map.move(36, 127, 14); e.api.updateConfig({ vworldKey: secondKey });
    assert.equal(e.state().active, 'osm'); assert.equal(e.created.length, count);
    assert.deepEqual(e.storageWrites.at(-1), ['birdmap.basemap.preference', 'osm']);
    const restored = environment({ stored: 'osm', key: testKey }); assert.equal(restored.state().active, 'osm'); assert.equal(restored.created.length, 0);
    assert.ok(e.storageWrites.every(([name, value]) => name === 'birdmap.basemap.preference' && ['osm', 'vworld'].includes(value)));
  });
  await t.test('three-errors-lock-same-key-until-explicit-retry', () => {
    e.api.setPreference('vworld'); const failing = e.last(); failing.fire('tileerror'); failing.fire('tileerror');
    assert.equal(e.state().active, 'vworld'); failing.fire('tileerror');
    assert.equal(e.state().active, 'osm'); assert.equal(e.state().locked, true); assert.equal(e.state().errors, 3); assert.equal(e.timers.size, 0);
    const count = e.created.length;
    e.map.move(36.1, 127.1); e.api.setPreference('osm'); e.api.setPreference('vworld'); e.api.updateConfig({ vworldKey: secondKey });
    assert.equal(e.created.length, count); assert.equal(e.state().reason, 'tile_error');
    e.api.updateConfig({ vworldKey: '' }); e.api.updateConfig({ vworldKey: secondKey }); assert.equal(e.created.length, count);
    e.api.setPreference('vworld', { retry: true }); assert.equal(e.created.length, count + 1); assert.equal(e.state().locked, false); assert.equal(e.state().errors, 0);
  });
  await t.test('deadline-fallback-new-config-and-late-events', () => {
    const old = e.last(), lateError = old.events.get('tileerror')[0], lateLoad = old.events.get('load')[0];
    assert.equal([...e.timers.values()][0].ms, 12000); e.expire();
    assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'tile_timeout'); assert.equal(e.state().locked, true);
    lateError(); lateLoad(); assert.equal(e.state().reason, 'tile_timeout'); assert.equal(e.timers.size, 0);
    e.api.updateConfig({ vworldKey: testKey }); assert.equal(e.state().active, 'vworld');
    e.api.updateConfig({ vworldKey: secondKey }); assert.equal(e.state().active, 'osm'); assert.equal(e.state().locked, true);
  });
  await t.test('rapid-toggle-cancels-deadlines-and-ignores-previous-generation', () => {
    e.api.updateConfig({ vworldKey: testKey }); const first = e.last(), oldError = first.events.get('tileerror')[0], oldLoading = first.events.get('loading')[0];
    const oldTimeout = [...e.timers.values()][0].fn;
    for (let i = 0; i < 20; i++) { e.api.setPreference('osm'); e.api.setPreference('vworld'); }
    const before = e.state(); oldError(); oldLoading(); oldTimeout(); assert.deepEqual(e.state(), before); assert.equal(e.timers.size, 1); assert.equal(e.map.layers.size, 1);
  });
  await t.test('controller-state-and-status-control-DOM-contain-no-credential-or-request-URL', () => {
    const snapshot = JSON.stringify(e.state()) + JSON.stringify(e.controls[0].container, (key, value) => key === 'listeners' ? undefined : value);
    assert.ok(!snapshot.includes(testKey)); assert.ok(!snapshot.includes(secondKey)); assert.ok(!snapshot.includes('api.vworld.kr'));
    const root = e.controls[0].container; assert.equal(root.attrs.role, 'group'); assert.equal(root.clickPropagationDisabled, true); assert.equal(root.scrollPropagationDisabled, true);
    assert.equal(root.children[1].attrs['aria-live'], 'polite'); assert.equal(root.children[0].children[0].attrs['aria-pressed'], 'true');
  });
  await t.test('mount-is-idempotent-and-destroy-cleans-up-and-restores-OSM', () => {
    assert.equal(e.window.BirdmapBasemap.mount({ ...e.args, config: { vworldKey: testKey } }), e.api);
    const stale = e.last().events.get('tileerror')[0]; e.api.destroy(); assert.equal(e.timers.size, 0); assert.equal(e.state().destroyed, true); assert.equal(e.state().active, 'osm');
    assert.equal(e.map.hasLayer(e.osm), true); assert.equal(e.map.layers.size, 1); assert.equal(e.controls[0].removed, true); assert.equal(e.map.events.get('moveend').length, 0);
    stale(); e.api.updateConfig({ vworldKey: secondKey }); assert.equal(e.api.setPreference('vworld'), false); assert.equal(e.timers.size, 0);
    const remounted = e.window.BirdmapBasemap.mount(e.args); assert.notEqual(remounted, e.api); remounted.destroy();
  });
  await t.test('unavailable-browser-storage-does-not-break-selection', () => {
    const noStorage = environment({ blockedStorage: true }); assert.equal(noStorage.api.setPreference('osm'), true); assert.equal(noStorage.state().active, 'osm'); noStorage.api.destroy();
  });
  await t.test('tile-layer-construction-error-falls-back-without-error-details', () => {
    const broken = environment({ key: testKey, tileCreationThrows: true }); assert.equal(broken.state().active, 'osm'); assert.equal(broken.state().locked, true); assert.equal(broken.state().reason, 'tile_error'); assert.equal(broken.timers.size, 0); broken.api.destroy();
  });
  await t.test('one-tile-fully-failed-batch-falls-back-and-locks', () => {
    const failed = environment({ key: testKey }); failed.last().fire('tileerror'); failed.last().fire('load');
    assert.equal(failed.state().active, 'osm'); assert.equal(failed.state().reason, 'tile_error'); assert.equal(failed.state().errors, 1); assert.equal(failed.state().locked, true); assert.equal(failed.timers.size, 0); failed.api.destroy();
  });
  await t.test('two-errors-with-successful-tile-show-partial-status-and-keep-VWorld', () => {
    const partial = environment({ key: testKey }); partial.last().fire('tileload'); partial.last().fire('tileerror'); partial.last().fire('tileerror'); partial.last().fire('load');
    assert.equal(partial.state().active, 'vworld'); assert.equal(partial.state().reason, 'partial_error'); assert.equal(partial.state().errors, 2); assert.equal(partial.state().locked, false); assert.equal(partial.state().loading, false); assert.equal(partial.timers.size, 0);
    assert.match(partial.controls[0].container.children[1].textContent, /일부 지도를 불러오지 못/);
    partial.last().fire('loading'); partial.last().fire('tileload'); partial.last().fire('load'); assert.equal(partial.state().reason, 'ready');
    partial.last().fire('loading'); partial.last().fire('tileerror'); assert.equal(partial.state().active, 'osm'); assert.equal(partial.state().errors, 3); partial.api.destroy();
  });
});

test('Worker mode uses the dedicated public endpoint and never falls back to a direct key', () => {
  const endpoint='https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles';
  const e=environment({config:{vworldMode:'worker',vworldTileEndpoint:endpoint,vworldKey:'IGNORED_SYNTHETIC_KEY'}});
  assert.equal(e.state().active,'vworld');assert.equal(e.state().transport,'worker');assert.equal(e.last()._url,endpoint+'/{z}/{x}/{y}.png');
  assert.equal(typeof e.last().options.bounds.contains,'function');
  const camera={...e.map.center,zoom:e.map.zoom};e.last().fire('tileerror');e.last().fire('tileerror');e.last().fire('tileerror');
  assert.equal(e.state().active,'osm');assert.equal(e.state().locked,true);assert.deepEqual({...e.map.center,zoom:e.map.zoom},camera);
  const count=e.created.length;e.map.move(36.1,127.1);e.api.updateConfig({vworldKey:'ANOTHER_IGNORED_SYNTHETIC_KEY'});e.api.setPreference('vworld');
  assert.equal(e.created.length,count);assert.equal(e.state().active,'osm');assert.ok(e.created.every(l=>!l._url.includes('api.vworld.kr')&&!l._url.includes('SYNTHETIC_KEY')));
  e.api.setPreference('vworld',{retry:true});assert.equal(e.created.length,count+1);assert.equal(e.state().active,'vworld');
  e.expire();assert.equal(e.state().active,'osm');assert.equal(e.state().reason,'tile_timeout');assert.equal(e.state().locked,true);
  e.api.destroy();assert.equal(e.map.hasLayer(e.osm),true);
});

test('Worker config fails closed for an empty/unapproved endpoint or implicit browser key', () => {
  for(const config of [{vworldKey:'SYNTHETIC_KEY'}, {vworldMode:'worker',vworldTileEndpoint:''},
    {vworldMode:'unknown',vworldTileEndpoint:'https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'https://example.com/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles?key=SYNTHETIC_KEY'},
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-tiles.wooil-birdmap.workers.dev.evil.invalid/tiles'}]){
    const e=environment({config});assert.equal(e.state().active,'osm');assert.equal(e.state().reason,'no_config');assert.equal(e.created.length,0);e.api.destroy();
  }
});
