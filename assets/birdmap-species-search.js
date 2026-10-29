(function (global) {
  'use strict';
  var document = global.document, request = 0, selected = null;
  var MAX_PAGES = 50, MAX_WAIT = 15000;
  function validId(id) { return typeof id === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(id); }
  function query(name) { return String(name || '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100); }
  function map() { return global.map_7010a44f6ac2025090f0fe07508ed485; }
  function current(token, generation) { return token === request && generation === global.publicationState.generation && global.publicationAllowed(); }
  function status(text) {
    var node = document.getElementById('birdmapReportLocationStatus');
    if (!node) { node = document.createElement('div'); node.id = 'birdmapReportLocationStatus'; node.setAttribute('role', 'status'); document.body.appendChild(node); }
    node.textContent = text; node.hidden = !text;
  }
  function forget() {
    var old = selected; selected = null;
    if (!old) return;
    if (old.element) old.element.classList.remove('birdmap-report-location-selected');
    if (old.observer) old.observer.disconnect();
    var m = map();
    if (old.popup.getElement()) old.popup.getElement().textContent = '';
    if (m && m.hasLayer(old.popup)) m.closePopup(old.popup);
    // Disposable location cards must not retain report content/coordinates through Leaflet's closed _popup.
    old.popup.setContent(''); old.popup._source = null; old.popup._latlng = null;
    if (m && m._popup === old.popup) m._popup = null;
  }
  function cancel() { request++; forget(); status(''); }

  // /approved history has no per-row protection flags. Use the existing /search public projection to authorize
  // the exact report; hidden, protected, breeding and unsafe attached reports have no public target there.
  function proof(id, term, token, generation) {
    var offset = 0, pages = 0, anchor = null, total = null, started = Date.now();
    function next() {
      if (!current(token, generation) || pages++ >= MAX_PAGES || Date.now() - started > MAX_WAIT) return Promise.resolve(null);
      return global.publicationFetch('/reports/search?limit=20&offset=' + offset + '&q=' + encodeURIComponent(query(term))).then(function (body) {
        if (!current(token, generation) || !global.publicationDataAllowed(body)) return null;
        if (anchor && !global.publicationSame(anchor, body.publication)) return null;
        var page = global.reportArchivePayload(body, offset);
        if (!page || (total !== null && total !== page.total)) return null;
        anchor = body.publication; total = page.total;
        var rows = page.reports.filter(function (row) { return row.id === id; });
        if (rows.length) return rows.length === 1 && rows[0].locationHidden === false && rows[0].target ? { row: rows[0], body: body } : null;
        if (!page.hasMore) return null;
        offset += 20; return next();
      });
    }
    return next();
  }
  function publicTarget(id, row) {
    var witnesses = global.reporterStatsWitnesses;
    if (!witnesses || !row || row.id !== id || row.locationHidden !== false || !row.target) return null;
    var matches = (global.reportSearchIndex || []).filter(function (entry) { return witnesses.get(entry) === id; });
    if (matches.length !== 1) return null;
    var entry = matches[0], target = row.target, layer, canonical, history;
    if (entry.kind !== target.kind || entry.spotId !== target.spotId) return null;
    if (target.kind === 'spot') {
      canonical = (global.reportPublicSpots || {})[target.spotId];
      // /approved omits the false flag. The exact-row /search proof above must explicitly authorize this target.
      if (!canonical || canonical.id !== target.spotId || canonical.locationHidden === true) return null;
      history = canonical.history || []; layer = (global.reportSpotLayers || {})[target.spotId];
      if (!layer || !map().hasLayer(layer)) return null;
    } else if (target.kind === 'fixed') {
      var fixed = (global.siteSpotData || []).filter(function (spot) { return spot.id === target.spotId; });
      if (fixed.length !== 1) return null;
      canonical = fixed[0]; history = (global.reportFixedHistory || {})[target.spotId] || [];
      layer = (global.siteSpotLayers || [])[(global.siteSpotData || []).indexOf(canonical)];
    } else return null;
    if (!layer || !layer.getLatLng || history.filter(function (item) { return item.id === id; }).length !== 1) return null;
    var point = layer.getLatLng();
    if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number' || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
      || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || point.lat !== canonical.lat || point.lng !== canonical.lon) return null;
    return { layer: layer, point: point };
  }
  // GPS never supplies coordinates to the public API. Reuse the exact-row proof and fresh gate,
  // both before asking for GPS and after its asynchronous response (including every watched fix).
  function guideTarget(id, term) {
    var token = request, generation = global.publicationState.generation, result = null;
    if (!validId(id) || !global.publicationAllowed()) return Promise.resolve(null);
    return proof(id, term, token, generation).then(function (verified) {
      if (!verified || !current(token, generation)) return false;
      return global.publicationRouteCheck(function () {
        if (!current(token, generation) || !global.publicationDataAllowed(verified.body)) return false;
        var target = publicTarget(id, verified.row); if (!target) return false;
        result = { layer: target.layer, point: { lat: target.point.lat, lng: target.point.lng }, publicReport: true,
          label: verified.row.target.kind === 'fixed' ? '탐조지 공개 고정 위치' : '출현 지점', name: verified.row.species.join(' · '),
          valid: function () {
            if (!current(token, generation) || !global.publicationDataAllowed(verified.body)) return false;
            var live = publicTarget(id, verified.row);
            return !!live && live.layer === target.layer && live.point.lat === result.point.lat && live.point.lng === result.point.lng;
          } };
        return true;
      });
    }).catch(function () { return false; }).then(function (ok) { return ok ? result : null; });
  }
  function content(row) {
    var root = document.createElement('section'); root.className = 'birdmap-report-location-content';
    root.setAttribute('data-publication-entry', row.id);
    var name = document.createElement('strong'); name.className = 'birdmap-report-location-species'; name.textContent = row.species.join(' · '); root.appendChild(name);
    var date = document.createElement('div'); date.textContent = '제보 날짜: ' + row.date; root.appendChild(date);
    var who = document.createElement('div'); who.className = 'birdmap-report-location-reporter'; who.appendChild(document.createTextNode('제보자: '));
    who.appendChild(global.reporterStatsElement(row.reporter, { source: 'history', reportId: row.id }, false)); root.appendChild(who);
    var routes = document.createElement('div'); routes.className = 'birdmap-report-location-routes';
    ['kakao', 'tmap', 'gps'].forEach(function (app) {
      // No destination URL survives in the DOM. Every activation obtains fresh exact-ID authority.
      var button = document.createElement('button'); button.type = 'button';
      button.setAttribute('data-birdmap-report-route', app); button.setAttribute('data-report-id', row.id);
      button.textContent = (app === 'kakao' ? '카카오맵' : app === 'tmap' ? '티맵' : '내 위치') + ' ';
      var action = document.createElement('span'); action.textContent = app === 'gps' ? '찾기' : '찾아가기'; button.appendChild(action);
      if (app === 'gps') button.setAttribute('aria-label', '내 위치 찾기');
      if (app === 'tmap') button.title = '티맵 앱이 설치된 스마트폰에서 이용';
      routes.appendChild(button);
    });
    root.appendChild(routes);
    if (row.target.kind === 'fixed') {
      var note = document.createElement('div'); note.className = 'birdmap-report-location-note';
      note.textContent = '공개 고정 마커로 안내합니다. 실제 관찰 지점이 아닙니다.'; root.appendChild(note);
    }
    return root;
  }
  function route(button) {
    var card = selected, app = button.getAttribute('data-birdmap-report-route');
    function live() {
      return selected === card && card && map().hasLayer(card.popup) && card.popup.getContent() === card.root
        && card.root.isConnected !== false && card.root.contains(button) && button.getAttribute('data-report-id') === card.id;
    }
    if (app === 'gps' && live() && global.birdmapLocation) {
      return global.birdmapLocation.guide(function () { return live() ? guideTarget(card.id, card.term) : null; }, card.popup);
    }
    if (!live() || (app !== 'kakao' && app !== 'tmap') || card.busy || !global.publicationAllowed()) return Promise.resolve(false);
    var token = ++request, generation = global.publicationState.generation;
    card.busy = true; status('길찾기 공개 위치를 다시 확인하고 있습니다.');
    return proof(card.id, card.term, token, generation).then(function (verified) {
      if (!verified || !live() || !current(token, generation)) return false;
      return global.publicationRouteCheck(function () {
        if (!live() || !current(token, generation) || !global.publicationDataAllowed(verified.body)) return false;
        var target = publicTarget(card.id, verified.row);
        if (!target || target.layer !== card.layer || target.point.lat !== card.point.lat || target.point.lng !== card.point.lng) return false;
        var dest = { lat: target.point.lat, lon: target.point.lng };
        var label = verified.row.target.kind === 'fixed' ? '탐조지 공개 고정 위치' : '출현 지점';
        if (app === 'tmap') {
          if (!global.openTmapNavigation()) return true; // Desktop: show the existing smartphone-only explanation, never execute a mobile scheme.
          var tmapUrl = global.tmapNavigationUrl(dest, label); if (!tmapUrl) return false;
          global.location.href = tmapUrl;
        } else {
          var url = global.spotKakaoRouteUrl(dest, label); if (!url) return false;
          var opened = global.open('about:blank', '_blank');
          if (!opened) { global.alert('팝업이 차단됐어요. 브라우저 설정을 확인한 뒤 다시 눌러 주세요.'); return false; }
          try { opened.opener = null; } catch (ignore) {}
          opened.location.href = url;
        }
        return true;
      });
    }).catch(function () { return false; }).then(function (ok) {
      if (selected === card) card.busy = false;
      if (token === request) status(ok ? '' : '현재 공개 위치를 확인할 수 없어 길찾기를 열지 않았습니다.');
      return ok === true;
    });
  }
  function position() {
    if (!selected || !global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)').matches) return;
    var m = map(), node = selected.popup.getElement(); if (!node || !m.hasLayer(selected.popup)) return;
    var container = m.getContainer(), rect = container.getBoundingClientRect(), point = m.latLngToContainerPoint(selected.layer.getLatLng());
    var title = document.getElementById('mapTitleBox'), recent = document.getElementById('recentReportsBox');
    var top = title ? Math.max(8, title.getBoundingClientRect().bottom - rect.top + 8) : 8;
    var bottom = rect.height - 8;
    if (recent && recent.getClientRects().length && global.getComputedStyle(recent).display !== 'none') bottom = Math.min(bottom, recent.getBoundingClientRect().top - rect.top - 8);
    node.style.setProperty('--birdmap-location-max-height', Math.max(80, bottom - top) + 'px');
    if (node.classList.contains('birdmap-gps-compact')) {
      // GPS guide bar: full width just above the recent-report sheet, clear of both endpoints.
      node.style.setProperty('--birdmap-location-left', '8px');
      node.style.setProperty('--birdmap-location-top', Math.max(top, bottom - node.getBoundingClientRect().height) + 'px');
      return;
    }
    var box = node.getBoundingClientRect(), left = Math.max(8, Math.min(rect.width - box.width - 8, point.x - box.width / 2));
    var candidates = [point.y - box.height - 14, point.y + 14].map(function (y) { return Math.max(top, Math.min(bottom - box.height, y)); });
    var controls = ['#birdmapExploreMenuToggle', '#noticeToggleBtn', '#todayToggleBtn', '#reportToggleBtn', '.birdmap-basemap', '.leaflet-control-zoom'].map(function (selector) {
      var el = document.querySelector(selector); return el && el.getClientRects().length ? el.getBoundingClientRect() : null;
    }).filter(Boolean);
    function score(y) { return controls.reduce(function (sum, r) {
      return sum + Math.max(0, Math.min(rect.left + left + box.width, r.right) - Math.max(rect.left + left, r.left))
        * Math.max(0, Math.min(rect.top + y + box.height, r.bottom) - Math.max(rect.top + y, r.top));
    }, 0); }
    var y = score(candidates[1]) < score(candidates[0]) ? candidates[1] : candidates[0];
    node.style.setProperty('--birdmap-location-left', left + 'px'); node.style.setProperty('--birdmap-location-top', y + 'px');
  }
  function present() {
    if (!selected || !map().hasLayer(selected.popup)) return;
    var popup = selected.popup, node = popup.getElement(); if (!node) return;
    if (popup._birdmapSettleTimer) { global.clearTimeout(popup._birdmapSettleTimer); popup._birdmapSettleTimer = null; }
    var close = node.querySelector('.leaflet-popup-close-button'); if (close) close.setAttribute('aria-label', '제보 위치 정보 닫기');
    if (global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)').matches) map().getContainer().appendChild(node);
    else if (node.parentNode !== map().getPane('popupPane')) { map().getPane('popupPane').appendChild(node); popup.update(); }
    position();
  }
  // A verified GPS guide keeps this card open (its proof and close events stay live) but folds it on mobile.
  function compactForGps(popup) {
    if (!selected || selected.popup !== popup || !map().hasLayer(popup)) return false;
    if (!global.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse) and (max-width:1023px) and (max-height:500px)').matches) return false;
    var node = popup.getElement(); if (!node) return false;
    var bar = node.querySelector('.birdmap-report-location-bar');
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'birdmap-report-location-bar';
      var label = document.createElement('span'); label.textContent = '위치 안내 중'; bar.appendChild(label);
      var toggle = document.createElement('button'); toggle.type = 'button'; bar.appendChild(toggle);
      toggle.addEventListener('click', function () {
        if (!node.classList.contains('birdmap-gps-compact')) { if (global.birdmapLocation) global.birdmapLocation.focusGuide(); return; }
        node.classList.remove('birdmap-gps-compact'); barState(node); position();
      });
      node.prepend(bar);
    }
    node.classList.add('birdmap-gps-compact'); barState(node); position();
    return true;
  }
  function barState(node) {
    var compact = node.classList.contains('birdmap-gps-compact'), toggle = node.querySelector('.birdmap-report-location-bar button');
    toggle.textContent = compact ? '정보 보기' : '접기';
    toggle.setAttribute('aria-expanded', String(!compact));
    toggle.setAttribute('aria-label', compact ? '제보 위치 정보 보기' : '제보 위치 정보 접기');
  }
  function restoreAfterGps(popup) {
    var node = popup && popup.getElement(); if (!node) return;
    var bar = node.querySelector('.birdmap-report-location-bar');
    node.classList.remove('birdmap-gps-compact'); if (bar) bar.remove();
    if (selected && selected.popup === popup) position();
  }
  function show(row, target) {
    // setView with animate:false stops pending pans itself. map.stop() can start a snapped zoom animation
    // from the initial fractional Korea view and later undo this exact report destination.
    var m = map(); forget(); m.closePopup();
    if (!m.hasLayer(target.layer)) target.layer.addTo(m); // Reveal an existing authorized fixed marker; never create one.
    m.setView(target.point, 13, { animate: false });
    var popup = global.L.popup({ className: 'birdmap-report-location-popup', minWidth: 200, maxWidth: 240, autoPan: false, closeButton: true }, target.layer);
    var root = content(row);
    popup._birdmapReportLocation = true; popup.setLatLng(target.point).setContent(root);
    var element = target.layer.getElement && target.layer.getElement();
    selected = { popup: popup, layer: target.layer, element: element, root: root, id: row.id, term: query(row.species[0]), point: { lat: target.point.lat, lng: target.point.lng } };
    if (element) element.classList.add('birdmap-report-location-selected');
    if (target.layer.bringToFront) target.layer.bringToFront();
    popup.openOn(m); global.queueMicrotask(present);
    if (global.ResizeObserver) { selected.observer = new global.ResizeObserver(position); selected.observer.observe(popup.getElement()); }
  }
  function openCard(id, term) {
    var token = ++request;
    if (!validId(id) || !global.publicationAllowed()) return Promise.resolve(false);
    var generation = global.publicationState.generation;
    status('공개 위치를 확인하고 있습니다.');
    return proof(id, term, token, generation).then(function (verified) {
      if (!verified || !current(token, generation)) return false;
      return global.publicationRouteCheck(function () {
        if (!current(token, generation) || !global.publicationDataAllowed(verified.body)) return false;
        var target = publicTarget(id, verified.row); if (!target) return false;
        show(verified.row, target); return true;
      });
    }).catch(function () { return false; }).then(function (ok) {
      if (token === request) status(ok ? '' : '공개 위치를 확인할 수 없습니다. 위치를 표시하지 않습니다.');
      return ok === true;
    });
  }
  function install() {
    var render = global.siteHistoryEntryHtml, escape = global.escapeHtml, m = map();
    if (typeof render !== 'function' || typeof escape !== 'function' || !m || typeof global.publicationInvalidate !== 'function') return;
    global.siteHistoryEntryHtml = function (entry) {
      var html = render(entry), species = (entry && entry.species) || [];
      var plain = '<div class="siteHistoryName">출현종: ' + species.map(escape).join(' · ') + '</div>';
      if (!entry || !validId(entry.id) || !species.length || html.indexOf(plain) < 0) return html;
      return html.replace(plain, function () { return '<div class="siteHistoryName">출현종: ' + species.map(function (name) {
        return '<button type="button" class="speciesSearchLink" data-report-id="' + escape(entry.id) + '" data-species="' + escape(query(name))
          + '" aria-label="' + escape(name + ' 제보 공개 위치로 이동') + '">' + escape(name) + '</button>';
      }).join(' · ') + '</div>'; });
    };
    var invalidate = global.publicationInvalidate;
    global.publicationInvalidate = function () { cancel(); return invalidate.apply(this, arguments); };
    var autoPan = global.applyMobilePopupAutoPan;
    global.applyMobilePopupAutoPan = function (popup) { if (popup && popup._birdmapReportLocation) { popup.options.autoPan = false; return; } if (autoPan) return autoPan.apply(this, arguments); };
    global.openPublicReportLocation = open;
    global.publicReportGuideTarget = guideTarget;
    global.birdmapCollapseReportLocationForGps = compactForGps;
    global.birdmapRestoreReportLocationAfterGps = restoreAfterGps;
    m.on('layerremove', function (event) { if (selected && event.layer === selected.layer) cancel(); });
    m.on('popupclose', function (event) { if (selected && event.popup === selected.popup) cancel(); });
    m.on('popupopen', function (event) { if (!event.popup._birdmapReportLocation) { request++; forget(); status(''); } });
    m.on('move zoom resize', position); global.addEventListener('resize', function () { if (selected) present(); });
  }
  // The same report while its desktop GPS tag is shown: reopen its details and keep the guide.
  function open(id, term) {
    if (selected && selected.id === id && global.birdmapExpandGpsTag && global.birdmapExpandGpsTag(selected.popup)) return Promise.resolve(true);
    return openCard(id, term);
  }
  document.addEventListener('click', function (event) {
    var target = event.target, routeButton = target && target.closest && target.closest('[data-birdmap-report-route]');
    if (routeButton) { event.preventDefault(); event.stopImmediatePropagation(); route(routeButton); return; }
    var node = target && target.closest && target.closest('.speciesSearchLink');
    if (node) { event.preventDefault(); event.stopImmediatePropagation(); open(node.getAttribute('data-report-id'), node.getAttribute('data-species')); return; }
    var item = target && target.closest && target.closest('#recentReportsList .recentReportItem');
    if (!item || target.closest('.reporterStatsLink')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    var items = Array.from(document.querySelectorAll('#recentReportsList .recentReportItem'));
    var entries = (global.reportSearchIndex || []).filter(function (entry) { return entry.date && entry.date >= global.kstDateTextBefore(global.RECENT_REPORT_DAYS); }).slice(0, global.RECENT_REPORT_LIMIT);
    var entry = entries[items.indexOf(item)], id = entry && global.reporterStatsWitnesses.get(entry);
    if (validId(id)) open(id, (entry.species || [])[0]);
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})(window);
