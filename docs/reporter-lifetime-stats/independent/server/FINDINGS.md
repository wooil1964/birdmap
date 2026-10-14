# Issue #21 independent server contract audit

- Candidate audited: e2603e0f4236fa74755ba8b7c11b211ef1603dbc.
- Main baseline: 1bac2450d408d949249ad5170dceee594ab19a0a.
- publication.js SHA256: 013734a44b428d8c20253351829464848bb5ae58fac15d0a6d7547c55c0a149e.
- Scope: source review + local native SQLite tests only. No operating API, user data, migration, upload or deployment actions. Root remains sole product editor.

## Independent executions

| Command/scope | PASS | FAIL | SKIP | Exit | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| Node 24 --test explicit sorted reports-api/test/*.test.mjs (18 test files) | 320 | 0 | 0 | 0 | full-suite-20261014-095928 |
| reports-api cwd Node 24 --test, exact CI discovery | 322 | 0 | 0 | 0 | ci-discovery-20261014-100032 |
| Independent extra native SQLite scenarios (v2) | 10 | 0 | 0 | 0 | native-extra-20261014/native-extra-v2.log |

The CI-discovery count adds file-level checks for test/fixture-writer.mjs and test/helpers.mjs, not two additional behavioral assertions. Do not add 320 and 322. The extra scenarios overlap security contracts, and are evidence beyond (not another full suite added to) CI.

The helper named fakeDb uses real node:sqlite SQL and atomic BEGIN/COMMIT, plus strictWriterDb. It is not a handwritten SQL response stub.

The v1 extra script accidentally compared two nonexistent nickname inputs for the absent/private oracle scenario. v2 explicitly seeds PRIVATE_NICKNAME with name_public=0 and supersedes that scenario. Both originals and receipts remain preserved; only v2 is claimed as the final 10/10 result.

## Contract findings

1. publication.js:69,110 places the new route inside the existing primary batch contract. No unprotected legacy handler exists. A missing contract cannot return counts in either required=true or required=false mode.
2. publication.js:74 rejects repeated context parameters, missing/blank/overlength/control nicknames and malformed source context. Bound SQL prevents query injection; exact BINARY comparison preserves case and trailing-space distinctions. No account identity is invented.
3. publication.js:94 applies the approved/name_public/nonempty predicate to both lifetime rows and the source witness. History checks the exact eligible row ID and nickname; monthly checks membership in the existing month predicate. A revoked specific witness is rejected even if another row with the same name remains public.
4. publication.js:89 uses the actual existing splitSpecies function, distinct Set cardinality and raw row count. Multi-species rows count as one report. Sensitive/hidden consenting approved rows contribute only numbers, as approved by the Issue predicate; no S1-P policy is added.
5. API body contains exactly speciesCount, reportCount, publication and serverTime. It does not echo nickname, species strings, report IDs, coordinates, notes or dates. Missing and private source results are the same generic 404. Approval/consent mutations between HEAD and batch are 409 due to the actual revision trigger.
6. Existing reports AFTER UPDATE trigger covers all changed fields. The new route performs SELECT only; no schema migration, writer-fence, CAS, administrator handler, publication anchor semantics or coordinate data change is needed.
7. Native extra checks confirmed same-name grouping, two-number projection, BINARY distinction, actual nonconsenting-name oracle equality, preflight/batch race rejection, specific witness revocation, another valid witness, status invalidation, correct removal of rejected rows and no-store/record preservation.
8. Source context is a public membership witness, not a secret capability. Publicly available report IDs/month names do not constitute private authentication. A caller can read aggregate stats for names already exposed by existing public lists; that is the approved function. No bulk nickname search route was added, and private-name existence is not disclosed. General read-only request abuse is an inherited availability concern; these source checks are not a distributed rate limiter. No unsupported claim of complete brute-force prevention is made.

## Front-end source review (execution owned by root/browser audit)

The current implementation binds counts to publicationFetch + publicationDataAllowed and request/generation/current owner checks, clears the modal/counts during publicationInvalidate, closes on Esc/owner removal/popup close, and does not retain a nickname/stats cache after close. This is consistent with fail-closed and stale-response defense. Actual five-width Chrome results are separate evidence, not claimed here.

## Result

PASS for the server contract and local independent server tests at the candidate SHA above. No server-side release-blocking privacy/permission bug found in this audit. This is not an operating deployment approval by itself: exact final SHA CI, Chrome, safe rollback and actual deployment checks remain root-owned gates.