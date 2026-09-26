# Phase 2D CHECKPOINT

STATUS: PHASE 2D COMPLETE — PHASE 2E NO-GO

Updated: 2026-09-26 (UTC). Phase 2E has NOT started.

## 현재 상태

- Branch: main
- HEAD: d39bf4bf2d7e147b246f867f56567f814eddd4b9
- Local origin/main: 6bf58a583391b174ccd15117ddeaef233010e1ee (fetch 안 함)
- Latest GitHub main: 15c9b192d2b24faaffb9f44a625dcd43d0e30710 (12:36:57Z GET)
- Remote difference: weather/tide JSON 5개, reports code drift 없음.
- 기존 545개 tracked/untracked 파일 SHA256 동일. Phase1/2A/2B/2C·앱·날씨·조석 변경 없음.
- git status: 기존 M index.html, reports-api/src/admin-page.js, admin.js, public.js, shared.js; 기존 ?? docs/, reports-api/local-test/, src/admin-actions.js, src/canonical/, tools/. Phase2D 새 문서는 docs/ 아래 포함.
- git diff stat: 기존 5파일 +109/-218 그대로. commit/push/reset/clean/restore/merge 없음.

## 완료

1. Source of Truth와 실제 Phase2C gate 수정 재검토, 두 읽기 전용 검토자의 교차검토 반영.
2. Production 고정 SELECT·Worker 설정 GET·GitHub GET으로 새 baseline 시작/종료 비교.
3. 새 운영 실측23(approved19/rejected4/pending0), siteNULL5, countNULL8/one15, species 구분자후보0, publicNULL23/승인fallback19, spotNULL23. 미래 N 상수로 사용하지 않음.
4. reports22컬럼, explicit index5, canonical/ledger 없음. 두 production Worker version/binding/preview 설정 동일.
5. 기존 library를 사용한 ephemeral local D1 N22/24/37 시험 PASS, 원본22필드·count의미·재실행0·manifest/partial 거절 검증.
6. Runbook·checklist·recovery·evidence·README 작성. 없는 생산용 도구는 BLOCKED로 표시.
7. 담당5역할 모두 운영자 본인, KST02–04, 사전/정상화 공지, 지연/실패시maintenance 유지 결정 반영.
8. staging 전용 실제 Turnstile widget/브라우저 시험 준비. CAPTCHA 실행 시점 확인이 도착하지 않아 실제 토큰 시험 미실행. 4개 항목을 PASS 처리하지 않음.
9. staging secret과 두 Worker maintenance 복귀, 실제 GET200/POST503/Retry-After60. staging data/schema/ledger digest 불변.
10. production 모든 변경0, Phase2E 시작0 확인.

## 생성/수정 파일

공유 산출물은 docs/long-term-db-phase2d/ 아래 다음7개:
.gitignore, README.md, production-cutover-runbook.md, go-no-go-checklist.md,
recovery-runbook.md, execution-evidence.md, CHECKPOINT.md.

기존 파일 수정0. .local/ 신규 파일은 비공개 측정/시험 준비 및 결과다:
start-manifest.json, preflight.mjs, production-start/end.json, remote-start/end.json,
production-comparison.json, preservation-end.json, dynamic-n-proof.mjs/json,
turnstile-availability.json, create-staging-widget.mjs, staging-widget.json,
staging-browser-control.mjs, browser-server.mjs, browser.public/admin.json,
browser-staging-before.json, final-staging-read.mjs, staging-final.json,
관련 Wrangler log/debug.log. 비밀 파일은 .gitignore로 제외되며 내용을 출력하지 않는다.

## 테스트·실패의 의미

- 동적N22/24/37 PASS (SQL201/218/329, batch67/73/112), 12:18:23Z 완료.
- 마지막 원격 안전 확인: final-staging-read.mjs PASS 12:36:30Z,
  preflight.mjs end PASS 12:37:01Z, hash545/545 PASS 12:37:02Z.
- 최종 문서/링크/credential 미포함/신규7파일 검사 PASS 12:42:18Z, hash545/545 재확인 및 git diff --check PASS. 결과는 .local/document-validation.json.
- 이전 Phase2C remote95/local32/legacy106/Phase2A17/protocol5/gate13 PASS 증거 보존; 이번에 전부 재실행하지 않음.
- Phase2B 기존 조석882cm 대850cm 가정 실패는 사용자 승인된 기존 예외 유지.
- 초기 readonly SELECT notnull 인용 오류400은 수정 후 다시 SELECT 성공(write없음).
- 초기 staging secret put은 최신version이 미배포라 거절, 동일소스maintenance 먼저 배포한 뒤 성공.
- CAPTCHA는 실제 토큰을 발급/소비하지 않았으므로 실패 시험 또는 성공 시험으로 세지 않음.
- 로컬 브라우저 시험 탭/서버 종료. staging widget은 후속 시험용으로 남아 있지만 현재 Worker는 기존 공식 시험 secret 사용.

## 확정한 설계·운영 결정

- Phase2A9테이블114컬럼 유지, v3 peer 대칭 gate 유지, production read는legacy.
- manifest는 frozen N·원22필드·registry·schema·freeze/drain 증거 포함. 현 library 밖 envelope 검증 필요.
- seed captured_at/전체plan 고정; 새 시각 재생성으로 재실행하지 않음.
- schema 공식 d1_migrations 사용. migrations list도 CREATE 가능하므로 이번 Phase 실행 금지.
- restore --json은 확인 생략하므로 human 변경명령에서 제외.
- old NORMAL writer는 v3가 막지 못하며 독립 freeze 필요. 시간 대기만으로 drain 주장 금지.
- 확인된 legacy 금지번식자료는 별도 승인 purge 대상. 기존 unknown은 추정 판정하지 않음.
- 독립 forbidden ledger 및 restore 중 공개GET 격리 필요. core 이전 reports-only 복구 제거 경로도 필요.

## 미완료 / 다음 작업

Phase2D 검토는 완료, Phase2E 실행 준비는 NO-GO다. 자동으로 다음 단계에 착수하지 않는다.

1. 검증된 독립 freeze·구 version/preview 우회 폐쇄·drain 관측 수단 마련 및 staging 재연.
2. 생산용 동적 snapshot/envelope/seed/apply/fullverify/resume 도구와 core-only migration/config 준비·시험.
3. 계정 plan/실제한도·복구기간 확인, frozen N 기준 query/time예산 검증.
4. 실제 브라우저 Turnstile 시험 승인/수동수행 및 CAPTCHA 실패후catch 재조회 분기 계측.
5. legacy purge·reports-only 복구 제거 경로, 독립ledger 저장위치/접근, 조회격리·캐시 범위 검증.
6. 신규 REPORTS_PENDING_PUBLIC=0/1 결정, UI flag 전환/배포 계획, 실제 작업 날짜 결정.
7. 모든 필수 조건 해소 후 새 Go/No-Go와 Phase2E 명시적 승인.

다음 지시가 오면 CHECKPOINT→git status/HEAD→실제파일→evidence와의 차이를 확인한다.
운영자료는 추정 복원하지 않는다. pending CAPTCHA 답변만으로 production 전환을 시작하지 않는다.
staging 시험을 재개할 때는 .local/staging-final.json, staging-browser-control.mjs를 먼저 읽고
현재 maintenance/DB UUID/바인딩을 확인한다. 위젯 재생성 스크립트는 이미 생성 guard가 있으므로 재실행하지 않는다.

## 종료 자원 상태와 금지행위

Production public version 57849940-c4b6-494f-88e9-27ec2e327cd9.
Production admin version 1eebcf4e-e7e0-4b94-bdf2-65c44962c21a.
Production D1 write0, migration0, deploy0, Access/route/secret/binding/freeze0, export/restore0.
Staging final public f47c285a-5bd9-4d42-8ea2-92c3046d343e,
admin91719d81-e187-4863-981a-e91739c14c12, 둘 다maintenance.
Staging Phase2D DB write0; 격리widget1생성/명시deploy5/성공secret설정2(복귀포함).
commit0, push0. Phase2E NOT STARTED.
