# Latest combined actual Chrome review — 2026-10-11

Tested head `b12e20c1b6d856a021898a0c1c9221b30393a221` with main `b596cdc8ede83fe25e64ec10b2dc88d4141673b2`, merge tree `2c3703e7234f9f0ab02786f03d03a2314bf5cfcf`. The archived index includes main TMAP changes and is different from the head index. Every tested archive file matches the merge-tree blob after line-ending normalization. Exact hashes and helper comparison are in source_sha_list.json. No product, Git, deployed Worker, D1 or operational data was changed.

## Separate execution ledgers

| Execution | Evaluation KST clock | Result | Page exceptions |
|---|---|---|---|
| Unchanged general E2E | 2026-10-11T06:51:30.0819143+09:00 | 45/55;10 failures preserved | 0 |
| Current-source-contract general E2E | 2026-10-11T06:55:23.5171298+09:00 |55/55 |0 |
| All-ineligible empty / original-data restoration | same current-contract clock |10/10 separate |0 |
| Initial TMAP supplemental query | same current-contract clock |15/20;5 failures preserved |0 |
| Active-marker scoped TMAP-only recheck | 2026-10-11T06:56:49.6323065+09:00 |20/20 separate |0 |

Widths were344,375,768,1024,1440. Existing fixed core245, F2/F3, lifecycle and boat browser runs were not repeated. These figures must not be added to root's separate Node/Python615 or other totals. Previous190/176 fixed10/8 observations are not presented as current10/11 operational eligibility.

## Current weather provenance and compatibility

Actual main today/week generatedAt04:16KST and refreshedAt04:18KST. At the captured06:51/06:55 clock, stored today's matching root/item04:16 has stateCurrent=false and scoreEligible=false. This remains reference; it was not forced current. The original harness expected mutated raw today to make the popup unconfirmed, but verified weekly alternatives remained available and the app correctly selected week_forecast. Those two original assertions per width explain the10 preserved failures.

The adapter temporarily removes weekly alternatives only while checking raw-today unconfirmed/reference variants. On restoring unmodified latest today/week, actual popup and synthetic live-merge provenance is week_forecast/current/eligible while raw today stays expired. All5 widths restore the same original10 card IDs and all selected entries pass recommendation safety. In-memory scoreEligible=false on both today and every weekly sample produces candidate0/final0/card0 and the exact empty message; restoring the original objects restores10 cards.

Actual local reports handler plus fakeDb exercised registration, protected submit, owned delete, retained error state and navigation across5 widths. All external Worker/CAPTCHA requests were intercepted before navigation; deployed POST/DELETE were not sent. Leaflet came from permitted static CDN reads. Live temperature/wind and tomorrow values were synthetic API responses, with stored score provenance retained.

## TMAP integration and harness correction

Ordinary field chooser and ordinary synthetic spot popup each contain both Kakao and TMAP hrefs. Protected field external navigation returns without chooser; protected synthetic spot popup contains neither route link. All5 widths pass4 checks each in the targeted recheck. window.open count is0 and no TMAP app was launched. The desktop Chrome mobile viewport is emulation and does not verify actual installed-app launch, physical GPS or mobile user-agent behavior.

The initial supplemental check used document.querySelector on Leaflet's global popup DOM. While a previous ordinary popup faded out, that selector still returned its Kakao/TMAP links. The corrected active marker getPopup().getElement() returns the actual protected popup, hidden-note=true and Kakao0/TMAP0; globalSelectorOwnerMatches=false and globalKakaoCount1 remain in the recheck evidence. The initial15/20 result is preserved rather than rewritten.

## Boat residual meaning assessment

Original boat agreement remains40/65 with25 unresolved mismatches. Saved before352 actual375 and b12 actual375 agree on all5 affected conditions and seven fields: safe13:00 card80/rank96 versus representative12:00 popup99/green. No boat browser rerun was performed. The five relevant helper bodies are identical between b12 and the new combined source.

weeklyPelagicSafety uses raw wind<=6, wave<=0.7 and precipitation3h<=0; v24FerryStatus parses displayed values and turns yellow atwind7/wave1.5, red at11/2. They represent different decisions. Popup representative selection has no pelagic recommendation filter, so verified score eligibility does not establish safe recommended pelagic conditions. The high-score/very-good headline versus safe-card-time distinction remains an existing UI misunderstanding risk. These25 alone do not establish a newly introduced PR mandatory deployment blocker, and they have not been converted into passing agreement checks.

The actual pure generator score functions produce85 atwind6.01 and92 atwave.701 orrain.001 under the current pelagic rule, although all three fail stricter pelagic recommendation safety. Current pelagic scoring starts92 and only subtracts; the original99 was synthetic valid-contract input, not a proven operational99 occurrence. This confirms the difference in policy thresholds without claiming that exact99 fixture is generated in production.

## Files

execution_manifest.json records each clock, script, exit status, source proof, scope and restrictions. source_sha_list.json records source/script/resultSHA256. DOM_EVIDENCE_SUMMARY.json contains per-width normal source, empty/recovery and navigation observations. boat_existing_meaning_assessment.json and generator_pelagic_score_proof.json hold the separate retained-risk analysis. COPY_FILES.txt excludes browser profile directories.
