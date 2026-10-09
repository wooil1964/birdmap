게시완료: PR13 댓글6089038356 / Issue9 댓글6089039285, API exact본문 일치. 보고서commit2026d347, 게시증빙results/final-2e485/github_receipts.json.

# 최신 완료 — PR #13 배포 전 / 2e485079

**수정 필요.** target `2e485079a34fa5aeeef09e82f3b996bf2696d978`, before `352315a57d038687807dbe0044c136a22fb0c9c5`, 최종 main `4b164ffe74efa5cadad9e686bd628a8915527e77`. 이전 C1/C2 canonical 및 C3 base8/40 해결; 회귀603/0/1·S2182/21/12·source74·helper23·고정190/176·Chrome245/45·최신결합55/validator2 통과. 새 C3 미래 비교기준 회복차단, root/item 안전역행 및 시각자료형 우회는 배포전 필수보완이다. [최종 보고서](FINAL_DEPLOY_RECHECK.md), [교차증빙](results/final-2e485/verification_summary.json).

- C3 Node28=23pass5fail·Chrome140=115pass25fail/예외0; root도 Node28/Chrome37528을 직접 재현. before 비교로 today 복구차단은 새회귀, item역행은 기존 미완결 계약으로 분리.
- 시각 배열8경로 raw99/rank115 최종, 객체8후보/최종 TypeError, 실제Chrome375 배열2실패·Python4거부. 운영유입/사고 미관측.
- 자동603 성공과 추가계약 실패를 분리. 선상65 안전선발은 유지, 초기카드/팝업동일40/65+의미차이25 보존/before동일.
- 최신main 자동4JSON 변경만·tree75df87ad 충돌0·자동5blob main 보존/제품8blob head 일치. 최신batch10/10 actualvalidator2통과. 옛9일JSON을10일검사한 Batch date mismatch 별도입증·정상newbuilder190통과.
- exacthead Actions0/status0, test-only PRworkflow없음·dispatch0. 운영weather37984742517 success는 main의기존workflow이며 PRCI가 아님.
- S1-R171/일반17·관리자/삭제 actual 회귀통과. R5P2/삭제oldGET P1/보호전환·S1-P 선행차단/선상안내별도 추적. 제품·main·운영배포/D1/실사용자쓰기 없음.
- 최종체크포인트는 git log와 github_receipts.json의 reportCommit·bodyhash로 확인한다. PR13/Issue9 exact본문readback후receipt를별도commit한다. 새보완SHA/사용자승인대기.

이하 이전 검증 이력(현재 판정과 구분):

---
# 최신 완료 — PR #13 C 정책 / 352315a5

**수정 필요.** 기존1440분 및 참고today 후보 제외는 해결, 실제회귀588pass/0fail/1skip·S2182/21/팝업12·고정190/176·기본Chrome245/복구45·일반E2E55 통과. 그러나 주간 발행/시각검증 누락 및 일반today permissive시각, 나중요청의이전발행자료 안전역전이 남는다. 상세실제반례·코드위치·보완요청은 [C_POLICY_RECHECK.md](C_POLICY_RECHECK.md).

- C만사용자승인/B불승인. exacthead 352315a57d038687807dbe0044c136a22fb0c9c5 / main b0975cad9f3112af38cc286a892bf6f06722ce12.
- source핵심74중43불일치(같은원인의경로조합), schema4별도. stricthelper23통과. 실제Chrome 무효주간2실패. loaderNode8중4실패/correctedChrome40중20불변성실패(위험10·가용성10),예외0.
- 정상데이터/190·176·ONOFF전수불변.19정책×ONOFF38이전strict기대와일치·독립선발114일치. 정상week실패166,controlled참고전체0/혼합165.
- 기대변경14ID×5폭70명시원장;나머지175유지;before에서70실패재현. before weekly147/8fail,card10/4fail.
- main임시tree 0a32d8b656405ba3ee8cf85dc0208b9e0aa3d3d6 충돌0·4자동JSONblob유지·validator2·결합JS265. 실제main변경없음.
- 초기loaderDOM은fixture혼입무효baseline을발견해보존/제외하고corrected전체재실행. 제품결함으로오산하지않음.
- R5(P2)·삭제oldGET(P1)·보호역전(P1/전환배포전필수)·S1-P별도승인정책 추적. C해결로보고하지않음.
- 제품수정·main병합·Pages/Worker배포·운영D1·실사용자변경 없음. 구현자보완/새SHA와사용자별도승인대기.

이하 이전 이력(현재 C 판정과 구분):

---
# 최신 완료 — PR #13 R6 / e9c97d6c

**수정 필요 / 추천 적격성 정책 C.** R6 출처·표시 보완은175/175(추가70 포함245/245), 전체회귀578pass/0fail/1skip, S2182/21/팝업12, 고정190/176·ON/OFF 및 최신main 결합을 독립 통과했다. 그러나 known-invalid 예보 날짜/시각이 참고 표시·rank108으로 최종 추천에 남는다. 절대1440분 반례와 일반 forecast 오류/누락을 재현했다. 이전8ccb에도 같은 선발이 있으므로 신규 R6 후보 회귀와 구분한다.

- 정확 head e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6 / main b0975cad9f3112af38cc286a892bf6f06722ce12.
- [최종 R6 보고·코드 위치·보완 지시](R6_RECHECK.md). 새 결과 results/r6, 재현 scripts/r6.
- 정책19시나리오×ON/OFF38조건·독립선발114일치. 정상176 및 주간미수신166은 제외 영향0; 생성metadata만 참고로 만든 전체미수신166→0, 혼합11참고176→165. 후보정책은 분석만 했으며 적용하지 않았다.
- 예정갱신 지연만의 B 예외는 명시정책/사용자 승인 필요. known-invalid 시각은 예외 불가.
- 추가계약100/103의 R5 3불일치 및 삭제/보호 old응답 실패는 별도 위험으로 보존했다. 삭제P1 우선, 보호전환/S1-P 배포전 필수차단 조건을 보고서9절에 명시했다. 사고/운영발생 미확인.
- 임시tree59d2dbf5 충돌0·자동JSONmain blob 보존·validator2·결합JS257·일반E2E55/55.
- 제품수정·main병합·Pages/Worker배포·운영D1·실제 제보변경 없음. 사용자정책 승인/새SHA 대기.

이하 이전 검증 이력(현재 R6 판정과 구분):

---
# 최신 완료 — PR #13 R4 / 8ccb248f

- 정확한 target8ccb248faa2c5c7b5a6019d12e19e21031169460, mainb0975cad9f3112af38cc286a892bf6f06722ce12 유지.
- 최종 판정 **수정 필요**. 정상 R4는 해결, 참고자료 출처승격 불일치가 신규 만조표시에 남음. R1~R3/S1-R통과 유지.
- 전체573pass/0fail/1skip, 원래카드DOM9/9, 이전DOM3pass6fail, S2182/21/팝업12모두통과.
- 실제함수30조건과 실제Chrome5폭175조건: 정상145pass·추가참고30fail·예외0. 이전 동일 추가조건30pass. root새29pass6fail/이전6pass직접대조.
- 실제builder sparse6h 출력/validator수락/DOM 재현; 운영발생미확인. source/data hash교차검증 완료.
- 고정10/8 22:40·190/176·제보ON/OFF4코드전수 동일, 보호171/일반17·관리자5·삭제4 실제회귀 완료.
- 최신main merge-tree9949dab3 충돌0·validator2·결합JS256, actual tidehealth100/39fresh/ok; 월간partial/stale280은기존 한계. 일반E2E55/55·예외0.
- 잔여R5·삭제/privacy cache·S1-P별도 위험, 제한된PR13과 정책전환배포의 차단조건을 SECURITY_REVIEW.md에 기록.
- R4_RECHECK/FINDINGS/NEXT_SESSION 최종갱신. 중간체크포인트ff78b2f push완료, 최종문서/게시증빙commit은 git log 및 github_receipts.json 확인.
- PR13/Issue9 댓글은 FINAL_R4_COMMENT.md, API본문대조는 results/r4/github_receipts.json(게시 후 생성). 운영변경 없음. 사용자승인/새SHA대기.

이하 이전 검증 이력:

---
# 최신 완료 상태 — 1bd26199 최종 재검증

- target 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c / main38b45299c832b8ab8ad549762c02979fa8ddfb28.
- 최종 판정: **수정 필요(R4 정상만조카드표시)**. 이전R1~R3는해결.
- 독립원래회귀563pass/0fail/1skip; 계약182/182·21/21·popup12/12; 추가99/103(4불일치 명시); Python합성98문서호출.
- 실제old신규시험실패 weekly7/9·popup2/4·Python16subtests를 확인했고 새target 통과.
- 고정190/176·ON/OFF4버전전수·독립정원12조건·제공compare대조 통과. 원본manifest16file/공개11곳 hash 유지.
- 보호171누락0·일반17오탐0·관리자5·소유자삭제4·main기존정책6/6통과.
- latestmain merge-tree1be66adc 충돌0; validator2성공·결합JS255pass.
- root합성API E2E5폭55/55·실제Leaflet1.9.3·예외0. 초기5timeout은 없는status대기harness를 실제DOM적용확인으로 보정했다. 최초출력보존.
- 별도실패R4표시DOM와기존late보호flag/삭제marker재등장 기록, 정상E2Epass합계에서 분리.
- 체크포인트: 8586ba7 기본회귀, 48f720d 계약/고정전수/API. 최종보고/게시증빙commit은 git log -1로확인.
- 최종문서 R123_RECHECK.md, 최신결과 results/r123, 재현 scripts/r123. PR/Issue댓글과read-back receipt는 results/r123/github_receipts.json(게시 후 생성).
- 운영수정·main병합·Pages/Worker배포·D1변경 없음. 사용자승인대기.

이하 이전7eb검증 이력:

---

# PR #13 최종 검증 진행

- 전용 브랜치: review/p1-s-pr13. 제품 source는7eb6764 그대로다.
- 최종 판정: **수정 필요**. S1-R는 통과; S2-A today 필수기상 결측(R1) 및 popup 적격provenance(R2) 미완료. optional non-null wave/own flag(R3) 정합성 보완.
- 완료: 규칙·설계·인수인계·14파일 전체diff; actualS1/API before/after; actualS2/표시/Python matrix; 기존회귀547pass/1skip;190곳/176후보 ON/OFF 전수 비교; main 임시결합313pass/1skip와validator2성공; head-only 및 root combined E2E 각각40/40.
- root combined: 5폭344/375/768/1024/1440, 10/9 16:40시계/16:28생성, 실제Leaflet1.9.3, JS예외0. 원본 10/8 22:40 고정추천 실험과 별도 입력이다.
- 보호 상태 변경 뒤 늦은 field 응답은 hidden=false로 복귀해 길안내가 재활성화됐다. 상태보존 기대는 실패이며 최신main 동일함수에서 재현, 기존S1-P/cache 과제로 구분한다. mobile popup의 대략위치안내도 기존main/PR동일정책이며 전면길안내금지는 별도승인사항이다.
- 마지막 remote확인: 2026-10-09 19:47KST. PRhead7eb6764/main38b4529 동일, draft/open/unmerged. 원래 checkout fix/p1-s-safety-guards7eb6764 clean이다.
- 체크포인트1: 0ebd148e96c56ce375f81dfdcf31566d056aab57. 이어 E2E/최종문서 checkpoint를 저장한다.
- 완료: PR13 댓글6079394141 및Issue9 댓글6079396000 게시, API read-back7370자 본문일치 확인. results/github_receipts.json 저장. 검증완료checkpoint d9e5877d7fad792d7fe3ed79485e7d829afbc9da, 이어 게시증빙 최종checkpoint/push 후 사용자 보고.
- 제품·main·자동JSON·Worker·운영D1·실사용자 제보는 수정하지 않음. 최초 기존browser자동telemetry는 미계측이므로 성공/실패를 단정하지 않음. 이후browser검증은격리함.

## 새 SHA 재검증 시작

사용자 지정1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c, main38b4529. 이전ff0d334 체크포인트를 읽고 재개했다. 새로운 결과는 R123_RECHECK.md 및 results/r123에 분리한다. 기존 회귀563pass/0fail/1skip 직접 확인; 독립matrix/정상만조display추가계약/E2E 진행중. 제품수정금지.

## 최종 게시 완료

PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6080213498
Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6080214390
저장된 FINAL_R123_COMMENT.md와 게시본문5198자 일치를 API read-back으로 검증했다. results/r123/github_receipts.json에 증빙을 저장했다. 최종보고 commit8d2e574 및 다음 게시증빙commit은 git log -1로 확인한다. 제품/배포 변경 없이 사용자 승인 또는 새 보완SHA를 기다린다.

## R4 최종 게시·read-back 완료

보고서 체크포인트 **5dd7297c7e46910b1a5f8917414a14feec455f4f** push 완료.

- PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6080998481
- Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6080999469

FINAL_R4_COMMENT.md와 두 게시본문5289자 일치를 API read-back으로 확인했다. results/r4/github_receipts.json에 URL/ID/본문SHA256/검증SHA/보고서commit을 저장했다. 최종 게시증빙commit은 git log -1로 조회한다. 판정은 수정 필요이며 제품 보완·운영 반영은 수행하지 않고 사용자 승인 및 새 SHA를 기다린다.


## R6 최종 게시·저장 완료

최종 보고 체크포인트 **20a73321c7ec09dd6262b9c3ef471660f2da8df0**를 검증 브랜치에 push했다. PR13 댓글 **6081928890** 및 Issue9 댓글 **6081932642** 게시 후 API로 본문 전체를 정규화 대조하여 일치를 확인했다. 정확한 URL·본문 SHA256·SHA·체크시각은 results/r6/github_receipts.json, 게시 본문은 FINAL_R6_COMMENT.md에 저장했다.

- [PR #13 최종 검증](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6081928890)
- [Issue #9 기록](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6081932642)

이 세션의 실험·보고·게시가 완료됐다. 추가 제품 실험은 남아 있지 않으며 **수정 필요/C 판정에 따른 사용자 정책 승인과 구현자 새 SHA를 기다린다**. 게시 증빙 최종 checkpoint는 git log -1에서 확인한다. main/Pages/Worker/D1/실사용자 제보 변경 없음.

## 게시·최종 체크포인트

검증 보고서 commit: 72cb3e2d142b838b357cfa61a82d4ebae1ca2679 (원격 push 완료).

- [PR #13 최종 판정](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6083239755)
- [Issue #9 동일 판정](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6083244131)

두 댓글 ID와 게시된 본문을 API로 다시 읽어 FINAL_C_COMMENT.md와 일치 확인했다. readback/본문hash는 results/c/github_receipts.json. 이 증빙을 저장한 마지막 commit은 git log -1/원격 review/p1-s-pr13에서 확인한다. 원격 main/head가 현재 검증 SHA와 같은지 최종 재확인한다. 사용자 승인·구현자 보완 새SHA 대기이며 운영 작업은 수행하지 않는다.
