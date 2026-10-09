# PR #13 독립 재검증 재개 — R4 8ccb248f 완료

## 완료·판정

- **수정 필요**: 정상 R4는 해결, 참고 today 자료의 무조건 현재 적격 출처 승격이 남았다. R4_RECHECK.md 3절·9절을 먼저 읽는다.
- 정확한 target `8ccb248faa2c5c7b5a6019d12e19e21031169460` / 이전 `1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c` / main `b0975cad9f3112af38cc286a892bf6f06722ce12`.
- 원래 회귀573pass/0fail/1skip, 카드DOM9/9·old3pass6fail, S2182/21/popup12 통과.
- 독립 실제Chrome: 정상145/145, 추가참고6조건×5폭30불일치; 이전 동일조건30/30pass, 예외0. root375px도 새29pass6fail/이전6pass 직접 확인. 실패를 통과합계에 넣지 않는다.
- 실제builder sparse6h 출력·validator수락·수정없는 DOM 재현. 운영 발생/빈도 미확인; 표준3h 갱신지연만으로 운영도달을 단정하지 않는다.
- 고정10/8 22:40·190/176·ON/OFF4코드 전수/좌표hash 동일, 공개 집계11곳/24문자열 불변.
- P0·S1-R 표현171/일반17·관리자5/삭제4 회귀 통과; 최신main 임시결합 충돌0·자동JSON 동일·validator2·결합JS256. actual 조석health100곳/39관측소fresh/ok, 월간partial/stale280은 기존 자료 상태.
- 일반E2E55/55·실제Leaflet1.9.3·예외0. 기존 late 삭제marker/보호flag 실패는 별도 P1 보안; R5/P2 및 S1-P 조건은 SECURITY_REVIEW.md 참조.
- 검증 완료 단위 중간 commit **ff78b2f**, 최종 보고/게시증빙 checkpoint는 `git log -3 --oneline` 및 results/r4/github_receipts.json 확인. 자기커밋SHA를 순환 삽입하지 않는다.
- 최종 댓글: FINAL_R4_COMMENT.md. PR13/Issue9 API read-back이 끝나면 github_receipts.json에 실제 URL/ID/본문해시와 보고서커밋을 저장한다. 파일이 없으면 게시 미완료다.

## 미완료·다음 작업

이번 SHA에서 추가 정상 실험은 남아 있지 않다. **제품 보완은 검증자가 하지 않는다.** 사용자 승인 및 구현자의 새 SHA를 기다린다. PR merge/Pages/Worker 배포/운영D1/실제 사용자등록삭제 금지.

1. 새 PR13 head·원격main·보완댓글·diff와 인수인계를 확인한다. 이전 R1~R3/S1-R와 P1-A~D 분석은 반복하지 않는다. 변경 영향범위 회귀는 유지한다.
2. weeklyTodayWeather3880~3882에서 기존 storedWeatherState의 날짜·forecast·generatedAt·예정갱신 계약을 실제로 재사용하는지 검사한다. own metadata/필수 기상검사를 유지하고 score guard를 raw 허용으로 완화하지 않아야 한다.
3. 두 fallback에서 fresh정상0/92/92.5/100·rank108, 참고6종(실제builder fixture 포함)을 카드·팝업 함께 검증한다. 참고값은 보존하고 현재 적격으로 승격하지 않아야 한다. 추천 후보의 유효기간 정책 변경과 표시 계약은 구분한다.
4. actual functions matrix, 상세 Chrome, P0 90/91/6h/24h/안전대체만조/강수1/선상 및 S1-R, 고정190/176 ON/OFF full replay를 새 archive에서 실행한다. 새코드 계약을 읽고 상수/추출목록/메타데이터를 갱신한다; 기존 스크립트 경로만 바꾸고 통과라고 하지 않는다.
5. 최신main 임시결합·validator·관련회귀를 실행하고 자동JSON blob 보존을 확인한다. 미래 날짜/최신기상 입력과 고정10/8 입력을 혼용하지 않는다.
6. 기존 삭제 상태 보존은 별도 P1 작은 보안PR로 요청. 보호 재분류/backend 상태 전환·S1-P 배포 전에는 old응답 무효화와 marker/popup/news/guide 동시회수 필수. 비동의 실제 민감노출이 확인되면 기존/신규 여부와 무관하게 즉시 보류/회수한다. 운영 raw좌표를 검증 fixture로 저장하지 않는다.
7. 검증 문서/결과/NEXT를 단위별 commit/push→PR13/Issue9 결과→read-back→게시증빙 commit/push→사용자보고. 구현·운영 반영은 별도 승인 필요.

## 경로·복원

Review: `C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap` (review/p1-s-pr13)
Analysis: `C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap`
Python: `C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`
Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`

검증 브랜치의 제품source는7eb6764이며 실행 대상으로 쓰면 안 된다. 제품 archive/profile는 결과 복사 후 제거하며 저장되지 않는다. worktree 루트에서 복원한다:

```powershell
$taskScratch='docs/p1-s-review/.scratch'
New-Item -ItemType Directory -Path $taskScratch -Force
 git archive --format=zip --output=docs/p1-s-review/.scratch/target8ccb.zip 8ccb248faa2c5c7b5a6019d12e19e21031169460
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/target8ccb.zip -DestinationPath docs/p1-s-review/.scratch/target8ccb
 git archive --format=zip --output=docs/p1-s-review/.scratch/before1bd.zip 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/before1bd.zip -DestinationPath docs/p1-s-review/.scratch/before1bd
 git merge-tree --write-tree 8ccb248faa2c5c7b5a6019d12e19e21031169460 b0975cad9f3112af38cc286a892bf6f06722ce12
# 검증 당시 tree9949dab3131d095c293f3bd0faf8f05539a1ad1e; 실제main merge 금지
 git archive --format=zip --output=docs/p1-s-review/.scratch/combined8ccb.zip 9949dab3131d095c293f3bd0faf8f05539a1ad1e
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/combined8ccb.zip -DestinationPath docs/p1-s-review/.scratch/combined8ccb
```

## 핵심 재현 명령

아래는 현재8ccb를 위한 정확한 명령이다. 새 SHA에서는 코드·상수·기대상태를 먼저 검토하고 별도 결과 폴더로 실행한다. R4_GENERATOR_FIXTURE는 실제 builder 출력이며 입력행을 수정하지 않는다.

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$taskAnalysis='C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap'
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/p1-s-review/scripts/r4/sparse6h_generator_actual.py docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/results/r4
node docs/p1-s-review/scripts/r4/pr13_r123_actual_matrix.mjs docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/results/r4 $taskAnalysis
node docs/p1-s-review/scripts/r4/pr13_r123_extended.mjs docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/results/r4 $taskAnalysis docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json
node docs/p1-s-review/scripts/r4/r4_freshness_actual.mjs docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/results/r4 $taskAnalysis
node docs/p1-s-review/scripts/r4/independent_replay.mjs . $taskAnalysis docs/p1-s-review/results/r4
node docs/p1-s-review/scripts/r4/protection_regression.mjs docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/results/r4
$env:R4_GENERATOR_FIXTURE=(Resolve-Path docs/p1-s-review/results/r4/sparse6h_generated_today.json).Path
node docs/p1-s-review/scripts/r4/independent_r4_dom.mjs docs/p1-s-review/.scratch/target8ccb docs/p1-s-review/.scratch/dom_new 8ccb248faa2c5c7b5a6019d12e19e21031169460
$env:R4_DIAGNOSTIC_ONLY='1'
node docs/p1-s-review/scripts/r4/independent_r4_dom.mjs docs/p1-s-review/.scratch/before1bd docs/p1-s-review/.scratch/dom_old 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c
Remove-Item Env:R4_DIAGNOSTIC_ONLY
node docs/p1-s-review/scripts/r4/general_e2e.mjs docs/p1-s-review/.scratch/combined8ccb docs/p1-s-review/.scratch/e2e_new 2026-10-09T21:10:00+09:00
```

전체 스위트8개의 실제 실행범위/명령은 results/r4/execution_manifest.json. Python runtime preload 및 browser_network_isolation.mjs는 scripts 아래다. 독립 Chrome harness는 navigation 이전 DNS/Fetch 격리, 로컬 합성API 사용, staticCDN GET/HEAD만허용한다. test DOM JSON reload도 같은syntheticfixture여야 한다. 새결과를 이전폴더에 덮어쓰지 않는다.

source_crosscheck.mjs는 공식 저장결과의 exact8ccb/1bd/b097 blob과 archive를 대조한다. 새 SHA 결과로 재사용할 때 고정상수/예상 counts부터 갱신한다. 최초 harness 재시도는 제품실패가 아니다; 최종 정상145와 추가30실패를 섞거나 후자를 성공으로 세지 않는다. 회색tile은 합성응답, 실제Leaflet로딩 성공이다. 물리기기/운영Access/Turnstile/GPS/운영raw자료·전체세로layout은 미검증.

결과 복사후 .scratch의 resolved 절대경로가 위review/docs/p1-s-review/.scratch 안임을 검사하고 nativePowerShell Remove-Item -LiteralPath로만 제거한다. 검증branch에는 docs/p1-s-review의 문서·합성시험만stage한다. 원래 제품checkout과 운영브랜치가 clean인지 마지막에 확인한다.

## R4 최종 게시·read-back 완료

보고서 체크포인트 **5dd7297c7e46910b1a5f8917414a14feec455f4f** push 완료.

- PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6080998481
- Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6080999469

FINAL_R4_COMMENT.md와 두 게시본문5289자 일치를 API read-back으로 확인했다. results/r4/github_receipts.json에 URL/ID/본문SHA256/검증SHA/보고서commit을 저장했다. 최종 게시증빙commit은 git log -1로 조회한다. 판정은 수정 필요이며 제품 보완·운영 반영은 수행하지 않고 사용자 승인 및 새 SHA를 기다린다.
