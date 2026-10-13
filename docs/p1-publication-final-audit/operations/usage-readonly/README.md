# Read-only account analytics and Free-plan cost baseline

Queried2026-10-12T10:45:13Z using existing Wrangler OAuth in memory. One official GraphQL **query**, zero mutations; one Worker inventory GET. HTTP200, GraphQL errors[], no retry/new token/permission request. D1 SQL0, D1 writes0, Worker writes0, user data changes0. No request logs, query strings, names, coordinates or private records were requested.

Window:2026-10-11T10:45:13Z–2026-10-12T10:45:13Z. See `20261012T104513-analytics.json` for exact endpoints/query. D1 uses datetimeHour buckets; partial endpoint buckets and dashboard window timing can differ. Workers use datetime filters. These are analytics aggregates, not transactional point-in-time counters. A rolling24-hour result is **not** the current UTC-day quota balance.

## Proven and user-provided facts

The **user confirms Free plan** and reports the birdmap DB's recent24h baseline:1230 queries,58000 rows read,496 rows written,1.44MB storage. This input is explicitly user-provided, not measured or API-verified by this subagent. Its exact endpoints and rounding are unavailable.

This separate API retrieval returns:

| Scope | Read queries | Write queries | Rows read | Rows written |
|---|---:|---:|---:|---:|
| Account,2 active DBs |1071|271|62111|665|
| birdmap-reports |1064|173|56381|538|
| Other DB |7|98|5730|127|

No claim is made that dashboard58,000/496 and these results refer to identical endpoint buckets; therefore the difference alone is not an inconsistency or data loss. Query count and row-read count are different metrics.

| Workers scope | Requests | Runtime errors | Subrequests |
|---|---:|---:|---:|
| Account total |1242|0|205|
| birdmap-reports |985|0|18|
| birdmap-reports-admin |129|0|139|
| Other scripts combined |128|0|48|

All4 aggregate status groups are received below the10,000 limit; D1 has2 groups, likewise complete. The authenticated script inventory GET confirms **6 Worker scripts**, including both target Workers. Script count is not version count, traffic, a subscription lookup, or additional per-script request allowance. GraphQL runtime errors0 does not prove application-level4xx/5xx responses0; a Worker that returns a503 normally may be classified success. No live new-publication error rate or post-deployment CPU performance has been measured.

## Two distinct Free quotas

Official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests) and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) establish account-level100000 Worker requests/day and10ms CPU/invocation. Worker daily request limits reset at midnightUTC. Public/admin/other scripts consume the same account limit;6 scripts do not provide6 separate100000 allowances.

Official [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) establishes **account-wide5000000 rows read/day**,100000 rows written/day and5GB total storage. It resets at midnightUTC. All DB usage counts, including the independently measured otherDB5730 reads/127 writes. Queries are not billed directly by count: rows scanned/read are the read metric. Free exhaustion returns errors, rather than implicitly authorizing a paid plan. Neither subscription upgrade nor billing change was performed or is approved by this analysis.

The metrics query follows official [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) and [Workers GraphQL tutorial](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/); the D1 datetimeHour filter and fields were additionally checked in installed Wrangler4.149's existing read-only metrics query.

The measured rolling24h account baseline corresponds to1.242% of the Worker request cap and1.24222% of D1 read cap; D1 writes0.665%. These percentages describe the retrieved rolling usage against daily limits, **not exact remaining UTC-day allowance**.

##5-second authority polling sensitivity

Pure arithmetic, not a load test or prediction of traffic: each continuously foreground tab adds at most a5-second scheduled HEAD every interval,720/hour or17280/day, before list pre/postflight, startup, revalidation, GPS, route, history or contributor traffic. Actual sharing/scheduling can change achieved frequency. Browser tabs/devices are separate clients.

The previous local synthetic D1 anchor measurement was96 rows read and0 rows written per HEAD (95-object synthetic catalog). That is a **synthetic scenario**, not measured production per-HEAD cost; new production schema and plans may differ. At that96-row assumption:

| Continuous tabs,24h | Additional HEADs | Additional D1 rows read | Account requests including1242 baseline | Account reads including62111 baseline |
|---|---:|---:|---:|---:|
|1|17280|1658880|18522|1720991|
|2|34560|3317760|35802|3379871|
|3|51840|4976640|53082|5038751|
|5|86400|8294400|87642|8356511|
|6|103680|9953280|104922|10015391|

At the illustrative96-read cost,3 continuous tabs already exceed the D1 cap while Worker requests remain below100000;6 tabs exceed both. This is not a concurrency capacity guarantee or prediction: arbitrary continuous24h use, unchanged other traffic and that synthetic query cost are assumptions. Normal short visits can be far lower. Extra non-HEAD traffic makes this table undercount total usage.

With total foreground tab-hours H and measured production anchor row cost r, estimated additional scheduled HEAD load is720H requests and720Hr rows. Add current UTC-day account-wide non-HEAD usage, then compare each quota separately. The existing user DB-only baseline cannot substitute for the account total; API retrieval now verifies otherDB usage in this window.

Deployment readiness must not use current low old-Worker traffic to claim a new5-second protocol is sustainable. Actual production anchor/meta cost, CPU/request limits, foreground duration/expected traffic and fail-closed behavior at exhausted quotas remain separate operational checks. Account GraphQL can track the totals without reading user data. Do not weaken the approved lease/freshness contract or subscribe to Paid automatically just to pass a gate.

## State and scope

The user currently requests validation before deployment; no traffic changes were made. Root reports CI6d green and protective standby4 uploaded, but this subagent did not re-query those results and does not treat them as part of this analytics proof. Source-association evidence and root operational manifest remain their own proofs. This document neither authorizes nor records deployment completion.
