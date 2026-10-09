# PR13 검증 재개/보완 재검증 지침

## 완료와 체크포인트

검증 대상: 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e.
최신 main: 38b45299c832b8ab8ad549762c02979fa8ddfb28(10/9 19:47KST재확인).
현재 판정: 수정 필요. FINDINGS.md 및 FINAL_COMMENT.md를 먼저 읽는다.
첫 완료 체크포인트: 0ebd148e96c56ce375f81dfdcf31566d056aab57.
검증완료 E2E/최종문서 체크포인트: d9e5877d7fad792d7fe3ed79485e7d829afbc9da. 게시증빙 최종 저장커밋은 git log -1로 확인한다. 자기저장커밋SHA를 문서에 순환 삽입하지 않는다.

모든 필수 검증은 완료됐다. 기존547pass/1skip, root latest-main combined313pass/1skip, validator2, head-only/combined 각40기능분기pass. actual S2 계약182중7/특별21중7/popup12중8불일치는 R1/R2/R3의 경로별 재현이다. 보호상태 late-response는 기존main에서도 실패하며 별도S1-P다. 실패를 성공으로 바꾸지 않는다.

## 게시 및 사용자 보고

게시완료: PR13#issuecomment-6079394141 / Issue9#issuecomment-6079396000. API read-back으로 저장된 FINAL_COMMENT.md7370자 본문일치를 확인했고 results/github_receipts.json에 기록했다. 다음 세션은 새 구현 커밋이나 사용자 지시가 있을 때 아래 재검증을 시작한다. 운영 변경·병합·배포는 금지다.

## Claude Code 보완 후 재검증

1. 새PRhead/원격main/diff/인수인계를 다시 읽고 정확SHA를 갱신한다.
2. R1: actual formattedtoday 필수자료·유형별파고와unknownsafety차단; todayWeatherEntry/tide/validator같은계약. 기존rain없는fixture의true/[]추가만으로통과시키지않는다.
3. R2: popupsource의owntrue·빈list·실제필수자료provenance, weekly/live/previous_savedadapter와미확인표시/참고자료보존.
4. R3: optionalnonnullwave타입/finite/nonnegative와ownflagJS/Python정합성.
5. scripts/pr13_s2_actual_matrix.mjs와Pythonmatrix는targetHEADconstant/functions선택을 새commit으로 갱신한 검증사본에서 실행한다. 제품 guard 자체를 테스트용으로 patch하지 않는다.
6. 고정16파일manifest/11곳공개집계는 유지하고 190곳/176후보·원점수/표시/rank/bonus/date/time/axes를 before/newhead 전수대조한다. sourceconstant만 새검증대상으로 바꾸고 입력을 섞지 않는다.
7. 영향받는weekly/Python/midnight/표시/모든fallback/P0boundary를 재실행한다. API S1 제품변경없으면 기존증거해시가같은지확인하고 변경시178+S1matrix를재실행한다.
8. 최신main과merge-tree로임시결합, main자동JSON hash보존, syntheticAPI CDP/DNS격리 E2E를다시한다. 물리기기·운영Turnstile/cache는증거없는성공으로쓰지않는다.
9. S1-P의전면비공개/승인후간접위치/fieldlate-response/popup대략안내정책을몰래운영에구현하지않는다.

## 재현 경로와 명령

review: C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
analysis: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

```powershell
node docs/p1-s-review/scripts/pr13_s1_independent.mjs . docs/p1-s-review/results
node docs/p1-s-review/scripts/pr13_s2_actual_matrix.mjs . docs/p1-s-review/results C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/p1-s-review/scripts/pr13_s2_python_validator_matrix.py . docs/p1-s-review/results
node docs/p1-s-review/scripts/independent_replay.mjs . C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap docs/p1-s-review/results
node .github/scripts/compare_p1s_recommendation.mjs 35141c04d4fd152982b1f4683d5b7a6f4f7514e5 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e
node docs/p1-s-review/scripts/verify_provided_compare.mjs docs/p1-s-review/results
node docs/p1-s-review/scripts/pr13_e2e_existing_policy.mjs . docs/p1-s-review/results
node docs/p1-s-review/scripts/pr13_e2e.mjs <combined-directory> <new-temporary-output/profile-directory> 2026-10-09T16:40:00+09:00
```

기존스위트의정확발견파일/명령/skip은results/EXECUTION_SCOPE.md, E2E범위/미검증은results/E2E_REVIEW.md에있다. 재실행시기존결과를덮어쓰기보다별도결과폴더를만든다.

임시combined자료는git merge-tree cb24c5085f8f297c0197950a756e41d08082dd98에서archive로다시만들수있다. Windows CRLF 차이는e2e_source_crosscheck와canonical blob정규화로확인한다. 임시.scratch는보존할결과를복사한후절대경로검증을거쳐삭제한다. profile/제품copy/민감원자료는commit하지않는다.

## 1bd26199 진행중 세션 재개 우선

R123_RECHECK.md를 먼저 읽는다. 이전ff0d334자료는유지하고새결과는results/r123. 실제targetarchive는docs/p1-s-review/.scratch/target1bd, 최신maincombined는.scratch/combined1bd(tree1be66adc)다. 원래스위트563pass/1skip 완료. 추가matrix/정상만조fallback카드provenance/5폭E2E/기존cache위험 재평가/최종댓글 남음. agents p1s_score/p1s_taxon/p1s_protection은각각visualization pr13_r123_score/compare/e2e에script/results작성중이다. root만review docs작성. 이전JSON덮어쓰기·제품guard수정금지.
