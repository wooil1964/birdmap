# PR13 b12 × 2026-10-11 main 실제 현재 재검증

- PR head: `b12e20c1b6d856a021898a0c1c9221b30393a221`; latest main: `b596cdc8ede83fe25e64ec10b2dc88d4141673b2`.
- 임시 결합 tree: `2c3703e7234f9f0ab02786f03d03a2314bf5cfcf`. fetch/ls-remote 확인, merge-tree exit 0·충돌 0. 실제 branch merge·checkout·제품 변경·배포·D1·실사용자 쓰기 없음.
- 원본 archive: `C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/.scratch/combinedLatest`.
- 새 main은 자동 데이터 외에 TMAP 내비게이션/팝업 링크를 index.html에 추가했다. 따라서 제품 8개 b12 blob 동일성은 **7/8이며 strict assertion exit 1**이다. 실패를 그대로 보존했다. 자동 JSON 5개는 모두 최신 main Git blob과 바이트 동일하고 archive는 LF 정규화 후 blob과 일치한다.
- 영향 교차: 추천·저장·loader·live·parser 137개 실제 함수의 SHA256은 b12와 모두 동일. 추천 constants도 동일. 새 내비게이션 12개 함수는 결합과 main이 동일. siteData 190곳 전체 JSON·좌표는 head/main/combined 사이에 모두 동일하며 결과에는 원본 좌표 대신 digest만 남겼다.

## 실제 현재 데이터

Python 검증 시계는 **2026-10-11 06:50:11~12 KST**, Date/datetime.now 및 제품 소스 패치 없이 실행했다. today는 date 10/11, siteCount 190·scoreEligibleCount 190; week는 10/11~10/17, samples 10640·eligible 10640. 두 자료의 generatedAt은 **10/11 04:16 KST**, refreshedAt은 **04:18 KST**다. 실제 Python today/week validators는 모두 통과(exit 0)했다. 런타임 190곳을 투영하거나 데이터 날짜를 바꾸지 않았다.

JS 실제 평가 시계는 **2026-10-11 06:51:54 KST**다. 저장된 today 190곳은 root/item 원문 발행시각이 190/190 같지만 현재 latestDue **05:35 KST**보다 오래되어 모두 `today_reference`, `dataCurrent=false`, `scoreEligible=false`, `stale=true`이며 scoreAllowed는 0이다. Python 저장 스키마 통과와 브라우저 현재 추천 적격은 서로 다른 판정이다.

실제 주간 docVerified는 true이며 주간 예보 후보 **176**, 최종 추천 **10**이 나왔다. 최종 10개는 모두 실제 safe·eligible 검사를 통과했고 exception은 0이다. 최근 제보는 최신 public snapshot이 제공되지 않아 브라우저 초기 빈 상태(reports OFF)로 평가했으며 10/8·10/10 고정 snapshots를 불러오지 않았다. 이 결과는 production 최근 제보 ON 순위를 주장하지 않는다.

| 순서 | ID | 탐조지 | 기상/표시/정렬 | 추천 시각(KST) |
|---|---|---|---|---|
|1|7|교동도|92/92/92|10/11 09:00|
|2|8|석모도|92/92/92|10/11 09:00|
|3|10|강화도|92/92/92|10/11 09:00|
|4|15|천수만 사기리|92/92/92|10/11 09:00|
|5|126|해리천습지|92/92/92|10/11 09:00|
|6|107|매향리|92/92/92|10/11 18:00|
|7|14|걸매리|91/91/91|10/11 18:00|
|8|48|대진항|92/92/92|10/11 09:00|
|9|3|굴업도|100/100/100|10/12 15:00|
|10|5|대청도|100/100/100|10/11 15:00|

## 새 main 영향 unit 검증

- 실제 `test_today_weather_midnight.mjs`: 17/17, exit 0.
- 실제 `test_site_history_cache.mjs`: 16/16, exit 0.
- 실제 `test_data_autorefresh.mjs`: 31/31, exit 0.
- 실제 `test_field_news.mjs`: 7/9, exit 1. Kakao 버튼 기대 문구가 옛 `카카오맵 찾아가기`이며 실제 main 문구는 `카카오맵`; 다른 실패는 옛 자동 window.open 코드의 `opened.opener=null`을 기대하지만 main은 앱 chooser 직접 선택으로 바뀐 데서 발생한다.
- exact main 최소 archive에서도 같은 field_news **7/9·exit 1**, 두 실패 원인 및 test blob이 동일하다. PR 신규 회귀로 판정하지 않는다. 기존 unit/CI 전체 성공 숫자에 이 실행을 합산하지 않는다. 제품 guard/assertion/test 기대값은 수정하지 않았다.

완료된 F2/F3, 기존 621/615 등 전체 회귀, 과거 고정 시각 22:40 시험을 반복하지 않았다. 이번 검증은 최신 main 결합·출처 보존·실제 현재 상태·위 4개 unit에 한정한다. Chrome DOM 확인은 별도 agent 결과로 분리한다. 현재 평가에서 부적격 저장 today가 최종 추천으로 채택되는 증거는 없었고, 기존 배포 승인/운영 조건의 충족을 이 결과만으로 주장하지 않는다.

`source_manifest.json`에는 원격 refs·tree·자동 5/제품 8 raw blob SHA256·archive LF 교차·실패한 strict 조건을 보존했다. `main_delta_impact.json`은 137함수·12 main navigation·190 site/coordinate digest·baseline 비교를 담는다. `latest_main_validator.json`, `js_current190.json`, `unit_checks.json`, `main_field_news_baseline.json`에 실제 시계와 결과를 보존했다. CLI·초기 객체 부재·exit 결과는 `execution_receipts.json`, 복사할 파일의 hash는 `artifact_manifest.json`을 따른다.