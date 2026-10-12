# Active Worker source / Git association — read-only preparation

Reference head: `cf5767b090275221a516e16112d0e569eedb86e7`. Source candidate: `41650e43f80fadb2bfd9f80b18d958862f673551`.

The root auditor downloaded each authenticated active Worker `content/v2` module while deployment GETs before and after remained the same100% active version. This independent audit rehashed those local modules and compiled Git archives of41650e43 andcf5767b with the installed Wrangler4.149.0 / Node24.18.0. All4 explicit `deploy --dry-run --config ... --outdir <local unique path>` commands exited0. No uploads, deployments, network fetch from the behavioral VM, D1 writes or token output occurred. The CLI logs explicitly report dry-run exit; they do not prove that any standby version is uploaded.

| Worker | Stable active version | Active module SHA256 |41650e43 local bundle match |
|---|---|---|---|
| Public |494b97d1-69ab-40f7-bbbf-e8c6e3c5effc|045b544db305deb73a5e745550a613ee10078c918e001045a16549e522e936c4|Exact71,439 bytes|
| Admin |0134cd9a-afce-4176-acfa-7910fbe4790c|0f580392471a7e5d286e45f92ee5c4b86c42533704a648a4de3f7717609cb10b|Exact125,295 bytes|

This establishes source-content equivalence to the candidate commit, independent of missing Git annotations. It does not establish that41650e43 was the unique checkout SHA used by the original deployer; another commit with the same Worker source could yield the same module.

New cf5767b compiled bundle hashes:

- Public: `60919a6801c5e23f37d5765a1bc22d1261e6d924d8364a1a3143c6631c50be71`
- Admin: `62d45b94a767d6e1a8a837b5fe6eacc36a749a7ec189ca482b39b3d99ab941b1`

`summary.json` contains exact commands, source refs, timestamps, exits, module lengths and capability diagnostics. Entire real Worker modules are kept only in ignored local scratch; committed evidence contains hashes and synthetic strings.

## Protection difference and rollback decision

Actual compiled public Worker functions were executed locally with network disabled. In11 accepted synthetic protected new inputs, old active source misses10; new source protects all11. Both old/new reject slash-separated **new input** with SPECIES_INVALID; this must not be counted as an old protection miss or required new acceptance. In12 **stored** protected representations (including slash/LF/CRLF mixtures), old active source misses11; new source protects12/12. New ordinary7 controls have0 false positives. Detailed `s1r-source-behavior.json` records accepted/rejected/protected separately, including `저어새1`, `저어새 1`, `저어새 2마리`, `흰꼬리수리1`, `매1`.

The original two independent-harness failures are preserved: `behavior-old-harness.log` and `behavior-new-input-slash-harness.log`. The correction distinguishes request rejection from accepted disclosure and stored-reader protection; final protection assertions remain explicit.

The active public source lacks the S1-R quantity suffix parser, publication epoch/revision contract, strict publication reads, field row_revision CAS and first-primary read. It still sends public max-age60 on public projections. New public source contains those safeguards and removes max-age60, with shared no-store headers. Neither bundle uses caches.default. The old source already contains canonical transaction_assertions; that alone does **not** imply the new field CAS / latest permission contract exists.

The new admin bundle lacks public-only helper names after tree shaking. This is expected role separation: authenticated administrator mutations use canonical checklists CAS/transaction assertions, and the new shared D1 report triggers atomically advance public revision; the public Worker owns S1-R public projection/authority reads. The local221-report API suite and separate workerd/D1 evidence must remain the behavioral proof of this coupling. The capability token table is diagnostic, not a substitute for these tests or a claim of missing/implemented administrator features.

**The current active public version is not a protection-preserving rollback target.** Reverting to it would restore demonstrated S1-R accepted/stored expression misses and cache/latest-permission gaps even if new DB terminal triggers remain. The prior public version16dae92a is not independently source-proven here and cannot be approved as safe merely because metadata/bindings were previously inspected. Old admin0134cd9a must not be selected as an independently approved paired rollback merely from byte association; protective coordinated release, binding compatibility and DB gate tests are required.

Safe preparation is an **actual uploaded** matched public/admin version pair built from the verified new protective source (or separately tested minimal protective baseline), preserving strict public contract, canonical dual-write, schema, secrets/bindings, public projection and S1-R, CAS/terminal triggers. A maintenance/fail-closed variant may be needed for degraded restoration. Every uploaded version must be re-inspected for module hash/version/bindings and retained with100% activation command before changing traffic. Local dry-run hashes are inputs to that verification, not proof of an uploaded rollback.

Rollback keeps the new D1 schema, publication epoch/revision, deletion/revocation state and original data; do not restore an old DB backup or reset revisions. Safe Page rollback must retain authority lease, route revalidation, dynamic href closure and consent invalidation and refer to the compatible protected Worker pair. Return traffic to a proven protective pair or fail-closed maintenance if normal restoration cannot be proved.

## Scope

Existing public records with count-suffixed protected names can change protection interpretation under S1-R when read; this is a demonstrated parser correction, not a new S1-P blanket approved-report policy. No real report row/species/coordinate payload was queried or altered here. Historical max-age60 responses, already delivered coordinates and old open legacy tabs require root transition/cache controls; this source audit does not claim they have been erased or that new controls are deployed.
