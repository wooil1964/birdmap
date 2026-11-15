# PR #94: append and automatic alias integration

Updated against main `1f0f0c4b8b327111b1c4be4060e743871e7cc273` on 2026-11-15.

## Scope

Preserve PR #95's opt-in automatic attribution while adding an explicitly confirmed report ID to an existing group. Keep the group UUID, representative, original membership/order, confirmation metadata and all original reports. Do not revoke/recreate a group to append a report.

The production read-only check found 27 stored members, of which 23 are approved and name-public. Preserve all 27, including the four non-public members; 23 is the public count, not the stored membership length. No production IDs, coordinates, credentials or original payloads are included in this document or the synthetic tests.

## Validation

Synthetic regressions cover a 23-member group plus one explicit append, a 27-member group with 23 public members plus one append, stable representative/UUID, unchanged report rows, audit and publication invalidation, future attribution through all three exact aliases without membership writes, stale CAS rejection, duplicate/cross-group/missing-ID rejection, 200-member cap, protected metadata, authentication and explicit confirmation. The protected report remains absent from the public map when nonbreeding evidence is missing. Existing alias ambiguity, consent/status, feature-OFF and protected-name tests remain in place.

## Separate production approval required

No production D1 writes, migration execution, PR merge, Worker deployment, or environment changes are part of this PR update. Migration 0008 is required before append can operate; without it the action fails closed. Preserve both Workers' existing bindings and publication/writer protections. Automatic alias attribution requires both identity flags on the active public and admin versions; uploaded candidate settings alone do not prove activation.

Before any approved production append, reread the intended active group and report, compare the complete saved membership/representative and collision check, and submit only the one missing ID. Verify stored membership increments by one, the old IDs/order and representative remain intact, only one appended event exists, and public consent/status gates still apply. Species totals must use a union, not add one blindly. Automatic alias attribution is nickname-based, not authentication; retain admin review and disable it on impersonation.
