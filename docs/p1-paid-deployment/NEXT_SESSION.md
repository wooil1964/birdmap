# 재개 지침 — P1 Paid 최종 배포 후보 검증
제품 c75640613d3dad7f6a0e492cecb2ac3232e8a48e, R5 수정0107e1419af7bea1d758f35a427db81e06681e28.
작업트리 C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap, branch codex/p1-publication-paid-deploy.
이 문서의 checkpoint SHA는 git log -1로 조회한다. PR17 head는 검증된 제품 c756이며 문서 checkpoint branch와 구분한다.

먼저 FINDINGS.md, PROGRESS.md, FINAL_MANIFEST.json, ci-c756/INDEPENDENT_CI_RECEIPT_20261014.json, current-c756/RESULTS.json, r5-audit/INDEPENDENT_AFTER_RECEIPT.json을 읽는다. 이전 P1분석·R5수정 전후·완료 테스트를 반복하지 않는다.

완료: 정확 c756 CI771/0/1+Chrome242/0/0, root 및 독립 R5Chrome35/35, JS68/Python14, S2 182/21/12, 보호171/일반17, fixed190/176 fullsignature, actual14currentValidator/week PASS와원발행8/8. native/CAS/migration/Load은 동일소스 비간섭 원장을 사용한다. 실제 uploaded 보호 Worker4버전과 새 Pages388assetZIP을 확보했고 활성화하지 않았다. 현재 운영 metadata schemaReady true/FK0; publication migration 미설치.
모든 raw실패·미추적·원본 Free/WS worktree 보존. 대규모 git add . 또는 cleanup 금지. ZIP·빌드·개인자료는 Git에 추가하지 않는다. 코드 편집자는 root 한 명이다.

필수 대기 입력: Workers Paid 실제 적용 확인(구독API403), 전체 D1의 private좌표/사용자정보를 C:/Users/김진호/.codex/deployment-backups/birdmap-p1에 DPAPI 암호화해 export/메모리 복구하는 정확 범위 승인. 두 async 질문 pending. 후자는 자동 승인 검토가 거부한 작업이며 답변 전 우회/재실행 금지. Time Travel bookmark조회는 가능하지만 destructive restore 금지.

writer drain 신규 차단 확인: 구 field 요청의 무조건 UPDATE는 thaw 뒤 가림을 되돌리고 구 serializer로 정확좌표를 보낼 수 있다. drain-review/와 agent 최종 결과를 읽고, 승인 범위에서 비파괴적 pre-barrier 및 현재 writer의 atomic transaction claim을 최소 구현·테스트·독립 검사한다. c756는 이 전환 차단 해결 SHA가 아니다. 수정 후 안전 Worker standby4개와 Pages/CI를 새 SHA로 갱신한다. 운영은 그 전에 시작하지 않는다.
계정 Paid 확인과 안전한 snapshot/rollback, 최신성·인증·모든 writer통제 관문 전에는 운영 maintenance 활성화도 시작하지 않는다.
관문 충족 시 최신 main/PR13/16/17 및 현재 날짜 생성자료를 다시 고정하고, JSON을 수동 날짜 변경하지 않는다. c756 CI는 각 소스/index/asset hash가 다르면 재사용 합격 불가.
paired maintenance 100%/legacy0%없음/preview off → 모든 writer통제 및freeze-bound backup → 0005전용 atomicMigration(0004재실행 금지) → 실제schema/원본/새epoch/revision/guards/FK검증 → protected 정상pair/strictnonce/legacyfailclosed/peer협상확인 → 안전한thaw → 검증 source만main merge/Pages → 실제운영 보안/기능/자동갱신 검증 순서다. 각 단계 실패 시 다음 단계로 진행하지 않고 안전한 maintenance/rollforward 수정한다.
업로드 정상/유지보수 versionIDs는 VERIFIED_STANDBYS.json/FINDINGS를 사용한다. public494/16dae나c025Pages로 되돌리지 않는다. D1의 삭제·철회·revision을 초기화하거나 과거backup으로 자동복구하지 않는다.
운영 auth나 물리 GPS/외부앱 시험을 못했으면 미실행으로 명시한다. source/CI PASS를 실제운영 PASS로 바꾸지 않는다.
최종 결과를 PR17과 Issue9에 게시하고 본문을 재확인한다. 현재 사용자 승인은 수정·병합·배포까지 이미 있으므로 관문 이외의 반복승인을 묻지 않는다.

## 진행 중 추가 보완 — writer fence
구버전 지연 writer 전환 결함을 직접 수정: prebarrier0004b(0005 전 별도 atomic commit), 현재 코드의 raw D1.batch claim/body/delete, 공개 guard34/claim0, capability v4. 운영 변경 없음.
기존 원형 실패와 신규 target-first/second/reports-first/second/native-first/second 모두 보존.
최신 표적 API284/0, actual native fence13/0(실제 COMMIT후 응답손실·prebarrier rollback·원본 보존 포함), 실제 제품 nativeCAS10/0. 이전 native-third N08은 응답손실 주입 전이므로 확대 해석 금지.
현재 root만 소스 수정. 전체 회귀·Chrome·정확 CI와 새4Worker standby/Pages artifact는 새 제품SHA에서 진행해야 함.
Paid 실제 활성화 확인 및 승인 검토가 거부한 private D1 암호화 export 범위 승인은 계속 대기. 기존5719 normal standby는 새 fence 미포함이므로 안전 롤백으로 재사용 금지.
