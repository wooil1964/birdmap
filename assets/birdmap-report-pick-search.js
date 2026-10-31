(function (global) {
  'use strict';
  // Compact report-location panel: title + ×, then GPS + address/place search (Kakao Maps JavaScript SDK services).
  // A result only moves the map; the report location is still set by a map tap or GPS (existing code paths).
  // JavaScript key only (public by design, works only on the domains registered for app 1630711). Never a REST/Admin key.
  // Set to '' to switch search off; the compact panel, GPS and map picking keep working.
  var KAKAO_JS_KEY = '6c88cf4bb5c55c0b019e72ad7fded007';
  var SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js?libraries=services&autoload=false&appkey=';
  var TIMEOUT = 8000, MAX_RESULTS = 3;
  var document = global.document, sdk = null, token = 0;
  var input, list, note, panel;

  function map() { return global.map_7010a44f6ac2025090f0fe07508ed485; }
  function clean(text) { return String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100); }

  // The SDK is loaded on the first search only. A failed load is forgotten so the next Enter retries.
  function services() {
    if (sdk) return sdk;
    sdk = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SDK_URL + encodeURIComponent(KAKAO_JS_KEY);
      script.onerror = function () { script.remove(); reject(new Error('sdk')); };
      script.onload = function () {
        var kakao = global.kakao;
        if (!kakao || !kakao.maps || typeof kakao.maps.load !== 'function') { reject(new Error('sdk')); return; }
        kakao.maps.load(function () { if (kakao.maps.services) resolve(kakao.maps.services); else reject(new Error('services')); });
      };
      document.head.appendChild(script);
    });
    sdk.catch(function () { sdk = null; });
    return sdk;
  }
  // One Kakao call; ERROR (network, domain, quota 429) and a missing callback both end as {failed: true}.
  function call(services, owner, method, q) {
    return new Promise(function (resolve) {
      new services[owner]()[method](q, function (rows, status) {
        if (status === services.Status.OK) resolve({ rows: rows || [] });
        else if (status === services.Status.ZERO_RESULT) resolve({ rows: [] });
        else resolve({ failed: true });
      }, { size: 5 });  // a little more than shown, so de-duplication still leaves three (quota counts calls, not rows)
    });
  }
  // Addresses first (an exact address beats a nearby place), then places; one entry per point, at most three.
  function results(addresses, spots) {
    var seen = {}, out = [];
    function add(name, sub, x, y) {
      var lat = Number(y), lon = Number(x);
      name = clean(name); sub = clean(sub);
      if (!name || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      var key = lat.toFixed(5) + ',' + lon.toFixed(5);
      if (seen[key]) return;
      seen[key] = true;
      out.push({ name: name, address: sub === name ? '' : sub, lat: lat, lon: lon });
    }
    addresses.forEach(function (a) {
      var road = a.road_address || {}, lot = a.address || {};
      add(a.address_name, road.building_name || [road.address_name, lot.address_name].filter(function (t) { return t && t !== a.address_name; })[0], a.x, a.y);
    });
    spots.forEach(function (p) { add(p.place_name, p.road_address_name || p.address_name, p.x, p.y); });
    return out.slice(0, MAX_RESULTS);
  }

  function say(text, kind) { note.textContent = text || ''; note.className = 'rpsNote' + (kind ? ' ' + kind : ''); }
  function closeList() { list.textContent = ''; list.hidden = true; }
  function reset(clearInput) { token++; closeList(); say(''); if (clearInput) input.value = ''; }

  function show(results) {
    closeList();
    if (!results.length) { say('검색 결과가 없습니다.'); return; }
    say('');
    results.forEach(function (place) {
      var item = document.createElement('li'), button = document.createElement('button'), title = document.createElement('b'), sub = document.createElement('span');
      button.type = 'button'; title.textContent = place.name; sub.textContent = place.address;
      button.appendChild(title); if (place.address) button.appendChild(sub);
      button.addEventListener('click', function () { choose(place); });
      item.appendChild(button); list.appendChild(item);
    });
    var credit = document.createElement('li');
    credit.className = 'rpsCredit'; credit.textContent = '검색: 카카오';
    list.appendChild(credit);
    list.hidden = false;
    lift();
  }
  function choose(place) {
    closeList();
    input.blur();
    var m = map(), go = function () { m.setView([place.lat, place.lon], 16, { animate: false }); };
    // Leaflet ignores setView during a zoom animation (~250 ms after a zoom button or pinch): move once it ends.
    if (m._animatingZoom) m.once('zoomend', go); else go();
    say('지도를 눌러 발견 지점을 지정하세요.', 'hint');
  }

  // Every Enter asks Kakao again: results are shown and dropped, never stored or cached (Kakao policy).
  function search() {
    var q = clean(input.value), mine = ++token, timer;
    if (!q) { reset(false); return; }
    closeList(); say('검색 중…');
    var late = new Promise(function (resolve) { timer = global.setTimeout(function () { resolve(null); }, TIMEOUT); });
    var asked = services().then(function (s) {
      return Promise.all([call(s, 'Geocoder', 'addressSearch', q), call(s, 'Places', 'keywordSearch', q)]);
    }, function () { return null; });
    Promise.race([asked, late]).then(function (both) {
      global.clearTimeout(timer);
      if (mine !== token) return;
      var found = both ? results(both[0].rows || [], both[1].rows || []) : [];
      if (found.length || (both && !both[0].failed && !both[1].failed)) show(found);
      else say('검색하지 못했습니다. 지도에서 직접 지정해 주세요.', 'error');
    });
  }

  // Android Chrome resizes only the visual viewport for the keyboard, so a bottom-fixed panel would sit under it.
  function lift() {
    var vv = global.visualViewport, inset = 0;
    if (vv && document.activeElement === input) inset = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
    panel.style.bottom = inset > 0 ? inset + 8 + 'px' : '';
    // Landscape phones leave ~200px above the keyboard: the result list scrolls instead of pushing the title off-screen.
    list.style.maxHeight = '';
    if (inset > 0) list.style.maxHeight = Math.max(88, vv.height - 16 - (panel.offsetHeight - list.offsetHeight)) + 'px';
  }

  function build() {
    panel = document.getElementById('reportPickPanel');
    var gps = document.getElementById('reportGpsPickBtn'), cancel = document.getElementById('reportCancelBtn');
    var title = panel && panel.querySelector('strong');
    if (!panel || !gps || !cancel || !title || typeof global.cancelReportPicking !== 'function') return false;
    var head = document.createElement('div'), close = document.createElement('button'), row = document.createElement('div');
    head.className = 'rpsHead';
    close.type = 'button'; close.className = 'rpsClose'; close.setAttribute('aria-label', '제보 위치 선택 닫기'); close.textContent = '×';
    close.addEventListener('click', function () { reset(true); global.cancelReportPicking(); });
    panel.insertBefore(head, title); head.appendChild(title); head.appendChild(close);
    row.className = 'rpsRow';
    panel.insertBefore(row, head.nextSibling);
    row.appendChild(gps);
    cancel.hidden = true;
    panel.classList.add('rpsCompact');
    note = document.createElement('div'); note.className = 'rpsNote'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
    list = document.createElement('ul'); list.className = 'rpsResults'; list.hidden = true; list.setAttribute('aria-label', '검색 결과');
    if (KAKAO_JS_KEY && global.Promise) {
      var form = document.createElement('form');
      form.className = 'rpsForm'; form.setAttribute('role', 'search');
      input = document.createElement('input');
      input.type = 'search'; input.placeholder = '주소·장소명 검색'; input.setAttribute('aria-label', '주소·장소명 검색');
      input.setAttribute('enterkeyhint', 'search'); input.autocomplete = 'off'; input.maxLength = 100;
      form.appendChild(input); row.appendChild(form);
      form.addEventListener('submit', function (event) { event.preventDefault(); search(); });
      input.addEventListener('input', function () { if (!input.value) reset(false); });
      input.addEventListener('focus', lift); input.addEventListener('blur', function () { global.setTimeout(lift, 0); });
      if (global.visualViewport) { global.visualViewport.addEventListener('resize', lift); global.visualViewport.addEventListener('scroll', lift); }
      panel.insertBefore(list, row.nextSibling); panel.insertBefore(note, list.nextSibling);
    } else {
      input = document.createElement('input');
    }
    return true;
  }

  function install() {
    if (!build()) return;
    // Shorter GPS labels for this one button only; the modal's GPS button keeps its own text.
    var idle = global.reportGpsIdleLabel, busy = global.setReportGpsBusy, stop = global.stopReportPicking;
    global.reportGpsIdleLabel = function (button) {
      if (button && button.id === 'reportGpsPickBtn') return global.reportLocationSource === 'gps' ? '다시 찾기' : '현재 위치';
      return idle.apply(this, arguments);
    };
    global.setReportGpsBusy = function (on) {
      busy.apply(this, arguments);
      var gps = document.getElementById('reportGpsPickBtn');
      if (gps && on) gps.textContent = '확인 중…';
    };
    // A map tap / GPS fix (or closing) ends the search step; the typed text stays for a retry.
    global.stopReportPicking = function () { reset(false); return stop.apply(this, arguments); };
    var gps = document.getElementById('reportGpsPickBtn');
    gps.textContent = global.reportGpsIdleLabel(gps);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})(window);
