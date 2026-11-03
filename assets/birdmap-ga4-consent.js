(() => {
  'use strict';

  const mapUrl = 'https://wooil1964.github.io/birdmap/';
  // Activate only after the dedicated HTTPS origin and GA4 stream have been verified.
  const frameOrigin = null;
  const settings = document.querySelector('[data-ga4-settings]');
  if (!settings || location.origin + location.pathname !== mapUrl || !frameOrigin) return;
  let frameUrl;
  try {
    frameUrl = new URL('/ga4-frame.html', frameOrigin);
  } catch {
    return;
  }
  if (frameUrl.protocol !== 'https:' || frameUrl.origin !== frameOrigin ||
      frameOrigin === location.origin) return;

  const choiceKey = 'birdmap_ga4_choice';
  const exclusionKey = 'birdmap_ga4_excluded';
  const clientKey = 'birdmap_ga4_client';
  const clientPattern = /^\d{1,10}\.\d{1,10}$/;
  const cookieScope = 'Path=/birdmap/; Secure; SameSite=Lax';
  const maxAge = 180 * 24 * 60 * 60;
  const allow = settings.querySelector('[data-ga4-allow]');
  const deny = settings.querySelector('[data-ga4-deny]');
  const exclude = settings.querySelector('[data-ga4-exclude]');
  const status = settings.querySelector('[data-ga4-status]');
  let frame;
  let started = false;
  let storageFailed = false;
  let channel;

  function getCookie(name) {
    try {
      const prefix = name + '=';
      return document.cookie.split(';').map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(prefix))?.slice(prefix.length) ?? '';
    } catch {
      return '';
    }
  }

  function setCookie(name, value) {
    try {
      document.cookie = `${name}=${value}; ${cookieScope}; Max-Age=${value ? maxAge : 0}`;
      return getCookie(name) === value;
    } catch {
      return false;
    }
  }

  function canMeasure() {
    return location.href === mapUrl && !storageFailed &&
      getCookie(choiceKey) === 'allowed' && getCookie(exclusionKey) !== 'yes';
  }

  function stop() {
    frame?.remove();
    frame = undefined;
  }

  function start() {
    if (started) return;
    let clientId = getCookie(clientKey);
    if (!clientPattern.test(clientId)) {
      clientId = Array.from(crypto.getRandomValues(new Uint32Array(2))).join('.');
      if (!setCookie(clientKey, clientId)) {
        storageFailed = true;
        return;
      }
    }

    const tagFrame = document.createElement('iframe');
    tagFrame.hidden = true;
    tagFrame.title = '탐조지도 방문 통계';
    tagFrame.referrerPolicy = 'no-referrer';
    tagFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    tagFrame.setAttribute('allow', "geolocation 'none'; camera 'none'; microphone 'none'");
    tagFrame.src = frameUrl.href;
    tagFrame.addEventListener('load', () => {
      if (frame !== tagFrame || !canMeasure()) return;
      tagFrame.contentWindow.postMessage({ type: 'birdmap-ga4-start', clientId }, frameOrigin);
    }, { once: true });
    started = true;
    frame = tagFrame;
    document.body.append(tagFrame);
  }

  function sync() {
    if (canMeasure()) start();
    else stop();

    const excluded = getCookie(exclusionKey) === 'yes';
    const choice = getCookie(choiceKey);
    exclude.checked = excluded;
    allow.disabled = excluded || (choice === 'allowed' && !storageFailed);
    deny.disabled = choice === 'denied' && !storageFailed;
    if (storageFailed) status.textContent = '이 브라우저에서 설정을 저장하지 못했습니다. 통계 전송을 중단했습니다.';
    else if (excluded) status.textContent = '이 브라우저는 테스트 접속으로 제외됩니다.';
    else if (choice === 'allowed' && location.href !== mapUrl) status.textContent = '동의 상태입니다. 이 주소의 방문은 집계에서 제외됩니다.';
    else if (choice === 'allowed') status.textContent = '방문 통계에 동의했습니다.';
    else if (choice === 'denied') status.textContent = '방문 통계를 보내지 않습니다.';
    else status.textContent = '선택 전에는 Google Analytics를 연결하지 않습니다.';
  }

  function update() {
    sync();
    channel?.postMessage('preferences-changed');
  }

  allow.addEventListener('click', () => {
    storageFailed = !setCookie(choiceKey, 'allowed');
    update();
  });
  deny.addEventListener('click', () => {
    stop();
    storageFailed = !setCookie(choiceKey, 'denied');
    if (storageFailed) setCookie(choiceKey, '');
    setCookie(clientKey, '');
    update();
  });
  exclude.addEventListener('change', () => {
    if (exclude.checked) {
      stop();
      storageFailed = !setCookie(exclusionKey, 'yes');
      setCookie(clientKey, '');
    } else {
      storageFailed = !setCookie(exclusionKey, '');
    }
    update();
  });

  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('birdmap-ga4-preferences');
      channel.addEventListener('message', sync);
    }
  } catch {
    // Refocusing the page still refreshes its preferences if broadcast is unavailable.
  }
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  document.addEventListener('visibilitychange', sync);
  settings.hidden = false;
  sync();
})();
