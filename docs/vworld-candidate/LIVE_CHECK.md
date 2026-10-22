# VWorld secret read-only diagnosis — 2026-10-22

Latest result: [registered Pages browser validation](VALIDATION_20261022.md)
passed with one real WMTS image and 15 real candidate-map tiles on 2026-10-22.
An induced VWorld error also returned the map to actual OSM tiles. The workflow
below documents the earlier Actions-path diagnostic; it is not evidence that
the later domestic Pages browser test failed and need not be repeated.

Draft PR #40 remains isolated from main. This workflow never publishes Pages,
changes runtime configuration, sends production reports, or writes to Workers.
The repository secret `VWORLD_API_KEY` is never retrieved into local tooling.

## Current boundary

Manually run `publication-security-ci.yml` on
`review/vworld-default-keyless-20261021` with `vworld_live_check=true`.
The secret job requires that event, input, and exact branch; ordinary PR CI
skips it. The ordinary regression job is skipped for a secret-only dispatch.
The job has `permissions: {}`, no checkout, external action, installation,
cache, file output, artifact, or deployment. Python uses only the standard library.

The revised probe makes two keyless requests: the official WMTS guide on
`www.vworld.kr` and `/` on `api.vworld.kr`. Then it makes at most one Base WMTS
request with the registered origin Referer. Only if an internally validated
256 x 256 Base PNG is returned may one unrelated-origin control follow.
Failure never triggers a retry or a second header variant. If the keyless API
connection cannot establish verified TLS, the secret request is skipped.

Each request creates a direct TCP socket and uses `ssl.create_default_context`
with certificate and hostname verification. HTTP writes to that same verified
TLS socket. An overridden connection method forbids implicit reconnects.
Configured proxies are not used, redirects are not followed, and debug logging
is off. Reads are capped at 2 MiB plus one overflow-detection byte in memory.
Output is restricted to finite configuration/transport enums and response
status, allowlisted MIME, and PNG/JPEG magic. No URL, key, arbitrary header,
body, reason phrase, traceback, HAR, or tile file is emitted. The secret is
removed from the process environment before network access.

Verified TLS distinguishes this path from a configured HTTP proxy or a web
fetch tool's gateway. It identifies the trusted TLS endpoint for the hostname;
it cannot identify an internal load balancer/backend or rule out a trusted TLS
intermediary. HTTP 502 after verified TLS is not proof of a key error. Root and
guide HTTP 200 do not prove tile service health. A 256 x 256 PNG can also be a
provider error image; framing checks are not a visual map inspection.

## Official path and independent service checks

The [official WMTS guide](https://www.vworld.kr/dev/v4dv_wmtsguide_s001.do)
was read in a real browser on 2026-10-22. It documents the template
`https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{tileMatrix}/{tileRow}/{tileCol}.{tileType}`.
Base is PNG; the existing `/Base/8/100/218.png` suffix follows that template.
The [official TMS guide](https://www.vworld.kr/dev/v4dv_tmsguide_s001.do)
uses the distinct `/req/tms/1.0.0/` path. No undocumented alternate host is used.

At 12:22:54 KST, independent local direct HTTPS checks of the API root, WMTS
guide and TMS guide each returned 200 / text/html with hostname-verified TLS.
The web fetch tool returned 502 for the WMTS guide while the browser and direct
connection read it successfully. That tool result does not establish an origin
outage. The public notice board showed no current October 22 outage notice;
absence of a notice does not establish tile availability.

The user's October 22 consultation explicitly confirms development keys remain
usable during operation review. The management-screen observations supplied by
the user are issue date 2026-10-21, expiry 2027-04-21, status development /
operation review, registered URL `https://wooil1964.github.io/birdmap/`, and
WMTS/TMS selected. These are user-observed account facts, not independent proof
of request authentication. Pending review is not treated as a blocking reason.

## Browser authentication and key supply

The Actions Referer is manually supplied. It is not a request from an actual
Pages browser document. The summary always keeps
`actual_pages_browser_auth=not-executed` and `domain_restriction_verified=false`.
An unrelated-origin failure can be a service error rather than enforcement.

Direct WMTS necessarily includes the key in visitor tile URLs, browser Network,
and Leaflet memory. GitHub secret storage protects the delivery pipeline but
cannot hide a browser-delivered key. The current reviewed runtime config stays
empty; no key is embedded in source or a Pages build. Broadening the allowlist
or adding a wildcard is outside this diagnosis.

Default [strict-origin-when-cross-origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
normally sends `https://wooil1964.github.io/` and omits `/birdmap/` on cross-origin
HTTPS requests. VWorld's actual registered path/origin matching and rejection
on unrelated origins remain to be verified. A registration-screen URL alone
does not establish enforcement. A real browser test on the registered Pages
origin must be recorded separately after valid tiles and key handling are settled.

## Earlier executions and regression evidence

[39713091262](https://github.com/wooil1964/birdmap/actions/runs/39713091262)
and [39713445784](https://github.com/wooil1964/birdmap/actions/runs/39713445784)
made four secret requests each. They found HTTP 502 / one transport failure,
no valid PNG/JPEG, and uploaded zero artifacts. Their 502 source was inconclusive.
The revised diagnostic must not be described as a repeat of those conditions.
The latest bounded run and final CI are recorded in the PR and follow-up report.

Before this revision, head `84e32e9` passed
[general CI 39713859345](https://github.com/wooil1964/birdmap/actions/runs/39713859345),
Chrome/Edge synthetic VWorld 48/48 each and island 25/25 each. These do not count
as live tile authentication. Independent current-state checks re-established
229 identical site records and exact main HTML restoration after removing the
two basemap additions (normalized SHA256
`c9d7785bd3dab6f8c075e2ac4f25564939d266976eb3504ca9815d286f1f6001`).
API/Worker/data are unchanged; main uses OSM. Six islands' food/lodging/KSA,
protected-species publication controls, weather/tides, recommendations,
reports, search and directions remain outside this workflow-only revision.

Fresh focused frontend tests passed 343/343, API 371/371, weather proxy 36/36.
Python checks passed 137 with one existing skip; share pages are current at 229,
SEO checks report 194 indexable pages / 196 sitemap URLs. Actual Pages browser
authentication, live map imagery, mobile GPS/pinch and map-app launching remain
unverified. No merge or production deployment is part of this work.
