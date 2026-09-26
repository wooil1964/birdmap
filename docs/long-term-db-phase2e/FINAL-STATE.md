# Phase 2E FINAL-STATE

**PHASE 2E PRODUCTION CUTOVER: COMPLETE** (2026-09-26T22:43Z = 2026-09-27 07:43 KST)

| 항목 | 최종 상태 |
|---|---|
| Production D1 | `birdmap-reports` b48201cc…, d1_migrations 0001_core/0002_system_state/0003_captcha_redemptions |
| system_state | NORMAL, generation 2 (freeze 22:32:36Z → unfreeze 22:35:29Z) |
| reports | 25 (legacy 23 + native 2), 승인 19 / 반려 6 / 대기 0 |
| canonical | raw 25, checklists 25(legacy_reports 23, native 2), sightings 25, reviews 2, audit 2, sites 190, backfill_runs 1 |
| captcha_redemptions | 2 (native 2건과 1:1) |
| 투영 동등성 | reports 25행 = canonical projection 25행(22필드) |
| public Worker | `birdmap-reports` 9cea851c-5b4d-4295-83b0-e900c0cddc0e, CANONICAL_DUAL_WRITE, preview off, PENDING_PUBLIC=1 |
| admin Worker | `birdmap-reports-admin` d800f33a-f2b7-4f4f-8825-1a9a0a7aaadf, CANONICAL_DUAL_WRITE, preview off, ops 경로 꺼짐 |
| legacy guard 없는 경로 | 도달 불가(코드·설정·HTTP: legacy 형식 POST → 400 NON_BREEDING_CONFIRMATION_REQUIRED) |
| 운영 페이지 | origin/main c6518013 이후. capabilities로 새 형식 자동 전환 확인 |
| safety ledger | `birdmap-safety-ledger` 925e0fd9-e402-4725-872d-fe3afc3d77fd, events 0 |
| recovery point | B0 = 000001da-00000000-000050f2-ba7f25c789083d4b7affe640fa82a1b9 (22:30:20Z, cutover 전) |
| staging | 두 Worker READ_ONLY_MAINTENANCE, GET 200 / POST 503 |
| 이전 Worker version (rollback 대상) | legacy: public 57849940…, admin 1eebcf4e…. maintenance build: public 254cc69f…, admin 1e069df3… |
