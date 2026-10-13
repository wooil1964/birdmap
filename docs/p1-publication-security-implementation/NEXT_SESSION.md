# 재개 지침

## 완료와 정확한 상태

제품/시험 checkpoint `f7aee08f8bab6371cdffb8e2099d85b51a76765e`. 이후 문서 커밋을 포함한 실제 마지막 head는 `git log -1`과 Draft PR head를 확인한다.
작업 branch `codex/p1-publication-security-guards`, 경로 `C:/Users/김진호/.codex/worktrees/p1-publication-security-guards/birdmap`.
설계 `c128666203bb5c483258b8231d0eb410c38e38f9`, main `25e1fbae781c19fad53e770e4396fc625865f3b3`, PR13 `b12e20c1b6d856a021898a0c1c9221b30393a221`, PR16 `245298981e27f88ac26bad8b46d819a7df899c86`.

FINDINGS.md / FINAL_MANIFEST.json / results/browser/README.md / server-audit/FRONT_HARNESS_REVIEW.md를 먼저 읽는다. 구현 및 필수 local 검증 완료. 초기 실패를 반복하거나 기존 P1A~D 분석을 다시 시작하지 않는다.

## 검증 명령

1. `git fetch origin` 후 main/PR heads 고정. docs-only head가 product checkpoint와 동일 코드인지 확인.
2. `node docs/p1-publication-security-implementation/scripts/integration.mjs f7aee08f8bab6371cdffb8e2099d85b51a76765e 25e1fbae781c19fad53e770e4396fc625865f3b3`. 실제 main merge 금지. 임시 archive를 `.tmp`에 재생성한다.
3. `node docs/p1-publication-security-implementation/scripts/source_proofs.mjs`와 `noninterference.mjs`.
4. Chrome 환경: CHROME_PATH=`C:/Program Files/Google/Chrome/Application/chrome.exe`, PUBLICATION_TEST_INDEX_REF=`a599638f3a0b8d95b367b94eaa4eb098127abba3`. `node docs/p1-publication-security-implementation/scripts/publication_chrome.mjs`.
5. local D1 proof는 기존 cache runtime `C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules`를 인자로 실행. 패키지 설치·운영 접속 없음.

## 제출 / 남은 작업

전용 branch push 완료. 새 Draft PR #17: https://github.com/wooil1964/birdmap/pull/17 . 생성/head/body/draft를 읽어서 검증하고 채팅에 첨부했다. 생성 문서 checkpoint f63b52a7c56ed3c7b2bec6dffb541ca46571712a; 이 제출 원장을 저장한 실제 최신 docs-only head는 git log -1 / PR head로 확인한다. 기존 PR13·16의 head/body/updatedAt 불변을 확인했다. 독립 검증자가 정확 새 head를 재검증한다.
운영 승인 전 실제 schema/13trigger SQL·paired source/version/bindings·safe rollback versions·CDN hard purge/bypass·구client전환·5초lease/poll·4초timeout을 확인한다. 물리GPS/외부앱/운영POP 미실행을 유지한다.

## 금지

운영 D1/실사용자 변경, Worker/Pages upload/deploy/rollback, main merge 금지. 코드와 canonical/epoch/delete 기록을 되돌리는 롤백 금지. 민감 원자료·비밀정보를 저장하지 않는다.
