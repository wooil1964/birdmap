# 통합 개편 최종 보완 — 로컬 검증 기록 (2026-11-08)

## 인계와 기준

- 기존 저장소: `C:/Users/김진호/Documents/GitHub/birdmap`. 이 경로 자체의 status는 work tree 오류가 발생했으므로 실제 Claude worktree를 확인했다.
- 원본 worktree: `C:/Users/김진호/AppData/Local/Temp/claude/f7744f8201f25f50/06a1c437-3f03-4bfa-828a-4bac9ec64afb/scratchpad/ap`.
- 원본 브랜치: `claude/autopublish-integrated-20261108`, HEAD `e9ffcf18ba622f883021d017feb533cbd95725df`. 추적 파일 변경 없음, 기존 미추적 `.ci-results/` 보존.
- GitHub main은 연결된 GitHub 도구로 `87594cd1a44e2fcd06d0cb9aa2caba44bfed654a`임을 확인했다. 이 main 위에 Claude의 5개 커밋이 있다: `707a955`, `83b194b`, `ad82f0e`, `214578e`, `e9ffcf1`.
- 원본을 로컬 Git bundle로 보존하고 작업 공간에 전체 이력을 복제했다. main에서 재구현하지 않았다. 원본 worktree의 파일·브랜치 HEAD·DB는 변경하지 않았다.
- 후속 작업 브랜치: `codex/public-counts-legacy-species-20261108`. 본 문서를 포함하는 후속 커밋은 e9ffcf1의 자손이다.

## 구현 범위

- 공개 이력·지도 상세창·탐조지 이력·자동 공개 미검증 상세창에 종별 `sightings`의 입력 개체수를 전달하고 표시한다. 공개 항목은 `name`, `count`, `countStatus`만 사용한다.
- 완전 입력: **3종 · 입력된 개체수 6개체**. 일부 입력: **3종 · 입력된 개체수 합계 5개체**. 미입력은 null로 유지한다. 같은 종 중복·해석 불확실은 개체수 확인 필요로 표시하고 합산하지 않는다.
- 서로 다른 날짜·제보의 개체수를 한 제보의 총 개체수처럼 합치지 않는다. 기존 모바일 접이식 팝업과 스크롤·펼치기 동작을 유지한다.
- 미검증 제목·상태·관리자 확인 전 안내를 유지한다. 공개 허용 필터·보호 위치·미검증 재판정·자동 공개 OFF 기본값은 변경하지 않는다.
- 과거 승인 자료는 공식 국명에 정확히 일치하는 국명+양의 정수(+마리/개체)만 읽기 단계에서 해석한다. `고니3`과 `고니`는 한 종이다. 파생 개체수 3도 명시된 입력분에만 더한다. 원문·raw_submissions·sightings를 갱신하거나 일괄 보정하는 SQL은 없다.
- 정본의 식별값과 관리자 정정값을 우선한다. 미확정 이름·별칭·부분 일치·잘못된 숫자는 원문을 유지한다. 과거 미승인 자료를 승인 통계에 섞지 않는다.
- 관리자 summary/species/sites/reporters/monthly/yearly/list·종 필터 및 회원별 종수·종 목록이 같은 읽기 규칙을 사용한다. 관리자 목록의 원문은 보존한다.

## 공식 국명 근거

한국조류학회 「2025 한국조류목록」 개정판 v2.1의 공식 [자료실](https://sites.google.com/khu.ac.kr/korornsoc/%EC%95%8C%EB%A6%BC%EB%A7%88%EB%8B%B9/%EC%9E%90%EB%A3%8C%EC%8B%A4)에서 [배포용 XLSX](https://drive.google.com/file/d/1VlTTkz0FQqqT0vnqhAxaLZ7iHvLeGNOp/view)를 확보했다.

- XLSX SHA-256: `b660e125a35abc00df77aa61f3ba24997de7fe1d213ef1350ceacfe08466ba7a`
- `분류목록` 시트의 `Species`, 가-1/가-2 국명 598개만 추출했다. 아종·보류 목록·별칭은 추가하지 않았다.
- 원자료의 `학도요` 앞 탭 1개를 포함한 국명 열의 앞뒤 공백만 제거하고 NFC로 저장했다. 종명의 의미는 바꾸지 않았다.
- 안내 시트 B5는 이용자의 형식 변경과 자유로운 가공 사용을 허용한다. 원자료의 기존 사이트 엑셀 DB를 대체하거나 탐조지 출현종을 고치지 않는다.
- 런타임은 저장소에 고정된 국명 목록만 사용하며 외부 목록을 실시간 조회하지 않는다.

## 변경 파일

- `index.html`: 개체수 표시 함수와 기존 공개 상세·이력 연결.
- `reports-api/src/shared.js`, `official-bird-names.js`: 읽기 전용 공식 국명 대조·공개 개체수 DTO.
- `reports-api/src/admin-stats.js`: 기존 승인 자료의 읽기 해석과 필터·집계 정합성.
- `reports-api/src/publication.js`, `autopublic.js`, `report-search.js`, `site-history.js`: 기존 공개 허용 질의의 동일 스냅샷에서 종별 수량을 함께 읽음.
- `reports-api/test/species-split.test.mjs`, `autopublic.test.mjs`, `legacy-species-read.test.mjs`: 공개 흐름·공식 국명·레거시 스키마·원본 불변 검증. 새 정책에 따른 응답 및 집계 기대값만 조정하고 보호 검사는 유지했다.
- `.github/scripts/test_public_report_counts.mjs`: 실제 제품 함수를 실행하는 상세 표시·부분 입력·이스케이프·보호 위치·길찾기 검증.
- `docs/p1-publication-final-audit/browser/publication_chrome_final_r4.mjs`: 개체수 시나리오 2개 × 화면 폭 5개 추가. 로컬 서버의 CSS/JS MIME을 올바르게 제공하고 기존 팝업 안정화 후 측정한다. 닫기 링크는 길찾기 링크로 오인하지 않는다.

## 로컬 검사 결과

- 서버 영향 검사 17개 파일: **234/234 통과**.
- 프런트 영향 검사 9개 파일: **117/117 통과**.
- 실제 Chrome 공개 권한·보호·팝업 검사: **157/157 통과**, 브라우저 예외 0건, 운영 API 요청·외부 쓰기 0건. 344·375·768·1024·1440px에서 승인/미검증 개체수, 모바일 펼치기, 실제 합계 가시성, 카카오맵·티맵 DOM을 검사한다.
- 공식 국명 598개 각각에 4개 수량 형식을 대조했다. 미확정/별칭/잘못된 수량·중복·정본 우선순위를 검사했다.
- 통계 조회 전후 원본 행과 SQLite total_changes가 같음을 확인했다. sightings가 없는 이전 스키마도 검증했다.
- 사이트 데이터 계약은 Chrome 하네스의 기대값 생성 시 통과했다. siteData·siteSpotData·Worker 좌표·ID·출현종·기상/조석 자동 생성 파일은 변경하지 않았다.
- `git diff --check` 통과. 이 변경의 새 테스트는 기존 CI의 test glob에 자동 포함된다.

## 영향과 남은 상태

- 위치 보호 v2·검색·마커·길찾기 경로의 기존 검사를 유지했다. 외부 카카오맵/티맵 앱 실행이나 실제 휴대전화 GPS는 이번에 확인하지 않았다.
- 전체 로컬 회귀를 다시 실행하지 않았다. Claude의 기존 서버 407/프런트 663/관리자 Chrome 38/변이 9종 결과를 이번 검증으로 재인증한 것으로 표현하지 않는다.
- 운영 D1 조회·변경, Worker 배포, 자동 공개 스위치 변경, GitHub push·PR·CI·병합은 하지 않았다. **로컬 검증 완료이며 GitHub CI 미실행 상태**다.
- 받은 요청은 “3. 공식 국명 검증”에서 끝난다. 그 뒤의 추가 조건은 전달받지 못했으므로 본 문서의 구현 범위에 포함되지 않았다.
