# 재개 지침

## 현재 상태

직전 checkpoint HEAD: `188b390c2cddeb8dd8d92abd651d428feb95726b`. 이 문서는 다음 checkpoint commit에 포함한다. 실제 마지막 commit은 `git log -1`로 확인한다.
작업 경로: `C:/Users/김진호/.codex/worktrees/p1-publication-security-guards/birdmap`.
제품 편집자는 root만, 하위 검증 담당은 test/docs/results만 수정했다.

## 이어서 할 일

1. PROGRESS.md와 results/browser/README.md, results/server-audit/README.md를 읽는다.
2. GPS 보강 이후 프런트/Chrome 원장 실제 pass/fail/skip를 확인한다. 기존 원형 실패를 삭제하지 않는다.
3. 제품/시험 checkpoint 이후 `git merge-tree --write-tree HEAD b12e20c1b6d856a021898a0c1c9221b30393a221`을 임시 tree로만 검사하고 archive에서 회귀를 실행한다. 실제 merge/main 수정 금지.
4. `node docs/p1-publication-security-implementation/scripts/run_suites.mjs <root> <out> front|reports|proxy|weather|tide`.
5. PR13 `.github/scripts/compare_p1s_recommendation.mjs`의 tree-hash 비교로 고정190/176 ON/OFF 전체 signature 확인. 정상 입력에서 동일해야 한다.
6. latest main/PR heads를 다시 확인한 후 증거/미실행/잔여운영조건 문서화. 별도 branch push 및 독립 검증용 Draft PR 생성/attach/readback. 기존 PR13/16은 변경하지 않는다.

## 금지

운영 D1·실사용자 자료 변경, Worker/Pages upload/deploy/rollback, main 병합 금지. 민감 원자료·비밀정보를 저장하지 않는다.
