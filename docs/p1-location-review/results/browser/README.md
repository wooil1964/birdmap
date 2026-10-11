# 독립 Chrome·Leaflet 위치 보호 검증

실행: node docs/p1-location-review/scripts/location_chrome.mjs

- Windows에 설치된 실제 Google Chrome(headless CDP)으로 제품 index.html 전체를 로컬 HTTP에서 실행한다.
- 344·375·768·1024·1440px의 5개 화면 폭을 검사한다.
- 지도는 실제 Leaflet, 팝업과 현장소식은 실제 DOM이다. 외부 지도 배경 타일은 의도적으로 차단한다. Leaflet·jQuery 등 고정 CDN 의존성의 GET만 허용한다.
- Worker fetch는 합성 API에서 처리하며 CDP 네트워크 차단층도 Workers 도메인을 차단한다. navigator.sendBeacon도 합성 stub이다.
- 실제 운영 POST·DELETE·GET을 수행하지 않는다. 브라우저 내부 합성 요청만 제품의 등록자 삭제·상태 변경 콜백을 실행한다.
- 모든 제보·현장소식 자료와 좌표는 합성이다. Kakao·TMAP 외부 앱을 실행하지 않는다.

## 결과 읽기

location_chrome.json의 rows는 기존 정상 기능 및 이번 클라이언트 방어 검사다.
별도 separateSecurityLedger는 미해결 위험 재현이며, rows 성공 수에 포함하지 않는다.

기본 75조건: 5폭별 실제 지도·190개 런타임 자료, 정상 탐조지 카카오·티맵, 승인 팝업 같은 줄 두 버튼, 보호 팝업 길찾기 부재, 승인 대기·최근 승인 목록, 현장소식 두 앱 선택창, 등록자 삭제 버튼, 삭제 후 두 오래된 목록 응답, 같은 좌표 보호 전환 후 열린 팝업 갱신, 지연 일회성 GPS, 모바일 GPS watch 종료/PC 방향 안내 제한, 상태 변경 팝업과 뉴스 필터, 보호 전환 전 요청 응답, 보호 전환 후 새로운 요청이 받은 오래된 캐시, 현장소식 박스를 검사한다.

별도 위험은 다음 세 종류 × 5폭이다.

1. 승인 제보 철회 후 더 늦은 요청이 받은 서버의 과거 목록은 마커를 복귀시킨다.
2. 승인 제보 가림 후 더 늦은 요청이 받은 서버의 과거 공개 자료는 카카오·티맵 링크를 다시 활성화한다.
3. 전체 새로고침은 메모리 tombstone을 지우므로 서버가 삭제 전 자료를 주면 현장소식 마커가 복귀한다.

이는 실제 운영에서 유출 사고가 발생했다는 증거가 아니다. 합성 서버 응답으로 클라이언트 방어 범위의 한계를 재현한 것이다.
보호 상태의 요청 순서와 서버 자료의 발행 순서는 같은 의미가 아니다. API에서 공개 버전/withdrawal 여부/캐시 무효화 계약이 필요하며, 클라이언트에서 이미 내려온 좌표를 서버 원본까지 지울 수는 없다.

## 보존한 하네스 진단

- location_chrome_harness_initial.json: Leaflet 객체를 CDP returnByValue로 반환해 직렬화가 실패했다. 제품 오류가 아니다.
- location_chrome_harness_status_label.json: 잘못된 문구 “안 보임” 기대였다. 제품은 FIELD_STATUS_LABEL.not_visible = “안 보여요”다. 당시 telemetry sendBeacon 5건은 CDP에서 모두 차단됐다.
- location_chrome_harness_news_filter.json: not_visible이 현장소식 박스에 남는다는 잘못된 기대였다. 기존 fieldNewsList는 visible/reappeared만 표시한다. 정정 검사는 팝업의 상태 표시와 뉴스 박스 숨김을 함께 확인한다.
- location_chrome_harness_popup_await.json: 승인 목록 적용 Promise 완료 전에 팝업을 읽은 하네스 순서 오류다.
- location_chrome_before_button_click.json: 기본 기능·위험 관측은 동일하나 삭제/상태 진입을 함수로 호출한 선행 실행이다. 최종 실행은 실제 DOM 버튼 click으로 진입한다.

위 실패 원자료는 삭제하지 않았다. 기대값을 제품 결함에 맞춰 제거하지 않았고, 정상 계약을 제품 소스로 확인한 뒤 별도 실패 장부를 유지했다.
최종 스크립트는 제품 파일을 수정하지 않는다.
