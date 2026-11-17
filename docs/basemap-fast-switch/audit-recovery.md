# VWorld A-1–A-4 recovery follow-up

Scope: `assets/birdmap-basemap.js` and regression coverage. No map data, coordinates, Worker settings, provider URLs, cache policy or deployment changes.

- A-1: a repair blocked by zoom settling, animation or wheel debounce keeps one 300 ms wakeup. Movement still waits for its end and the existing 750 ms quiet period. No request starts while zooming.
- A-2: the supplied OSM layer repairs only failed visible tiles through native Leaflet replacements. Repairs are limited to two in flight and eight starts per rolling ten seconds, with 5/15/30/60 s fast pauses, then 15-minute probes. Network return wakes non-exhausted failures after 750 ms. Hidden/offline/moving/removed layers do not start repairs. Native completion precedes transport cancellation; timeouts, removal and destroy clear tasks and listeners. Successful tiles are retained.
- A-3: after a due canary succeeds, its round includes other visible failures still awaiting their initial jitter. A failed retry's backoff is never bypassed. VWorld retains two concurrent repairs, eight starts per rolling 60 seconds, and one canary per rolling 60 seconds across primary types. Twelve holes therefore require at least two request windows.
- A-4: four fast VWorld retries retain the existing 60/120/240/480 s pauses plus 0–15 s jitter. Exhausted tiles stay eligible for probes at 15 minutes plus jitter after each failure. Attempt ordinals and request budgets survive network, visibility and provider changes; the fast sequence does not restart. The separate whole-layer fallback policy is unchanged.

## Local checks

```powershell
node --test .github/scripts/test_basemap_controller.mjs .github/scripts/test_vworld_worker.mjs .github/scripts/test_vworld_relay_lambda.mjs
node --test .github/scripts/test_site_data_guard.mjs .github/scripts/test_location_popup_guard.mjs
python -B .github/scripts/test_basemap_contract.py
python -B .github/scripts/site_data_contract.py --export <output.json>
node docs/basemap-fast-switch/faults-chrome.mjs . <result.json> local-a1-a4
node docs/basemap-fast-switch/audit-recovery.mjs . <audit-result.json>
```

Set `CHROME_PATH` to installed Chrome. `BIRDMAP_LEAFLET_DIR` optionally supplies locally cached Leaflet 1.9.3 JS/CSS; the harness verifies their pinned hashes. The audit harness intercepts every tile and blocks other external requests. `RECOVERY_CASES` optionally selects comma-separated scenario names.

Audit scenarios cover actual 0.6/1.0/1.1 s zoom gaps, a 10-second network outage with explicit OSM and automatic fallback, OSM interruption/timeout recovery, twelve transient failures with **real time and native Math.random**, and four fast failures followed by two slow probes. The network-outage and twelve-failure cases use real time. Zoom, long-probe and OSM cancellation/timeout cases use a coherent 50× monotonic test clock; actual zoom animations and input gaps are unchanged. Results include the controller SHA-256, request logs, clock details, current-view coverage and uncaught page exceptions.

The audit harness is a separate local test because its real-time failure recovery adds several minutes. Existing `faults-chrome.mjs` still runs the original partial-repair/interruption invariants in CI; new deterministic controller cases are also part of the existing CI test glob.

## CI discipline

Verify all workflow files and Pages configuration before publication. This change uses one new branch with no existing PR: push after local validation, verify zero branch runs, then create one Draft PR targeting main. The sole PR workflow has two jobs (`gps-browser`, `regression`); those jobs belong to one workflow run. No workflow dispatch, rerun, additional push or Ready-for-review transition is needed. Do not merge or deploy.

Remaining limits: this verifies local browser behavior and request budgets, not live Worker limiter configuration or service availability. Whole-layer recovery exhaustion, normal pan/zoom traffic, the existing 2,048 unresolved-record bound and actual mobile hardware remain outside this patch.
