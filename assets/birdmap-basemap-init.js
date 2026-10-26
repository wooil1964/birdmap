(function (global) {
  'use strict';

  global.initializeBirdmapBasemap = function (map, osm) {
    var config = global.BIRDMAP_MAP_CONFIG || {};
    // Leave no extra global credential object after handing it to the controller.
    try { delete global.BIRDMAP_MAP_CONFIG; } catch (_) { global.BIRDMAP_MAP_CONFIG = null; }
    if (!global.BirdmapBasemap || typeof global.BirdmapBasemap.mount !== 'function') {
      osm.addTo(map);
      return null;
    }
    var api;
    try {
      api = global.BirdmapBasemap.mount({
        map: map,
        osm: osm,
        domesticBounds: global.KOREA_VIEW_BOUNDS,
        config: config
      });
    } catch (_) {
      // Do not log initialization exceptions: third-party errors may contain URLs.
      if (!map.hasLayer(osm)) osm.addTo(map);
      return null;
    } finally {
      config = null;
    }

    // PC and mobile alike: a narrow column at the bottom left, outside the fixed top UI (so the mobile top UI and the
    // popup room computed from it stay as they were before the selector existed).
    var root = map.getContainer().querySelector('.birdmap-basemap');
    var home = map.getContainer().querySelector('.leaflet-bottom.leaflet-left');
    function updateMetrics() {
      if (typeof global.updateMobileUiMetrics === 'function') global.updateMobileUiMetrics();
    }
    if (root && home) home.appendChild(root);
    updateMetrics();
    var destroy = api.destroy;
    api.destroy = function () {
      map.off('unload', api.destroy);
      destroy();
      updateMetrics();
    };
    map.on('unload', api.destroy);
    return api;
  };
})(window);
