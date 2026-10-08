# 재개 체크포인트 — P1-S 분석·설계 완료, 구현 승인 대기

- 브랜치: analysis/recommendation-masterplan.
- 작업트리: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap.
- 시작: bee1359. S1 완료: 0a67229127306a2daba19013f895f0f95b2d4ef2 (commit/push).
- 이 문서 포함 S2 보고 SHA: git log -1 --format='%H %s'. Issue 게시 영수증은 마지막 절에 추가한다.
- 최종 확인 main: 18171613923ae5cf0a72512eae805c0005037115. 코드와190곳은35141c0와 같고 자동 JSON5개만 다르다.
- 원본 checkout: fix/recommendation-p0-20261008 / e0fc103, 변경 없음.

## 완료한 작업

P1-A~D는 반복하지 않는다. S1은48입력(legacy48 + 정리저장44 =92관찰, 신규정리거부4), linked2/pending6/field3/status3, 독립taxon70/정상17/시제품반례를 완료했다. S2는 JS156행+특수32, Python28×2=56, 고정 전체top10과후보176 exact 비교를 완료했다.

P1_SAFETY_DESIGN.md 전13절에 두 문제의 대안각2종·8축비교·함수·인수명세·배포/보호유지롤백·승인항목을 작성했다. 현행 회귀는 weekly126/API170/frontend57/weather48/tide21+skip1 통과다. 실제PC·모바일E2E는 미실행이며 구현 후 배포 인수 조건이다.

## 입력과 재현

코드35141c04d4fd152982b1f4683d5b7a6f4f7514e5, 평가2026-10-08T22:40+09.
manifest _snapshots/input_manifest_35141c0_2240.json,16파일SHA/190곳/승인집계11곳 불변.
제보SHA: af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6.
새 groundtruth/공식sources는 _snapshots/p1s_*.json. 결과는 _results/p1s*.json/md/tap.

고정10640sample·최신main10136sample에서 eligible raw 타입/범위 오류는 각각0이다. 최신 기상은 고정 추천 비교에 사용하지 않았다. JS합성 시계는10/10 및 계절별08:00, Python은10/8 22:40, S1/고정추천도10/8 22:40이다.

```powershell
node docs/recommendation-masterplan/_scripts/p1s1_protection_current.mjs . docs/recommendation-masterplan/_results 4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57
node docs/recommendation-masterplan/_scripts/p1s1_protection_prototype.mjs docs/recommendation-masterplan/_results
node docs/recommendation-masterplan/_scripts/p1s1_taxon_current.mjs . docs/recommendation-masterplan/_results
node docs/recommendation-masterplan/_scripts/p1s1_prototype_review.mjs docs/recommendation-masterplan/_results
node docs/recommendation-masterplan/_scripts/p1s2_score_matrix.mjs . docs/recommendation-masterplan/_results
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONIOENCODING='utf-8'
& 'C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' docs/recommendation-masterplan/_scripts/p1s2_python_validator_matrix.py . docs/recommendation-masterplan/_results
node docs/recommendation-masterplan/_scripts/p1s_final_main_audit.mjs
```

Node24 nativeSQLite가 필요하다. 스크립트는 운영POST/외부API/D1을 호출하지 않는다. source 기준이 바뀌면 대조 실패를 재검토한다. scorematrix와 final audit의 최신 날씨 항목은 실행 시 origin/main을 별도로 읽으므로 SHA/발행시각을 보존한다. 새 시점 결과를 남길 때 기존 결과를 덮어쓰지 않도록 별도 디렉터리/파일에 저장한다.

현행 회귀:
```powershell
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONDONTWRITEBYTECODE='1'
node --import ./docs/recommendation-masterplan/_scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
$apiTests=@(Get-ChildItem reports-api/test -Filter '*.test.mjs' | ForEach-Object {$_.FullName})
if($apiTests.Count -eq 0){throw 'No API tests'}
node --test $apiTests
node --test .github/scripts/test_field_news.mjs .github/scripts/test_report_search.mjs .github/scripts/test_site_history_cache.mjs .github/scripts/test_recent_contributors.mjs .github/scripts/test_today_weather_midnight.mjs
& $env:BIRDMAP_PYTHON -m unittest discover -s .github/scripts -p test_weather.py
& $env:BIRDMAP_PYTHON -m unittest discover -s .github/scripts -p test_tide.py
```

## 정책과 남은 인수 조건

S1-R 기존19/6 표현방어와 S1-P 승인후/canonical/uncertain/field 공개 권한 전환을 분리한다. 시험 알 regex는 의미오탐1/조사형누락2, 작은 사전은 coverage누락11로 운영 채택 금지다. 과거 legacy 원문 손실을 복원하지 않으며 신규 원문 보존 계약은 별도다.

S2-A는 number/finite0..100, raw source의 own eligible true, 실제 필수자료, sample선택전/final guard다. 0유효·rank>100유효·16/4312/P0를 유지한다. today previous_saved 숫자는 참고로 보존하며 추천 적격과 구분한다. 공지-only/unknown eligibility 추천 차단은 계약 강화 승인 항목이다.

S1+S2 공동 추천 영향·운영 표기빈도는 원문 행 자료가 없어 미검증이다. 전체 taxonomy/alias/이용허락·정상coverage, 알 문맥·자유 메모, history pagination 성능, field 대략 좌표·월간 집계, 운영mode, 모바일/PC E2E가 인수 조건이다.

## 다음 정확한 작업

1. 게시 전 상태라면 S2 commit/push → Issue9 통합 보고 → GET 댓글 본문 일치 확인 → receipt 저장 commit/push를 완료한다.
2. 사용자에게 설계 완료·실제 구현 별도 승인 필요를 보고한다. 승인 전 운영 코드 수정하지 않는다.
3. 구현 지시가 오면 R/P/S2 정책 승인 범위를 확인하고 별도 기능 브랜치를 사용한다. 분석 브랜치 전체를main에 병합하지 않는다.
4. approved/canonical 보호범위·unknown·알/산란·field메모/대략위치·legacyraw보존·기상없는공지추천제외를 별도로 결정한다. 시험 시제품 그대로 이식하지 않는다.
5. 승인 범위의 실제 수정 전 실패/수정 후 통과와 S1T01~16/S2T01~09, 전체 회귀·브라우저·캐시·롤백을 검증한다.
6. P1 ID동점/max16/quota와 P2~P4 생태 설계는 분리한다. 없는 관찰자·노력량이나 출현 확률을 생성하지 않는다.

main/자동JSON/Pages/Worker/D1/raw제보·좌표/배점16/정원4312/P0 변경은0이다. 설계와 분석 모형 통과는 운영 병합·배포 승인이 아니다.