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
  const probeKey = 'birdmap_ga4_probe';
  const clientPattern = /^\d{1,10}\.\d{1,10}$/;
  const grantPattern = /^allowed\.\d{1,10}\.\d{1,10}$/;
  const cookieScope = 'Path=/birdmap/; Secure; SameSite=Lax';
  const maxAge = 180 * 24 * 60 * 60;
  const allow = settings.querySelector('[data-ga4-allow]');
  const deny = settings.querySelector('[data-ga4-deny]');
  const exclude = settings.querySelector('[data-ga4-exclude]');
  const status = settings.querySelector('[data-ga4-status]');
  const revokedGrants = new Set();
  let frame;
  let frameGrant = '';
  let viewAuthorized = false;
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

  function setCookie(name, value, lifetime = maxAge) {
    try {
      document.cookie = name + '=' + value + '; ' + cookieScope + '; Max-Age=' + (value ? lifetime : 0);
      return getCookie(name) === value;
    } catch {
      return false;
    }
  }

  function getLocal(name) {
    try {
      return localStorage.getItem(name) ?? '';
    } catch {
      return '';
    }
  }

  function setLocal(name, value) {
    try {
      if (value) localStorage.setItem(name, value);
      else localStorage.removeItem(name);
      return getLocal(name) === value;
    } catch {
      return false;
    }
  }

  function savePreference(name, value) {
    // Attempt both writes independently, so one working store can still persist a denial.
    const cookieSaved = setCookie(name, value);
    const localSaved = setLocal(name, value);
    return cookieSaved && localSaved;
  }

  function randomPair() {
    return Array.from(crypto.getRandomValues(new Uint32Array(2))).join('.');
  }

  function storesWritable() {
    // A fresh value detects stores that return stale reads and silently ignore writes.
    const probe = randomPair();
    const name = probeKey + '_' + probe;
    const cookieWritable = setCookie(name, probe, 60);
    const localWritable = setLocal(name, probe);
    const cookieCleared = setCookie(name, '');
    const localCleared = setLocal(name, '');
    return cookieWritable && localWritable && cookieCleared && localCleared;
  }

  function choice() {
    const cookie = getCookie(choiceKey);
    const stored = getLocal(choiceKey);
    if (cookie === 'denied' || stored === 'denied' || revokedGrants.has(cookie)) return 'denied';
    if (cookie === stored && grantPattern.test(cookie)) return cookie;
    return '';
  }

  function isExcluded() {
    return getCookie(exclusionKey) === 'yes' || getLocal(exclusionKey) === 'yes';
  }

  function currentGrant() {
    if (location.href !== mapUrl || storageFailed || isExcluded()) return '';
    const grant = choice();
    return grantPattern.test(grant) ? grant : '';
  }

  function stop() {
    frame?.remove();
    frame = undefined;
    frameGrant = '';
  }

  function blockCurrentGrant() {
    const grants = [frameGrant, getCookie(choiceKey), getLocal(choiceKey)];
    stop();
    for (const grant of new Set(grants.filter(value => grantPattern.test(value)))) {
      revokedGrants.add(grant);
      channel?.postMessage({ revokedGrant: grant });
    }
  }

  function start(grant) {
    if (!storesWritable()) {
      storageFailed = true;
      return;
    }

    let clientId = getCookie(clientKey);
    if (!clientPattern.test(clientId)) {
      clientId = randomPair();
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
      if (frame !== tagFrame) return;
      if (currentGrant() !== grant) {
        sync();
        return;
      }
      tagFrame.contentWindow.postMessage({ type: 'birdmap-ga4-start', clientId }, frameOrigin);
    }, { once: true });
    frameGrant = grant;
    frame = tagFrame;
    document.body.append(tagFrame);
  }

  function sync() {
    const grant = currentGrant();
    if (frame && frameGrant !== grant) stop();
    if (grant && !frame && !viewAuthorized) start(grant);

    const excluded = isExcluded();
    const preference = choice();
    const allowed = grantPattern.test(preference);
    exclude.checked = excluded;
    allow.disabled = excluded || (allowed && !storageFailed);
    deny.disabled = preference === 'denied' && !storageFailed;
    if (storageFailed) status.textContent = '브라우저 저장소에서 설정을 확인하지 못해 이 탭의 통계 전송을 중단했습니다.';
    else if (excluded) status.textContent = '이 브라우저는 테스트 접속으로 제외됩니다.';
    else if (allowed && location.href !== mapUrl) status.textContent = '동의 상태입니다. 이 주소의 방문은 집계에서 제외됩니다.';
    else if (allowed) status.textContent = '방문 통계에 동의했습니다.';
    else if (preference === 'denied') status.textContent = '방문 통계를 보내지 않습니다.';
    else status.textContent = '선택 전에는 Google Analytics를 연결하지 않습니다.';
  }

  function update() {
    sync();
    channel?.postMessage('preferences-changed');
  }

  allow.addEventListener('click', () => {
    // The visible button can lag a grant or exclusion saved by another tab.
    if (isExcluded() || (!storageFailed && grantPattern.test(choice()))) {
      sync();
      return;
    }
    // Every explicit grant replaces any identifier left by a failed withdrawal.
    const clientSaved = setCookie(clientKey, randomPair());
    const grantSaved = clientSaved && savePreference(choiceKey, 'allowed.' + randomPair());
    storageFailed = !grantSaved;
    if (storageFailed) {
      blockCurrentGrant();
      savePreference(choiceKey, 'denied');
      setCookie(clientKey, '');
    }
    update();
  });
  deny.addEventListener('click', () => {
    blockCurrentGrant();
    const denied = savePreference(choiceKey, 'denied');
    const clientCleared = setCookie(clientKey, '');
    storageFailed = !denied || !clientCleared;
    update();
  });
  exclude.addEventListener('change', () => {
    const excluded = exclude.checked;
    if (excluded) stop();
    const saved = savePreference(exclusionKey, excluded ? 'yes' : '');
    const clientCleared = !excluded || setCookie(clientKey, '');
    storageFailed = !saved || !clientCleared;
    if (excluded && !saved) blockCurrentGrant();
    update();
  });

  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('birdmap-ga4-preferences');
      channel.addEventListener('message', event => {
        if (typeof event.data?.revokedGrant === 'string' && grantPattern.test(event.data.revokedGrant)) {
          revokedGrants.add(event.data.revokedGrant);
        }
        sync();
      });
    }
  } catch {
    // Storage events and refocusing still refresh persisted choices.
  }
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === choiceKey || event.key === exclusionKey) sync();
  });
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== frameOrigin ||
        event.data !== 'birdmap-ga4-ready' || viewAuthorized) return;
    if (currentGrant() === frameGrant && !storesWritable()) storageFailed = true;
    if (currentGrant() !== frameGrant) {
      sync();
      return;
    }
    // A canceled load can retry; an authorized view is never repeated in this document.
    viewAuthorized = true;
    frame.contentWindow.postMessage('birdmap-ga4-view', frameOrigin);
  });
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('focus', sync);
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  document.addEventListener('visibilitychange', sync);
  settings.hidden = false;
  sync();
})();
