import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const mapUrl = 'https://wooil1964.github.io/birdmap/';
const measurementId = 'G-S2G00KJMPW';
const tagUrl = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
const collectUrl = 'https://www.google-analytics.com/g/collect';
const sensitive = 'synthetic-gps-37.123456-reporter-owl-search';
const sourceReferrer = mapUrl + '?reporter=' + sensitive;
const consentAsset = 'assets/birdmap-ga4-consent.js';
const frameOrigin = 'https://metrics-fixture.invalid';
const frameUrl = frameOrigin + '/ga4-frame.html';
const frameAsset = 'analytics/ga4-frame.html';
const localAssets = new Map([
  [consentAsset, 'application/javascript'],
  ['assets/birdmap-ga4-consent.css', 'text/css'],
  [frameAsset, 'text/html; charset=utf-8'],
  ['analytics/ga4-frame.js', 'application/javascript'],
]);
const frameSelector = 'iframe[src$="/ga4-frame.html"]';
const html = read('index.html');

// Keep the real integration markup and styling, without starting unrelated map, API or CDN code.
// The existing gps-browser job exercises the full Leaflet application with synthetic data.
const fixtureHtml = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, script => (
    /<script\b[^>]*\bsrc=["']\.\/assets\/birdmap-ga4-consent\.js["']/i.test(script) ? script : ''
  ))
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + sensitive + '</title>');

function mockTag() {
  let isolated = false;
  try {
    void window.parent.document.title;
  } catch (error) {
    isolated = error.name === 'SecurityError';
  }

  const queue = window.dataLayer;
  const originalPush = queue.push.bind(queue);
  queue.push = (...entries) => {
    const size = originalPush(...entries);
    for (const [command, name, fields] of entries) {
      if (command !== 'event' || name !== 'page_view') continue;
      // A loose CSP would allow this request. The fixture fulfills it only if Chrome
      // actually issues it, so the rejection verifies the browser's CSP enforcement.
      fetch('https://telemetry-fixture.invalid/probe', { mode: 'no-cors' })
        .then(() => true, () => false)
        .then(probeAllowed => {
          const payload = {
            commands: queue.map(entry => Array.from(entry)),
            isolated,
            origin: self.origin,
            frameUrl: location.href,
            referrer: document.referrer,
            probeAllowed,
          };
          const url = new URL('https://www.google-analytics.com/g/collect');
          url.searchParams.set('fixture', JSON.stringify(payload));
          return fetch(url, { mode: 'no-cors', referrerPolicy: 'no-referrer' });
        })
        .then(() => fields.event_callback(), () => {});
    }
    return size;
  };
}

let browser;
before(async () => {
  assert.ok(process.env.CHROME_PATH, 'CHROME_PATH must point to installed Chrome');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND'],
  });
});
after(async () => { await browser?.close(); });

async function fixture(t, {
  mobile = false, width = 375, holdTag = false, blockTag = false, tagFixture, configuredOrigin = frameOrigin,
} = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width, height: 812 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
  });
  const google = [];
  let releaseTag;
  const gate = holdTag ? new Promise(resolve => { releaseTag = resolve; }) : null;
  t.after(async () => {
    releaseTag?.();
    await context.close();
  });

  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/g/collect' ||
        /(?:^|\.)(?:googletagmanager\.com|google-analytics\.com|doubleclick\.com|googlesyndication\.com|google\.[\w.]+)$/.test(url.hostname)) {
      google.push({ url: request.url(), headers: await request.allHeaders(), body: request.postData() });
      if (request.url() === tagUrl && !blockTag) {
        if (gate) await gate;
        await route.fulfill({
          contentType: 'application/javascript',
          body: tagFixture ?? '(' + mockTag.toString() + ')();',
        }).catch(error => {
          // Revocation can detach the frame and cancel this intentionally held request.
          if (!gate) throw error;
        });
        return;
      }
      if (url.pathname === '/g/collect') {
        await route.fulfill({ status: 204 });
        return;
      }
      await route.abort('blockedbyclient');
      return;
    }
    if (url.origin === 'https://telemetry-fixture.invalid') {
      await route.fulfill({ status: 204 });
      return;
    }
    for (const [asset, contentType] of localAssets) {
      const frameFile = asset === frameAsset || asset.endsWith('/ga4-frame.js');
      const matches = frameFile
        ? url.origin === frameOrigin && url.pathname === '/' + asset.split('/').at(-1)
        : url.pathname.endsWith('/' + asset);
      if (!matches) continue;
      let body = read(asset);
      if (asset === consentAsset && configuredOrigin !== null) {
        assert.match(body, /const frameOrigin = null;/);
        body = body.replace('const frameOrigin = null;', 'const frameOrigin = ' + JSON.stringify(configuredOrigin) + ';');
      }
      await route.fulfill({ contentType, body });
      return;
    }
    if (request.resourceType() === 'document' && request.isNavigationRequest()) {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtureHtml });
      return;
    }
    // No requests reach Google, GitHub Pages, Cloudflare, Workers or any other live server.
    await route.abort('blockedbyclient');
  });
  return { context, google, releaseTag, page: await context.newPage() };
}

async function choose(page, name) {
  const summary = page.getByText('통계·쿠키 설정', { exact: true });
  const isOpen = await summary.evaluate(element => element.parentElement.open);
  if (!isOpen) await summary.click();
  await page.locator('[data-ga4-' + name + ']').click();
}

async function noFrame(page) {
  await page.locator(frameSelector).waitFor({ state: 'detached' });
}

async function waitForRequest(google, match) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const item = google.find(match);
    if (item) return item;
    await delay(20);
  }
  assert.fail('Expected network request absent. Captured paths: ' +
    google.map(item => new URL(item.url).pathname).join(', '));
}

function collectRequests(google) {
  return google.filter(item => item.url.startsWith(collectUrl + '?'));
}

async function firstView(google) {
  return await waitForRequest(google, item => item.url.startsWith(collectUrl + '?'));
}

test('real markup loads only local analytics code and preserves the Cloudflare beacon', () => {
  assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.doesNotMatch(html, /googletagmanager\.com|google-analytics\.com/);
  assert.match(fixtureHtml, /src=["']\.\/assets\/birdmap-ga4-consent\.js["']/);
});

async function verifyMobileOverlay(page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--birdmap-recent-offset', '52px');
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;inset:auto 0 0;height:52px;z-index:9990;background:white';
    document.body.append(sheet);
  });

  const summary = page.getByText('통계·쿠키 설정', { exact: true });
  const fitsAboveSheet = await summary.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.bottom <= innerHeight - 52 &&
      element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  });
  assert.equal(fitsAboveSheet, true);
  await summary.click();
  const panel = await page.locator('.birdmap-ga4-panel').boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= 344);
}

for (const mobile of [false, true]) {
  test((mobile ? 'phone' : 'desktop') + ': explicit opt-in starts one isolated, fixed page view', { timeout: 25_000 }, async t => {
    const { context, google, page } = await fixture(t, { mobile, width: 344 });
    await page.goto(mapUrl, { referer: sourceReferrer });
    assert.equal(await page.title(), sensitive);
    assert.match(await page.evaluate(() => document.referrer), /synthetic-gps/);
    assert.equal(await page.locator(frameSelector).count(), 0);
    assert.deepEqual(google, []);
    assert.deepEqual(await context.cookies(), []);
    if (mobile) await verifyMobileOverlay(page);

    await choose(page, 'allow');
    const collect = await firstView(google);
    const tag = google.find(item => item.url === tagUrl);
    assert.ok(tag);
    assert.equal(tag.headers.referer, undefined);
    assert.equal(collect.headers.referer, undefined);
    const payload = JSON.parse(new URL(collect.url).searchParams.get('fixture'));
    assert.equal(payload.isolated, true);
    assert.equal(payload.probeAllowed, false);
    assert.equal(payload.origin, frameOrigin);
    assert.equal(payload.frameUrl, frameUrl);
    assert.equal(payload.referrer, '');
    assert.equal(await page.locator(frameSelector).getAttribute('sandbox'), 'allow-scripts allow-same-origin');
    assert.equal(await page.locator(frameSelector).getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');

    const { commands } = payload;
    const config = commands.filter(command => command[0] === 'config');
    const events = commands.filter(command => command[0] === 'event');
    assert.equal(config.length, 1);
    assert.equal(config[0][1], measurementId);
    assert.equal(config[0][2].send_page_view, false);
    assert.equal(config[0][2].allow_google_signals, false);
    assert.equal(config[0][2].allow_ad_personalization_signals, false);
    assert.equal(config[0][2].page_location, mapUrl);
    assert.equal(config[0][2].page_referrer, mapUrl);
    assert.match(config[0][2].client_id, /^\d{1,10}\.\d{1,10}$/);
    const consent = commands.filter(command => command[0] === 'consent');
    assert.deepEqual(consent, [['consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    }]]);
    assert.deepEqual(events.map(command => command[1]), ['page_view']);
    assert.equal(events[0][2].page_location, mapUrl);
    assert.equal(events[0][2].page_title, '전국 탐조지도');
    assert.equal(events[0][2].page_referrer, mapUrl);
    assert.equal(events[0][2].send_to, measurementId);
    const frame = page.frames().find(candidate => candidate.url() === frameUrl);
    assert.ok(frame);
    await frame.waitForFunction(id => window['ga-disable-' + id] === true, measurementId);
    assert.doesNotMatch(JSON.stringify(payload), new RegExp(sensitive));
    assert.doesNotMatch(JSON.stringify(commands), /user_id|user_properties|search_term/);
    const cookies = await context.cookies();
    assert.ok(cookies.length > 0);
    assert.ok(cookies.every(cookie => cookie.path === '/birdmap/'));
    assert.deepEqual(await context.cookies('https://wooil1964.github.io/'), []);

    // A share-link rewrite and changes to the map DOM must not start another view.
    await page.evaluate(value => {
      document.body.dataset.syntheticLocation = value;
      history.replaceState(null, '', '?lat=' + value + '#' + value);
    }, sensitive);
    assert.equal(collectRequests(google).length, 1);
  });
}

test('unconfigured, insecure and same-origin destinations fail closed', { timeout: 25_000 }, async t => {
  for (const configuredOrigin of [null, 'http://metrics-fixture.invalid', 'https://wooil1964.github.io']) {
    const { context, google, page } = await fixture(t, { configuredOrigin });
    await context.addCookies([{
      name: 'birdmap_ga4_choice',
      value: 'allowed',
      domain: 'wooil1964.github.io',
      path: '/birdmap/',
      secure: true,
      sameSite: 'Lax',
    }]);
    await page.goto(mapUrl);
    assert.equal(await page.locator('[data-ga4-settings]').isHidden(), true);
    assert.equal(await page.locator(frameSelector).count(), 0);
    assert.deepEqual(google, []);
    assert.ok(!(await context.cookies()).some(cookie => cookie.name === 'birdmap_ga4_client'));
  }
});

test('existing consent cannot make an out-of-scope or sensitive URL send requests', { timeout: 30_000 }, async t => {
  const { google, page } = await fixture(t);
  await page.goto(mapUrl);
  await choose(page, 'allow');
  await firstView(google);
  for (const url of [
    'https://wooil1964.github.io/',
    'https://wooil1964.github.io:444/birdmap/',
    'https://wooil1964.github.io/birdmap',
    mapUrl + 'index.html',
    mapUrl + 'share/example/',
    mapUrl + 'sites/example/',
    mapUrl + '?site=' + sensitive,
    mapUrl + '#' + sensitive,
    'http://localhost:49271/birdmap/',
    'https://preview.example/birdmap/',
  ]) {
    await page.goto('about:blank');
    await page.goto(url);
    await noFrame(page);
    assert.equal(google.length, 2, url);
  }
});

test('denial and withdrawal persist; an already open tab stops immediately', { timeout: 30_000 }, async t => {
  const { context, google, page } = await fixture(t);
  await page.goto(mapUrl);
  await choose(page, 'deny');
  await page.reload();
  await noFrame(page);
  assert.deepEqual(google, []);

  await choose(page, 'allow');
  const view = await firstView(google);
  const clientId = JSON.parse(new URL(view.url).searchParams.get('fixture')).commands
    .find(command => command[0] === 'config')[2].client_id;
  assert.ok(typeof clientId === 'string' && clientId.length > 0);

  const otherTab = await context.newPage();
  await otherTab.goto(mapUrl);
  const otherView = await waitForRequest(google, item => item !== view && item.url.startsWith(collectUrl + '?'));
  const otherClientId = JSON.parse(new URL(otherView.url).searchParams.get('fixture')).commands
    .find(command => command[0] === 'config')[2].client_id;
  assert.equal(otherClientId, clientId, 'prior consent and client identifier survive a new tab');

  await choose(page, 'deny');
  await noFrame(page);
  await noFrame(otherTab);
  assert.ok((await context.cookies()).every(cookie => !cookie.value.includes(clientId)));
  await page.reload();
  await otherTab.reload();
  await noFrame(page);
  await noFrame(otherTab);
  assert.equal(collectRequests(google).length, 2);
  assert.equal(google.length, 4);
});

test('administrator browser exclusion blocks tag before and after reload', { timeout: 25_000 }, async t => {
  const { google, page } = await fixture(t);
  await page.goto(mapUrl);
  await choose(page, 'exclude');
  const allow = page.locator('[data-ga4-allow]');
  assert.equal(await allow.isEnabled(), false);
  await page.reload();
  await noFrame(page);
  assert.deepEqual(google, []);

  await choose(page, 'exclude');
  await choose(page, 'allow');
  await firstView(google);
  await choose(page, 'exclude');
  await noFrame(page);
  await page.reload();
  await noFrame(page);
  assert.equal(google.length, 2);
});

test('withdrawal during tag loading cancels the pending view', { timeout: 25_000 }, async t => {
  const { google, page, releaseTag } = await fixture(t, { holdTag: true });
  await page.goto(mapUrl);
  await choose(page, 'allow');
  await waitForRequest(google, item => item.url === tagUrl);
  await choose(page, 'deny');
  await noFrame(page);
  releaseTag();
  await page.reload();
  await noFrame(page);
  assert.equal(google.length, 1);
  assert.equal(collectRequests(google).length, 0);
});

test('a blocked Google tag leaves the consent controls available', { timeout: 25_000 }, async t => {
  const { google, page } = await fixture(t, { blockTag: true, mobile: true });
  await page.goto(mapUrl);
  await choose(page, 'allow');
  await waitForRequest(google, item => item.url === tagUrl);
  await choose(page, 'deny');
  await noFrame(page);
  assert.equal(collectRequests(google).length, 0);
});

// Optional vendor compatibility check. This runs a previously downloaded public tag file.
// The same local routes still intercept every collector request and perform no live downloads.
if (process.env.GA4_TAG_FIXTURE) {
  test('actual Google tag emits exactly one fixed page view', { timeout: 25_000 }, async t => {
    const tagFixture = readFileSync(process.env.GA4_TAG_FIXTURE);
    const { context, google, page } = await fixture(t, { tagFixture });
    await page.goto(mapUrl, { referer: sourceReferrer });
    assert.deepEqual(google, []);
    await choose(page, 'allow');
    // Observe past the five-second shutdown timeout to include any deferred hits.
    await delay(5500);

    const events = google.filter(item => new URL(item.url).pathname === '/g/collect')
      .flatMap(item => (item.body || '').split('\n').map(line => {
        const parameters = new URL(item.url).searchParams;
        for (const [key, value] of new URLSearchParams(line)) parameters.set(key, value);
        assert.equal(item.headers.referer, undefined);
        assert.doesNotMatch(item.url + line, new RegExp(sensitive));
        return Object.fromEntries(parameters);
      }));
    assert.deepEqual(events.map(event => event.en), ['page_view']);
    assert.equal(events[0].dl, mapUrl);
    assert.equal(events[0].dr, mapUrl);
    assert.equal(events[0].dt, '전국 탐조지도');
    assert.equal(events[0].tid, measurementId);
    const client = (await context.cookies(mapUrl)).find(cookie => cookie.name === 'birdmap_ga4_client');
    assert.ok(client);
    assert.equal(events[0].cid, client.value);
    assert.deepEqual(await context.cookies(frameUrl), []);
    await choose(page, 'deny');
    await noFrame(page);
  });
}
