/* Birdmap base-map selector. Runtime credentials stay in this module's closures. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'birdmap.basemap.preference';
  var TILE_BATCH_TIMEOUT_MS = 12000;
  var MAX_TILE_ERRORS = 3;
  var instances = new WeakMap();

  function cleanKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function savedPreference() {
    try {
      var value = global.localStorage.getItem(STORAGE_KEY);
      if (value === 'osm' || value === 'vworld') return value;
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
    var key = cleanKey(options.config && options.config.vworldKey);
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
    var vworld = null;
    var tileHandlers = null;
    var ui = null;
    var control = L.control({ position: 'topright' });

    function eligible() {
      return map.getZoom() >= 6 && domesticBounds.contains(map.getCenter());
    }

    function locked() {
      return !!key && failedKeys.has(key);
    }

    function getState() {
      return {
        preference: preference,
        active: active,
        reason: reason,
        eligible: eligible(),
        loading: loading,
        errors: errors,
        locked: locked(),
        canRetry: !destroyed && preference === 'vworld' && locked() && eligible(),
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
      if (active === 'vworld') return loading ? '브이월드 지도를 불러오는 중…' : '브이월드 표시 중';
      return 'OSM 표시 중';
    }

    function render() {
      if (!ui) return;
      ui.vworld.setAttribute('aria-pressed', String(preference === 'vworld'));
      ui.osm.setAttribute('aria-pressed', String(preference === 'osm'));
      ui.container.setAttribute('data-active-provider', active);
      ui.container.setAttribute('data-preference', preference);
      ui.status.textContent = statusText();
      ui.retry.hidden = !(preference === 'vworld' && locked());
      ui.retry.disabled = !eligible();
    }

    function clearDeadline() {
      if (deadline !== null) {
        global.clearTimeout(deadline);
        deadline = null;
      }
    }

    function current(token, layer) {
      return !destroyed && token === generation && active === 'vworld' && layer === vworld;
    }

    function detachVworld() {
      generation++;
      clearDeadline();
      var previous = vworld;
      var handlers = tileHandlers;
      vworld = null;
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
      failedKeys.set(key, nextReason);
      showOsm(nextReason);
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

    function showVworld() {
      if (vworld && active === 'vworld') return;
      detachVworld();
      var token = generation;
      var layer;
      errors = 0;
      batchSuccesses = 0;
      batchErrors = 0;
      loading = true;
      reason = 'loading';
      try {
        // Leaflet necessarily holds its request URL while this layer exists.
        // No credential, request URL, or error event is exposed by this API.
        layer = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/' + encodeURIComponent(key) + '/Base/{z}/{y}/{x}.png', {
          minZoom: 6,
          maxZoom: 19,
          maxNativeZoom: 19,
          tms: false,
          detectRetina: false,
          noWrap: true,
          attribution: '&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부'
        });
        vworld = layer;
        active = 'vworld';
        tileHandlers = {
          tileerror: function () {
            if (!current(token, layer)) return;
            errors++;
            batchErrors++;
            if (errors >= MAX_TILE_ERRORS) fail('tile_error', token, layer);
          },
          tileload: function () {
            if (!current(token, layer)) return;
            batchSuccesses++;
          },
          loading: function () {
            if (!current(token, layer)) return;
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
            // failed. A tiny failed batch must not masquerade as a ready map.
            if (batchErrors > 0 && batchSuccesses === 0) {
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
      } catch (_) {
        // Deliberately discard exception details: they can contain a tile URL.
        if (current(token, layer)) fail('tile_error', token, layer);
        else {
          failedKeys.set(key, 'tile_error');
          showOsm('tile_error');
        }
      }
    }

    function reconcile() {
      if (destroyed) return;
      if (preference === 'osm') return showOsm('user_selected');
      if (!key) return showOsm('no_config');
      if (map.getZoom() < 6) return showOsm('zoom_out');
      if (!domesticBounds.contains(map.getCenter())) return showOsm('outside_view');
      if (locked()) return showOsm(failedKeys.get(key));
      showVworld();
      render();
    }

    function setPreference(provider, action) {
      if (destroyed || (provider !== 'osm' && provider !== 'vworld')) return false;
      preference = provider;
      savePreference(provider);
      // Only an explicit retry action unlocks a failed key. Merely selecting
      // VWorld again, panning, or zooming never sends another failed request.
      if (provider === 'vworld' && action && action.retry === true && key) failedKeys.delete(key);
      reconcile();
      return true;
    }

    function updateConfig(config) {
      if (destroyed || !config || !Object.prototype.hasOwnProperty.call(config, 'vworldKey')) return;
      var nextKey = cleanKey(config.vworldKey);
      if (nextKey === key) return;
      detachVworld();
      key = nextKey;
      errors = 0;
      reconcile();
    }

    function stopKeyPropagation(event) { event.stopPropagation(); }
    function chooseVworld() { setPreference('vworld'); }
    function chooseOsm() { setPreference('osm'); }
    function retryVworld() { setPreference('vworld', { retry: true }); }

    control.onAdd = function () {
      var container = document.createElement('div');
      container.className = 'birdmap-basemap';
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', '바탕지도');
      var choices = document.createElement('div');
      choices.className = 'birdmap-basemap__choices';
      var vworldButton = document.createElement('button');
      vworldButton.type = 'button';
      vworldButton.className = 'birdmap-basemap__choice';
      vworldButton.textContent = '브이월드';
      vworldButton.setAttribute('aria-label', '브이월드 지도 선택');
      var osmButton = document.createElement('button');
      osmButton.type = 'button';
      osmButton.className = 'birdmap-basemap__choice';
      osmButton.textContent = 'OSM';
      osmButton.setAttribute('aria-label', 'OSM 지도 선택');
      choices.appendChild(vworldButton);
      choices.appendChild(osmButton);
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
      vworldButton.addEventListener('click', chooseVworld);
      osmButton.addEventListener('click', chooseOsm);
      retry.addEventListener('click', retryVworld);
      container.addEventListener('keydown', stopKeyPropagation);
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      ui = { container: container, vworld: vworldButton, osm: osmButton, status: status, retry: retry };
      render();
      return container;
    };

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      map.off('zoomend moveend', reconcile);
      detachVworld();
      if (!map.hasLayer(osm)) osm.addTo(map);
      reason = 'destroyed';
      if (ui) {
        ui.vworld.removeEventListener('click', chooseVworld);
        ui.osm.removeEventListener('click', chooseOsm);
        ui.retry.removeEventListener('click', retryVworld);
        ui.container.removeEventListener('keydown', stopKeyPropagation);
      }
      control.remove();
      ui = null;
      key = '';
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
