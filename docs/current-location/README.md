# 현재 위치와 공개 지점 직선 안내

기준: main `a810b0341b1a63441fb49f6b2076778556e0eb1a` (2026-10-28).

## 사용 방법

- 모든 탐조지 상세, 공개 제보 지점, 공개 고정 붉은 점, 최근 15건과 탐조지별 이력의 제보 위치 팝업에서 카카오맵·티맵 옆 **내 위치 찾기**를 누른다.
- 위치 권한 허용 뒤 파란 점과 정확도 원, 선택한 공개 지점까지 점선과 **직선거리**가 나타난다. 도로·등산로·배편 경로가 아니며, 출입 가능 여부와 안전한 접근 경로는 별도로 확인한다.
- 지도 가장자리 **⌖ 내 위치**는 열려 있는 팝업과 기존 안내를 닫고 현재 위치를 보여 준다.
- 모바일에서 공개 목적지의 **내 위치 찾기**가 성공하면 상세정보 하단 시트를 **64px 안내 막대**로 자동 접고, GPS 파란 점·출현 지점·거리와 안내선이 함께 보이도록 지도 시야를 조정한다. **펼치기** 버튼으로 상세정보를 다시 볼 수 있고, GPS 위치 확인에 실패하면 시트를 접지 않는다.
- 내 위치의 파란 점은 부드럽게 반짝이며 기기의 **움직임 줄이기** 설정을 사용하면 애니메이션을 생략한다. 위치 저장·공유 방식은 그대로다.
- 모바일 GPS 시작 시 탐조 메뉴·지도 종류 메뉴·검색 패널을 접어 지도 공간을 확보한다. 기존 메뉴는 다시 펼칠 수 있다.
- **⋯ 위치 도구**에서 **이동 갱신**, **안내 종료**, **위치 지우기**를 사용할 수 있다. 이동 갱신은 사용자가 켠 경우에만 작동하고, 위치를 갱신해도 지도 시야를 강제로 옮기지 않는다. 안내 종료는 파란 점을 남긴다. 위치 지우기는 점·정확도 원·안내선과 GPS 갱신을 모두 끝낸다.
- 목적지 팝업을 닫거나 목적지 레이어가 제거되면 안내가 끝난다. 화면을 떠나면 위치 표시와 GPS 갱신을 모두 끝낸다. 휴대전화에서 카카오맵·티맵 등 다른 앱으로 전환할 때도 지워지므로, 돌아온 뒤 필요하면 내 위치를 다시 찾는다.
- HTTPS와 브라우저 위치 권한이 필요하다. 비지원·권한 거부·시간 초과·위치 확인 실패를 한국어로 안내한다. 정확도 100m 초과는 참고용 경고를 표시하고, 10km 초과 또는 오래되거나 잘못된 위치는 사용하지 않는다.

## 공개 좌표와 개인정보

- DOM 버튼에는 site/fixed/report ID만 넣고 좌표를 넣지 않는다. 탐조지는 `siteData`, 고정 붉은 점은 `siteSpotData`의 공개 정본과 현재 기존 마커의 좌표 일치를 확인한다. 원본 좌표는 변경하지 않았다.
- 제보는 기존 `/reports/search`의 정확한 제보 ID 공개 projection, WeakMap witness, 공개 정본·이력·마커, 새 publication 검증을 모두 통과해야 한다. 보호종·번식·위치 가림·철회·삭제·불일치는 안내하지 않는다. 고정점에 연결된 제보도 같은 제보별 검증을 거친다.
- GPS를 받기 전과 받은 후에 공개 목적지를 검증한다. 이동 갱신은 같은 유효 publication lease/revision 아래서만 재사용하며 별도 서버 폴링을 추가하지 않는다. 기존 publication 무효화 시 안내선과 거리 표시를 동기 제거한다. 취소된 비동기 GPS·조회 응답은 표시를 되살리지 못한다.
- GPS 좌표·정확도는 브라우저 메모리와 Leaflet 레이어에서만 처리한다. 앱 서버, D1, localStorage, sessionStorage, 외부 길찾기 URL에 보내거나 저장하지 않는다. 브라우저 자체의 위치 API와 기존 지도 타일 요청은 사용한다. 타일 요청은 기존과 같이 지도 시야의 z/x/y이며 앱이 GPS 숫자를 쿼리나 본문으로 전송하지 않는다.
- 현재 위치로 지도 시야를 옮기면 그 주변 지도 타일이 요청된다. 지도 제공자는 요청된 타일 범위와 접속 정보로 대략적인 위치를 추론할 수 있다.
- 기존 카카오맵·티맵은 공개 목적지만 사용하며 기기 현재 위치를 출발지로 추가하지 않는다. 유부도 출항지 등 기존 접근 안내는 유지하며, GPS 점선은 선택한 탐조지 자체의 공개 좌표까지 표시한다.

## 자동 검증

Node 24와 Chrome을 사용한다. 단위 테스트는 합성 데이터만 사용한다.

```sh
node --test .github/scripts/test_gps_location.mjs .github/scripts/test_species_search.mjs
node --test --test-reporter=tap .github/scripts/test_*.mjs
node --test reports-api/test/*.test.mjs
node --test weather-proxy/test/*.test.mjs
```

브라우저 검증은 Playwright가 설치되어 있어야 한다. `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `GPS_TEST_OUTPUT`으로 모듈·Chrome·결과 경로를 지정할 수 있다.

```sh
node docs/current-location/verify.cjs
node .github/scripts/cache_gps_dependencies.mjs /path/to/url-sha256-cache
POPUP_DEPENDENCY_CACHE=/path/to/url-sha256-cache node docs/current-location/popup-regression.cjs
REPORT_UI_BASE=a810b0341b1a63441fb49f6b2076778556e0eb1a node docs/report-location-20261026/verify.cjs
node docs/basemap-fast-switch/faults-chrome.mjs . .ci-results/basemap-faults/result.json gps-regression
```

`popup-regression.cjs`는 현재 HTML과 실제 Leaflet·모바일 시트를 사용하고, GPS·공개 API·타일은 모두 합성한다. CDN 의존성은 URL의 SHA-256을 파일명으로 보관한 원본 바이트 캐시에서만 읽으며 누락하면 실패한다. 외부 요청은 전송하지 않는다. `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `POPUP_TEST_OUTPUT`으로 실행 환경과 결과 경로를 지정한다. 같은 6개 화면에서 안내 종료·닫기·취소·오류·페이지 정리와 모바일↔PC 전환 후 원래 팝업 `autoPan` 설정과 CSS 클래스 복원을 확인한다. 이동 갱신만 끄면 안내와 임시 설정은 유지한다.

PR CI는 별도 `gps-browser` 작업에서 고정 버전 `playwright-core@1.62.1`과 설치된 Chrome으로 이 검사를 실행한다. 캐시 준비는 HTML의 검토된 CDN 라이브러리 12개, Leaflet 기본 마커 이미지 3개와 CSS의 이미지·Chrome용 글꼴만 HTTPS GET으로 읽는다. 허용 목록 변경·다른 호스트·리다이렉트는 실패한다. GPS·제보 API·실제 지도 타일·분석 서버는 호출하지 않는다. 이후 브라우저 실행은 CDN도 캐시로 응답하며 외부 요청을 전달하지 않는다. 화면과 결과 JSON, 의존성 URL·해시 목록을 14일 진단 자료로 보관한다. 기존 보안 회귀 작업과 분리해 긴 지도 전환 검사의 제한 시간을 잠식하지 않으며 배포 단계는 없다.

`verify.cjs`는 실제 공개 GET 응답과 합성 GPS를 사용하며 모든 외부 non-GET을 차단한다. 1440×1000, 1024×768, 768×1024, 320×568, 390×844, 844×390을 검사하고 화면과 JSON 결과를 남긴다. 지도 타일은 합성 이미지로 대체한다. 휴대전화 실기기의 OS 권한창·실제 GPS 센서·카카오/티맵 앱 실행은 이 자동 검증의 범위에 포함되지 않는다. main 병합과 배포는 별도 사용자 승인이 필요하다.
