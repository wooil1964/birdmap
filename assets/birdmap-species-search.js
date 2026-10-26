(function (global) {
  'use strict';

  // Species names in a site popup's "최근 출현 이력" open the approved-report archive searched for that name. The archive
  // searches the server's public projection only, and entries with a hidden location stay unlinked there.
  // index.html is frozen outside approved islands, so its history renderer is wrapped here rather than edited.
  var MAX_QUERY = 100; // The archive search accepts at most 100 characters.
  var document = global.document;

  function query(name) {
    return String(name || '').replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_QUERY);
  }

  function linkedNames(species, escape) {
    return species.map(function (name) {
      var q = query(name);
      if (!q) return escape(name);
      return '<button type="button" class="speciesSearchLink" data-species="' + escape(q) + '" aria-label="' +
        escape(name + ' 공개 출현 기록 검색') + '">' + escape(name) + '</button>';
    }).join(' · ');
  }

  function install() {
    var render = global.siteHistoryEntryHtml, escape = global.escapeHtml;
    if (typeof render !== 'function' || typeof escape !== 'function' || typeof global.openReportArchive !== 'function') return;
    global.siteHistoryEntryHtml = function (entry) {
      var html = render(entry), species = (entry && entry.species) || [];
      var plain = '<div class="siteHistoryName">출현종: ' + species.map(escape).join(' · ') + '</div>';
      // Only that exact line is replaced; any other shape keeps the plain names.
      if (!species.length || html.indexOf(plain) < 0) return html;
      return html.replace(plain, function () {
        return '<div class="siteHistoryName">출현종: ' + linkedNames(species, escape) + '</div>';
      });
    };
  }

  function search(name) {
    var input = document.getElementById('reportArchiveSearch');
    if (!name || !input || typeof global.searchReportArchive !== 'function') return;
    // Opening the archive focuses its search box: read-only meanwhile so phones do not raise the keyboard.
    input.readOnly = true;
    try {
      global.openReportArchive();
      input.value = name;
      global.searchReportArchive(false);
      var close = document.querySelector('#reportArchiveModal .monthTideHeader button');
      if (close) close.focus({ preventScroll: true });
    } finally {
      input.readOnly = false;
    }
  }

  // Capture phase, like the reporter links: Leaflet stops clicks inside popups from bubbling.
  document.addEventListener('click', function (event) {
    var node = event.target && event.target.closest && event.target.closest('.speciesSearchLink');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    search(query(node.getAttribute('data-species')));
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})(window);
