# PR #13 독립 검증 재개

## 체크포인트

첫 review checkpoint 직전 상태. 현재 브랜치 review/p1-s-pr13. 이 문서의 저장 커밋은 `git log -1`로 확인한다(자기 커밋 SHA를 문서 안에 순환 기록하지 않는다). 대상 product source는7eb6764다.

완료와 판정은 FINDINGS.md 및 PROGRESS.md를 먼저 읽는다. 기존547pass/1skip 전체 반복은 새 product 변경이 있을 때만 한다. PR head가 추가되면 영향 범위 재검증한다.

## 정확한 다음 작업

1. `/root/p1s_protection`이 임시 `.../.codex/visualizations/2026/10/08/01a1190e-204e-7790-ad48-3431ee07838f/pr13_e2e`에 만드는 합성 API E2E script와 JSON을 검토한다. Worker/Turnstile/telemetry를 CDP interception+DNS로 격리해야 한다. 실제 운영 API 쓰기는 금지다.
2. 344/375/768/1024/1440 폭의 화면·제보·현장소식·본인삭제·길안내·오류/캐시/늦은응답·서버보호변경을 검사하고 신구 source 구분으로 기존 S1-P 이슈를 분리한다. 가능하지 않은 항목은 성공으로 기록하지 않는다.
3. GitHub PR metadata와 origin/main을 다시 읽는다. product head가 바뀌면 actual head와 재실행을 기록한다.
4. 결함 R1/R2 및 R3 구체적인 보완 요청을 최종 PR13/Issue9 댓글로 게시하고 댓글 본문·URL·반환ID를 results에 저장한다. 아직 게시하지 않았다.
5. docs/p1-s-review만 명시적으로 stage한다. `.scratch/`의 제품 copy와 archive는 포함하지 않는다. 임시 폴더 삭제 전에 resolved absolute target이 review/docs/p1-s-review/.scratch 이내인지 확인한다.
6. commit/push 후 원래 checkout과 PR 제품 소스 hash가 그대로인지 확인하고 사용자에게 수정 필요 판정과 구현자 보완 후 재검증 조건을 보고한다. 병합/배포하지 않는다.

## 자료·재현 명령

작업 트리: C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
분석자료: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

```powershell
node docs/p1-s-review/scripts/pr13_s1_independent.mjs . docs/p1-s-review/results
node docs/p1-s-review/scripts/pr13_s2_actual_matrix.mjs . docs/p1-s-review/results C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/p1-s-review/scripts/pr13_s2_python_validator_matrix.py . docs/p1-s-review/results
node docs/p1-s-review/scripts/independent_replay.mjs . C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap docs/p1-s-review/results
node .github/scripts/compare_p1s_recommendation.mjs 35141c04d4fd152982b1f4683d5b7a6f4f7514e5 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e
node docs/p1-s-review/scripts/verify_provided_compare.mjs docs/p1-s-review/results
```

환경변수 PYTHONDONTWRITEBYTECODE=1, PYTHONUTF8=1, PYTHONIOENCODING=utf-8. 주간테스트는 `node --import ./docs/p1-s-review/scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs`, BIRDMAP_PYTHON에 위python절대경로를 지정한다. Chromium 기존테스트는 CHROME_PATH 지정과 `--import ./docs/p1-s-review/scripts/browser_network_isolation.mjs`로 Worker DNS를 차단한다. 자세한 실행범위는 로그 첫test명을 대조한다.

## 남은 정책

S1-P 승인 후 전면 비공개·간접 위치·캐시 상태변화 정책은 별도 설계/승인을 받는다. 배열/92점/가점16/4312정원은 이번 승인 범위 밖이며 운영 적용하지 않는다.
