# Independent server audit checkpoint

Input: `71177330fd1d45c64f3bef632cf1f43286c304cd`, PR17. Audit workspace only; no production request, Git commit/push, deployment, D1 or user mutation.

Actual commands on 2026-10-12:

- `node docs/p1-publication-security-implementation/scripts/run_suites.mjs . docs/p1-publication-final-audit/server/results reports`: exit0, 221 pass / 0 fail / 0 skip. Actual source/API/SQLite suites rerun, not copied implementation counts.
- `node docs/p1-publication-security-implementation/results/server-audit/local-d1-publication.mjs C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules`: exit0, 18 pass / 0 fail / 0 skip. Ephemeral Miniflare5.20261006.1-alpha, actual local workerd D1 synthetic rows. The API handler executes in Node with actual D1 binding; the dummy Worker shell itself is not the full deployed API module. `workerd-rerun.json` records fresh result and runtime.
- `node --test --test-reporter=tap docs/p1-publication-final-audit/server/independent-contract.test.mjs`: exit1, 3 pass / 5 fail. `independent-contract-before.tap` preserved.
- `node --test --test-reporter=tap docs/p1-publication-final-audit/server/head-freshness.test.mjs`: exit1, 0 pass / 2 fail. `head-freshness-expanded-before.tap` preserved.

## Required fixes before deployment

**B1 — All writer drain incomplete.** Actual public field create/status/confirm/delete ignore `REPORTS_WRITE_MODE=READ_ONLY_MAINTENANCE` and return201/201/201/200 while committing changes. Unknown mode also permits create201. Reports submit/admin actions use `assertWriteGate`, field routes do not. Existing `system_state` DB freeze triggers protect only reports insert/update; neither field parent/child writes nor privileged physical deletes are covered by that gate. A Worker-only switch must not be called proof of an atomic all-writer drain, particularly for already-running requests or older versions. Root notified to add minimal field request/batch guard and controlled DB barrier or equivalent ingress drain before migration. These are rollout blockers, not proof of an operating incident.

**B2 — Pre-action in-flight head reused as fresh authority.** `publicationHead()` single-flight is also used by `publicationRouteCheck` (including GPS) and publicationFetch postflight. Actual functions reproduce:

1. Poll primary readsrev100, response waits; other device hiderev101; subsequent route/GPS decision shares pending100;100 arrives; callback executes. Output `{allowed:true, primaryReads:1, routes:1}`.
2. Projectionrev100 and separate pollrev100 responses wait; other device hiderev101; old projection arrives; postflight shares old poll100; payload applied with exact synthetic point. No primary101 query occurs.

Fresh route/GPS/postflight must initiate a primary read after that operation, not reuse an earlier read. Root notified. First `head-freshness-before.tap` has a harness extraction `window` error, explicitly not a product security reproduction; corrected real product result is `head-freshness-before-product.tap` and expanded2 fail result above.

## Confirmed unaffected contracts

- Fresh head and payload each invoke separate `withSession('first-primary')`; payload state and data use one batch transaction.
- Hidden actual coordinates, private name without consent, private hash absent from all six guarded public projections and409 errors in independent synthetic input.
- Each missing required trigger (all13) independently produces503/no-store; no coordinate payload.
- Decimal string revision and atomic source/counter CAS/rollback/terminal were rerun across221 and actualworkerd18.
- Shadow logs contain endpoint/category only, not row/body/coordinates. Errors expose known codes/messages or generic internal error. Turnstile log records provider code/hostname; notification failure log has ID/reason, not body/key. Existing administrator-authenticated exact coordinates and configured admin email content are distinct authorized channels, not public response fields.
- S1-R normalization detects protected quantity/delimiters; it does not add S1-P blanket concealment of already-approved sensitive records. Existing indirect site-history/fixed-point ecology policy remains separate.
- Trigger-name readiness does not authenticate arbitrary privileged DDL definitions. Production preflight must compare actual definitions/core fingerprint; no malicious-admin guarantee claimed.
- Application field creates assign new server UUID, never REPLACE or reuse deletedID. Direct privileged DELETE/reinsert is outside supported normal writer API and must remain forbidden in rollback/ops. No new tombstone-policy expansion implemented.

## Primary evidence

Cloudflare [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) documents batch transaction rollback, first-primary fresh primary and session sequential consistency. [Read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) states non-session queries use primary. This supports source contract; no operating replica/current deployment is inferred from it.

Further product changes are owned by root only. Re-run same independent assertions after root fix; keep before failure artifacts and correct sourceSHA/source blob manifest. No pass until both blocker reproductions become safe.
