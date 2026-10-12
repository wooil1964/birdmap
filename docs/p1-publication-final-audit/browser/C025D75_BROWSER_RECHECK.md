# c025d75 independent actual Chrome / saved field DTO recheck

## Exact inputs

- Source SHA: `c025d75f964ab36f6f2eae541a99461f6de59b70`.
- Git tree: `ce5c2eea3807084a690299d316e9a20b56ee1ae5`.
- Actual Chrome version: `154.0.8037.98`.
- HTML SHA-256: `d3488318be9dc3696946753fc0c18fa26392c3b519c1467552603883641616d3`.
- Canonical-byte archive created with `git -c core.autocrlf=false archive` of the exact SHA. Index, today/week weather, today/month tide and notices were checked byte-for-byte against their Git blobs; all match.
- Widths: 344, 375, 768, 1024 and 1440 px.

No frontend product edit, operating API request, deployment or production D1/user-data modification occurred in this verification.

## Product contract review

`reports-api/src/field-updates.js:134` exports `publicEntry`. The new read path evaluates saved species through the actual S1-R `protection` helper. A protected saved row with `location_hidden=0` now receives `locationHidden=true` and `lat=null,lon=null`. A hidden saved row whose public point equals the private point is also withheld. A correctly saved hidden point is retained only when `public_point_masked` is the number 1 from the same SQL snapshot.

`COLUMNS` computes that alias using private/public point inequality inside SQL. Both legacy `handleList` and strict `fieldSnapshotStatements` use the same columns; strict `fieldSnapshotPayload` and legacy `loadEntries` both call `publicEntry`. The alias and private columns are not included in the DTO. No random point or data repair is generated during reads.

The unchanged frontend `fieldValidUpdate` requires numeric lat/lon. Therefore a withheld-null row is filtered before `fieldUpdates` or Leaflet marker creation. This safely removes the coordinate-bearing map representation. It does **not** preserve a selectable map entry for that legacy row. The API still retains reference metadata and supports owner mutation by known ID; the existing owner popup cannot be selected for a row that has no marker. This limitation is explicit and accepted within the minimal fail-closed change.

Correctly masked hidden1 rows and newly created protected rows retain the existing approximate marker and protected popup. `fieldPublicPoint` returns null for hidden rows, so navigation and direction guidance remain closed. Ordinary species retain exact authorized public coordinates and both app routes. This change does not implement S1-P approved-report blanket privacy or repair arbitrary stored masking provenance.

## Independently executed suites

| Suite | Actual pass | Fail | Skip | Not run | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Existing independent publication Chrome suite | 241 | 0 | 0 | 0 | 0 |
| Actual SQLite product API DTO / newly-created owner replay | 170 | 0 | 0 | 0 | 0 |
| Actual workerd API DTO / saved-owner replay | 140 | 0 | 0 | 0 | 0 |

These suites overlap and are reported separately; they are not asserted to represent 551 unique security conditions. All three ran actual Chrome/Leaflet at the five widths, with runtime exceptions 0, actual operating Worker requests 0 and external non-GET requests 0. The existing 15-risk subset of the 241 suite remained unsafe 0.

The SQLite fixture imports actual pinned `handleRequest` and related product modules, uses real schema/migration/triggers and current strict GETs, and creates historical writer-shaped SQL rows. Public DTO values and mutation receipts come from those actual calls. It includes six protected expression variants, a correctly masked hidden1 row, hidden1 exact row, five ordinary species and a protected row created by the actual product. This produces 34 conditions per width: seven withheld rows x two, one approximate-marker condition, five ordinary species x three route conditions, and four owner lifecycle conditions.

The additional workerd fixture comes directly from the migration agent's real workerd/D1 `handleRequest` run: `server/field-saved-protection-read/c025d75-expanded/API_DTO_FIXTURE.json`, SHA-256 `d807b52baa04719b851104db74ef72b5c8f205bea08e68a99cdb3e6939f9ed39`. A replay adapter changes envelope names only; each DTO and receipt body remains unchanged. It includes four withheld rows, one correctly masked row, five ordinary species and the saved-masked owner lifecycle. This produces 28 conditions per width.

## Actual DOM findings

- Protected `저어새1`, `저어새 2마리`, `흰꼬리수리1`, `매1`, mixed slash and LF forms have no exact field marker, popup coordinate or retained field coordinate. The workerd fixture independently confirms the saved legacy0 cases and hidden1 exact case.
- Navigation attempts for withheld rows create no Kakao/TMAP target or active guide.
- The correctly masked hidden1 row retains exactly the API-provided approximate marker. Its actual Leaflet DOM contains the protected approximate-location notice, while direction guidance and app routes are absent.
- `갈매기`, `알락오리`, `알락할미새`, `동박새` and `한국동박새` retain their authorized marker and both app chooser controls. Actual `spotKakaoRouteUrl` and `tmapNavigationUrl` outputs are captured after the fresh-authority gate and match DTO lat/lon. Native apps are not launched.
- A newly created protected approximate row displays the owner delete button, supports actual product `fieldStatusStart`/`fieldSubmitStatus` replay of `not_visible` and `reappeared` receipts, then owner delete removes the row, marker and local ownership entry and creates the tombstone.
- The workerd-generated saved masked owner independently follows the same status and deletion flow using its actual receipts and synthetic owner device.
- Legacy withheld rows preserve server/API owner-by-known-ID receipts but remain unselectable in the map owner UI; this is not claimed as UI preservation.

344 px and 1440 px approximate-popup screenshots were visually inspected. The notice is visible and the field box disables guidance. Gray base-map tiles reflect the explicit test network block, while real Leaflet markers/popups initialize successfully.

## First harness failure and correction evidence

The first DTO suite exited 1 with **140 pass / 30 fail**. Its original harness, JSON, screenshots and run log are preserved under `c025d75-saved-protected-harness-failure`.

The failures were independently diagnosed:

- 25 TMAP cases: the instrumenter incorrectly treated `openTmapNavigation()` as accepting destination arguments. The real signature has no arguments and is only the platform gate. Correct instrumentation captures the actual `tmapNavigationUrl(dest,name)` invocation while preventing native app execution.
- Five approximate-popup cases: Leaflet's `getContent()` returned the bound content function, so the instrumenter read empty text. Correct instrumentation reads the actual rendered `getElement().textContent`.

Assertions requiring the correct target coordinates and actual approximate notice were retained. Product files and expected privacy policy were unchanged. The corrected 170-condition suite passed, followed by the separate workerd 140-condition replay. The failed result is not counted as successful.

## Reproduction and evidence paths

Baseline:

```text
PUBLICATION_TEST_INDEX_REF=c025d75f964ab36f6f2eae541a99461f6de59b70
PUBLICATION_TEST_ASSET_REF=ce5c2eea3807084a690299d316e9a20b56ee1ae5
PUBLICATION_TEST_ROOT=<review>/.tmp/chrome-c025d75-full-archive-lf
PUBLICATION_TEST_OUTPUT=docs/p1-publication-final-audit/browser/c025d75-baseline-lf
CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
node docs/p1-publication-final-audit/browser/publication_chrome_final_cf5767b.mjs
```

DTO suites use the same source/tree/assets and Chrome. The scripts are:

```text
node docs/p1-publication-final-audit/browser/saved_field_chrome_c025d75.mjs
node docs/p1-publication-final-audit/browser/saved_field_chrome_workerd_c025d75.mjs
```

Set output to `c025d75-saved-protected` for the first and `c025d75-workerd-dto` for the second; the second uses `SAVED_FIELD_FIXTURE_PATH=<review>/docs/p1-publication-final-audit/browser/c025d75-workerd-dto/api_workerd_replay_fixture.json`.

For the actual SQLite API producer, copy `saved_field_api_fixture_c025d75.mjs` into the pinned archive's `reports-api/test/` before invoking it: its imports and schema URLs deliberately resolve relative to that actual product test location. Set `SAVED_FIELD_FIXTURE_OUTPUT` to the separate verification JSON path. Only synthetic local data are created.

Saved results:

- `C025D75_BROWSER_MANIFEST.json`: exact input/source tree, asset equality, suite hashes and fixture hashes.
- `c025d75-baseline-lf/publication_chrome.json`, ten screenshots and `c025d75-baseline-lf-run.log`.
- `c025d75-saved-protected/{actual_api_fixture.json,SAVED_FIELD_CHROME.json}`, five screenshots, `c025d75-saved-api-fixture-run.log`, `c025d75-saved-protected-corrected-run.log`.
- `c025d75-workerd-dto/{api_workerd_replay_fixture.json,SAVED_FIELD_CHROME.json}`, five screenshots and `c025d75-workerd-dto-run.log`.
- `c025d75-saved-protected-harness-failure/`: immutable first failure and original instrumentation.

## Scope conclusion

The c025 saved-coordinate read correction passes this frontend/API projection scope. Backend atomicity, full regression, operating budget, protective rollback versions, CI and deployment readiness remain separate gates. Existing S1-P indirect-location/free-text/publication-policy questions are not solved or silently changed by this test.