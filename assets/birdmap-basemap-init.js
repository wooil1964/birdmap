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

    var root = map.getContainer().querySelector('.birdmap-basemap');
    var home = map.getContainer().querySelector('.leaflet-bottom.leaflet-left');
    var topRow = document.getElementById('topBtnRow');
    var observer = null;
    function updateMetrics() {
      if (typeof global.updateMobileUiMetrics === 'function') global.updateMobileUiMetrics();
    }
    function dock() {
      if (!root || !home) return;
      var target = global.innerWidth <= 700 && topRow ? topRow : home;
      if (root.parentNode !== target) target.appendChild(root);
      updateMetrics();
    }
    dock();
    global.addEventListener('resize', dock);
    if (global.ResizeObserver && root) {
      observer = new global.ResizeObserver(updateMetrics);
      observer.observe(root);
    }
    var destroy = api.destroy;
    api.destroy = function () {
      global.removeEventListener('resize', dock);
      if (observer) observer.disconnect();
      map.off('unload', api.destroy);
      destroy();
      updateMetrics();
    };
    map.on('unload', api.destroy);
    return api;
  };
})(window);
