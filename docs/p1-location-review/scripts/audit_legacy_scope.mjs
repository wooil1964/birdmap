/* Read-only test inventory runner. Product source is never edited; output contains TAP and summary only.
   Usage: node audit_legacy_scope.mjs SOURCE_DIRECTORY RESULT_DIRECTORY SOURCE_SHA
   Set CHROME_PATH, PYTHONUTF8=1, PYTHONIOENCODING=utf-8 and prepend Python runtime directory to PATH for configured run. */
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
const [baseArg, outArg, sha] = process.argv.slice(2);
if (!baseArg || !outArg || !sha) throw new Error('SOURCE_DIRECTORY RESULT_DIRECTORY SOURCE_SHA required');
const base = path.resolve(baseArg), out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const files = fs.readdirSync(path.join(base, '.github/scripts')).filter(n => /^test_.*\.mjs$/.test(n)).sort().map(n => '.github/scripts/' + n);
const startedAt = new Date().toISOString();
const p = cp.spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
  cwd: base, env: process.env, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
const tap = (p.stdout || '') + (p.stderr || '');
fs.writeFileSync(path.join(out, 'full.tap'), tap);
const counts = {};
for (const n of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
  const m = tap.match(new RegExp('^# ' + n + ' (\\d+)$', 'm'));
  counts[n] = m ? Number(m[1]) : null;
}
const summary = {
  sourceSha: sha, sourceIndexSha256: hash(fs.readFileSync(path.join(base, 'index.html'))),
  startedAt, finishedAt: new Date().toISOString(), node: process.version, exitCode: p.status,
  signal: p.signal, error: p.error?.message ?? null,
  command: 'node --test --test-reporter=tap ' + files.join(' '),
  environment: { CHROME_PATH: process.env.CHROME_PATH ?? null, PYTHONUTF8: process.env.PYTHONUTF8 ?? null, PYTHONIOENCODING: process.env.PYTHONIOENCODING ?? null },
  testFiles: files.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(base, file))) })), counts,
  failures: [...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]),
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
process.exitCode = p.status ?? 1;
