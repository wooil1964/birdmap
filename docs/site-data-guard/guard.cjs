'use strict';
/* Runtime site-data guard shared by the existing Chrome harnesses.
 *
 * expected(): the ONLY source of truth. It runs site_data_contract.py --export, which first
 *   validates the candidate against the PR base, both approval ledgers and the Worker admin
 *   page, and fails instead of emitting data. Values read from the running page are compared
 *   with it and never used as the answer.
 * INIT_SCRIPT: installed before any page script. Accessors on window record every assignment of
 *   siteData/siteSpotData; the getter hands out a write-recording Proxy, so in-place writes from
 *   any script (index.html, assets, CDN, timers) are recorded while the app keeps working.
 *   Paths a harness never exercises are not observed; the static checks cover those as text only. */
const cp = require('node:child_process'), path = require('node:path'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..');
let cached;

function expected() {
  if (cached) return cached;
  const python = process.env.SITE_DATA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const out = cp.execFileSync(python, ['-B', path.join(ROOT, '.github/scripts/site_data_contract.py'), '--export', '-'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, PYTHONUTF8: '1' } });
  const data = JSON.parse(out);
  assert.ok(data && data.version === 1 && Array.isArray(data.siteData) && data.siteData.length > 0
    && Array.isArray(data.siteSpotData) && Number.isInteger(data.initialCount), 'validated site-data expectation');
  cached = Object.freeze(data);
  return cached;
}

// Runs in the page (and in Node unit tests against a plain object). Must stay self-contained.
function install(target, names) {
  if (target.__birdmapSiteDataGuard) return target.__birdmapSiteDataGuard;
  var rawOf = new WeakMap(), proxyOf = new WeakMap(), values = {}, assignments = [], writes = [];
  function where() { return String(new Error().stack || '').split('\n').slice(3, 6).join(' | ').slice(0, 400); }
  function note(kind, at) { if (writes.length < 200) writes.push({ kind: kind, path: at, stack: where() }); }
  function unwrap(value) { return value && typeof value === 'object' && rawOf.has(value) ? rawOf.get(value) : value; }
  function wrap(value, at) {
    if (!value || typeof value !== 'object') return value;
    if (rawOf.has(value)) return value;
    var existing = proxyOf.get(value);
    if (existing) return existing;
    var proxy = new Proxy(value, {
      get: function (t, key, receiver) { var v = Reflect.get(t, key, receiver); return typeof key === 'symbol' ? v : wrap(v, at + '.' + String(key)); },
      set: function (t, key, v) { note('set', at + '.' + String(key)); return Reflect.set(t, key, unwrap(v)); },
      defineProperty: function (t, key, d) { note('define', at + '.' + String(key)); return Reflect.defineProperty(t, key, d); },
      deleteProperty: function (t, key) { note('delete', at + '.' + String(key)); return Reflect.deleteProperty(t, key); },
      setPrototypeOf: function (t, p) { note('prototype', at); return Reflect.setPrototypeOf(t, p); },
      preventExtensions: function (t) { note('preventExtensions', at); return Reflect.preventExtensions(t); }
    });
    proxyOf.set(value, proxy); rawOf.set(proxy, value);
    return proxy;
  }
  function plain(value) { return Array.isArray(value) ? value.map(unwrap) : unwrap(value); }
  var getters = {};
  names.forEach(function (name) {
    getters[name] = function () { return wrap(values[name], name); };
    // Non-configurable, like a real `var` global: the accessor cannot be deleted or redefined, so a
    // defineProperty/delete on window cannot swap the data past the recorder.
    Object.defineProperty(target, name, {
      configurable: false, enumerable: true,
      get: getters[name],
      set: function (value) {
        value = plain(value);
        var json = null; try { json = JSON.stringify(value); } catch (error) { json = null; }
        assignments.push({ name: name, json: json, stack: where() });
        values[name] = value;
      }
    });
  });
  var api = {
    report: function () {
      var current = {}, intact = {};
      names.forEach(function (name) {
        var d = Object.getOwnPropertyDescriptor(target, name);
        intact[name] = !!d && d.get === getters[name];
        try { current[name] = JSON.stringify(values[name]); } catch (error) { current[name] = null; }
      });
      return { assignments: assignments.map(function (a) { return { name: a.name, json: a.json, stack: a.stack }; }), writes: writes.slice(), current: current, intact: intact };
    }
  };
  Object.defineProperty(target, '__birdmapSiteDataGuard', { value: api, configurable: false, enumerable: false, writable: false });
  return api;
}

const NAMES = ['siteData', 'siteSpotData'];
const INIT_SCRIPT = '(' + install.toString() + ')(window,' + JSON.stringify(NAMES) + ');';
const REPORT = 'window.__birdmapSiteDataGuard?window.__birdmapSiteDataGuard.report():null';

function same(actual, wanted) { try { assert.deepStrictEqual(actual, wanted); return true; } catch { return false; } }

// Compare a guard report with the validated expectation. Returns {pass, problems, evidence}.
function compare(report, data = expected()) {
  const problems = [];
  if (!report) return { pass: false, problems: ['guard not installed before page scripts'], evidence: {} };
  NAMES.forEach(name => { if (!report.intact || report.intact[name] !== true) problems.push(name + ' accessor was replaced'); });
  const sequence = report.assignments.map(a => a.name);
  if (JSON.stringify(sequence) !== JSON.stringify(['siteData', 'siteData', 'siteSpotData']))
    problems.push('unexpected assignment sequence: ' + sequence.join(','));
  const parse = text => { try { return JSON.parse(text); } catch { return undefined; } };
  const first = report.assignments.find(a => a.name === 'siteData');
  const sites = report.assignments.filter(a => a.name === 'siteData')[1];
  const spots = report.assignments.find(a => a.name === 'siteSpotData');
  if (!first || !same(parse(first.json), data.siteData.slice(0, data.initialCount))) problems.push('initial siteData literal differs from validated data');
  if (!sites || !same(parse(sites.json), data.siteData)) problems.push('concatenated siteData differs from validated data');
  if (!spots || !same(parse(spots.json), data.siteSpotData)) problems.push('siteSpotData differs from validated data');
  if (!same(parse(report.current.siteData), data.siteData)) problems.push('current siteData differs from validated data');
  if (!same(parse(report.current.siteSpotData), data.siteSpotData)) problems.push('current siteSpotData differs from validated data');
  if (report.writes.length) problems.push(report.writes.length + ' in-place write(s) to protected data');
  return { pass: problems.length === 0, problems, evidence: { sequence, writes: report.writes.slice(0, 5), assignmentStacks: report.assignments.map(a => a.stack) } };
}

// Page-side map read: given only marker variable names, return what the page actually renders.
const MAP_PROBE = `(markerVars=>({
  markers: markerVars.map(v => { const m = window[v]; const p = m && m.getLatLng && m.getLatLng(); return p ? [p.lat, p.lng] : null; }),
  registry: typeof markerRegistry === 'object' ? Object.keys(markerRegistry).length : -1,
  spots: Array.from({ length: SPOT_COUNT }, (_, i) => { const l = typeof siteSpotLayers === 'object' && siteSpotLayers[i]; const p = l && l.getLatLng && l.getLatLng(); return p ? [p.lat, p.lng] : null; })
}))`;

function mapProbe(data = expected()) {
  return MAP_PROBE.replace('SPOT_COUNT', String(data.siteSpotData.length)) + '(' + JSON.stringify(data.siteData.map(s => s.markerVar)) + ')';
}

// Markers must sit on validated coordinates; spot layers, once created, must too.
function compareMap(observed, data = expected()) {
  const problems = [];
  if (observed.registry !== data.siteData.length) problems.push('marker registry has ' + observed.registry + ' entries');
  data.siteData.forEach((s, i) => { const p = observed.markers[i]; if (!p || p[0] !== s.lat || p[1] !== s.lon) problems.push('marker ' + s.id + ' at ' + JSON.stringify(p)); });
  data.siteSpotData.forEach((s, i) => { const p = observed.spots[i]; if (p && (p[0] !== s.lat || p[1] !== s.lon)) problems.push('spot ' + s.id + ' at ' + JSON.stringify(p)); });
  return { pass: problems.length === 0, problems: problems.slice(0, 20), evidence: { registry: observed.registry, spotLayers: observed.spots.filter(Boolean).length } };
}

// Directions are checked by DESTINATION, not by URL spelling: link format, labels and buttons may change
// freely, but every Kakao/Tmap destination must be a validated coordinate (or the validated kakaoMapUrl).
// Reviewed destination overrides hard-coded in index.html's popup builder (isYubudo / isGukhwado) are
// bound to ID and name; moving them means editing this list in the same PR, visible to review.
const ROUTE_OVERRIDES = Object.freeze({
  // Ferry departure point; links to the island itself must still match the validated site coordinate.
  '19': { name: '유부도', extra: [[35.97698056, 126.605575]] },
  // Directions go to the Janggo port search; no coordinate link to the island is offered.
  '156': { name: '국화도', extra: [], noSiteCoordinate: true, kakaoSearch: 'https://map.kakao.com/link/search/' + encodeURIComponent('장고항') },
});
const TOLERANCE = 1e-6; // Stored links round to 6 decimals (about 0.1 m).

// Coordinate navigation links in a popup: every Kakao /link/map/ or /link/to/ link (any scheme, so http fails
// later), and every kakaomap:// or tmap:// link. Name searches (/link/search/, nearby-service links) and
// place pages carry no coordinate and are not destinations.
const isRouteLink = href => /^(?:[a-z]+:)?\/\/(?:[^/]*\.)?map\.kakao\.com\/link\/(?:map|to)\//i.test(href) || /^(?:kakaomap|tmap):/i.test(href);

function kakaoDestination(href) {
  try {
    const u = new URL(href);
    const m = u.protocol === 'https:' && u.hostname === 'map.kakao.com'
      && decodeURIComponent(u.pathname).match(/^\/link\/(?:map|to)\/.*,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  } catch { return null; }
}

function tmapDestination(href) {
  if (typeof href !== 'string' || !href.startsWith('tmap://route?')) return null;
  const q = new URLSearchParams(href.slice('tmap://route?'.length));
  if (q.getAll('goaly').length !== 1 || q.getAll('goalx').length !== 1) return null; // Ambiguous duplicates fail.
  const lat = Number(q.get('goaly')), lon = Number(q.get('goalx'));
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

const near = (p, list) => !!p && list.some(d => Math.abs(p[0] - d[0]) <= TOLERANCE && Math.abs(p[1] - d[1]) <= TOLERANCE);
const destinationOf = href => href.startsWith('tmap:') ? tmapDestination(href) : kakaoDestination(href);

// Problems with the navigation links (all hrefs of the popup) for a validated site; [] = correct.
function siteRouteProblems(site, hrefs) {
  const override = ROUTE_OVERRIDES[site.id];
  if (override) assert.equal(site.name, override.name, 'route override ' + site.id + ' is bound to its reviewed site name');
  const destinations = [...(override && override.noSiteCoordinate ? [] : [[site.lat, site.lon]]), ...(override ? override.extra : [])];
  const routes = hrefs.filter(isRouteLink), problems = [];
  for (const href of routes) {
    if (!override && href === site.kakaoMapUrl) continue; // Validated data link.
    if (!near(destinationOf(href), destinations)) problems.push('destination ' + href);
  }
  const reviewedSearch = !!(override && override.kakaoSearch && hrefs.includes(override.kakaoSearch));
  if (site.country === '대한민국' && !routes.length && !reviewedSearch) problems.push('no directions link');
  return problems;
}

// Problems with the navigation links of a fixed observation spot popup.
function spotRouteProblems(spot, hrefs) {
  const routes = hrefs.filter(isRouteLink), problems = [];
  for (const href of routes) if (!near(destinationOf(href), [[spot.lat, spot.lon]])) problems.push('route ' + href);
  if (!routes.length) problems.push('no route link');
  return problems;
}

module.exports = { expected, install, INIT_SCRIPT, REPORT, compare, mapProbe, compareMap, siteRouteProblems, spotRouteProblems, kakaoDestination, tmapDestination, NAMES };
