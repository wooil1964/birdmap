# PR #13 R4 independent actual-function contract audit

Target 8ccb248faa2c5c7b5a6019d12e19e21031169460. Before 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c. Main b0975cad9f3112af38cc286a892bf6f06722ce12.

## Scope and method

Read R123_RECHECK, actual index diff, new weekly extraction NAMES, new DOM fixtures, weather generator, validator and workflow. No product code, guard, branch or network API was modified. Exact Git source functions are extracted unchanged, explicit frozen Date and synthetic memory inputs only. Archive index CRLF-normalized hash equals target Git blob. New weeklyTodayWeather is present in the latest test extraction list and calls the existing own/finite/required-data eligibility contract before assigning state. weatherScoreAllowed, renderTodayPanel and popup resolver remain unchanged.

## Independent execution

- Existing actual-product S2 matrix: 182/182; special routes 21/21; popup contract 12/12. Fixed normal scenario: 176 candidates and top fields exactly match the saved design baseline.
- Additional actual-product contract: 103 cases, 100 pass and 3 retained R5 extreme-format mismatches. Original R4 normal fallback mismatch now passes.
- Normal tide today-only scores 0,92,92.5,100: card and popup effective score display match; 16 bonus preserves rank16,108,108.5,116. Scores above100 are allowed only for internal rank.
- Python actual validator synthetic matrix: 49 document cases each today/week (98 actual calls). Acceptance counts today20/week21, not a test pass count. Contracts unchanged from previous audit: canonical required-data checks agree; trim/Unicode/optional-week-wave omitted key differences remain.
- Additional old/new freshness comparison: 30 route rows (15 cases each tide/ordinary). Reference-time metadata in 6 tide fixtures is newly promoted to an eligible display, although the actual popup remains reference or previous saved.

## New R4 source-contract issue: optimistic current state

index.html:3880-3882 weeklyTodayWeather calls weeklyTodayRecommendable and then unconditionally assigns dataCurrent:true,scoreEligible:true,stale:false. That raw contract checks metadata/required values/stale flag, but not generation timestamp parsing, future generation, completed schedule, or equality of raw date and forecast date. Actual storedWeatherState at2066-2082 checks all those time/source conditions.

At 2026-10-10 11:00 KST, site14, forecast today12:00 and qualified high tide12:00, same-day generation05:41, future generation12:30, malformed/missing generation, or raw date today but forecast yesterday each gives:
- Old1bd candidate/rank/final selection retained, card unknown.
- New8ccb candidate/rank108/final[14] retained, card92 with dataCurrent:true.
- Both popups show unknown, with today_reference or previous_saved and scoreEligible:false.

The ordinary today fallback already fabricated the same state before this PR revision; do not call its candidate behavior a new regression. The tide fallback's new display promotion is new. Explicit previous_saved, stale:true, false/null/missing eligibility and previous-date candidate remain excluded. This is not a comparison of a different-day tide card with today's popup: named same-day fixtures use the identical noon forecast and tide. No forecast/tide safety gate was patched.

Operational frequency is unknown. A smooth normal 3h forecast timeline would usually select early morning for the05:41 run; once the10:17 refresh is overdue those early future-tide candidates would have passed, so that exact synthetic05:41/noon fixture was not demonstrated as an ordinary generator event. Do not assert actual operational occurrence.

To test generator admissibility, actual build_site_result was independently called with queued early target06:10 and a sparse6h API array [12:00,18:00]. It generated own eligible true, stale false, score92, forecast12:00, generation06:10. Actual Python validator accepted it. Unchanged generator output injected into actual JS at11:00 produced the same new card92/popupreference mismatch. A sparse6h upstream response and queue delay are synthetic conditions, not observed external API events. This demonstrates compatible actual builder/schema data, not the probability of occurrence.

Minimal correction direction: use the actual common storedWeatherState provenance computation, or an explicitly equivalent shared computation, and preserve scoreEligible:false for schedule/future/malformed/date reference states. Do not globally allow raw objects or relax weatherScoreAllowed. Whether such a reference fallback remains a candidate is a separate existing candidate policy question; at minimum it must not assert a currently verified display contrary to the popup. Add DOM regression tests for scheduled-delay/future/malformed metadata and generated sparse6h fixture, retaining reference fields, normal0/92/92.5/100, tide90/91 and fixed190/176.

## R5 deployment risk assessment

Extreme400-digit formatted wind/rain/wave still pass regex, and Number() is Infinity. This is an actual synthetic schema gap retained from1bd, not caused by the R4 helper. The matrix records failures rather than passing them. JStrim accepts vs Python not; Arabic digits reverse acceptance; absent optional weekly wave differs.

Current generator uses value_at float plus math.isfinite and canonical numeric formatting. A400-digit upstream numeric string becomes Infinity and is rejected before formatting; no normal generator occurrence was proven. Public reports API cannot rewrite the weather JSON. Thus R5 can be a separately tracked P2 defense task with finite numeric parsing and explicit ASCII/schema normalization, rather than a PR-specific unsafe recommendation blocker on present evidence. Do not introduce arbitrary new wind cutoffs or ecological scores.

## Files and commands

All files are synthetic/source-only under this temporary directory. Actual execute:

node pr13_r123_actual_matrix.mjs <target8ccb archive> <this output directory> <analysis worktree>
node pr13_r123_extended.mjs <target8ccb archive> <output> <analysis> <review/results/r123/baseline7eb_actual_matrix.json>
python pr13_r123_python_validator_matrix.py <target8ccb archive> <output>
python sparse6h_generator_actual.py <target8ccb archive> <output>
node r4_freshness_actual.mjs <target8ccb archive> <output> <analysis>

Source copies and JSON/TAP are preserved. Root independently owns browser DOM, complete regression, full190 ON/OFF, merge simulation, final report and publishing. No protected original coordinate data is saved here.
