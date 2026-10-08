# 재개 체크포인트 — P1-C 완료, 다음 P1-D

분석브랜치 analysis/recommendation-masterplan, 작업트리 C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap. 시작8bd44e3에서C를완료했다. 최신완료SHA는아래로확인한다. 이문서를포함하는C완료commit/push뒤D를진행한다.

완료:A측정/B새기상·1000순열×2·세대안/C12정책·12×190행·12,000목록독립대조·API집계/보호합성·P0음성검증. 완료분석을처음부터반복하지않는다. 후보176고정,cap0≠OFF,16/12/8목록같음,방문일108가점11→7. 기존보호suffix/구분자와weekly null score계약결함은운영노출과구분해기록했다.

최신확인main4fc14b3. 실험35141c0/2026-10-08T22:40:00+09:00, _snapshots/input_manifest_35141c0_2240.json, 무손실기상gzip2개,조석/공지190곳/기존승인집계11곳 SHA af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6. 새자동자료를섞지않는다.

## 재현 명령

```sh
git log -1 --format='%H %s' analysis/recommendation-masterplan
git status --short
node docs/recommendation-masterplan/_scripts/analyze_p1c.mjs --write
node docs/recommendation-masterplan/_scripts/independent_p1c.mjs
node docs/recommendation-masterplan/_scripts/p1c_recent_species_contract.mjs
node docs/recommendation-masterplan/_scripts/p1c_aggregation_contract.mjs
node docs/recommendation-masterplan/_scripts/p1c_negative_fixtures.mjs
node docs/recommendation-masterplan/_scripts/p1c_null_score_contract.mjs
```

independent stdout는_results/p1c_independent.json에보존했다. 다른합성script는_results에만저장한다. Node24(node:sqlite) 및로컬Python이필요하다. nullscore script는BIRDMAP_PYTHON 또는arg4로Python경로를지정한다. 합성API는SQLite메모리+외부요청차단,운영D1/API/POST없음.

Windows회귀:
```powershell
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONDONTWRITEBYTECODE='1'
node --import ./docs/recommendation-masterplan/_scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
$apiTests=@(Get-ChildItem reports-api/test -Filter '*.test.mjs' | ForEach-Object {$_.FullName})
if($apiTests.Count -eq 0){throw 'No API test files'}
node --test $apiTests
```

주간126/API동작170. 옛local-test/*.test.mjs에는파일이없다. 빈배열로node --test를실행하면전체자동발견이실행되므로Count확인이필수다. 별도broadJS227은겹치는시험이므로합산하지않는다. Python48/조석21+1skip은이전기록. 현재C자료는p1c_reports/independent/recent_species_contract/aggregation_contract/negative_fixtures/null_score_contract.json,회귀TAP세개다.

## 다음 정확한 작업 — P1-D

1. C완료commit/push/clean확인뒤시작. 최신remote main은읽기전용확인,고정input보존.
2. 현행max16 ON/OFF 실제176후보·score/date/tide/notice/safety/null190결과보존. A1로배열효과고정.
3. 현행4/3/1/2,전역rank,유연최소정원+전역보충을같은후보·점수로비교. 숫자는정책가설,생태최적값아님. 선상최대1·중복제외·P0/계절관문유지.
4. global은축별priority/core/date prefix까지변경하므로순수정원인과와혼동하지말것. 각축기존prefix유지한정원만변경대조를추가.
5. 제외14곳의조석/계절/유효기상단계와후보166미선발을구분. quota축≠weatherRule≠실제서식환경.
6. 지역/유형분포,rank/raw/display합과전역숫자상한차이,목록안정성평가. 독립선발/최대score대조,부족분fill·mixedseason의원문계약검증.
7. JSON/script/P1_DESIGN/FINDINGS/PROGRESS/NEXT_SESSION갱신후D별도commit/push。Issue9C/D보고와최종P1추천/미검증정책구분.
8. 보호입력·유효score계약 보완지시포함. 장기생태/노력/종별자료·P2~P4는미완료로남긴다.

운영코드/main/자동JSON/Pages/Worker/D1/원좌표 수정·배포금지. 사용자승인없이IDtie/가점/정원/보호parser적용금지.
