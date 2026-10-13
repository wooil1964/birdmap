# 다음 세션 재개 지침

## 기준과 중단 상태

작업트리: C:/Users/김진호/.codex/worktrees/p1-free-capacity/birdmap
브랜치: codex/p1-publication-free-capacity
마지막 제품 SHA: 3d42910cb0cea8a5e79c2d57d068c91b86b18332
직전 문서 SHA: a0b8543b1a5a71b963357eeac1db5fa5d7fac837. 이 파일을 포함한 최종 체크포인트는 git log -1로 확인한다.
기준 제품c025d75, 최신 확인 main07680616, PR13b12e20c/PR162452989/PR179f9e9be의 제품 head는 변경하지 않았다.

AI_WORK_RULES.md, DESIGN.md, FINDINGS.md, PROGRESS.md, FINAL_MANIFEST.json을 먼저 읽는다. 이전 P1분석과 감사를 반복하지 않는다.
사용량 primary96%/secondary93% 사용으로 최소 잔여4%에 도달했다. 사용자5%중단지시에 따라 새 작업을 중지하고 증거를 저장했다.

## 완료된 작업

SQL HEAD cold103/warm23 실제 workerd 측정. 위치 힌트만 보관하고 매번22 guard를 실제 검증한다. 5c 복구는 새 first-primary session에서 전체 state/payload batch를 재실행한다. publication72/72, native15/15.
3d needsRefresh로 일부 목록만 복구되는 결함을 해결했다. 최종 프런트359/359, fresh HEAD20/20, 복구 계약14/14. 전체 영향 검증736/0/1은 변경 없는124개 기존 실행을 포함하며736 전체 최종SHA 재실행으로 과장하지 않는다.
S2 182/21/12, S1-R171/일반종17, 고정190곳/176후보 ON/OFF 전수 signature 유지. 최신main 임시 결합 충돌0/자동6JSON 보존.
Chrome10/20 부하18/18, 수정전 복구0pass/5fail→수정후5/5, 새 계약16/16, 복합 작업8초여도5초 lease폐쇄1/1, 현재 실제합성API DTO B6 170/170.
원형241의239pass/2fail과 과거 만료DTO70pass/100fail은 삭제·기대값변경하지 않고 별도 계약/현재 생성자료로 대조했다.

## 판정과 남은 불확실성

BLOCKED — 운영 승인 요청 전 중단. 같은UTC quota day의20명8시간은5초HEAD만115200회로Free100000/day 초과. 선택4750ms 공칭121264, warm/timer/계정 합산159840요청/4281012읽기행.
10명8시간 warm 모형78994요청/2136518행도 운영 cold빈도·CPU·모바일RTT/P95·DB성장·상호작용이 미확인이므로 운영승인이 아니다.
과거10/12 고정JSON 현재날짜 validator 실패는 별도 미해결이다. 최신main 실제10/13 정상배치 통과는 다른 입력이다. 기존 활성Worker 보호누락 위험은 실제사고 증거와 구분한다.

## 다음 정확한 작업

1. git status, 최신 원격과 PR head, 사용량부터 확인한다. 최소잔여<=5이면 저장 후 정지한다.
2. 새 사용자 지시가 있는 범위만 진행한다. 현재 로컬 최소 보완·통합 검증·용량 비교는 완료됐다. 20명8시간의 하한은 SQL만으로 해결할 수 없다. 5초상한/primary/nonce/fresh postflight/unknown폐쇄를 임의 완화하지 않는다. 새 구조나 트래픽 정책은 별도 지시 전 구현하지 않는다.
3. 상세 명령과 종료 코드는 server/PRIMARY_RECHECK_5C03.md, FINAL_FREE_BUDGET_RECHECK.md, 독립 budget JSON/Python, integration/INDEPENDENT_RECHECK.md, client/FINAL_CLIENT_RECHECK.md 및 각 manifest/log를 사용한다.
4. 실제Chrome 재현 시 PUBLICATION_TEST_INDEX_REF=정확SHA, PUBLICATION_TEST_ROOT=동일Gitarchive, PUBLICATION_TEST_OUTPUT=새폴더로 지정한다. 기존 증거를 덮어쓰지 않는다. 재현 helper는 docs/p1-publication-final-audit/browser/free_*.mjs, 현재 B6 생성기는 client/browser/3d4291/b6-current-dto/fixture_generator_3d.mjs이다. 옛 expiresAt를 현재로 바꿔 통과시키지 않는다.
5. 운영부하·실제CPU/P95·지역별cold·장기숨김·실물GPS/외부앱·현재활성Worker 재조회·운영배포는 이번에 미실행이다. 운영 날짜검사를 삭제하거나 통과로 재분류하지 않는다.

Node: C:/Program Files/nodejs/node.exe
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

금지: main 병합, 기존PR 제품 변경, Worker업로드/활성화/롤백, Pages, 운영D1, 실사용자자료, 유료전환. 운영승인 요청 전 정지한다.
자동승인 검토가 기존 예상읽기23 사전 변경을 거절하여 실행되지 않았고 별도 관찰 프로브로 증명했다. .tmp-free로그/.tmp/source.tar/database/node_modules를 stage하지 않는다.
