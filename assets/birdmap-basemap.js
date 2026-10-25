/* Birdmap base-map selector: VWorld Base (default), Satellite, Hybrid (Satellite + road/label overlay) and OSM.
 * Worker mode keeps the upstream key off the browser. Explicit direct mode exposes its key in Leaflet and browser
 * request URLs. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'birdmap.basemap.preference';
  // A batch with no tile activity for this long falls back to OSM (the timer restarts on every loaded tile and on
  // tiles Leaflet cancels because the user zoomed).
  var TILE_BATCH_TIMEOUT_MS = 12000;
  // Per batch: this many failures with no success fails at once; at the batch end, this many failures that
  // outnumber the successes fail too. Scattered failures across a long session only show a partial notice.
  var MAX_TILE_ERRORS = 3;
  // Rapid taps between VWorld types: only the choice still selected after this pause requests tiles.
  var SWITCH_SETTLE_MS = 250;
  var instances = new WeakMap();
  // 'vworld' is the Base map (the original value, kept for saved preferences).
  var CHOICES = ['vworld', 'satellite', 'hybrid', 'osm'];
  var PRIMARY = { vworld: 'base', satellite: 'satellite', hybrid: 'satellite' };
  var TEMPLATES = {
    base: ['/{z}/{x}/{y}.png', 'Base/{z}/{y}/{x}.png'],
    satellite: ['/satellite/{z}/{x}/{y}.jpeg', 'Satellite/{z}/{y}/{x}.jpeg'],
    overlay: ['/hybrid/{z}/{x}/{y}.png', 'Hybrid/{z}/{y}/{x}.png']
  };
  var LABELS = {
    vworld: ['일반', '브이월드 일반지도 선택'],
    satellite: ['위성', '브이월드 위성영상 선택'],
    hybrid: ['하이브리드', '브이월드 하이브리드 선택'],
    osm: ['OSM', 'OSM 지도 선택']
  };

  function cleanKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function cleanEndpoint(value) {
    // This is the dedicated service in the dedicated Cloudflare account only (isolated-v1);
    // never accept an arbitrary relay URL or the shared production account's subdomain.
    var endpoint = typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
    return /^https:\/\/birdmap-vworld-tiles\.birdmap-vworld-isolated\.workers\.dev\/tiles$/.test(endpoint) ? endpoint : '';
  }

  function savedPreference() {
    try {
      var value = global.localStorage.getItem(STORAGE_KEY);
      if (CHOICES.indexOf(value) >= 0) return value;
    } catch (_) { /* Maps remain usable when browser storage is unavailable. */ }
    return 'vworld';
  }

  function savePreference(value) {
    try { global.localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* Optional preference only. */ }
  }

  function mount(options) {
    options = options || {};
    var map = options.map;
    var osm = options.osm;
    var L = global.L;
    if (!map || !osm || !L || !options.domesticBounds) {
      throw new Error('지도 선택기를 연결할 수 없습니다.');
    }
    if (instances.has(map)) {
      var existing = instances.get(map);
      if (options.config) existing.updateConfig(options.config);
      return existing;
    }

    // The application's domestic center policy is not a WMTS coverage guarantee.
    var domesticBounds = L.latLngBounds(options.domesticBounds);
    var initialConfig = options.config || {};
    var mode = initialConfig.vworldMode === undefined ? 'worker'
      : initialConfig.vworldMode === 'direct' || initialConfig.vworldMode === 'worker' ? initialConfig.vworldMode : '';
    var key = mode === 'direct' ? cleanKey(initialConfig.vworldKey) : '';
    var endpoint = cleanEndpoint(initialConfig.vworldTileEndpoint);
    var failedKeys = new Map();
    var preference = savedPreference();
    var active = 'osm';
    var reason = 'preparing';
    var errors = 0;
    var batchSuccesses = 0;
    var batchErrors = 0;
    var loading = false;
    var destroyed = false;
    var generation = 0;
    var deadline = null;
    var settle = null;
    var vworld = null;
    var vworldKind = '';
    var tileHandlers = null;
    // The Hybrid overlay fails on its own: losing it keeps the satellite imagery instead of falling back to OSM.
    var overlay = null;
    var overlayHandlers = null;
    var overlayDeadline = null;
    var overlayState = 'off';
    var overlayErrors = 0;
    var overlayBatchSuccesses = 0;
    var overlayBatchErrors = 0;
    var ui = null;
    var control = L.control({ position: 'topright' });

    function eligible() {
      return map.getZoom() >= 6 && domesticBounds.contains(map.getCenter());
    }

    function configId() {
      return mode === 'direct' && key ? 'direct:' + key : mode === 'worker' && endpoint ? 'worker:' + endpoint : '';
    }

    function lockId(kind) {
      return configId() ? configId() + '|' + kind : '';
    }

    function locked() {
      return preference !== 'osm' && !!lockId(PRIMARY[preference]) && failedKeys.has(lockId(PRIMARY[preference]));
    }

    function overlayLocked() {
      return preference === 'hybrid' && !!lockId('overlay') && failedKeys.has(lockId('overlay'));
    }

    function getState() {
      return {
        preference: preference,
        active: active,
        overlay: overlayState,
        transport: mode,
        reason: reason,
        eligible: eligible(),
        loading: loading,
        errors: errors,
        overlayErrors: overlayErrors,
        locked: locked(),
        overlayLocked: overlayLocked(),
        canRetry: !destroyed && preference !== 'osm' && (locked() || overlayLocked()) && eligible(),
        deadlinePending: deadline !== null,
        batchTimeoutMs: TILE_BATCH_TIMEOUT_MS,
        zoom: map.getZoom(),
        destroyed: destroyed
      };
    }

    function statusText() {
      if (reason === 'no_config') return '브이월드 준비 중 · OSM으로 볼 수 있어요';
      if (reason === 'zoom_out') return '지역을 확대하면 브이월드로 표시돼요';
      if (reason === 'outside_view') return '이 지역은 OSM으로 표시해요';
      if (reason === 'tile_timeout') return '지도 응답이 늦어 OSM으로 전환했어요';
      if (reason === 'tile_error') return '지도를 불러오지 못해 OSM으로 전환했어요';
      if (reason === 'partial_error') return '일부 지도를 불러오지 못했어요 · OSM을 선택할 수 있어요';
      if (preference === 'hybrid' && active === 'satellite') return '도로·지명 표시를 불러오지 못해 위성영상만 보여요';
      if (active === 'vworld') return loading ? '브이월드 지도를 불러오는 중…' : '브이월드 표시 중';
      if (active === 'satellite') return loading ? '위성영상을 불러오는 중…' : '위성영상 표시 중';
      if (active === 'hybrid') return loading ? '하이브리드 지도를 불러오는 중…' : '하이브리드 표시 중';
      return 'OSM 표시 중';
    }

    function render() {
      if (!ui) return;
      CHOICES.forEach(function (choice) { ui.buttons[choice].setAttribute('aria-pressed', String(preference === choice)); });
      ui.container.setAttribute('data-active-provider', active);
      ui.container.setAttribute('data-preference', preference);
      ui.status.textContent = statusText();
      ui.retry.hidden = !(preference !== 'osm' && (locked() || overlayLocked()));
      ui.retry.disabled = !eligible();
    }

    function clearDeadline() {
      if (deadline !== null) {
        global.clearTimeout(deadline);
        deadline = null;
      }
    }

    function clearOverlayDeadline() {
      if (overlayDeadline !== null) {
        global.clearTimeout(overlayDeadline);
        overlayDeadline = null;
      }
    }

    function clearSettle() {
      if (settle !== null) {
        global.clearTimeout(settle);
        settle = null;
      }
    }

    function current(token, layer) {
      return !destroyed && token === generation && active !== 'osm' && layer === vworld;
    }

    function overlayCurrent(token, layer) {
      return !destroyed && token === generation && layer === overlay;
    }

    function detachOverlay() {
      clearOverlayDeadline();
      var previous = overlay;
      var handlers = overlayHandlers;
      overlay = null;
      overlayHandlers = null;
      overlayState = 'off';
      if (previous) {
        if (handlers) previous.off(handlers);
        if (map.hasLayer(previous)) map.removeLayer(previous);
      }
    }

    function detachVworld() {
      generation++;
      clearDeadline();
      detachOverlay();
      var previous = vworld;
      var handlers = tileHandlers;
      vworld = null;
      vworldKind = '';
      tileHandlers = null;
      loading = false;
      active = 'osm';
      if (previous) {
        if (handlers) previous.off(handlers);
        if (map.hasLayer(previous)) map.removeLayer(previous);
      }
    }

    function showOsm(nextReason) {
      if (vworld) detachVworld();
      else clearDeadline();
      active = 'osm';
      loading = false;
      reason = nextReason;
      if (!map.hasLayer(osm)) osm.addTo(map);
      render();
    }

    function fail(nextReason, token, layer) {
      if (!current(token, layer)) return;
      // Remember failed credentials only in memory. Changing views or providers
      // cannot create an automatic retry loop for the same key in this session.
      failedKeys.set(lockId(vworldKind), nextReason);
      showOsm(nextReason);
    }

    function failOverlay(token, layer) {
      if (!overlayCurrent(token, layer)) return;
      failedKeys.set(lockId('overlay'), 'overlay_error');
      detachOverlay();
      overlayState = 'failed';
      if (active === 'hybrid') active = 'satellite';
      render();
    }

    function armDeadline(token, layer) {
      clearDeadline();
      var timer = global.setTimeout(function () {
        if (!current(token, layer) || deadline !== timer) return;
        deadline = null;
        fail('tile_timeout', token, layer);
      }, TILE_BATCH_TIMEOUT_MS);
      deadline = timer;
    }

    function armOverlayDeadline(token, layer) {
      clearOverlayDeadline();
      var timer = global.setTimeout(function () {
        if (!overlayCurrent(token, layer) || overlayDeadline !== timer) return;
        overlayDeadline = null;
        failOverlay(token, layer);
      }, TILE_BATCH_TIMEOUT_MS);
      overlayDeadline = timer;
    }

    function template(kind) {
      // Leaflet necessarily holds its request URL while a layer exists.
      // No credential, request URL, or error event is exposed by this API.
      return mode === 'worker' ? endpoint + TEMPLATES[kind][0]
        : 'https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/' + TEMPLATES[kind][1];
    }

    function tileOptions() {
      return {
        minZoom: 6,
        maxZoom: 19,
        maxNativeZoom: 19,
        tms: false,
        detectRetina: false,
        noWrap: true,
        // Wide domestic views can include neighboring tiles. Do not request
        // tiles the dedicated relay intentionally rejects outside its bounds.
        bounds: mode === 'worker' ? domesticBounds : undefined,
        attribution: '&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부'
      };
    }

    function showOverlay() {
      var token = generation;
      var layer;
      overlayErrors = 0;
      overlayBatchSuccesses = 0;
      overlayBatchErrors = 0;
      overlayState = 'loading';
      try {
        var opts = tileOptions();
        opts.zIndex = 2;
        layer = L.tileLayer(template('overlay'), opts);
        overlay = layer;
        overlayHandlers = {
          tileerror: function () {
            if (!overlayCurrent(token, layer)) return;
            overlayErrors++;
            overlayBatchErrors++;
            if (overlayBatchErrors >= MAX_TILE_ERRORS && overlayBatchSuccesses === 0) failOverlay(token, layer);
          },
          tileload: function () {
            if (!overlayCurrent(token, layer)) return;
            overlayBatchSuccesses++;
            if (overlayDeadline !== null) armOverlayDeadline(token, layer);
          },
          tileabort: function () {
            if (overlayCurrent(token, layer) && overlayDeadline !== null) armOverlayDeadline(token, layer);
          },
          loading: function () {
            if (!overlayCurrent(token, layer)) return;
            overlayErrors = 0;
            overlayBatchSuccesses = 0;
            overlayBatchErrors = 0;
            overlayState = 'loading';
            armOverlayDeadline(token, layer);
          },
          load: function () {
            if (!overlayCurrent(token, layer)) return;
            if ((overlayBatchErrors > 0 && overlayBatchSuccesses === 0)
              || (overlayBatchErrors >= MAX_TILE_ERRORS && overlayBatchErrors > overlayBatchSuccesses)) {
              failOverlay(token, layer);
              return;
            }
            clearOverlayDeadline();
            overlayState = 'ready';
            render();
          }
        };
        layer.on(overlayHandlers);
        armOverlayDeadline(token, layer);
        layer.addTo(map);
      } catch (_) {
        // Deliberately discard exception details: they can contain a tile URL.
        failedKeys.set(lockId('overlay'), 'overlay_error');
        if (overlayCurrent(token, layer)) failOverlay(token, layer);
        else { overlayState = 'failed'; if (active === 'hybrid') active = 'satellite'; }
      }
    }

    function showVworld() {
      var kind = PRIMARY[preference];
      var wantOverlay = preference === 'hybrid' && !overlayLocked();
      if (vworld && active !== 'osm' && vworldKind === kind) {
        // Same imagery (Satellite <-> Hybrid): keep the loaded layer and only add or drop the overlay.
        if (wantOverlay && !overlay) showOverlay();
        if (!wantOverlay && overlay) detachOverlay();
        active = preference === 'hybrid' && overlay ? 'hybrid' : preference === 'hybrid' ? 'satellite' : preference;
        render();
        return;
      }
      detachVworld();
      var token = generation;
      var layer;
      errors = 0;
      batchSuccesses = 0;
      batchErrors = 0;
      loading = true;
      reason = 'loading';
      try {
        layer = L.tileLayer(template(kind), tileOptions());
        vworld = layer;
        vworldKind = kind;
        active = preference === 'hybrid' ? (wantOverlay ? 'hybrid' : 'satellite') : preference;
        tileHandlers = {
          tileerror: function () {
            if (!current(token, layer)) return;
            errors++;
            batchErrors++;
            if (batchErrors >= MAX_TILE_ERRORS && batchSuccesses === 0) fail('tile_error', token, layer);
          },
          tileload: function () {
            if (!current(token, layer)) return;
            batchSuccesses++;
            if (deadline !== null) armDeadline(token, layer);
          },
          // Tiles cancelled by the user's own zoom are not an upstream failure: wait from the latest activity.
          tileabort: function () {
            if (current(token, layer) && deadline !== null) armDeadline(token, layer);
          },
          loading: function () {
            if (!current(token, layer)) return;
            errors = 0;
            batchSuccesses = 0;
            batchErrors = 0;
            loading = true;
            reason = 'loading';
            armDeadline(token, layer);
            render();
          },
          load: function () {
            if (!current(token, layer)) return;
            // Leaflet's load means that a batch finished, even if every tile
            // failed. A tiny failed batch must not masquerade as a ready map,
            // and neither may a batch where failures outnumber successes.
            if ((batchErrors > 0 && batchSuccesses === 0) || (batchErrors >= MAX_TILE_ERRORS && batchErrors > batchSuccesses)) {
              fail('tile_error', token, layer);
              return;
            }
            clearDeadline();
            loading = false;
            reason = batchErrors > 0 ? 'partial_error' : 'ready';
            render();
          }
        };
        layer.on(tileHandlers);
        if (map.hasLayer(osm)) map.removeLayer(osm);
        armDeadline(token, layer);
        render();
        layer.addTo(map);
        if (wantOverlay && current(token, layer)) showOverlay();
      } catch (_) {
        // Deliberately discard exception details: they can contain a tile URL.
        if (current(token, layer)) fail('tile_error', token, layer);
        else {
          failedKeys.set(lockId(kind), 'tile_error');
          showOsm('tile_error');
        }
      }
    }

    function reconcile() {
      if (destroyed) return;
      if (preference === 'osm') return showOsm('user_selected');
      if (!configId()) return showOsm('no_config');
      if (map.getZoom() < 6) return showOsm('zoom_out');
      if (!domesticBounds.contains(map.getCenter())) return showOsm('outside_view');
      if (locked()) return showOsm(failedKeys.get(lockId(PRIMARY[preference])));
      showVworld();
      render();
    }

    function setPreference(provider, action) {
      if (destroyed || CHOICES.indexOf(provider) < 0) return false;
      var retry = !!(action && action.retry === true);
      preference = provider;
      savePreference(provider);
      clearSettle();
      // Only an explicit retry action unlocks a failed layer. Merely selecting
      // it again, panning, or zooming never sends another failed request.
      if (provider !== 'osm' && retry && configId()) {
        failedKeys.delete(lockId(PRIMARY[provider]));
        if (provider === 'hybrid') failedKeys.delete(lockId('overlay'));
      }
      // Switching from one shown VWorld type to another waits for the taps to settle; the shown map stays meanwhile.
      if (provider !== 'osm' && !retry && vworld) {
        render();
        settle = global.setTimeout(function () { settle = null; reconcile(); }, SWITCH_SETTLE_MS);
        return true;
      }
      reconcile();
      return true;
    }

    function updateConfig(config) {
      if (destroyed || !config) return;
      var own = Object.prototype.hasOwnProperty;
      var nextMode = own.call(config, 'vworldMode') ? (config.vworldMode === 'direct' || config.vworldMode === 'worker' ? config.vworldMode : '') : mode;
      var nextKey = nextMode === 'direct' ? (own.call(config, 'vworldKey') ? cleanKey(config.vworldKey) : key) : '';
      var nextEndpoint = own.call(config, 'vworldTileEndpoint') ? cleanEndpoint(config.vworldTileEndpoint) : endpoint;
      if (nextMode === mode && nextKey === key && nextEndpoint === endpoint) return;
      detachVworld();
      mode = nextMode;
      key = nextKey;
      endpoint = nextEndpoint;
      errors = 0;
      reconcile();
    }

    function stopKeyPropagation(event) { event.stopPropagation(); }
    var choose = {};
    CHOICES.forEach(function (choice) { choose[choice] = function () { setPreference(choice); }; });
    function retryVworld() { setPreference(preference === 'osm' ? 'vworld' : preference, { retry: true }); }

    control.onAdd = function () {
      var container = document.createElement('div');
      container.className = 'birdmap-basemap';
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', '바탕지도');
      var choices = document.createElement('div');
      choices.className = 'birdmap-basemap__choices';
      var buttons = {};
      CHOICES.forEach(function (choice) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'birdmap-basemap__choice';
        button.textContent = LABELS[choice][0];
        button.setAttribute('aria-label', LABELS[choice][1]);
        button.addEventListener('click', choose[choice]);
        choices.appendChild(button);
        buttons[choice] = button;
      });
      var status = document.createElement('div');
      status.className = 'birdmap-basemap__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'birdmap-basemap__retry';
      retry.textContent = '다시 시도';
      retry.setAttribute('aria-label', '브이월드 지도 다시 시도');
      retry.hidden = true;
      container.appendChild(choices);
      container.appendChild(status);
      container.appendChild(retry);
      retry.addEventListener('click', retryVworld);
      container.addEventListener('keydown', stopKeyPropagation);
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      ui = { container: container, buttons: buttons, status: status, retry: retry };
      render();
      return container;
    };

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearSettle();
      map.off('zoomend moveend', reconcile);
      detachVworld();
      if (!map.hasLayer(osm)) osm.addTo(map);
      reason = 'destroyed';
      if (ui) {
        CHOICES.forEach(function (choice) { ui.buttons[choice].removeEventListener('click', choose[choice]); });
        ui.retry.removeEventListener('click', retryVworld);
        ui.container.removeEventListener('keydown', stopKeyPropagation);
      }
      control.remove();
      ui = null;
      key = '';
      endpoint = '';
      failedKeys.clear();
      instances.delete(map);
    }

    var api = { setPreference: setPreference, updateConfig: updateConfig, destroy: destroy, getState: getState };
    instances.set(map, api);
    // An explicit map minimum prevents Leaflet from raising the camera minimum
    // to the VWorld tile minimum when the OSM layer is temporarily removed.
    map.setMinZoom(4);
    control.addTo(map);
    map.on('zoomend moveend', reconcile);
    reconcile();
    return api;
  }

  global.BirdmapBasemap = { mount: mount };
})(window);
