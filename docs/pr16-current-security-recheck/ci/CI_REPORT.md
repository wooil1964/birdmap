# Read-only GitHub CI evidence — PR #16 current security recheck

Fixed local input: `399b2f3ac579e365bd48e611465fb5624ce5d9c4`. Captured 2026-10-14 KST.

## Exact SHA distinction

The exact fixed main has a successful **Pages build/deployment** run [38503313657](https://github.com/wooil1964/birdmap/actions/runs/38503313657), but **no Publication security regression run**. A Pages success is not a security regression PASS. No run was dispatched/rerun by this investigation.

| PR | PR head SHA | Actual Actions checkout SHA | Run | Core automatic PASS / FAIL / SKIP | Successful steps |
|---|---|---|---|---|---|
| #17 | `ddc3bc3fb20eec33c47328ac2eb00154865eb377` | `df5a72b34d5fc5e22d5c18e4af32c3603e7da7d4` | [38481187572](https://github.com/wooil1964/birdmap/actions/runs/38481187572) | 812 / 0 / 1 | 20/20 |
| #22 | `ab7f0504aaf028dd01ffaf28abea0078875a9314` | `d4d9948ce5cfd791cd6933c0324cdf940aca1280` | [38494318678](https://github.com/wooil1964/birdmap/actions/runs/38494318678) | 856 / 0 / 1 | 21/21 |
| #23 | `0eb7c3282a29c9e430e5a2eebb874bc68fc57084` | `eeffb675a790aedd9beb4857a274f542094aace4` | [38501900711](https://github.com/wooil1964/birdmap/actions/runs/38501900711) | 856 / 0 / 1 | 21/21 |

Actions uses a temporary PR merge checkout. API head SHA, checkout SHA, and eventual main merge SHA are deliberately not conflated. PR #17 actual merge `cb3dd3b2b10752dd59cccec9e0a449eaca48cefb`; PR #22 `31b5f6d6e0b400ff610ba065d893299c56a12af8`; PR #23 `8490fb22a3d0bd6125b8432111de9532ef56fe84`.

## Closest verified regression run

[PR #23 run 38501900711](https://github.com/wooil1964/birdmap/actions/runs/38501900711), job [115650568198](https://github.com/wooil1964/birdmap/actions/runs/38501900711/job/115650568198):

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Front Node/Chrome subtests | 395 | 0 | 0 |
| Public/admin API and SQLite | 322 | 0 | 0 |
| Weather proxy | 36 | 0 | 0 |
| Python weather | 60 | 0 | 0 |
| Python strict time contract | 11 | 0 | 0 |
| Python tide | 21 | 0 | 1 |
| Python shared pages | 11 | 0 | 0 |
| Core subtotal | **856** | **0** | **1** |

Two extra SEO commands succeeded (`sites/ in sync: 173 pages`; `OK: 173 indexable pages, 175 sitemap URLs`). They are command checks, not fabricated unit-test counts.

- Publication Chrome: **242 PASS / 0 FAIL / 0 SKIP / 0 notRun**.
- Historical PR #16 Chrome risks: **15 PASS / 0 FAIL / 0 SKIP / 0 notRun**, three risk cases × five widths, **subset of Chrome 242**, not additional tests.
- Reporter Chrome: **65 PASS / 0 FAIL / 0 SKIP / 0 notRun**.
- Native local workerd D1 fence: **13 PASS / 0 FAIL / 0 SKIP**.
- Native actual product handler D1 CAS: **10 PASS / 0 FAIL / 0 SKIP**.
- Fixed recommendation signatures: 190 sites, 176 eligible candidates, sightings ON/OFF complete signatures and top10 equal, unsafeCount 0 in both.

The old15 artifact rows are individually preserved in `PR16_OLD15_CI_LEDGER.json`, and its original parent artifact is `artifact-11866711249-publication_chrome.json`. These are historical CI results and must not be labeled the current independent local re-execution.

## Critical source identity

All **28/28** listed critical source blobs match the actual PR #23 CI checkout: `index.html`, `reports-api/src/publication.js`, `reports-api/src/field-updates.js`, all current API source/migration files, regression workflow and existing Chrome/native D1 harnesses. Whole-tree differences are exactly:

- `google8f9c3461f5b7ce5d.html` (Search Console verification).
- `weather_today.json` (automatic weather batch).
- `weather_week.json` (automatic weather batch).

`SOURCE_IDENTITY_FINAL.json` contains blob IDs and differences. This establishes unchanged critical security source, **not exact-main CI execution** or validation of the newly updated real weather batch. The first `SOURCE_IDENTITY.json` is preserved; its Unicode path aliases from non-NUL `ls-tree` are explicitly corrected by the final raw UTF-8 `git ls-tree -rz` record.

## Workflow mutation review

`publication-security-ci.yml` triggers on pull_request targeting main and workflow_dispatch; no push/main trigger. `permissions: contents: read`; checkout `persist-credentials: false`. Commands execute local Node/Python tests, fixed-input signatures, localhost Chrome mocked API, synthetic native D1 with `d1Persist:false` / `cf:false`, filesystem-only standby packaging, and upload-artifact. There is no Worker/Pages deployment, remote D1 command, workflow write token, commit/push, or real user operation in this workflow. Dependency/package GET requests remain permitted by the harnesses; operating API request counters are 0.

This agent performed **no CI execution/dispatch/rerun/push/PR mutation**, **0 operating Cloudflare/API/D1 calls**, and **0 product/test/harness edits**. The local evidence folder is the only write scope.

## Preserved failures and limitations

- Initial direct log downloads returned HTTP 401 at the temporary artifact redirect. Kept `FETCH_MANIFEST.json`; corrected read-only download strips GitHub Authorization at the signed blob redirect, `LOG_FETCH_MANIFEST.json` proves all three logs fetched with byte counts/SHA256. This is a tooling transport failure, not a product test FAIL.
- No fresh exact-main Publication regression has been run by this investigation. Main-specific local outcomes must be supplied by the parent task and kept separate.
- Chrome evidence uses synthetic authority/payloads. Actual D1 atomicity is separately covered by native workerd tests. No operating API/D1 traffic or multi-POP production proof.
- Physical GPS/native Kakao/TMAP execution are not certified by these CI runs.
- PR #16 remains **open Draft**, head `245298981e27f88ac26bad8b46d819a7df899c86`, merge SHA null. No merge/close requested or executed.

## Reproduction / capture commands

- GitHub read-only REST: GET `/pulls/{16,17,22,23}`; GET `/actions/runs?head_sha=399b2f3ac579e365bd48e611465fb5624ce5d9c4`; GET `/actions/runs/{runId}`; GET `/actions/runs/{runId}/jobs`; GET `/actions/jobs/{jobId}/logs`; GET `/git/commits/eeffb675a790aedd9beb4857a274f542094aace4`; GET its recursive tree; GET run38501900711 artifacts and artifact11866711249 zip.
- Local identity only: `git ls-tree -rz 399b2f3ac579e365bd48e611465fb5624ce5d9c4` and SHA/blob comparison; no local suite invoked by this agent.
- Raw job logs and normalized `run-*-VERIFIED_SUMMARY.json` retain actual commands, exit/conclusion evidence, and checkout SHA.
