## PR #13 배포 승인 전 최종 독립 판정: 수정 필요

검증 SHA: **`2e485079a34fa5aeeef09e82f3b996bf2696d978`**  
이전 차단 SHA: `352315a57d038687807dbe0044c136a22fb0c9c5`  
최종 확인 main: `4b164ffe74efa5cadad9e686bd628a8915527e77`

[최종 보고서·실제 재현·수정 지시](https://github.com/wooil1964/birdmap/blob/2026d34795d1050f29a2bd29a079d93fbbb20b19/docs/p1-s-review/FINAL_DEPLOY_RECHECK.md) · [교차 증빙](https://github.com/wooil1964/birdmap/blob/2026d34795d1050f29a2bd29a079d93fbbb20b19/docs/p1-s-review/results/final-2e485/verification_summary.json) · [다음 세션 지침](https://github.com/wooil1964/birdmap/blob/2026d34795d1050f29a2bd29a079d93fbbb20b19/docs/p1-s-review/NEXT_SESSION.md)

이전 C1/C2 문자열 반례와 C3의 기존 발행 역행은 해결됐습니다. 다만 승인된 C(검증된 현재 자료만 추천)의 확장 계약에서 아래 **배포 전 필수 보완 3건**이 남아 병합·배포 승인으로 진행할 수 없습니다. B 예외는 적용하지 않았습니다.

### 필수 보완

1. **미래 발행자료가 정상 복구를 막음 — 새 C3 회복 회귀.** 평가10/10 11:00에 미래12:30 발행을 받으면 추천0이지만 로더의 비교 기준(have)이12:30으로 고착됩니다. 후속 정상10:50은 거부되어0이 유지됩니다. 정상10:40→미래12:30→정상10:50도 카드1→0→0입니다. today/week 실제 함수·최종 선발·5폭 Chrome에서 재현했습니다. before352의 today first-future→정상은0→1로 복구합니다. `index.html:4540 birdmapDataTime / 4541 loadBirdmapData`에서 미래·무효 발행을 검증된 비교 기준으로 삼지 않도록 보완하십시오. 기존 old/same 발행 차단·seq 차단·C 만료 제외는 유지해야 합니다.
2. **새 root의 과거 적격 item이 최신 안전 제외를 뒤집음 — 기존 미완결 계약.** root/item10:40·강수1mm로 추천0인 뒤 root10:50/item10:30·강수0·scoreEligible=true를 받으면 최종1/raw92/bonus16/rank108로 복귀합니다. `loadBirdmapData`의 root 비교와 `storedWeatherState:2066`의 item 출처 사이의 계약이 부족합니다. 배치 출처 일관성 또는 item별 발행 순서로 older eligible item의 위험 역전을 막으십시오. 정상 builder가 이 불일치 자료를 만든다는 증거는 없지만 실제 today validator는190ID 합성 배치를 수락합니다. 정상1055 item·stale/false 재사용·component 예보시각 구분을 보존해야 합니다.
3. **시각 배열의 문자열 승격 및 객체 예외.** `generatedAt:["2026-10-10 10:30 KST"]` 또는 최고99점의 `forecastTime:["2026-10-10 12:00 KST"]`가 `weeklyForecastTimestamp:3902`의 `String()` 변환으로 적격 출처true/raw99/rank115로 최종 추천됩니다. 일반·갯벌·섬·선상8경로, 실제 Chrome375 카드·Leaflet 팝업2조건 모두99점입니다. 정상80 차선도 가립니다. JSON객체 `{"toString":"not-callable"}`는 후보·최종8경로에서 TypeError입니다(객체의 전체 Chrome 화면은 미검증). 원본 **typeof string 선행 검사**, 비문자열 null 거부·예외0를 적용하고 Python validator와 대조하십시오. 실제 Python은 배열/객체4건을 모두 거부합니다.

이 반례는 합성 계약 입력입니다. 운영 유입 빈도·실제 당시 날씨·민감정보 유출 사고를 관측했다고 주장하지 않습니다. 1번 회복 불능은 새 회귀, 2·3번은 기존에도 있던 미완결 계약으로 구분했습니다.

### 독립 실행 결과

- **자동 회귀603 pass / 0 fail / 1 skip**: reports178, weekly159, frontend118, Chromium20(notice7+월간조석13), 카드DOM16, 기상Python55, 조석21+1skip, proxy36. 실행cmd/workdir/TAP hash 보존.
- S2 **182/182·특별21/21·팝업12/12**, source74/74·절대시각helper23/23, 추가 C1/C2·실제선상80/80, JS sample 자료형92/92와 Python92/92, 주간validator10/10 통과. 선상 무효99→정상80+제보16=rank96 확인.
- 실제 Chrome344·375·768·1024·1440: 기본245/245·복구45/45·C2 문자열2조건×5폭10/10. 일반E2E55/55 및 **최신 main 결합55/55** 통과.
- C3 기존 성공기대8 Node/40 Chrome는 모두 통과. 확장 포함은 **Node23pass/5fail·Chrome115pass/25fail·예외0**입니다. root도 Node28/Chrome37528을 직접 재실행했습니다. 배열형8우회·Chrome2실패·객체8예외는 별도 원장으로603 성공에 숨기지 않았습니다.
- 정상 고정10/8 22:40: **190곳·176후보**, 35141c0/최신main/352/2e485의 후보ID·순서·raw/display/rank/bonus/date/time/type/P0·전체190signature·좌표hash ON/OFF 불변. ON:108,112,15,194,126,14,107,48,195,3 / OFF:112,7,8,10,126,14,107,48,3,5. 정책19×ON/OFF38조건도 이전 strict 결과와 같습니다.
- P0 만조90/91·6/24h 상한·1440분 제외·차선/대체 만조·강수1mm·선상6m/s/.7m/무강수 유지. S1-R 보호표현171 누락0·일반17 오탐0, 관리자·현장소식·본인삭제 실제 회귀 통과.
- 선상 별도65는 안전 선발/결측 차단이 유지됩니다. 초기 카드·팝업 동일 기대40일치/25불일치는 보존했고 before와 같은 **12:00 장소 대표기상 vs13:00 안전추천** 의미 차이로 확인했습니다. 이를65일치로 바꾸거나 신규 무효시각 결함으로 오산하지 않았습니다. 출항 안내와 추천 문턱 차이는 별도P1 설명/안전표시 과제입니다.

### 최신 main·validator·CI

최신 main은 자동4JSON만 갱신됐고 임시 merge-tree **`75df87adfe7e82d3e12290d73a4e670b2112c59c` 충돌0**입니다. 자동5JSON은 main Git blob 보존, 제품8파일은 head blob과 일치합니다. 실제 main 병합은 없습니다.

옛main10월9일 today를 같은hash 그대로 실제10일에 검사한 Batch date mismatch는 생성일9일 시계에서는 통과함을 입증했습니다. 실제builder로190곳 새10일 합성 배치를 생성한 두validator도 통과했습니다. 이후 최신main의 실제10일05:06배치를 새 validator로05:38에 실행해today190/week10640 모두 통과했습니다. 날짜검사 삭제·옛JSON 날짜 변경은 없습니다. 최신결합Chrome는05:43의 기존 current 판정구간 조건이며 이후 시각 전체로 확대하지 않습니다.

**exact PR SHA의 Actions 실행0/status0로 CI 성공은 확인되지 않았습니다.** PRtrigger/test-only workflow가 없고4workflow가 자료 생성·commit/push를 포함하여 임의 dispatch하지 않았습니다. 최신main update-weather [run37984742517](https://github.com/wooil1964/birdmap/actions/runs/37984742517)의 build/validate/commit 성공은 읽기전용 확인했지만 새PR CI 성공과 구분합니다. 배포된 Worker version/보호 유지 rollback version·리허설은 아직 고정하지 않았고 준비완료로 보고하지 않습니다.

### 잔여 보안·다음 작업

R5 극단 숫자문자열/JS·Python 차이는 별도P2, 삭제 후oldGET 마커복귀는 **별도P1 보안PR 최우선**, 보호상태 old응답/길안내복귀는 **backend보호전환·fieldhide·S1-P 배포 전 필수 차단**입니다. 제한된 S1-R/S2가 새공개권한을 추가하지 않고 서버삭제/fresh제외는 유지돼 이들만으로 PR13 추가차단을 단정하지 않지만, 실제 개인정보/민감위치 철회 요구가 확인되면 선행차단으로 격상합니다. S1-P 승인 후 공개/간접위치 정책은 별도 사용자승인·회수·캐시 검증 대상입니다. C가 이를 해결했다고 보고하지 않습니다.

구현자는 위3건을 별도SHA로 보완하고 실패를 안전 성공기대로 재실행하십시오. 통과 후 최신main·CI 대체 검증·보호 유지 rollback대상을 고정하고 사용자 별도 승인 뒤 **서버 S1-R 먼저→Pages→자동 기상 갱신 관찰** 순서를 검토합니다.

검증 문서·합성 자료를 `review/p1-s-pr13` commit **`2026d34795d1050f29a2bd29a079d93fbbb20b19`**로 push했습니다. 제품코드 수정·main병합·Pages/Worker배포·운영D1·실사용자등록/삭제는 수행하지 않았습니다. **새 보완 SHA와 사용자 별도 승인을 기다립니다.**
