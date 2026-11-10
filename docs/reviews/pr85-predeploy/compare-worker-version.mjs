// Read-only (HTTP GET only). Compares a candidate Worker version with the version currently at 100%.
// Usage: node compare-worker-version.mjs <worker> <candidateVersionId> [EXPECTED_KEY=value ...]
// Exit 0 only when vars/bindings/secret names/compat match, except the listed expected var changes.
// Secret values are never requested or printed; plain_text values are printed only for REPORTS_* / ENVIRONMENT / FIELD_*.
const repo = new URL('../../../', import.meta.url);
const { apiGet } = await import(new URL('reports-api/tools/d1-rest.mjs', repo));
const T = { account_id: '1d697c22a32447b386b9fac6a3538597' };
const [worker, candidate, ...expectedArgs] = process.argv.slice(2);
if (!worker || !candidate) { console.error('usage: <worker> <candidateVersionId> [KEY=value ...]'); process.exit(2); }
const expected = Object.fromEntries(expectedArgs.map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const deps = await apiGet(T, `/workers/scripts/${worker}/deployments`);
const live = deps.deployments[0].versions;
if (live.length !== 1 || live[0].percentage !== 100) { console.error('LIVE_NOT_SINGLE_100', JSON.stringify(live)); process.exit(1); }
const get = id => apiGet(T, `/workers/scripts/${worker}/versions/${id}`);
const [cur, cand] = await Promise.all([get(live[0].version_id), get(candidate)]);
const shape = v => {
  const b = v.resources?.bindings || [];
  return { vars: Object.fromEntries(b.filter(x => x.type === 'plain_text').map(x => [x.name, x.text])),
    other: b.filter(x => x.type !== 'plain_text' && !/secret/.test(x.type)).map(x => `${x.type}:${x.name}:${x.id || x.service || ''}`).sort(),
    secrets: b.filter(x => /secret/.test(x.type)).map(x => x.name).sort(),
    compat: `${v.resources?.script_runtime?.compatibility_date}|${(v.resources?.script_runtime?.compatibility_flags || []).join(',')}` };
};
const a = shape(cur), c = shape(cand), show = k => /^(REPORTS_|ENVIRONMENT|FIELD_)/.test(k);
let ok = true; const rows = [];
for (const k of [...new Set([...Object.keys(a.vars), ...Object.keys(c.vars), ...Object.keys(expected)])].sort()) {
  const want = k in expected ? expected[k] : a.vars[k];
  const pass = c.vars[k] === want; ok &&= pass;
  rows.push(`${pass ? 'OK  ' : 'DIFF'} ${k}: live=${show(k) ? a.vars[k] ?? '(none)' : (k in a.vars ? '(set)' : '(none)')} candidate=${show(k) ? c.vars[k] ?? '(none)' : (k in c.vars ? (c.vars[k] === a.vars[k] ? '(same)' : '(changed)') : '(none)')}`);
}
for (const [name, x, y] of [['bindings', a.other, c.other], ['secretNames', a.secrets, c.secrets], ['compat', [a.compat], [c.compat]]]) {
  const pass = JSON.stringify(x) === JSON.stringify(y); ok &&= pass; rows.push(`${pass ? 'OK  ' : 'DIFF'} ${name}: live=${x.join(' ')} candidate=${y.join(' ')}`);
}
// Script-level exposure (not part of a version): preview URLs must stay off so old versions are unreachable.
const sub = await apiGet(T, `/workers/scripts/${worker}/subdomain`);
const subPass = sub.enabled === true && sub.previews_enabled === false; ok &&= subPass;
rows.push(`${subPass ? 'OK  ' : 'DIFF'} script: workers_dev=${sub.enabled} previews=${sub.previews_enabled} (expected true/false)`);
console.log(`live=${live[0].version_id} candidate=${candidate}\n` + rows.join('\n') + `\nRESULT ${ok ? 'MATCH' : 'MISMATCH'}`);
process.exit(ok ? 0 : 1);
