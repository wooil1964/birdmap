# 복구 설계 검증 비교 자료 (2026-11-11, Claude Code)

보고서: `../2026-11-11-claude-recovery-design-review.md`

- `proto.diff`: `b6163ef` `assets/birdmap-basemap.js` 대비 R1 시제품. 검토용이다. 제품에 적용하지 않았다.
- `naive-vs-proto.diff`: 반대 사례(naive) 변형과 시제품의 차이
- `proto2.diff`: `b6163ef` 대비 R1+ 시제품
  - 칸당 최대 4회(60/120/240/480 s)
  - 레이어당 60 s에 1라운드
- `fallback-vs-proto.diff`: Codex M1 4.4 규칙(재실패 → `fail()`)만 근사한 변형. M1 전체 구현이 아니다
- `results-codex-comparison.json`: 비교 결과(T12a·b, R1+ 회귀). 모든 대기를 1/20로 줄여 돌렸다
- `run.mjs`: 오프라인 구동기. 모든 비로컬 요청을 CDP Fetch로 가로채 합성 응답한다.
- `harness-index.html`: 하네스 페이지
- `results-summary.json`: 시나리오별 요청 수·상태 요약
- `results-full.json`: 요청 시각 원본. 공개 Worker 경로 형식과 합성 좌표만 있다.

재실행 방법: 빈 폴더에 다음을 둔다.
- `h/` 폴더
  - `leaflet.js`·`leaflet.css`: Leaflet 1.9.3, SRI 일치 확인
  - `main.js`: `assets/birdmap-basemap.js`
  - `proto.js`: 여기에 `proto.diff`를 적용한 결과
  - `naive.js`·`fallback.js`: `proto.js`에 각 diff를 적용한 결과
  - `proto2.js`: `main.js`에 `proto2.diff`를 적용한 결과
  - `index.html`: `harness-index.html`의 이름을 바꾼 것
- 그 옆에 `run.mjs`

그다음 `node run.mjs`를 실행한다(Node 24, Chrome). 시제품의 `window.__birdmapPartialRetryMs` 재정의는 시험용이며 제품에 넣지 않는다.
