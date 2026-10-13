# cf5767b exact-source independent regression

- Input head: `cf5767b090275221a516e16112d0e569eedb86e7`
- Latest-main input: `58e1a222845680d5217677242ac1df5ff9bf665b`
- PR #13 reference: `b12e20c1b6d856a021898a0c1c9221b30393a221`
- Tree: `3147c1e53a0aa2b6ef37767fb63347dcbf615736`
- Archived index SHA256: `f940030cb153825f5b9504c39f872eb6159e11360a71e2aa9d9e5ed8d57c5a69`

Executed independently from the detached review tree, never from its baseline711 index. Git archive pins the complete source/fixtures to the head above. No production API calls, data writes, deployments, source edits, or Git ref changes were performed.

Commands (all exited0):

```powershell
node docs/p1-publication-final-audit/integration/run_integrated.mjs cf5767b090275221a516e16112d0e569eedb86e7 58e1a222845680d5217677242ac1df5ff9bf665b
node docs/p1-publication-final-audit/integration/function_noninterference.mjs cf5767b090275221a516e16112d0e569eedb86e7 58e1a222845680d5217677242ac1df5ff9bf665b
node docs/p1-publication-final-audit/integration/static_notice_latest_main.mjs cf5767b090275221a516e16112d0e569eedb86e7 58e1a222845680d5217677242ac1df5ff9bf665b
```

Node24.18, bundled Python, installed real Chrome were used; every child command, cwd, start/end, exit and raw output is preserved in this directory.

| Suite | Pass | Fail | Skip |
|---|---:|---:|---:|
| Front15 files |359|0|0|
| reports-api |221|0|0|
| weather-proxy |36|0|0|
| Python weather |56|0|0|
| Python tide |21|0|1|
| share pages |11|0|0|
| Automatic aggregate |704|0|1|

The tide skip is the official-sample overlap check: samples are outside the rolling monthly window. It remains skip, not success.

Separate, non-additive contract suites: S2 matrix182/182; special21/21; popup12/12; S1-R protected171 representations and ordinary17 controls with0 misses/false positives, plus administrator/field/owner API assertions. Current-date today/week validators both exit0.

At fixed2026-10-08 22:40KST,190 sites/176 candidates/unsafe0; complete signatures and each top10 row (ID/order/date/time/raw/rank/bonus/basis) equal PR13 in both report conditions:

- ON: `47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb`
- OFF: `ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758`

`noninterference.json` independently verifies190 unique site records and original coordinates, source-equivalent weather generator/validators vs PR13, weather-proxy site/rules vs main, and byte-exact preservation of main weather/tide/notices artifacts. `tide_week.json` is absent in both refs, explicitly recorded.

`function-noninterference.json`:75 weekly/P0/S2 functions identical to PR13 and4 static navigation functions identical to latest main.

`static-notice-latest-main.json`:21 assertions pass. All7 involved actual functions are identical to main. Existing public curated notice points preserve routes;2 explicit access points use vehicle destination rather than observation coordinate, guidance controls render through actual function with synthetic Leaflet primitives; malformed access coordinates are rejected without fallback. No coordinates are printed in artifacts.

The previous `static_notice.mjs` fails with ReferenceError because latest main now requires `noticeValidCoordinate`, and old harness did not load it. Original failure is preserved in `static-notice-old-harness.log`. A separate harness includes actual new dependencies and checks the new access destination contract, without relaxing/removing old invalid-input and link assertions. This is a harness dependency failure, not a swallowed product failure.

This evidence does not establish operational D1 migration, actual rollback upload, CDN removal, native navigation launch, physical GPS, distributed POP consistency, or deployment. Those remain root operational gates.
