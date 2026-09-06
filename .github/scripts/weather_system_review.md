# 기상 안정화 검증 기록 (2026-09-06)

## 목적과 시작 상태

오래된 저장 기상을 현재 기상·오늘 점수로 사용하지 않고, runtime/Worker 대상과 실패 진단을 일치시킨다. 시작 시 `AI_WORK_RULES.md`, `HANDOVER.md` 전문 확인. main `1c9ccc5a3c4ba9dbd5a809193270b9fbe8ecff04`, origin/main과 차이 0, 미커밋 변경 0이었다.

## 조사한 데이터 흐름

| 원본 | 생성/요청 주체 | 저장 | UI 소비 | 실패 시 | 최신성 |
|---|---|---|---|---|---|
| Windy Point Forecast, 기존 Open-Meteo 대체 API | update_weather.py / Actions | weather_today.json | 저장 기상, 시정·파고, 점수 | 이전 지점 자료 또는 자료 없음 | 종전 날짜 제한 없음 → 지점 날짜·예보 시각·원 생성 시각·stale 검사 |
| KMA 초단기실황·초단기예보·단기예보 | Cloudflare Worker | Worker/브라우저 15분 캐시 | 현재 기온·바람·강수, 내일 오전/오후 | 종전 실황/예보 하나 실패 시 전체 실패 → 정상 구성 응답 유지 | 원 요청 시각 15분 + KMA 발표 기준 시각/격자 검증 |

Actions는 KST 06:17/10:17/14:17/18:17, 작업 제한 30분이다. 예정 실행 시각에서 30분이 지난 뒤에는 해당 실행 시각보다 이전에 생성된 자료를 참고로 처리한다. 같은 날이라도 갱신 지연·재사용이면 오늘 점수에 사용하지 않는다. GitHub 스케줄 지연 시에도 보수적으로 미확인 표시한다. 자정 이후 전날 자료 역시 참고다.

기존 Actions 실패 run `34015424143`, job `101438224131`: `index.html에서 siteData를 찾지 못했습니다.`가 API 요청 전에 발생했다. 초기 183개 배열 뒤에 추가된 concat 배열 때문에 정규식이 실패했다. literal JSON 배열과 concat을 읽고 중복을 거부하는 공통 로더로 변경했다.

## 대상·좌표 전수 비교

수정 전 runtime 187/Worker 186, runtime에만 188, Worker에만 있는 ID 0, 중복 0. 공통 186개 좌표·pelagic·environment 일치. 이름만 ID 14의 `걸매리` / `아산만 삽교호` 불일치. Worker 이름을 현재 runtime에 맞추고 끝에 188만 추가했다. 기존 186개 순서와 좌표, index의 모든 siteData 필드는 보존했다.

수정 후 runtime/Worker/공통 ID 모두 187, 중복·누락·이름·좌표·pelagic·환경 불일치 모두 0. Worker는 weatherRuleKey를 소비하지 않으며 저장 점수 생성기는 기존 runtime rule을 사용한다.

| ID | 탐조지 | index 존재 | Worker 존재 | 좌표 일치 | 수정 여부 | 비고 |
|---|---|---|---|---|---|---|
| 107 | 매향리 | O | O | O | 없음 | 37.053319, 126.754097 |
| 19 | 유부도 | O | O | O | 없음 | 공통 좌표 보존 |
| 9 | 동검도 | O | O | O | 없음 | 공통 좌표 보존 |
| 50 | 청림운동장 | O | O | O | 없음 | 공통 좌표 보존 |
| 188 | 이천항 | O | O(추가) | O | Worker 추가 | 35.263447, 129.239856 |
| 51 | 울릉도 | O | O | O | 없음 | 공통 좌표 보존 |
| 52 | 독도 | O | O | O | 없음 | 기존 pelagic/해양 우선 유지 |
| 57 | 제주 하도리 성산포 | O | O | O | 없음 | 공통 좌표 보존 |
| 14 | 걸매리 | O | O | O | Worker 이름만 | 36.88597222222222, 126.88324444444444 |

이천항은 runtime·카카오·Windy·기존 조석 매핑 좌표가 모두 일치했다. 저장소 v24 업데이트용 Excel과 v21 Excel의 전체 워크시트에서 이천항 행은 확인되지 않았다. Excel 일치를 주장하지 않으며 사용자가 지정한 현재 runtime 좌표를 그대로 사용했다. Excel·조석 좌표는 변경하지 않았다.

## 실제 API 결과와 한계

기존 배포 Worker를 production Origin으로 2026-09-06 17:08~17:09 KST 호출했다.

| ID | HTTP | 소요 초 | 실제 결과 |
|---|---|---|---|
| 107 | 504 | 8.219 | KMA_TIMEOUT |
| 19 | 504 | 8.219 | KMA_TIMEOUT |
| 9 | 504 | 8.140 | KMA_TIMEOUT |
| 50 | 504 | 8.140 | KMA_TIMEOUT |
| 188 | 404 | 0.125 | INVALID_SITE_ID: 코드/등록 문제 |
| 51 | 200 | 8.141 | 16:00 관측, 18:00 예보, grid 127/128, 내일 없음, no-store |
| 52 | 422 | 0.125 | MARINE_PRIMARY_REQUIRED: 의도된 해양 우선 분기 |
| 57 | 504 | 8.157 | KMA_TIMEOUT |

8개 모두 production CORS 헤더 정상. 429 관측 없음. 울릉도 실제 성공으로 배포 환경 KMA 키 인식·정상 API 응답을 확인했다. 다수 8초 timeout은 외부 요청 지연이며 ID 누락과 구분한다. timeout을 숨기거나 무제한 늘리지 않는다.

로컬에는 WINDY_API_KEY가 없어서 환경변수 값을 출력하지 않고 기존 Open-Meteo fallback으로 실제 생성했다. 17:31 시작/17:32 종료, 187개 성공, failed/reused/stale/unavailable 모두 0, scoreEligible 187, providerFallback 187. 대기 자료를 수동 수정하지 않고 생성 스크립트로 갱신했다. 이 성공 수는 저장 기상 API 수이며 KMA Worker live 성공 수가 아니다.

Worker 수정 코드는 로컬 테스트 및 Wrangler 4.129.0 `deploy --dry-run` 통과. 최초 인증 만료 확인 후 갱신된 인증을 재확인하여 실제 배포 완료했다. Version ID `0c8fbbb2-728d-4dfd-8d3b-2ed0fb5d8e05` (51.89 KiB). `secret list`로 KMA_SERVICE_KEY 등록 이름만 확인했고 값은 읽거나 출력하지 않았다. 위 표는 수정 전 배포본 결과다. 배포 후 결과는 아래와 같다.

| ID | HTTP | 소요 초 | 결과 |
|---|---|---|---|
| 107 | 504 | 8.172 | KMA_TIMEOUT |
| 19 | 504 | 8.187 | KMA_TIMEOUT |
| 9 | 504 | 8.172 | KMA_TIMEOUT |
| 50 | 504 | 8.141 | KMA_TIMEOUT |
| 188 | 504 | 8.156 | 등록 누락 해결, KMA_TIMEOUT |
| 51 | 504 | 8.140 | KMA_TIMEOUT |
| 52 | 422 | 0.141 | 기존 해양 우선 분기 |
| 57 | 504 | 8.140 | KMA_TIMEOUT |

새 production 8곳 모두 기대 CORS 헤더, preflight 204, 잘못된 Origin 403/CORS 없음, 잘못된 ID 404. 기본 Python User-Agent는 Cloudflare 403/1010으로 차단되어 브라우저 형식 User-Agent로 재검증했다. 이 차단을 KMA parsing 오류로 오인하지 않는다. 429는 관측되지 않았다. 새 배포에서 실제 기상 성공·cache hit·응답 좌표/내일 데이터는 timeout 때문에 확인할 수 없었다. 이를 로컬 fixture 성공으로 대체하지 않는다. HTTP 504를 유지하며 UI에서 저장 기상 fallback을 명시한다.

## freshness / fallback 정책

| 상황 | 표시·점수 |
|---|---|
| A live 성공 | 유효한 현재 필드 표시. 저장 점수 자체의 적격 여부는 별도로 유지 |
| B 오늘 저장값 | 날짜·생성 시각·갱신 일정 통과 시 기존 점수 사용 |
| C 오늘 대체 API 포함 | 출처 표시. 바람·3시간 강수 및 파고 필요 지점의 파고가 유효해야 점수 사용 |
| D 전날 | 이전 저장값(참고), 오늘 적합도 미확인 |
| E 여러 날 이전 | 원래 예보·생성 시각 보존, 오늘 적합도 미확인 |
| F 없음 | 자료 없음, 오늘 적합도 미확인 |

`score_weather` 공식은 AST 비교로 동일함을 확인했다. 기존 강수 점수 상한 보정도 유지했다. 키 누락 또는 전면 API 장애 시 최신 날짜로 옛 점수를 재포장하지 않는다. 이전 자료는 stale/scoreEligible=false/sourceType=saved_reference로 보존한다. placeholder는 재사용 자료로 집계하지 않는다.

Open-Meteo의 current 강수를 3시간 누적 강수로 오인하지 않도록 직전 3개 hourly precipitation을 합산한다. 원래 점수의 3시간 입력 단위를 유지한다. 시정·돌풍·구름의 선택적 누락 처리 자체는 기존 공식대로 유지한다. 출처는 fieldSources에 기록한다. 파고 조회에 쓰던 기존 해양 좌표 후보도 변경하지 않는다.

공식 참고: [Open-Meteo 변수/시간 단위](https://open-meteo.com/en/docs), [기상청 API Hub 단기예보](https://apihub.kma.go.kr/apiList.do?seqApi=10), [기상청 초단기예보](https://www.kma.go.kr/kma/biz/forecast02.jsp).

새 health 파일은 만들지 않았다. weather_today.json 상단 날짜·시각·registry·성공/실패/재사용/stale/없음/점수 적격/대체 API 수, 지점 provenance, Worker 오류 코드·캐시 원 시각, Actions 검증 로그로 진단한다. `validate_weather.py`는 단순 JSON 문법 외 날짜·ID·집계·점수 적격 조건을 검사한다.

## 검증과 기존 기능 영향

- Python 기상 회귀 8개, Node Worker/UI 회귀 33개 통과. 캐시 원 생성 시각 보존/만료 후 재요청도 검증했다.
- index 모든 inline script 컴파일 통과. JSON 검증 통과. Worker dry-run 통과.
- 조석 회귀 20개 통과, index 조석 함수 24개 원문 동일, 조석 파일·notices·지도 버튼·탐조지 설명·eBird·KSA 변경 없음.
- 실제 브라우저 검색→매향리 마커/팝업 정상. 오늘 저장값·대체 API와 원 시각 표시 확인.
- 격리된 로컬 fixture로 8/25 저장값 + live 실패 → 참고/점수 미확인 확인. 8/25 저장값 + synthetic live 성공 → 현재 기온 표시, 옛 점수 미사용, 내일 09/15시 예보 유지 확인. fixture는 실제 KMA 성공 증거로 집계하지 않는다.
- 모바일 390×844: 문서 scrollWidth=390, 팝업 내부 width/scrollWidth=327로 가로 overflow 없음. 데스크톱에서 열린 팝업을 좁힐 때 위치가 화면 밖/상단 UI 아래로 벗어나는 기존 위치 보정 문제 재현. 팝업 재개방·resize 시 autopan 및 상단 여백이 수정 후보이며 이번 기상 작업에서 대규모 CSS 변경하지 않는다.

## 수정 전후 (로컬 실제 생성 기준)

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| runtime 수 | 187 | 187 |
| Worker 코드 등록 수 | 186 | 187 (production 배포 완료) |
| 누락 ID 수 | 1 | 코드/production 0 |
| stale weather 수 | 183개 모두 8/25, 플래그 0 | 0 |
| live 성공/실패 | 1 성공, 5 timeout, 1 누락, 1 해양 분기 | 새 배포: 7 timeout, 1 해양 분기 |
| 저장값 대상 수 | 183 | 187 |
| 이전 저장값 재사용 수 | 0 (오래된 파일 자체 유지) | 0 |
| 데이터 없음 수 | runtime 중 4 | 0 |

Commit/Push 후 Actions 결과와 GitHub main 검증은 후속 기록에 남긴다. Cloudflare 배포는 완료됐으나 외부 KMA 안정 응답은 미해결이다. 전체 live 정상화를 주장하지 않는다.

production GitHub Pages에서 이천항 검색·팝업·현재 저장 자료 및 live 실패 fallback 표시 확인. 모바일에서 재개방해도 상단 검색 패널과 팝업이 겹침을 확인했으며 별도 개선 대상으로 남긴다. 자료 없음 fixture도 브라우저에서 오늘 적합도 미확인/자료 없음으로 확인했다.

추가 회귀: 저장 기상과 조석이 모두 없는 월악산(77)에서도 기상 카드/실시간 조회가 유지되도록 조건을 수정했다. 브라우저에서 기상 자료 없음·오늘 적합도 미확인·최신 기상 조회 실패 문구를 확인했다.
