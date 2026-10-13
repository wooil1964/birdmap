# Independent visible expiry review — baseline evidence

- Baseline source: c060f505ab95e5a3854f0e1be77fd8214de6b126 (git show exact index.html).
- No product edits; only this new evidence/harness directory was written.
- Harness: visible_expiry_review.mjs; actual Chrome + Leaflet at 375 and 1440px.
- Run3: before-c060-20261013-3/VISIBLE_EXPIRY_MANIFEST.json.
- Exit code1: main4 PASS /4 FAIL /0 SKIP, supplementary0 PASS /4 FAIL.
- Operating Worker requests0; external non-GET0; browser exceptions0.
- Source timers remain unchanged: MAX_AGE=5000, POLL_MS=5000. A synchronous task crosses the real lease deadline so a first publicationAllowed() access observes expiration before queued expiry-timer cleanup. This is a detection-time assertion, not an idle event-loop cleanup SLA.
- At approximately5003ms, Allowed=false but precise report and field marker/store data, popup reporter, fieldCard nickname and navigation chooser remained.
- A later permission failure/invalidation cleared marker/store but the already-open fieldBody card nickname remained. This is inside the authorized sensitive DOM removal scope; no production disclosure incident is asserted.
- New normal revision recovers authorized markers on both widths (E4 PASS).
- Historical old8 is not rewritten: it depends on hidden-timer recovery and branches to only4 assertions after hidden restoration is fixed. This suite independently obtains visible normal data and always executes8 main assertions.
- First2 harness attempts failed preparation because a bootstrap shared approved DTO still held a default reporter. They are not product failures. Run2 preparation snapshot is preserved in before-c060-20261013-2/visible-before-375.json. Run3 waits for pending bootstrap reads to settle; no assertion was removed or weakened.
- Original620second audit was not rerun.

## Rerun
Set PUBLICATION_TEST_INDEX_REF to exact40SHA, PUBLICATION_TEST_WIDTHS to375,1440, and PUBLICATION_TEST_OUTPUT to a new unused directory under this expiry-review directory. Run node visible_expiry_review.mjs. Assertions and fixture remain unchanged between SHAs. Output records exact source SHA and index/harness SHA256. Do not represent working-source execution as committed-source execution.

## Scope limits
Desktop has no GPS watch; mobile replays captured late callback. Unknown-permission behavior is synthetic. No native app, physical GPS, operating D1, live report, live private coordinate or load request is used. Operating deployment BLOCKED remains.

## Exact committed-source recheck complete
- After source38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd, exit0.
- Main8 PASS /0 FAIL /0 SKIP; supplementary4 PASS /0 FAIL /0 SKIP.
- Before4/8 and supplementary0/4 became8/8 and4/4 with identical harness SHA256 and assertions/fixtures.
- After age approximately5003ms, first Allowed=false synchronously removes exact-coordinate stores, dynamic Leaflet layers, popup reporter, fieldBody nickname, navigation chooser and mobile GPS guide.
- Captured late mobile GPS callback and failed fresh permission route check leave data closed.
- Valid newly verified current revision restores normal markers;190 static sites stay present.
- Operating Worker requests0, external non-GET0, actual browser exceptions0.
- Source/index/harness hashes are verified against exact git objects and saved in SOURCE_RECEIPT.json.
- No old8 assertion was deleted or reclassified as passing. This independent8 is separate.
- No product edits or new production requests. Detection-time semantics and physical GPS/native app limitations remain as described above.
