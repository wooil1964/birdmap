# 독립 Chrome 및 클라이언트 공개 위치 보안 감사

## 입력과 범위

- 최초 실제 입력: PR #17 `71177330fd1d45c64f3bef632cf1f43286c304cd`의 index.html.
- 독립 checkout: `C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap`.
- 제품 파일은 이 검증 담당자가 수정하지 않았다. 로컬 HTTP 서버, 실제 Chrome/Leaflet, 합성 API/좌표 및 두 독립 Chrome 페이지를 사용했다.
- 화면 폭 344, 375, 768, 1024, 1440px.

## 최초 재실행

`node docs/p1-publication-final-audit/browser/publication_chrome_baseline.mjs`

`baseline-7117733/publication_chrome.json`: 165 pass, 0 fail, 0 skip, exit 0. 기존 Chrome 보안 위험 15건 0 unsafe. 운영 API 요청 0, 외부 non-GET 0, Runtime exception 0. 기본 지도/팝업/현장소식/삭제/정상 재승인/다기기/지연 GPS/새로고침/nonce/BigInt/네트워크와 단조 시계 lease 경계가 실제로 실행됐다.

## 추가 차단 결함 재현

`PUBLICATION_TEST_WIDTHS=375 node docs/p1-publication-final-audit/browser/publication_chrome_attacks_v3.mjs`

`independent-attacks-v3-7117733/publication_chrome.json`: 51 pass, 5 fail, 0 skip, exit 1.

1. 승인 제보 Kakao/TMAP 링크 auxclick에서 현재 정확 좌표 href가 남고 head 요청이 발생하지 않음.
2. 현장소식 Kakao/TMAP 링크 contextmenu에서 현재 정확 좌표 href가 남음.
3. HEAD 합성 전달 지연 2,013.1ms 뒤 lease가 다시 5,000ms 부여되어 요청 시작 기준 총 7,013.1ms. 5초 서버 권한 freshness 상한이 아님.

실제 외부 앱은 실행하지 않았다. Chrome DOM 이벤트와 링크가 보안 게이트를 우회할 수 있는 기본 주소를 검증했다. URL에는 합성 좌표만 포함됐다.

`PUBLICATION_TEST_WIDTHS=375 node docs/p1-publication-final-audit/browser/publication_chrome_head_race.mjs`

`preexisting-head-7117733/publication_chrome.json`: 51 pass, 1 fail, 0 skip, exit 1.

기존 HEAD 요청이 처리된 뒤 전송을 보류하고 서버 권한을 가림으로 변경했다. 그 후 카카오 링크를 클릭하면 이미 진행 중이던 HEAD를 route check가 재사용하고, 응답 해제 후 합성 창의 location에 정확 좌표 URL이 지정됐다. `closed:false`. 실제 브라우저 안에서 제품 click 핸들러와 publicationRouteCheck 경로를 실행해 재현했다.

## 시험 원형과 교정

`publication_chrome_independent.mjs` 첫 실행은 삽입 패턴이 CRLF와 불일치하여 새 공격 시험이 실행되지 않았으므로 165건 재실행에만 해당한다. 통과 결과를 신규 공격 통과로 계산하지 않는다.

`publication_chrome_attacks.mjs` v2 전체5폭 결과 175 pass / 11 fail / 0 skip, exit 1. 이 버전의 URL 정규식은 Kakao 실제 `/link/to/` 형식을 검사하지 못했다. 따라서 Kakao 10건은 검증 성공으로 승인하지 않는다. v3에서 실제 URL 형식을 엄격히 검사해 같은 제품의 4가지 URL 실패와 5초 lease 실패를 재현했다. 원형과 실패 JSON은 보존했다.

## 수정 후 재시험 계약

`publication_chrome_final.mjs`는 기본165, aux/context20, 전달 지연1, 정상 Kakao/TMAP URL20, 보호 상태 실행 차단20, 기존 HEAD route race5의 합계 231건을 예정한다. 동적 anchor의 href는 좌표 없는 `#`이어야 하고 data-publication-app을 사용한다. 정상 기능은 assertion 삭제로 처리하지 않으며, fresh 권한 조회 후 합성 window.location에 지정된 실제 Kakao URL 및 TMAP URL 생성/앱 실행 직전 호출로 검증한다. 정적190 링크는 기존 실제 주소를 유지한다.

최종 입력 SHA/결과는 root의 수정 commit/tree 전달 후 별도 디렉터리에 기록한다. 최초 실패를 덮어쓰지 않는다.

## 미검증과 제한

- 실제 물리 GPS, 설치된 Kakao/TMAP 앱, 운영 CDN POP, 운영 D1을 사용하지 않았다.
- 원격 지도 tile는 시험 네트워크 제한으로 차단되어 배경이 회색이다. 실제 Leaflet 라이브러리와 정적190 마커, 지도 DOM/제어/동적 팝업은 로드됐다. 운영 map tile 정상성을 이 시험만으로 승인하지 않는다.
- 보이는 좌표를 이미 수신한 이용자가 복사한 자료 자체를 회수할 수는 없다. 권한 폐쇄는 새 읽기와 현재 UI/새 길찾기 실행에 대한 계약이다.
- 단일 로컬 합성 권한 원장으로 두 Chrome 페이지를 시험했다. 실제 다중 기기와 분산 운영 POP 일관성은 별도 운영 검증이 필요하다.
## 통합 수정 ed678460 독립 재검증

실제 입력 `ed678460ea792248c739195abe4f2fbbffef29d2:index.html`.

`PUBLICATION_TEST_INDEX_REF=ed678460ea792248c739195abe4f2fbbffef29d2 PUBLICATION_TEST_OUTPUT=docs/p1-publication-final-audit/browser/final-ed678460-r2 node docs/p1-publication-final-audit/browser/publication_chrome_final_r2.mjs`

231 pass / 0 fail / 0 skip, exit 0. 5폭 전수 실행. 기존 Chrome15 unsafe0. 운영 API0, 외부 nonGET0, 브라우저 Runtime 예외0.

새 2초 HEAD 전달 지연은 elapsed2007.6ms + remaining2992.6ms = 총5000.2ms로 요청 시작 기준5초 계약을 만족했다. 정상 동적 anchor href `#` 유지, fresh 권한 검증 후 정확 Kakao 목적URL 및 TMAP 목적URL/실행시도 20건, 보호 전환 뒤 미실행20건, 이전 HEAD가 진행 중인 route race5건, auxclick/contextmenu20건이 모두 통과했다.

`final-ed678460` 첫 186 pass / 50 fail은 새 launch 준비 함수가 eval의 마지막 반환값을 바꿔 Promise.all 갱신을 기다리지 않은 시험 harness 오류다. 45 launch/race 및5 screenshot 단계가 null fixture로 실패했다. `final_r2`에서는 자료 갱신과 창 setup을 두 await 호출로 분리했다. 실패 기대값을 제거하거나 제품을 이 harness 실패에 맞춰 수정하지 않았다. 원형·JSON·로그 보존. 첫 실행의 기본165+새 URL/lease21 통과도 단독 배포 승인 근거로 쓰지 않는다.

## 개인정보 기여자 cache 추가 감사

`PUBLICATION_TEST_INDEX_REF=ed678460ea792248c739195abe4f2fbbffef29d2 PUBLICATION_TEST_WIDTHS=375 PUBLICATION_TEST_OUTPUT=docs/p1-publication-final-audit/browser/contributor-privacy-ed678460 node docs/p1-publication-final-audit/browser/publication_chrome_final_r3.mjs`

65 pass / 2 fail / 0 skip, exit1.

실제 /contributors/monthly의 publication 읽기로 합성 공개 닉네임을 기여자 탭과 모달에 표시한 뒤, 새 revision에 공개 닉네임 제거 또는 HEAD network unknown을 적용했다. 두 조건 모두 contributorsData·최근탭 DOM·열린 모달 DOM에 닉네임이 남았다. 정확 좌표 문제와 별개의 공개동의/권한확인 계약 위반이다. 구현자에게 캐시 anchor 검증과 권한 무효화 시 cache/모달 cleardown 및 늦은 응답 차단을 요청했다. 이 결과를 231 통과로 덮지 않는다.

최종241 시험은 해당10조건까지5폭을 포함하도록 준비했다. 수정 후 추가 입력·결과는 이후 절에 기록한다.