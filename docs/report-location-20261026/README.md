# Exact public report routing and mobile initial states

The implementation is restricted to existing frontend assets. index.html, siteData, Worker/D1/AWS/Cloudflare/VWorld configuration and the full archive/search implementation are unchanged.

## Behavior

- A site-history species button carries its report ID. Recent-list clicks derive the exact ID from the existing WeakMap witness. Neither opens the archive or changes search input.
- The existing /reports/search public projection must explicitly authorize that exact row and target. /approved root history alone is insufficient for protected/breeding attached rows. Paging uses20-row pages, preserves publication across pages and fails closed after50 pages/15seconds.
- The final fresh publication gate rechecks request token/generation/proof, exact current witness, target/root/history and finite current marker coordinates. No names/date matching, private coordinates, new marker or fallback location is used.
- An independent small popup on the existing marker uses only fresh public species/date/reporter. The original marker popup/directions remain intact. The disposable popup and highlight are scrubbed synchronously on invalidation/removal/close; closing also cancels pending location reads.
- Mobile right menu always starts expanded; recent reports always start as a52px title/count bar. No persistence changes these defaults on refresh. Recent expanded/collapsed/closed modes are separate. Existing site drawers temporarily suppress the recent UI and restore the user's mode and dragged height afterward. Small report cards temporarily collapse it.
- The new mobile layout also covers touch landscape up to1023px wide and500px high. PC1024/1440 and768px portrait touch remain on their existing layout.

## Validation

- Existing frontend regression, including15 exact-ID/protection/race/lifetime tests:509 passed.
- Mobile320x568,375x812,390x844,430x932; landscape640x360,844x390,932x430; PC1024/1440:249 checks passed with real existing public GET responses.
- Selector layout and original width/touch/overlap conditions, including non-touch landscape negative control:15 passed.
- Unit tests also pass actual protected/breeding/hidden rows through the existing server projection (pure local function, no backend writes).

Run with Node24, installed Chrome, and Playwright available to Node (or PLAYWRIGHT_MODULE pointing at its directory):

    node docs/report-location-20261026/verify.cjs

CHROME_PATH selects Chrome; REPORT_UI_OUTPUT selects output folder, REPORT_UI_BASE is the known pre-change Git commit. All external non-GET requests are blocked. The test-only production-Origin/CORS bridge preserves existing public reads for localhost; it is not part of production code or server configuration. The one hidden-proof browser scenario modifies only the local read response and never writes a report.

The earlier docs/mobile-ui-20261026/verify.cjs records the previous version's initially expanded behavior. This script is its current-state successor. Physical Android and post-deployment evidence are recorded separately in the task outputs.
