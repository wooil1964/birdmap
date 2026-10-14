# PR #24 독립 검증 — 보강 후 PASS, 운영 승인 대기

## 정확한 대상과 결론

원본 PR head `519b4bd18a55bb11ed8e0f6a53e18e691b5afc82`, 최신 main `efe1c1b97b8f2da0e52ce45bedce031c915ed522`, 검증 보강 후 Draft head `6195c357e76201fee6625155b29c6148f73feef1`. 원본 제품 선발 코드에서 안전/기존 prefix 위반은 발견하지 않았지만 완화된 signature gate의 검증 공백9종을 확인했다. 실제 제품에서 오류가 발생하거나 민감정보가 유출됐다는 증거와 구분한다. 사용자 승인 범위에 따라 **검증 파일4개만 Draft 브랜치에 보강**했고 `index.html` 제품 알고리즘은 원본519와 동일하다. 보강 후 전체 CI·독립 재생·Chrome·D1 회귀를 통과했다. main 병합·운영 배포 승인/실행은 아니다.

## CI 원본 로그의 SHA 연결

| 구분 | PR head | 실제 CI checkout | run | 집계 |
| --- | --- | --- | --- | --- |
| 원본 | 519b4bd18a55bb11ed8e0f6a53e18e691b5afc82 | 2edbe6ab22880184ef855c1184aee3330244f734 | 38525333687 | 1191 PASS /0FAIL /1SKIP |
| 최종 | 6195c357e76201fee6625155b29c6148f73feef1 | 8d73af5c64b79a0a28c53fec5889f5ec2157d6a7 | 38539112245 | 1226 PASS /0FAIL /1SKIP |

두 checkout은 GitHub의 임시 PR merge이며, 각각 main efe1c1b + 해당 head의 부모를 확인했다. 실제 main 병합이 아니다. 최종 CI checkout tree와 로컬 merge-tree가 `82e40ae22355075af3092fbbc4e16a0a456e1942`로 일치한다.

원본 job log115724250437:396201byte, SHA256 `f4d49a4ad6cd18fe4f2b80fb27e5a558a4e1be99ecb0ac438b05f884646f4ed5`; 최종 job115769205193:420607byte, SHA256 `8c68dc8fd64fbb667a5cdb36d81decc5ae8254fa332936dc97ef7313fcc3c941`. REST 원본 byte·run/job/checkout/artifact metadata·로그 줄 근거는 ci/와 ci/final/에 그대로 보존했다. ArtifactZIP은 미다운로드이며 metadata/digest만 확인했다.

| 스위트 | 원본 CI | 최종 CI | 독립 로컬 |
| --- | --- | --- | --- |
| 프런트 | 400/400 | 435/435 | 432/432(보강32단계), 추가문구 후 target35/35 |
| 공개/관리 API | 322/322 | 322/322 | 322/322(자동전체탐색); 최초최상위320별도보존 |
| proxy | 36/36 | 36/36 | 36/36 |
| 공개위치 Chrome | 242/242 | 242/242 | 242/242 |
| 통계 Chrome | 65/65 | 65/65 | 65/65 |
| D1 fence | 13/13 | 13/13 | 13/13 |
| CAS | 10/10 | 10/10 | 10/10 |
| Python 기상/시각/조석/공유 | 103 PASS+1SKIP | 103 PASS+1SKIP | 이번독립로컬 미실행 |
| 추가추천DOM | 해당없음 | 해당없음 | 15/15(5폭×ON/OFF/기상0) |

CI의 프런트에는 기존주간175 및 추가계약35가 포함된다. 추가35를 다시 합산하지 않았다. 로컬432은 최종35 중 경고문구3개를 더하기 전 단계의 전체 결과로 보존했고, 최종435는 정확한 head619의 freshCI에서 검증했다. 구현자 원래 로컬393PASS/7FAIL을 SKIP으로 바꾸지 않았다. 이번 실제 Chrome 경로를 지정한 로컬에서는 그 기존7건도 통과했다. 모든전후 실패원문을 보존했다.

## 원본 완화 게이트의 재현 가능한 실패

원본은 전체 후보 signature 동일성을 유지하므로 생성 단계의 일부 값은 보호했다. 그러나 최종 선택의 `[score,rank,bonus]` 위치별 비교만으로 다음 변조9개를 모두 잘못 허용했다.

| 변조 | 원본게이트 | 보강후 |
| --- | --- | --- |
| 날짜2099 | 잘못허용(검증FAIL) | 거부PASS |
| 시각99:99 | 잘못허용 | 거부 |
| 미등록ID999999 | 잘못허용 | 거부 |
| 중복최종ID | 잘못허용 | 거부 |
| mandatory 뒤집기 | 잘못허용 | 거부 |
| 공지이유삭제 | 잘못허용 | 거부 |
| 조석문구변경 | 잘못허용 | 거부 |
| synthetic zeroScoreCandidates 삽입 | 잘못허용 | 거부 |
| synthetic미등록ID | 잘못허용 | 거부 |

NEGATIVE_CONTROL_LEDGER 및 원본 gate source/hash, test_recommendation_contract의9개 old-accepted/new-rejected assertion으로 보존했다. 같은 triple이라도 ageDays0/1, speciesCount4/5, 비교 단계의 추천일이 다르면 완전 prefix 동점이 아니다.

## 최소 보강한 파일과 계약

변경4파일: `.github/scripts/publication_ci_signatures.mjs`, `compare_p1s_recommendation.mjs`, 신규 `recommendation_contract.mjs`, 신규 `test_recommendation_contract.mjs`. Worker/API/D1/제품선발 함수는 수정하지 않았다.

1. 전체190 registry/좌표 signature와176 모든 후보의 ID별 풍부한 payload를 보존한다: 원/표시/rank/bonus/recentAge/speciesCount/date/time/axes/season/core/priority/mandatory/sortLevel/공지·조석·기상·주의문구·출처 metadata·적격/안전.
2. 최종ID의 후보 소속·중복 금지·typed score·rank=raw+bonus·eligible/safe를 검사하고, 해당ID의 기준 후보와 payload가 완전히 같아야 한다. 화면 요약 projection도 이 payload와 일치해야 한다.
3. 제품 선발 함수를 복사하지 않은 단계별 prefix/정원/중복/혼합계절/다양성/ID 순서의 독립 oracle과 최종 결과가 같아야 한다. 지역 때문에 앞선 prefix를 추월하지 못한다.
4. synthetic의 제외 siteID·전체 후보·zeroScoreCandidates를 확인하고, nulled11곳이 복귀하지 않는지 확인한다.
5. 기존 whole-candidate signature와 위치별 score/rank/bonus 비교도 유지했다. 양쪽 소스의 새 함수3개를 추출하는 comparator 변경은 의존성 추가이며 실제 기상·조석·점수식을 바꾸지 않는다.

## 허용된 ID 교체와 금지된 값 변경

**보존 단위는 동일 ID이다.** 가을 other/mudflat 일반 prefix에는 추천일이 들어가지 않으며, field에는 공지 priority/mandatory가 들어가지 않는다. 따라서 위치별 날짜·mandatory 전체 일치를 강제하면 허용된 B교체까지 잘못 거부한다. 기존 모든 단계 prefix를 그대로 지키며, 교체된 ID의 날짜·시각·상태는 그 ID의 기존 후보값이어야 한다.

| 동일 입력 | 후보 전/후 | 교체 전ID → 후ID 목록 | 불변 |
| --- | --- | --- | --- |
| study174_ON | 174/174 | 112,37,108,7,126,9,57,55,51,110 → 112,37,108,7,126,9,57,55,51,110 | ID별全payload·안전·날짜·시각·점수·가점 |
| study174_OFF | 174/174 | 112,7,8,10,126,9,57,55,3,5 → 112,7,8,20,126,57,9,55,35,63 | ID별全payload·안전·날짜·시각·점수·가점 |
| P1S176_ON | 176/176 | 108,112,15,194,126,14,107,48,195,3 → 108,112,15,194,126,14,107,53,195,3 | ID별全payload·안전·날짜·시각·점수·가점 |
| P1S176_OFF | 176/176 | 112,7,8,10,126,14,107,48,3,5 → 112,7,15,20,126,14,107,53,35,51 | ID별全payload·안전·날짜·시각·점수·가점 |
| latest_main_batch_ON | 174/174 | 37,108,7,15,126,9,57,53,51,116 → 37,108,7,15,126,57,9,53,51,116 | ID별全payload·안전·날짜·시각·점수·가점 |
| latest_main_batch_OFF | 174/174 | 7,15,20,8,126,9,57,53,3,6 → 7,15,20,8,126,57,9,53,35,51 | ID별全payload·안전·날짜·시각·점수·가점 |

study174는 분석399b2f3 날씨+익명화 집계57844c9/13:33:05 KST; P1-S176는35141c0/10/8 22:40 KST; latest-main은efe1c1b의배치발행+1분 시계와동일한10/14 익명화집계를고정했다. 현재실시간 집계와 과거기상을 혼용해 운영실시간목록으로 주장하지 않았다. 최신 배치취득 입력·자료시각은 INPUT_SOURCE_MANIFEST와 replay inputRefs에 있다.

study174 ON은 기존10동일,OFF3곳(10→20,3→35,5→63) 교체 및57/9순서변화. P1S176 ON동일;OFF8→15,10→20,3→35,5→51 교체. 예를 들어 P1S OFF의기타5(10/9 18:00)→51(10/13 15:00)은 위치 날짜변경이지만 other prefix 완전동점이며51 자체의 날짜는바뀌지 않았다. field8→15에서mandatory가달라도field기존prefix에는priority가없고15의기존공지우선정보를보존했다.

## 네 계절·순열·정원·정규화

실제 함수190곳의16개 ON/OFF 시나리오(174고정·176고정·최신main 및 가을/겨울/봄/6월/7월 합성)를검사했다. 각20배열(역순+고정seed 순열),총320순열·1024 독립assertions,새결과변동0. 같은ID candidatepayload와oracle이모두일치했다. 합성날씨는 계절성과 안전계약 시험용이며 실제철새관측자료가아니다.

가을4/3/1/2,겨울3/3/3/1,봄4/3/1/2,6월3/3/2/1/1,7월3/3/2/2 및 성공한 선발 수에 따른보충·ID중복금지·선상조건을확인했다. 겨울·봄·여름의 혼합계절보충/중복축/6월ID48 허용에대한별도읽기전용actual-selector 대조8개도일치(안전 전체시험과합산하지않음).

190지점 전수+alias3=193검사: weeklyRuleGroup은 weather_rules.json의3별칭과일치했다. sido는원문23범주(복합문자열·중국포함)를그대로썼다. 정규화된17행정시도로해석하지않는다. 마지막 numericID 결정성과배열불변을확인했고, 임의무작위추천은없다.

## P0/P1 안전·권한 비간섭 및 최신 main 결합

16개 실제 보호함수 source hash는main과동일;서버/API/proxy71개tracked파일·자동기상/조석/공지/규칙blob도동일하다.190개siteData와좌표 hash동일. nonce/epoch/revision/fresh postflight/primary/숨김·만료/동의철회/CAS/terminal 정책은변경하지않았다. 공개위치Chrome242에는과거15위험이0FAIL로포함된다. D1검사는실제local workerd와합성SQL이며운영바인딩0.

주간175/P0시험의90분절대상한·91분/6h·24h 차단·안전대체만조·강수1mm·선상풍속6m/s·파고0.7m·결측제외 및 API322의보호표현·철회·권한회귀는모두CI에서통과했다. 신규gate는unsafe false뿐아니라선택항목safe===true를증명한다. 보호종전면비공개 같은새S1-P정책은이번에구현하지않았다.

344/375/768/1024/1440px 실제Chrome/Leaflet에서공개보호242·통계65·추천카드15를로컬모의API로통과했다. 추천ON/OFF ID·표시원점수(울릉도rank114를화면114점으로표시하지않음)·적격/안전·카드10·가로넘침없음·전체기상결측안내를확인했다. 모든브라우저operatingRequests=0/externalNonGet=0,에러0. Full P1타이머시험은실시계; 별도추천시험만연구시계로고정했다. 물리GPS/외부앱실행/운영POP·D1검사는미실행.

최신main efe1c1b에대해merge-tree충돌0,자동JSON보존,CI의실제임시merge tree와일치. 실제main병합·배포·D1/실사용자변경0. PR은open Draft/미병합을유지한다.

## 실패 보존·미실행·운영 승인 경계

원본게이트의검증FAIL9종을 성공으로바꾸지않고별도원장에보존했다. 새독립하네스초기실패3개(표시함수추출누락,CRLF구간검색에따른중복선언,GitLF대작업트리CRLF비교)는제품결함과구분해원본로그/실패소스를보존한후수정했다. 추가범위의시험은삭제하지않았고 최종잔여FAIL0.

이번최종판정은 **독립검증 PASS / 운영승인대기**. 기존519검증게이트는수정필요였으며619보강후해소됐다. 통계/지역범주개선을탐조성공·생태다양성개선으로주장하지않는다. 별도사용자승인전main병합·Worker/Pages배포·D1/실사용자자료변경금지. PR24를ready/merge/close로변경하지않는다.

## 재현 명령

```powershell
node --test .github/scripts/test_recommendation_contract.mjs
node .github/scripts/publication_ci_signatures.mjs . 6195c357e76201fee6625155b29c6148f73feef1 b12e20c1b6d856a021898a0c1c9221b30393a221
node docs/pr24-independent-review/replay.mjs
node docs/pr24-independent-review/normalization_audit.mjs
node docs/pr24-independent-review/freeze_manifest.mjs
# whole CI invocation and logs: .github/workflows/publication-security-ci.yml / ci/final
```

Node24.18/Python3.12/Chrome155。필요환경CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe、PYTHONUTF8=1、PYTHONIOENCODING=utf-8。기존로그를덮어쓰기전에별도출력경로를선택한다. 본검증은별도작업트리에서수행됐다.
