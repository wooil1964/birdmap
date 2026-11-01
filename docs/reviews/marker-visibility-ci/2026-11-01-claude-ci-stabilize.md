# PR #62 CI 안정화 — 주간 추천 3건·wide 휠 1건

2026-11-01 KST · 작성 도구: Claude Code · 브랜치 `codex/marker-visibility-pc-mobile` · 기준 PR head `fcba3d9`, main `df90011`
main 병합·운영 배포·운영 DB/Worker/Pages 변경 없음. 운영 제보 등록 없음.

## 1. 작업 목적

PR #62의 기존 실패 4건(주간 추천 612·1799·1873행, 지도 `wide wheel_flicks_uneven_per_ip_limit`)의 실제 원인을 해결해 `gps-browser`·`regression` 두 작업을 모두 통과시킨다. 마커 기능은 바꾸지 않는다.

## 2. 실제 원인과 수정

### 2-1. 주간 추천 3건 — 테스트 fixture의 월·날짜 불일치 (확정)

시험 하네스의 `todayKstMonth()`는 `ctx.month`(지정 없으면 9)를 돌려주지만, `now`를 주지 않으면 `Date`는 실제 시계(11/01)를 쓴다.
`todayRecommendedSites()`는 선발 계절을 `todayKstMonth()`(가을)로, 후보 정책은 `weeklyDatePolicy()`가 **추천 날짜의 월**(11월=겨울)로 정한다. 그래서 겨울 축으로 만든 후보를 가을 정원으로 뽑았다.

- 612행: 갯벌 축 0개(`0 !== 3`) — 11월 날짜라 겨울 축에는 `mudflat`가 없다.
- 1799행: 산림 후보 `null` — 겨울 정책이 산림을 제외.
- 1873행(R02 fixture): 들판 후보 빈 목록.

수정: 해당 시험에 월과 시계를 함께 고정했다(`month:9 + SEPTEMBER_FIXTURE_NOW`, `month:10 + R01_NOW`). 같은 원인으로 3~8월 실행 시 깨지는 잠복 시험 6건(458·473·510행 선상/today fallback, R01 E·F·H)도 같은 방식으로 고정했다. 운영 추천 코드·순위·안전 기준·기대값은 바꾸지 않았고, 시험을 삭제·skip하지 않았다.

검증: 실제 날짜 180/180 통과. 프로세스 시계를 2027-01~12월 15일로 옮긴 12회 실행에서 고정 시험은 전부 통과했다. 남는 실패 2건(557·648행 `실데이터…`)은 저장된 `weather_week.json`(11/01~11/07)을 읽는 시험이라 가짜 날짜에서는 자료 범위를 벗어나 실패하는 것이 정상이며, 실제 날짜에서는 통과한다.

### 2-2. wide 불규칙 휠 — 컨트롤러 휴식 타이머의 1프레임 공백 (확정)

계측 재현(로컬 Chrome, 수정 전 wide 15회 중 7회 실패):

- 시나리오 시작 시점에 페이지 로드+시작 화면 타일 **84개**가 모의 per-IP 창(180/60초)에 이미 있다. 정상 실행은 첫 단독 줌 45 + 정지 레벨 45 = 90 → 합 174로 여유가 6개뿐이다.
- 실패 실행은 항상 같은 5번째 휠에서 z13 화면(40타일)을 추가로 불러왔다: 84+45+40+44 = 213 > 180 → 429 → `tile_error` → OSM.
- 그 직전 간격 기록 [407, 313, 415]ms → 휴식 1.25×415 = 519ms(줌 종료 2218ms에 시작, 약 2737ms 만료). 사용자의 휠은 **2685ms에 이미 도착**했고 Leaflet 40ms debounce가 약 2725ms에 끝나 `wheel._startTime`을 지운다. 그런데 Leaflet은 줌 애니메이션을 다음 `requestAnimationFrame`에서 시작한다(`_tryAnimatedZoom`, 2751ms).
- 기존 가드 `map._animatingZoom || wheel._startTime`은 이 1프레임 동안 둘 다 거짓이라 대기 중인 휠을 놓치고, 곧 떠날 레벨 화면을 불러왔다. 타이머가 이 약 25ms 공백에 떨어지느냐가 실행마다·기계마다 달라져 결과가 흔들렸다.

수정(`assets/birdmap-basemap.js` `_restAfterZoom`): 휴식 만료 시 가드를 통과하면 바로 부르지 않고 다음 애니메이션 프레임에서 한 번 더 확인한다. 그 사이 시작된 줌은 휴식을 다시 시작했으므로(타이머 id 비교) 부르지 않는다. 429 판정·`MAX_TILE_ERRORS`·OSM 자동 전환·복구 백오프·Worker 리미터·시험 기대값은 그대로다.

검증: 같은 시나리오 10회 반복 20/20 통과(PC 56·wide 90타일 = 최소치, 오류 0). 수정 전 PC에서 가끔 생기던 24타일 추가 로드도 사라졌다. 전체 지도 장애 검사 67/67.

### 2-3. 증거 파일 점검

- 추가 파일 50개 중 중복 blob 없음. 모든 이미지·로그는 README/report/CI-AUDIT에서 참조되어 유지했다(합 약 5.6MB, 1440×900 원본 2장 1.8MB씩).
- 토큰·키·Authorization·비밀 패턴: PR 추가분에서 0건(index.html의 Turnstile site key·Analytics beacon은 main에 원래 있는 공개값).
- `followup/evidence/ci-audit/downstream-results.json`에 Windows 사용자 경로(실명)가 4곳 남아 있어 다른 증거와 같이 `<local-workspace>/`로 가렸다. **이전 커밋 `fcba3d9`의 이력에는 원문이 남아 있다**(강제 Push로 이력을 고치지 않았다).

## 3. 변경 파일

| 파일 | 내용 |
|---|---|
| `.github/scripts/test_weekly_recommendation.mjs` | 9개 시험의 월·시계 고정(기대값 불변) |
| `assets/birdmap-basemap.js` | 휴식 만료 시 다음 프레임 재확인(+9줄) |
| `docs/marker-visibility/followup/evidence/ci-audit/downstream-results.json` | 로컬 사용자 경로 마스킹 |
| `docs/reviews/marker-visibility-ci/2026-11-01-claude-ci-stabilize.md` | 이 보고서 |

## 4. 시험 결과 (로컬, 작업 트리 = 이 커밋, Windows·Chrome 설치본·Node 24.18.0)

| 검사 (CI 단계와 동일 명령) | 결과 |
|---|---:|
| GPS 팝업·길찾기 | 750/750 |
| 위치 선택·카카오 검색 | 296/296 |
| 최근 제보 PC/모바일 | 96/96 |
| 마커 표시·터치·2회 반복·정리 | 325/325 |
| Front regression 전체 | 609/609 (실패 0·skip 0) |
| 주간 추천 단독 | 180/180 |
| 지도 빠른 전환·타일 장애 | 67/67 |
| 섬 검색 Chrome | 25/25 |
| 공개·관리 API·SQLite | 371/371 |
| Weather proxy | 36/36 |
| Python 계약·날씨·조석·공유 | 156건 통과(조석 기존 1 skip) |
| SEO | 194 페이지·196 sitemap URL |
| 추천 정확 서명 | 일치(exit 0) |
| 공개·동의 Chrome / 느린 CDN 1024 | 147/147 · 31/31 |
| 제보자 통계 / 현장 은퇴 Chrome | 135/135 · 60/60 |
| Native D1 fence·CAS·registry | 41/41 + ops 3종 통과 |
| 보호 Pages 패키지 | 695 파일 생성(업로드·배포 없음) |

Python 단계는 이 PC에 Pillow가 없어 첫 실행에서 공유 카드 2건이 `ModuleNotFoundError`로 멈췄다. CI처럼 Pillow를 설치한 임시 venv에서 같은 명령을 다시 실행해 전부 통과했다(코드 문제 아님). GitHub Actions 결과는 Push 후 별도로 확인·보고한다.

## 5. 좌표 검증

좌표·siteData·sites.js·조석 매핑 변경 없음(해당 없음). 마커 검사에서 240개 ID·좌표 일치 유지.

## 6. 기존 기능 영향

마커 CSS/JS·index.html 변경 없음. 작은 마름모·흰 테두리·선택 링·출현종 색과 진한색·반지름 10%·900ms×2 반짝임·해제·최근 15건·PC/모바일·GPS/카카오/티맵·보호종 비공개 검사 모두 통과. 작은 모바일 상세 패널 가림은 그대로 두었다. 지도 변경은 휠 연속 줌 중 불필요한 화면 로드를 줄이는 방향뿐이며, 오류 판정과 OSM 전환 조건은 같다.

## 7. 남은 위험·미확인

- (확정) `birdmap-basemap.js` 수정은 마커 PR에 섞인 지도 운영 코드 변경이다. 병합 시 지도 동작에도 영향을 주므로 사용자 승인이 필요하다. 롤백은 이 파일을 `fcba3d9` 판으로 되돌리면 된다.
- (추정) 실제 기기 휠은 프레임이 16ms 정도라 공백이 더 짧아 운영 영향은 작았을 것이다. 운영 재현은 하지 않았다.
- (기존) 엄격한 180/60 모의에서 600ms×12 → 2초 휴식 반복의 429는 이번 범위 밖이다.
- (기존) `실데이터…` 주간 시험 2건은 저장된 `weather_week.json`이 7일 이상 낡으면 실패할 수 있다(자동 갱신 지연 시).
- (미확인) 물리 기기 Safari/Android.
