# 재개 체크포인트 — P1-B 완료, 다음 P1-C

## 브랜치와 마지막 완료

전용 브랜치 `analysis/recommendation-masterplan`에서 이어간다. 실험·독립 검증이 완료된 커밋은 `721513a`이고, 완료 보고 커밋은 2c8f663852df7f413d0dbe347c263e414190b920이며 문서·회귀 증거·이 재개 지침을 포함한다. 체크아웃된 최신 완료 SHA는 아래 명령과 Issue #9의 P1-B 결과 댓글에서 확인한다.

```sh
git log -1 --format='%H %s' analysis/recommendation-masterplan
git status --short
```

사용했던 관리 작업트리는 `C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap`다. 다른 세션/장치에서는 해당 분석 브랜치의 새 체크아웃을 사용한다. 원래 P0 체크아웃을 바꾸지 않는다.

## 완료 단계와 반복 금지

P1-A 첫 측정, 새 기상 비교, P1-B의 실제 전체190곳 호출1000회×2, 세 동점 대안1000순열 비교, 독립 목록·빈도 전수 대조, 주간/민감 보호 회귀를 완료했다. 다시 처음부터 분석하지 않는다.

구성 변동은ON99.8%/OFF100%, 평균교체1.795/3.863이다. 세 대안은 각 정책 내부 배열 변동0이다. A1의 낮은ID우선, A2의 미승인 조건 순서, A3의 분류/다양성 정책 한계가 남는다. [P1_DESIGN.md](P1_DESIGN.md)와 [DECISIONS.md](DECISIONS.md)를 먼저 읽는다.

## 고정 자료

|항목|경로·값|
|---|---|
|P1-A 코드/기상|1f0b0b5ca9d3ef887fc0bd2a159ef73429466a25, _snapshots/input_manifest.json|
|P1-B 코드/기상|35141c04d4fd152982b1f4683d5b7a6f4f7514e5, _snapshots/input_manifest_35141c0_2240.json|
|새 기상 복사본|_snapshots/weather_today_35141c0.json.gz / weather_week_35141c0.json.gz|
|평가시계|2026-10-08T22:40:00+09:00|
|승인 제보|_snapshots/recent_sites_20261008_193204.json, 11곳, 19:32:04취득|
|제보SHA256|af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6|
|조석/공지/사이트|두manifest의해시동일, 190곳|
|순열|xorshift32 seed982451653, Fisher–Yates190개, 1000회한스트림|

최근 live GET을 이 고정 입력에 섞지 않는다. 새 자료는 새 manifest·스냅샷·결과 이름을 사용한다. 기존 파일은 보존한다.

## 완료 분석 재현 명령

저장 결과의 대조만 필요하면 첫 명령을 실행한다.

```sh
node docs/recommendation-masterplan/_scripts/verify_p1b.mjs --write
node docs/recommendation-masterplan/_scripts/compare_weather_p1b.mjs --write
node docs/recommendation-masterplan/_scripts/p1b_policies.mjs --write
node docs/recommendation-masterplan/_scripts/independent_p1b_selector.mjs
node docs/recommendation-masterplan/_scripts/p1b_experiment.mjs --run
```

independent는 stdout만 출력한다. verify는 보존된 독립 JSON을 읽으며, 새로운 독립 계산을 반영하려면 그 파일에 stdout을 저장해야 한다. experiment는100회마다 결과를 저장하며 동일manifest/코드/시계/함수/제보/순열해시가 맞으면 완료 회차를 건너뛴다. 결과ON/OFF가1000회 완료라면 마지막 명령은 캐시 재개 검증이다. 실제2000회 전체 재실행은 ON/OFF 결과를 별도로 보관한 뒤 실시하며 기존 입력은 지우지 않는다.

결과 파일: weather_comparison_p1b_2240.json, p1b_permutations_on/off.json, p1b_alternatives.json, p1b_independent_selector.json, p1b_validation.json, p1b_safety_regression.json. 원문 TAP도 보존됐다.

Windows 주간 회귀 재현(제품코드 수정 불필요):

```powershell
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONDONTWRITEBYTECODE='1'
node --import ./docs/recommendation-masterplan/_scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
node --test reports-api/local-test/*.test.mjs
```

다른 장치에서는 번들 Python 경로를 읽기 전용으로 확인해 바꾼다. reports-api 전체171에는helper파일1개가 포함되므로 명시적*.test.mjs는170개 동작시험일 수 있다. 배포 명령은 실행하지 않는다.

## 미완료 실험과 다음 정확한 작업 — P1-C

1. 먼저 최신 main을 읽기 전용으로 확인한다. 35141c0이후 코드/기상 변경을 분리 기록한다. 기존P1-B 결과를 최신live결과로 다시 이름 붙이지 않는다.
2. weeklyRecentReportForSite/weeklyRecentTieBreak/weeklyRankScore와 handleRecentSites/splitSpecies/isSensitiveReport를 원문으로 조사한다. 최대16점의기존산식·기간합집합과최신일의관계·종명문자열취급을 추적한다.
3. 22:40/35141c0/같은11곳 fixture에서 현행ON/OFF와 최대가점 민감도·기간/종수 처리 대안을 비교한다. 추가 배점은 정책 시나리오임을 명시하고 생태적으로 최적이라고 주장하지 않는다. A1 안정키를 분석 대조군으로 함께 써 배열효과와가점효과를 분리한다.
4. 평화의공원의동박새/동박새2·울새/울새1 등문자열중복의 영향을 조사한다. 승인된 분류동의어 근거 없이 원본제보를 수정하거나 숫자접미사를일괄제거하지 않는다. 현재공개집계에종별날짜/독립관찰자/노력량이없음을 결과에 명시한다.
5. 제보가점·공지·mandatory가만조90분/다른안전만조/강수1mm/선상안전을우회하지않는지 부정fixture로검사한다. 민감종·번식·숨김제보는계속제외한다.
6. 각단위가 끝나면 새분석전용스크립트·결과·FINDINGS/P1_DESIGN/PROGRESS/NEXT_SESSION을 갱신하고commit/push한다. 승인 대기 없이 분석은 진행하되 제품 변경은 하지 않는다.

## 그다음 P1-D

P1-C의권고를구분한뒤 가을4/3/1/2, 부족fill, 중복제외, 선상max1을추적한다. 동일후보/동일점수에서현행정원·전역순위·가변정원참조안을 비교하며 A1을 고정 동점키로 사용해배열효과를통제한다. 최근제보 ON/OFF와지역/규칙군/env/실제 선발축을별도집계한다. 후보에서제외된원인을정원효과로오인하지않는다. 정원을바꾸는정책과A3의동점내분산은서로다르다.

## 남은 범위와 승인 경계

P1-C/D, 봄·여름·겨울 및다중시점동점검증, P2문헌·장기생태자료, P3사용자목적/위치동의, P4장기검증은미완료다. 이번단일10월예보와배열1000회로출현 확률/계절 정확도/탐조성공률을만들지않는다.

운영추천/자동JSON/좌표수정, main병합, Pages/Worker배포, D1쓰기, 실제제보/현장소식등록을하지않는다. 민감원좌표·개인정보를공개하지않는다. 연구·분석은추가승인없이계속하되 운영코드변경은구체적설계와검증후사용자승인을받는다.

## GitHub 보고 저장 완료

P1-B 결과는 [Issue #9 완료 댓글](https://github.com/wooil1964/birdmap/issues/9#issuecomment-6061997861)에 기록하고 다시 조회해 확인했다. 전체 결과·보고 체크포인트는2c8f663852df7f413d0dbe347c263e414190b920다. 그 뒤 재개 문서에 이 수신 확인을 저장했다. 최신 기록 커밋 자체의 SHA는 git log -1로 확인한다.