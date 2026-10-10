# 다음 세션 — F1·F2·F3 독립 검증 완료, 수정 필요

완료 대상: a35b8598d55890e705042e4d6f88621357749d09.
이전 차단: 2e485079a34fa5aeeef09e82f3b996bf2696d978.
최종 원격 main: bf74095adb3bf0b13f1aca31193c8d03cf8ff53f.
임시 merge-tree: 379b0c06bad6a12570e45ed8916ae98f2645a4a7.

최종 보고서는 F123_RECHECK.md, 증거는 results/f123-a35b859. 최초 진행 체크포인트 dbd338b9da6d9ee1f6d69ac160db9adc032006f4. 최종 보고/게시 commit은 git log와 github_receipts.json으로 확인한다.

완료:
- 자동615 pass/0fail/1skip, S2182/21/12, source74/helper23, C1C2·선상80/수치92/Python92/주간10, S1-R171/일반17.
- 고정10/8 22:40의190곳/176후보와 ON/OFF 전체 signature·상위10 불변.
- F1 Node28/Chrome140 통과. F2 same-root Node3pass3fail/Chrome15pass15fail, source30pass30fail·actual loader4pass6fail·live3pass3fail.
- F3 typed70pass7fail(6은F2겹침); 실제DOM의 today forecast 객체 String 및 주간 publication 렌더 TypeError.
- 기존 lifecycle35pass10fail 보존; 안전 기대45와 일치 control10 모두 통과. 기본Chrome245/문자열10, 일반 target/combined E2E55씩 통과.
- 최신 main actual validators190/10640 및 JS current190, actual builder190와 stale control 통과. 자동5blob 보존·제품8blob 일치·충돌0.
- PR 전용CI0/dispatch0. 공개 Worker 현재 version·보호 유지 rollback 버전 미확인.

미완료는 제품 구현자의 보완과 새SHA 독립 재검증이다. 본 역할에는 제품 수정 권한이 없다. 보완 지시는 F2-a 양측 명시적 문자열 발행/PythonJS 일치, F2-b 부적격 혼합root 뒤 동일root 정상교정, F3 parser 밖 String/렌더 객체 예외다. 보고서4~5절의 실패 입력을 유지한다. B 지연예외, 배점/정원, S1-P 정책 임의 추가 금지. P1-A~D 재분석 금지.

재개 순서:
1. AI_WORK_RULES, F123_RECHECK, FINDINGS, NEXT_SESSION 및 새 PR head/diff/보완 보고를 읽는다. git ls-remote origin refs/heads/main refs/heads/fix/p1-s-safety-guards로 확인한다.
2. git fetch는 읽기 전용으로 한다. 정확 새SHA archive·새main merge-tree를 임시 생성하며 review의 역사적 index를 제품 시험에 쓰지 않는다. 자동JSON은main blob을 보존하고 실제main은 병합하지 않는다.
3. 실패 assertion을 삭제하지 않는다. Node28/same-root6/actual loader10/rootitem60/typed77/Python190의20·35/live6, Chromecore245/문자열10/기존lifecycle45+일치10/typed4/today3/5폭 및 자동8suite를 영향 범위대로 실행한다.
4. 고정10/8 22:40은 analysis 작업트리 manifest16·공개11snapshot 그대로 사용한다. 새main 현재JSON은 별도 평가시각을 기록한다. 새 결과 폴더를 만들고 이번 증거를 덮어쓰지 않는다.
5. report/NEXT를 commit/push하고 PR13·Issue9에 같은 본문 게시·exact readback한다. 운영 반영은 별도 사용자 승인 전 수행하지 않는다.

환경:
review = C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
analysis = C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
scripts = <review>/docs/p1-s-review/scripts/f123-a35b859
target = <정확 새SHA git archive>, combined = <새main 임시tree archive>, out = <새SHA 결과폴더>
Python = C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome = C:/Program Files/Google/Chrome/Application/chrome.exe
PYTHONUTF8=1, PYTHONDONTWRITEBYTECODE=1

재현 명령(인자를 절대경로로 대체):
node <scripts>/loader_final_node.mjs <target> <out> <새SHA>
node <scripts>/loader_contractF_node.mjs <target> <out> <새SHA>
node <scripts>/loader_extended_node.mjs <target> <out> <새SHA>
node <scripts>/loader_final_dom.mjs <target> <out> <새SHA> (기본5폭)
node <scripts>/loader_contractF_dom.mjs <target> <out> <새SHA> (기본5폭)
C_GENERATOR_FIXTURE=<review>/docs/p1-s-review/results/f123-a35b859/sparse6h_generated_today.json
node <scripts>/additional_today_dom.mjs <target> <out> <새SHA>
node <scripts>/contract_matrix.mjs <target> <out> <analysis> <combined>
<Python> <scripts>/python_contract.py <target> <out>
<Python> <scripts>/latest_main_validate.py <combined> <out>
node <scripts>/independent_replay.mjs <review> <analysis> <out>

source 시험 일부의 head/main/previous는 metadata 상수라 새SHA로 갱신하고 actual source/hash를 대조한다. 전체8명령·TAP 파일범위는 results/f123-a35b859/execution_manifest.json, 계약/Python은 contract-execution_manifest.json, Chrome은 dom-execution_manifest.json, root 재실행은 root_execution_manifest.json이다. python_runtime_preload/browser_network_isolation은 상위scripts에 있다. 초기 하네스 오류는 initial_harness로 별도 보존했다.

임시 .scratch는 증거 보존 후 정확 절대경로를 검증해 삭제한다. 재실행시 재생성한다. 수정 필요이며 CI 미구축·Worker 현재version/보호rollback 미확인도 운영 선행 조건이다. main병합/Pages·Worker배포/D1/실사용자POSTDELETE/민감원좌표공개 금지. 새 보완 SHA 및 사용자 별도 승인 대기.

게시 완료: [PR #13 최종 판정](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6097679288), [Issue #9 동일 판정](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6097679798). API readback에서 게시 본문 전체가 준비한 본문과 정확히 일치함을 확인했다. 보고서 commit86a93e726096820cc2e9e59228d08176250f6705, 게시 증빙 results/f123-a35b859/github_receipts.json. 새 보완 SHA 및 사용자 별도 승인 대기.
