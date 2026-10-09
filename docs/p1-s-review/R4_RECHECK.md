# PR #13 R4 최종 독립 재검증

## 1. 종합 판정: 수정 필요

검증 SHA는 **8ccb248faa2c5c7b5a6019d12e19e21031169460**이다. 기존 R4의 **정상 today 만조 fallback 카드 미확인** 문제는 해결됐다. 구현자 보고의 전체 **573 pass / 0 fail / 1 skip**, 카드 DOM **9/9**, S2 **182/182**, 특별 분기 **21/21**, 팝업 **12/12**를 실제 재실행해 확인했다. 이전 R1~R3 및 S1-R 통과 판단을 유지한다.

그러나 새 `weeklyTodayWeather`가 **참고 상태 자료에 현재 적격 출처를 부여하는 결함**이 남았다. 실제 Chrome에서 갱신 지연·미래/오류/누락 생성 시각·지난 날짜 예보 등은 만조 카드에 `★★★★★ 92점`, 동일 장소 팝업에 `오늘 적합도 미확인`으로 표시된다. 6조건 × 5폭 = **30건 불일치**를 재현했고, 이전 SHA에서는 동일 30건이 모두 미확인으로 일치했다. 따라서 현재 SHA의 병합·배포 승인을 보류한다.

이 결함은 새 만조 카드의 **표시 출처 승격**이다. 원점수·순위·후보 수·90분 안전 판정이 새롭게 우회됐다고 확대하지 않는다. 일반 today fallback의 같은 출처 단정은 이전 코드에도 있었다. 이번 공유 adapter는 그 기존 문제를 유지하면서 만조 카드에도 전파했다. 실제 운영 발생·빈도는 확인하지 않았다.

## 2. 검증한 코드와 자료

- PR13: https://github.com/wooil1964/birdmap/pull/13
- target: `8ccb248faa2c5c7b5a6019d12e19e21031169460`
- 이전 차단 target: `1bd26199bdd66ff48d41dc4fa5a6ebcef059f07c`
- 최신 원격 main: `b0975cad9f3112af38cc286a892bf6f06722ce12`
- 고정 비교 코드: `35141c04d4fd152982b1f4683d5b7a6f4f7514e5`
- 기존 검증 체크포인트 `7b3eb4a`의 R123_RECHECK.md·FINDINGS.md·NEXT_SESSION.md와 AI_WORK_RULES.md, 승인된 P1-S 설계, 새 보완 댓글6080448359 및 diff를 읽었다. P1-A~D 분석은 반복하지 않았다.
- 새 1bd→8ccb diff는 10파일. 제품 변경은 index.html의 today 출처 adapter와 두 호출부이며, 나머지는 비교/시험/인수인계다. weatherScoreAllowed 자체를 raw 허용으로 완화하지 않았다.
- 고정 입력: **2026-10-08 22:40 KST**, 원래16파일 manifest 및 공개 승인 제보11곳/24종명 문자열. 기존 스냅샷을 덮어쓰지 않았다.
- 최신 main 결합 입력: 기상 생성 **2026-10-09 20:56 KST**, 평가 **21:10 KST**. 고정 추천 재현과 별도 실험이다.
- 상세 R4 DOM 합성 시계: **2026-10-10 11:00 KST**, 정상 today 생성10:30/예보·만조12:00. 같은 합성 입력만 사용한다.
- exact SHA의 git archive와 merge-tree 사본에서 실행했다. review worktree 제품은 이전7eb 그대로이며 검증 제품으로 사용하지 않았다. source_crosscheck.json에서 archive와 Git blob을 줄바꿈 정규화 후 대조하고 실제 Chrome 입력 hash를 확인했다.

## 3. R4 실제 코드·DOM 검증

정상·결측·안전 시나리오는 **29종 × 5폭 = 145/145 통과**했다. root도 최종 스크립트를 읽고375px에서29/29와 추가6불일치를 직접 재실행했다.

확인 경로: weeklyTodayRecommendable → weeklyTodayWeather → weeklyTideWeather / weeklyWeatherEntryForSite → 최종 선발 → renderTodayPanel → weatherScoreAllowed. 동일 장소의 실제 Leaflet marker 팝업 → weatherTodayForSite → storedWeatherState도 비교했다. 정상 0·92·92.5·100, 제보 가점16/rank108, 주간 미수신/해당 장소 누락, 주간 기반 표시, 필수풍속·풍향·강수·섬/선상파고 결측, scoreEligible 누락/null/false, raw에 임의 상태를 넣은 경우, previous_saved를 검사했다.

### 차단 결함: 참고 자료의 현재 적격 출처 승격

위치: target index.html **3880~3882 weeklyTodayWeather**. 이 함수는 weeklyTodayRecommendable로 원점수·명시 metadata·실제 기상값을 검증한 뒤, 날짜·생성 시각·예정 갱신을 검사하지 않고 `_weatherState.dataCurrent:true, scoreEligible:true, stale:false`를 부여한다.

기존 **2066~2081 storedWeatherState**는 동일 날짜의 forecast, 유효 생성 시각, 미래 아님, 기존 weatherLatestDue 갱신 일정, stale 여부를 검사한다. 따라서 카드 adapter와 팝업의 출처 계약이 다르다. 호출부는 **3897~3908 weeklyTideWeather**, **4022~4034 weeklyWeatherEntryForSite**; 최종 표시 **4348 renderTodayPanel**, 팝업 경로 **2107 weatherTodayForSite**다.

모두 평가10/10 11:00, raw score92·명시 적격 true·필수값 정상·유효 만조12:00 조건이다.

| 추가 입력 | 새 만조 카드 | 실제 팝업 | 이전1bd 카드/팝업 |
|---|---|---|---|
| 생성05:41, 예정 갱신 뒤 참고 상태 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |
| 미래 생성12:30 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |
| generatedAt 비정상 문자열 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |
| item/root 생성 시각 모두 결측 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |
| date는 오늘이나 forecastTime은 어제 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |
| 실제 Python builder의 아래 sparse6h 출력 | ★★★★★ 92점 | 오늘 적합도 미확인 | 양쪽 미확인 |

**운영 경로와 자료형을 연결하는 합성 증거:** 실제 update_weather.py의 build_site_result에 sparse6h 예보12:00/18:00, 생성 기준06:10을 넣으면 score92/stale:false/scoreEligible:true/forecast12:00이 생성된다. 실제 validate_weather.py도 해당 합성 출력을 수락했다. 이 단일장소 시험은 runtime site 목록과 시계만 합성 조건에 맞췄으며 validator의 판정 로직은 수정하지 않았다; 전체190곳 문서 검증은 별도로 통과했다. 출력 row14를 수정 없이 JS 및 Chrome에 넣고11:00에 평가하면 위 불일치가 재현된다. 생성기의 nearest-sample 간격 허용과 화면의 예정 갱신 기준은 서로 다른 계약이다.

이는 실제 upstream의 sparse6h 발생이나 작업 지연이 관찰됐다는 주장이 아니다. 정상3h 운영에서 단순 갱신 지연만으로도 반드시 같은 추천이 발생한다고 단정하지 않는다. 다른5조건도 계약 방어용 합성 자료이며 실제 운영 저장행이 아니다. 실제 제품 함수·생성기·validator·DOM을 연결한 재현이므로 단순 소스 경로 교체만으로 내린 판정이 아니다.

## 4. 독립 시험 실행 결과

| 스위트 | pass | fail | skip |
|---|---:|---:|---:|
| reports-api | 178 | 0 | 0 |
| 주간 추천 | 146 | 0 | 0 |
| 프런트9파일 | 110 | 0 | 0 |
| 실제 Chrome 공지 닫기·월간 조석 | 20 | 0 | 0 |
| 새 R4 카드 DOM | 9 | 0 | 0 |
| Python 기상 | 53 | 0 | 0 |
| 조석 | 21 | 0 | 1 |
| weather-proxy | 36 | 0 | 0 |
| **원래 회귀 합계** | **573** | **0** | **1** |

reports-api178에는 Node가 발견한 helper module1이 포함된다. 주간146은 기존145에 adapter 시험1이 추가된 실제 범위다. skip1은 기존 조석 공식 샘플이 현재 rolling 조회 구간 밖인 시험이다. 공지 닫기7건도 실제 Chrome에서 통과했다. 파일·환경·명령은 results/r4/execution_manifest.json, 로그는 각 tap 파일이다.

별도 독립 시험(위573 합계에 중복 가산하지 않음):

- S2 matrix **182/182**, 특별 분기 **21/21**, 팝업 계약 **12/12**.
- 추가 계약 **100/103**: 남은3불일치는 기존 R5 극단 wind/rain/wave 숫자 문자열이다. 정상 R4 표시 조건은 통과한다.
- Python 실제 validator 합성 호출98건은 입력별 수락/거부 계약 기록이며 “98개 정상 기능 통과”로 계산하지 않는다.
- 구현자 새 카드 DOM 시험을 이전1bd 제품에 적용: **3 pass / 6 fail**. 새8ccb는 **9/9 pass**. 정상 R4 수정 효과를 확인했다.
- 독립 상세 Chrome: 정상 **145 pass**, 참고 출처 기대검사 **30 fail**, 예외0. 이전1bd의 동일 추가조건 **30/30 pass**. root 대표폭도 정상29pass/참고6fail, 이전6pass.
- 합성 최신main 결합 일반 E2E **55/55**, 예외0. 보호flag/삭제marker 늦은 응답 진단은 별도 실패 현상이며 이55 성공에 포함하지 않는다.
- S1-R 실제 표현 보호171 누락0, 일반17 오탐0, 기존 번식6, 공개 recent18·등록9·field등록10·field번식6, 인증 관리자5, 본인삭제4 독립 회귀 통과. 보호종은 최근 제보 가점에서 제외된다. 승인 후 전면 비공개와 혼동하지 않는다.

### P0 회귀

만조90분 허용·91분 제외, 6/24h 및120분 차이 차단, 결측/비정상 간격 metadata, 공지·가점16·mandatory 우회 차단, 다른 날짜 및 같은 날 다음 안전 만조 선택을 확인했다. 강수 **1mm 이상 현장주의**, 0.999mm 정상 경계, today 결측 차단을 유지한다. 선상은 **풍속≤6.0m/s·파고≤0.7m·강수0mm**, 필수값 결측 제외다. 강수 표시 반올림 정책은 이번 수정에서 바뀌지 않았다.

91분 만조에는 추천 카드가 없더라도 현재 장소 자체의 정상 today 팝업 점수는 표시될 수 있다. 이 의미 차이를 R4 표시 실패로 계산하지 않았다.

## 5. 고정190곳·176후보 추천 전수 비교

35141c0 / 최신main b097 / 이전1bd / 새8ccb 네 코드를 **같은10/8 22:40 고정 자료**로 실행했다. 제보 ON/OFF 각각 후보176·안전 적격176이며 모든190곳 결과 및 좌표 hash가 같다. 상위10의 ID/순서/원점수/화면점수/순위점수/가점/추천일·시각/유형을 전수 비교해 차이0을 확인했다. 정원 선발은 독립 계산12조건과 대조했다.

### 제보 ON

| 순서 | ID·장소 | 원점수/표시 | 내부 rank | 가점 | 추천일·시각 | 추천 유형 |
|---:|---|---:|---:|---:|---|---|
| 1 | 108 호곡리 | 92/92 | 103 | 11 | 2026-10-09 09:00 | field |
| 2 | 112 알뜨르비행장 | 100/100 | 100 | 0 | 2026-10-13 09:00 | field |
| 3 | 15 천수만 사기리 | 92/92 | 94 | 2 | 2026-10-09 09:00 | field |
| 4 | 194 천수만 강당리 | 92/92 | 94 | 2 | 2026-10-09 09:00 | field |
| 5 | 126 해리천습지 | 92/92 | 94 | 2 | 2026-10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92/92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92/92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92/92 | 92 | 0 | 2026-10-09 09:00 | pelagic |
| 9 | 195 평화의공원 | 92/92 | 108 | 16 | 2026-10-09 09:00 | other |
| 10 | 3 굴업도 | 100/100 | 100 | 0 | 2026-10-09 18:00 | other |

### 제보 OFF

| 순서 | ID·장소 | 원점수/표시 | 내부 rank | 가점 | 추천일·시각 | 추천 유형 |
|---:|---|---:|---:|---:|---|---|
| 1 | 112 알뜨르비행장 | 100/100 | 100 | 0 | 2026-10-13 09:00 | field |
| 2 | 7 교동도 | 92/92 | 92 | 0 | 2026-10-09 12:00 | field |
| 3 | 8 석모도 | 92/92 | 92 | 0 | 2026-10-09 18:00 | field |
| 4 | 10 강화도 | 92/92 | 92 | 0 | 2026-10-09 09:00 | field |
| 5 | 126 해리천습지 | 92/92 | 92 | 0 | 2026-10-09 09:00 | mudflat |
| 6 | 14 걸매리 | 92/92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 7 | 107 매향리 | 92/92 | 92 | 0 | 2026-10-11 18:00 | mudflat |
| 8 | 48 대진항 | 92/92 | 92 | 0 | 2026-10-09 09:00 | pelagic |
| 9 | 3 굴업도 | 100/100 | 100 | 0 | 2026-10-09 18:00 | other |
| 10 | 5 대청도 | 100/100 | 100 | 0 | 2026-10-09 18:00 | other |

표의 유형은 추천 axis이며 실제 서식환경 분류가 아니다. 원래 정원·mandatory·동점·가점 정책을 그대로 사용한다. JSON에는 실제 좌표값을 저장하지 않았다. 점수null을 공개집계11곳에 주입한 별도 합성 실험에서는 main/351의176후보 및 가짜0점11곳이, 이전1bd/새8ccb에서165후보·가짜0점0곳으로 차단된다. 정상 결과와 이 비정상 입력 결과를 섞지 않는다. 공개 집계의 보호분류도11곳/24문자열 모두 원래 결과와 같다; 원행 note·위치상태 등이 없으므로 운영 보호행 영향 건수를 만들어 내지 않았다.

재현 근거: independent_replay.json, recommendation_summary.json, provided_compare_output.json 및 verify_provided_compare.mjs. 최신 자동자료의 추천176곳이라는 주장이 아니다.

## 6. 최신 main 임시 결합 안전성

최종 remote 확인에서 head8ccb/mainb097 유지. main의38b 이후 변경은 weather_today.json·weather_week.json뿐이다. merge-tree **9949dab3131d095c293f3bd0faf8f05539a1ad1e**, 충돌0. 실제 checkout/main merge는 하지 않았다.

결합 사본 index는8ccb, 자동weather/tide는 최신main blob과 대조해 일치했고 기상자료를 덮어쓰지 않았다. 최신 weather today190곳, week190곳/10,640표본의 실제 Python validator 둘 다 성공했다. 결합 JS **256/256**(주간146+프런트110) 통과. 현장소식·삭제 관련 제품 API/프런트 source는 새R4가 바꾸지 않는다.

독립 standalone validate_tide.py는 저장소에 없어 실행할 수 없었다(없는 스크립트 시도는 no_standalone_tide_validator.txt에 보존; 제품 실패가 아님). 실제 조석 health 함수를21:10 시계로 읽기 실행:100곳/39관측소, today fresh/ok, live/tomorrow100 성공, unavailable/failed0. **월간 자료 partial:28대상·stale280항목**은 기존 입력의 한계다. “모든 월간 자료 정상”으로 보고하지 않는다. 안전한 미래 만조 자료가 없으면 기존 P0 후보 차단을 유지하며 자동자료 보완은 별도 운영 점검이다.

## 7. PC·모바일 실제 Chrome E2E

344·375·768·1024·1440px × 높이900, 실제 Chrome/Leaflet1.9.3으로 정상 fallback 카드·동일 장소 marker 팝업·주간 표시·결측·P0 경계를 확인했다. 정상 카드와 팝업의 점수는 일치하고 점수 텍스트 가로 잘림은 없었다. 합성 API 일반55흐름은 추천/제보 UI/현장소식/본인삭제/일반·보호 길안내/네트워크 실패/캐시 흐름을 검증했다.

상세 DOM의 자료 재요청도 동일 synthetic case를 반환하도록 격리했다. toggleTodayPanel이 week 재로딩을 시작하는데, 원래 archive의 JSON이 섞이면 오판할 수 있기 때문이다. 초기 harness의 bootstrap·팝업 대상·계절/선상 control·재로딩 문제를 보정한 최종본만 공식 결과로 사용했다. 제품 함수를 수정하거나 실패 assertion을 삭제하지 않았다. DOM_REPORT.md에 초기 시도와 공식본을 구분했다.

탐색 전 DNS 및 CDP Fetch 격리로 deployed Worker·Turnstile·telemetry·tile 요청은 합성 응답 처리했다. 외부는 정적 라이브러리/스타일 CDN GET/HEAD만 허용했고 실제 Leaflet이 로딩됐다. 회색 지도 배경은 합성 투명 tile이며 Leaflet 실패가 아니다. 실제 운영 POST/DELETE·D1·GPS·길안내 창 열기는 수행하지 않았다. 물리 모바일·운영 인증/Turnstile·운영 네트워크·전체 세로 overlay 레이아웃은 미검증이다. 늦은 자동응답 상태 보존의 실패를 환경 오류로 숨기지 않았다.

## 8. 잔여 보안 과제의 배포 전 차단 판단

아래는 실제 결함/정책 공백이며 보안 통과가 아니다. 이번 R4의 신규 출처 승격과 별도로 판단한다. 실제 운영 민감행 존재·사고빈도·승인 의도는 조회하지 않았다. 자세한 source 위치·반론·재현은 results/r4/SECURITY_REVIEW.md다.

| 과제 | 위험·현재 증거 | PR13 한정 배포 판단 / 선행 조건 |
|---|---|---|
| R5 극단 숫자/JS-Python 계약 | 양쪽400자리 문자열 수락; JS trim/ASCII와 Python Unicode/trim 계약 차이. 정상 생성기 finite 입력 처리로400자리 차단, 실제 hypot overflow의inf는 배치 validator가 commit 전에 거부 | **P2 후속 가능**. 정상 배치 외 저장 경로·실제 비canonical 운영 입력이 발견되면 선행 차단으로 승격. finite/nonnegative 파싱과 양쪽 문자열 계약 정리; 임의 기상 상한 생성 금지 |
| 삭제marker 재출현 | 실제 owner delete→fresh GET 제외→late GET에서 배열/marker 복귀. 서버삭제 유지; 철회한 내용·위치를 잠시 재안내하는 개인정보 상태 보존 결함 | **P1 우선 후속**. 새R4는 삭제/cache를 바꾸거나 노출을 확대하지 않으므로 분리 가능. 실제 민감정보 철회/보안사고 회수가 릴리스 목적이면 반드시 배포 전 차단 |
| 보호flag 역전/길안내 복귀 | 새hidden=true 후 oldfalse 응답으로 보호flag 복귀. 정확 위치 노출 여부는 old payload에 달림. 현재 공개 field 액션은 hidden을 바꾸지 않으며 reports 관리자hide는 별도 테이블 | 기존 모드의 PR13 단독 반영에서는 **P1 후속 가능**. backend 보호 재분류·field 상태 전환·S1-P 도입 **전에 필수 차단**. 알려진 실제 민감행 긴급보호도 같은 조건 |
| S1-P 승인후 공개·간접 위치 | 실제 합성 GET에서 approved 종명/위치·history 연결 유지, recent는 제외. legacy field 저장hidden0을 읽기에서 재판정하지 않음. 대략 안내 기존정책 유지 | **별도 승인 정책 과제**. PR13을 보호종 전면 비공개 완료로 승인하지 않음. 공개모드/재분류를 동시 변경하지 않고 잔여 노출을 승인자에게 명시. 실제 비동의 민감좌표 공개 확인 시 즉시 회수/보류 |

“기존 결함”이라는 이유만으로 허용한 것이 아니다. 신규 권한/생성 경로/상태 전환이 없음, 서버삭제·fresh GET 보존, 정확한 도달 조건, 승인된 설계의 공개 범위를 근거로 한정한다. 보호/삭제 cache 보완은 작은 별도 보안 PR로 우선 진행하고 pending GET·삭제/숨김·fresh/old 응답·marker/popup/news/guide 동시 회수 시험을 요구한다.

## 9. 구체적인 보완 지시와 승인 조건

1. **weeklyTodayWeather(3880~3882)**의 무조건 dataCurrent/scoreEligible true 부여를 수정한다. 실제 필수자료·own metadata 검증을 유지하고, 기존 storedWeatherState의 날짜/forecast/생성 시각/예정 갱신 계약을 재사용하거나 동일한 한 경로로 통합한다. 참고/이전/출처 미확인 상태를 현재 적격으로 승격시키지 않는다.
2. weatherScoreAllowed를 raw 허용으로 완화하지 않는다. 일반 fallback 및 만조 fallback이 같은 검증 출처를 전달하고 화면·팝업이 일치하게 한다. 참고 기온·풍향·조석은 보존한다. 참고 자료 후보 자체의 유효기간 정책을 이번 검증자가 임의 변경하지 않는다; 표시 계약 보완과 후보 선정 정책 변경은 구분한다.
3. 위6조건, 실제 builder sparse6h 출력, 두 fallback 경로, 주간 미수신/해당 장소 누락을 실제 카드·팝업 함께 회귀 시험한다. 정상0/92/92.5/100·rank108·176후보/ON-OFF 전수·P0·S1-R·main 결합이 유지되어야 한다.
4. 재현: `R4_GENERATOR_FIXTURE=results/r4/sparse6h_generated_today.json`을 지정하고 `node scripts/r4/independent_r4_dom.mjs <exact SHA archive> <output> <exact SHA>`를 실행한다. root 대표폭은 R4_WIDTHS=375. 기존1bd 추가진단은 R4_DIAGNOSTIC_ONLY=1. 경로는 docs/p1-s-review 기준이며 정확한 전체 명령은 NEXT_SESSION.md를 따른다.
5. 구현자가 새 SHA를 제출하면 diff/영향범위와 위 차단조건을 독립 재검증한다. 이번 SHA는 **수정 필요**이며 merge/deploy 승인이 아니다. R5 및 개인정보 상태 보존 후속의 우선순위·정책 선행 조건도 계속 유지한다.

분석 문서·합성 시험 결과만 review/p1-s-pr13에 저장한다. 제품 코드, main, 자동 생성 JSON, Pages/Worker, 운영 D1 및 실사용자 제보를 변경하지 않았다. PR13/Issue9 최종 댓글과 read-back 증빙은 FINAL_R4_COMMENT.md 및 results/r4/github_receipts.json에 별도 저장한다. 게시가 완료되기 전에는 증빙 파일의 존재만으로 완료를 추정하지 않는다. 사용자 별도 승인과 새 보완 SHA를 기다린다.
