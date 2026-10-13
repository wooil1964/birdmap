# UTC-today quota-window supplement

This supplements and preserves the original rolling24h document and `20261012T104513-analytics.json`.

Clock tool verified `2026-10-12 10:50:33 UTC`. One read-only GraphQL query requested `2026-10-12T00:00:00Z` through that verified upper bound; HTTP200, no errors. D1 SQL0, mutation0, uploads/deployments/writes0. There was no inventory repeat. Exact query, command input, bucket caveat and operations counts are in `today-utc-20261012T105033.json`.

| UTC today scope | Rows read | Rows written | Read queries | Write queries |
|---|---:|---:|---:|---:|
| Account |31388|450|603|176|
| birdmap DB |28281|375|599|117|
| Other DB |3107|75|4|59|

Workers account687 requests/runtime errors0; public570, admin52, other65. Runtime error0 does not prove normal application-level503 responses0.

| Metric | Free daily cap | Observed UTC-today usage | Cap minus observed | More conservative prior-rolling inclusive budget |
|---|---:|---:|---:|---:|
| Worker requests |100000|687|99313|98758|
| D1 rows read |5000000|31388|4968612|4937889|
| D1 rows written |100000|450|99550|99335|

Free plan is the user's confirmed input. Caps and midnightUTC reset are sourced in the original README from official Workers/D1 documents. The last column subtracts max(today,previous rolling24h) and deliberately includes yesterday's usage, so it is a stricter planning number than the today-only balance. It is not actual remaining quota.

**Neither budget column is a certified remaining lower bound.** Analytics may lag; Workers adaptive counts may be sampled; the current D1 datetimeHour bucket is partial; new traffic continues after the query. Without a proven bound on unseen/new usage, cap-minus-observed cannot guarantee that many further operations are available. The JSON therefore leaves `certifiedRemainingLowerBound:null`. Calling it a precise daily allowance would overstate the evidence.

D1 start00:00 aligns with its datetimeHour boundary. The10:00 bucket is included because its timestamp is at or before10:50:33 and currently contains processed partial-hour usage; no hour-end completion is implied. The Worker query uses datetime filters. All returned groups are below10000 and fully received. The requested today window is exact; aggregate ingestion/bucket resolution remains limited.

## Remaining part of this UTC day versus a full day

At the verified clock,13h9m27s remains before2026-10-13 00:00UTC (09:00KST). A5-second nominal scheduled HEAD interval corresponds to9473.4 intervals; use9474 as a phase-rounded planning count per continuously foreground tab until reset, excluding startup/list pre/postflight/GPS/routes/history/contributors and normal future usage. This is arithmetic, not observed future traffic.

Under the earlier **synthetic96-row/HEAD** scenario,9474 HEADs add909504 reads/tab until reset:

| New foreground tabs retained until reset | Nominal added HEADs | Nominal added D1 reads | Today-baseline projected Worker requests | Today-baseline projected D1 reads |
|---|---:|---:|---:|---:|
|1|9474|909504|10161|940892|
|5|47370|4547520|48057|4578908|
|6|56844|5457024|57531|5488412|

Thus this partial-day scenario differs from the full24h repeat scenario in the original report, where3 continuously active tabs at96 rows/HEAD exceed5million. Today5 tabs appear below that cap in the simplified partial-day arithmetic, while6 exceed it. Neither is an approved safe concurrency limit: r is not measured production cost and extra/current/future account traffic is excluded. The calculation must not be used to weaken the approved authority lease or skip CPU/rate/error verification.

Rolling24h historical baseline, current UTC-day aggregate, hypothetical recurring full-day cost and partial-day projection are separate quantities. All other DBs and Workers share their corresponding account-level limits.
