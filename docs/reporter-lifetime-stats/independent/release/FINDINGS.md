# Issue21 independent release regression

Source: e2603e0f4236fa74755ba8b7c11b211ef1603dbc.

- Native local D1 fence: 13 PASS / 0 FAIL / 0 SKIP.
- Current actual handlers and native D1 CAS: 10 PASS / 0 FAIL / 0 SKIP. Access and Turnstile were synthetic stubs.
- Fixed clock 2026-10-08 22:40 KST: 190 sites / 176 candidates, sightings ON and OFF full candidate signatures and top10 ID/order/scores/date/time/type exact versus b12e20c1. Unsafe recommendations: 0.
- 21 exact Git blobs for prior privacy/canonical/CAS/server/admin/schema/config/weather rules/site coordinates remain unchanged from latest-main baseline1bac245. Entire static siteData fields and3fixedspots exact.
- Initial integrity harness incorrectly compared LF Git blob with CRLF Windows checkout. Raw hash mismatch is preserved in INTEGRITY_FIRST_FAILURE.json; the corrected proof compares baseline/product Git blobs and separately checks checkout text. No product defect or assertion removal.
- Evidence paths, commands, exit0 andSHA256 manifest: RELEASE_RECEIPT.json.

No product edit, production API call, operating D1 mutation, push, merge or deployment was performed. Historical prior suite outcomes were not substituted for these new executions.
