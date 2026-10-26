# Mobile map UI validation

Phone presentation is scoped to 700px and below in the two existing loaded map assets. The original index.html, siteData, map runtime configuration, Workers, Lambda and databases are unchanged. The actual Leaflet popup node is presented as a bottom sheet, preserving history/weather requests and statistics ownership.

Run the manual browser regression with Node 24, installed Chrome and Playwright available to Node (or set PLAYWRIGHT_MODULE to its installed directory):

    node docs/mobile-ui-20261026/verify.cjs

MOBILE_UI_OUTPUT selects a screenshot/results folder (default .ci-results/mobile-ui). MOBILE_BASE_REF optionally selects the known pre-change Git ref for the desktop comparison.

The test uses existing public production GET responses through a test-only Origin/CORS bridge. It blocks all external non-GET requests and never creates reports or photos. This bridge is test code only; production origin checks are unchanged. Tests cover 320x568, 375x812, 390x844 and 430x932, two-by-two reports, unclipped text, close/reopen, expansion, CDP touch dragging in both directions, search/filter interaction, all four basemaps, directions, statistics, site history, viewport restoration and zoom/fullscreen hit targets. PC controls are compared at 1024 and 1440px in the same OSM state. Screenshots and JSON results are written to the output folder.

Existing frontend regression: 497 passed, zero failures, using CI's PYTHONUTF8=1 and PYTHONIOENCODING=utf-8 plus CHROME_PATH. Full required security CI remains a merge prerequisite. Physical Android validation is tracked separately; browser touch emulation is not a physical-device result.

Final local mobile run: 139 checks passed, including all four requested widths. No JavaScript page errors. Desktop geometry/text comparisons passed at both widths.
