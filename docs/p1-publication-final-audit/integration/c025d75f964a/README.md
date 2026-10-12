# B6 independent exact-source regression

Input: `c025d75f964ab36f6f2eae541a99461f6de59b70`; pre-fix: `7f493b1c60bc6002465a44d4ced39ac129afbba7`; original main archive reference58e1a22; latest main compatibility referenceb41b03cc. Independent reviewer made no product edits, no operating API requests/writes, no deployment or branch merge.

## Reviewed change

Only `reports-api/src/field-updates.js` and6 tests in publication-security.test.mjs change from7f. The saved field projection reuses S1-R protection parsing. A protected quantity expression stored by an old writer with hidden0/exact public coordinate now has `locationHidden:true` and null public lat/lon. A hidden row retains a point only when the same SQL SELECT computes numeric `public_point_masked=1`, proving both public coordinates exist and at least one differs from the private point. Unknown/missing masking proof does not authorize an exact point.

`COLUMNS` is used in strict snapshot field reads, legacy list and create/status/confirm rereads. Private lat/lon are referenced only inside the SQL comparison, not projected as private columns. PublicEntry outputs no masking-proof or user_hash field. It keeps receipt/reference/history metadata, makes no DB write, and does not randomize a new coordinate per read. Normal exact rows and verified previously masked points remain stable. CAS, terminal deletion, revision, public authority/read contract, recommendation and weather code are unchanged.

This is stored field S1-R repair, not a new approved-report S1-P policy; do not claim it implements blanket approved-report nondisclosure.

## Full independent run

```powershell
node docs/p1-publication-final-audit/integration/run_integrated.mjs c025d75f964ab36f6f2eae541a99461f6de59b70 58e1a222845680d5217677242ac1df5ff9bf665b
node docs/p1-publication-final-audit/integration/b6_before_after.mjs
node docs/p1-publication-final-audit/integration/b6_generation_validator.mjs
node docs/p1-publication-final-audit/integration/function_noninterference.mjs c025d75f964ab36f6f2eae541a99461f6de59b70 58e1a222845680d5217677242ac1df5ff9bf665b
node docs/p1-publication-final-audit/integration/b6_merge_latest_main.mjs
```

Source is git-archived pinnedc025. Every suite's exact command/cwd/clock/exit and raw log is preserved.

| Suite | Pass | Fail | Skip | Exit |
|---|---:|---:|---:|---:|
| Front15 files |359|0|0|0|
| reports-api |227|0|0|0|
| weather-proxy |36|0|0|0|
| Python weather |56|0|0|0|
| Python tide |21|0|1|0|
| share pages |11|0|0|0|
| Automatic aggregate |710|0|1|All6 suites0|

Official tide samples outside rolling monthly overlap remain1 skip, not success.

Separate contracts: S2182/182, special21/21, popup12/12. S1-R171 protected representations, ordinary17 with0 false positives; existing admin/field/breeding/owner-delete assertions all pass. PR13's75 recommendation/P0/S2 functions and4 static main navigation functions remain exact source equivalents.

At original fixed10/8 22:40KST,190 sites/176 candidates/unsafe0 with reportON andOFF. Full candidate signatures and complete top10 rows remain equal to PR13, including dates/times/raw/visible/rank/bonus and null-score synthetic results:

- ON `47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb`
- OFF `ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758`

siteData190/unique190 and all coordinates unchanged. Previous Free-capacity/fixed-input evidence is not overwritten; this new B6 source result is separately recorded.

## Actual nonzero exits kept

The run_integrated **overall command exits1** because its separate current-date today validator executes an archived10/12 batch on the real10/13KST clock and rejects `Batch date mismatch`. That failure remains in summary.json and its raw log. It is not counted as an automatic test failure or current operational success. Current-clock weekly validator exits0.

Original-generation-clock validator separately exits0 on the exact same today JSON, with module clock only fixed to10/12 16:26KST. Before/after JSON SHA256 identical; no date/score metadata or product validator assertion is changed. That confirms original-day validity, not a current10/13 today score.

## New6 tests fail on real pre-fix product

`b6_before_after.mjs` archives old7f and newc025 separately and copies **only the new test file** into the old archive. Old field product bytes match pinned Git exactly; both runs use exactly the same test file SHA256 and `--test-name-pattern=^B6`. No old/new product modification or expectation alteration is used.

| Product source | Tests | Pass | Fail | Skip | Exit |
|---|---:|---:|---:|---:|---:|
| old7f + same new tests |6|2|4|0|1|
| correctedc025 |6|6|0|0|0|

Actual old failures: saved protected strict projection; legacy projection; hidden flag with exact coordinates; protected stored row read after normal reappearance. Old normal exact and already masked controls pass. Raw failed assertions are preserved in b6-before-after/7f493b1c60bc.log. New repeated reads show no DB/authority revision mutation; strict/legacy consistency, no private proof/user_hash leak, owner deletion and ordinary status transitions pass.

## Latest main and remaining release gates

Temporary merge-tree with latestmainb41 exits0/conflicts0, tree `a69496e76215b7bef4fe205e7b217840a1c8880e`. Only weather_today/week changes fromc025; B6source retained,5 automatic JSON files byte-exact latestmain. No commit/index/branch merge occurred. Original one-off harness had ENOBUFS on the large weekly JSON default1MiB buffer; its merge output and diagnostic are retained. Complete-buffer script preserves the same assertions and passes.

B6 changes public Worker bundle bytes. Previously uploaded cf/6d public protective standby versions are **pre-B6** and must not be presented as B6-preserving rollback targets. Before any future release, obtain/verify a public standby that includes B6 (including fail-closed maintenance variant), keep the compatible admin/DB safeguards and do not restore/reset D1 state. This independent task performs no upload or deployment.

Free-capacity deployment BLOCKED remains. This source regression does not solve Free request/read exhaustion, current-day automatic generation, actual newly uploaded B6 rollback, operational migration or production validation. Chrome/native GPS proof and real workerd B6 are separate audit scopes; this report does not claim they were executed by this subagent.
