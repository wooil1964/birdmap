// Cache only the page's reviewed CDN libraries and their CSS image/font assets.
// Browser tests consume this cache offline; no tile, report API, analytics or GPS request is made here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = resolve(process.argv[2] || process.env.POPUP_DEPENDENCY_CACHE || '.ci-results/gps-dependencies');
const hosts = new Set(['cdn.jsdelivr.net', 'code.jquery.com', 'cdnjs.cloudflare.com', 'netdna.bootstrapcdn.com']);
const entrypoints = [
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/leaflet.js',
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.2.2/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Leaflet.awesome-markers/2.0.2/leaflet.awesome-markers.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.2.2/dist/css/bootstrap.min.css',
  'https://netdna.bootstrapcdn.com/bootstrap/3.0.0/css/bootstrap-glyphicons.css',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.2.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Leaflet.awesome-markers/2.0.2/leaflet.awesome-markers.css',
  'https://cdn.jsdelivr.net/gh/python-visualization/folium/folium/templates/leaflet.awesome.rotate.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet.fullscreen@3.0.0/Control.FullScreen.min.js',
  'https://cdn.jsdelivr.net/npm/leaflet.fullscreen@3.0.0/Control.FullScreen.css',
];
// Leaflet resolves default marker icons in JavaScript, rather than CSS url().
const runtimeImages = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png']
  .map(name => 'https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/images/' + name);
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const declared = [...html.matchAll(/<(script|link)\b[^>]*>/gi)]
  .filter(([tag, kind]) => kind.toLowerCase() === 'script' || /\brel=["']stylesheet["']/i.test(tag))
  .flatMap(([tag]) => [...tag.matchAll(/\b(?:src|href)=["'](https:\/\/[^"']+)["']/gi)].map(([, url]) => url))
  .filter(url => hosts.has(new URL(url).hostname));
assert.deepEqual([...new Set(declared)].sort(), [...entrypoints].sort(), 'review changed CDN entrypoints before caching them');

function dependency(raw, base) {
  if (/^(data:|#)/i.test(raw)) return null;
  const url = new URL(raw, base);
  url.hash = '';
  assert.ok(url.protocol === 'https:' && hosts.has(url.hostname) && !url.username && !url.password && !url.port,
    'unapproved CSS dependency: ' + url.href);
  assert.match(url.pathname, /\.(?:css|png|gif|svg|woff2?|ttf|eot)$/i, 'unexpected CSS dependency type');
  return url.href;
}
function cssDependencies(css, base) {
  const urls = text => [...text.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)/gi)].map(([, raw]) => dependency(raw, base)).filter(Boolean);
  const fonts = [...css.matchAll(/@font-face\s*\{[^}]+\}/gi)].flatMap(([face]) => {
    // Installed Chrome uses woff2, or woff for the older Bootstrap glyph font.
    const candidates = urls(face);
    return candidates.filter(url => /\.woff2(?:\?|$)/i.test(url)).length
      ? candidates.filter(url => /\.woff2(?:\?|$)/i.test(url))
      : candidates.filter(url => /\.woff(?:\?|$)/i.test(url));
  });
  return [...fonts, ...urls(css.replace(/@font-face\s*\{[^}]+\}/gi, ''))];
}

mkdirSync(destination, { recursive: true });
const queue = [...entrypoints, ...runtimeImages], seen = new Set(), manifest = [];
for (const url of queue) {
  if (seen.has(url)) continue;
  seen.add(url);
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000) });
      assert.ok(response.ok, 'CDN dependency returned HTTP ' + response.status + ': ' + url);
      break;
    } catch (error) { if (attempt === 2) throw error; }
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 0 && bytes.length < 5_000_000, 'unexpected CDN dependency size: ' + url);
  assert.ok(!/text\/html/i.test(response.headers.get('content-type') || ''), 'HTML returned for CDN dependency: ' + url);
  const key = createHash('sha256').update(url).digest('hex');
  writeFileSync(resolve(destination, key), bytes);
  manifest.push({ url, file: key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  if (new URL(url).pathname.endsWith('.css')) queue.push(...cssDependencies(bytes.toString('utf8'), url));
}
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify({ scope: 'Reviewed CDN libraries and CSS assets only; no API, tile, analytics or GPS requests', dependencies: manifest }, null, 2));
console.log('Cached ' + manifest.length + ' CDN dependencies in ' + destination);
