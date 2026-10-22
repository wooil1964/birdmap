# VWorld direct WMTS validation — 2026-10-22

Status: **actual registered Pages direct WMTS and candidate map checks passed; induced-error automatic OSM display passed**. PR #40 remains Draft. No main merge or production deployment is authorized by this validation. Final remote CI is reported separately on the PR.

## Baseline and authorization

- The user reports that VWorld support has allowed both direct WMTS and Cloudflare Worker relay for this service. This supersedes the earlier permission uncertainty; no repeat support approval is required for these tests.
- Latest remote main checked: `8397053c753d590e9d2bfde9d02fc6f0265727b4`.
- Reviewed PR head before this validation: `ee1c6f2c107d34fd82383d280a50b2b94fcede1c`.
- Main is already an ancestor of that head. Integration reports `Already up to date`; no unnecessary merge commit is created.
- Public Pages HTML fetched read-only at 2026-10-22 13:54 KST exactly matches main after line-ending normalization: SHA256 `c9d7785bd3dab6f8c075e2ac4f25564939d266976eb3504ca9815d286f1f6001`. Candidate scripts remain absent from production.
- User's earlier domestic PC result (13:25:39 KST, one Base request, HTTP 200, PNG/256×256/browser decode and visual map confirmation) is accepted. Its manually supplied Referer does not prove actual Pages browser authentication.

## Preservation and regression

Independent verification found all 229 complete site records, unique IDs and coordinates identical to main. Undoing the two basemap integration additions yields the entire main HTML exactly. Island groups 6, markers 20 and food/lodging links 80 remain intact. Data, reports API, weather proxy, weather/tide and notices are unchanged.

| Verification | Final result |
|---|---:|
| Existing front tests, unique total | 463/463 |
| Public/admin API and in-memory SQLite | 371/371 |
| Weather proxy | 36/36 |
| Events Worker | 20/20 |
| Python | 137 passed, 1 existing conditional tide skip |
| Shared pages | 229 current |
| SEO | 194 pages / 196 sitemap URLs current |
| Normal recommendation signatures | pass |
| Candidate basemap Chrome, synthetic tiles | 48/48 |
| Island Chrome | 25/25 |
| Publication/consent Chrome | 147/147 |
| Slow-CDN 1024px stress scenario | 31/31 |
| Reporter statistics Chrome | 135/135 |
| Field-retirement and ordinary reports Chrome | 60/60 |
| Keyless artifact packaging guard | 5/5 |
| One-image actual-Pages harness synthetic safety self-test | 14/14 |
| Candidate actual-Pages harness synthetic safety self-test | 18/18 |
| Genuine Pages WMTS single-image check | 1 HTTP 200 / decoded 256×256 / user map confirmation |
| Genuine Pages plus in-memory candidate map | 15 HTTP 200 / decoded 256×256 / user map confirmation |
| Induced VWorld 403 followed by actual OSM | 11/11 checks; 20 OSM HTTP 200 / decoded 256×256 |

The documents-based Chrome suites record zero production Worker requests, zero forwarded external non-GET requests and no browser exceptions in their final runs. Their tiles and API responses are synthetic. Mobile results are browser width/touch emulation, not physical Android/iOS certification.

Initial sandbox CDN access and Git ownership failures were resolved with network-enabled execution and exact process-scoped Git directory allowance; no global Git security change was made. One reporter precondition failed initially at 1440px (list count 0 instead of 3). The same source passed the 1440px-only 27/27 and subsequent full 135/135 rerun. The original failure is retained; its timing cause is not established.

## Development-key protection

The tracked runtime config remains keyless. Direct WMTS necessarily includes its key in the visitor browser's tile URL; closure storage is not key secrecy. No actual key is placed in source, command arguments, localStorage, diagnostics, HAR, screenshots, tiles, artifacts or PR content.

The protective artifact packager now refuses any nonempty or unreviewed runtime config before creating an output directory. It does not evaluate config JavaScript and reuses the validated bytes during copying. Regression cases cover canonical keyless config, key rejection, malicious code nonexecution, older main without a config and tracked config disappearance.

## Actual registered-domain browser test

Run `node docs/vworld-candidate/pages-browser-check.mjs --output <safe-result.json>` on the domestic PC. The user enters the key in the headed temporary Chrome password input. The program does not read GitHub secrets back or read credentials from local files/environment.

The harness first receives the genuine `https://wooil1964.github.io/birdmap/` document. It adds an in-memory verification dialog, without replacing the document or modifying Origin/Referer. It permits only one main-frame Base/8/100/218 image request and blocks additional/redirect requests, all Worker access, external non-GET traffic and post-input ordinary static/CDN traffic. HTTP status, MIME class, browser decode/dimensions and trusted human map confirmation are recorded as bounded safe fields. The key input is removed on submission; confirmation/cancellation/ten-minute expiry closes Chrome and removes the dedicated temporary profile.

An image decode alone is not proof of geographic content. An actual Pages success is not proof that unrelated domains are rejected. The one-image harness explicitly leaves `registeredDomainRestrictionVerified`, `pngSignatureVerified` and `candidateFullMapValidated` false. A complete candidate-map check is a separate step.

Actual result: **passed at 2026-10-22 14:03:20 KST**. The genuine Pages document returned HTTP 200; the browser-generated Referer origin was `https://wooil1964.github.io`. Exactly one VWorld request returned HTTP 200 / `image/png`, decoded to 256×256, and the user confirmed the geographic map using the trusted confirmation button. Chrome and its dedicated temporary profile were cleaned up. No key or tile was written to the result. This establishes a successful direct WMTS request from the actual registered Pages browser context; it does not establish rejection of unrelated domains or a deployed candidate. The previous Actions 502 remains an unresolved environment observation, not proof of a bad key.

### Entire candidate map on genuine Pages

`pages-candidate-check.mjs` fetched the genuine main document and applied the exact reviewed basemap CSS/module/init only in browser memory. No production document response or request Origin/Referer was replaced. At **14:13:29 KST**, all **15 actual VWorld tile requests returned HTTP 200 / image/png and decoded to 256×256**. The user confirmed the complete geographic map through the trusted button. The active provider was VWorld, reason `ready`, with 229 site records/markers, marker identities, coordinates, layer membership and camera preserved. The request cap was 32; no budget or invalid-tile rejection occurred. The temporary profile was deleted.

This proves the fixed domestic browser viewport and locally applied reviewed candidate, not an already deployed PR, unrelated-domain rejection or physical-phone coverage. Key-bearing request metadata necessarily passes transiently through the local browser debugger; the key segment is never separately extracted or recorded. No raw URL, tile or screenshot is saved.

### Automatic OSM return with actual OSM tiles

At **14:18:41–14:18:43 KST**, a separate isolated browser fetched the genuine unchanged Pages document (main hash above). It first exercised the default VWorld selection with synthetic successful images, then replaced VWorld image responses with **synthetic HTTP 403**. No real VWorld request or user key was used in this fault test.

The actual controller automatically returned to OSM after three errors: `active=osm`, `reason=tile_error`, `locked=true`, no loading/deadline loop. **20 real OSM tiles returned HTTP 200 / PNG and decoded to 256×256 on the attached OSM layer.** Normal OSM cache headers and browser-generated Referer were preserved. The 229 records/IDs/markers/coordinates/membership, camera, protection function references and hidden-location flag remained unchanged. All 11 checks passed; browser exceptions and forwarded external non-GET requests were zero. This is an induced-failure recovery test, not a real VWorld authentication failure or human OSM imagery confirmation.

Safe machine-readable evidence is in [single image](evidence/PAGES_IMAGE_20261022.json), [candidate map](evidence/PAGES_CANDIDATE_20261022.json), and [induced failure / real OSM](evidence/OSM_FALLBACK_20261022.json). These files contain no key or raw tile URL.

## Recommendation and deployment boundary

Use the support-approved **direct WMTS candidate** for the next approval decision. Actual authentication succeeded, so a Worker is not needed to resolve the observed browser path. The support-approved Worker remains a fallback option; it must be separate from birdmap-reports/admin and have no existing D1/service bindings or secrets.

The reviewed runtime file remains keyless. With an authorized runtime key and no saved OSM preference the candidate defaults to VWorld; missing configuration, unsupported view or tile failure returns to OSM. Approved production deployment must separately supply `VWORLD_API_KEY` through its deployment configuration, without committing it. This validation does not configure or execute that deployment. Direct WMTS will expose that supplied key in visitor request URLs, as explicitly accepted for the selected architecture. Unrelated-domain enforcement remains unverified.

No main merge, production Pages/Worker deployment, operating DB write or provider-authentication workaround was performed.
