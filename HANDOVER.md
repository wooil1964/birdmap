# HANDOVER.md — AI 작업 인수인계 문서

이 문서는 여러 AI(ChatGPT, Codex, Claude Code, Gemini)가 이 저장소에서 순차적으로 작업할 때
현재 상태와 최근 완료 작업을 공유하기 위한 인수인계 문서입니다.

> 작업 규칙은 `AI_WORK_RULES.md`가 최우선이며, 이 문서와 충돌하면 `AI_WORK_RULES.md`를 따릅니다.

## 현재 서비스 기준

- 실제 서비스 파일: main 브랜치의 `index.html` (GitHub Pages 배포)
- 실시간 기상: Cloudflare Worker (`weather-proxy/`) 연동
- 기상·조석 데이터: GitHub Actions가 `weather_today.json`, `tide_today.json`, `tide_month.json` 자동 갱신
- 오프라인 원본 DB: `data/` 폴더의 엑셀 파일 (기준 엑셀은 사용자가 지정)

## 최근 완료 작업

- 기상 표시 개선 및 Worker 배포 완료
- 한 달 조석 데이터·모달 기능 완료
- P1 품질 개선 완료
- 모바일 상단 UI 정리 완료
- 186개 엑셀 정제본 생성, 신규 30개는 지도 반영 보류
- 강수 우선 탐조 해석 수정(PR #2) 및 강수 시 별점·점수 보정(PR #3) 완료
- 수도권 하천계 6곳(ID 157·158·159·160·162·163) 1차 지도 반영 — 권역 수 156→162, ID 161은 보류 유지

## 진행 중 / 보류 사항

- 신규 탐조지 후보 중 24개(ID 161, 164~186): 엑셀 정제본에는 포함되었으나 지도 반영은 보류 상태.
  반영 시 `AI_WORK_RULES.md` 5항(좌표 검증)과 7항(기상 이중 관리)을 반드시 준수할 것.
- 반영된 6곳의 eBird Hotspot ID는 미확정으로 공백 유지 중(후보 ID는 보완표 참조). 공식 확인 후 입력할 것.
- `.github/scripts/build_tide_station_mapping.py`의 siteData 개수 검증은 사용자 승인 하에
  162로 갱신 완료(2026-07-08). 이후 권역 수 변경 시 이 검증값과
  `update_weather.py`의 검증값을 함께 갱신할 것.

## 다음 작업자를 위한 주의사항

1. 작업 시작 전 `git status`와 최신 main 상태를 확인한다.
2. `AI_WORK_RULES.md` 전문을 읽고 준수한다.
3. `index.html`의 `siteData`와 `weather-proxy/src/sites.js`는 수동 이중 관리 상태이므로
   탐조지·좌표 변경 시 양쪽을 모두 확인한다.
4. 자동 생성 파일(`weather_today.json`, `tide_today.json`, `notices.json` 등)은
   직접 수정해도 다음 자동 실행에서 사라질 수 있다.
5. 작업 완료 후 `AI_WORK_RULES.md` 12항 형식으로 보고하고, 이 문서의
   "최근 완료 작업"을 갱신한다.
