# PR13 F1–F3 independent Chrome DOM verification

Target a35b8598d55890e705042e4d6f88621357749d09; before 2e485079; latest main bf74095a; isolated combined tree 379b0c06. Exact target index.html and combined index.html were compared against the Git blob after CRLF→LF normalization. No product, Git or production data changed.

Result: **needs correction**. Original core 49×5=245/245, invalid time strings 2×5=10/10, general target55/55 and latest combined55/55 passed. The new F2 mismatch exclusion is correct and matched provenance controls recover. F3 still has actual UI exceptions and today missing/malformed publication metadata can retain numeric recommendations.

## Separate counts

| Scope | Pass | Fail | Meaning |
| --- | ---: | ---: | --- |
| Original core card/popup 49×5 | 245 | 0 | Same assertions and source script |
| Invalid strings 2×5 | 10 | 0 | Valid80/rank96 alternative retained |
| Original lifecycle9×5 | 35 | 10 | Old expectation conflicts with new F2 source consistency; preserved |
| Same original45 with new safe expectation | 45 | 0 | Mismatch2×5 excludes candidate, final card, numeric popup; reference weather retained |
| Matched provenance controls2×5 | 10 | 0 | root=item10:31 restores14/15; root=item14=10:32 restores14 with15 remaining reference |
| Typed arrays | 2 | 0 | Forecast array rejects99, selects80/rank96; publication array excludes |
| Typed objects | 1 | 1 | Forecast object selects80; publication object throws in renderTodayPanel |
| Additional today metadata/object375 | 0 | 3 | Two invalid publications show92/rank108; forecast object throws |
| General target five widths | 55 | 0 | Fixed target batch clock10/9 06:00 KST; memory actual reports API |
| General latest combined five widths | 55 | 0 | Actual captured21:15:44 KST frozen; canonical root/item20:13 KST |

These scopes are distinct from the root agent's615 automated regression scope and loader28/140 scope. They are not added to a single total.

## F2 lifecycle expectation ledger

The unchanged original script still asserts14/15 for root10:31/item10:30 and14 for root10:32/item14=10:30. On the new source all ten expected candidate sets fail. The older2e485 result and unchanged assertion script are preserved. lifecycle_expectation_ledger.json pairs all ten old failures with the new safe empty-set result and actual Leaflet popup reference wind/temperature checks. No failure assertions were deleted. Separate consistent timestamp controls restore the previous normal flow.

## Blocking actual DOM results

1. **Weekly object publication**: generatedAt={toString:'not-callable'}. weeklyForecastTimestamp safely rejects it, but index.html4380 concatenates generatedAt into the basis text and throws TypeError. Actual375 screenshot shows the recommendation heading0 but no empty-state guidance. The follow-up toggle repeats the same product exception; it is recorded as the typed harness bootstrap error and is not a second distinct finding. Array publication is safely excluded.
2. **Today missing item.generatedAt** with valid root10:50: actual candidate/final raw92/rank108 and card/popup★★★★★92점 remain. No exception. Safe exclusion and unconfirmed popup expectations fail.
3. **Today root generatedAt array** with valid item10:50: the same actual92/rank108 card/popup remains; null root parser result bypasses the consistency condition. No exception. Python parity is handled separately by the contract agent.
4. **Today forecastTime={toString:'not-callable'}**: storedWeatherState2074 calls String before safely returning reference state. Actual candidate/final/render throws TypeError. Leaflet popup also throws through weatherTodayForSite→v23TodayWeatherHtml. Actual card count0 has no empty-state text, and no weather popup exists. This is not reported as safe exclusion success.

All inputs above are JSON serializable synthetic contract cases, not observed production malformed data. Existing boat popup differences at representative time versus recommendation time were not reclassified or rerun.

## Current source and clocks

Canonical latest combined today/week were generated10/10 20:13 KST, refreshed20:17 KST. The general latest run freezes the actual captured clock10/10 21:15:44 KST, not a forecast or old normal snapshot. All five viewport live-normal DOM checks observe root=item20:13 KST, timestamp equalitytrue, stateCurrenttrue and scoreEligibletrue while live temperature18℃, wind2m/s and tomorrow information apply. Unconfirmed/reference modes retain unconfirmed score status. Target55 uses the unchanged target's10/9 05:41 batch with the explicit fixed06:00 clock. Synthetic contract cases use11:00 separately.

## Execution constraints and artifacts

Viewports344/375/768/1024/1440; actual Chrome headless and real Leaflet CDN. All external APIs are intercepted before navigation, with DNS isolation; static CDN GET/HEAD only. Reports/field POST/delete use actual reports handler against local fakeDb, never deployed Workers. Product source edits0, production Worker connections0, D1 access0, production POST/DELETE0. Coordinates were not added to any report.

JSON artifacts: original_dom/independent_final_dom.json, safe_lifecycle/independent_final_dom.json, typed_dom/independent_final_dom.json, additional_today_dom/additional_today_dom.json, general_target/general_final_e2e.json, general_latest/general_final_e2e.json. DOM_EVIDENCE_SUMMARY.json records clocks, source proofs, separate counts, current live provenance and SHA256s. Browser-only test scripts are in this analysis directory.

A review-only additional selector escaping error occurred before result creation; the final additional3 script corrected it without changing product code or expectations. The original product failures above are preserved in their final JSON records. Screenshots were inspected for weekly object publication and today object forecast blank guidance.
