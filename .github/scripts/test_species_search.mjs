import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Species names in the site history -> archive search. Runs the real history renderer and escapeHtml from index.html.
const source = readFileSync(new URL('../../assets/birdmap-species-search.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pick = name => { const m = new RegExp(`^function ${name}\\(.*?\\n\\}\\n`, 'ms').exec(html) || new RegExp(`^function ${name}\\(.*$`, 'm').exec(html); assert.ok(m, name); return m[0]; };
const RENDERER = pick('escapeHtml') + '\n' + pick('siteHistoryEntryHtml');

function environment({ archive = true, renderer = RENDERER } = {}) {
  const calls = [], listeners = [];
  const input = { value: 'old', readOnly: false };
  const close = { focused: false, focus() { this.focused = true; } };
  const document = {
    readyState: 'complete',
    getElementById: id => (id === 'reportArchiveSearch' ? input : null),
    querySelector: sel => (sel === '#reportArchiveModal .monthTideHeader button' ? close : null),
    addEventListener: (name, fn, capture) => listeners.push({ name, fn, capture })
  };
  const window = { document, reporterStatsHistoryHtml: entry => '<button class="reporterStatsLink">' + entry.reporter + '</button>' };
  window.window = window;
  vm.createContext(window);
  vm.runInContext(renderer.replace(/^function (\w+)/gm, 'window.$1=function $1'), window);
  if (archive) {
    window.openReportArchive = () => { calls.push(['open', input.readOnly]); input.value = ''; };
    window.searchReportArchive = delayed => calls.push(['search', input.value, delayed]);
  }
  vm.runInContext(source, window);
  const click = target => {
    const event = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const l of listeners) if (l.name === 'click') l.fn(event);
    return event;
  };
  const button = species => ({ closest: sel => (sel === '.speciesSearchLink' ? { getAttribute: name => (name === 'data-species' ? species : null) } : null) });
  return { window, input, close, calls, listeners, click, button };
}

const entry = { id: 'r1', date: '2026-10-25', species: ['흰뺨검둥오리', '물  닭 ', '<b>&"x'], reporter: '설남아빠' };

test('species names in the history become archive-search buttons; the date and reporter lines stay as they were', () => {
  const e = environment(), out = e.window.siteHistoryEntryHtml(entry);
  assert.match(out, /<div class="siteHistoryDate">2026\.10\.25<\/div>/);
  assert.match(out, /<div class="siteHistoryBy">제보자: <button class="reporterStatsLink">설남아빠<\/button><\/div>/);
  assert.match(out, /<button type="button" class="speciesSearchLink" data-species="흰뺨검둥오리" aria-label="흰뺨검둥오리 공개 출현 기록 검색">흰뺨검둥오리<\/button> · /);
  assert.match(out, /data-species="물 닭"[^>]*>물  닭 <\/button>/, 'search term: spaces collapsed and trimmed, shown name untouched');
  assert.match(out, /data-species="&lt;b&gt;&amp;&quot;x"[^>]*>&lt;b&gt;&amp;&quot;x<\/button>/, 'escaped everywhere');
  assert.ok(!/<b>/.test(out));
  assert.equal(e.window.siteHistoryEntryHtml({ ...entry, species: [] }), e.window.siteHistoryEntryHtml.call(null, { ...entry, species: [] }));
  assert.ok(!/speciesSearchLink/.test(e.window.siteHistoryEntryHtml({ ...entry, species: [] })), 'no species, no button');
});

test('a renderer of another shape keeps plain names; no archive means no wrapping', () => {
  const other = environment({ renderer: 'function escapeHtml(s){return String(s);}\nfunction siteHistoryEntryHtml(entry){return "<p>"+entry.species.join(", ")+"</p>";}' });
  assert.equal(other.window.siteHistoryEntryHtml(entry), '<p>' + entry.species.join(', ') + '</p>');
  const none = environment({ archive: false });
  assert.ok(!/speciesSearchLink/.test(none.window.siteHistoryEntryHtml(entry)));
});

test('clicking a species opens the archive searched for it, without raising the phone keyboard', () => {
  const e = environment();
  assert.ok(e.listeners.some(l => l.name === 'click' && l.capture === true), 'capture phase: Leaflet popups stop bubbling');
  const ev = e.click(e.button('흰뺨검둥오리'));
  assert.deepEqual(e.calls, [['open', true], ['search', '흰뺨검둥오리', false]]);
  assert.deepEqual([ev.prevented, ev.stopped, e.input.readOnly, e.close.focused], [true, true, false, true]);
  const c = environment(); c.click(c.button('  물\u0000닭\t' + 'x'.repeat(200)));
  assert.equal(c.calls[1][1], ('물닭 ' + 'x'.repeat(200)).slice(0, 100), 'control characters removed, 100 characters at most');
  const n = environment(); const other = n.click({ closest: () => null });
  assert.deepEqual([n.calls.length, other.stopped], [0, false], 'other clicks untouched');
  const empty = environment(); empty.click(empty.button('   '));
  assert.equal(empty.calls.length, 0, 'an empty name searches nothing');
});
