# PR13 final independent actual Chrome evidence

Target `2e485079a34fa5aeeef09e82f3b996bf2696d978`; previous `352315a57d038687807dbe0044c136a22fb0c9c5`.
Target index SHA256 `26488eddbff68fc118ae6d69a093675ddeb812bfa8e55a8c8d94a6a3a158f147`.
DOM fixed clock: 2026-10-10 11:00 KST. Widths 344/375/768/1024/1440, height900. Actual installed headless Chrome and Leaflet/actual marker popups. The source itself and production APIs were not modified.

## Results and scope

- Original49 scenarios ×5 widths: **245/245 pass**, errors0. The14 current-only exclusion expectations are still explicit and asserted; normal score0/92/92.5/100, rank108, tide90/91, alternate safe tide and required missing fields retained.
- Actual loader + DOM basic recovery9 phases ×5: **45/45 pass**. Includes all-reference, partial-reference, network503, new normal today/week documents and score/card recovery. This does not prove all out-of-order/invalid publication cases handled; parent's distinct C3 counterexamples remain separate.
- C2 bad forecast strings (no timezone and12:60 KST): **10/10 pass**. Actual candidate/final raw80/bonus16/rank96, card and popup `★★★★ 80점`, valid13:00 alternative. Identical expectations on previousSHA at375: **0/2 pass**, actual raw99/rank115/card and popup99.14 current-only reference conditions also pass on previousSHA, as expected.
- New boat13 paths ×5: original card+popup agreement attempt **40/65 pass,25/65 fail**. Do not count these25 as agreement passes. Subsequent assertions on the same saved DOM observations separately confirm **65/65 safe selection or missing-wave exclusion**, not65 additional browser tests.
- General reports/news/delete/routing/network E2E: target55/55 and temporary main combination55/55, errors0/environment limitations0. Target evaluation10/9 06:00 and combined evaluation10/9 21:10 match each archived weather snapshot. These are not10/10 live operational weather conclusions.

## Blocking source-type counterexamples (separate from245/45 and10)

Two actual375px Chrome cases both fail:0/2. These are not a policy or popup meaning difference.

1. `forecastTime: ["2026-10-10 12:00 KST"]`, envelope generatedAt normal10:30. Highest synthetic99 at the invalid array time masks normal13:00 score80. Expected actual80/rank96/card+popup80.
2. `weatherWeek.generatedAt: ["2026-10-10 10:30 KST"]`, forecast times valid. Expected reject unverified envelope and no recommendation (today absent).

Both actual observations: timestamp parser returns finite timestamp, candidate=true/candidateRank115, final raw99/bonus16/rank115, sourceEligibletrue, card+popup `★★★★★ 99점`. Source arrays are silently accepted through String coercion. `typedTarget375/typed_time_diagnostics.json` and4 screenshots retain the failure. Do not report the C2 strict source contract completely solved. Actual malformed object DOM was not executed here; parent's function results are separate.

## Boat meaning diagnosis preserved

Boat actual invalid-time2/required weather missing4 select valid80 in both card and popup at all5 widths. Exact wind6/wave.7/rain0 is safe; only missing-wave entry is excluded and popup is unconfirmed.

The5 numerical-safety cases (wind6.001, wave.7001, rain.001, raw wind6.01 displayed6, raw wave.701 displayed.7) correctly choose13:00 safe80 in the recommendation. Their independent site popup chooses12:00 normal-contract99, outside the additional boat6/.7/0 recommendation limit. Full agreement initially asserted80 and fails25 observations. Source proof and actual previousSHA375 confirm same five displays/labels/interpretations; this is an existing independent representative-weather path, not the new invalid-time defect.

Actual popup shows `주간 저장 예보 · 예보2026-10-10 12:00 KST · 생성10:30 KST`, `여객선: 🟢 출항 여건 양호` and `탐조에 매우 좋은 기상 조건`. The safe recommendation card explicitly says13:00 and `선상탐조 추천 조건 충족` plus check real departure. Existing `v24FerryStatus` uses wind7/wave1.5 warning thresholds, differing from recommendation6/.7/0. This deserves separate explanatory/safety-display review; it is not a failure of the final selection gate.

Synthetic99 is accepted-contract test data, not generated-score evidence. Actual `update_weather.py` AST execution of unmodified scoring functions with real pelagic rule gives wind6.001/6.01=85, wave.7001/.701 and rain.001=92. Thus high general weather scores while strict boat recommendation fails are possible in the existing scoring policy, but99 itself was synthetic. No operational frequency was measured.

## Reproduction

PowerShell:

```powershell
$env:C_GENERATOR_FIXTURE='<review>/docs/p1-s-review/results/c/sparse6h_generated_today.json'
node '<visual>/pr13_final_dom/independent_final_dom.mjs' '<review>/docs/p1-s-review/.scratch/targetFinal' '<new output>' 2e485079a34fa5aeeef09e82f3b996bf2696d978
```

For the separate source-type failures set `C_WIDTHS=375; FINAL_TYPED_ONLY=1`. For boat meaning comparison set `C_WIDTHS=375; FINAL_BOAT_ONLY=1` against targetFinal and beforeFinal. Remove scoped environment flags for full test. General: `node general_final_e2e.mjs archive out '2026-10-09T06:00:00+09:00'`, combined21:10. `node analyze_dom_evidence.mjs '<visual>/pr13_final_dom'` rechecks saved evidence and baseline equivalence.

External DNS is blocked before navigation except4 static bootstrap CDN domains; all API, Turnstile, telemetry, tiles and navigation are fulfilled locally. General POST/DELETE run only against imported actual public handler +memory fakeDB. No productionWorker connections, D1 access or production writes. Builder fixture is unchanged and deepEqual to product sparse6h fixture.

Screenshots visually inspected: valid80 general card, valid80 boat popup, invalid array99 card+popup. Horizontal score bounds checked. Physical devices/GPS/keyboards/deployed configuration and vertical overlap are not covered; fixed map controls partially cover some popup labels. Initial archive-missing ENOENT before baseline was harness setup only and not included as a product test failure. All browser results store exact source digests.

## Latest main auto-data refresh follow-up

A separate actualChrome general run against target product combined with newest main `4b164ffe74efa5cadad9e686bd628a8915527e77` (tree `75df87adfe7e82d3e12290d73a4e670b2112c59c`) completed **55/55 pass**, errors0/environment limitations0, exit0. This does not replace or rewrite preceding JSON.

Latest today/week generatedAt is `2026-10-10 05:06 KST`, today refreshed05:10. Frozen CURRENT_E2E_CLOCK=`2026-10-10T05:43:00+09:00`; the product's05:35 schedule+30minute grace period has not expired, so these documents are current for this precise condition. This is a10/10 current-source scenario, not a statement about all later clock times or actual departure safety. Synthetic live proxy tomorrow dates were independently changed to clock+1day10/11; product code and source fixtures remained unchanged. New script `general_latest_final_e2e.mjs`, results/PNGs `generalCombinedLatest/general_final_e2e.json`.

The25 boat numerical-safety popup differences were also reproduced at375 on previousSHA: same12:00 popup99/greenferry/very-good interpretation vs13:00 safe recommendation80. Comparison includes exact labels and interpretation; `DOM_EVIDENCE_SUMMARY.json` records all5 identical cases. This is an existing explanatory policy difference with follow-up value, not a new C2 malformed-time success/failure. Exact raw-safety selection checks are preserved independently; no assertion was removed or failed agreement recounted as an agreement pass.
