# PR #24 patched full-CI original evidence

Run [38539112245](https://github.com/wooil1964/birdmap/actions/runs/38539112245), attempt 1, job 115769205193 succeeded; all 21 job steps succeeded. Untouched raw HTTP job-log bytes and full REST run/job/artifact/checkout metadata are preserved here. Previous CI evidence remains untouched in the parent directory.

- Patched PR head: `6195c357e76201fee6625155b29c6148f73feef1`
- Actual checkout: `8d73af5c64b79a0a28c53fec5889f5ec2157d6a7`
- Checkout parents: CI base main `efe1c1b97b8f2da0e52ce45bedce031c915ed522`, then patched PR head.
- Checkout tree: `82e40ae22355075af3092fbbc4e16a0a456e1942`
- Original log: 420,607 bytes, SHA-256 `8c68dc8fd64fbb667a5cdb36d81decc5ae8254fa332936dc97ef7313fcc3c941`

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Front | 435 | 0 | 0 |
| Public/admin API and SQLite | 322 | 0 | 0 |
| Weather proxy | 36 | 0 | 0 |
| Python weather | 60 | 0 | 0 |
| Python weekly weather | 11 | 0 | 0 |
| Python tide | 21 | 0 | 1 |
| Python shared cards | 11 | 0 | 0 |
| Publication Chrome | 242 | 0 | 0 |
| Reporter statistics Chrome | 65 | 0 | 0 |
| Native D1 fence | 13 | 0 | 0 |
| Native D1 CAS | 10 | 0 | 0 |
| Counted total | 1226 | 0 | 1 |

Requested seven suites: 1123 PASS / 0 FAIL / 0 SKIP. Python adds 103 PASS / 0 FAIL / 1 SKIP. Front increased by 35, front TAP IDs 144–178: 1 positive normal case, 9 old-gate negative controls, 18 same-ID mutations, 1 candidate membership constraint, 5 seasonal prefixes and 1 notice/tide priority case.

Both signature modes print 190 sites / 176 candidates with sameIdPayloadExact and independentSelectionExact true, baseline b12e20c1b6d856a021898a0c1c9221b30393a221. Assertion adequacy is covered separately by the main audit. Counts alone do not authorize deployment or prove a later latest-main combination.

Artifact metadata/digests are recorded; ZIPs were not downloaded/extracted. No CI rerun, product edit, PR change, operational API/D1 access or deployment was performed. Credentials remained only in memory.
