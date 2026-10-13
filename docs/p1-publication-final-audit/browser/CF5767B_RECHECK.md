# Latest combined-source independent Chrome verification

- Product input: `cf5767b090275221a516e16112d0e569eedb86e7`.
- Exact Git tree: `3147c1e53a0aa2b6ef37767fb63347dcbf615736`.
- Integrated main input: `58e1a222845680d5217677242ac1df5ff9bf665b`.
- Independent review checkout remains detached at `71177330fd1d45c64f3bef632cf1f43286c304cd`; the tested product is supplied explicitly from the newer commit. No checkout reset or product edit was performed.
- Actual Chrome executable version: `154.0.8037.98`.
- Canonical archive run completed at `2026-10-12T10:32:11.521Z`; process exit code **0**.

## Inputs and command

The first archive inherited Windows `core.autocrlf=true`, so its JSON assets contained CRLF. That run passed 241 conditions; the byte mismatch against Git blobs was investigated and found to be only newline serialization. Both that run and its original manifest remain in `cf5767b-full-archive`.

For the final canonical-byte run, a separate archive was built with:

```text
git -c core.autocrlf=false archive --format=tar --output=.tmp/chrome-cf5767b-full-archive-lf.tar cf5767b090275221a516e16112d0e569eedb86e7
tar -xf .tmp/chrome-cf5767b-full-archive-lf.tar -C .tmp/chrome-cf5767b-full-archive-lf
```

The existing `publication_chrome_final_r4.mjs` was copied unchanged as `publication_chrome_final_cf5767b.mjs` into this independent review tree. Runtime variables were set to:

```text
PUBLICATION_TEST_INDEX_REF=cf5767b090275221a516e16112d0e569eedb86e7
PUBLICATION_TEST_ASSET_REF=3147c1e53a0aa2b6ef37767fb63347dcbf615736
PUBLICATION_TEST_ROOT=<review-tree>/.tmp/chrome-cf5767b-full-archive-lf
PUBLICATION_TEST_OUTPUT=docs/p1-publication-final-audit/browser/cf5767b-full-archive-lf
CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
node docs/p1-publication-final-audit/browser/publication_chrome_final_cf5767b.mjs
```

`INPUT_MANIFEST.json` verifies byte equality of archived index, today/week weather, today/month tide and notices against `git show <exact-SHA>:<file>`. Every checked asset matches. The full archive supplies the remaining tracked dependencies from the same commit. HTML SHA-256 is `d3488318be9dc3696946753fc0c18fa26392c3b519c1467552603883641616d3`.

## Actual result

**241 pass, 0 fail, 0 skip, 0 not run**, at widths **344, 375, 768, 1024, 1440 px**. The preexisting 15 Chrome risk conditions are a subset of these 241, with **0 unsafe**; they are not counted again.

- Actual Leaflet initialized all 190 public static site markers and synthetic dynamic report/field markers.
- Approved report and field navigation offered Kakao and TMAP; verified launch URLs were checked without opening native apps.
- Auxiliary click and context-menu routes contained no coordinate URL.
- Revoked/hidden/deleted responses, older authority epochs/revisions, refresh, request reversal, two independent client pages and network uncertainty failed closed.
- A delayed preexisting authority request did not authorize a later navigation.
- HEAD transit consumed the five-second lease; local OS clock rollback did not prolong permission.
- Late GPS callbacks, one-shot/manual/watch GPS and permission closure retained the required navigation guards.
- Contributor name consent withdrawal and unknown authority cleared the client cache, visible tab and modal.
- Explicit later reauthorization, reappearance, network recovery and normal expiry remained supported.
- Browser runtime exceptions: **0**. Requests to actual operating Workers: **0**. External non-GET requests: **0**.
- Network counts: 78 permitted local GETs, 197 dependency CDN GETs, 266 blocked unrelated requests.

Ten screenshots were recorded. The 344 px and 1440 px normal screens were visually inspected: field popup, chooser, both app buttons, recent reports and field box are present. The base-map tiles are intentionally blocked by the test network guard and therefore gray; this does not indicate failure to initialize Leaflet. The 344 px floating chooser overlays part of the underlying recent panel while open; its four controls fit within the viewport, matching the existing transient chooser layout.

## Scope and limits

This is a local Chrome test of actual frontend code with synthetic in-page API data. It does not certify production D1 atomicity, CDN POP consistency, deployment state, physical GPS or external app execution. Those gates remain separate. Synthetic authority changes take effect at validation/postflight boundaries; this does not establish instantaneous revocation of already delivered information.

The script was inspected for Ubuntu CI portability. `CHROME_PATH` is provided by the new workflow; path checks accept POSIX separators, and Node 24 provides the required WebSocket implementation. This source review is not a CI success result. Actual Linux Actions status must still be checked independently.

No product files, operational APIs, production D1 or user data were modified by this verification.