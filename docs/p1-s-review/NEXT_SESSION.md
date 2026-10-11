## 운영 승인 준비 후속 체크포인트 — 2026-10-11 22:47 KST

최종 판정: **조건부 승인 유지 / 실제 운영 승인 대기**. 통합 보고서는 OPERATION_READY.md 및 OPERATION_SOURCE_DESIGN.md·OPERATION_PROTECTION_DESIGN.md·OPERATION_PAGES_CI.md.

- exact PR head b12e20c1b6d856a021898a0c1c9221b30393a221 유지. 최신 main/Pages43bff43301d5915a344bf2c20987698597cf8870; merge-tree deec588e937ed309b11f9739c02b6eae22772c3d, 충돌0.
- 현재494의 actual public.js는 Git41650e4/1817161 로컬 build+footer와 완전 일치하며 S1-R 수량/혼합7조건 누락. 직전16dae 실제 source 미확인. 둘 다 S1-R 보호 유지 rollback 불승인.
- dc6 S1-R 서버 src16/16이b12와 동일; 최신main+shared guard 구성도 동일. source 복구 설계 완료, 실제 보호 Worker version 및 C guard를 유지하는 Pages release/rollback SHA는 아직 없다.
- 22:47 공개GET approved54/history54/fixed0, recent9/field0; 구·신판정 보호2/신규0, root2 공개위치 유지. private D1 미감사. 기존canonical 명시 비번식/승인후 공개 정책은S1-R와별개.
- 삭제/보호상태/지연GPS 재활성화는 기존결함. 가림·철회·S1-P 전환 전에cache/navigation guard 보완 필수; 순수S1-R/C 한정 반영은 운영자 위험 수용조건. 즉시 본인삭제철회가 필수면delete race도선행차단.
- b12 Actions/status/check-runs0. 기존621/0/1과고정190/176은 exact b12 근거. 최신43+PR은실제날짜today/week validator와112함수동일/176후보/최종10safeeligible 확인; 전체621/Chrome재실행으로확대금지.

다음 세션은 전체검증을처음부터반복하지 않는다. OPERATION_READY.md와 results/operation-ready/execution_manifest.json, 게시receipt를읽고 별도운영승인범위부터 확인한다. 최신SHA가바뀌면영향범위만재검증한다. 미완료는보호version/release등록·localCI증거채택·공개정책및기존보안위험수용/전환선행조건의사용자승인이다.

이 체크포인트의 마지막 commit은 git log 및 operation-ready github_receipts.json에서 확인한다. 제품·운영쓰기0. 이전기록은아래보존한다.



## Worker 메타데이터 추가 확인 — 2026-10-11 07:23 KST

사용자가 지정한 두 `wrangler versions view`와 추가 읽기 전용 `wrangler deployments list`를 Wrangler 4.149.0으로 실행해 모두 exit 0을 확인했다.

| 버전 | 생성 시각 KST | 배포 이력 판단 |
|---|---|---|
| `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc` | 2026-10-08 14:19:39.572 | 조회 시점 최신 배포, 100% 적용 |
| `16dae92a-4bd7-4fda-ba90-d5075604d4db` | 2026-10-06 23:58:25.144 | 직전 배포 버전 |

표시된 바인딩과 secret 이름은 두 버전이 같고 `CANONICAL_DUAL_WRITE`가 유지된다. Secret 값은 읽지 않았다. 원본 설정·계정 이메일·D1 ID는 증거 파일에 저장하지 않았다.

이 추가 확인으로 **현재 운영 Worker 버전 미확인 조건은 해소**됐다. 이전 HTTP 401/429 기록은 당시의 실패 증거로 보존한다. 두 버전 모두 source/tag/message만으로 실제 제품 코드나 S1-R 보호 기능을 입증할 수 없으므로 **보호 유지 rollback 대상 확인 조건은 미해결**이다. 직전 버전을 보호 유지 rollback으로 승인하지 않는다.

최종 판정은 **조건부 승인 유지**. Pages rollback SHA, 실제 보호 전환 영향 및 전환 시 cache 보안 선행 조건은 그대로 남는다. 제품 코드 변경·배포·rollback·D1·실사용자 데이터 변경은 0이다.

정제 증빙: `results/f23-b12e20c/worker_versions_readonly.json`.

# 다음 세션 — PR13 b12e20c 검증 완료, 조건부 승인

정확 검증 SHA: b12e20c1b6d856a021898a0c1c9221b30393a221.
이전 차단: a35b8598d55890e705042e4d6f88621357749d09.
최종 원격 main: 89e7e339812fbd9c096008cb5631c88fd8765c03 (2026-10-11 07:02:19 KST 읽기).
최종 임시 tree: e02191c1ca4cc00e0faedab2ffd4e10b14c537e2.
전용 브랜치: review/p1-s-pr13.
첫 체크포인트11e85527523c267c86c164ba116cba5ed85d6c1e, 독립 증거 체크포인트eb45773.
최종 보고/게시 commit은 results/f23-b12e20c/github_receipts.json 및 git log로 확인한다.

완료:
- F2-a60/60·F3typed77/77·live6/6, Python 실제190 F2/F3 20/35, 객체 TypeError0.
- 정확 F2 적용[true,false,true]/추천[0,0,1], Node6/Chrome30 및별도순서assertions 확인.
- F1 Node28/Chrome140, 확장loader10, S2182/21/12·source74/helper23·추가80·JS92/Python92/week10.
- 직접 자동8suite621 pass/0fail/1skip. command/TAP/hash는 execution_manifest/test_summary.
- 고정2026-10-08 22:40의190곳·176후보 ON/OFF 전체signature·상위10 불변. 과거자료는덮어쓰지않음.
- S1-R171 누락0·일반17 오탐0·서버현장소식/본인삭제/승인/집계 합성회귀.
- Chrome 기본245·문자열10·typed4/today3/발행객체2, 원형lifecycle35/45·이전control50/55·선상40/65는실패원장보존.
- 안전lifecycle45/45·builder-shaped정상control10·혼합거부정상유지5 통과.
- 최신main TMAP변경 때문에제품7/8 동일이며strict8실패원장보존; 자동5JSON·최종notices는mainblob보존.
- 추천/loader/live/parser137동일·siteData전체JSON/좌표190 동일. mainnavigation12보존.
- 최신mainunit71/73, field2실패는exactmain에도같은구문/문구 기대불일치; PR신규회귀아님. 전체621에합산안함.
- 현재today04:16/reference190/scoreAllowed0과유효week176후보/최종10safeeligible를 actual07:00KST 검증.
- 최신notice3추가 입력도부적격復帰0·safeeligible전수/현재top 동일. 현자료제보OFF, 과거ON스냅샷혼용0.
- 최신main Chrome5폭55/55, 빈목록/복구10, scopedTMAP20. 원형45/55·초기nav15/20은보존.
- b12 Actions/status0·전용CI미구축. 기존mainweather/tide schedule성공과별도. dispatch/rerun0.
- 공개WorkerGET401/admin429로현재version·보호rollback미확인. token/raw설정/source저장·authrefresh·POST/D1/배포0.
- 임시 .scratch는 절대경로를확인해 증거보존후정리했다. 사용자checkout제품무변경.

최종 보고서: F23_RECHECK.md. 이전 F123/R1~R6/분석을 처음부터 반복하지 않는다.
증거: results/f23-b12e20c/{contract,dom,loader,root_contract,root_loader,root_chrome,root_generated_dom,finalmain,finaldom,deployment_readonly}.
최종공지: finalmain/final_notice, 최신Chrome: finaldom/FINAL89_DOM_REPORT.md.
재현scripts: scripts/f23-b12e20c. exact명령/clock/hash/exit는범위별manifest, root_execution_manifest.
보조 DOM 문서의615 언급은이전회귀수치의문구이며 이번b12실제자동집계는test_summary의621이다. 원형수치를완료성공으로덮어쓰지않았다.

남은 운영 승인 조건:
1. 현재 공개Worker version·S1-R 보호유지rollback·Pages rollbackSHA를운영권한보유자가읽기검증한다. 과거문서ID로대체금지.
2. 서버배포로과거공개자료재분류/철회/fieldhide가발생하면기존oldGET 삭제마커/보호역전P1을그전환전에해결한다. 영향없음은운영근거로명시한다.
3. 전용CI없음을명시하고exactSHA독립실행증빙을병합검토근거로채택한다. PR현재draft이다.
4. 별도사용자승인후에만서버S1-R→보호읽기확인→Pages→자동기상validator/추천제외·복구확인순서를검토한다.
5. R5·S1-P·선상대표기상/출항안내는잔여별도범위. 이번PR이해결했다고보고하지않는다.
검증자는제품수정·main병합·Pages/Worker배포·D1·실사용자수정을하지않는다.

새SHA로재개할때:
- AI_WORK_RULES/F23_RECHECK/FINDINGS 및PRhead/diff/새보고만읽고영향시험을재실행한다.
- 최종main이추가변경되면Gitdiff로공지/자동JSON/제품변경을구분한다. 원형자료를덮어쓰지않는다.
- git archive로정확head와새merge-tree archive를 docs/p1-s-review/.scratch 내에재생성한다. 실제branch merge금지.
- review의역사적 index는제품테스트에사용하지않는다.
- 개인정보/좌표는값대신hash; API·Chromeprofile·secret운영설정원문저장금지.

대표명령은 manifest의절대경로인자로실행:
node <scripts>/contract/contract_matrix.mjs <exacttarget> <out> <analysis> <combined>
node <scripts>/loader/loader_contractF_node.mjs <target> <out> <head>
LOADER_WIDTHS=375 node <scripts>/loader/loader_contractF_dom.mjs <target> <out> <head>
<Python> <scripts>/contract/python_contract.py <target> <out>
C_GENERATOR_FIXTURE=<fixedsparse6h> node <scripts>/dom/additional_generated_object_dom.mjs <target> <out> <head>
node <scripts>/independent_replay.mjs <review> <analysis> <out>
node <scripts>/protection_regression.mjs <target> <out>

환경:
review C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap
analysis C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome C:/Program Files/Google/Chrome/Application/chrome.exe
PYTHONUTF8=1, PYTHONDONTWRITEBYTECODE=1.


## b12e20c 최종 게시 및 readback 완료 (2026-10-11)
보고서 증거 commit: `dde70ebe2b1be6802d352298766feb8ac92b5b96`.
- PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6102686789
- Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6102688337
두 댓글을 API로 다시 읽어 준비한 2,199자 본문과 각각 전체 일치함을 확인했다. 본문은 `results/f23-b12e20c/FINAL_F23_COMMENT.md`, 게시 증빙은 `results/f23-b12e20c/github_receipts.json`에 저장했다. 최종 판정은 조건부 승인이다. 운영 승인 조건은 F23_RECHECK.md 및 NEXT_SESSION.md에 기재했으며 제품 코드·main·Pages/Worker·D1·실사용자 데이터를 변경하지 않았다. 검증 브랜치 증빙 저장을 완료한 후 별도 운영 승인을 기다린다. 마지막 증빙 commit은 review/p1-s-pr13의 git log -1에서 확인한다.


Worker 추가 확인 게시 완료: [PR #13](https://github.com/wooil1964/birdmap/pull/13#issuecomment-6102822780), [Issue #9](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6102823104). 두 댓글의 870자 본문을 API로 재조회해 전체 일치를 확인했다. 증빙은 results/f23-b12e20c/worker_versions_github_receipts.json, 본문은 WORKER_VERSIONS_COMMENT.md. 현재 Worker 확인 조건만 해소됐으며 보호 유지 rollback 및 별도 운영 승인 조건은 남는다.
