## C 정책 최종 독립 검증: 수정 필요

검증 head: `352315a57d038687807dbe0044c136a22fb0c9c5`  
이전: `e9c97d6c67353c2197ba2f7898329b3a6d0ce8e6`  
최신 원격 main: `b0975cad9f3112af38cc286a892bf6f06722ce12`

[최종 보고서·수정 지시](https://github.com/wooil1964/birdmap/blob/72cb3e2d142b838b357cfa61a82d4ebae1ca2679/docs/p1-s-review/C_POLICY_RECHECK.md) · [독립 실행·source/data 교차 증빙](https://github.com/wooil1964/birdmap/blob/72cb3e2d142b838b357cfa61a82d4ebae1ca2679/docs/p1-s-review/results/c/verification_summary.json) · [재개 지침](https://github.com/wooil1964/birdmap/blob/72cb3e2d142b838b357cfa61a82d4ebae1ca2679/docs/p1-s-review/NEXT_SESSION.md)

사용자가 승인한 C(현재 검증 기상자료만 추천)는 today 참고 제외에서 작동합니다. B 갱신 지연 예외는 적용하지 않았습니다. 그러나 다음 필수 보완이 남아 **병합·배포 승인으로 진행할 수 없습니다.**

### 해결·정상 보존

- 평가10/10 11:00, raw.date10/10, forecastTime10/9 12:00, 만조10/10 12:00, score92·제보16·mandatory=true의 **절대1,440분 반례는 후보·최종·rank 모두 제외**. 팝업은 참고정보·적합도 미확인을 유지합니다. before는 rank108 최종 추천을 실제 재현했습니다.
- 독립 자동 회귀 **588 pass / 0 fail / 1 skip**: reports178, weekly155, frontend110, Chromium20, 카드DOM14, 기상Python54, 조석21+1skip, proxy36.
- S2 matrix182/182, 특별21/21, 팝업12/12. 절대 시각 helper23/23·3/6/24h×90/91/120분 controls 통과. P0 강수1mm·선상풍속6m/s·파고0.7m, 정상 차선·안전 대체 만조 유지.
- 실제 Chrome 344·375·768·1024·1440px: 기본245/245, 실제 loader 복구45/45, 일반E2E55/55, 예외0. R6 기대 중14ID×5폭70건을 C에 맞춰 후보/카드/rank 제거로 명시 변경하고 나머지175건은 유지했습니다. before에 같은 강화 기대를 적용한70건은 모두 실패 재현했습니다.
- 고정10/8 22:40·190곳·176후보: 후보ID/순서와 ON/OFF 상위10의 raw/display/rank/bonus/date/time/type/P0 및 전체190 signature 불변. ON:108,112,15,194,126,14,107,48,195,3 / OFF:112,7,8,10,126,14,107,48,3,5.
- C정책19시나리오×ON/OFF38조건이 저장된 R6 strict 분석 기대와 전항목 일치. 정상 주간 실패166, controlled 혼합 참고176→165, 전체 참고166→0을 분리했습니다. S1-R 보호표현171 누락0·일반17 오탐0, 관리자·현장소식·본인삭제 회귀 통과.
- 임시 merge-tree `0a32d8b656405ba3ee8cf85dc0208b9e0aa3d3d6` 충돌0. 자동 weather/tide 4JSON은 main blob 보존, validator2 및 결합JS265 통과. 실제 main 병합은 없습니다.

### 배포 전 필수 수정 요청

**C1 — 주간 발행 출처 검증 누락.** 평가11:00, 정상 forecast12:00/score92에서 root generatedAt 누락/null/빈문자열/비정상/미래12:30 및 site.dataUnavailable=true 입력이 일반·조석·섬·선상에서 raw92/rank108로 최종 추천됩니다. `weeklySampleAsWeather`(index.html:3774)가 현재 출처true를 만들고 최종가드가 신뢰합니다. 주간 raw 발행·unavailable 상태를 검증한 뒤 파생 적격성을 부여하고 Python validator와 일치시키십시오. 새 주간 최대연령이나 B 예외를 임의로 도입하지 말고 정상 미래 예보를 유지해야 합니다.

**C2 — 일반 주간의 무효 forecast가 정상 차선을 가림.** `2026-10-10 12:60 KST`/timezone 누락 최고99점과 정상13:00KST/80점, 제보16을 같이 주면 strict parser는 null인데 최종·실제 카드·Leaflet 팝업은 **99점/rank115**입니다. 기대는 정상80/rank96입니다. 실제 Chrome2진단 모두 실패했습니다. `weeklyDaylightCandidates`(3732), `weeklySampleMinutes/DateText`(3689/3697), 일반 today의 `weatherTimeMs/storedWeatherState`(2050/2066)에 공통 명시 시각 계약을 적용하고 후보 선택 전에 검증하십시오. 최종 정원/mandatory 실험도 무효3곳이 top10에 남았습니다.

**C3 — 더 늦은 요청의 이전 발행자료로 안전 추천 복귀.** 새10:40발행·강수1mm로 카드0인 뒤 후속요청의 이전10:30발행·강수0을 적용하면 카드1/raw92/rank108입니다. 둘 다 같은 current 창 안입니다. `loadBirdmapData`(4524)는 요청seq/동일stamp만 확인합니다. 요청 순서와 발행자료 순서를 함께 검증해 최신 위험 근거를 오래된 유리한 자료가 덮어쓰지 않도록 하십시오. 최신 자료가 시간이 지나 부적격이면 C에 따라 제외해야 합니다.

추가 source 핵심74조건 중43불일치(동일 원인의 경로/표현 조합)와 schema4진단은 별도입니다. loader 실제Node8조건은4불변성 실패, corrected Chrome40은20불변성 실패(위험역전10·가용성퇴행10), 예외0입니다. 초기 Chrome fixture의 비동기 혼입은 발견·보존·제외했고 기준0→1을 강제한 corrected를 root가5폭 전부 재실행했습니다. 위 실패는588 성공에 포함하지 않았습니다.

### 별도 잔여 보안·다음 순서

R5 극단 숫자문자열은 확장103의 기존3실패로 별도P2입니다. Python validator가 모든 형식문자열을 막는다고 보고하지 않습니다. 삭제 후 oldGET 마커복귀는 별도P1 우선; 서버삭제/fresh 제외는 유지됩니다. 보호상태 old응답·길안내 복귀는 별도P1이며 backend 보호재분류/fieldhide/S1-P 전환 배포 전 필수 차단입니다. S1-P 승인 후 전면 비공개/간접 위치 정책은 별도 사용자승인·회수/캐시검증 대상입니다. C가 이 위험들을 해결했다고 판단하지 않습니다.

합성 반례를 운영 발생·실제 민감정보 유출 사고로 단정하지 않았습니다. C1/C2/C3 보완 새SHA에서 실패 반례·정상176·기존회귀·DOM·최신main 결합을 재검증하고, 통과 후 사용자 별도 승인을 받아 병합/Pages/Worker 순서·호환성·rollback을 확인해야 합니다.

검증 자료만 `review/p1-s-pr13`에 commit/push했습니다. 제품코드 수정·main 병합·Pages/Worker 배포·운영D1·실사용자 POST/DELETE는 수행하지 않았습니다. **사용자 승인과 구현자 새SHA를 기다립니다.**

