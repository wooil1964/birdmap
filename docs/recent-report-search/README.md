# 최근 제보 전체 보기·검색

기준: main `850b038f486db3ef32fe944daa8f8cf025b71ca1` (2026-10-21 KST 확인).
브랜치: `feat/recent-sightings-search`. main 병합·운영 배포는 수행하지 않는다.

## 구현

- 기존 최근 관찰 60일·최대 15건과 기존 `/reports/approved` 소비자는 변경하지 않는다.
- 최근 제보 탭의 전체 보기 모달은 `/reports/search?q=...&offset=0&limit=20`을 사용한다. 검색은 전체 승인 이력에 적용되며, 관찰일·접수일·ID 내림차순으로 20건씩 추가한다.
- 검색어는 NFC·소문자·공백 정규화 후 부분 일치한다. 100자 제한, 제어문자 및 중복 인자 거부, 고정 페이지 크기 20, 안전한 정수 offset 검증을 적용한다. `%`, `_`, 따옴표는 검색용 리터럴이다.
- 기존 `publication-v1`의 primary 세션, 상태/자료 원자적 batch, nonce, epoch/revision, writer/trigger 검증, `no-store`, 프런트 사전/사후 권한 검증과 5초 lease를 재사용한다. 새 경로에는 비계약 fallback을 두지 않는다.
- 같은 snapshot의 승인 행과 기존 공개 sites registry에서 필요한 필드만 읽는다. 공개 DTO를 만든 다음 검색·건수·페이지를 계산한다. 비공개 이름·비공개 위치가 검색 건수에 영향을 주지 않는다.
- 이름은 해당 행의 공개 동의가 있을 때만 제공한다. 위치 가림·민감종/번식 키워드·비공개 부모·사라진 부모·다단계 연결은 지역/탐조지/지도 대상 없이 표시한다. 좌표·원본 메모·관리자 메모·원본 site_id/spot_key는 새 응답에 없다.
- 지역/탐조지 이름은 공개 registry(`index.html:siteData`)의 현재 항목만 사용한다. 지정된 탐조지가 없는 제보의 지역을 좌표로 추정하지 않는다. Registry는 공개 장소 설명이며 공개 권한은 reports의 publication 상태를 따른다.
- 모달은 기존 기여자 모달 스타일을 재사용한다. 검색/초기화, 로딩/실패/재시도/빈 결과, PC/모바일, 닫기/배경 클릭/ESC, 포커스 복원/Tab 순환을 제공한다.
- 검색/닫기/공개 권한 무효화 때 요청 번호와 결과를 폐기한다. 이전 검색 응답과 다른 publication의 추가 페이지는 반영하지 않는다. 권한 무효화 후 모달에는 재시도 상태만 남긴다.
- 지도 선택은 최신 권한과 현재 공개 결과를 재확인하고, 기존 `reporterStatsWitnesses`로 현재 승인 마커 항목을 찾아 `openReportEntry`를 호출한다. 숨긴 위치에는 이동 버튼·길찾기가 없다.

## 검증 명령

```powershell
node --test --test-reporter=tap # reports-api 디렉터리
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONDONTWRITEBYTECODE='1'
node --test --test-reporter=tap .github/scripts/test_*.mjs
node --test --test-reporter=tap weather-proxy/test/*.test.mjs
node --test --test-reporter=tap events-worker/test/*.test.mjs
# 선택: 설치된 Playwright index.mjs 경로를 BIRDMAP_PLAYWRIGHT에 지정
node docs/recent-report-search/browser.mjs
```

브라우저 검증은 실제 index.html, 실제 public API 핸들러, 로컬 SQLite 합성 DB를 연결한다. 운영 API 요청은 차단하고 공개 CDN 라이브러리 GET만 허용한다. 375/768/1440px에서 20/20/3 추가 조회, 공개 지역 검색, 비공개 이름 검색 배제, 민감 위치 이동 차단, 초기화, ESC/포커스, 기존 마커 이동, 승인 취소에 따른 revision 변경/결과 폐기, 오류/재시도, 화면 맞춤을 검증한다. 결과 JSON과 화면 이미지는 저장소 외 출력 디렉터리에 생성한다.

전체 프런트 테스트에는 기존 과거 커밋 `35141c04…`, `b12e20c1…`, `519b4bd1…`이 필요하다. shallow clone에서는 해당 객체를 가져와야 한다. Windows에서는 CHROME_PATH와 Python UTF-8 설정이 필요하며, CDN 차단 환경에서는 기존 Leaflet 초기화도 실패한다.

기존 제주/수도권 보존 테스트의 전체 HTML 고정 비교는 이번에 승인된 추가 영역만 명시적 경계·정확한 단일 출현을 검증하여 제외한다. 이 영역 밖의 HTML은 기준 main과 완전히 같음을 새 Python 테스트로 확인하고, 최근 목록 제한·공지·publication lease 변조가 비교에 그대로 남는지 확인한다. 자동 갱신 기상 파일의 보존 기준은 오래된 날짜 고정 SHA 대신 현재 PR/main 기준점을 사용한다. 원본 데이터·좌표·정적 보호 파일 검증은 유지한다. CI에 `test_report_archive_contract.py`를 추가했다.

## 범위와 한계

DB 마이그레이션이나 공개 권한 계약 변경이 없다. 현장소식·기여자·조석·기상·탐조지 데이터 및 좌표는 변경하지 않는다. 최소 변경과 기존 JS 민감종 판정의 일관성을 위해 승인 행을 공개 DTO로 만든 뒤 메모리에서 검색/페이지 분할한다. 응답은 최대 20건이지만 DB 읽기는 승인 전체 행에 비례한다. 운영 대용량 성능 측정과 운영 배포는 이 작업에서 수행하지 않았다.

## 최종 로컬 검증 (2026-10-21 KST)

- Reports API 371/371, 전체 프런트 432/432, weather-proxy 36/36, events-worker 20/20 통과.
- Python 129건 통과, 조석 1건은 공식 표본 날짜가 현재 월간 범위 밖이어서 기존 정책대로 skip. SEO 194개 페이지/196개 sitemap URL 확인 통과.
- 실제 Chrome 375/768/1440px 세 화면의 통합 시나리오 통과, page error 0건. 운영 API 요청은 차단했다.
- 승인 취소·동의 철회·위치 가림·삭제·epoch 변경·필수 trigger 누락, 비공개 검색 건수 추론, 민감 위치/부모 연결, 늦은 응답/닫기/페이지 권한 변경을 검증했다.
- inline JavaScript 3개 파싱, 추가 중복 HTML ID 0개. runtime 탐조지 229개 및 고정 출현 지점 3개의 데이터/좌표가 기준 main과 동일하다.
- 초기 실패(CDN 접근 차단, Chrome/Python 설정 누락, shallow 과거 객체 누락)는 환경을 보완한 최종 실행에서 해소했다. 오래된 전체 HTML 보존 검사는 승인된 새 영역만 제외하도록 보완했고 그 밖의 원본 HTML 일치를 별도 검증했다.

## PR #39 후속 검증: 추가 조회 상태 보존·성능

최신 main `850b038f…` 및 기존 PR HEAD `91649629…`를 확인하고 기존 기능 변경을 보존했다. 실제 Chrome 375/768/1440px의 12사례에서 이전 구현은 추가 조회마다 기존 행·버튼 DOM을 교체하고 초점을 검색창으로 옮겼다. 같은 기록에서 scrollTop과 검색어는 유지됐으므로 스크롤 초기화가 재현됐다고 주장하지 않는다. 수정 후에는 scrollTop·검색어뿐 아니라 기존 DOM과 버튼 초점도 유지됨을 확인했다.

같은 검색어·publication·기존 ID 순서에서는 기존 행과 더 보기 버튼을 유지하고 새 행만 추가한다. 스크롤 anchoring을 억제하고 기존 scrollTop을 유지한다. 로딩 중에는 native disabled 대신 aria-disabled와 중복 요청 방어를 사용한다. 마지막 페이지에서도 같은 버튼을 '모두 불러왔습니다.' 상태로 유지해 초점을 잃지 않는다. 검색/권한 변경·닫기는 렌더 캐시와 DOM을 즉시 폐기한다. 키보드 초점은 공개 권한 폐기 시 모달 안의 검색 입력으로만 안전하게 옮긴다.

브라우저 검사는 명시적으로 후속 페이지 응답을 보류한 상태와 해제 후를 각각 확인한다. 검색어 없음/공개 지역 검색의 offset20·마지막 페이지에 대해 세 화면 총 12사례에서 scrollTop, 기존 행·더 보기 DOM, 검색어, 초점 보존을 확인한다. 중복 활성화, 마지막 페이지 Tab 순환, 새 검색·ESC·승인 취소 이후 늦은 응답도 검사한다.

100/1,000/10,000건 합성 승인 자료의 실제 local workerd+Miniflare D1 측정은 [PERFORMANCE.md](PERFORMANCE.md)와 [PERFORMANCE.json](PERFORMANCE.json)에 기록했다. inspector 없는 응답시간 실행과 별도 isolate heap 관측 실행을 분리했으며, 각각 18조건·378회 요청을 측정했다. 서버 검색·권한 계약은 변경하지 않았다.

후속 로컬 결과: 프런트 436건, API 371건, weather/events 56건 통과. Python 129건 통과·기존 조석 표본 범위 검사 1건 skip 및 SEO 통과. 실제 Chrome 세 화면과 12개 추가 조회 보존 사례 통과, page error 0건. 운영 병합·배포는 수행하지 않았다.
