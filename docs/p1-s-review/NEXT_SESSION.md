# 최신 C 정책 검증 진행 — 352315a5 우선 재개

사용자가C를승인/B는불승인. C_POLICY_RECHECK.md·results/c·scripts/c를먼저읽는다. 588/0/1·고정190/176·기존1440반례차단·S1-R·일반E2E55 완료. 새주간/일반시각관문불일치와발행자료rollback반례를root재현. Chromeloader초기baseline하네스오염은initialJSON보존/제품결함개수로미산정. 남은exact작업은 C_POLICY_RECHECK 중간메모를따른다. 현재까지최종승인아님;제품·main·배포·D1·실제제보변경금지. 체크포인트SHA는gitlog로확인한다.

아래는이전R6완료재개이력이며새C최종판정과구분한다:

---
# PR #13 R6 독립 검증 완료 — 재개 지침

## 현재 판정과 확인할 파일

**수정 필요 / 추천 적격성 정책 C(배포 차단).** R6 표시 보완은 해결됐다. known-invalid 예보 날짜/시각이 참고 상태·rank108으로 최종에 남는 선발 관문은 미해결이며 이전8ccb에도 존재한다. 최종 R6_RECHECK.md, FINDINGS.md 최신 머리, results/r6/source_crosscheck.json과 github_receipts.json을 먼저 읽는다. R4/R123 및 P1-A~D 완료 분석을 반복하지 않는다.

- target e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
- before 8ccb248faa2c5c7b5a6019d12e19e21031169460
- main b0975cad9f3112af38cc286a892bf6f06722ce12
- 임시 결합 tree 59d2dbf50fd9914e97e17d2902a7b804e37219d4 (main 병합 아님)
- review branch review/p1-s-pr13. 중간 체크포인트3488b393271737850f27f16fc9c09d3bd7a2b648 push 완료. 최종 보고/게시 증빙 커밋은 git log -3 및 github_receipts.json의 reportCommit에서 확인한다. 자기커밋SHA를 같은커밋 문서에 순환 삽입하지 않는다.

## 완료 결과

- 실제 회귀578pass/0fail/1skip. reports178, weekly147, frontend110, Chromium20, cardDOM12, Pythonweather54, tide21pass/1skip, proxy36.
- S2182/182, special21/21, popup12/12. 추가103은100pass/3 R5 불일치이며 성공으로 합산하지 않았다.
- 실제Chrome 원래175/175 + 추가70 =245/245, 예외0; root375px49/49. 일반5폭E2E55/55, 예외0. 참고6종 카드·팝업 미확인 일치; applicable entry115건 storedWeatherState 전체필드 동일. 정상0/92/92.5/100·제보16/rank108·90/91·대체만조 유지.
- 이전8ccb에 새R6 카드시험만 실행하면10pass/2fail, 새head12pass. 실제 builder sparse6h 출력·validator 및 제품fixture 동일 확인. 운영발생/빈도 미확인.
- 고정10/8 22:40·190곳/176후보/176수치안전·ON/OFF 전체signature·좌표hash가35141c0/main/before/head 동일. 원본manifest16파일/공개11곳24문자열 유지.
- 후보정책19시나리오×ON/OFF38조건×3필터, actual/독립선발114일치. 정상176 및 정상week미수신166은 참고0/제외 영향0. metadata만 참고로 바꾼week미수신166→0, 혼합11참고176→165. 실제 운영 위험빈도/목록 빈도 아님.
- actual 만조 forecast10/9 12:00 vs tide10/10 12:00 절대1440분인데 raw92/rank108/mandatory/finaltrue. 일반은 forecast 오류/누락도 최종유지. raw own true와 derived false를 구분한다. before/head18조합 selection동일.
- S1-R 보호표현171누락0/일반17오탐0·관리자5·ownerdelete4. 최신main 임시결합 충돌0·자동weather/tideJSON보존·validator2·JS257. actualtide100곳/39관측소fresh/ok, 월간partial/stale280 기존한계.
- 기존삭제 oldGET 마커복구(P1우선), 보호역전(P1·전환/S1-P배포전 필수차단), R5(P2), S1-P 별도승인정책. 실제민감유출사고 증거 조회하지 않았음.

## 다음 작업 — 사용자 정책 승인과 구현자 새 SHA 이후

이번 SHA의 필수 독립실험은 완료했다. **후보 정책을 검증자가 구현하지 않는다.** 현재 그대로 병합·배포 승인 아님.

1. PR13 최신head·원격main·구현 보완댓글·AI_WORK_RULES·설계/diff를 확인한다. 과거exactSHA 검증을 새head 승인으로 전용하지 않는다.
2. 최소 known-invalid/unknown forecast/source time을 후보 전·최종 선발에서 막는지 검사한다. 실제timestamp 날짜/timezone 포함 절대±90분과 동일날짜 사용을 확인한다. 공지/가점16/mandatory/정원보충은 우회하지 못해야 한다.
3. 사용자에게 보수적 current-eligible-only 후보 정책 또는 제한된 scheduled-delay B 예외에 관한 명시승인을 받았는지 확인한다. B는 정상 실제forecast·생성시각·P0가 확인되는 지연만 대상으로 하며 날짜 오류/검증불능은 허용 대상이 아니다. 임의max-age/새점수/생태정책을 만들지 않는다.
4. 실제함수18조합·absolute90/91/자정/6h/24h·안전차선예보/대체만조를 재검증한다. 정상주간 우선·site없음vs부적격samples 차이를 유지하며, 정보팝업 기온/풍향/조석은 보존한다.
5. 전체참고→빈추천 안내·재시도·캐시/늦은응답 후 최신자료 복구·정상weekly 대안·정원빈자리 부적격보충불가 시험을 추가한다. R6 표시245, matrix/special/popup, 보호/S1-R/P0, 정상190/176·ON/OFF fullsignature 회귀 유지.
6. 최신main을 merge-tree로 임시결합해 자동JSON blob 보존·validator·영향파일 회귀·5폭실제Chrome를 확인한다. main merge/배포 금지.
7. 별도P1 삭제보안PR을 우선 요청한다. pendingGET→delete200→fresh제외→old완료 후에도 제외, marker/popup/news/guide/cache 동시회수 시험필수. 보호상태 전환/S1-P 배포 전에 old응답 재활성화를 반드시 차단한다. 실제민감정보철회/비동의 노출 증거가 생기면 기존/신규와무관하게 공개보류/회수 우선.
8. 검증 자료 checkpoint commit/push→PR13/Issue9 댓글→API본문readback→게시증빙 commit/push→사용자 최종보고. 승인돼도 사용자 지시 전 main/Pages/Worker/D1/실사용자등록삭제 금지.

## 경로와 복원

Review: C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
Analysis: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

Review 제품source는7eb6764이다. 실행하면 안 된다. archive/profile는 결과 복사 후 제거하며 version관리하지 않는다. worktree 루트에서 현재검증 정확자료를 복원한다:

```powershell
$taskScratch='docs/p1-s-review/.scratch'
New-Item -ItemType Directory -Path $taskScratch -Force
 git archive --format=zip --output=docs/p1-s-review/.scratch/targete9c.zip e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/targete9c.zip -DestinationPath docs/p1-s-review/.scratch/targete9c
 git archive --format=zip --output=docs/p1-s-review/.scratch/before8ccb.zip 8ccb248faa2c5c7b5a6019d12e19e21031169460
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/before8ccb.zip -DestinationPath docs/p1-s-review/.scratch/before8ccb
 git archive --format=zip --output=docs/p1-s-review/.scratch/combinede9c.zip 59d2dbf50fd9914e97e17d2902a7b804e37219d4
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/combinede9c.zip -DestinationPath docs/p1-s-review/.scratch/combinede9c
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
```

원래 테스트 재현: execution_manifest.json의 workdir/command대로8스위트를 실행한다. test_summary.json은 로그파싱 결과다. 기존 node helper가 새 모듈 경로에 적용되는지 먼저 확인한다.

핵심독립실험은 아래 순서(분석용out은 별도폴더에 지정하여 기존스냅샷 보존):

```powershell
$targetPath='docs/p1-s-review/.scratch/targete9c'
$analysisPath='C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
$replayOut='docs/p1-s-review/.scratch/replay-output'
node docs/p1-s-review/scripts/r6/pr13_r123_actual_matrix.mjs $targetPath $replayOut $analysisPath
& $env:BIRDMAP_PYTHON docs/p1-s-review/scripts/r6/sparse6h_generator_actual.py $targetPath $replayOut
node docs/p1-s-review/scripts/r6/r4_freshness_actual.mjs $targetPath $replayOut $analysisPath
node docs/p1-s-review/scripts/r6/independent_replay.mjs . $analysisPath $replayOut
node docs/p1-s-review/scripts/r6/r6_reference_policy.mjs . $analysisPath $replayOut
node docs/p1-s-review/scripts/r6/reference_selection.mjs $targetPath $replayOut
node docs/p1-s-review/scripts/r6/reference_selection.mjs docs/p1-s-review/.scratch/before8ccb docs/p1-s-review/.scratch/replay-before-output 8ccb248faa2c5c7b5a6019d12e19e21031169460
$env:R6_GENERATOR_FIXTURE=Join-Path $replayOut 'sparse6h_generated_today.json'
node docs/p1-s-review/scripts/r6/independent_r6_dom.mjs $targetPath docs/p1-s-review/.scratch/dom-output e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6
node docs/p1-s-review/scripts/r6/general_e2e.mjs docs/p1-s-review/.scratch/combinede9c docs/p1-s-review/.scratch/e2e-output 2026-10-09T21:10:00+09:00
node docs/p1-s-review/scripts/r6/source_crosscheck.mjs
```

주의: 두 reference_selection은 같은파일명을 쓰므로 위와 같이 before/after output을 분리한다. DOM 모든폭은 스크립트 기본, root49는 환경변수R6_WIDTHS=375로 실행한 범위(소스 실제 설정 확인). before 카드 실패를 다시 확인하려면 새 R6 test_recommendation_card_display.mjs와 fixture만 before archive에 복사한다. 원제품index는 그대로 둔다. 합성API·DNS/Fetch 격리를 navigation 전에 설치한 실제Chrome 하네스를 사용한다. 실제 운영자료 POST/DELETE 금지.

source_crosscheck는 이번보존결과의 exactsource/data/hash 및 수치를 대조한다. 새실험결과를 원본results/r6에 덮어쓰지 않는다. 마지막 remoteSHA·clean상태·게시readback은 github_receipts 및 최종 git log로 확인한다. 검증 자체가 끝나면 사용자정책 승인/새SHA를 기다린다.


## R6 최종 게시·저장 완료

최종 보고 체크포인트 **20a73321c7ec09dd6262b9c3ef471660f2da8df0**를 검증 브랜치에 push했다. PR13 댓글 **6081928890** 및 Issue9 댓글 **6081932642** 게시 후 API로 본문 전체를 정규화 대조하여 일치를 확인했다. 정확한 URL·본문 SHA256·SHA·체크시각은 results/r6/github_receipts.json, 게시 본문은 FINAL_R6_COMMENT.md에 저장했다.

- [PR #13 최종 검증](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6081928890)
- [Issue #9 기록](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6081932642)

이 세션의 실험·보고·게시가 완료됐다. 추가 제품 실험은 남아 있지 않으며 **수정 필요/C 판정에 따른 사용자 정책 승인과 구현자 새 SHA를 기다린다**. 게시 증빙 최종 checkpoint는 git log -1에서 확인한다. main/Pages/Worker/D1/실사용자 제보 변경 없음.
