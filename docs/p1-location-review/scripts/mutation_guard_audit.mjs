/* Independently remove one protection mechanism in memory, then run the unchanged product-source test suite.
   Usage: node mutation_guard_audit.mjs SOURCE_DIRECTORY OUTPUT_DIRECTORY SOURCE_SHA
   No product files are edited. All coordinates in the test are synthetic. */
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
const [baseArg, outArg, sha] = process.argv.slice(2);
if (!baseArg || !outArg || !sha) throw new Error('SOURCE_DIRECTORY OUTPUT_DIRECTORY SOURCE_SHA required');
const base = path.resolve(baseArg), out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const suite = fs.readFileSync(path.join(base, '.github/scripts/test_location_protection.mjs'), 'utf8');
const mutations = [
  ['M1_DELETE_TOMBSTONE', 'if(fieldTombstones[update.id])return null;', ''],
  ['M2_FIELD_RESPONSE_SEQUENCE', 'if(seq<fieldAppliedSeq||seq<=fieldBarrierSeq)return false;', 'if(seq<=fieldBarrierSeq)return false;'],
  ['M3_STICKY_PROTECTED', 'if(!fieldProtectedIds[update.id])return update;', 'if(true)return update;'],
  ['M4_GUIDE_TARGET', 'return update&&fieldIsActive(update)&&fieldPublicPoint(update)?update:null;', 'return update||null;'],
  ['M5_CAPTURED_GPS', 'var current=fieldGuideTarget(id);', 'var current=update;'],
  ['M6_REPORT_RESPONSE_SEQUENCE', 'if(seq<reportAppliedSeq[kind])return false;', ''],
  ['M7_HISTORY_GENERATION', 'if(gen!==siteHistoryGen){', 'if(false){'],
];
const results = [];
for (const [id, before, after] of mutations) {
  const occurrences = html.split(before).length - 1;
  if (!occurrences) throw new Error('No mutation target for ' + id);
  const mutated = html.split(before).join(after);
  const code = suite.replace(/^const HTML = .*;$/m, () => 'const HTML = ' + JSON.stringify(mutated) + ';');
  const p = cp.spawnSync(process.execPath, ['--test-reporter=tap', '--input-type=module'], {
    input: code, cwd: base, env: process.env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  const tap = (p.stdout || '') + (p.stderr || '');
  fs.writeFileSync(path.join(out, id + '.tap'), tap);
  const counts = {};
  for (const n of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const m = tap.match(new RegExp('^# ' + n + ' (' + String.fromCharCode(92) + 'd+)$', 'm'));
    counts[n] = m ? Number(m[1]) : null;
  }
  const row = { id, occurrences, exit: p.status, counts, killed: p.status !== 0 && counts.fail > 0,
    failures: [...tap.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]) };
  results.push(row);
  console.log(JSON.stringify(row));
}
const summary = { sourceSha: sha, sourceIndexSha256: crypto.createHash('sha256').update(html).digest('hex'),
  node: process.version, scope: 'Independent in-memory mutations, not a reconstruction of unavailable implementer mutation manifest', results };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
if (results.some(r => !r.killed)) process.exitCode = 1;
