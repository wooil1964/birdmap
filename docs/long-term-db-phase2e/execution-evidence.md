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
| REPORTS_PENDING_PUBLIC | production 설정 없음(legacy는 키워드·19종 규칙). 운영자가 1로 결정(2026-09-27). 기존 원값은 보존 |
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
- → production toml에 `preview_urls=false`를 넣었고, 기본 모드는 CANONICAL_DUAL_WRITE다(중간 단계만 `--var`로 덮어씀). step 12 이후 legacy 형식 POST가 정본 경로에서 400으로 거부되는지 HTTP로 증명한다(prod-verify http).

## 5. 공식 문서 재확인

| 문서 | 확인일 | 핵심 |
|---|---|---|
| https://developers.cloudflare.com/d1/reference/time-travel/ (갱신 2026-04-21) | 2026-09-27 | 30일(Paid)/7일(Free) 보존. `time-travel info --timestamp`로 bookmark 조회. restore는 제자리 덮어쓰기이고 previous bookmark로 되돌릴 수 있음 |
| D1 limits / batch() | 2026-09-26 (Phase 2D.1) | Phase 2D.1 execution-evidence §7 |
| Turnstile Siteverify | 2026-09-26 (Phase 2D.1) | 5분, single-use, idempotency_key UUID |

**실행일에 다시 확인한다.**

## 6. 코드 검사

- Production 경로 코드(src, tools, wrangler toml)에 staging DB/rehearsal/ledger ID 0건, localhost는 기존 개발 허용 코드만 있음. wrangler toml은 이 시점에는 변경 0이었고, 이후 결정에 따라 §7처럼 수정했다.
- 비밀정보 검사: 142개 파일에서 실제 비밀값 0건. 한 건 일치는 Cloudflare 공개 더미 테스트 키(`1x…AA`)다.
- 회귀(Phase 2D.1 guard 적용 뒤, 코드 변경 없음): 106/32/5/13/17, freeze·backfill 10, captcha 11 모두 PASS. 실행일에 artifact commit 뒤 다시 실행한다.

## 7. 추가 준비 (결정 뒤)

- index.html: capabilities 자동 전환(+35줄 중 기존 Phase 2B UI 18줄 포함).
  - inline script 3개 컴파일 OK, siteData 190.
  - 전환 시험: dual → 켜짐, maintenance·404·네트워크 오류 → 꺼짐.
- production toml: dual 기본값, preview off, peer binding, PENDING_PUBLIC=1.
  - `wrangler deploy --dry-run`으로 두 번들 확인(public 45KB, admin 88KB, ops 동적 import 포함). 배포는 하지 않음.
- migration 고정본: `migrations-main/`(0001·0002·0003), `migrations-ledger/`, 해시 `migration-hashes.txt`.
- 회귀 전체(최종 작업 트리): legacy 106, local 32, protocol 5, gate 13, Phase 2A 17, freeze·backfill 10, captcha 11 모두 PASS.
  - 프론트엔드 JS: 186 pass / 11 fail. HEAD에서도 **같은 11개**가 실패한다(날씨 C01 자료·브라우저 필요 UI 시험) → 기존 예외.
  - Python 조석 baseline은 로컬에 Python이 없어 실행하지 못했다. 조석 자료는 수정하지 않았다.
- artifact 커밋: 브랜치 `phase2e-cutover`, `183cef95bffaeaed80fe04d0b3af4e397957001d`(144파일, 비밀값 0·JWT 형태 0). 커밋 뒤 legacy 106·captcha 11 재확인 PASS.
- 공식 문서 당일 재확인(2026-09-27):
  - Turnstile(갱신 2026-09-16): 5분, 1회 검증, idempotency_key는 UUID.
  - D1 limits(갱신 2026-04-21): batch 문장별 한도, 30초, restore 10회/10분.
  - Time Travel(갱신 2026-04-21).
- push 부작용: index.html 변경이 `update-weather`(push paths)와 Pages를 일으킨다. Worker 자동 배포 없음.
