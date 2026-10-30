(function (global) {
  'use strict';
  // Compact report-location panel: title + ×, then GPS + address/place search (OpenStreetMap Nominatim).
  // A result only moves the map; the report location is still set by a map tap or GPS (existing code paths).
  // Set to '' to switch search off (Nominatim policy: the operator must be able to stop calls without a code change).
  var SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
  var MIN_GAP = 1100, TIMEOUT = 8000, MAX_RESULTS = 3;
  var document = global.document, cache = {}, last = 0, token = 0;
  var input, list, note, panel;

  function map() { return global.map_7010a44f6ac2025090f0fe07508ed485; }
  function clean(text) { return String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100); }
  // "주남저수지, 의창구, 창원시, 경상남도, 51116, 대한민국" -> "경상남도 창원시 의창구"
  function address(row, name) {
    var parts = String(row.display_name || '').split(', ').filter(function (part, i) {
      return part && part !== '대한민국' && !/^\d{5}$/.test(part) && !(i === 0 && part === name);
    });
    return parts.reverse().join(' ');
  }
  function places(rows) {
    var seen = {}, out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var lat = Number(row.lat), lon = Number(row.lon);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      var name = clean(row.name) || clean(String(row.display_name || '').split(', ')[0]), addr = address(row, name);
      if (!name || seen[name + '|' + addr]) return;
      seen[name + '|' + addr] = true;
      out.push({ name: name, address: addr, lat: lat, lon: lon });
    });
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
    credit.className = 'rpsCredit'; credit.textContent = '© OpenStreetMap';
    list.appendChild(credit);
    list.hidden = false;
    lift();
  }
  function choose(place) {
    closeList();
    input.blur();
    map().setView([place.lat, place.lon], 16, { animate: false });
    say('지도를 눌러 발견 지점을 지정하세요.', 'hint');
  }

  function search() {
    var q = clean(input.value), mine = ++token;
    if (!q) { reset(false); return; }
    if (cache[q]) { show(cache[q]); return; }
    closeList(); say('검색 중…');
    var wait = Math.max(0, last + MIN_GAP - Date.now());
    global.setTimeout(function () {
      if (mine !== token) return;
      last = Date.now();
      var abort = global.AbortController ? new global.AbortController() : null, timer = abort && global.setTimeout(function () { abort.abort(); }, TIMEOUT);
      var url = SEARCH_URL + '?format=jsonv2&limit=5&countrycodes=kr&accept-language=ko&q=' + encodeURIComponent(q);
      global.fetch(url, { signal: abort ? abort.signal : undefined, credentials: 'omit' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (rows) {
        if (mine !== token) return;
        cache[q] = places(rows);
        show(cache[q]);
      }).catch(function () {
        if (mine === token) say('검색하지 못했습니다. 지도에서 직접 지정해 주세요.', 'error');
      }).then(function () { if (timer) global.clearTimeout(timer); });
    }, wait);
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
    if (SEARCH_URL && global.fetch) {
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

  global.birdmapReportPickSearchPlaces = places;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})(window);
