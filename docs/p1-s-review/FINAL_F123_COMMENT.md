## PR #13 F1·F2·F3 최종 독립 판정: 수정 필요

검증 SHA: **a35b8598d55890e705042e4d6f88621357749d09**
이전 차단 SHA: 2e485079a34fa5aeeef09e82f3b996bf2696d978
최종 Git 원격 main: bf74095adb3bf0b13f1aca31193c8d03cf8ff53f

[최종 보고서·재현·수정 지시](https://github.com/wooil1964/birdmap/blob/86a93e726096820cc2e9e59228d08176250f6705/docs/p1-s-review/F123_RECHECK.md) · [교차 증빙](https://github.com/wooil1964/birdmap/blob/86a93e726096820cc2e9e59228d08176250f6705/docs/p1-s-review/results/f123-a35b859/verification_summary.json) · [재개 지침](https://github.com/wooil1964/birdmap/blob/86a93e726096820cc2e9e59228d08176250f6705/docs/p1-s-review/NEXT_SESSION.md)

**F1은 해결됐으나 F2/F3에 필수 보완이 남았습니다.** 승인 C는 검증된 현재 자료만 추천하는 정책이며 B 예외는 적용하지 않았습니다.

### 배포 전 필수 보완

1. **F2 출처 검사 미완결.** storedWeatherState:2071,2081–2082는 item 발행 누락/null/빈값을 root로 대체하거나 무효 root의 동일성 검사를 생략합니다. actual loader에서 root=item10:40·강수1mm의 추천0 → root10:50·item 발행 누락/null/빈값·강수0는 **최종1/raw92/bonus16/rank108**로 돌아옵니다. 최초 root 누락/null/배열+유효item도 추천됩니다. 실제 Chrome375 카드·Leaflet 팝업92점도 확인했고 Python validator54는 같은 입력을 거부합니다. 양측의 명시적 문자열 발행·엄격 parser·동일성 계약을 JS/Python에 일치시키고 참고정보·정상 주간 대안·stale 재사용을 보존하십시오.

2. **F2 동일 root 교정 복구 미충족.** 요청된 1040/1040 rain1 →1050/1030 rain0 →1050/1050 rain0는 actual 적용 [true,true,false], 카드 [0,0,0]입니다. loadBirdmapData:4549가 부적격 혼합 root1050을 비교 기준으로 저장해 정상 교정을 거부합니다. 추가6조건은 Node3pass/3fail·Chrome5폭15pass/15fail·예외0. 검증되지 않은 혼합 배치와 검증된 동일발행 충돌을 구분해 교정을 복구하되 known unsafe·older/same verified 충돌·seq·만료 관문을 완화하지 마십시오. 정상1055 control은 통과했습니다. 안전 추천 우회와 복구 미충족은 구분했습니다.

3. **F3 parser 밖 객체 예외.** today forecastTime={"toString":"not-callable"}는 storedWeatherState:2070,2074의 String 변환에서 후보·최종·카드·Leaflet 팝업 TypeError입니다. 주간 generatedAt의 같은 JSON 객체는 후보 제외 후에도 renderTodayPanel:4380의 원본 문구 연결에서 실제 Chrome TypeError입니다. parser 통과를 UI 예외0로 보고할 수 없습니다. 소비·표시 경로에서도 비문자열을 안전하게 거부하고 미확인/빈자료 안내를 완료하십시오.

F2 누락 계약과 today 객체 예외는 이전2e485에서도 같은 **기존 미완결**이며 새 회귀로 단정하지 않았습니다. 혼합 배치 안전 제외 개선과 동일root 교정 미수신도 구분했습니다. 합성 계약 입력이며 정상 생성기가 malformed 자료를 만든다는 증거나 운영 유출 사고를 관측했다는 주장은 없습니다.

### 실제 독립 실행

- 자동 **615 pass /0fail /1skip**: reports178, weekly163, frontend124, Chromium20, cardDOM17, weatherPython56, tide21+1skip, proxy36. 명령/TAP/hash 저장.
- S2182/182·특별21/21·팝업12/12, source74/helper23, C1C2·실제선상80, JS수치92/Python92/주간10 통과.
- **F1 Node28/28·Chrome5폭140/140·예외0**. 주간 배열형99점 제외·정상80+제보16=rank96·카드/팝업80점 유지.
- F2 source60은30pass/30fail, 확장actual loader10은4pass/6fail, live6은3pass/3fail. Python actual190 root/item20/20·자료형35/35, actual builder 적격190 root=item 및 stale control 통과.
- F3 확장77은70pass/7fail(6은F2중복). typed Chrome4는3pass/1fail; today 추가3은0pass/3fail. root 검증자도 actual Chrome375·Node·Python을 직접 재실행했습니다.
- Chrome344·375·768·1024·1440: core245/245·문자열진단10/10·일반E2E target/최신결합 각각55/55.
- 기존 lifecycle **35pass/10fail 원장 보존**. fresh_today_arrives(root10:31/item10:30)와 partial_reference_today(root10:32/item10:30)의 각5폭은 actual builder·Python·승인F2 계약상 제외가 맞습니다. 안전 기대original45/45와 별도 root=item 정상복구control10/10을 검증했고 assertion 삭제로 성공 처리하지 않았습니다.
- 고정10/8 22:40의 **190곳·176후보**, 35141c0/main코드/2e485/a35의 ON/OFF 전체190 signature·후보순서·raw/display/rank/bonus/date/time/type/P0·좌표hash 불변.
- ON:108,112,15,194,126,14,107,48,195,3 / OFF:112,7,8,10,126,14,107,48,3,5.
- P0 만조90/91·6/24h상한·1440분 제외·대체만조·강수1mm·선상6m/s/.7m/무강수 유지. S1-R171 누락0·일반17 오탐0·최근집계·현장소식·본인삭제·관리자 회귀 통과.

### 최신 main·운영 준비

임시 tree **379b0c06bad6a12570e45ed8916ae98f2645a4a7 충돌0**, 자동5JSON main blob 보존·제품8blob head 일치. 최신main20:13 발행의 actual21:19 Python190/10640 및JS190 적격 통과, 최신결합Chrome는 캡처21:15:44KST·5폭55/55입니다. 고정 입력과 최신 기상 혼용·날짜검사 삭제·운영JSON 수정 없음.

**PR 전용CI 없음·exact SHA Actions0/status0로 CI 성공 주장 없음.** 운영JSON commit/push workflow를 임의 dispatch/rerun하지 않았습니다. main [weather run38047614684](https://github.com/wooil1964/birdmap/actions/runs/38047614684)의 성공은 a35 CI와 별개입니다. 실제 공개 Worker version·보호 유지 rollback 버전/리허설은 미확인으로 **배포 준비 미완료**입니다.

R5는 별도P2, 삭제후oldGET마커복귀는 **P1 보안PR 최우선**, 보호상태old응답/길안내복귀는 **서버보호전환·fieldhide·S1-P 전 선행 차단**으로 유지합니다. S1-R 배포가 과거 공개자료를 새 보호상태로 바꾸는 경우도 해당 전환에 포함합니다. 실제 개인정보/민감위치 철회가 요구되는 배포라면 캐시 결함 해결이 선행되어야 합니다. 이번C/F가 이를 해결했다고 보고하지 않았습니다.

새 SHA의 보완을 독립 재검증한 뒤 실제Worker/안전rollback·검증증거·운영승인을 확보하십시오. 승인 후에만 서버S1-R→Pages→자동기상갱신 확인 순서를 검토합니다.

검증 증거는 **review/p1-s-pr13 commit86a93e726096820cc2e9e59228d08176250f6705**에 push했습니다. 제품 수정·main병합·Pages/Worker배포·운영D1·실사용자 등록/삭제0. **새 보완 SHA 및 사용자 별도 승인을 기다립니다.**