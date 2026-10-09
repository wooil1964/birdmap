# PR #13 P1-S 최종 독립 재검증 — 1bd26199

## 1. 종합 판정: 수정 필요

기존 R1·R2·R3 차단 사유는 해결됐다. 필수 회귀 스위트는 **563 pass, 0 fail, 1 skip**이며, 최신 main과의 임시 결합·기상 validator·정상 추천 전수 비교·5폭 브라우저 기능 검증도 통과했다.

그러나 정상적인 **today 만조 fallback의 추천 카드가 유효한 92점을 “오늘 적합도 미확인”으로 표시하는 신규 회귀 R4**가 실제 제품 함수와 실제 Chrome DOM에서 재현됐다. 동일 장소의 팝업은 92점을 표시한다. 안전 검사·후보 선발·순위는 유지되며 정상 점수 표시의 회귀다. 병합 전에 공통 기상 변환과 카드 회귀 시험을 보완해야 하므로 현재 SHA를 최종 승인하지 않는다.

코드 수정·실제 main 병합·Pages/Worker 배포·운영 D1 변경·실사용자 제보 등록/삭제는 수행하지 않았다. 본 보고는 검증 문서와 합성 결과만 변경한다.

## 2. 검증한 커밋·입력·방법

- 정확한 PR head: **1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c**.
- 이전 차단 head: 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e.
- 최종 원격/API 확인 main: **38b45299c832b8ab8ad549762c02979fa8ddfb28**. PR draft/open/unmerged, head 변경 없음.
- 원 설계의 고정 코드: 35141c04d4fd152982b1f4683d5b7a6f4f7514e5.
- 정상 회귀 시계: **2026-10-08 22:40 KST**. 190곳·고정 기상 today/week·조석·공지·규칙·공개 승인 집계11곳/종명문자열24개. manifest16파일과 제보 SHA256을 검증했다. 최신 자료를 섞지 않았다.
- 계약 합성 시계: JS 2026-10-10 08:00 KST, Python 10월8일22:40. 시계만 고정하고 제품 guard는 그대로 실행했다.
- 브라우저 최신자료 결합 시계: **2026-10-09 16:40 KST**, main 기상 생성 **16:28 KST**. 이 입력은 고정 정상 회귀와 별도다.
- 이전 FINDINGS/PROGRESS/NEXT_SESSION·AI_WORK_RULES·설계·인수인계·보완 댓글6079662025와 실제 전체 diff를 읽었다. P1-A~D를 다시 분석하지 않았다.
- 별도 archive에서 실제 소스를 실행하고 Git blob과 CRLF 정규화 후 동일함을 확인했다. 검증 worktree의 제품 source는 이전7eb 그대로이며, 새 제품은 임시 archive에서 실행했다.

PR/main merge-base 기준 변경20파일, 이전7eb→새1bd 변경14파일이다. 제품 핵심은 index.html, today validator, 기존 shared.js 보호 표현이다. 이번1bd 보완에서 reports-api 제품 source, weather-proxy 제품 source, Python 생성기는 7eb과 동일하다. 비교·테스트·인수인계/결과 문서 변경을 제품 변경과 구분했다.

## 3. R1·R2·R3 및 P0 판정

| 검증 | 판정 | 독립 근거 |
|---|---|---|
| R1 today 실제 필수자료 | 해결 | wind null/결측/방향 또는 속도 누락·rain null/결측·섬/선상 필수wave null/결측·전체 결측은 정상92/true/빈목록에도 후보 제외 |
| 공지·제보16점·mandatory·정원 보충 | 통과 | 실제 후보와 최종 선발 경로에서 부적격 자료를 되살리지 않음 |
| 정상 차선 예보·대체 만조 | 통과 | 잘못된 최고점수 및 가장 높은 위험 만조를 건너뛰어 같은날/다른날 정상 대안 선택 |
| R2 popup 출처 계약 | 해결 | unknown/null/inherited eligibility, 비정상 결측목록, 실제 필수자료 누락, 출처 없는 raw는 미확인; 정상saved/week-derived는 표시 |
| 참고·live 병합 | 통과 | 이전/참고 기상 정보 유지; 실제 live 함수7조건 및 브라우저3모드×5폭에서 정상점수 유지/미확인점수 부활 차단 |
| R3 자료형·own 계약 | 해결 | 원점수 own number/finite/0~100, own true/빈배열; 주간 선택wave null 허용, 문자열/음수/NaN 거부 |
| 정상 점수 경계 | 통과 | 0·100·92.5 유지, rank108 허용 |
| P0 만조·강수·선상 | 통과 | 만조90분 허용·91/120분 차단, 6/24시간 간격에서도90분 상한; 강수 .999/1mm, 선상풍속6/6.001m/s·파고.7/.701m·양의강수 및 일반파고2m 경계 유지 |

실제 함수 행렬 **182/182**, 특별 분기 **21/21**, popup **12/12**를 root가 직접 재실행했다. 기존 감사의 실패22조건(7+7+8)은 ID별 대조에서 모두 해결됐다. 이 행렬은 후보·최종 선발을 검사하며 정상 만조 fallback의 카드 표시를 검사하는 assertion은 없으므로 R4를 놓칠 수 있다.

추가 계약은 **103조건 중99 통과, 4 불일치**다. R4 정상 표시1건과 아래 R5 합성 극값3건을 성공 수치에 포함하지 않았다. 내부 계절 selector에 invalid entry를 직접 전달하는 시험은 방어가 없으나 실제 최종 함수가 그 전에 score/후보/P0를 검사한다. 실제 운영 우회로 확인하지 않은 내부 직접호출을 제품 우회 결함으로 확대하지 않았다.

Python 실제 validator는 합성 문서49개×today/week=98회 호출했다. today20/week21문서 수락은 “98통과”가 아니라 acceptance 조사다. 유효 score경계와 실제 필수자료 결측 차단은 JS와 일치한다. today의 부적격 자료는 참고 저장을 허용하는 정책이며 화면 점수 허용과 다르다. 비정상 NaN/Infinity JSON 및 boolean score는 거절한다.

## 4. R4 재현 및 필수 수정 요청

검증 코드 위치(정확1bd index.html):
- **3896행** weeklyTideWeather의 정상 today 반환: Object.assign({},raw), 검증된 _weatherState 없음.
- **2086~2088행** weatherScoreAllowed는 _weatherState.scoreEligible===true를 요구.
- **4343행** renderTodayPanel은 entry.score 대신 v251ScoreDisplayText(entry.today)를 표시.
- 정상 popup의 2107행은 storedWeatherState로 출처를 다시 계산하여 정상 점수를 표시한다.

재현: 주간 자료 미수신/해당site 없음, site14, 같은날 만조12:00(브라우저16:40시계에서는17:00)/유효예보 같은시각, score92, own eligible true/빈목록, 북풍3m/s·강수0·파고0.3m, 제보4문자열/16점. 함수 신구 비교와 실제 브라우저에서 다음 결과다.

| 항목 | 7eb | 1bd |
|---|---|---|
| 후보/최종 | 유지 | 유지 |
| raw/rank/안전 | 92/108/true | 92/108/true |
| 추천 카드 | ★★★★★92점 | 오늘 적합도 미확인 |
| 해당site popup | ★★★★★92점 | ★★★★★92점 |

운영 도달 경로는 주간 초기 로더 실패/미수신이다. today·조석은 독립 로더이고 패널도 각각 반영한다. 고정 회귀에는 주간 자료가 있어 R4가 나타나지 않는다. **실제 운영 발생 빈도는 측정하지 않았고 합성 DOM 재현을 운영 장애 관측으로 주장하지 않는다.**

Claude Code 보완 요청:
1. 검증을 통과한 today 만조 fallback에 기존 공통 출처/기상 변환을 연결하여 카드가 정상 점수를 표시하도록 한다. 현재 생성/신선도·만조±90분·실제 필수자료·P0 조건을 유지한다.
2. 출처 없는 raw를 전역 허용하도록 weatherScoreAllowed를 완화하거나 임의로 적격 true를 부여하지 않는다.
3. 실제 renderTodayPanel 카드와 site popup을 함께 검사하는 회귀 시험을 추가한다. 정상0/100/92.5 및 rank108, 잘못된fallback의 미확인/후보제외, 대체만조를 포함한다.
4. 새 head에서 영향받는 시험과 고정190/176·ON/OFF전수를 재실행한다.

현재 판정의 보완 대상은 R4다. 제품 수정은 구현자의 별도 승인 범위이며 검증자가 임의 구현하지 않았다.

## 5. R5 별도 방어 과제 및 계약 한계

3865~3870행 today 정규식과 validate_weather.py 15~17/54~61행은 숫자 문자열의 형식만 검사한다. 숫자부분400자리9인 wind/rain/wave가 JSON 및 두 검사에서 허용되고 Number 파싱은 Infinity다. 합성 wind는 일반후보·최종에 남으며 rain/wave는 P0 최종에서 차단되지만 popup 점수가 표시된다.

**정상 생성기의 실제 유입 증거는 없다.** 생성기는 float/finite 검사 및 canonical .1f 형식을 사용하며 “inf” 표시는 새 regex가 거절한다. 현재 운영 위험 추천이 관측됐다는 뜻이 아니다. P2 방어 보완으로 분리한다: 정규식 후 캡처 숫자의 finite/nonnegative를 JS/Python에서 대조하고 근거 없는 신규 풍속 상한이나 생태 배점을 넣지 않는다.

canonical 정상 출력의 계약은 맞지만 완전한 입력 집합 일치는 아니다. JS는 앞뒤trim 허용/Python 거부, Arabic Unicode숫자는 JS 거부/Python허용, 비필수 week.waveM key생략은 JS허용/PythonKeyError다. 생성기의 정상 출력에서 나타난 회귀는 확인하지 않았다. ASCII·trim·optional key schema를 명시하는 후속 시험으로 남긴다.

## 6. 전체 자동 테스트와 수정 전 실패

| 스위트 | 실제 결과 |
|---|---:|
| reports-api | 178 pass |
| 주간 추천 | 145 pass |
| 프런트9파일 | 110 pass |
| Chrome 공지close7·월간조석13 | 20 pass |
| Python 기상 | 53 pass |
| Python 조석 | 21 pass, 1 skip |
| weather-proxy | 36 pass |
| 합계 | **563 pass, 0 fail, 1 skip** |

reports-api178에는 helper모듈 발견1개가 포함돼 행동case177개다. 조석skip은 공식예시가 rolling대상날짜 밖인 기존 조건이다. 환경 실패를 pass로 바꾸지 않았다. Python 실행 경로 preload와 Chrome 시작 전 외부 Worker/Turnstile/telemetry DNS·Fetch 격리를 사용했다. 정확 명령은 results/r123/execution_manifest.json, 로그는 해당 *.tap.

새 테스트를 old7eb 제품 archive에 복사한 재현:
- 새weekly9조건: **2 pass/7 fail**.
- 새popup4조건: **2 pass/2 fail**(R2-2,R2-4). 보완 보고의 “3fail”은 동일한 old7eb+현재test 조건에서는 재현되지 않았다; 다른 실행 단계의 원인은 자료가 없어 추정하지 않는다.
- Python53방법: **16 subtest 실패**(필수자료13+필수wave3).
- old에 없는 새 helper2개는 함수 추출 NAMES에서만 제거했다. 제품 guard 변경 없이 실제 AssertionError를 재현했고 새head는 전체스위트를 통과했다.

## 7. 190곳·176후보와 상위10 전수 비교

351기준/main38/이전PR7eb/새PR1bd **네 코드×제보ON/OFF**에서 모든190객체의 hash와 후보176·제품안전조건통과176가 같았다. 상위10 ID/순서·원점수/표시/rank·가점·날짜/시각·추천축·좌표hash 모두 동일했다. 별도 tuple/정원 계산12회와 실제 선발도 일치했다. 아래 raw와display는 같고 순서·시각은 네 코드 동일하다.

| 순위 | 제보ON ID·장소 | raw/display | rank/bonus | 날짜·시각 | 제보OFF ID | OFF raw/rank |
|---:|---|---:|---:|---|---:|---:|
|1|108 호곡리|92|103/11|10-09 09:00|112|100/100|
|2|112 알뜨르비행장|100|100/0|10-13 09:00|7|92/92|
|3|15 천수만 사기리|92|94/2|10-09 09:00|8|92/92|
|4|194 천수만 강당리|92|94/2|10-09 09:00|10|92/92|
|5|126 해리천습지|92|94/2|10-09 09:00|126|92/92|
|6|14 걸매리|92|92/0|10-11 18:00|14|92/92|
|7|107 매향리|92|92/0|10-11 18:00|107|92/92|
|8|48 대진항|92|92/0|10-09 09:00|48|92/92|
|9|195 평화의공원|92|108/16|10-09 09:00|3|100/100|
|10|3 굴업도|100|100/0|10-09 18:00|5|100/100|

OFF가점은 모두0이며 OFF의 전체 날짜/축 등은 COMPARE_REPORT.md 및 independent_replay.json에 기록했다. score=null11곳 합성은 정상 실험과 별도: 기존351/main은176후보/가짜0점11, 두PR는165후보/가짜0점0으로 의도된 차단 유지.

제공 compare 스크립트도 실제 실행하여 정상8·합성4조건 및 신규 전체후보 subset signature를 독립 결과와 대조했다. 해당 스크립트는 today를 주입하지 않고 month lookup stub/표시점수 미출력이라는 한계가 있어, 실제 today와 lookup·표시·전체190함수를 실행한 독립 결과로 보완했다. 기존 공개집계24문자열은 보호판정0으로 동일. 원본종별 관찰일/노력/독립관찰자/메모/승인 flag는 집계에 없으므로 생성하지 않았다.

## 8. S1-R·현장소식·삭제·관리자

S1-R는 통과했다. 실제 shared.js 및 API경로에서 보호19종×수량5형식95 + 혼합구분76 = **171 누락0**, 일반종17(갈매기·알락오리·알락할미새·동박새·한국동박새 등) 오탐0. 종명문자열은 재작성하지 않으며 행 전체 보호가 유지됐다. LF/CRLF·세미콜론·중점·쉼표 신규처리 및 과거slash 읽기를 확인했다. 신규slash입력은 기존정책대로 거부하며 과거slash보호 판단과 구분했다.

최근집계18표본, 기존제보등록9, 현장소식등록10, 번식표현거부6, 관리자승인계획3, 실제합성JWT인증/공개취소5, 등록자삭제4가 통과했다. 타기기삭제403·본인삭제200·재삭제idempotent·삭제후GET제외를 확인했다. 승인/감사표준회귀178도 통과했다. 실제 Cloudflare 인증·D1·운영 관리자 설정을 시험한 것은 아니다.

S1-P 승인후전면비공개 정책은 구현하지 않았다. 기존 approved/site-history 정책이 보호표현의 승인자료를 반환하고 현장소식 mobile popup은 대략좌표 길안내를 허용하는 기존동작이 남아 있다. 원본 민감좌표를 조회·출력하지 않았으며 synthetic boolean 결과만 저장했다. 보호 news 길안내와 정확좌표 제한은 기존대로 유지된다. 승인후공개·애매한보호표현·대략좌표 안내정책의 변경은 별도설계/승인이 필요하다.

## 9. 최신 main 결합·브라우저·기존 캐시 위험

git merge-tree --write-tree로 생성한 tree **1be66adcaaff8aa912491f11722f476255b36ed5**, 충돌0. 실제 branch/ref에 병합하지 않았다. main은 공통조상 이후 자동 weather_today/week만 바뀌었으며 PR은 이 JSON을 변경하지 않았다. head index·main두JSON·headtide를 canonical Git blob과 직접 대조했다. main두validator 성공, 결합 weekly145+front110=**255 pass**. 현장소식/삭제 source 공존 및 고정190좌표hash도 유지된다.

Chrome headless 실제 Leaflet1.9.3, 폭344/375/768/1024/1440: **55/55 기능 흐름**, JS예외0. 추천·마커/팝업·unknown/정상/weekly/reference·live합성응답·보호제보·현장소식·본인삭제·일반/보호 길안내·네트워크실패를 검사했다. 초기50/55의5timeout은 harness가 실제DOM에 없는 status 필드를 기다린 오류였다. 실제humidity/온도/풍속/내일값 적용으로 대기조건을 보정하고 root가 전폭재실행했다. 초기결과와timeout진단도 보존했다.

실제 Leaflet CDN을 GET했으며 지도tile은 합성투명 이미지로 차단하여 screenshot 배경이 회색이다. 지도 engine 로딩 실패가 아니다. API 모든 메서드는 실제 handler+메모리DB, Worker/Turnstile/telemetry는 시작전Fetch/DNS차단, GPS/외부길안내는 합성이다. 물리기기키보드/GPS, 운영Turnstile/Access/D1/실제캐시는 미검증이다.

별도 진단(55정상흐름 pass에 포함하지 않음):
- **R4 정상카드 DOM 불일치 확인**.
- 새hidden=true 응답 후 oldfalse 응답이 보호상태와 길안내를 되돌림. 현재 공개 API에는 location_hidden을 변경하는 액션이 없어 **관리자/백엔드보호정책전환을 모의한 조건**이다. 일반사용자가flag를바꾸는공격으로 주장하지 않는다.
- **현재 owner-delete API** 성공→새GET제외→오래된GET완료 순서에서는 fieldUpdates 및 marker가 재등장한다. 이 실행의 뉴스행 재등장은 false였다. 삭제는 메모리DB에 유지되고 다음freshGET에서 다시 제거된다.
- main/new의 관련8함수 동일hash 및 실제함수6조건 동작동일: 이번PR 새회귀가 아닌 기존문제다.

후속 우선순위는 **P1 보안/개인정보 상태보존 작업**으로 높게 유지한다. 삭제 후 UI재등장은 현행API로 도달 가능하므로 우선 sequence/stamp/tombstone·캐시무효화·marker/popup/guide 상태를 설계한다. 보호정책을 바꾸는 S1-P 배포 전에는 보호flag 역전도 필수 회귀로 차단해야 한다. 현재 운영에서 실제민감정보가노출됐다는 증거는 확보하지 않았다. 별도 정책을 검증 중 몰래 구현하지 않았다.

## 10. 최종 보완 지시·재개

**최종: 수정 필요 — R1~R3 해결은 인정하되 R4 정상카드 표시를 병합 전 보완 요청한다.** R5·비canonical 계약정합성은 P2 방어 과제, 기존 현장소식 late-response는 별도P1 보안과제, 승인후전면비공개는 S1-P 승인과제로 구분한다.

전용 review/p1-s-pr13에 문서·재현스크립트·합성결과만 commit/push한다. NEXT_SESSION.md에 정확한 새head재검증 절차를 남겼다. PR13·Issue9에 본 판정을 기록하고 read-back증빙을 저장한다. 사용자의 별도 승인 전 main병합/배포/운영수정은 수행하지 않는다.

상세 증거: results/r123/execution_manifest.json, *_matrix.json, pr13_r123_extended.json, independent_replay.json, pr13_r123_s1.json, e2e_root_combined.json, e2e_source_crosscheck.json, COMPARE_REPORT.md, PR13_R123_SCORE_REVIEW.md. 이전7eb검증결과는 별도 기존파일로 보존한다.


## 최종 게시 완료

PR #13: https://github.com/wooil1964/birdmap/pull/13#issuecomment-6080213498
Issue #9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6080214390
저장된 FINAL_R123_COMMENT.md와 게시본문5198자 일치를 API read-back으로 검증했다. results/r123/github_receipts.json에 증빙을 저장했다. 최종보고 commit8d2e574 및 다음 게시증빙commit은 git log -1로 확인한다. 제품/배포 변경 없이 사용자 승인 또는 새 보완SHA를 기다린다.

