# Phase 2E 실행 증거 — Preflight (Production 변경 전)

시각은 UTC(2026-09-26 14:59Z = 2026-09-27 00:0x KST). 모든 production 호출은 SELECT/GET이며 `rows_written=0`이다.

## 1. Git

| 항목 | 값 |
|---|---|
| branch / HEAD | main / `d39bf4bf…` |
| GitHub main | `7686c688…` (로컬보다 17개 앞, 날씨·조석 JSON 5개만. DB/API/Worker/schema drift 0) |
| working tree | 미커밋: Phase 2B–2D.1 코드, index.html(+18), docs |

## 2. Production (읽기)

| 항목 | 값 |
|---|---|
| reports | 23 / approved 19 / rejected 4 / pending 0 |
| site_id NULL | 5 (registry에 없는 site_id 0, registry 190개, revision `4a7aba94…`) |
| spot_key | 모두 NULL(23) |
| bird_count | NULL 8, 1 15 |
| species 구분자 후보 / 다종+공유수량 | 0 / 0 |
| public 좌표 | 모두 NULL(23). 승인 19건은 실제 좌표 fallback 대상 |
| name_public × pending_public | 0×0 4, 0×1 8, 1×0 2, 1×1 9 |
| 스키마 | 테이블 reports, _cf_KV. index 5개(dedupe, ip_recent, pending_public, spot_key, status). trigger 0. d1_migrations 없음 |
| public Worker | `birdmap-reports` v`57849940…` 100%. vars: ENVIRONMENT=production. secret: REPORT_IP_SALT, TURNSTILE_SECRET_KEY. D1 b48201cc… |
| admin Worker | `birdmap-reports-admin` v`1eebcf4e…` 100%. vars: ACCESS_AUD, ACCESS_TEAM_DOMAIN, ADMIN_EMAILS, ENVIRONMENT |
| subdomain | 둘 다 workers.dev on, **preview URL on** |
| custom domain | 0 |
| **REPORTS_PENDING_PUBLIC** | **설정 없음** → README 차단 1 |
| Time Travel | `d1 time-travel info birdmap-reports`(읽기)로 현재 bookmark를 받을 수 있음. restore는 하지 않음 |
| 명시적으로 확인된 금지 번식자료 | 운영자가 지정한 것 없음. 추정 판정하지 않음 → purge 대상 0 |

## 3. Migration dependency (분석)

- Production은 d1_migrations가 없다. 전용 디렉터리에 `0001_core`, `0002_system_state`, `0003_captcha_redemptions`만 넣어 적용하면 ledger가 새로 생기고 세 파일만 적용된다(모두 추가형).
- 필수 순서:
  - 0002 → freeze.
  - 0001 → seed/backfill.
  - 0003 → dual-write 활성화. dual 경로는 테이블이 없으면 모든 제출이 WRITE_FAILED.
- 세 파일은 모두 추가형이라 freeze 전에 한꺼번에 적용해도 legacy 동작에 영향이 없다(Phase 2D.1 로컬·staging 확인).
- `wrangler migrations apply`의 파일 단위 원자성은 공식 문서에서 확인하지 못했다 → 적용 뒤 sqlite_schema로 전체 검증하고, 불일치하면 ABORT.

## 4. Legacy unguarded 경로 (분석)

- 코드: `assertWriteGate`
  - NORMAL → legacy 경로(guard 없음)
  - READ_ONLY_MAINTENANCE → 503
  - CANONICAL_DUAL_WRITE → 정본 경로(guard 있음)
- 설정: 두 Worker 모두 `REPORTS_WRITE_MODE=CANONICAL_DUAL_WRITE` + peer 대칭이어야 한다.
- 실제 배포: 새 version이 100%이면서 **preview URL을 꺼야 한다**. 그렇지 않으면 옛 version(legacy NORMAL)의 preview URL로 guard 없는 쓰기가 가능하다. DB gate는 NORMAL에서 열려 있다.
- → cutover 설정에 `preview_urls=false`가 반드시 포함돼야 한다. production 설정 파일은 차단 1 결정 뒤 작성한다.

## 5. 공식 문서 재확인

| 문서 | 확인일 | 핵심 |
|---|---|---|
| https://developers.cloudflare.com/d1/reference/time-travel/ (갱신 2026-04-21) | 2026-09-27 | 30일(Paid)/7일(Free) 보존. `time-travel info --timestamp`로 bookmark 조회. restore는 제자리 덮어쓰기이고 previous bookmark로 되돌릴 수 있음 |
| D1 limits / batch() | 2026-09-26 (Phase 2D.1) | Phase 2D.1 execution-evidence §7 |
| Turnstile Siteverify | 2026-09-26 (Phase 2D.1) | 5분, single-use, idempotency_key UUID |

**실행일에 다시 확인한다.**

## 6. 코드 검사

- Production 경로 코드(src, tools, wrangler toml)에 staging DB/rehearsal/ledger ID 0건, localhost는 기존 개발 허용 코드만 있음, wrangler toml 변경 0.
- 비밀정보 검사: 142개 파일에서 실제 비밀값 0건. 한 건 일치는 Cloudflare 공개 더미 테스트 키(`1x…AA`)다.
- 회귀(Phase 2D.1 guard 적용 뒤, 코드 변경 없음): 106/32/5/13/17, freeze·backfill 10, captcha 11 모두 PASS. 실행일에 artifact commit 뒤 다시 실행한다.
