# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

> **중요: 이 문서와 `AI_WORK_RULES.md`가 충돌하면 항상 `AI_WORK_RULES.md`가 우선합니다.**
> 작업 시작 전 반드시 `AI_WORK_RULES.md` 전문을 읽고 준수하세요.

## 프로젝트 개요

들뫼생태연구회 **전국 탐조지도** 프로젝트입니다.
GitHub Pages로 서비스되는 단일 페이지 지도 앱이며, 실제 서비스 기준은 **main 브랜치의 `index.html`** 입니다.

## 저장소 구조

| 경로 | 설명 |
|------|------|
| `index.html` | 실제 서비스 핵심 파일(약 8,700줄 이상). 내부 `siteData`가 런타임 탐조지 데이터 |
| `AI_WORK_RULES.md` | AI 공동 작업 규칙(최우선 문서) |
| `HANDOVER.md` | AI 간 작업 인수인계 문서 |
| `data/` | 오프라인 원본 엑셀 DB (기준 엑셀은 사용자가 지정) |
| `weather-proxy/` | Cloudflare Worker (실시간 기상 프록시) |
| `weather-proxy/src/sites.js` | Worker용 탐조지 좌표·id 목록 (`siteData`와 수동 이중 관리) |
| `.github/workflows/` | 기상·조석 자동 갱신 Actions (`update-weather.yml`, `update-tide.yml`, `update-tide-month.yml`) |
| `weather_today.json` | 자동 생성: 오늘 기상 데이터 |
| `tide_today.json` | 자동 생성: 오늘 조석 데이터 |
| `tide_month.json` | 자동 생성: 한 달 조석 데이터 |
| `notices.json` | 탐조기획 공지 파일 |
| `tide_station_mapping.json` | 탐조지-조석 관측소 매핑 |
| `weather_rules.json` | 탐조 적합도 판정 규칙 |
| `index_backup_before_v21.html`, `index_v23.html` | 과거 버전 백업(수정 금지) |

## 핵심 작업 규칙 요약

자세한 내용은 `AI_WORK_RULES.md` 참조. 아래는 요약입니다.

1. **최소 수정**: 요청 범위만 수정하고, 요청받지 않은 리팩터링·기능 삭제·UI 변경을 하지 않는다.
2. **작업 전**: `git status` 확인 → 최신 main 확인 → `AI_WORK_RULES.md` 준수.
3. **한 번에 하나의 AI만 수정**: 이전 AI의 commit/push 완료 후 작업한다.
4. **자동 생성 파일 주의**: `weather_today.json`, `tide_today.json`, `notices.json` 등은 Actions가 덮어쓸 수 있으므로 직접 수정 전 생성 구조를 확인한다.
5. **이중 관리 주의**: `index.html`의 `siteData`와 `weather-proxy/src/sites.js`는 id·좌표·pelagic 필드가 일치해야 한다. 탐조지 변경 시 양쪽 모두 확인.
6. **좌표 검증**: 좌표 수정·추가 시 기준 엑셀, `siteData`, 카카오맵, Windy, `sites.js`, 조석 매핑을 대조하고, 임의 보정하지 않는다. 불일치는 수정 전 보고.
7. **siteData 수정 시**: 수정 전후 탐조지 개체 수와 id 중복 여부를 검증한다.
8. **보안**: API 키·비밀정보를 코드, 로그, 보고서에 노출하지 않는다.
9. **보고**: 테스트하지 않은 상태에서 정상 완료라고 보고하지 않는다. 작업 완료 후 `AI_WORK_RULES.md` 12항의 형식으로 보고한다.

## 작업 완료 보고 형식 (AI_WORK_RULES.md 12항)

1. 작업 목적
2. 변경 파일
3. 변경 내용
4. 테스트 결과
5. 좌표 검증 결과(관련 작업일 경우)
6. 기존 기능 영향 여부
7. 발견된 미해결 문제
8. Commit ID와 Push 여부
