# PR #13 독립 보안·품질 검증 — 최종 판정: 수정 필요

검증 target: **7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e**. 원격 main: **38b45299c832b8ab8ad549762c02979fa8ddfb28**. AI_WORK_RULES·P1-S 설계·구현 인수인계·14파일 전체 diff를 읽고 별도 review worktree에서 실제 소스와 실행 결과로 검증했습니다.

Claude Code 보완 요청: **S1-R는 통과했지만 S2-A today fallback과 화면 표시 계약이 미완성입니다. 아래 R1/R2를 보완하고 새 head에서 재검증하기 전에는 병합·배포를 승인할 수 없습니다.** 이 검증에서 제품 코드는 변경하지 않았습니다.

## 1. 변경 범위·설계 일치

제품 변경은 index.html, reports-api/src/shared.js, today/week Python validator입니다. 나머지는 테스트·고정 집계·비교 스크립트·인수인계입니다. 종명 숫자를 실제 저장 값에서 제거하거나 가점16/정원4·3·1·2/ID 동점 정책을 바꾸지 않았습니다. S1-P 승인 후 전면 비공개는 구현하지 않았습니다.

## 2. S1-R: 승인 가능

actual shared 및 public/field/admin handler에 대한 독립 before/after 합성 시험에서 보호 표현171개가 모두 보호됐고 일반종17개 오탐은0입니다. 수정 전 보호 누락152개 → 수정 후0개입니다. 저어새·흰꼬리수리·매의 수량 접미사, 혼합 구분자, LF/CRLF, 일반/보호 혼합행, 과거 slash 저장자료를 검사했습니다. 신규 slash 입력 거부는 기존 허용규칙 그대로입니다.

보호 입력이 최근 집계와 가점 입력에서 제외되고, 현장소식 대략 좌표·번식 제한·본인 삭제·승인 및 audit 경로가 유지됩니다. 기존 승인 자료 공개 정책은 변경하지 않았습니다. S1-P의 기존 간접 노출을 해결한 것으로 보고하지 않습니다.

## 3. S2-A: 수정 필요 — 구체적 보완

**R1 [P1] today 실제 필수자료 결측이 최종 추천을 통과합니다.**

[index.html:3855](https://github.com/wooil1964/birdmap/blob/7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e/index.html#L3855)의 weeklyTodayRecommendable은 typed score/true/빈 reason list만 확인합니다. 정상 시각·score92·scoreEligible:true·missingScoreFields:[]에서 wind:null 또는 rain:null을 주면 일반·갯벌·섬 후보가 safe=true/rank108로 최종 추천에 남습니다. required wave:null도 섬에서 통과합니다. 전체 필드 null은 safe=null인데도 최종에 남습니다. 공지·제보16점이 있는 실제 후보→선발 함수로 재현했습니다. 실제 운영 유입·사고를 주장하는 것이 아니라 합성 계약 결함입니다.

- site context를 받는 formatted today adapter로 실제 풍속/풍향·강수 존재·파고 필수 여부를 검사하세요.
- weeklyWeatherEntryForSite(3991/4000), weeklyTideWeather(3867/3874), popup이 동일 계약을 사용해야 합니다. 안전 판정 미확인을 안전 적격으로 취급하지 마세요.
- [validate_weather.py:40](https://github.com/wooil1964/birdmap/blob/7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e/.github/scripts/validate_weather.py#L40)도 같은 실제 필수자료를 검증하세요. 현재 합성 결측 문서를 수용합니다.
- 필수 rain 없는 fixture에 true/[]만 추가한 기존 fallback 테스트를 정상 입력과 결측 거부로 나누세요. 일반/만조/섬·공지/가점/mandatory/정원보충·전체결측을 추가하세요.
- 정상0/100/92.5, 비필수 wave:null, 참고 날씨·조석·previous_saved 숫자 보존은 유지하세요.

**R2 [P1/P2] unknown/필수결측 자료가 팝업에 유효92점으로 표시됩니다.**

[index.html:2079](https://github.com/wooil1964/birdmap/blob/7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e/index.html#L2079)의 !==false 및 weatherScoreAllowed(2083)가 검증되지 않은 파생 적격을 신뢰합니다. actual weatherTodayForSite→v251ScoreDisplayText 경로에서 eligible 누락/null, reason list 누락/null/nonempty, wind/rain/필수wave 결측8개가 모두 별5개92점을 표시했습니다.

own true·빈 list·실제 source 유효성 provenance를 보존하고 current/todayFromWeek/previous_saved/live의 형식별 adapter를 맞추세요. invalid는 미확인으로 표시하되 참고 날씨를 제거하지 마세요. 정상 weekly-derived 표시까지 raw 필드 부재로 차단하지 않도록 회귀하세요.

**R3 [P2] 추가 계약 정합성.** 주간 비필수 wave가 문자열/음수/NaN이면 JS는 후보로 받지만 Python은 거부합니다. null 허용과 non-null 비정상 값 검사를 구분하세요. inherited scoreEligible:true도 메모리 계약 시험에서는 통과하므로 명시적 own flag 요건을 맞추세요. 이것을 JSON만으로 성립하는 운영 공격으로 주장하지 않습니다.

원점수 범위·finite/type·false/누락 eligibility 추천 차단, invalid 최고 예보 대신 정상 차선/대체 만조, invalid null 후보 차단은 해결됐습니다. raw92+bonus16=rank108은 정상이며 유지됩니다.

## 4. P0 회귀

90/91분, 6/24h에서90분 초과 차단, 같은 날/다른 날짜 대체 만조, 강수1mm 및 표시 반올림, 선상6m/s·0.7m·강수0 및 원자료 반올림 방어는 통과했습니다. 다만 R1의 today 실제 결측 차단은 남으므로 날씨 결측 안전 관문 전체를 완료했다고 승인하지 않습니다.

## 5. 테스트 직접 실행

| 스위트 | pass | fail | skip |
|---|---:|---:|---:|
| reports-api | 178 | 0 | 0 |
| 주간 추천 | 136 | 0 | 0 |
| Python 기상 | 50 | 0 | 0 |
| 조석 | 21 | 0 | 1 |
| weather-proxy | 36 | 0 | 0 |
| 관련 frontend9파일·자정/캐시/현장소식 등 | 106 | 0 | 0 |
| Chrome 공지 닫기7 + 월간 조석13 | 20 | 0 | 0 |
| 합계 | **547** | **0** | **1** |

reports-api178은 helpers.mjs 발견1을 포함하며 behavior case는177개입니다. 조석skip은 과거 공식 표본과 rolling 자료 날짜 겹침이 없어 비교하지 않은1건입니다. 브라우저 미설치 실패였던7개는 설치된 Chrome에서 실제 재실행해 통과했습니다.

별도 actual S2 matrix182개 중175일치/7불일치, 특별분기21개 중14일치/7불일치, popup12개 중4일치/8불일치입니다. 같은 원인의 경로별 재현이며 기존 회귀547pass와 합쳐 성공으로 처리하지 않았습니다. Python 합성 validator는31×2 문서를 별도 검사했습니다.

Windows --import/Python 경로 문제는 review-only preload로 해결해 재실행했습니다. 최초 기존 Chromium 실행의 자동네트워크는 계측되지 않아 telemetry 성공/실패를 단정하지 않습니다. authoritative 재실행 및 새 E2E는 Worker/Turnstile/telemetry를 격리했습니다. 운영 D1 명령·실사용자 제보/현장소식 등록·삭제는 실행하지 않았습니다.

## 6. 190곳·176후보·상위10 동일 입력 비교

기준시계 **2026-10-08 22:40 KST**, 16파일 manifest와 승인 공개 집계11곳/24종명 문자열 SHA 검증. 이전35141c04 / main38b4529 / PR7eb6764의 ON/OFF 각각176후보와 모든190곳 객체 signature가 동일했습니다. 원점수·표시점수·rank·bonus·추천 날짜/시각·유형·순서가 모두 같았고 좌표 벡터도 해시로 대조했습니다.

| 순위 | 제보 ON (raw/display/rank; bonus) | 제보 OFF (raw/display/rank) |
|---:|---|---|
|1|108 호곡리 (92/92/103;11)|112 알뜨르비행장 (100/100/100)|
|2|112 알뜨르비행장 (100/100/100;0)|7 교동도 (92/92/92)|
|3|15 사기리 (92/92/94;2)|8 석모도 (92/92/92)|
|4|194 강당리 (92/92/94;2)|10 강화도 (92/92/92)|
|5|126 해리천습지 (92/92/94;2)|126 해리천습지 (92/92/92)|
|6|14 걸매리 (92/92/92;0)|14 걸매리 (92/92/92)|
|7|107 매향리 (92/92/92;0)|107 매향리 (92/92/92)|
|8|48 대진항 (92/92/92;0)|48 대진항 (92/92/92)|
|9|195 평화의공원 (92/92/108;16)|3 굴업도 (100/100/100)|
|10|3 굴업도 (100/100/100;0)|5 대청도 (100/100/100)|

전체 날짜·시각·추천 축 표는 검증 문서에 저장했습니다. 독립 tuple/정원 계산9회가 제품 함수와 일치했습니다. 별도 null 합성11곳에서는 수정 전176후보/가짜0점11 → 수정 후165후보/가짜0점0으로 의도된 차단을 확인했습니다.

S1 효과는 별도로 측정했습니다. 고정 공개 집계24문자열은 before/head 모두 보호0으로 정상 결과 불변입니다. 원본행별 private/관찰일/연결 이력이 없는 집계로 실제 운영 API 전체 불변을 주장하지 않습니다. S1 적용으로 보호행이 집계에서 제외되는 것은 데이터 변화이며 S2 동일입력 결과와 구분합니다.

## 7. 최신 main 임시 결합

공통 조상1817161 이후 main은 weather_today.json/weather_week.json만, PR은14다른 파일을 변경해 공통 수정 파일0입니다. merge-tree 충돌0, temporary tree cb24c5085f8f297c0197950a756e41d08082dd98. PR 제품 source와 main 자동JSON을 각각 hash로 확인했습니다. 실제 ref 병합은 하지 않았습니다.

결합 상태 JS242pass, 기상50pass, 조석21pass/1skip, today/week validator2성공. 공개 API/field/admin source는 PR/main 동일이며 앞선 실제 시험이 적용됩니다. 현장소식·본인삭제 기능이 이미 포함된 최신 main과 공존합니다.

## 8. PC·모바일 E2E

root가 PR 제품+main 최신 JSON의 combined archive를 평가시계10/09 16:40(생성16:28)로 직접 실행했습니다. 344/375/768/1024/1440폭의 **기능40흐름 통과, JS 예외0**, 실제 Leaflet1.9.3 로딩 성공입니다. 추천10카드/popup, 합성 보호제보의 pending spot 미공개, fieldNews 보호길안내 차단/일반길안내, 모바일 현장소식등록·삭제, PC 기존 본인소식삭제, API오류의 상태/입력 보존을 확인했습니다. PC 등록 버튼 숨김은 기존 fine pointer 정책입니다.

**서버 보호변경 뒤 늦은 field 응답의 상태보존 시험은 실패**했습니다. 새 hidden=true가 이전응답의false로 복귀해 길안내가 재활성화됩니다. 실제 최신main/PR8개 함수 해시가 동일하고 양쪽 함수 실행에서도 재현했습니다. 따라서 새 PR 회귀와 구분하며 S1-P/캐시 후속 과제로 남깁니다. 기능40pass에 섞어 보호상태시험도 성공했다고 보고하지 않습니다.

보호 fieldNews 길안내는 차단되지만 mobile popup의 서버 대략 좌표 방향안내는 기존 main/PR 모두 경고와 함께 허용합니다. 원본 exact 좌표 노출로 주장하지 않으며 전면 길안내 금지는 별도 정책입니다. root의 combined 결과와 독립 agent의 head-only40/40 결과를 분리 보존했습니다.

Worker/Turnstile/events는 CDP+DNS격리, 모든 등록/삭제는 실제 handler의 로컬메모리입니다. public CDN정적GET만 사용하고 tiles/GPS/외부내비는 합성입니다. physical device/운영 CAPTCHA·운영cache 설정은 미검증입니다. Windows archive CRLF와canonicalLF의 차이는 전체 text 비교로 입증했습니다. 이 입력의 추천목록을10/08 22:40 고정 비교와 혼용하지 않았습니다.

## 9. S1-P 및 별도 후속 과제

기존 승인 자료의 전면 비공개, 간접 site-history/검색·고정 탐조지 연결, 보호 상태변화와 cache/늦은 응답의 재노출 방지는 S1-P 정책으로 남깁니다. S1-R만으로 이를 해결했다고 승인하지 않습니다. 기본92점/배열순서/가점16/정원4312/생태자료는 P1 후속 정책이며 이번 PR에서 변경하지 않았습니다.

## 10. 최종 보완 지시·저장

현재 head는 **수정 필요**입니다. R1/R2와 JS/Python 정합성을 보완한 커밋에서 actual 합성 matrix + 정상176후보/상위10 + P0 + 표시/자정 + 관련 API/E2E를 다시 실행한 후 별도 승인 판정을 받으세요. 검증자는 제품 변경·main 병합·Pages/Worker 배포·D1 변경을 하지 않습니다.

검증 브랜치: [review/p1-s-pr13](https://github.com/wooil1964/birdmap/tree/review/p1-s-pr13/docs/p1-s-review). [FINDINGS](https://github.com/wooil1964/birdmap/blob/review/p1-s-pr13/docs/p1-s-review/FINDINGS.md), PROGRESS/NEXT_SESSION 및 모든 script/합성 JSON/log를 보존했습니다. 중간 checkpoint0ebd148. 실제 민감 원자료·비밀정보는 저장하지 않았습니다. 사용자 승인까지 병합/배포를 진행하지 않습니다.
