# Independent actual Chrome concurrency and Worker request measurement

## Inputs, method and result

Product source is `6d0f435b89f11a28ec0bef3c258fa141e4161e47`, HTML SHA-256 `d3488318be9dc3696946753fc0c18fa26392c3b519c1467552603883641616d3`. Runtime assets are canonical-byte archive `cf5767b090275221a516e16112d0e569eedb86e7`, tree `3147c1e53a0aa2b6ef37767fb63347dcbf615736`: the diff to 6d0f435 changes only the CI workflow and a CI failure receipt, so the runtime product/assets are identical.

Actual Chrome `154.0.8037.98` ran 10 and then 20 separate incognito browser contexts. Each had independent storage, publication state and timers. CDP focus emulation made real `document.visibilityState` report `visible`, `document.hidden=false` and `document.hasFocus()=true`; each API request records these values. This represents simultaneous foreground client behavior, not a fleet of physical devices. The products' five-second polling, five-second permission lease, timers and algorithm were not changed.

Only synthetic API responses were used with configured RTT 75 ms. Steady observed RTT was 75.1–92.1 ms for 10 users and 75.0–92.3 ms for 20 users. Each cohort had an original 65-second steady observation, then 12-second actual-background observation, visibility return, contributor/history interaction, 1,500 ms latency causing lease expiry, authority hiding/deletion, normal reauthorization, network failure and recovery.

Load runner: **exit 0, 18 cohort assertions pass / 0 fail**. Each of nine assertions per cohort requires all participating clients to satisfy its condition. There were no browser runtime exceptions, actual operating Worker requests or external non-GET requests. The unchanged independent 241-condition Chrome suite remains separate; it also tests clock rollback, delayed GPS and route auxiliary/context-menu guards. These counts are not multiplied or combined into a fictitious larger pass count.

## Initial versus steady accounting

The first raw observation used the controller phase named `bootstrap`, which ended when data/markers became ready. The raw request trace shows that remaining parallel postflight HEADs were still completing. Some of these began just after the controller switched to `steady-foreground`.

The final budget accounting uses two explicit, disjoint windows per client:

- Initial: from the first Worker request, inclusive, to 2,000 ms later, exclusive.
- Normalized steady: from the later of original 65-second start or initial cutoff, inclusive, to original 65-second end, inclusive.

No request in these observations lies exactly on the cutoff. Original timestamps, phase labels and success assertions are retained. `LOAD_MANIFEST_RAW.json`, both cohort JSON files and the run log are untouched. No assertion was removed and no product expectation changed. `normalize_chrome_load.mjs` reproduces the accounting and checks count conservation; individual normalized exposure exceeds 63 seconds.

| Measurement | 10 foreground clients | 20 foreground clients |
| --- | ---: | ---: |
| Original controller 65-second requests | 574 | 1,146 |
| Startup HEADs within original 65-second phase | 4 | 6 |
| Normalized steady requests | 570 | 1,140 |
| Initial first-two-second requests | 130 | 260 |
| Total initial + steady requests | 700 | 1,400 |
| Raw bootstrap + waiting + raw steady | 113 + 13 + 574 = 700 | 220 + 34 + 1,146 = 1,400 |
| Sum of individual normalized exposure | 644,350.200 ms | 1,292,402.600 ms |
| Mean normalized exposure per client | 64.435020 s | 64.620130 s |
| Minimum normalized exposure per client | 63.417600 s | 63.456200 s |

The conserved totals explain exactly why original 574/1,146 and normalized 570/1,140 differ. Initial first-two-second requests are 13 per client: HEAD five times and each of four list endpoints twice. Old main initial loading used four requests per client, so the new initial increment is nine requests per client.

## Measured steady endpoints and scenarios

| Endpoint | 10 clients | 20 clients | Per client in measured normalized window |
| --- | ---: | ---: | ---: |
| `/reports/public-state` | 320 | 640 | 32 |
| `/reports/approved` | 60 | 120 | 6 |
| `/reports/pending` | 60 | 120 | 6 |
| `/reports/recent-sites` | 60 | 120 | 6 |
| `/field-updates` | 70 | 140 | 7 |
| Total | 570 | 1,140 | 57 |

Default steady `/reports/capabilities`, `/contributors/monthly` and `/reports/site/*` counts were zero. The separate explicit contributor-plus-history interaction added two payload requests per client and associated HEAD calls; those are recorded in the interaction phase, outside default steady accounting.

Every steady request was made while visible, completed with HTTP 200, and had no synthetic network error. Normal stable authority still produced **six `expired` invalidations per client** in the raw 65-second phase. Each led to the four-list refresh. Product polling and lease share the five-second interval; the next HEAD response arrives after its start, allowing expiry before renewal. This is actual product behavior, not the assumed single HEAD every five seconds model.

| Extrapolation from measured normalized exposure | 10-client measurement | 20-client measurement |
| --- | ---: | ---: |
| Worker requests per client/hour | 3,184.60 | 3,175.48 |
| Worker requests per client/continuous 24 hours | 76,430.49 | 76,211.55 |
| Cohort requests/hour | 31,846.04 | 63,509.62 |
| Cohort requests/continuous 24 hours | 764,304.88 | 1,524,230.92 |

These hourly/day figures are scenarios extrapolated from measured 63–65 seconds, not observed operating traffic. A real population's active time and arrivals are separate inputs. Initial loads are also separate and must be added by arrival count.

## Same-condition legacy baseline

A separate sequential run used exact main `58e1a222845680d5217677242ac1df5ff9bf665b`, matching canonical runtime assets, ten independent Chrome contexts, the same 75 ms synthetic RTT and 65-second foreground observation. It exited 0, with no browser exception or operating request.

- Initial: four Worker requests per client, each list once.
- Observed 65-second steady: one field request per client; ten requests total.
- Observed rate scenario: 55.3695 requests per client/hour; the ten-minute three-list timer did not reach its next boundary.
- Source-only longer-window estimate: field every minute = 60 requests/hour; approved, pending and recent each every ten minutes = 18 requests/hour; total 78 requests/client/hour, excluding initial loading and interactions.

The new code still has the legacy ten-minute timer. Its exact interaction with lease expiry and refresh timing was not observed over an hour and is not presented as an exact added hourly amount. The observed pure increment relative to the 65-second baseline is about 3,120–3,129 Worker requests/client/hour. Using the source-estimated legacy 78/hour gives a different, explicitly estimated comparison; it must not replace the raw result.

## Security and visibility observations

Both cohorts correctly entered actual `document.hidden=true` / `visibilityState=hidden` after focus override was disabled and a real sibling tab activated. The measured 12-second background period sent zero requests. This proves the short observed background period and five-second publication polling behavior; the legacy ten-minute report timer lacks a hidden guard and may issue requests on a longer background interval.

Visibility return revalidated authority and restored authorized data. Hiding/deletion removed exact routes and unauthorized locations. Network failure closed all dynamic markers and recovery required current authority. New explicit reauthorization was preserved. Lease expiry at both ordinary and 1,500 ms RTT failed closed.

A 250 ms sampler recorded 2,602 steady samples for the 10-client cohort and 5,202 for the 20-client cohort. None contained dynamic approved/field markers while `publicationAllowed()` was false. Allowed samples numbered 2,542 and 5,082 respectively: the expiry/refresh sequence temporarily removed dynamic data instead of extending permission. Sampling is not proof of instantaneous revocation. Physical GPS and native app launch were not performed.

## Operating budget judgment

Worker HTTP requests are not D1 query counts. The user-provided 24-hour D1 1,230 queries / 58,000 reads / 496 writes / 1.44 MB and the parent's nearby read-only analytics window are distinct measurements. They must not be copied as this test's Worker request baseline. To calculate D1 reads, multiply actual per-endpoint SQL metrics by the counts and divide by the sum of client exposure; GET load does not imply D1 writes.

Cloudflare's current official documentation states Workers Free has 100,000 requests/day and resets at midnight UTC; exceeding the limit returns error 1027. The source is [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). D1 Free includes 5 million rows read/day and 100,000 rows written/day; source: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). These limits were checked on 2026-10-12.

**Operational deployment remains BLOCKED until the real usage budget and availability decision are resolved.** These load scenarios are well above the single-HEAD planning model and can exhaust Free allowances at modest sustained foreground use. The tested security path closes location display on authority failure; quota exhaustion would still interrupt normal reports/navigation and API availability. No product optimization, paid plan, Worker upload/deployment, migration or operating-data modification was performed in this analysis.

## Reproduction and evidence

Scripts:

```text
node docs/p1-publication-final-audit/operations/chrome_load.mjs
node docs/p1-publication-final-audit/operations/chrome_load_baseline.mjs
node docs/p1-publication-final-audit/operations/normalize_chrome_load.mjs
```

The load script uses environment `PUBLICATION_TEST_INDEX_REF=6d0f435b89f11a28ec0bef3c258fa141e4161e47`, `PUBLICATION_TEST_ASSET_REF=3147c1e53a0aa2b6ef37767fb63347dcbf615736`, `PUBLICATION_TEST_ROOT=<review>/.tmp/chrome-cf5767b-full-archive-lf`, `PUBLICATION_TEST_OUTPUT=docs/p1-publication-final-audit/operations/chrome-load`, and the actual `CHROME_PATH`. Baseline uses main58 SHA/tree/assets and separate `chrome-load-baseline-main58` output. Product source and generated JSON are untouched.

Saved evidence: `chrome-load/{cohort-10.json,cohort-20.json,LOAD_MANIFEST_RAW.json,LOAD_MANIFEST.json,LOAD_COMPARISON.json}`, `chrome-load-baseline-main58/BASELINE_MANIFEST.json`, and both run logs. Root can combine the normalized endpoint count vectors and per-client duration sum with separately verified D1 SQL metrics without repeating this Chrome run.