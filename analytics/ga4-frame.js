(() => {
  'use strict';

  const mapOrigin = 'https://wooil1964.github.io';
  const mapUrl = mapOrigin + '/birdmap/';
  const measurementId = 'G-S2G00KJMPW';
  const disabled = 'ga-disable-' + measurementId;
  if (parent === window || window.origin === 'null' || window.origin === mapOrigin ||
      document.referrer || location.protocol !== 'https:' ||
      location.href !== location.origin + '/ga4-frame.html') return;

  function stop() {
    window[disabled] = true;
  }

  window.addEventListener('pagehide', stop, { capture: true });
  window.addEventListener('message', function start(event) {
    if (event.source !== parent || event.origin !== mapOrigin ||
        event.data?.type !== 'birdmap-ga4-start' ||
        typeof event.data.clientId !== 'string' ||
        !/^\d{1,10}\.\d{1,10}$/.test(event.data.clientId)) return;

    window.removeEventListener('message', start);
    if (window[disabled]) return;

    // The dedicated origin has no access to the map. The map sends only a random browser ID.
    const page = {
      page_location: mapUrl,
      page_title: '전국 탐조지도',
      page_referrer: mapUrl,
      ignore_referrer: true,
    };
    window.dataLayer = [];
    function gtag() {
      window.dataLayer.push(arguments);
    }

    gtag('consent', 'default', {
      // The map enforces opt-in and keeps the browser ID. The tag runs without GA cookies.
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('set', { ads_data_redaction: true, url_passthrough: false });
    gtag('js', new Date());

    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    script.addEventListener('load', () => {
      if (window[disabled]) return;
      window.addEventListener('message', function sendView(message) {
        if (message.source !== parent || message.origin !== mapOrigin ||
            message.data !== 'birdmap-ga4-view') return;
        window.removeEventListener('message', sendView);
        if (window[disabled]) return;
        gtag('config', measurementId, {
          ...page,
          client_id: event.data.clientId,
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        });
        gtag('event', 'page_view', {
          ...page,
          send_to: measurementId,
          event_callback: stop,
          event_timeout: 1500,
        });
      });
      parent.postMessage('birdmap-ga4-ready', mapOrigin);
    }, { once: true });
    script.addEventListener('error', stop, { once: true });
    window.setTimeout(stop, 5000);
    document.head.append(script);
  });
})();
