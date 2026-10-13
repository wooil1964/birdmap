# Latest-main compatibility supplement —2026-10-13KST

This supplement does not replace the final budget/fixed-input evidence for6d/main58 and does not repeat P1-A–D or perform a new latest-weather ranking analysis.

- Prior main: `58e1a222845680d5217677242ac1df5ff9bf665b`
- Latest fetched origin/main: `b41b03cc717a0154f520a3ab4ace24c990e62b3b`
- Implementation input: `7f493b1c60bc6002465a44d4ced39ac129afbba7`
- Common ancestor:58e1a22
- Temporary merged tree: `8bacc69b6beccb2a10bffd041a47f325abd9636e`

Root confirmed git fetch origin and unchanged latestSHA. This audit uses those pinned local objects. `git merge-tree --write-tree <main> <head>` exited0, conflicts0. It creates only temporary Git tree objects; no merge commit, branch update, index replacement or working checkout changes. No deployment, D1/API/user writes or product code editing occurred.

## Scope and preservation

Since58e1a22, main contains one automatic weather commit (`2026-10-12T13:17:15Z`), changing only `weather_today.json` and `weather_week.json`. No new feature, static/dynamic coordinate, recommendation function, server, canonical/D1 guard or navigation change is present.

The temporary merged tree differs from implementation7f in those same2 weather JSONs only. `summary.json` proves main and merged Git blob IDs/byte hashes identical for today/week weather, daily/monthly tide and notices. None of the new main artifacts is overwritten by old branch data. The merged index, public/admin Worker source/config, weather-proxy, recommendation and validators remain the verified PRhead content. cf5767b→7f product paths are unchanged; subsequent changes are CI/evidence documents.

siteData190 records and190 uniqueIDs exactly match latest main in all fields. Original coordinate hash remains `21c25db5b1aa0de03a2f037f720715696c3a2c14f016a00e0c0c4acb18e9df89`; all-record hash remains `fd50e35a1f1ad828f425918e28bb1632c9acb2e9206806263cd64d18a8513fd8`. No coordinates are printed in evidence.

Normal190/176 fixed-input signature/top10 results remain earlier evidence for that original fixed dataset and unchanged algorithm. This supplement does **not** claim live190/176 eligible candidates or that current weather produces the same top10. Main's new weather changes inputs; the algorithm did not change.

## Validator date distinction

Actual latest-main today batch date is2026-10-12, generated2026-10-12 22:13KST, refreshed22:17KST. Current audit time is2026-10-13 00:21KST. Thus the actual unchanged today validator on the current clock exits1 with **Batch date mismatch**. The failure logs are preserved; it is not reported as current operational today success.

With only the independent validator module clock frozen to the original generatedAt (10/12 22:13KST), the actual full validator exits0. JSON is unchanged; neither date metadata nor product date assertion was edited. This establishes that the original batch met its generation-day structural/score contract; it does not make it current on10/13.

Weekly validator at actual current time exits0: range10/12–10/18, generated10/12 22:13KST,190 sites,10640 samples/eligible samples, unavailable0. Current future weekly forecasts remain subject to unchanged C/P0 product eligibility; an old today score is not promoted to current merely because the weekly document is valid.

| Check | Actual result |
|---|---|
| Temporary merge-tree |exit0, conflicts0|
| Current-clock today validator |exit1, expected Batch date mismatch|
| Original-generation-clock today validator |exit0|
| Current-clock weekly validator |exit0|
| Midnight + autorefresh related JS |48 pass,0 fail,0 skip,exit0|

Commands and UTC start/end/exit receipts are in `summary.json`; raw final logs have `-complete-input.log` suffix.

An initial selective archive omitted unchanged `tide_today.json` required by test_data_autorefresh. It yielded47 pass/1 ENOENT failure; original `midnight-and-autorefresh-related.log` is retained. The archive was corrected by including exact merged-tree tide fixtures, without altering any test assertion or product file. Reexecution48/48 is separate. Other initial validator/merge logs are likewise preserved.

## Decision and next checks

Latest-main **source/merge compatibility is confirmed within the two-auto-file scope**. The current-day today batch remains pending the normal automated10/13 generation; no updater or deployment was triggered. Before any future operational release, refresh main again and validate that actual current batch; if code/functions or schema change, rerun affected integration/security checks. Unchanged product paths do not justify rerunning all old analyses now, and current-clock validator failure is not converted into success.

The root Free-capacity deployment **BLOCKED** decision remains in force. This read-only compatibility check does not resolve capacity, authorize paid subscription, merge main, deploy Workers/Pages, or change D1.
