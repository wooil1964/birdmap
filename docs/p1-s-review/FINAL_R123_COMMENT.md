## P1-S 최종 독립 재검증 — 판정: 수정 필요

정확한 검증 SHA: **1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c**  
대조: 이전 차단7eb6764 / 최신 main **38b45299c832b8ab8ad549762c02979fa8ddfb28**. 원격/API 최종 확인에서 PR은 draft/open/unmerged이며 head 변경이 없습니다.

**기존 R1·R2·R3는 해결됐습니다.** 다만 정상 today 만조 fallback의 카드 점수 표시 회귀 **R4**를 실제 제품 함수와 실제 Chrome DOM에서 확인했습니다. 병합 전 보완이 필요합니다. 안전 검사·선발·순위는 유지되며 표시 회귀입니다.

전체 보고서·정확 실행 명령·합성 결과·재개 지침은 검증 전용 브랜치의 [최종 독립 보고서](https://github.com/wooil1964/birdmap/blob/8d2e574baf0f14ab544ccb07c291dc0db21ab9db/docs/p1-s-review/R123_RECHECK.md)에 기록했습니다. 검증자는 제품 코드를 수정하지 않았습니다.

### 1. 기존 차단 사유 및 P0

- R1: 정상92점/own true/빈목록이라도 실제 wind 방향·속도/rain/필수wave가 null·결측이면 후보 제외. 공지·제보16점·mandatory·정원 보충 우회 차단. 정상 차선예보·대체만조 유지.
- R2: 누락/null/상속 적격 metadata, 잘못된 결측목록, 실제자료 결측, 검증 출처 없는 raw는 점수 미확인. 정상 saved/week-derived 표시 및 기상 참고값 유지. 실제 live 병합7조건과 브라우저3모드×5폭에서 미확인점수가 되살아나지 않음.
- R3: 원점수 own number/finite/0~100, own true/빈배열. 선택wave null 허용, 값이 있으면 문자열·음수·NaN 거부. 정상0/100/92.5·rank108 유지.
- P0: 만조90분 허용,91/120분 차단,6/24시간 간격90분 상한, 다른 날짜/같은날 대체만조, 강수 .999/1mm, 선상풍속6/6.001m/s·파고.7/.701m·양의강수 경계 통과.

실제 계약행렬 **182/182**, 특별분기 **21/21**, 팝업 **12/12**를 독립 재실행했고 이전 감사의 실패22조건은 모두 해결됐습니다.

### 2. R4 — 병합 전 필수 보완 요청

제품 코드 연결:
- [index.html:3896](https://github.com/wooil1964/birdmap/blob/1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c/index.html#L3896): weeklyTideWeather의 정상 today fallback이 Object.assign({},raw)로 출처 상태 없이 반환.
- [2086~2088](https://github.com/wooil1964/birdmap/blob/1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c/index.html#L2086): 새 표시 계약은 검증된 _weatherState.scoreEligible===true를 요구.
- [4343](https://github.com/wooil1964/birdmap/blob/1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c/index.html#L4343): 추천 카드가 해당 weather 객체로 표시 점수를 계산.

주간 자료 미수신/해당site 없음 + today·조석 정상, site14, 같은 시각 만조/예보, raw92/true/빈목록, 북풍3m/s·강수0·파고0.3m, 제보16점:
- 이전7eb: 카드92점 / popup92점.
- 새1bd: **카드 “오늘 적합도 미확인” / popup92점**.
- 양쪽 후보·최종·안전true·raw92·rank108 동일.

주간 초기로더 실패에서 도달 가능한 경로이며 운영 발생 빈도는 측정하지 않았습니다. 실제 운영 장애 관측으로 주장하지 않습니다.

**Claude Code 보완 요청:** 검증된 today 만조 fallback에 기존 공통 기상/출처 변환을 연결하고 실제 renderTodayPanel 카드+popup 회귀 시험을 추가하십시오. 0/100/92.5·rank108·정상/비정상fallback·90/91분·대체만조를 확인하십시오. 출처 없는 raw를 전역 허용하도록 display guard를 완화하거나 임의 적격true를 부여하지 마십시오. 보완 후 새 SHA로 재검증합니다.

### 3. 독립 자동 테스트

| 스위트 | 결과 |
|---|---:|
| reports-api |178 pass|
| 주간 추천 |145 pass|
| 프런트9파일 |110 pass|
| Chrome 공지close7 + 월간조석13 |20 pass|
| Python 기상 |53 pass|
| 조석 |21 pass,1 skip|
| weather-proxy |36 pass|
| **전체** |**563 pass,0 fail,1 skip**|

178에는 helper모듈 발견1개가 포함됩니다. 조석skip은 공식예시가 rolling날짜 밖인 기존 조건입니다.

새 테스트를 old7eb 제품에 복사해 실제 AssertionError를 재현했습니다: weekly9중7fail, popup4중2fail(R2-2/R2-4), Python16subtestfail. “popup3fail” 보고는 동일 old7eb+현재test 조건에서는 재현되지 않았으며 원인은 추정하지 않습니다. 제품 guard는 수정하지 않았습니다.

추가 계약 **99/103**: 정상 카드 R4 1건 + 아래 R5 합성 극값3건 불일치를 통과로 계산하지 않았습니다. Python49×2=98문서 호출은 acceptance 조사이며 “98통과”가 아닙니다.

### 4. 정상 추천·보호·현장소식

고정 **2026-10-08 22:40 KST**, manifest16파일·190곳·공개집계11곳을 그대로 사용했습니다. 351기준/main38/7eb/1bd 네 코드×제보ON/OFF에서 후보176·안전predicate통과176 및 전체190객체/좌표hash·상위10 ID/순서/raw/display/rank/bonus/date/time/축이 같았습니다. 독립 정원/tuple 선발12회와 제품도 일치합니다.

- ON: **108,112,15,194,126,14,107,48,195,3**
- OFF: **112,7,8,10,126,14,107,48,3,5**
- raw/display: ON 92,100,92,92,92,92,92,92,92,100 / rank 103,100,94,94,94,92,92,92,108,100.
- score=null11곳 합성은 두PR 모두165후보/가짜0점0으로 차단 유지.
- 고정자료에는 주간예보가 있어 R4는 드러나지 않습니다. 정상 전수 불변과 fallback 표시 회귀는 함께 성립합니다.

S1-R 보호 표현171누락0, 일반표현17오탐0. 실제최근집계·신규/과거입력·LF/CRLF·수량·혼합행 보호·현장소식 대략좌표·관리자승인/감사 회귀가 통과했습니다. 합성JWT 관리자5조건, 타기기삭제403/본인삭제200/GET제외/재삭제4조건도 통과했습니다.

### 5. 최신 main 결합·PC/모바일

merge-tree **1be66adcaaff8aa912491f11722f476255b36ed5**, 충돌0. main 자동 today/week JSON을 유지했고 두validator 성공·결합JS255pass. 실제 branch/main에 병합하지 않았습니다.

최신main JSON(10/9 16:28 생성), 별도10/9 16:40시계, Chrome/Leaflet1.9.3에서 **344·375·768·1024·1440px,55/55 기능흐름,JS예외0**. 추천·팝업 미확인/정상/참고·live합성·마커·제보·현장소식·삭제·길안내·네트워크오류를 검사했습니다.

초기5폭 live timeout은 harness가 존재하지 않는 status DOM필드를 기다린 오류였습니다. 실제humidity/온도/풍속/내일값 적용으로 수정하고 root가 전폭 재실행했습니다. 최초출력/진단도 보존했습니다. 지도tile은 합성투명으로 차단했으며 Leaflet 로딩 실패가 아닙니다. 물리기기/GPS·운영 Access/Turnstile/D1은 미검증입니다.

### 6. 별도 후속 위험·범위

**R5/P2 방어:** today regex가 숫자400자리 wind/rain/wave를 허용하며 파싱은 Infinity입니다. JS/Python 합성 재현은 확인했으나 정상 생성기의 실제 유입 증거는 없습니다. regex후 finite/nonnegative 대조 및 ASCII/trim/optional key 계약을 명시하십시오. 근거 없는 신규 기상 상한이나 생태점수를 추가하지 않습니다.

**기존 field 캐시/P1 보안:** [loadFieldUpdates:5172](https://github.com/wooil1964/birdmap/blob/1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c/index.html#L5172)에 응답순서 방어가 없어 오래된 GET이 최신상태를 덮습니다. main/new 관련8함수 hash 동일·6동작 재현입니다.
- hiddentrue→oldfalse 복귀/길안내 재활성화는 backend/관리자 정책전환을 모의한 조건입니다. 현재 공개API로 일반사용자가flag를 바꾸는 공격은 아닙니다.
- 현재 owner-delete 성공→freshGET제외→lateGET에서는 **marker재등장**이 실제 합성 API/DOM으로 확인됐습니다. 삭제 자체는 유지되며 다음 freshGET에서 제거됩니다. 이 실행에서 뉴스행재등장은 false입니다.
- sequence/stamp/tombstone·캐시무효화·marker/popup/guide 상태보존을 별도P1로 우선 처리하고 S1-P 보호정책 전환 전 필수 회귀에 포함하십시오.

승인후보호자료의 기존공개/site-history·대략popup안내·애매한보호표현은 **S1-P 별도설계/승인**입니다. 이번에 전면비공개정책을 몰래 구현하지 않았습니다. 원본 민감좌표나 비밀정보를 저장·공개하지 않았으며 운영유출발생을 주장하지 않습니다.

**최종: 수정 필요(R4 보완 후 재검증).** main 병합·Pages/Worker 배포·운영D1 변경·실사용자 POST/DELETE는 수행하지 않았습니다. 사용자 별도 승인까지 운영 반영을 진행하지 않습니다.

