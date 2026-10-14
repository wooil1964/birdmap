# PR #24 original CI evidence

Run [38525333687](https://github.com/wooil1964/birdmap/actions/runs/38525333687), attempt 1, job 115724250437 succeeded. The untouched job-log HTTP response bytes and full run/job/artifact/checkout-commit metadata are preserved in this directory; SHA-256 values and line-numbered count proof are in ORIGINAL_CI_EVIDENCE.json.

- PR head: `519b4bd18a55bb11ed8e0f6a53e18e691b5afc82`
- Actual CI checkout: `2edbe6ab22880184ef855c1184aee3330244f734`
- Checkout parents: `efe1c1b97b8f2da0e52ce45bedce031c915ed522` (CI base main), then PR head.
- Checkout tree: `d449c6977de8c78461120194fb64fc59c6bf3dde`
- Original log: 396,201 bytes, SHA-256 `f4d49a4ad6cd18fe4f2b80fb27e5a558a4e1be99ecb0ac438b05f884646f4ed5`.

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Front | 400 | 0 | 0 |
| Public/admin reports API and SQLite | 322 | 0 | 0 |
| Weather proxy | 36 | 0 | 0 |
| Python weather | 60 | 0 | 0 |
| Python weekly weather | 11 | 0 | 0 |
| Python tide | 21 | 0 | 1 |
| Python shared cards | 11 | 0 | 0 |
| Publication Chrome | 242 | 0 | 0 |
| Reporter statistics Chrome | 65 | 0 | 0 |
| Native D1 fence | 13 | 0 | 0 |
| Native D1 CAS | 10 | 0 | 0 |
| Counted total | 1191 | 0 | 1 |

The seven specifically requested suites total 1088 PASS / 0 FAIL / 0 SKIP. The remaining Python suites add 103 PASS / 0 FAIL / 1 SKIP. This is execution evidence from the original synthetic-merge run, not a newly rerun suite or proof of any later latest-main combination.

The signature step invokes `node .github/scripts/publication_ci_signatures.mjs . HEAD b12e20c1b6d856a021898a0c1c9221b30393a221` and prints 190 sites / 176 candidates for both reports modes. Its output `allSignatureEqual: true` must be interpreted against its actual relaxed assertion implementation; this CI evidence alone does not establish unchanged date/time/type/safety or ID sets.

GitHub artifact metadata/digests are preserved, but this subtask did not download/extract the ZIPs. No CI rerun, product edit, deployment, operational API/D1 access, or test expectation change was performed. GitHub credentials were used only in memory and are absent from saved evidence.
