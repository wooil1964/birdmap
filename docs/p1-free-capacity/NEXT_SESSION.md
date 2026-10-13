# 다음 세션 정확한 재개 지침

## 작업 기준

작업트리 `C:/Users/김진호/.codex/worktrees/p1-free-capacity/birdmap`.
브랜치 `codex/p1-publication-free-capacity`.
마지막 제품 commit `3d42910cb0cea8a5e79c2d57d068c91b86b18332`.
문서 commit은 `git log -1`로 확인한다. 제품 기준c025d75,PR17 원head9f9 그대로. main 최신 확인07680616.
먼저 AI_WORK_RULES.md 및 이폴더 DESIGN/FINDINGS/PROGRESS를 읽는다. 이전 P1분석/감사전체 반복하지 않는다.

## 완료와 미완료

f87 SQL힌트 실측23행,5c 복구 새primary/전체batch72pass/native15pass. 9b 자동734/0/1;5cAPI253새실행,비API483source불변. normal190/176/signature ON/OFF 유지. 최신main076 결합 충돌0/자동6JSON보존. 과거10/12현재validator실패는별도미해결.
9b Chrome17/1의normalrestore approved0field1readytrue를 실제 발견했다. 3d needsRefresh 수정은 같은세대정상4목록 모두true에서만해제한다. 이후 freshHEAD poll은partialready이어도전체복구를요구한다.
아직3d Chrome/프런트 최종결과와 재측정 budget을통과로보고하지않는다. docs server/client/integration 및 독립reviewtree docs/p1-free-capacity에 새진행자료가 있을수있다. source/tar/db/node_modules는제품branch증거로복사하지않고합성JSON/log/독립probe만복사한다.

## 다음 정확한 작업

1. `git status --short`, usage get_usage_limits, 새origin/main/PRheads조회. 제품/운영금지유지.
2. 실제Chrome3d복구전후·10/20명65초75ms·344/375/768/1024/1440폭 결과와원형실패를확인. coalescing시험에서2payload전제를단순삭제하지말고같은세대공유후freshpostflight변경차단/새세대2payload역전의별도보안계약시험을유지.
3. `node --test reports-api/test/publication-security.test.mjs` →72. 전체API253. 새index `.github/scripts/test_*.mjs` 실제파일목록으로프런트359 영향회귀. 보호B6/terminal/CAS/nonce/GPS/consent/canonical 코드불변확인.
4. `integration/run_capacity_regression.mjs`는고정자료현재validator exit1을별도로보존한다. 3d+076 merge-tree와자동JSON보존/고정190176을추가검사한다. latest_main_capacity.mjs는최신자동4종scope와필수7?가정에주의하고기존전제실패보존.
5. finalChrome LOAD_COMPARISON의실제endpointcounts/exposure와native23/144/24/144/60을연결. baseline Worker1242/read62111/write665와별도user D1query1230을혼동하지않고10/20×1h8h계산. 10분3목록타이머(75ms샘플밖)와freshHEAD sharing범위, cold+80읽기/request,높은RTT/지터refetch를명시. 20명8h는이론HEAD만115200으로여전히Free불가.
6. 남은failure/unrun을0으로바꾸지않고최종FINDINGS/manifest/명령/next를갱신. 전용branch에stage선택commit/push. 루트 .tmp-free logs/.tmp scratch를git add .로묶지않는다.

Node24: `C:/Program Files/nodejs/node.exe`; Python: `C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`; Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`.
독립Chrome는 PUBLICATION_TEST_INDEX_REF를정확SHA, PUBLICATION_TEST_ROOT를동일Gitarchive, PUBLICATION_TEST_OUTPUT을새출력dir로지정하여이전감사결과를덮어쓰지않는다. 10/20cohort동시에다른Chrome부하를돌리지않는다.

## 중단 조건

가용usage window의100-usedPercent최솟값이5%이하면즉시현재단계/마지막SHA/명령/미완료실험을저장하고commit/push 후정지한다. 운영승인요청전정지. main병합,PR13/16/17제품변경,Workerupload/활성화/rollback,Pages,운영D1,실사용자자료,유료전환금지. 현재활성민감좌표위험은사고로단정하지않고별도보류한다.
