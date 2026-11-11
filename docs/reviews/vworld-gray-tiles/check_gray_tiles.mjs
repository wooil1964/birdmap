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
        // `unanswered`: tiles of the batch still loading; `view`: the current view's tiles and how many loaded without an
        // error (set by a test; by default nothing is still loading and the view is whole).
        Object.assign(layer, { options, _url: url, unanswered: 0, view: { total: 1, loaded: 1 }, _unanswered() { return this.unanswered; }, _viewTiles() { return this.view; },
          addTo(target) { target.layers.add(this); this.fire('loading'); return this; } });
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
    // Runs `fn` as one turn: what its events defer waits until it returns (other events can come first meanwhile).
    hold(fn) { firing++; try { fn(); } finally { firing--; } while (!firing && nextTurn.length) nextTurn.shift()(); },
    timerMs: () => [...timers.values()].map(t => t.ms).sort((a, b) => a - b),
    state: () => JSON.parse(JSON.stringify(api.getState())) };
}

const WORKER = { vworldMode: 'worker', vworldTileEndpoint: 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles' };

// 11/11 gray-tile check (read-only investigation): which failures leave VWorld with holes instead of OSM.
const batch = (l, answers) => { l.fire('loading'); let left = answers.length; for (const a of answers) { left--; l.unanswered = left; l.fire(a === 'x' ? 'tileerror' : 'tileload'); } };
test('gray-tile paths: partial batches keep VWorld, remove OSM, schedule no recovery', () => {
  const e = environment({ config: WORKER }); const l = e.last();
  l.fire('tileload').fire('load');
  // 1920x1080 screen of 48 tiles, the limiter refusing the last 18 (any order gives the same verdict).
  batch(l, Array.from({ length: 48 }, (_, i) => i < 30 ? 'o' : 'x')); l.fire('load');
  const s = e.state();
  assert.deepEqual([s.active, s.reason, s.backdrop, s.locked, e.recoveries.size, e.map.hasLayer(e.osm)], ['vworld', 'partial_error', false, false, 0, false]);
  // A pan that reveals 2 new tiles, both refused: still partial (fewer than 3 failures).
  batch(l, ['x', 'x']); l.fire('load');
  assert.deepEqual([e.state().active, e.state().reason, e.recoveries.size], ['vworld', 'partial_error', 0]);
  // Choosing the same type again keeps the same layer (no new request for the holes).
  const n = e.created.length; e.api.setPreference('vworld'); e.settle(); assert.equal(e.created.length, n);
  // 3 new tiles all refused: outage -> OSM with a 60 s recovery.
  batch(l, ['x', 'x', 'x']);
  assert.deepEqual([e.state().active, e.state().reason, [...e.recoveries.values()].map(t => t.ms)], ['osm', 'tile_error', [60000]]);
  e.api.destroy();
});
test('hybrid: overlay outage keeps satellite; satellite partial keeps hybrid', () => {
  const e = environment({ config: WORKER, stored: 'hybrid' }); const [sat, over] = e.created.slice(-2);
  sat.fire('tileload').fire('load'); over.fire('tileload').fire('load');
  batch(sat, ['o', 'o', 'o', 'x']); sat.fire('load');
  assert.deepEqual([e.state().active, e.state().reason, e.state().overlay], ['hybrid', 'partial_error', 'ready']);
  batch(over, ['x', 'x', 'x']);
  assert.deepEqual([e.state().active, e.state().overlay, e.state().overlayLocked, [...e.recoveries.values()].map(t => t.ms)], ['satellite', 'failed', true, [60000]]);
  e.api.destroy();
});
