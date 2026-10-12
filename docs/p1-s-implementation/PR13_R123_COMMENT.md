## PR #13 — Sol Ultra 지적 R1·R2·R3 보완 (재검증 요청)

대상: `fix/p1-s-safety-guards` · 이전 차단 SHA `7eb6764` · 보완 커밋 `aa4f394`(R1+R3) · `70ef08a`(R1 Python) · `362ce50`(R2) + 증거 문서 커밋. S1-R 은 변경하지 않았고 main 병합·배포·D1 변경은 없습니다.

| 결함 | 재현(수정 전 `7eb6764`) | 수정 후 |
|---|---|---|
| R1 today 필수 기상 결측 | 일반·갯벌·섬 today 의 wind/rain null, 필수 wave null, 3필드 전부 null 이 공지·가점 16 과 함께 최종 추천 (matrix today 7행 실패, 특별분기 2건) | 모두 후보·최종 제외. 정상 0/100/92.5, 비필수 wave null 유지. `validate_weather.py` 도 적격 항목의 실제 wind/rain/(필수)wave 검사 |
| R2 팝업 92점 | eligible 누락/null, missingScoreFields 누락/null/목록, wind/rain/필수 wave 결측 8건이 모두 "★★★★★ 92점" | 8건 모두 "오늘 적합도 미확인", 기온·풍향 등 참고 값 유지. 정상 0/100/92.5 와 주간 파생 점수 표시 유지, 이전 저장은 참고 값 보존 |
| R3 비필수 wave·own 필드 | wave `'0.3'`/-1/NaN 이 JS 후보 통과(Python 은 거부), 상속 scoreEligible 통과(메모리 합성 객체) | JS 도 null 만 허용·값은 유한 ≥0, own 필드만 인정. 상속 시험은 Object.create 계약 시험이며 실제 JSON 공격 경로가 아님 |

### 실제 함수 matrix (Sol 스크립트에서 소스 선택만 working tree 로 변경: `docs/p1-s-implementation/results/r123/`)
- `7eb6764`: matrix 175/182, 특별분기 14/21, 팝업 4/12
- 현재: **182/182, 21/21, 12/12**

### 회귀 (Windows, Python 3.12, 로컬 Chrome 사용)
reports-api 178 · 주간 추천 145(+9) · 프런트 9파일 110(+4) · Chrome 공지 닫기 7 + 월간 조석 13 = 20 · 기상 Python 53(+3) · 조석 21/1 skip · weather-proxy 36 → **563 pass / 0 fail / 1 skip** (기준 547/0/1).
신규 테스트는 수정 전에 실패(주간 7, 자정 3, Python 16 subtest)한 것을 확인한 뒤 통과시켰습니다.

### 고정 입력 (2026-10-08 22:40, 190곳, 후보 176, 제보 ON/OFF)
35141c0 · 7eb6764 · 현재의 **전체 후보 signature 와 상위 10 동일**(ON 108 112 15 194 126 14 107 48 195 3 / OFF 112 7 8 10 126 14 107 48 3 5). 합성 null 11곳: 176후보·0점 11 → 165·0. P0 90/91분·대체 만조·강수 1mm·선상 6m/s·0.7m 회귀 통과. origin/main 의 최신 `weather_today.json`(16:28)·`weather_week.json` 도 두 validator 통과, 적격 181곳은 프런트 검사도 모두 통과.

### 기대값을 바꾼 기존 테스트
겨울·봄·여름 today fallback fixture 는 rain 없이 true/[] 만 있었으므로 "정상(풍속·강수·파고 포함, safe=true)"과 "강수 결측 거부"로 나눴습니다. weather-proxy freshness fixture 에 실제 형식의 wind/적격 metadata 를 추가했습니다.

### 별도 관리(이번 수정과 섞지 않음)
`loadFieldUpdates()` 에 응답 순서 가드가 없어 늦게 온 이전 응답(`locationHidden:false`)이 보호 상태를 되돌릴 수 있습니다(main 에도 동일). 정확 원본 좌표 노출로 확인된 것은 없으나 S1-P/별도 보안 작업의 우선 과제로 `NEXT_SESSION.md` 에 기록했습니다.

### 미검증
로컬 합성 API 를 쓴 제보·현장소식 등록/삭제/길안내 E2E, live 기상 merge 의 실제 네트워크 흐름, 실기기·배포 환경. 로컬 정적 서버에서 PC/모바일(375) 로드, 추천 패널, 정상·결측 팝업은 확인했습니다.
