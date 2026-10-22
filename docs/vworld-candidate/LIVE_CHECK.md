# VWorld secret read-only check — 2026-10-22

This check is confined to Draft PR #40's review branch. It does not merge main,
publish Pages, modify runtime configuration, or send reports to production APIs.
The key remains in the repository Actions secret `VWORLD_API_KEY`.

## Execution boundary

Use the existing `publication-security-ci.yml` workflow on
`review/vworld-default-keyless-20261021`, with boolean input
`vworld_live_check=true`. Existing PR/default manual runs retain the regression
job; the secret job requires manual dispatch, that input, and that exact branch.
The existing workflow path is already present on main, so registering a new
workflow on main is unnecessary.

The isolated job has `permissions: {}` and no checkout, installation, cache,
artifact, or deployment steps. Its inline Python uses the secret only in memory
and makes four GET requests for the same Base WMTS tile. It rejects redirects,
disables environment proxies, reads at most 2 MiB plus one overflow-detection byte, and never prints a URL,
raw header, response body, or exception string. Output contains finite metadata:
scenario, numeric status and size, whitelisted MIME, sniffed image format,
dimensions, and image framing checks. Neither the key nor a real tile is saved.

The candidate path ends in `.png`; format is determined from the response bytes,
not that extension. PNG framing/CRC/compressed-stream checks and JPEG framing
and SOF dimensions are observations, not full pixel decoding or proof of map
content. A 256×256 image could still be a provider error image.

## Four observations, separate from browser authentication

1. No Referer.
2. Manually supplied registered full URL `https://wooil1964.github.io/birdmap/`.
3. Manually supplied registered origin `https://wooil1964.github.io/`.
4. Manually supplied unrelated origin `https://birdmap-auth-negative.invalid/`.

The job fails if the registered-origin probe has no valid image response, or
either negative control returns one. Failure does not by itself identify an
authentication error. Conversely, a negative control's missing tile can result
from unrelated HTTP/service failures, so output always keeps
`domain_restriction_verified=false` and `actual_pages_browser_auth=not-executed`.
No manually set Referer proves a request from the registered live page.

Direct WMTS includes the key in visitor image requests and browser Network.
Repository secrets cannot hide a key once it is delivered to that browser.
Default cross-origin HTTPS referrer policy normally sends only the origin;
`/birdmap/` can be omitted. Do not broaden registration to a wildcard to make a
test pass. Check the account's allowed URLs, key status/expiry/quota and the
provider's origin/path matching rules, then separately test an actual registered
page/browser request before any deployment decision.

The user's 2026-10-22 VWorld consultation permits/recommends using the development
key before the same key transitions to operation. This is user-confirmed
guidance, separate from technical authentication evidence.

## Sources and status

- [GitHub manual workflow event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)
- [GitHub secret security](https://docs.github.com/en/actions/reference/security/secure-use)
- [Browser referrer policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
- [VWorld API index](https://www.vworld.kr/dev/v4apiRefer.do); the linked WMTS
  guide was unavailable during this review, so its exact current origin/path
  rules are not claimed as independently verified.

The [first manual run](https://github.com/wooil1964/birdmap/actions/runs/39713091262)
on `1ded7a4` executed all four requests and each returned HTTP 502. The job failed;
no tile success, domain restriction, or browser authentication was established.
The first version did not inspect HTTP error bodies, so their MIME and image
format were unobserved. The [metadata follow-up](https://github.com/wooil1964/birdmap/actions/runs/39713445784)
on `e1c427d` preserved the same four-request boundary. No-Referer, registered-origin
and unrelated-origin probes returned HTTP 502 with 15-byte bodies, sniffed format
`other`, no valid image header, and normalized MIME `other` (raw MIME not exposed).
The registered-full-URL-header probe had a transport failure with no HTTP status.
The job failed. Neither run established server-side tile authentication, image
success, provider domain enforcement or actual registered-page browser success.
Both manual runs uploaded zero artifacts and skipped the general regression job.
No further real-key request is made automatically. Final CI status and follow-up
are recorded in [Draft PR #40](https://github.com/wooil1964/birdmap/pull/40).
The separate pull-request CI skips the real-secret job.

Offline verifier checks passed for PNG, JPEG returned at a `.png` path,
unrestricted negative-control tiles, XML with HTTP 200, redirects, exceptions,
oversized responses, missing secrets, and malformed image framing. Deliberately
hostile fake values and exception messages did not appear in captured output.

Chrome 155.0.8059.85 and Edge 155.0.4283.62 each passed 48/48 synthetic VWorld
checks and 25/25 island checks at 320/344/375/768/1024/1440px. Each run observed
zero unhandled exceptions, production Worker requests, or external non-GET
requests. These use synthetic credentials/tiles/Worker responses. Initial
restricted-network attempts failed CDN initialization; the same source passed
after public CDN access was permitted.

PR CI run `39713049418` passed all 463 frontend tests but failed one 1440px
island interaction check (24/25). The native details click had not settled
before the next keyboard toggle; product data and HTML were unchanged. The
island browser runner now waits for a stable hit-testable summary before real
pointer input and awaits the actual native open/close state after every click
or Enter. It never forces the state or removes an assertion. The synchronized
runner passed Chrome 25/25 and Edge 25/25 again. Latest remote CI is reported
in the PR, rather than treating the earlier failed run as a full pass.

The existing 229 sites, six islands' food/lodging/KSA, protected coordinates,
weather/tides, search, recommendations, directions and OSM fallback are outside
this change. Removing the two approved basemap HTML insertions still exactly
matches main `8397053`; API, Worker and data files are unchanged. Focused
protection/search/tide/recommendation/weather tests passed 233/233, and Python
island/archive contracts passed 13/13. Real mobile devices and map-app launching
remain unexecuted. Full CI status is reported separately from local checks.
