# PR #13 독립 재검증 재개 지침 — 1bd26199 완료

## 완료·현재 판정

정확target: 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c.
main: 38b45299c832b8ab8ad549762c02979fa8ddfb28.
판정: **수정 필요 — R4 정상 today 만조 카드 표시 회귀**.
이전7eb의R1~R3는해결됐으며 새차단사유는 R123_RECHECK.md 4절이다. 제품source·운영환경은변경하지않았다.

독립563pass/1skip, S2 182/21/popup12모두pass, 고정190/176전수·ON/OFF4코드동일, main결합validator2·JS255pass, Chrome5폭55/55완료.
추가계약99/103: R4표시1·R5극값3불일치.기존late-field 보호/삭제 진단은 별도 실패이며 성공에 포함하지 않는다.
중간commit8586ba7/48f720d, 최종저장commit은 git log -1을조회한다. 자기커밋SHA순환삽입하지않는다.
최종댓글·readback는 FINAL_R123_COMMENT.md 및 results/r123/github_receipts.json을확인한다. 기존7eb댓글/결과는보존되어있다.

## 새 구현 후 정확한 다음 작업

1. PR13 최신head/remote main/새diff/인수인계/보완댓글을읽고이번1bd와대조한다. 검증SHA가변경되면 scripts/r123의명시HEAD와제품함수추출목록을새검증사본에서갱신한다. 기존스냅샷/결과를덮어쓰지않는다.
2. R4: weeklyTideWeather today 정상fallback에 검증된출처변환이추가됐는지읽는다. weatherScoreAllowed를출처없는raw허용으로완화하면안된다. 실제card와popup 모두0/100/92.5를표시하고rank108/만조90분/필수자료/신선도정책을유지하는지시험한다.
3. week초기미수신/해당site없음+today/조석정상자료의 실제 renderTodayPanel DOM을다시실행한다. old1bd에서카드미확인/팝업92, new에서같은정상표시가됨을재현한다. 비정상today는후보없음/미확인유지.
4. 영향받는회귀/계약/P0/고정190/176·ON/OFF·최신main결합을재실행한다. 최신main자동JSON을덮어쓰지않는다.
5. R5 finite 문자열/ASCII·trim·optionalkey가보완됐다면 합성JS/Python을대조한다. 정상생성유입미확인권고와현재계약불일치를구분한다.
6. 기존cache는P1보안별도: 실제ownerdelete→freshGET제외→lateGET이후marker부활을차단하는정책설계. backend보호전환시flag역전도S1-P배포전회귀로차단한다. 승인후전면비공개·대략길안내정책을검증중몰래구현하지않는다.
7. 새최종문서/체크포인트commitpush→PR13/Issue9판정댓글→readback→게시증빙commitpush→사용자보고. 운영병합/배포는사용자별도승인까지금지.

## 재현 환경

Review: C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap (review/p1-s-pr13)
Analysis: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
Python: C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe

제품 archive는 review/docs/p1-s-review/.scratch 아래에 git archive1bd 및 merge-tree1be66adcaaff8aa912491f11722f476255b36ed5로복원한다. archive는검증용제품사본이며commit하지않는다. worktree 제품은7eb그대로이므로 새테스트를그곳에서실행하면안된다.

```powershell
git merge-tree --write-tree 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c 38b45299c832b8ab8ad549762c02979fa8ddfb28
git archive --format=zip --output=docs/p1-s-review/.scratch/target1bd.zip 1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/target1bd.zip -DestinationPath docs/p1-s-review/.scratch/target1bd
git archive --format=zip --output=docs/p1-s-review/.scratch/combined1bd.zip 1be66adcaaff8aa912491f11722f476255b36ed5
Expand-Archive -LiteralPath docs/p1-s-review/.scratch/combined1bd.zip -DestinationPath docs/p1-s-review/.scratch/combined1bd
node docs/p1-s-review/scripts/r123/pr13_r123_actual_matrix.mjs docs/p1-s-review/.scratch/target1bd docs/p1-s-review/results/r123 <analysisRepo>
node docs/p1-s-review/scripts/r123/pr13_r123_extended.mjs docs/p1-s-review/.scratch/target1bd docs/p1-s-review/results/r123 <analysisRepo> docs/p1-s-review/results/r123/baseline7eb_actual_matrix.json
node docs/p1-s-review/scripts/r123/independent_replay.mjs . <analysisRepo> docs/p1-s-review/results/r123
node docs/p1-s-review/scripts/r123/pr13_r123_s1.mjs docs/p1-s-review/.scratch/target1bd docs/p1-s-review/results/r123
node docs/p1-s-review/scripts/r123/pr13_r123_existing_policy.mjs docs/p1-s-review/.scratch/target1bd docs/p1-s-review/results/r123
node docs/p1-s-review/scripts/r123/pr13_r123_e2e.mjs docs/p1-s-review/.scratch/combined1bd <newTempOut> 2026-10-09T16:40:00+09:00
```

실행명령7스위트는 results/r123/execution_manifest.json. Python UTF8/PYTHONDONTWRITEBYTECODE/BIRDMAP_PYTHON 및browser시작전DNS/Fetch격리를설정한다. 새resultdir사용을권장한다. 이전재현의본표시R4추가assertion은스위트563에없다.

합성E2E예외0/55pass와R4·late진단은분리한다. status DOM필드는제품에없으므로live적용을humidity/온도/풍속/내일DOM으로검사한다. screenshot회색map은외부tile을합성투명처리해서이며Leaflet로드실패가아니다. 물리기기/운영Access/Turnstile/D1은미검증이다.

.scratch/profile/제품archive는결과를복사한후절대경로가review/docs/p1-s-review/.scratch인지검증해nativePowerShell LiteralPath로삭제한다. 검증branch에는docs/p1-s-review만추가한다. 민감원자료·비밀·실제제보좌표는저장하지않는다.

