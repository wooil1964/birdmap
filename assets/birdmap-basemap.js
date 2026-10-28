/* Birdmap base-map selector: VWorld Base (default), Satellite, Hybrid (Satellite + road/label overlay) and OSM.
 * Worker mode keeps the upstream key off the browser. Explicit direct mode exposes its key in Leaflet and browser
 * request URLs. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'birdmap.basemap.preference';
  // A batch with no tile activity for this long falls back to OSM (the timer restarts on every loaded tile and on
  // tiles Leaflet cancels because the user zoomed).
  var TILE_BATCH_TIMEOUT_MS = 12000;
  // Per batch, whatever order the tiles answer in (see outage()): at least this many failures that outnumber the tiles
  // loaded fail the batch, as do only failures on a layer that has shown nothing yet. Fewer failures keep VWorld with a
  // partial notice; scattered failures across a long session never add up.
  var MAX_TILE_ERRORS = 3;
  // Rapid taps between VWorld types: only the choice still selected after this pause requests tiles.
  var SWITCH_SETTLE_MS = 250;
  // A failed type (or the Hybrid overlay) is tried again by itself after the Worker's 60 s rate-limit window, then after
  // longer pauses while it keeps failing (one screen of tiles per attempt); after the last one OSM stays until the
  // explicit retry. A batch of that type loading again starts the sequence over.
  var RECOVERY_DELAYS_MS = [60000, 120000, 240000, 480000];
  // A recovery (which resets those pauses) needs a batch that ran to its end and left the current view loaded: at least
  // this share of its tiles without an error. A screen is 24 (1366x768) to 48 (1920x1080) tiles, so two to four stray
  // failures still count as recovered; a screen with more than one tile in ten missing, a cancelled batch or a single
  // loaded tile does not (10/28, Codex 2nd review).
  var RECOVERED_SHARE = 0.9;
  // The Worker serves zoom 6-19. Below 6 the z6 tiles are drawn scaled down (Leaflet minNativeZoom), so VWorld shows
  // from the map's minimum zoom (4) and the Worker never receives a z4/z5 request.
  var VWORLD_MIN_ZOOM = 4;
  var NATIVE_MIN_ZOOM = 6;
  // Runs of zooms (wheel or buttons): a zoom that starts within ZOOM_RUN_MS of the previous one ending continues the run
  // and requests nothing; the drawn tiles stay (scaled) and the level the map rests at is loaded after a pause that
  // follows the hand's rhythm: 1.25 x the longest of the last eight gaps between zooms of a run (kept across runs), at
  // least ZOOM_SETTLE_MS and at most ZOOM_RUN_MS, and never while a wheel notch is still in Leaflet's debounce. A lone
  // zoom loads at once as before. Pinches keep Leaflet's default: the levels passed through fill the edges as they open.
  // A wheel zoom takes ~290 ms (40 ms wheel debounce + 250 ms animation): flicks 0.6 s apart each loaded a whole screen
  // (10/27, PC 429), so did flicks 1 s apart with a fixed 400 ms pause (10/28); with 1.25 x the latest gap alone (or the
  // last three of the run) an uneven hand let the pause run out between two flicks and load a screen (10/28, 429 in
  // 5-17 s; at 1920x1080 one such screen already exceeds 180 requests a minute).
  var ZOOM_SETTLE_MS = 400;
  var ZOOM_RUN_MS = 900;
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
    var recoveries = new Map();
    var recoveryAttempts = new Map();
    var preference = savedPreference();
    var active = 'osm';
    var reason = 'preparing';
    var errors = 0;
    var batchSuccesses = 0;
    var batchErrors = 0;
    var loading = false;
    // The current VWorld layer has finished a batch (until then OSM, when it was showing, stays underneath).
    var drawn = false;
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
    var overlayDrawn = false;
    var ui = null;
    var control = L.control({ position: 'topright' });

    // VWorld while any of the domestic area is in view; OSM takes over only once the view has left it entirely.
    function eligible() {
      return map.getZoom() >= VWORLD_MIN_ZOOM && domesticBounds.intersects(map.getBounds());
    }

    // OSM underneath fills what VWorld has no tiles for: around Korea below zoom 6, and beyond the border whenever the
    // view reaches past the domestic area. It is added once the VWorld batch has loaded, so OSM does not show through
    // over Korea while VWorld tiles are on their way. Coming back from OSM (an automatic attempt or a choice), OSM stays
    // until the new layer's first batch has loaded: no blank map meanwhile, and nothing to reload if the attempt fails.
    function syncBackdrop() {
      if (active === 'osm') return;
      var want = map.getZoom() < NATIVE_MIN_ZOOM || !domesticBounds.contains(map.getBounds());
      if (want && !loading && !map.hasLayer(osm)) osm.addTo(map);
      if (!want && drawn && map.hasLayer(osm)) map.removeLayer(osm);
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
        backdrop: active !== 'osm' && map.hasLayer(osm),
        deadlinePending: deadline !== null,
        recoveryAttempts: preference === 'osm' ? 0 : recoveryAttempts.get(lockId(PRIMARY[preference])) || 0,
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
      // Notices (fallbacks, zoom/area hints, partial errors) are shown; the plain "표시 중" stays for screen readers.
      ui.container.setAttribute('data-notice', String(['no_config', 'zoom_out', 'outside_view', 'tile_timeout', 'tile_error', 'partial_error'].indexOf(reason) >= 0
        || (preference === 'hybrid' && active === 'satellite')));
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

    // Delayed retries per locked type (a rate-limit window passes; a real outage fails them again, at growing pauses).
    function scheduleRecovery(id) {
      var attempt = recoveryAttempts.get(id) || 0;
      if (!id || attempt >= RECOVERY_DELAYS_MS.length || recoveries.has(id)) return;
      recoveryAttempts.set(id, attempt + 1);
      recoveries.set(id, global.setTimeout(function () {
        recoveries.delete(id);
        if (destroyed || !failedKeys.has(id)) return;
        failedKeys.delete(id);
        reconcile();
      }, RECOVERY_DELAYS_MS[attempt]));
    }

    function clearRecovery(id) {
      if (!recoveries.has(id)) return;
      global.clearTimeout(recoveries.get(id));
      recoveries.delete(id);
    }

    // A batch's verdict from its counts alone, not the order the tiles answered in. Tiles still unanswered count as
    // possible successes, so a verdict before the batch ends is one its end could not change.
    function outage(failed, loaded, unanswered, shown) {
      return (failed >= MAX_TILE_ERRORS && failed > loaded + unanswered) || (failed > 0 && loaded + unanswered === 0 && !shown);
    }

    // A layer is never removed inside its own Leaflet event: GridLayer._tileReady goes on using this._map after firing
    // 'load' (removing the layer there threw on _fadeAnimated, 10/28). The fallback runs on the next turn, and only for
    // the same layer, generation and batch: a newer batch begun meanwhile is judged by its own tiles (10/28, Codex 2nd
    // review: an older batch's verdict removed the one that followed).
    function later(fn) {
      global.setTimeout(fn, 0);
    }

    // Whether a batch that has just finished ends a recovery (see RECOVERED_SHARE).
    function recovered(layer, e) {
      if (e && e.cancelled) return false;
      var view = layer._viewTiles();
      return view.total > 0 && view.loaded >= RECOVERED_SHARE * view.total;
    }

    function fail(nextReason, token, layer) {
      if (!current(token, layer)) return;
      // Remember failed credentials only in memory. Changing views or providers
      // cannot create an automatic retry loop for the same key in this session.
      failedKeys.set(lockId(vworldKind), nextReason);
      scheduleRecovery(lockId(vworldKind));
      showOsm(nextReason);
    }

    function failOverlay(token, layer) {
      if (!overlayCurrent(token, layer)) return;
      failedKeys.set(lockId('overlay'), 'overlay_error');
      scheduleRecovery(lockId('overlay'));
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

    // Leaflet 1.9 TileLayer that skips the levels a zoom burst only passes through (see ZOOM_SETTLE_MS). It overrides
    // the GridLayer zoom handlers only; pans, jumps (setView without animation), pinches and lone zooms load as before.
    var tileProto = L.TileLayer.prototype;
    var SettlingTileLayer = L.TileLayer.extend({
      _animateZoom: function (e) {
        // Only an animated zoom ending starts the clock for the next one (not a jump to a search result).
        this._zoomStarted = true;
        var gap = Date.now() - (this._zoomEndedAt || 0);
        // The end of a pinch is the only zoom animation Leaflet starts with noUpdate (it passes zoomSnap).
        var lone = e.noUpdate || (!this._zoomRest && gap > ZOOM_RUN_MS);
        if (lone) return tileProto._animateZoom.call(this, e);
        // The hand's recent rhythm, across runs: the last eight gaps between zooms of a run (lone zooms not counted).
        this._runGaps = (this._runGaps || []).concat(gap).slice(-8);
        this._restMs = Math.max(ZOOM_SETTLE_MS, Math.min(ZOOM_RUN_MS, Math.round(Math.max.apply(null, this._runGaps) * 1.25)));
        this._restAfterZoom();
        // Only rescale what is drawn: _setView would still load the new level (updateWhenZooming).
        this._setZoomTransforms(e.center, e.zoom);
      },
      _resetView: function (e) {
        var burst = e && e.type === 'zoom' && !e.pinch;
        if (burst && this._zoomStarted) { this._zoomEndedAt = Date.now(); this._zoomStarted = false; }
        if (!(burst && this._zoomRest)) return tileProto._resetView.call(this, e);
        this._restAfterZoom();
        this._setZoomTransforms(this._map.getCenter(), this._map.getZoom());
      },
      _onMoveEnd: function () {
        if (!this._zoomRest) tileProto._onMoveEnd.call(this);
      },
      _restAfterZoom: function () {
        var layer = this;
        global.clearTimeout(layer._zoomRest);
        layer._zoomRest = global.setTimeout(function () {
          var map = layer._map, wheel = map && map.scrollWheelZoom;
          // A zoom animation (250 ms) outlasts the pause, or a wheel notch waits in Leaflet's debounce: wait for the zoom;
          // its end restarts the pause.
          if (map && (map._animatingZoom || (wheel && wheel._startTime))) return layer._restAfterZoom();
          layer._zoomRest = null;
          if (map) tileProto._resetView.call(layer);
        }, layer._restMs || ZOOM_SETTLE_MS);
      },
      // The tiles of the current view at the current level: how many there are and how many loaded without an error.
      _viewTiles: function () {
        var range = this._pxBoundsToTileRange(this._getTiledPixelBounds(this._map.getCenter())), total = 0, loaded = 0;
        for (var key in this._tiles) {
          var tile = this._tiles[key];
          if (tile.coords.z !== this._tileZoom || !range.contains(tile.coords)) continue;
          total++;
          if (tile.loaded && tile.el.className.indexOf('leaflet-tile-loaded') >= 0) loaded++;
        }
        return { total: total, loaded: loaded };
      },
      // Tiles of this layer still loading, apart from `except` (the tile whose error is being fired: Leaflet marks it
      // answered only after its tileerror event).
      _unanswered: function (except) {
        var count = 0;
        for (var key in this._tiles) if (!this._tiles[key].loaded && this._tiles[key].el !== except) count++;
        return count;
      },
      // Leaflet fires 'load' only when a tile finishes. When the last tiles still loading are cancelled by a zoom
      // (_abortLoading) or dropped by a pan (_removeTile), the batch stays open with nothing left to load, and the 12 s
      // deadline would call the drawn map a timeout. Close it (marked cancelled) once Leaflet has queued whatever the new
      // view needs.
      _abortLoading: function () {
        tileProto._abortLoading.call(this);
        this._closeIdleBatch();
      },
      _removeTile: function (key) {
        tileProto._removeTile.call(this, key);
        this._closeIdleBatch();
      },
      _closeIdleBatch: function () {
        var layer = this;
        if (layer._idleCheck) return;
        layer._idleCheck = global.setTimeout(function () {
          layer._idleCheck = null;
          if (layer._map && layer._loading && layer._noTilesToLoad()) {
            layer._loading = false;
            layer.fire('load', { cancelled: true });
          }
        }, 0);
      },
      onRemove: function (target) {
        global.clearTimeout(this._zoomRest);
        this._zoomRest = null;
        var result = tileProto.onRemove.call(this, target);
        global.clearTimeout(this._idleCheck);
        this._idleCheck = null;
        return result;
      }
    });

    function tileOptions() {
      return {
        minZoom: VWORLD_MIN_ZOOM,
        minNativeZoom: NATIVE_MIN_ZOOM,
        maxZoom: 19,
        maxNativeZoom: 19,
        // Above the OSM layer (1) that fills around Korea when zoomed out.
        zIndex: 2,
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
      overlayDrawn = false;
      overlayState = 'loading';
      try {
        var opts = tileOptions();
        opts.zIndex = 3;
        layer = new SettlingTileLayer(template('overlay'), opts);
        overlay = layer;
        var batch = 0;
        var failLater = function () { var mine = batch; later(function () { if (mine === batch) failOverlay(token, layer); }); };
        overlayHandlers = {
          tileerror: function (e) {
            if (!overlayCurrent(token, layer)) return;
            overlayErrors++;
            overlayBatchErrors++;
            if (outage(overlayBatchErrors, overlayBatchSuccesses, layer._unanswered(e && e.tile), overlayDrawn)) failLater();
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
            batch++;
            overlayErrors = 0;
            overlayBatchSuccesses = 0;
            overlayBatchErrors = 0;
            overlayState = 'loading';
            armOverlayDeadline(token, layer);
          },
          load: function (e) {
            if (!overlayCurrent(token, layer)) return;
            if (outage(overlayBatchErrors, overlayBatchSuccesses, 0, overlayDrawn)) return failLater();
            clearOverlayDeadline();
            // Labels that really loaded show the overlay; only a finished, (nearly) whole view ends a recovery.
            if (overlayBatchSuccesses > 0) overlayDrawn = true;
            if (recovered(layer, e)) recoveryAttempts.delete(lockId('overlay'));
            overlayState = overlayDrawn ? 'ready' : 'loading';
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
      drawn = false;
      reason = 'loading';
      try {
        layer = new SettlingTileLayer(template(kind), tileOptions());
        vworld = layer;
        vworldKind = kind;
        active = preference === 'hybrid' ? (wantOverlay ? 'hybrid' : 'satellite') : preference;
        var batch = 0;
        var failLater = function () { var mine = batch; later(function () { if (mine === batch) fail('tile_error', token, layer); }); };
        tileHandlers = {
          tileerror: function (e) {
            if (!current(token, layer)) return;
            errors++;
            batchErrors++;
            if (outage(batchErrors, batchSuccesses, layer._unanswered(e && e.tile), drawn)) failLater();
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
            batch++;
            errors = 0;
            batchSuccesses = 0;
            batchErrors = 0;
            loading = true;
            reason = 'loading';
            armDeadline(token, layer);
            render();
          },
          load: function (e) {
            if (!current(token, layer)) return;
            // Leaflet's load means that a batch finished (or was cancelled), even if every tile failed: see outage().
            if (outage(batchErrors, batchSuccesses, 0, drawn)) return failLater();
            clearDeadline();
            // Tiles that really loaded make the layer shown (OSM may go); only a finished batch that left the current view
            // (nearly) whole ends a run of recovery attempts.
            if (batchSuccesses > 0) drawn = true;
            if (recovered(layer, e)) recoveryAttempts.delete(lockId(kind));
            loading = !drawn;
            reason = batchErrors > 0 ? 'partial_error' : drawn ? 'ready' : 'loading';
            syncBackdrop();
            render();
          }
        };
        layer.on(tileHandlers);
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
      if (map.getZoom() < VWORLD_MIN_ZOOM) return showOsm('zoom_out');
      if (!eligible()) return showOsm('outside_view');
      if (locked()) return showOsm(failedKeys.get(lockId(PRIMARY[preference])));
      showVworld();
      syncBackdrop();
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
        clearRecovery(lockId(PRIMARY[provider]));
        if (provider === 'hybrid') { failedKeys.delete(lockId('overlay')); clearRecovery(lockId('overlay')); }
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
      recoveries.forEach(function (timer) { global.clearTimeout(timer); });
      recoveries.clear();
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
