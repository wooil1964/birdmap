/* Device positions stay in this closure and Leaflet layers. No storage, reporting, or navigation URLs. */
(function (global) {
  'use strict';
  function point(p) { return !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180; }
  function distanceText(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km'; }
  function create(options) {
    var map = options.map, L = options.L, geo = options.geolocation, seq = 0, watch = null, tracking = false;
    var fix = null, target = null, provider = null, sourcePopup = null, dot = null, accuracy = null, line = null, checking = false, pendingFix = null, destroyed = false;
    var popupState = null;
    var gpsOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    function say(text) { options.notify(text); changed(); }
    function changed() { if (options.changed) options.changed({ tracking: tracking, guiding: !!provider, located: !!fix }); }
    function remove(layer) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); }
    function eraseLine() { remove(line); line = null; }
    function stopWatch() { if (watch !== null && geo) geo.clearWatch(watch); watch = null; }
    function restoreAutoPan(state) {
      if (state.autoPan) Object.defineProperty(state.popup.options, 'autoPan', state.autoPan);
      else delete state.popup.options.autoPan;
    }
    function releasePopup() {
      var state = popupState; popupState = null;
      if (!state) return;
      restoreAutoPan(state);
      if (state.node && !state.hadClass) state.node.classList.remove('birdmap-gps-popup');
      if (options.restorePopup) options.restorePopup(state.popup);
      // Restoring the taller desktop content also needs Leaflet's position/auto-pan pass.
      if (state.node && !state.node.classList.contains('birdmap-mobile-popup') && map.hasLayer(state.popup) && !options.hidden()) state.popup.update();
    }
    function holdPopup(popup) {
      if (!popup || !popup.options || popupState) return;
      var node = popup.getElement && popup.getElement();
      popupState = { popup: popup, autoPan: Object.getOwnPropertyDescriptor(popup.options, 'autoPan'), node: node,
        hadClass: !!node && node.classList.contains('birdmap-gps-popup') };
      popup.options.autoPan = false;
      if (node) node.classList.add('birdmap-gps-popup');
    }
    // Let the mobile sheet change its own temporary setting underneath the GPS hold.
    function changePopupAutoPan(popup, change) {
      var state = popupState;
      if (!state || state.popup !== popup) return change();
      restoreAutoPan(state);
      try { return change(); }
      finally {
        if (popupState === state) {
          state.autoPan = Object.getOwnPropertyDescriptor(popup.options, 'autoPan');
          popup.options.autoPan = false;
        }
      }
    }
    function stopGuide(message) {
      releasePopup();
      seq++; checking = false; pendingFix = null; eraseLine(); target = provider = sourcePopup = null;
      // Cancel even a pending one-shot; leave only the user's blue point.
      tracking = false; stopWatch(); say(message || '안내를 종료했습니다.');
    }
    function clear(message) {
      stopGuide(message || '위치를 지웠습니다.'); remove(dot); remove(accuracy); dot = accuracy = fix = null; changed();
    }
    function allowed() {
      if (destroyed || options.hidden()) return false;
      if (!options.isSecure()) { say('내 위치는 HTTPS 보안 연결에서 사용할 수 있습니다.'); return false; }
      if (!geo || typeof geo.getCurrentPosition !== 'function') { say('이 브라우저는 위치 찾기를 지원하지 않습니다.'); return false; }
      return true;
    }
    function targetValid(t) { return !!t && point(t.point) && map.hasLayer(t.layer) && (!t.valid || t.valid()) && (!sourcePopup || map.hasLayer(sourcePopup)); }
    function failure(error, token) {
      if (token !== seq || destroyed) return;
      releasePopup();
      stopWatch(); tracking = false; seq++; checking = false; pendingFix = null;
      eraseLine(); target = provider = sourcePopup = null;
      var messages = { 1: '위치 권한이 거부됐습니다. 브라우저의 위치 권한을 허용한 뒤 다시 눌러 주세요.', 2: '현재 위치를 확인할 수 없습니다. GPS와 기기 위치 설정을 확인해 주세요.', 3: '위치 확인 시간이 초과됐습니다. 하늘이 보이는 곳에서 다시 눌러 주세요.' };
      say(messages[error && error.code] || '위치 확인 중 오류가 발생했습니다. 다시 눌러 주세요.');
    }
    function validated(position) {
      var c = position && position.coords, p = c && { lat: c.latitude, lng: c.longitude };
      if (!point(p) || typeof c.accuracy !== 'number' || !Number.isFinite(c.accuracy) || c.accuracy < 0 || c.accuracy > 10000
        || !Number.isFinite(position.timestamp) || Date.now() - position.timestamp > 60000 || position.timestamp > Date.now() + 10000) return null;
      return { point: p, accuracy: c.accuracy, timestamp: position.timestamp };
    }
    function draw(next, fitView) {
      fix = next;
      if (!accuracy) accuracy = L.circle(next.point, { radius: next.accuracy, color: '#1976d2', weight: 1, fillColor: '#2196f3', fillOpacity: .12, interactive: false, className: 'birdmap-gps-accuracy' }).addTo(map);
      else accuracy.setLatLng(next.point).setRadius(next.accuracy);
      if (!dot) dot = L.circleMarker(next.point, { radius: 7, color: '#fff', weight: 3, fillColor: '#1674e8', fillOpacity: 1, interactive: false, className: 'birdmap-gps-dot' }).addTo(map);
      else dot.setLatLng(next.point);
      if (dot.bringToFront) dot.bringToFront();
      eraseLine();
      var text = '현재 위치 · 정확도 약 ' + distanceText(next.accuracy);
      if (target) {
        if (!targetValid(target)) { stopGuide('공개 위치를 확인할 수 없어 안내를 종료했습니다.'); return; }
        var meters = map.distance(next.point, target.point);
        line = L.polyline([next.point, target.point], { color: '#1565c0', weight: 3, dashArray: '7 8', interactive: false, className: 'birdmap-gps-guide' }).addTo(map);
        var label = L.tooltip({ permanent: true, direction: 'center', className: 'birdmap-gps-distance' });
        // Only a computed distance and public label, never coordinate text.
        var node = global.document.createElement('span'); node.textContent = '직선거리 ' + distanceText(meters);
        line.bindTooltip(label.setContent(node)).openTooltip();
        text = target.label + ' · 직선거리 ' + distanceText(meters) + ' · 정확도 약 ' + distanceText(next.accuracy) + ' (도로·등산로 안내가 아닙니다)';
      }
      if (next.accuracy > 100) text += ' · 위치 오차가 큽니다. 거리는 참고용입니다.';
      if (fitView) {
        holdPopup(sourcePopup);
        if (target && options.collapsePopup) options.collapsePopup(sourcePopup);
        options.fit(next.point, target && target.point, sourcePopup);
      }
      say(text);
    }
    function accept(position, token, fitView) {
      if (token !== seq || destroyed || options.hidden()) return;
      var next = validated(position);
      if (!next) { failure({ code: 2 }, token); return; }
      if (fix && next.timestamp < fix.timestamp) return;
      // At most one public proof at a time. Keep the newest fix without increasing API traffic.
      if (checking) { pendingFix = { position: position, fitView: fitView }; return; }
      if (!provider) { draw(next, fitView); return; }
      // A verified destination remains valid only under the same live publication lease/revision.
      // The existing publication poll invalidates it synchronously; GPS fixes add no polling requests.
      if (!fitView) { if (targetValid(target)) draw(next, false); else stopGuide('공개 위치를 확인할 수 없어 안내를 종료했습니다.'); return; }
      checking = true;
      Promise.resolve().then(provider).then(function (fresh) {
        if (token !== seq || destroyed || options.hidden()) return;
        if (!targetValid(fresh) || !target || fresh.layer !== target.layer || fresh.point.lat !== target.point.lat || fresh.point.lng !== target.point.lng) { stopGuide('공개 위치가 변경되어 안내를 종료했습니다.'); return; }
        target = fresh; draw(next, fitView);
      }).catch(function () { if (token === seq) stopGuide('공개 위치를 확인할 수 없어 안내를 종료했습니다.'); }).finally(function () {
        if (token !== seq) return;
        checking = false;
        var queued = pendingFix; pendingFix = null;
        if (queued) accept(queued.position, token, queued.fitView);
      });
    }
    function requestFix(token) {
      try { geo.getCurrentPosition(function (p) { accept(p, token, true); }, function (e) { failure(e, token); }, gpsOptions); }
      catch (e) { failure(e, token); }
    }
    function locate() {
      stopGuide(''); if (!allowed()) return;
      say('현재 위치를 확인하고 있습니다. 위치는 저장하지 않습니다.'); requestFix(seq);
    }
    function guide(resolve, popup) {
      stopGuide(''); if (!allowed()) return Promise.resolve(false);
      var token = seq; provider = resolve; sourcePopup = popup || null;
      say('공개 목적지를 확인하고 있습니다.');
      return Promise.resolve().then(resolve).then(function (next) {
        if (token !== seq || destroyed || options.hidden()) return false;
        if (!targetValid(next)) { stopGuide('공개 위치를 확인할 수 없어 안내하지 않습니다.'); return false; }
        target = next; say('현재 위치를 확인하고 있습니다. 위치는 저장하지 않습니다.'); requestFix(token); return true;
      }).catch(function () { if (token === seq) stopGuide('공개 위치를 확인할 수 없어 안내하지 않습니다.'); return false; });
    }
    function setTracking(value) {
      // Changing the request token here would cancel an in-flight destination/GPS proof.
      if (value && provider && (!target || checking || !line)) { say('목적지와 현재 위치 확인이 끝난 뒤 이동 갱신을 켜 주세요.'); return; }
      if (!value && !tracking) return;
      stopWatch(); tracking = false;
      if (!value) { seq++; checking = false; pendingFix = null; changed(); return; }
      if (!allowed() || !fix || typeof geo.watchPosition !== 'function') { say('먼저 내 위치를 찾은 뒤 이동 갱신을 켜 주세요.'); return; }
      tracking = true; var token = ++seq; checking = false; pendingFix = null;
      try { watch = geo.watchPosition(function (p) { accept(p, token, false); }, function (e) { failure(e, token); }, gpsOptions); }
      catch (e) { failure(e, token); }
      changed();
    }
    return { locate: locate, guide: guide, setTracking: setTracking, stopGuide: stopGuide, clear: clear, changePopupAutoPan: changePopupAutoPan,
      invalidate: function () { if (provider && (!target || target.publicReport)) stopGuide('공개 상태가 변경되어 안내를 종료했습니다.'); },
      popupClosed: function (popup) { if (popup === sourcePopup) stopGuide(); },
      layerRemoved: function (layer) { if (target && target.layer === layer) stopGuide('목적지가 지도에서 사라져 안내를 종료했습니다.'); },
      validate: function () { if (target && !targetValid(target)) stopGuide('공개 위치를 확인할 수 없어 안내를 종료했습니다.'); },
      destroy: function () { clear(''); destroyed = true; },
      state: function () { return { tracking: tracking, guiding: !!provider, located: !!fix }; } };
  }
  global.BirdmapLocation = { create: create, distanceText: distanceText };

  function install() {
    var map = global.map_7010a44f6ac2025090f0fe07508ed485, document = global.document;
    if (!map || !global.L) return;
    var root = document.createElement('section'); root.id = 'birdmapGps'; root.setAttribute('aria-label', '내 위치 도구');
    var locate = document.createElement('button'); locate.type = 'button'; locate.id = 'birdmapGpsLocate'; locate.textContent = '⌖ 내 위치';
    var status = document.createElement('div'); status.id = 'birdmapGpsStatus'; status.setAttribute('role', 'status'); status.hidden = true;
    var expanded = false, errorMessage = false;
    var more = document.createElement('button'); more.type = 'button'; more.textContent = '⋯'; more.setAttribute('aria-label', '위치 도구 열기'); more.setAttribute('aria-expanded', 'false'); more.hidden = true;
    var actions = document.createElement('div'); actions.className = 'birdmap-gps-actions'; actions.hidden = true;
    var privacy = document.createElement('div'); privacy.className = 'birdmap-gps-privacy'; privacy.hidden = true;
    var details = document.createElement('div'); details.className = 'birdmap-gps-details'; details.hidden = true;
    privacy.textContent = '위치는 저장하지 않습니다. 주변 지도 요청으로 지도 제공자가 대략적인 위치를 알 수 있습니다. 앱을 전환하면 위치 표시가 지워집니다.';
    function button(text) { var b = document.createElement('button'); b.type = 'button'; b.textContent = text; actions.appendChild(b); return b; }
    var track = button('이동 갱신'), stop = button('안내 종료'), wipe = button('위치 지우기'); track.setAttribute('aria-pressed', 'false');
    details.appendChild(status); details.appendChild(actions); details.appendChild(privacy);
    root.appendChild(locate); root.appendChild(more); root.appendChild(details); map.getContainer().appendChild(root);
    global.L.DomEvent.disableClickPropagation(root); global.L.DomEvent.disableScrollPropagation(root);
    function fit(p, destination, popup) {
      if (popup) {
        if (popup._birdmapSettleTimer) { global.clearTimeout(popup._birdmapSettleTimer); popup._birdmapSettleTimer = null; }
        if (typeof global.applyMobilePopupAutoPan === 'function') global.applyMobilePopupAutoPan(popup);
        var node = popup.getElement();
        if (node) popup.update();
      }
      var container = map.getContainer().getBoundingClientRect(), w = container.width, h = container.height;
      var top = 85, bottom = 65, left = 36, right = 36;
      var popupNode = popup && popup.getElement();
      var mobile = global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)').matches;
      var popupHalf = popupNode && !mobile ? popupNode.getBoundingClientRect().width / 2 + 12 : 0;
      if (popupNode && !mobile) top = Math.max(top, Math.min(popupNode.getBoundingClientRect().height + 40, h * .65));
      ['#birdmapPanel', '#recentReportsBox', '.birdmap-mobile-popup'].forEach(function (selector) {
        var n = document.querySelector(selector); if (!n || !n.getClientRects().length || global.getComputedStyle(n).display === 'none') return;
        var r = n.getBoundingClientRect();
        if (selector === '.birdmap-mobile-popup' || (selector === '#recentReportsBox' && r.width > w * .6)) bottom = Math.max(bottom, container.bottom - r.top + 16);
        else if (selector === '#birdmapPanel') left = Math.max(left, r.right - container.left + 20);
        else right = Math.max(right, container.right - r.left + 20);
      });
      // Keep both endpoints clear of the top controls, GPS button and compact detail bar.
      if (mobile) {
        var topUi = document.querySelector('#topUiWrap');
        if (topUi && topUi.getClientRects().length) top = Math.max(top, Math.min(h * .44, topUi.getBoundingClientRect().bottom - container.top + 12));
        left = Math.max(Math.min(w * .31, 124), Math.min(left, w * .32));
        right = Math.min(right, w * .28);
      }
      else {
        // Only the destination's extreme needs room for its popup; the GPS end is a small dot.
        if (!destination || destination.lng <= p.lng) left += popupHalf;
        if (!destination || destination.lng >= p.lng) right += popupHalf;
      }
      if (left + right > w - 100) { var scale = (w - 100) / (left + right); left *= scale; right *= scale; }
      bottom = Math.min(bottom, h * .58); top = Math.min(top, h - bottom - 100);
      if (destination) map.fitBounds(global.L.latLngBounds([p, destination]), { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: 15, animate: false });
      else map.fitBounds(global.L.latLngBounds([p, p]), { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: 14, animate: false });
    }
    var api = global.birdmapLocation = create({ map: map, L: global.L, geolocation: global.navigator.geolocation,
      isSecure: function () { return global.isSecureContext === true; }, hidden: function () { return document.hidden; }, fit: fit,
      collapsePopup: function (popup) { if (typeof global.birdmapCollapseMobilePopupForGps === 'function') return global.birdmapCollapseMobilePopupForGps(popup); },
      restorePopup: function (popup) { if (typeof global.birdmapRestoreMobilePopupAfterGps === 'function') return global.birdmapRestoreMobilePopupAfterGps(popup); },
      notify: function (text) { status.textContent = text; errorMessage = /권한|HTTPS|지원하지|초과|오류|확인할 수|변경되어|오차가 큽니다/.test(text); if (errorMessage) expanded = false; },
      changed: function (s) { if (!s.located && !s.guiding) expanded = false; track.setAttribute('aria-pressed', String(s.tracking)); stop.hidden = !s.guiding; more.hidden = !s.located && !s.guiding && !errorMessage; root.style.width = expanded ? '280px' : errorMessage ? '260px' : more.hidden ? '70px' : '118px'; more.setAttribute('aria-expanded', String(expanded)); more.setAttribute('aria-label', expanded ? '위치 도구 닫기' : '위치 도구 열기'); actions.hidden = !expanded || (!s.located && !s.guiding); privacy.hidden = !expanded; status.hidden = !status.textContent || (!expanded && !errorMessage); details.hidden = status.hidden && actions.hidden && privacy.hidden; track.disabled = !s.located; schedulePlace(); } });
    var startGuide = api.guide;
    function prepareView() {
      if (!global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)').matches) return;
      // Give the two GPS endpoints useful map room; both existing menus can still be reopened.
      ['#birdmapExploreMenuToggle', '.birdmap-basemap-toggle'].forEach(function (selector) {
        var toggle = document.querySelector(selector); if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
      });
      if (global.hideBirdmapPanelOnMobile) global.hideBirdmapPanelOnMobile();
    }
    api.guide = function () { expanded = false; prepareView(); return startGuide.apply(api, arguments); };
    function place() {
      var rect = map.getContainer().getBoundingClientRect();
      details.style.maxHeight = '';
      var sheet = document.querySelector('.birdmap-mobile-popup'), sheetLimit = rect.height - 36;
      if (sheet && sheet.getClientRects().length && global.getComputedStyle(sheet).display !== 'none') {
        // Keep the header reachable while longer tools scroll above the mobile sheet.
        sheetLimit = sheet.getBoundingClientRect().top - rect.top - 8;
        details.style.maxHeight = Math.max(0, sheetLimit - 70 - 44 - 4) + 'px';
      }
      var boxes = Array.from(document.querySelectorAll(overlaySelector)).filter(function (n) { return n.getClientRects().length && global.getComputedStyle(n).display !== 'none'; }).map(function (n) { return n.getBoundingClientRect(); });
      // Check the complete expanded tool area, including status/actions, against existing overlays.
      var size = root.getBoundingClientRect(), height = size.height || 44, width = size.width || 84;
      var candidates = [Math.round(rect.height * .46), 70, 90, rect.height - 110];
      boxes.forEach(function (r) { candidates.push(r.bottom - rect.top + 8, r.top - rect.top - height - 8); });
      function overlap(position) { return boxes.reduce(function (total, r) { return total + Math.max(0, Math.min(rect.left + position.left + width, r.right) - Math.max(rect.left + position.left, r.left)) * Math.max(0, Math.min(rect.top + position.top + height, r.bottom) - Math.max(rect.top + position.top, r.top)); }, 0); }
      candidates = candidates.filter(function (top) { return top >= 70 && top + height <= Math.min(rect.height - 36, sheetLimit); });
      var positions = [], columns = [10, Math.max(10, rect.width - width - 10)];
      boxes.forEach(function (r) { columns.push(r.right - rect.left + 8, r.left - rect.left - width - 8); });
      columns.filter(function (left) { return left >= 10 && left + width <= rect.width - 10; }).forEach(function (left) { candidates.forEach(function (top) { positions.push({ left: left, top: top }); }); });
      var position = positions.find(function (p) { return overlap(p) === 0; });
      if (!position) position = positions.sort(function (a, b) { return overlap(a) - overlap(b); })[0];
      root.style.top = Math.max(70, position ? position.top : 70) + 'px'; root.style.left = (position ? position.left : 10) + 'px';
    }
    locate.addEventListener('click', function () { expanded = false; map.closePopup(); prepareView(); api.locate(); });
    more.addEventListener('click', function () { expanded = !expanded; var s = api.state(); root.style.width = expanded ? '280px' : errorMessage ? '260px' : '118px'; status.hidden = !expanded && !errorMessage; actions.hidden = !expanded || (!s.located && !s.guiding); privacy.hidden = !expanded; details.hidden = status.hidden && actions.hidden && privacy.hidden; more.setAttribute('aria-expanded', String(expanded)); more.setAttribute('aria-label', expanded ? '위치 도구 닫기' : '위치 도구 열기'); schedulePlace(); });
    track.addEventListener('click', function () { api.setTracking(track.getAttribute('aria-pressed') !== 'true'); });
    stop.addEventListener('click', function () { expanded = false; api.stopGuide(); }); wipe.addEventListener('click', function () { api.clear(); });
    function staticTarget(kind, id, popup) {
      var rows = kind === 'site' ? global.siteData : global.siteSpotData;
      var matches = (rows || []).filter(function (s) { return String(s.id) === id; }); if (matches.length !== 1) return null;
      var row = matches[0], layer = kind === 'site' ? global[row.markerVar] : (global.siteSpotLayers || [])[rows.indexOf(row)];
      var p = layer && layer.getLatLng();
      if (!point(p) || p.lat !== row.lat || p.lng !== row.lon || !map.hasLayer(layer)) return null;
      return { layer: layer, point: { lat: p.lat, lng: p.lng }, label: row.name || '공개 고정 출현 지점', valid: function () {
        var live = layer.getLatLng(); return map.hasLayer(layer) && map.hasLayer(popup) && live.lat === row.lat && live.lng === row.lon && live.lat === p.lat && live.lng === p.lng;
      } };
    }
    document.addEventListener('click', function (event) {
      var b = event.target.closest && event.target.closest('[data-location-site],[data-location-fixed],[data-location-report]'); if (!b) return;
      event.preventDefault(); event.stopImmediatePropagation();
      var popup = map._popup, element = popup && popup.getElement(); if (!element || !element.contains(b)) return;
      var site = b.getAttribute('data-location-site'), fixed = b.getAttribute('data-location-fixed'), report = b.getAttribute('data-location-report');
      api.guide(function () {
        if (!map.hasLayer(popup) || !element.contains(b)) return null;
        if (report) {
          var canonical = (global.reportPublicSpots || {})[report];
          var row = canonical && (canonical.history || []).find(function (entry) { return entry.id === report; });
          var term = row && row.species && row.species[0];
          return term && global.publicReportGuideTarget ? global.publicReportGuideTarget(report, term) : null;
        }
        return staticTarget(site ? 'site' : 'fixed', site || fixed, popup);
      }, popup);
    }, true);
    var invalidate = global.publicationInvalidate;
    if (typeof invalidate === 'function') global.publicationInvalidate = function () { api.invalidate(); return invalidate.apply(this, arguments); };
    map.on('popupclose', function (e) { api.popupClosed(e.popup); schedulePlace(); });
    map.on('popupopen', function () { observeSizes(); schedulePlace(); });
    map.on('resize', schedulePlace); map.on('layerremove', function (e) { api.layerRemoved(e.layer); });
    map.on('moveend zoomend', function () { api.validate(); schedulePlace(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) api.clear('화면을 떠나 위치 표시와 GPS 갱신을 종료했습니다.'); });
    global.addEventListener('pagehide', function () { api.clear(''); });
    global.addEventListener('resize', schedulePlace);
    // Overlay state changes (filter/recent/sheets) must not cover the independent GPS button.
    var overlaySelector = '#mapTitleBox,#birdmapPanel,#topBtnRow,#noticePanel,#todayPanel,.leaflet-control-zoom,.birdmap-basemap,#recentReportsBox,.leaflet-popup,.birdmap-mobile-popup,.birdmap-report-location-popup';
    var placementFrame = null, disposed = false;
    function schedulePlace() {
      if (disposed || placementFrame !== null) return;
      placementFrame = global.requestAnimationFrame(function () { placementFrame = null; if (!disposed) place(); });
    }
    var sizes = new global.ResizeObserver(schedulePlace), observed = new WeakSet();
    var observer = new global.MutationObserver(schedulePlace);
    function observeSizes() { document.querySelectorAll(overlaySelector).forEach(function (node) { if (!observed.has(node)) {
      observed.add(node); sizes.observe(node);
      // Leaflet rewrites popup transforms throughout dragging; moveend handles that position change.
      observer.observe(node, { attributes: true, attributeFilter: node.classList.contains('leaflet-popup') ? ['class', 'hidden'] : ['class', 'hidden', 'style'] });
    } }); }
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'hidden'] });
    map.on('unload', function () { disposed = true; if (placementFrame !== null) global.cancelAnimationFrame(placementFrame); observer.disconnect(); sizes.disconnect(); api.destroy(); root.remove(); }); observeSizes(); schedulePlace();
  }
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install); else install();
})(window);
