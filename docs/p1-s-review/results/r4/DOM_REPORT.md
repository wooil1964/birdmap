# Independent R4 Chrome DOM verification

Target: 8ccb248faa2c5c7b5a6019d12e19e21031169460. Baseline: 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c.
Clock: 2026-10-10 11:00 KST. Standard today generation: 10:30, forecast/tide: 12:00.
Widths: 344, 375, 768, 1024, 1440 px; height 900; actual Chrome/Leaflet marker popup and renderTodayPanel DOM.

Official results:
- target8ccb_final2/independent_r4_dom.json: normal scenarios 145/145 pass; reference freshness diagnostics 0/30 pass (30 actual card/popup inconsistencies); runtime/network-interception exceptions 0.
- before1bd_diagnostics/independent_r4_dom.json: same six freshness diagnostics across five widths 30/30 pass; exceptions 0.
- Normal source-valid 0, 92, 92.5, 100; recent bonus 16 and rank 108; no week/site; weekly forecast; 90/91 boundaries (including 6/24 h interval); alternate safe tide; wind/rain/wave missing; eligible missing/null/false; previous_saved; rain 1mm checked.
- 91-minute exclusion intentionally has no recommendation card while independently eligible today's popup still shows score; this is a correct semantic difference.
- Existing remote-island autumn exclusion is respected. Island control uses public site 3, boat control site 53 with valid weekly sample (boat today-only fallback is excluded by existing policy).
- Freshness diagnostics: delayed 05:41; future 12:30; malformed generatedAt; missing item and root generation; forecast on previous date; unchanged row 14 from actual product-builder sparse6h fixture (generated 06:10, forecast 12:00).
- New: all six card scores are `★★★★★ 92점`; matching actual marker popups are `오늘 적합도 미확인`. Old: both DOM displays unconfirmed. Raw score and safety candidate selection remain 92/true, so this measures the new display-provenance promotion independently of older candidate freshness policy.

Network/source guarantees:
- Chrome DNS rules installed before navigation; only local static server and four stylesheet/library CDN GET/HEAD are allowed.
- Fetch interception installed before navigation; deployed Workers, Turnstile, telemetry, tiles and other network destinations are fulfilled synthetically.
- Initial source archive JSON may load during bootstrap. Once a case starts, every weather/week/tide JSON reload is the same synthetic case fixture (null week returns synthetic 503). This is necessary because actual toggleTodayPanel starts loadWeatherWeek when week is missing.
- No product function/source patches; only test clock and in-memory globals/inputs. No production POST/DELETE, D1, real coordinates, device GPS, or deployment.
- Screenshot horizontal score bounds were measured. Physical-device keyboard/GPS and complete vertical overlay layout are outside this matrix.

Reproduction:
Set R4_GENERATOR_FIXTURE to docs/p1-s-review/results/r4/sparse6h_generated_today.json.
node independent_r4_dom.mjs <exact-target-archive> <output-dir> <exact-SHA>
Optional R4_WIDTHS=375; R4_DIAGNOSTIC_ONLY=1 for baseline diagnostics only.

Harness development attempts in target8ccb, target8ccb_retry and target8ccb_final are superseded and are not official product outcomes. Corrections: local static server handles missing assets before sending headers; wait for initial source loaders; exact popup site identity and stable render; existing seasonal/boat control assumptions; synthetic local JSON reload consistency. No product code was changed for these corrections.
