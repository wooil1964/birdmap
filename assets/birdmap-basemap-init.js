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

/* A small release note beside the existing title. Native disclosure keeps closing local to this control. */
(function () {
  'use strict';
  function initializeUpdateNotice() {
    var title = document.querySelector('#mapTitleBox b');
    if (!title || document.getElementById('birdmapUpdateNotice')) return;
    var notice = document.createElement('details');
    notice.id = 'birdmapUpdateNotice';
    var summary = document.createElement('summary');
    summary.textContent = '업데이트';
    summary.setAttribute('aria-label', '지도 업데이트 안내');
    var card = document.createElement('div');
    card.className = 'birdmap-update-card';
    var date = document.createElement('time');
    date.dateTime = '2026-10-28';
    date.textContent = '2026.10.28';
    var heading = document.createElement('strong');
    heading.appendChild(date);
    heading.appendChild(document.createTextNode(' · VWorld 바탕지도 3차 안정화'));
    var description = document.createElement('p');
    description.textContent = 'PC 확대·축소 시 불필요한 지도 타일 요청 감소, 지도 전환·복구 안정성 개선';
    card.appendChild(heading);
    card.appendChild(description);
    notice.appendChild(summary);
    notice.appendChild(card);
    title.insertAdjacentElement('afterend', notice);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeUpdateNotice);
  else initializeUpdateNotice();
})();

/* Mobile overlay presentation. Keep the actual Leaflet popup/content and public read contract intact. */
(function (global) {
  'use strict';
  function initializeMobileSheets() {
    var map = global.map_7010a44f6ac2025090f0fe07508ed485;
    var recent = document.getElementById('recentReportsBox');
    if (!map || !recent) return;
    var media = global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)');
    // These are per-page choices. Reload always starts with the report title bar and the exploration menu open.
    var legacyMobileLayout = global.birdmapMobileLayout, legacyHideFilter = global.hideBirdmapPanelOnMobile;
    global.birdmapMobileLayout = function () { return media.matches || (legacyMobileLayout && legacyMobileLayout()); };
    global.hideBirdmapPanelOnMobile = function () {
      if (media.matches) { global.setBirdmapPanelOpen(false); return; }
      if (legacyHideFilter) return legacyHideFilter();
    };
    var activePopup = null, recentMode = 'collapsed', recentBeforeClose = 'collapsed', recentHeight = null, popupHeight = null;

    function button(text, label, action) {
      var node = document.createElement('button');
      node.type = 'button'; node.textContent = text; node.setAttribute('aria-label', label);
      node.addEventListener('click', action);
      return node;
    }
    function limits() {
      var viewport = global.visualViewport;
      var height = viewport ? viewport.height : global.innerHeight;
      var title = document.getElementById('mapTitleBox').getBoundingClientRect();
      return { min: Math.min(180, height * .45), max: Math.max(180, Math.min(height - 80, height - title.bottom - 16)) };
    }
    function setHeight(node, height) {
      var bounds = limits();
      if (node === recent) {
        var css = global.getComputedStyle(recent), row = parseFloat(css.getPropertyValue('--birdmap-recent-row')) || 76;
        bounds.max = Math.min(bounds.max, 118 + 2 * row + (parseFloat(css.paddingBottom) || 0));
      }
      var value = Math.round(Math.max(bounds.min, Math.min(bounds.max, height)));
      node.style.setProperty('--birdmap-sheet-height', value + 'px');
      updateSeparator(node, value);
      return value;
    }
    function updateSeparator(node, height) {
      var handle = node.querySelector('.birdmap-sheet-handle');
      if (!handle) return;
      var bounds = limits();
      handle.setAttribute('aria-valuemin', Math.round(bounds.min));
      handle.setAttribute('aria-valuemax', Math.round(bounds.max));
      handle.setAttribute('aria-valuenow', Math.round(height));
    }
    function dragHandle(node, label, changed, initial) {
      var handle = document.createElement('div');
      handle.className = 'birdmap-sheet-handle'; handle.tabIndex = 0;
      handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'horizontal');
      handle.setAttribute('aria-label', label + ' 높이 조절');
      var drag = null;
      function announce(height) {
        var bounds = limits();
        handle.setAttribute('aria-valuemin', Math.round(bounds.min));
        handle.setAttribute('aria-valuemax', Math.round(bounds.max));
        handle.setAttribute('aria-valuenow', Math.round(height));
      }
      handle.addEventListener('pointerdown', function (event) {
        if (!media.matches || drag || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault(); event.stopPropagation();
        drag = { id: event.pointerId, y: event.clientY, height: node.getBoundingClientRect().height };
        if (initial) initial();
        handle.setPointerCapture(event.pointerId);
        node.classList.add('birdmap-sheet-dragging');
      });
      handle.addEventListener('pointermove', function (event) {
        if (!drag || drag.id !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        var height = setHeight(node, drag.height + drag.y - event.clientY);
        announce(height); changed(height);
      });
      function finish(event) {
        if (!drag || event.pointerId !== drag.id) return;
        drag = null; node.classList.remove('birdmap-sheet-dragging');
      }
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
      handle.addEventListener('lostpointercapture', finish);
      handle.addEventListener('keydown', function (event) {
        if (!media.matches || ['ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(event.key) < 0) return;
        event.preventDefault(); event.stopPropagation();
        if (initial) initial();
        var bounds = limits(), height = node.getBoundingClientRect().height;
        height = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : height + (event.key === 'ArrowUp' ? 40 : -40);
        height = setHeight(node, height); announce(height); changed(height);
      });
      announce(limits().min);
      return handle;
    }
    var recentHandle = dragHandle(recent, '최근 출현 제보 패널', function (height) {
      recentHeight = height; recentMode = 'expanded'; syncRecent();
    });
    recent.prepend(recentHandle);
    var actions = document.createElement('div'); actions.className = 'birdmap-sheet-actions';
    var expand = button('⌃', '최근 제보 펼치기', function () {
      if (recentMode === 'expanded') { recentMode = 'collapsed'; recentHeight = null; syncRecent(); }
      else openRecent();
    });
    expand.setAttribute('aria-controls', 'recentReportsList recentContributors');
    actions.appendChild(expand);
    actions.appendChild(button('×', '최근 제보 패널 닫기', function () {
      recentBeforeClose = recentMode; recentMode = 'closed'; syncRecent(); reopen.focus();
    }));
    document.getElementById('recentReportsTitle').appendChild(actions);
    var titleOpen = button('', '최근 출현 제보 펼치기', openRecent);
    titleOpen.className = 'birdmap-recent-title-open'; titleOpen.setAttribute('aria-controls', 'recentReportsList recentContributors');
    titleOpen.setAttribute('aria-describedby', 'recentReportsCount');
    document.getElementById('recentReportsTitle').appendChild(titleOpen);
    var reopen = button('최근 제보', '최근 출현 제보 패널 열기', function () {
      if (activePopup && activePopup._birdmapReportLocation) map.closePopup(activePopup);
      recentMode = recentBeforeClose; syncRecent(); expand.focus();
    });
    reopen.id = 'birdmapRecentReopen'; reopen.setAttribute('aria-controls', 'recentReportsBox');
    document.body.appendChild(reopen);
    function openRecent() {
      if (activePopup && activePopup._birdmapReportLocation) map.closePopup(activePopup);
      recentMode = 'expanded'; recentHeight = null; syncRecent();
    }
    function syncRecent() {
      var mode = recentMode;
      if (mode !== 'closed' && activePopup && activePopup._birdmapReportLocation) mode = 'collapsed';
      recent.classList.toggle('birdmap-sheet-closed', mode === 'closed');
      recent.classList.toggle('birdmap-sheet-collapsed', mode === 'collapsed');
      recent.classList.toggle('birdmap-sheet-expanded', mode === 'expanded');
      expand.textContent = mode === 'expanded' ? '⌄' : '⌃';
      expand.setAttribute('aria-expanded', String(mode === 'expanded'));
      titleOpen.setAttribute('aria-expanded', String(mode === 'expanded'));
      expand.setAttribute('aria-label', mode === 'expanded' ? '최근 제보 접기' : '최근 제보 펼치기');
      reopen.hidden = mode !== 'closed';
      if (mode === 'expanded' && recentHeight !== null) setHeight(recent, recentHeight);
      else recent.style.removeProperty('--birdmap-sheet-height');
      global.requestAnimationFrame(function () { measureRows(); overlayMetrics(); });
    }
    var menuToggle = button('탐조 메뉴 ⌃', '탐조 메뉴 접기', function () {
      var collapsed = document.body.classList.toggle('birdmap-explore-collapsed');
      menuToggle.textContent = collapsed ? '탐조 메뉴 ⌄' : '탐조 메뉴 ⌃';
      menuToggle.setAttribute('aria-expanded', String(!collapsed));
      menuToggle.setAttribute('aria-label', collapsed ? '탐조 메뉴 펼치기' : '탐조 메뉴 접기');
      if (typeof global.updateMobileUiMetrics === 'function') global.updateMobileUiMetrics();
    });
    menuToggle.id = 'birdmapExploreMenuToggle'; menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-controls', 'noticeToggleBtn todayToggleBtn reportPickWrap');
    document.body.classList.remove('birdmap-explore-collapsed');
    document.getElementById('topBtnRow').appendChild(menuToggle);
    // Annotate existing metadata; desktop text and reporter statistics buttons stay in place.
    function annotateReports() {
      var entries = (global.reportSearchIndex || []).filter(function (entry) {
        return entry.date && entry.date >= global.kstDateTextBefore(global.RECENT_REPORT_DAYS);
      }).slice(0, global.RECENT_REPORT_LIMIT);
      recent.querySelectorAll('#recentReportsList .recentReportItem').forEach(function (item, index) {
        var meta = item.querySelector('.recentReportMeta'), entry = entries[index];
        if (!meta || !entry || meta.querySelector('.birdmap-recent-date')) return;
        Array.from(meta.childNodes).forEach(function (node) {
          if (node.nodeType !== 3) return;
          var span = document.createElement('span'); span.className = 'birdmap-recent-desktop-meta';
          node.replaceWith(span); span.appendChild(node);
        });
        if (!entry.reporter) {
          var anonymous = document.createElement('span'); anonymous.className = 'birdmap-recent-anonymous';
          anonymous.textContent = '익명 제보'; meta.appendChild(anonymous);
        }
        var date = document.createElement('span'); date.className = 'birdmap-recent-date';
        date.textContent = global.recentReportDateText(entry.date); meta.appendChild(date);
      });
      measureRows();
    }
    function measureRows() {
      if (!media.matches || !recent.classList.contains('birdmap-sheet-expanded')) return;
      var items = recent.querySelectorAll('#recentReportsList .recentReportItem');
      var row = 76;
      Array.from(items).slice(0, 4).forEach(function (item) { row = Math.max(row, item.scrollHeight, Math.ceil(item.getBoundingClientRect().height)); });
      recent.style.setProperty('--birdmap-recent-row', row + 'px');
    }
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true; global.requestAnimationFrame(function () { queued = false; annotateReports(); });
    }).observe(document.getElementById('recentReportsList'), { childList: true });

    var selector = map.getContainer().querySelector('.birdmap-basemap');
    if (selector) {
      var choices = selector.querySelector('.birdmap-basemap__choices');
      choices.id = 'birdmapMobileMapChoices';
      var mapToggle = button('지도 ⌃', '지도 선택 접기', function () {
        var collapsed = selector.classList.toggle('birdmap-basemap-collapsed');
        mapToggle.textContent = collapsed ? '지도 ⌄' : '지도 ⌃';
        mapToggle.setAttribute('aria-expanded', String(!collapsed));
        mapToggle.setAttribute('aria-label', collapsed ? '지도 선택 펼치기' : '지도 선택 접기');
      });
      mapToggle.textContent = '지도 ⌃'; mapToggle.className = 'birdmap-basemap-toggle';
      mapToggle.setAttribute('aria-expanded', 'true'); mapToggle.setAttribute('aria-controls', choices.id);
      selector.prepend(mapToggle);
      if (global.innerHeight < 700 && media.matches) mapToggle.click();
    }
    function overlayMetrics() {
      if (!media.matches) return;
      var visible = recent.getClientRects().length && global.getComputedStyle(recent).display !== 'none';
      var offset = visible ? recent.getBoundingClientRect().height : 0;
      if (visible) updateSeparator(recent, offset);
      document.body.style.setProperty('--birdmap-recent-offset', offset + 'px');
      if (selector) {
        var top = selector.getBoundingClientRect().top;
        selector.style.setProperty('--birdmap-map-choices-height', Math.max(44, global.innerHeight - offset - top - 112) + 'px');
      }
    }
    new ResizeObserver(overlayMetrics).observe(recent);
    new MutationObserver(overlayMetrics).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var filterToggle = document.getElementById('togglePanelBtn');
    function syncFilter() {
      document.body.classList.toggle('birdmap-filter-open', filterToggle.getAttribute('aria-expanded') === 'true');
    }
    new MutationObserver(syncFilter).observe(filterToggle, { attributes: true, attributeFilter: ['aria-expanded'] });
    syncFilter();
    function releasePopup(popup) {
      var node = popup && popup.getElement();
      if (!node || !node.classList.contains('birdmap-mobile-popup')) return;
      node.classList.remove('birdmap-mobile-popup');
      node.style.removeProperty('--birdmap-sheet-height');
      var toolbar = node.querySelector('.birdmap-popup-toolbar'); if (toolbar) toolbar.remove();
      popup.options.autoPan = popup._birdmapSheetAutoPan;
      if (map.hasLayer(popup)) map.getPane('popupPane').appendChild(node);
    }
    function presentPopup(popup) {
      if (!media.matches || popup._birdmapReportLocation || activePopup !== popup || !map.hasLayer(popup)) return;
      var node = popup.getElement(); if (!node) return;
      // A fixed sheet needs no delayed map auto-pan. Leaflet update() would rebuild string content and detach
      // the statistics trigger while its read is pending, so cancel only the mobile positioning settle timer.
      if (popup._birdmapSettleTimer) { global.clearTimeout(popup._birdmapSettleTimer); popup._birdmapSettleTimer = null; }
      if (node.classList.contains('birdmap-mobile-popup')) return;
      popup._birdmapSheetAutoPan = popup.options.autoPan; popup.options.autoPan = false;
      node.classList.add('birdmap-mobile-popup');
      var toolbar = document.createElement('div'); toolbar.className = 'birdmap-popup-toolbar';
      toolbar.appendChild(dragHandle(node, '탐조지 상세정보 패널', function (height) {
        popupHeight = height;
        toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '펼치기';
        toggle.setAttribute('aria-label', '상세정보 펼치기');
      }));
      var controls = document.createElement('div'); controls.className = 'birdmap-popup-actions';
      var toggle = button('펼치기', '상세정보 펼치기', function () {
        var full = toggle.getAttribute('aria-expanded') !== 'true';
        popupHeight = setHeight(node, full ? limits().max : global.innerHeight * .58);
        toggle.setAttribute('aria-expanded', String(full)); toggle.textContent = full ? '접기' : '펼치기';
        toggle.setAttribute('aria-label', full ? '상세정보 접기' : '상세정보 펼치기');
      });
      toggle.setAttribute('aria-expanded', 'false'); controls.appendChild(toggle);
      controls.appendChild(button('닫기 ×', '탐조지 상세정보 닫기', function () { map.closePopup(popup); }));
      toolbar.appendChild(controls); node.prepend(toolbar);
      // Keep details within the map's native fullscreen subtree, outside transformed Leaflet panes.
      map.getContainer().appendChild(node);
      setHeight(node, popupHeight || global.innerHeight * .58);
      document.body.classList.add('birdmap-detail-open');
    }
    map.on('popupopen', function (event) {
      activePopup = event.popup; popupHeight = null;
      document.body.classList.toggle('birdmap-report-location-open', !!event.popup._birdmapReportLocation);
      syncRecent();
      // Run after the existing popupopen content/history/weather listeners have initialized the real popup.
      global.queueMicrotask(function () {
        if (activePopup === event.popup && map.hasLayer(event.popup)) presentPopup(event.popup);
      });
    });
    map.on('popupclose', function (event) {
      releasePopup(event.popup);
      if (activePopup === event.popup) activePopup = null;
      document.body.classList.remove('birdmap-detail-open', 'birdmap-report-location-open');
      syncRecent();
    });
    function resize() {
      syncRecent(); measureRows(); overlayMetrics();
      if (activePopup) {
        if (activePopup._birdmapReportLocation) return;
        if (media.matches) { presentPopup(activePopup); setHeight(activePopup.getElement(), popupHeight || global.innerHeight * .58); }
        else { releasePopup(activePopup); document.body.classList.remove('birdmap-detail-open'); activePopup.update(); }
      }
    }
    media.addEventListener('change', resize);
    global.addEventListener('resize', resize);
    if (global.visualViewport) global.visualViewport.addEventListener('resize', resize);
    annotateReports(); syncRecent();
  }
  if (document.readyState === 'complete') initializeMobileSheets();
  else global.addEventListener('load', initializeMobileSheets);
})(window);
