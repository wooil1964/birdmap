# VWorld tile relay (`birdmap-vworld-tiles`)

`src/worker.mjs` is the source of the relay running in the **separate** Cloudflare account *Birdmap VWorld Isolated*
(`https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles/{z}/{x}/{y}.png`). The VWorld key lives only
in that Worker as the encrypted secret `VWORLD_API_KEY`; it is never in this repository or the browser.

- Accepts only `Origin`/`Referer` `https://wooil1964.github.io`, Korean-area tiles at zoom 6–19, and returns fixed
  text on every error (no key, URL or upstream body is ever returned or logged).
- Limiters: `CLIENT_TILE_LIMITER` 180/60 s per IP, `GLOBAL_TILE_LIMITER` 300/60 s (approximate, per location).
- The page falls back to OSM automatically on tile errors, timeouts or 429s; users can also choose OSM.

There is intentionally no `wrangler.toml` here: a Wrangler login on a maintainer PC may point at the shared production
account. Changes to this relay are deployed only to the isolated account by the reviewed PR #40 tooling.
