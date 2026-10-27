import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// In-memory controller regression. No browser, real credentials or network calls.
const source = readFileSync(new URL('../../assets/birdmap-basemap.js', import.meta.url), 'utf8');

// setTimeout(fn, 0) runs once the outermost event dispatch has returned, as the next turn would in the browser: what a
// handler defers is not done inside the event itself.
const nextTurn = [];
let firing = 0;
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
  fire(name, data) {
    firing++;
    try { for (const fn of [...(this.events.get(name) || [])]) fn(data); } finally { firing--; }
    while (!firing && nextTurn.length) nextTurn.shift()();
    return this;
  }
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
  // The per-type recovery timers (60 s and longer) are kept apart from the tile deadlines and the switch settle.
  const timers = new Map(), recoveries = new Map(), values = new Map(), storageWrites = [], created = [], controls = [];
  if (stored !== null) values.set('birdmap.basemap.preference', stored);
  const map = new Events();
  Object.assign(map, {
    center: { lat: 36, lng: 127 }, zoom: 10, minZoom: null, layers: new Set(),
    getCenter() { return this.center; }, getZoom() { return this.zoom; },
    // A view about 360/2^zoom degrees across (wide when zoomed out).
    getBounds() { const d = 180 / 2 ** this.zoom; return { s: this.center.lat - d, n: this.center.lat + d, w: this.center.lng - d, e: this.center.lng + d }; },
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
    setTimeout(fn, ms) { const id = nextTimer++; if (ms === 0) nextTurn.push(fn); else (ms >= 60000 ? recoveries : timers).set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); recoveries.delete(id); },
    L: {
      latLngBounds() { return { contains(v) { return v.s !== undefined ? v.s >= 32.9 && v.n <= 38.75 && v.w >= 124.5 && v.e <= 132 : v.lat >= 32.9 && v.lat <= 38.75 && v.lng >= 124.5 && v.lng <= 132; }, intersects(v) { return v.s <= 38.75 && v.n >= 32.9 && v.w <= 132 && v.e >= 124.5; } }; },
      // The controller's zoom-settling TileLayer subclass: in memory it is the plain layer below.
      TileLayer: { prototype: {}, extend() { return function (url, options) { return window.L.tileLayer(url, options); }; } },
      control(options) {
        const control = { options, addTo(target) { this.container = this.onAdd(target); controls.push(this); return this; }, remove() { this.removed = true; } };
        return control;
      },
      tileLayer(url, options) {
        if (tileCreationThrows) throw new Error('Tile construction failed');
        const layer = new Events();
        // `unanswered`: tiles of the batch still loading (set by a test; none by default).
        Object.assign(layer, { options, _url: url, unanswered: 0, _unanswered() { return this.unanswered; }, addTo(target) { target.layers.add(this); this.fire('loading'); return this; } });
        created.push(layer); return layer;
      },
      DomEvent: { disableClickPropagation(el) { el.clickPropagationDisabled = true; }, disableScrollPropagation(el) { el.scrollPropagationDisabled = true; } }
    }
  };
  vm.runInNewContext(source, { window, document: { createElement: name => new Element(name) }, WeakMap, Set });
  const args = { map, osm, domesticBounds: [[32.9, 124.5], [38.75, 132]], config: config || { vworldMode: 'direct', vworldKey: key } };
  const api = window.BirdmapBasemap.mount(args);
  return { api, window, args, map, osm, created, controls, timers, recoveries, values, storageWrites, last: () => created.at(-1),
    recover() { for (const [id, t] of [...recoveries.entries()]) { recoveries.delete(id); t.fn(); } },
    expire() { const [id, { fn }] = timers.entries().next().value; timers.delete(id); fn(); },
    expireLast() { const [id, { fn }] = [...timers.entries()].at(-1); timers.delete(id); fn(); },
    // Fires only the pending switch-settle timer (250 ms), leaving tile deadlines alone.
    settle() { for (const [id, t] of [...timers.entries()]) if (t.ms === 250) { timers.delete(id); t.fn(); } },
    timerMs: () => [...timers.values()].map(t => t.ms).sort((a, b) => a - b),
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
    assert.equal(e.map.layers.size, 2); assert.equal(e.map.hasLayer(e.osm), true, 'the OSM shown so far stays until the first VWorld batch');
    assert.deepEqual(JSON.parse(JSON.stringify(e.last().options)), { minZoom: 4, minNativeZoom: 6, maxZoom: 19, maxNativeZoom: 19, zIndex: 2, tms: false, detectRetina: false, noWrap: true, attribution: '&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부' });
    assert.equal(e.timers.size, 1); e.last().fire('tileload').fire('load'); assert.equal(e.timers.size, 0); assert.equal(e.state().reason, 'ready');
    assert.equal(e.map.layers.size, 1); assert.equal(e.map.hasLayer(e.osm), false);
  });
  await t.test('coverage-and-zoom-fallback-and-automatic-return', () => {
    const old = e.last(), late = old.events.get('loading')[0];
    e.map.move(51, 0); assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'outside_view');
    late(); assert.equal(e.timers.size, 0); assert.equal(e.state().active, 'osm');
    e.map.move(36, 127); assert.equal(e.state().active, 'vworld'); assert.equal(e.created.length, 2);
    // Zoom 4-5: the same VWorld layer stays (z6 tiles scaled down); only below the map minimum is it OSM.
    e.map.move(36, 127, 4); assert.equal(e.state().active, 'vworld'); assert.equal(e.created.length, 2);
    e.map.move(36, 127, 3); assert.equal(e.state().active, 'osm'); assert.equal(e.state().reason, 'zoom_out');
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
    // A batch of three tiles answering one by one: decided when the last one fails.
    e.api.setPreference('vworld'); const failing = e.last(); failing.unanswered = 2; failing.fire('tileerror'); failing.unanswered = 1; failing.fire('tileerror');
    assert.equal(e.state().active, 'vworld'); failing.unanswered = 0; failing.fire('tileerror');
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
    // One VWorld layer, with the OSM it came from underneath until its batch loads.
    const before = e.state(); oldError(); oldLoading(); oldTimeout(); assert.deepEqual(e.state(), before); assert.equal(e.timers.size, 1); assert.equal(e.map.layers.size, 2);
    e.last().fire('tileload').fire('load'); assert.deepEqual([e.map.layers.size, e.map.hasLayer(e.osm)], [1, false]);
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
    const failed = environment({ key: testKey }); failed.last().fire('tileerror'); failed.last().fire('tileload').fire('load');
    assert.equal(failed.state().active, 'osm'); assert.equal(failed.state().reason, 'tile_error'); assert.equal(failed.state().errors, 1); assert.equal(failed.state().locked, true); assert.equal(failed.timers.size, 0); failed.api.destroy();
  });
  await t.test('two-errors-with-successful-tile-show-partial-status-and-keep-VWorld', () => {
    const partial = environment({ key: testKey }); partial.last().fire('tileload'); partial.last().fire('tileerror'); partial.last().fire('tileerror'); partial.last().fire('tileload').fire('load');
    assert.equal(partial.state().active, 'vworld'); assert.equal(partial.state().reason, 'partial_error'); assert.equal(partial.state().errors, 2); assert.equal(partial.state().locked, false); assert.equal(partial.state().loading, false); assert.equal(partial.timers.size, 0);
    assert.match(partial.controls[0].container.children[1].textContent, /일부 지도를 불러오지 못/);
    partial.last().fire('loading'); partial.last().fire('tileload'); partial.last().fire('tileload').fire('load'); assert.equal(partial.state().reason, 'ready');
    // Errors are counted per batch: two old errors plus one new one is not an outage.
    partial.last().fire('loading'); partial.last().fire('tileerror'); assert.equal(partial.state().active, 'vworld'); assert.equal(partial.state().errors, 1);
    partial.last().fire('tileerror'); partial.last().fire('tileerror'); assert.equal(partial.state().active, 'osm'); assert.equal(partial.state().errors, 3); partial.api.destroy();
  });
});

test('Worker mode uses the dedicated public endpoint and never falls back to a direct key', () => {
  const endpoint='https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles';
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
    {vworldMode:'unknown',vworldTileEndpoint:'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles'}, // shared production account: refused
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-isolated.workers.dev/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'http://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'https://example.com/tiles'},
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles?key=SYNTHETIC_KEY'},
    {vworldMode:'worker',vworldTileEndpoint:'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev.evil.invalid/tiles'}]){
    const e=environment({config});assert.equal(e.state().active,'osm');assert.equal(e.state().reason,'no_config');assert.equal(e.created.length,0);e.api.destroy();
  }
});

test('Satellite, Hybrid and OSM choices: overlay-only fallback, independent locks, camera untouched', () => {
  const endpoint = 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles';
  const e = environment({ config: { vworldMode: 'worker', vworldTileEndpoint: endpoint } });
  const camera = () => ({ ...e.map.center, zoom: e.map.zoom }), start = camera();
  const root = e.controls[0].container, buttons = root.children[0].children, status = () => root.children[1].textContent, retry = root.children[2];
  assert.deepEqual(buttons.map(b => [b.textContent, b.attrs['aria-label'], b.attrs['aria-pressed']]),
    [['일반', '브이월드 일반지도 선택', 'true'], ['위성', '브이월드 위성영상 선택', 'false'], ['하이브리드', '브이월드 하이브리드 선택', 'false'], ['OSM', 'OSM 지도 선택', 'false']]);
  buttons[1].click(); e.settle();
  const satellite = e.last();
  assert.deepEqual([e.state().active, satellite._url, e.map.layers.size, buttons[1].attrs['aria-pressed']], ['satellite', endpoint + '/satellite/{z}/{x}/{y}.jpeg', 1, 'true']);
  satellite.fire('tileload').fire('load'); assert.equal(status(), '위성영상 표시 중');
  const count = e.created.length; buttons[2].click(); e.settle();
  const overlay = e.last();
  assert.equal(e.created.length, count + 1, 'Hybrid reuses the loaded satellite layer and adds only the overlay');
  assert.deepEqual([overlay._url, overlay.options.zIndex, e.map.layers.size, e.state().active], [endpoint + '/hybrid/{z}/{x}/{y}.png', 3, 2, 'hybrid']);
  assert.ok(e.map.hasLayer(satellite) && e.map.hasLayer(overlay) && !e.map.hasLayer(e.osm));
  overlay.unanswered = 2; overlay.fire('tileerror'); overlay.unanswered = 1; overlay.fire('tileerror'); assert.equal(e.state().active, 'hybrid'); overlay.unanswered = 0; overlay.fire('tileerror');
  assert.deepEqual([e.state().active, e.state().overlay, e.state().overlayLocked, e.state().preference], ['satellite', 'failed', true, 'hybrid']);
  assert.ok(e.map.hasLayer(satellite) && !e.map.hasLayer(overlay) && !e.map.hasLayer(e.osm), 'overlay failure keeps the satellite imagery, not OSM');
  assert.equal(status(), '도로·지명 표시를 불러오지 못해 위성영상만 보여요'); assert.equal(retry.hidden, false);
  e.api.setPreference('satellite'); e.api.setPreference('hybrid'); e.settle(); assert.equal(e.created.length, count + 1, 'a failed overlay is not retried by reselecting');
  e.api.setPreference('hybrid', { retry: true }); assert.equal(e.created.length, count + 2); assert.equal(e.state().active, 'hybrid'); assert.ok(e.map.hasLayer(satellite));
  const overlay2 = e.last(); overlay2.fire('loading'); overlay2.fire('tileerror'); overlay2.fire('tileload').fire('load'); assert.equal(e.state().active, 'satellite', 'a fully failed overlay batch drops the overlay');
  e.api.setPreference('vworld'); e.settle(); assert.deepEqual([e.state().active, e.last()._url, e.map.layers.size], ['vworld', endpoint + '/{z}/{x}/{y}.png', 1]);
  e.api.setPreference('hybrid', { retry: true }); const sat2 = e.created.at(-2), ov3 = e.last();
  assert.deepEqual([sat2._url.endsWith('.jpeg'), ov3._url.endsWith('/hybrid/{z}/{x}/{y}.png'), e.map.layers.size], [true, true, 2]);
  sat2.fire('tileerror'); sat2.fire('tileerror'); sat2.fire('tileerror');
  assert.deepEqual([e.state().active, e.state().reason, e.state().locked, e.map.layers.size, e.map.hasLayer(e.osm)], ['osm', 'tile_error', true, 1, true], 'failed satellite imagery falls back to OSM and drops the overlay');
  const n = e.created.length; e.api.setPreference('satellite'); assert.equal(e.created.length, n, 'satellite stays locked');
  e.api.setPreference('vworld'); assert.equal(e.state().active, 'vworld', 'the Base lock is independent'); assert.equal(e.created.length, n + 1);
  e.api.setPreference('osm'); assert.deepEqual([e.state().active, e.map.layers.size, e.map.hasLayer(e.osm)], ['osm', 1, true]);
  assert.deepEqual(camera(), start, 'switching map types never moves the camera');
  assert.ok(e.storageWrites.every(([, value]) => ['vworld', 'satellite', 'hybrid', 'osm'].includes(value)));
  e.api.destroy(); assert.equal(e.map.layers.size, 1); assert.equal(e.timers.size, 0);
});
test('Hybrid overlay timeout keeps satellite; satellite timeout falls back to OSM; saved choices and direct URLs', () => {
  const endpoint = 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles';
  const h = environment({ stored: 'hybrid', config: { vworldMode: 'worker', vworldTileEndpoint: endpoint } });
  assert.deepEqual([h.state().active, h.map.layers.size, h.timers.size], ['hybrid', 2, 2]);
  h.created[0].fire('tileload').fire('load'); h.expireLast();
  assert.deepEqual([h.state().active, h.state().overlay, h.map.layers.size], ['satellite', 'failed', 1]);
  assert.equal(h.timers.size, 0, 'no deadline left once the base batch loaded and the overlay was dropped'); h.api.destroy();
  const t = environment({ stored: 'hybrid', config: { vworldMode: 'worker', vworldTileEndpoint: endpoint } });
  t.expire(); assert.deepEqual([t.state().active, t.state().reason, t.map.layers.size, t.timers.size], ['osm', 'tile_timeout', 1, 0]); t.api.destroy();
  for (const [stored, active] of [['satellite', 'satellite'], ['hybrid', 'hybrid'], ['vworld', 'vworld'], ['osm', 'osm'], ['gray', 'vworld'], ['Satellite', 'vworld']]) {
    const s = environment({ stored, config: { vworldMode: 'worker', vworldTileEndpoint: endpoint } }); assert.equal(s.state().active, active, stored); s.api.destroy();
  }
  const d = environment({ stored: 'hybrid', key: 'LOCAL_SIMULATION_CREDENTIAL_C' });
  assert.deepEqual(d.created.map(l => l._url), ['https://api.vworld.kr/req/wmts/1.0.0/LOCAL_SIMULATION_CREDENTIAL_C/Satellite/{z}/{y}/{x}.jpeg', 'https://api.vworld.kr/req/wmts/1.0.0/LOCAL_SIMULATION_CREDENTIAL_C/Hybrid/{z}/{y}/{x}.png']);
  assert.ok(!JSON.stringify(d.state()).includes('LOCAL_SIMULATION_CREDENTIAL_C')); d.api.destroy();
});
// Fast switching and tile faults (reported 10/26: quick type changes ended on OSM).
const WORKER = { vworldMode: 'worker', vworldTileEndpoint: 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles' };
test('rapid VWorld type taps request tiles only for the choice that stays selected; OSM and retry act at once', () => {
  const e = environment({ config: WORKER });
  e.last().fire('tileload').fire('load'); const shown = e.last(), n = e.created.length;
  for (const p of ['satellite', 'hybrid', 'vworld', 'satellite', 'hybrid', 'satellite']) e.api.setPreference(p);
  assert.equal(e.created.length, n, 'no tile layer for intermediate taps'); assert.ok(e.map.hasLayer(shown), 'the shown map stays meanwhile');
  assert.deepEqual(e.timerMs(), [250], 'one pending settle, no tile deadline'); assert.equal(e.state().preference, 'satellite');
  e.settle(); assert.equal(e.created.length, n + 1); assert.ok(e.last()._url.endsWith('/satellite/{z}/{x}/{y}.jpeg')); assert.equal(e.state().active, 'satellite');
  assert.ok(!e.map.hasLayer(shown), 'the previous type is removed');
  e.api.setPreference('hybrid'); e.api.setPreference('osm'); assert.deepEqual([e.state().active, e.timerMs()], ['osm', []], 'OSM cancels a pending switch at once');
  e.api.setPreference('vworld'); assert.equal(e.state().active, 'vworld', 'from OSM the first VWorld choice is immediate');
  e.last().fire('tileerror'); e.last().fire('tileerror'); e.last().fire('tileerror'); assert.equal(e.state().locked, true);
  const m = e.created.length; e.api.setPreference('vworld', { retry: true }); assert.equal(e.created.length, m + 1, 'explicit retry is immediate');
  e.api.setPreference('satellite'); e.api.destroy(); assert.equal(e.timers.size, 0, 'destroy clears a pending switch'); assert.equal(e.created.length, m + 1);
});
test('scattered tile errors across many batches never lock; a batch mostly failing or failing outright does', () => {
  const e = environment({ config: WORKER }); const l = e.last();
  for (let batch = 0; batch < 12; batch++) {
    l.fire('loading'); for (let i = 0; i < 20; i++) l.fire('tileload'); l.fire('tileerror'); l.fire('tileerror'); l.fire('tileload').fire('load');
  }
  assert.deepEqual([e.state().active, e.state().reason, e.state().locked], ['vworld', 'partial_error', false], '24 errors spread over 12 batches of 22 tiles');
  l.fire('loading'); for (let i = 0; i < 20; i++) l.fire('tileload'); for (let i = 0; i < 4; i++) l.fire('tileerror'); l.fire('tileload').fire('load');
  assert.equal(e.state().active, 'vworld', '4 of 24 failing in one batch is partial, not an outage');
  // 5 failing of 7 after 2 loaded: decided once the failures outnumber everything that could still load (the 4th).
  l.fire('loading'); l.fire('tileload'); l.fire('tileload');
  for (const left of [4, 3, 2]) { l.unanswered = left; l.fire('tileerror'); }
  assert.equal(e.state().active, 'vworld', '3 failed, 2 loaded, 2 unanswered: not decided yet');
  l.unanswered = 1; l.fire('tileerror'); assert.deepEqual([e.state().active, e.state().reason, e.state().locked], ['osm', 'tile_error', true], '4 failed of 7 cannot become a minority: falls back');
  const o = environment({ config: WORKER }); const ol = o.last();
  ol.fire('loading'); ol.fire('tileerror'); ol.fire('tileerror'); ol.fire('tileerror');
  assert.deepEqual([o.state().active, o.state().reason], ['osm', 'tile_error'], 'three failures with no success fall back at once (outage)');
  const n = o.created.length; o.map.move(36.2, 127.2); o.map.move(36, 127, 12); o.api.setPreference('vworld');
  assert.equal(o.created.length, n, 'after an outage no request is sent by panning, zooming or reselecting (no retry storm)');
  o.api.destroy(); e.api.destroy();
});
test('the 12 s deadline restarts on tile progress and still fires when nothing loads', () => {
  const e = environment({ config: WORKER }); const l = e.last();
  assert.deepEqual(e.timerMs(), [12000]);
  const first = [...e.timers.keys()][0]; l.fire('tileload');
  assert.deepEqual(e.timerMs(), [12000]); assert.notEqual([...e.timers.keys()][0], first, 'a loaded tile restarts the deadline');
  for (let i = 0; i < 30; i++) l.fire('tileload'); assert.equal(e.timers.size, 1, 'one deadline at a time');
  const beforeAbort = [...e.timers.keys()][0]; l.fire('tileabort');
  assert.notEqual([...e.timers.keys()][0], beforeAbort, 'tiles cancelled by the user zooming restart the deadline too');
  l.fire('tileerror'); e.expire(); assert.deepEqual([e.state().active, e.state().reason, e.state().locked], ['osm', 'tile_timeout', true], 'no progress for 12 s falls back');
  e.api.destroy();
  const h = environment({ stored: 'hybrid', config: WORKER }); const [sat, ov] = h.created;
  sat.fire('tileload').fire('load'); assert.deepEqual(h.timerMs(), [12000], 'only the overlay deadline is left');
  const k = [...h.timers.keys()][0]; ov.fire('tileload'); assert.notEqual([...h.timers.keys()][0], k, 'overlay progress restarts its deadline');
  ov.fire('loading'); for (let i = 0; i < 3; i++) ov.fire('tileload'); for (let i = 0; i < 3; i++) ov.fire('tileerror'); ov.fire('tileload').fire('load');
  assert.equal(h.state().active, 'hybrid', 'overlay with errors not outnumbering successes stays');
  ov.fire('loading'); ov.fire('tileerror'); ov.fire('tileerror'); ov.fire('tileerror');
  assert.deepEqual([h.state().active, h.state().overlay], ['satellite', 'failed'], 'overlay outage still drops only the overlay');
  h.api.destroy();
});
// The same tiles answering in another order gave another verdict (10/28, Codex): three failures first fell back, the
// same failures after a success did not. Now only the counts decide.
test('a batch verdict depends on how many tiles failed, not on the order they answered in', () => {
  const verdict = (answers, shown = true) => {
    const e = environment({ config: WORKER }); const l = e.last();
    if (shown) l.fire('tileload').fire('load');
    l.fire('loading'); let left = answers.length;
    for (const a of answers) { left--; l.unanswered = left; l.fire(a === 'x' ? 'tileerror' : 'tileload'); }
    if (e.state().active !== 'osm') l.fire('load');
    const s = e.state(); e.api.destroy(); return s.active + '/' + s.reason;
  };
  const batch = (failed, total) => Array.from({ length: total }, (_, i) => i < failed ? 'x' : 'o');
  for (const [failed, total, expected] of [[3, 24, 'vworld/partial_error'], [11, 24, 'vworld/partial_error'], [13, 24, 'osm/tile_error'], [18, 24, 'osm/tile_error'], [24, 24, 'osm/tile_error'], [2, 2, 'vworld/partial_error']]) {
    // Interleaved: the same answers permuted (7 is coprime with both totals).
    const errorsFirst = batch(failed, total), successesFirst = [...errorsFirst].reverse(), interleaved = errorsFirst.map((_, i) => errorsFirst[(i * 7) % total]);
    for (const order of [errorsFirst, successesFirst, interleaved]) assert.equal(verdict(order), expected, `${failed} of ${total} failing, ${order.slice(0, 4).join('')}…`);
  }
  assert.equal(verdict(['x', 'x'], false), 'osm/tile_error', 'a layer that has shown nothing and gets only failures falls back');
  assert.equal(verdict(['x', 'o'], false), 'vworld/partial_error', 'one of two failing on a new layer is partial');
});
// A batch whose last tiles were cancelled (zoom) or dropped (pan) is closed by the layer and judged like any other; only
// tiles that really loaded show the layer and end a run of recovery attempts (10/28, Codex: a cancelled batch with no
// tile loaded reset the pauses to 60 s).
test('a batch closed with no tile loaded neither shows the layer nor resets the recovery pauses', () => {
  const e = environment({ config: WORKER }); const l = e.last();
  l.fire('tileload').fire('load'); l.fire('loading'); assert.deepEqual(e.timerMs(), [12000]);
  l.fire('tileabort'); l.fire('load');
  assert.deepEqual([e.state().active, e.state().reason, e.timerMs()], ['vworld', 'ready', []], 'shown layer, nothing answered: ready, no deadline left');
  l.fire('loading'); l.unanswered = 3; l.fire('tileerror'); l.unanswered = 0; l.fire('tileabort'); l.fire('load');
  assert.deepEqual([e.state().active, e.state().reason, e.state().locked], ['vworld', 'partial_error', false], 'one failure, the rest cancelled: partial');
  e.api.destroy();
  const r = environment({ config: WORKER }); r.last().fire('tileerror');
  assert.deepEqual([r.state().active, r.state().recoveryAttempts, [...r.recoveries.values()].map(t => t.ms)], ['osm', 1, [60000]]);
  r.recover(); const a = r.last(); a.fire('tileabort'); a.fire('load');
  assert.deepEqual([r.state().active, r.state().reason, r.state().loading, r.state().deadlinePending, r.state().backdrop, r.state().recoveryAttempts], ['vworld', 'loading', true, false, true, 1],
    'the attempt\'s batch cancelled before any answer: OSM stays underneath, no deadline, the attempt still counts');
  a.fire('loading'); a.fire('tileerror');
  assert.deepEqual([r.state().active, [...r.recoveries.values()].map(t => t.ms)], ['osm', [120000]], 'failing then waits the next pause, not 60 s again');
  r.recover(); const b = r.last(); b.fire('loading'); b.unanswered = 4; b.fire('tileabort'); r.map.move(36.05, 127.05); b.fire('loading'); b.unanswered = 0; b.fire('tileload').fire('load');
  assert.deepEqual([r.state().active, r.state().reason, r.state().recoveryAttempts, r.state().backdrop], ['vworld', 'ready', 0, false], 'zoomed and panned during the attempt, a tile loaded: shown, OSM removed, pauses reset');
  r.api.destroy();
  const h = environment({ stored: 'hybrid', config: WORKER }); const [sat, ov] = h.created; sat.fire('tileload').fire('load'); ov.fire('tileerror');
  assert.deepEqual([h.state().active, h.state().overlay, [...h.recoveries.values()].map(t => t.ms)], ['satellite', 'failed', [60000]]);
  h.recover(); const ov2 = h.last(); ov2.fire('tileabort'); ov2.fire('load');
  assert.deepEqual([h.state().active, h.state().overlay], ['hybrid', 'loading'], 'the overlay alike: not ready without a loaded tile');
  ov2.fire('loading'); ov2.fire('tileerror'); assert.deepEqual([...h.recoveries.values()].map(t => t.ms), [120000]);
  h.api.destroy();
});
// Removing a layer inside its own 'load' threw in Leaflet (GridLayer._tileReady reads this._map._fadeAnimated after
// firing it; 10/28, Codex). The fallback now runs after the event has returned.
test('a failing layer is removed after its own Leaflet event has returned, and its late events change nothing', () => {
  for (const viaLoad of [false, true]) {
    const e = environment({ config: WORKER }); const l = e.last(), seen = [];
    l.on('tileerror load', () => seen.push(e.map.hasLayer(l)));
    l.unanswered = viaLoad ? 2 : 0; l.fire('tileerror');
    if (viaLoad) { l.unanswered = 0; l.fire('tileabort'); l.fire('load'); }
    assert.ok(seen.length > 0 && seen.every(Boolean), 'still on the map while its own event runs');
    assert.deepEqual([e.state().active, e.state().reason, e.map.hasLayer(l), e.timerMs()], ['osm', 'tile_error', false, []], viaLoad ? 'decided at load' : 'decided at the error');
    const before = e.state(); l.fire('tileerror'); l.fire('tileload'); l.fire('load'); l.fire('loading'); l.fire('tileabort');
    assert.deepEqual([e.state(), e.timerMs(), e.created.length], [before, [], 1], 'events of the removed layer change nothing');
    e.api.destroy();
  }
});
test('events of a replaced type or a removed overlay change nothing', () => {
  const e = environment({ config: WORKER }); const base = e.last(); base.fire('tileload').fire('load');
  const lateError = base.events.get('tileerror')[0], lateLoad = base.events.get('load')[0];
  e.api.setPreference('satellite'); e.settle(); const sat = e.last(); sat.fire('tileload').fire('load');
  const before = e.state(); for (let i = 0; i < 5; i++) lateError(); lateLoad(); assert.deepEqual(e.state(), before);
  e.api.setPreference('hybrid'); e.settle(); const ov = e.last(), lateOv = ov.events.get('tileerror')[0];
  e.api.setPreference('satellite'); e.settle(); for (let i = 0; i < 5; i++) lateOv(); assert.deepEqual([e.state().active, e.state().overlay, e.state().overlayLocked], ['satellite', 'off', false]);
  e.api.destroy();
});

// Fast zooming hit the Worker's per-IP limit (429) and locked OSM until the explicit retry (10/26); after one automatic
// attempt per session a later lock stayed OSM (10/27): attempts now repeat at growing pauses and a loaded batch resets them.
test('a failed type is tried again by itself after 60, 120, 240 and 480 s; then OSM stays with no further automatic request', () => {
  const e = environment({ config: WORKER }); const fail3 = l => { l.fire('tileerror'); l.fire('tileerror'); l.fire('tileerror'); };
  const pending = () => [...e.recoveries.values()].map(t => t.ms);
  fail3(e.last()); assert.deepEqual([e.state().active, e.state().locked, pending()], ['osm', true, [60000]]);
  const n = e.created.length; e.map.move(36.2, 127.2); e.api.setPreference('vworld'); assert.equal(e.created.length, n, 'still no request before the delay');
  e.recover(); assert.deepEqual([e.state().active, e.state().locked, e.created.length], ['vworld', false, n + 1], 'first automatic attempt');
  for (const [i, next] of [[1, [120000]], [2, [240000]], [3, [480000]], [4, []]]) {
    fail3(e.last()); assert.deepEqual([e.state().active, e.state().locked, pending()], ['osm', true, next], 'failure ' + (i + 1));
    if (next.length) { e.recover(); assert.equal(e.created.length, n + 1 + i, 'one layer per attempt'); }
  }
  e.map.move(36.3, 127.3); e.api.setPreference('vworld'); assert.equal(e.created.length, n + 4, 'after the last pause reselecting or moving sends nothing');
  e.api.setPreference('vworld', { retry: true }); assert.equal(e.created.length, n + 5, 'the explicit retry still works');
  e.api.destroy();
  const s = environment({ config: WORKER }); fail3(s.last()); s.recover(); s.last().fire('tileload').fire('load');
  assert.deepEqual([s.state().active, s.state().reason], ['vworld', 'ready'], 'the attempt loaded');
  fail3(s.last()); assert.deepEqual([...s.recoveries.values()].map(t => t.ms), [60000], 'a later lock starts again at 60 s');
  s.recover(); s.last().fire('tileload'); s.last().fire('tileerror'); s.last().fire('tileload').fire('load'); assert.equal(s.state().reason, 'partial_error', 'a partial batch is shown too');
  s.last().fire('loading'); fail3(s.last()); assert.deepEqual([...s.recoveries.values()].map(t => t.ms), [60000], 'and resets the pauses as well'); s.api.destroy();
  const r = environment({ config: WORKER }); fail3(r.last()); r.api.setPreference('vworld', { retry: true });
  assert.equal(r.recoveries.size, 0, 'an explicit retry cancels the pending automatic one'); r.api.destroy();
  const o = environment({ config: WORKER }); fail3(o.last()); o.api.setPreference('osm'); const k = o.created.length; o.recover();
  assert.deepEqual([o.state().active, o.created.length], ['osm', k], 'a user who chose OSM meanwhile stays on OSM'); o.api.setPreference('vworld'); assert.equal(o.created.length, k + 1, 'and may go back to it at once');
  o.api.destroy();
  const d = environment({ config: WORKER }); fail3(d.last()); d.api.destroy(); assert.equal(d.recoveries.size, 0, 'destroy clears the pending attempt');
});
test('a failed Hybrid overlay is tried again after 60 s, then 120 s, on the shown satellite imagery; loading resets the pauses', () => {
  const h = environment({ stored: 'hybrid', config: WORKER }); const [sat, ov] = h.created;
  const pending = () => [...h.recoveries.values()].map(t => t.ms), fail3 = l => { l.fire('tileerror'); l.fire('tileerror'); l.fire('tileerror'); };
  sat.fire('tileload').fire('load'); fail3(ov);
  assert.deepEqual([h.state().active, h.state().overlay, pending()], ['satellite', 'failed', [60000]]);
  const n = h.created.length; h.recover(); const ov2 = h.last();
  assert.deepEqual([h.created.length, h.state().active, ov2._url.endsWith('/hybrid/{z}/{x}/{y}.png'), h.map.hasLayer(sat)], [n + 1, 'hybrid', true, true], 'only the overlay is requested again');
  fail3(ov2); assert.deepEqual([h.state().active, pending()], ['satellite', [120000]]);
  h.recover(); const ov3 = h.last(); ov3.fire('tileload').fire('load'); assert.deepEqual([h.state().active, h.state().overlay], ['hybrid', 'ready']);
  fail3(ov3); assert.deepEqual(pending(), [60000], 'after the overlay loaded a later failure starts again at 60 s');
  h.api.destroy();
});
test('the status line is drawn only for notices; the plain "표시 중" stays for screen readers', () => {
  const e = environment({ config: WORKER }); const root = e.controls[0].container;
  e.last().fire('tileload').fire('load'); assert.equal(root.attrs['data-notice'], 'false');
  e.map.move(36, 127, 3); assert.deepEqual([e.state().reason, root.attrs['data-notice']], ['zoom_out', 'true']);
  e.map.move(51, 0, 10); assert.deepEqual([e.state().reason, root.attrs['data-notice']], ['outside_view', 'true']);
  e.map.move(36, 127, 10); e.last().fire('tileload'); e.last().fire('tileerror'); e.last().fire('tileload').fire('load'); assert.deepEqual([e.state().reason, root.attrs['data-notice']], ['partial_error', 'true']);
  e.api.setPreference('osm'); assert.equal(root.attrs['data-notice'], 'false');
  e.api.setPreference('vworld'); e.last().fire('tileerror'); e.last().fire('tileerror'); e.last().fire('tileerror'); assert.deepEqual([e.state().reason, root.attrs['data-notice']], ['tile_error', 'true']);
  e.api.destroy();
  const n = environment(); assert.equal(n.controls[0].container.attrs['data-notice'], 'true', 'no config: the 준비 중 notice is shown'); n.api.destroy();
});

// Zooming out to 4-5 or reaching the border kept switching the whole map to OSM (10/26).
test('zoom 4-5: VWorld stays (z6 tiles scaled, no z4/z5 request); OSM fills around Korea only after the VWorld tiles loaded', () => {
  const e = environment({ config: WORKER }); const l = e.last(); l.fire('tileload').fire('load');
  assert.deepEqual([l.options.minZoom, l.options.minNativeZoom, l.options.maxNativeZoom], [4, 6, 19], 'Leaflet asks for z6 tiles below zoom 6');
  e.map.move(36, 127, 5.9); assert.deepEqual([e.state().active, e.state().backdrop, e.created.length, e.map.hasLayer(l)], ['vworld', true, 1, true]);
  e.map.move(36, 127, 4); assert.deepEqual([e.state().active, e.state().reason, e.state().backdrop, e.created.length], ['vworld', 'ready', true, 1]);
  assert.equal(e.controls[0].container.attrs['data-notice'], 'false', 'no notice: Korea is still VWorld');
  e.map.move(36, 127, 7); assert.deepEqual([e.state().active, e.state().backdrop, e.map.hasLayer(e.osm)], ['vworld', false, false], 'zoom 6+: OSM removed again');
  // While a batch is loading, OSM is not slipped underneath (it would show through over Korea); it comes with the load.
  l.fire('loading'); e.map.move(36, 127, 5); assert.equal(e.state().backdrop, false);
  l.fire('tileload'); l.fire('tileload').fire('load'); assert.equal(e.state().backdrop, true);
  e.api.destroy();
});
test('border areas: VWorld while any domestic area is in view, OSM underneath beyond the border, OSM only once the view has left', () => {
  const e = environment({ config: WORKER }); const l = e.last(); l.fire('tileload').fire('load');
  e.map.move(37.97, 124.45, 11); assert.deepEqual([e.state().active, e.state().backdrop, e.created.length], ['vworld', true, 1], '백령도, centre just west of the bound');
  e.map.move(32.85, 126.27, 11); assert.deepEqual([e.state().active, e.state().backdrop], ['vworld', true], '마라도, centre just south of the bound');
  e.map.move(37.24, 131.87, 12); assert.deepEqual([e.state().active, e.state().backdrop], ['vworld', false], '독도, view inside');
  e.map.move(33.0, 126.5, 10); assert.deepEqual([e.state().active, e.state().backdrop], ['vworld', true], 'south of 제주: centre inside, view past the bound');
  e.map.move(36.5, 127.5, 10); assert.equal(e.state().backdrop, false, 'whole view inside: no OSM');
  e.map.move(31.2, 121.5, 10); assert.deepEqual([e.state().active, e.state().reason], ['osm', 'outside_view'], 'Shanghai: no domestic area in view');
  e.map.move(36.5, 127.5, 10); assert.deepEqual([e.state().active, e.created.length, e.map.hasLayer(e.osm)], ['vworld', 2, true], 'back inside: VWorld over the OSM shown so far');
  e.last().fire('tileload').fire('load'); assert.equal(e.map.hasLayer(e.osm), false, 'OSM removed once VWorld has loaded');
  e.api.destroy();
});
test('an outage at zoom 5 (OSM already underneath): OSM takes over and stays while zooming; the one attempt at 60 s keeps OSM around Korea', () => {
  const e = environment({ config: WORKER }); const l = e.last(); l.fire('tileload').fire('load');
  e.map.move(36, 127, 5); assert.equal(e.state().backdrop, true);
  l.fire('loading'); l.fire('tileerror'); l.fire('tileerror'); l.fire('tileerror');
  assert.deepEqual([e.state().active, e.state().reason, e.state().locked, e.state().backdrop, e.map.hasLayer(e.osm), e.map.hasLayer(l)], ['osm', 'tile_error', true, false, true, false]);
  const n = e.created.length; e.map.move(36, 127, 8); e.map.move(36, 127, 4);
  assert.deepEqual([e.state().active, e.created.length, e.map.hasLayer(e.osm)], ['osm', n, true], 'zooming sends nothing and keeps OSM');
  e.recover(); assert.deepEqual([e.state().active, e.created.length, e.map.hasLayer(e.osm)], ['vworld', n + 1, true], 'one attempt; OSM stays around Korea');
  e.api.destroy();
});
test('the VWorld layers sit above the OSM layer (primary 2, overlay 3)', () => {
  const h = environment({ stored: 'hybrid', config: WORKER }); const [sat, ov] = h.created;
  assert.deepEqual([sat.options.zIndex, ov.options.zIndex, ov.options.minNativeZoom], [2, 3, 6]);
  h.api.destroy();
});
