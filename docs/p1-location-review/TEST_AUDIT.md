# 테스트 범위 독립 감사

검사 대상: f27e661c3762d7787f976196ed84eeb8d255c3c7. 수정 전: b12e20c1b6d856a021898a0c1c9221b30393a221. 최신 main 기준: 43bff43301d5915a344bf2c20987698597cf8870. 분석자는 제품 파일과 assertion을 수정하지 않았다.

## 원형 시험 범위와 환경

원형 f27에는 .github/scripts/test_*.mjs 14파일이 있다. 실제 Node 발견 수는 **349**, 신규 위치 보호 시험은 **19**다. 보고된 351과 차이 2건의 파일·명령은 저장소에 기록되어 있지 않아 351건 전수 통과로 표현하지 않는다. reports-api·weather-proxy·Python은 이 349에 포함되지 않는다.

| 실행 환경 | f27 원형 | 수정 전 b12 |
|---|---|---|
| Chrome 경로·Python UTF8 미설정 | 349: 316 통과, 8 실패, 25 skip | 330: 297 통과, 8 실패, 25 skip |
| 실제 Chrome 경로 설정, Python UTF8 미설정 | 349: 348 통과, 1 실패, skip 0 | 330: 329 통과, 1 실패, skip 0 |
| Chrome 및 Python UTF8 충족 | 349/349 통과, 실패·skip 0 | 330/330 통과, 실패·skip 0 |

동일 환경에서 변경 전후 재현되는 미설정 실패는 8건이다. 기존 실패 9건이라는 보고의 아홉 번째 시험은 확인하지 못했다. 실패 9건을 모두 기존 결함이라고 승인하지 않는다. 기존 8건도 올바른 환경에서 없어지므로 제품 결함으로 분류하지 않는다. 25 skip은 실행하지 못한 조건이며 성공이 아니다.

미설정 8건의 동일 이름:

1. A/B. PC에서 공지 닫기 버튼 중심의 hit target이 닫기 버튼이다 (1366·1920 필수)
2. C. 공지 열린 상태에서 닫기 버튼을 실제로 클릭하면 패널이 닫힌다
3. D. todayToggleBtn은 공지 열림/닫힘 양쪽에서 정상 클릭된다
4. E. 모바일은 기존 배치와 동작을 그대로 유지한다
5. F. 다른 overlay(추천 패널·월간 조석 모달)의 stacking 회귀가 없다
6. 정원 밖 공지 연계 장소는 적격·안전한 경우만 표시하고 중복 없이 지도에 연결한다
7. 주간 편집 목록은 지정 순서·표시명과 기존 적격성을 유지하고 날짜로 만료되지 않는다
8. C01 원자료가 선상 기준을 넘으면 생성 반올림과 무관하게 최종 추천에서 빠진다

1~7은 설치된 Chrome을 CHROME_PATH로 지정하지 않아 브라우저 실행을 찾지 못하는 실패다. 8은 Python stdout cp949를 Node가 UTF8로 읽어 북풍 문자열이 깨지는 실패다. 실제 Chrome: C:/Program Files/Google/Chrome/Application/chrome.exe. Node v24.18.0. UTF8 재실행은 PYTHONUTF8=1, PYTHONIOENCODING=utf-8, Python runtime 디렉터리를 PATH 앞에 추가했다. C01을 포함한 주간165 시험은 두 SHA 모두 165/165 통과했다.

명령·전체 TAP·카운트는 results/original-f27/ 및 results/baseline-b12/의 configured_full.*, unconfigured_full.*, summary_chrome.*, weekly_utf8.*에 보존했다. 미설정 실패 로그를 삭제하지 않았다. 재현용 scripts/audit_legacy_scope.mjs는 인자로 지정한 소스 디렉터리의 시험 목록과 해시를 기록하고 실제 Node 시험을 호출한다.

## 신규 19건과 독립 변형 7종

19/19 원형 통과. 각 방어를 독립적으로 메모리에서 무효화한 다음 같은 실제 제품 함수 추출 시험을 실행했다. 원본 index.html을 변경하지 않았다. 구현자의 원래 변형 7종 명세는 제공되지 않았으므로 아래는 새 독립 변형이며 같은 명세를 재현했다고 주장하지 않는다.

| ID | 무효화 방어 | 19건 중 실패 | 탐지 |
|---|---|---:|---|
| M1 | 삭제 tombstone 필터 | 2 | 확인 |
| M2 | 현장소식 응답 요청 순번 | 1 | 확인 |
| M3 | 보호 상태 sticky 기억 | 2 | 확인 |
| M4 | 방향 안내 대상의 활성·보호 검사 | 8 | 확인 |
| M5 | 지연 GPS 콜백이 최신 상태 대신 초기 객체를 사용 | 3 | 확인 |
| M6 | 승인·대기·최근 제보 응답 순번 | 2 | 확인 |
| M7 | 탐조지 이력 cache 세대 검사 | 1 | 확인 |

results/mutations-f27/summary.json 및 7개 TAP에 실패 이름이 보존되어 있다. 최초 기본 spec reporter 결과에는 TAP 카운트가 없었으며 원본 *.spec.txt와 initial_spec_reporter_summary.json을 보존했다. 이후 명시적으로 TAP reporter를 적용해 위 실패 카운트를 확인했다. 이 시험은 전체 보안 정책·브라우저 동작을 증명하는 E2E를 대체하지 않는다.

## 기존 테스트 파일 수정 감사

f27의 test_site_history_cache.mjs 수정은 siteHistoryGen 전역을 하네스에 추가하는 한 줄이다. test_weekly_recommendation.mjs 수정은 reportRequestStart/reportResponseCurrent의 실제 함수 소스와 두 요청 순번 전역을 하네스에 주입한다. 기존 expected 값, assert 또는 시험 이름은 변경·삭제되지 않았다. 제품 함수의 새 의존성을 시험 환경에 연결하는 수정으로 정당하다.

main43과 b12의 주간 시험은 main에 아직 병합되지 않은 PR13 S2-A·C·F2·F3 구현 범위가 서로 다르므로 main 전용 브랜치의 더 작은 시험 수를 PR13 회귀 621건과 혼동하지 않는다. PR13 합성 결합은 별도의 충돌·자동 시험·고정 입력 검증 대상이다.

## 최신 main 기준 기존 실패

정확한 main43 archive에서 Chrome·UTF8을 충족한 JS12파일은 252건: 250 통과, 2 실패, skip 0이다. 두 실패 이름은 다음과 같다.

- 카카오맵 길찾기 URL 은 기존 출현 지점 링크와 같은 형식이고 좌표가 이상하면 만들지 않는다
- 외부 길안내 창 열기: noopener 기능 문자열을 쓰지 않고(성공해도 null 반환) 차단 시 직접 누르는 링크를 보여 준다

results/baseline-main43/full.tap, summary.json에 수정 전 동일 환경 증거를 보존했다. 오래된 시험 하네스·문자열 계약과 최신 티맵 선택 동작의 차이 여부는 루트 분석의 실제 브라우저 검증과 함께 판단해야 한다. 테스트를 삭제하거나 기대값만 바꾸지 않았다.
## PR13 결합 자동 회귀 최종 원장

임시 결합 tree: a5808cb647759bdd10726318c061d68545c7c63a. 최신 main 전용 위치 보호 수정과 PR13 b12를 결합한 읽기 전용 archive다. 실제 main·PR13·운영 Worker를 변경하지 않았다.

| 스위트 | 발견 | 통과 | 실패 | skip |
|---|---:|---:|---:|---:|
| 결합 front 15파일 | 350 | 348 | main과 동일 2 | 0 |
| reports-api 자동 발견 | 178 | 178 | 0 | 0 |
| weather-proxy | 36 | 36 | 0 | 0 |
| Python 기상 | 56 | 56 | 0 | 0 |
| Python 조석 | 22 | 21 | 0 | 1 |
| 총계 | **642** | **639** | **2** | **1** |

이 2건은 원형 f27의 미설정 환경 8건과 별개다. 최신 main에서 이미 바뀐 카카오 버튼 문구(찾아가기 → 카카오맵), GPS 뒤 외부 창 자동 열기 → 카카오·티맵 앱 선택창 계약을 옛 시험이 검사하기 때문이다. 최신 main 수정 전에도 같은 실패가 있고 실제 안전·앱 선택 E2E는 별도 검증한다. 결과를 무조건 통과로 변경하지 않았다.

결합 front에는 루트가 추가한 팝업 상태 보안 시험 1건이 있으므로 원형 f27 349와도 다르다. reports-api/test/*.test.mjs만 지정한 첫 범위는 assertion 시험 177건이었다. cd reports-api 후 node --test 자동 발견은 test/helpers.mjs 모듈 smoke 시험 1건을 추가해 보고된178이 된다. 추가 1건을 독립 보안 assertion으로 과장하지 않는다.

최초 조석 4error는 축약 archive에 MasterDB가 없어 발생했다. 읽기 전용으로 exact main의 동일 workbook git blob d8eb89ed459cc51ff41a46590b4ccc820551ad27을 확인한 뒤 scratch에만 복사하고 재실행하여21pass/1skip을 확인했다. 원본 워크북·공개자료·제품·test assertion을 수정하지 않았다. 최초 errors 로그는 보존했다.

results/integration/initial_missing_asset_summary.json는 최초 부족 fixture와 좁은 reports-api 범위의 원장이다. 최종 총계와 교체 범위는 results/integration/final_summary.json, 추가 자산·범위 근거는 scope_and_asset_rechecks.json다. 모든 원형 로그(front.log, reports-api.log, python-tide.log 포함)를 보존했다.

정확한 실행:

- Chrome·UTF8을 설정한 node --test --test-reporter=tap .github/scripts/test_*.mjs (실제 파일 목록은 JSON command에 전수 보존)
- cd reports-api 후 node --test --test-reporter=tap
- node --test --test-reporter=tap weather-proxy/test/*.test.mjs
- 지정 Python runtime으로 .github/scripts/test_weather.py 및 .github/scripts/test_tide.py
- 독립 변형: node docs/p1-location-review/scripts/mutation_guard_audit.mjs <원형f27소스폴더> <별도결과폴더> f27e661c3762d7787f976196ed84eeb8d255c3c7

## 정리 대상

분석 중 만든 scratch baseline-b12/, baseline-b12.tar와 root/with-pr13/data의 동일 MasterDB 복사본은 검증 후 정리하며 커밋하지 않는다. 원본 checkout의 .github/scripts/__pycache__/는 Python fixture subprocess가 만든 미추적 cache이므로 검증 종료 후 정리한다. 시험 결과·명령·문서만 검증 브랜치에 저장한다. 실제 민감종 원본 좌표·API 원문·비밀정보는 저장하지 않았다.
