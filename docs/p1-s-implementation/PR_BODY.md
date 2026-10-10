## P1-S 1단계 (S1-R + S2-A) — 검토용, **main 병합·배포 금지**

설계: `analysis/recommendation-masterplan` `P1_SAFETY_DESIGN.md` (60bfbdb), 검증: issue #9. 체크포인트: `docs/p1-s-implementation/NEXT_SESSION.md`.

### S1-R (`reports-api/src/shared.js`)
- 보호종 판정: 종명 전체 일치 → "보호종명 + 숫자(+마리/개체)" (저어새1, 저어새 2마리, 흰꼬리수리1, 매1). 부분 문자열 비교 없음(갈매기·알락오리·동박새 등 오탐 테스트 포함).
- 구분자 `, ; · / CR LF` 로 다시 나눠 판정(과거 저장 슬래시 자료 읽기 방어). `normalizeSpecies` 는 줄바꿈을 지우기 전에 구분자로 사용.
- 19종 목록, 번식 6단어, 알/산란, 슬래시 신규 입력 허용, 저장 자료 재작성: **변경 없음**.

### S2-A (`index.html`, `.github/scripts/validate_weather*.py`)
- 원점수 계약: `typeof number` + 유한 + 0~100, `scoreEligible===true`, 빈 `missingScoreFields`, 필수 풍속·풍향·강수(+파고 필요 지역은 파고). 표본 **선택 전** 적용 → 잘못된 최고점이 정상 차선 예보·대체 만조를 가리지 않음.
- 일반/갯벌 만조/대체 만조/섬/선상/오늘 fallback/가점/공지/mandatory/정원 보충/계절 분기/최종 10곳 모두 `weeklyRecommendationForSite`·`todayRecommendedSites` 관문을 지남. 점수 없는 공지·물때·동풍 전용 후보는 추천하지 않음(공지 내용·참고 기상 표시는 유지).
- rankScore(가점 포함, 예: 92+16=108)에는 0~100 상한을 적용하지 않음. 점수식·가점 16·정원 4/3/1/2·P0 관문 무변경.
- Python validator: `scoreEligible` bool, `missingScoreFields` list 강제(생성기·점수식 무변경).

### 테스트
reports-api 178/178 · 주간 추천 136/136 · weather py 50/50 · tide 21 pass/1 skip · weather-proxy 36/36 · midnight 13/13 외 프런트 스위트 통과. Chromium 필요 `test_notice_close_hit` 7건은 main 에서도 동일 실패(환경). 기대값 변경: M02 unknown-eligibility 2행, 공지 전용 fallback(승인된 계약 강화).

### 비교 (`docs/p1-s-implementation/results/`)
정상 입력(35141c0, 10/08 22:40): 후보 176→176, 상위 10곳 동일. 합성 null 점수: 기존 0점 후보 11곳(상위 10에 포함) → 수정 후 0.

### 미검증 / 범위 밖
로컬 합성 API 모바일·PC E2E 미실시(추천 패널 로드·렌더만 확인). S1-P 공개 정책 전환은 미포함.

롤백: PR 미병합 시 브랜치 삭제. 병합 후에는 `git revert` (S1-R·S2-A 커밋은 분리되어 있음).
