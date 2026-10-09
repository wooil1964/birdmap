# PR #13 배포 전 최종 검증 — 진행 체크포인트

대상 2e485079a34fa5aeeef09e82f3b996bf2696d978 / before352315a57d038687807dbe0044c136a22fb0c9c5 / mainb0975cad9f3112af38cc286a892bf6f06722ce12.
제품 수정·main 병합·Pages/Worker 배포·운영D1·실사용자 데이터 변경 금지.

완료:
- 실제8스위트603pass/0fail/1skip. reports178,weekly159,frontend118,Chromium20,cardDOM16,weather55,tide21+1skip,proxy36. execution_manifest/test_summary/TAP 보존.
- 정상고정190/176·4버전190 signature/ONOFF top 및 좌표hash 불변. independent_replay.json. S1-R171/일반17·관리자·본인삭제 actual assertions 통과.
- 기존C1C2핵심74/74·helper23·matrix182/21/12. 추가실제계약80 및타입92/92·Python10/10·92/92 agent완료. 선상ID48 무효99→80+16rank96 확인.
- today9일운영JSON을10일실제시계로validate하면Batch date mismatch; 동일hash를생성일9일로시계고정하면통과. 실제builder로190곳10일합성today/week생성하여두validator통과. 날짜검사제거/운영JSON수정없음. batch_date_recheck.json.
- 최신main임시treea7ae4970e4a5880145f6a028aed49ebb70ab5f1f 충돌0. 결합JS277pass. 초기UTF8미지정1fail은환경출력문자깨짐으로보존후bundledPython/UTF8지정재실행277pass.
- Actions4개는자료생성/커밋 포함·PR trigger없음. head실행0/status0, 최신확인main기상37926821243 scheduled success(빌드·검증·커밋step성공) 읽기전용확인. 임의dispatch없음.
- 새C3 Node28중23pass5fail, Chrome140중115pass25fail/예외0, 기존base8/base40 모두통과. 미래발행highwater가정상복구차단(today는새회귀), root1050/item1030 안전입력이기존1040rain1 제외를복구(이전에도허용된미완결계약). 최종root독립rerun/소스증빙남음.
- 새timestampType JSON배열발행/예보가String()으로승격돼99/rank115 8경로, object.toString비함수TypeError. canonical74와분리. Python교차/최종판정준비중.
- Chrome기본245/복구45/C2 10통과 agent완료; 선상65중40pass25popup의미진단은독립대표날씨와추천안전시간차이를기존SHA대조중. 정상card80/선발rank96은이25도통과. 제품신규결함으로오산금지.

다음:
1. agent시각형식/자료형교차·C3최종보고·선상popup기존동작대조를읽고root대표독립재실행.
2. 정확head/datahash증빙,최종 보고/보완 지시/FINDINGS/PROGRESS/NEXT 작성.
3. 전용검증branch commitpush,PR13Issue9최종댓글게시/본문exactreadback.
아직배포승인아님. 다음세션에는이 메모와 results/final-2e485·scripts/final-2e485를 먼저 읽고 P1-A~D를 반복하지 않는다.


아래는 이전 C 완료 이력입니다.
# PR #13 C 정책 검증 완료 — 다음 세션 지침

최종판정 **수정 필요**, target 352315a57d038687807dbe0044c136a22fb0c9c5, before e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6, main b0975cad9f3112af38cc286a892bf6f06722ce12. 사용자C승인/B불승인. 먼저 C_POLICY_RECHECK.md·FINDINGS.md최신머리·results/c/verification_summary.json·github_receipts.json을 읽는다. R6/P1-A~D를 다시 분석하지 않는다.

## 완료·체크포인트

588/0/1, S2182/21/팝업12, 고정190/176전수불변, Chrome245/복구45·일반55 통과. helper23 통과. source74중43불일치+schema4별도, invalidweekDOM2실패, correctedloader40중20불변성실패는 제품보완 대기이다. 초기harness오염은제외했다. reportCommit은 results/c/github_receipts.json과 git log -3에서 확인한다. 이전중간checkpoint7e6da2b3ddbbbdf43c0e42d085e32c29ef09e47a. 자기commitSHA를같은commit문서에순환삽입하지않는다.

## 다음 정확한 작업

1. PR13 최신head와원격main을조회하고 새구현SHA가없으면 제품수정/반복분석 없이 사용자·구현자보완을 기다린다.
2. 새SHA면C1/C2/C3 diff를읽는다. 주간발행/시각true승격과일반today parser, 발행rollbackguard를실제소스로감사한다. 별도 B/배점/정원/S1-P를몰래변경하지않았는지확인한다.
3. 검증 전용 임시 archive를새SHA로만들고 영향테스트를실행한다. review branch제품파일은역사적7eb이므로 제품테스트에쓰지않는다.
4. 무효99점→정상80/rank96, 주간bad/missing/future발행제외, unavailable제외, 최신10:40rain1→후속old10:30rain0에서0→0을확인한다. 확장R5는별도3실패추적.
5. 기존588·245/45·normal190/176·S1R·최신 mainmerge-tree/validator/자동JSON보존을재검증한다. 실제병합/배포/API쓰기금지.
6. 최종문서/전용브랜치commitpush/PR13Issue9게시readback후사용자승인대기.

## 재현 자료·명령

reviewRoot=C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
analysisRoot=C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python=C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome=C:/Program Files/Google/Chrome/Application/chrome.exe

archive는 보관하지 않는다. git archive --format=zip --output=... 352315a57d038687807dbe0044c136a22fb0c9c5와 PowerShell Expand-Archive로 review/docs/p1-s-review/.scratch/targetC를 재생성한다. 새 head에서는 SHA 상수를 새 검증 대상으로 맞추고 기존 결과를 덮어쓰지 않는다.

~~~powershell
$cReview = 'C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap'
$cArchive = "$cReview/docs/p1-s-review/.scratch/targetC"
$cAnalysis = 'C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
$cOut = "$cReview/docs/p1-s-review/results/c"
$cScripts = "$cReview/docs/p1-s-review/scripts/c"
$cPython = 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
node "$cScripts/reference_selection.mjs" $cArchive $cOut
node "$cScripts/c_temporal_source_actual.mjs" $cArchive $cOut $cAnalysis
node "$cScripts/pr13_r123_actual_matrix.mjs" $cArchive $cOut $cAnalysis
node "$cScripts/pr13_r123_extended.mjs" $cArchive $cOut $cAnalysis "$cReview/docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json"
& $cPython "$cScripts/sparse6h_generator_actual.py" $cArchive $cOut
& $cPython "$cScripts/c_week_validator_actual.py" $cArchive $cOut
node "$cScripts/c_reference_policy.mjs" $cReview $cAnalysis $cOut "$cReview/docs/p1-s-review/results/r6/r6_reference_policy.json"
node "$cScripts/independent_replay.mjs" $cReview $cAnalysis $cOut
node "$cScripts/loader_replay.mjs" $cArchive $cOut
$env:C_GENERATOR_FIXTURE = "$cOut/sparse6h_generated_today.json"
node "$cScripts/independent_c_dom.mjs" $cArchive "$cReview/docs/p1-s-review/.scratch/c-dom" 352315a57d038687807dbe0044c136a22fb0c9c5
node "$cScripts/loader_dom_corrected.mjs" $cArchive "$cReview/docs/p1-s-review/.scratch/c-loader-dom" 352315a57d038687807dbe0044c136a22fb0c9c5
~~~

C DOM CLI exit1은 별도무효주간2실패 때문이다. loader propertyFail은summaryJSON으로판정하고exit0을보안통과로읽지않는다. raw archives는CRLF이므로 Git blob 비교는정규화하며 sourceDigest의raw/normalized차이를구분한다. sparsebuilder→policy/DOM, matrix→extended는순차의존이다. execution_manifest.json의8스위트명령/스코프를재사용한다.

## 남은 별도 정책·위험

R5 P2 유입변화시격상; 삭제oldGET P1우선; 보호상태old응답 P1/보호재분류·fieldhide·S1-P전환 배포전필수차단. S1-P정책은별도사용자승인 필요. 실제운영민감정보사고는확인하지않았으며 원본좌표/비밀정보 저장금지. 주간허용최대연령/새스케줄은임의도입하지않는다.

## 게시·최종 체크포인트

검증 보고서 commit: 72cb3e2d142b838b357cfa61a82d4ebae1ca2679 (원격 push 완료).

- [PR #13 최종 판정](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6083239755)
- [Issue #9 동일 판정](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6083244131)

두 댓글 ID와 게시된 본문을 API로 다시 읽어 FINAL_C_COMMENT.md와 일치 확인했다. readback/본문hash는 results/c/github_receipts.json. 이 증빙을 저장한 마지막 commit은 git log -1/원격 review/p1-s-pr13에서 확인한다. 원격 main/head가 현재 검증 SHA와 같은지 최종 재확인한다. 사용자 승인·구현자 보완 새SHA 대기이며 운영 작업은 수행하지 않는다.
