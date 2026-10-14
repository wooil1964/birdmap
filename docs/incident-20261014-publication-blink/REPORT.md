# 2026-10-14 최근 출현 제보 경고·패널 깜빡임 장애

브랜치 `fix/publication-renewal-margin` (기준 origin/main `0d96fd6`, 운영 Pages = main `21f03a9` index.html, SHA256 일치 확인).

## 증상

PC에서 최근 출현 제보 패널에 "공개 제보의 최신 상태를 확인할 수 없습니다"가 반복 표시되고, 패널(과 그 아래 지도 영역)이 커졌다 작아졌다 한다.

## 원인 (확정)

공개 권한(P1)은 **public-state 요청 시작 시각 + 5000ms** 에 만료된다. 재확인은 `setInterval(publicationRecheck, min(5000, 5000 − PUBLICATION_RENEW_MARGIN_MS))` = **4750ms** 마다 시작한다.
따라서 다음 갱신 응답이 **이전 요청 시작 + 5000ms 안에** 도착해야 하는데, 허용 시간이 **250ms(응답 지연 + 타이머 지연 합)** 뿐이다.

응답이 250ms를 넘으면:
1. 만료 타이머 → `publicationInvalidate('expired')` → 제보 목록·이름·좌표·마커·길찾기 전부 삭제, 패널은 경고 한 줄로 바뀜(높이 432→138px, 모바일 138→107px).
2. 늦게 도착한 응답은 세대가 바뀌어 버려짐.
3. 다음 주기에 전체 재조회(approved·pending·recent-sites·field-updates + 사후 확인) → 목록 복구 → 패널 다시 커짐.
4. 응답 지연이 계속 250ms 근처면 1~3이 반복된다.

이 한계는 기존 설계 하네스(`docs/p1-free-capacity/client/pre-renewal-scheduling.mjs`)가 이미 기록했다: "RTT 300ms → expired", "타이머 지연 200ms → expired". 도입 커밋 `9b4555a`(10/13). **PR #24(대안 B)와 무관**: #24의 index.html 변경 구간은 추천 선발 함수뿐이다(diff hunk 확인).

## 재현 증거

| 조건 | 결과 |
|---|---|
| 운영 사이트, 이 PC 실제 응답(public-state 40회: 중앙 132ms, 최대 242ms) | 25~40초 관찰 중 만료 0회. 여유 250ms에 최대값이 8ms 차이로 근접 |
| 운영 사이트 + public-state 응답에 300ms 지연 주입, 1440×900 | 30초에 `expired` 2회, 패널 432↔138px 반복, 지도 컨테이너 1440×900 불변 |
| 로컬 프록시(운영 API로 GET만 전달, 응답 419~776ms), 수정 전 빌드, 375×812 | 40초에 `expired` 3회, 데이터 재조회 16회, 패널 138↔107px |
| 같은 조건, **수정 빌드** 375×812 | `expired` 0회, 재조회 4회(초기 1회분) |
| 같은 조건, 수정 전/후 1440×900 | 전 `expired` 2회·재조회 12회 / 후 `expired` 0회·재조회 4회 |
| 가상 시계 하네스(실제 함수), 수정 전 | RTT 300/600/900ms·타이머 지연 900ms에서 모두 만료(6/9 실패) |
| 같은 하네스, 수정 후 | 9/9 통과 |

"지도가 작아졌다 커졌다": 측정상 Leaflet 지도 컨테이너 크기는 변하지 않았다. 지도 위에 고정된 최근 제보 패널의 높이 변화, 그리고 제보 마커가 사라졌다 다시 그려지는 것이 그렇게 보인 것으로 판단한다(사용자 화면 녹화와 대조하면 확정 가능).

## 수정 (최소)

`index.html` 한 줄: `PUBLICATION_RENEW_MARGIN_MS` 250 → **1000** (재확인 시작 주기 4750 → 4000ms).

- 바꾸지 않은 것: 5초 상한(`PUBLICATION_MAX_AGE=5000`), 만료 기준(요청 시작 시각), nonce/epoch/revision 검증, 사후 확인(fresh postflight), 실패 시 파괴적 삭제, 숨김 탭 처리, CSS·추천 알고리즘·대안 B, Worker·D1.
- 응답+타이머 지연이 1000ms를 넘으면 지금처럼 만료되어 위치·길찾기를 숨긴다(fail-closed).

## 보안 영향

- 공개 데이터를 보여 줄 수 있는 최대 시간은 그대로 "권한 응답을 요청한 시각 + 5초"다. 주기만 앞당겨져 갱신이 더 자주 일어날 뿐 권한을 연장하지 않는다.
- Chrome에서 응답 1500ms(여유 초과)로 30초 관찰: 수정 전·후 모두 `publicationAllowed()` 확인 직후 거부 상태에서 남은 좌표·이름·마커·길찾기 링크 **0건**, 경고 표시 정상.
- P1 시험: 위치 보호·팝업 가드·숨김/만료·신규 갱신 여유 시험 47/47 통과. reports-api 322/322(공개 권한·CAS·보호종 포함, 코드 무변경).
- `test_publication_visibility_expiry.mjs` 의 상수 단정 중 `PUBLICATION_RENEW_MARGIN_MS` 값만 250→1000으로 바꿨다(5000 상한 단정은 유지).

## 비용 영향 (추정)

보이는 탭 1개당 public-state 12.6 → 15회/분(+2.4회/분, 약 +19%). 전체 Worker 요청은 약 14 → 16.4회/분. 대신 만료마다 발생하던 전체 재조회(4~5요청)가 사라져 느린 망 사용자는 오히려 줄어든다(위 측정: 40초 16 → 4회). public-state는 요청당 D1 단일 행 조회 1건. 실제 청구액은 대시보드에서 확인해야 한다.

## 시험 결과

| 범위 | 결과 |
|---|---|
| 신규 `test_publication_renewal_margin.mjs` (가상 시계, 실제 함수) | 9/9 PASS (수정 전 코드로 돌리면 6 FAIL — 회귀 검출 확인) |
| `.github/scripts/test_*.mjs` 전체(로컬, `PYTHONUTF8=1 CHROME_PATH=…`) | 444/444 PASS (초판의 "7 FAIL"은 CHROME_PATH 미지정 때문이었다) |
| reports-api / weather-proxy | 322/322, 36/36 PASS |
| 추천 CI 서명(P1-S 고정 입력, 190곳·176후보) | PASS, 대안 B 결과 불변 |
| Python 기상·조석·SEO | PASS |
| Chrome PC 1440·모바일 375 수정 전후 | 위 표 |

미실행: GitHub CI(PR 생성 시 실행), 실제 사용자 PC의 응답 시간 측정, 344·768·1024 폭(레이아웃 변경이 없어 생략).

## 배포 전 위험

- 사용자 PC의 응답이 1초를 넘는 경우(매우 느린 망, Worker/D1 일시 지연)에는 여전히 경고가 나온다. 이것은 보안상 의도된 동작이다.
- 확인 주기 단축으로 public-state 요청이 약 19% 늘어난다.
- 확정 진단에 도움이 되는 추가 자료: 증상이 난 PC의 개발자도구 Network에서 `public-state` 요청 시간 분포(특히 250ms 초과 빈도).

## 롤백

`PUBLICATION_RENEW_MARGIN_MS`를 250으로 되돌리는 revert. 데이터·서버 변경 없음.

## CI 실패 분석 (PR #25, run 38569301560, head 5372438)

- 실패 단계: "Chrome publication and consent security with local mock only" 209 PASS / 19 FAIL, 기존 위험 사례 15건 중 1건 false. 이후 단계(통계 Chrome, D1 fence/CAS, 보호 패키지)는 앞 단계 실패로 미실행.
- 아티팩트 `publication_chrome.json` 전수: **19건 모두 1024px**. 첫 실패 `V06-refresh-stale-first-field-list`가 `ReferenceError: fieldUpdates is not defined`, 이후 같은 페이지의 18건이 `fieldNavChoiceClose is not defined`(또는 요청 0건)로 연쇄 실패. "unsafe 1"은 V06 1024이며 **좌표·길찾기 노출이 아니라 페이지 미로딩 오류**다(evidence에 데이터 없음, error만 있음).
- 원인: V06은 `Page.reload({ignoreCache:true})` 뒤 **고정 1200ms만 대기**한다. CI 네트워크 계수가 로컬 대비 로컬 GET 5건(로드 후 JSON 5개)·CDN GET 2건이 적어, reload 뒤 CDN 자산이 늦게 끝나 페이지 파싱·스크립트 실행 전에 평가가 시작된 것으로 확인된다.
- 재현: 기존 하네스에 CDN 지연 2500ms만 주입하고 1024px로 실행 → **PASS 14 / FAIL 19, 실패 ID 19개와 오류 문구, unsafe 1이 CI와 동일**. main의 index.html(`PUBLICATION_TEST_INDEX_REF=origin/main`)로도 동일하게 19건 실패 → **250→1000ms 변경과 무관한 하네스 타이밍 결함**.
- 지연 없이 로컬 Chrome: 수정 브랜치·main 모두 242/242 PASS, unsafe 0.

### 수정 (시험 하네스만, 보안 단정 불변)

- `publication_chrome_final_r4.mjs`: 최초 로드와 reload가 같은 준비 조건(Leaflet·publication 함수·190 마커, 최대 40초)을 기다린 뒤 기존 1200ms를 둔다. 40초 안에 준비되지 않으면 V06은 `page not ready after reload`로 **FAIL**(SKIP·PASS 처리 없음). 모든 시나리오의 판정식은 그대로다.
- 시험 전용 `PUBLICATION_TEST_DEPENDENCY_DELAY_MS`(기본 0): CDN GET만 지연.
- CI에 회귀 단계 추가: "Chrome publication security with slow dependencies (1024px)" — CDN 2500ms 지연에서 1024px 전 항목 PASS 요구.

| 실행(로컬 Chrome) | 결과 |
|---|---|
| 기존 하네스 + CDN 2500ms, 1024, 수정 브랜치 | 14 PASS / 19 FAIL, unsafe 1 (CI 재현) |
| 기존 하네스 + CDN 2500ms, 1024, main | 14 PASS / 19 FAIL, unsafe 1 |
| 수정 하네스 + CDN 2500ms, 1024, 수정 브랜치 / main | 47/47 PASS, unsafe 0 |
| 수정 하네스, 5개 폭, 지연 없음 | 242/242 PASS, unsafe 0, 운영 요청 0 |
| 통계 Chrome(reporter_chrome) | 65/65 PASS |
| 보호 Pages 패키지 생성 | 정상(562 files) |
