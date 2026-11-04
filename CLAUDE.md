# CLAUDE.md

Claude Code가 이 저장소에서 분석·독립 리뷰·오류 추적 및 승인된 수정을 할 때 참고하는 안내입니다.

> [AI_WORK_RULES.md](AI_WORK_RULES.md)가 최우선입니다. 작업 시작 전 전문을 읽고 준수합니다.
> 공통 작업 절차·영역별 최소 검사는 [AGENTS.md](AGENTS.md)를 따르며, 충돌 시 AI_WORK_RULES.md가 우선합니다.

## 프로젝트와 문서 탐색

들뫼생태연구회 전국 탐조지도는 GitHub Pages의 단일 페이지 지도 앱입니다. 서비스 코드 기준은 main의 `index.html`이며 내부 `siteData`가 런타임 데이터입니다.

| 경로 | 용도 |
|---|---|
| [AI_WORK_RULES.md](AI_WORK_RULES.md) | 역할·데이터·좌표·ID·안전·검증·보고의 원본 규칙 |
| [HANDOVER.md](HANDOVER.md) | 현재 상태·진행 중 작업·주의사항 |
| [docs/decisions/active-decisions.md](docs/decisions/active-decisions.md) | 현재 유효한 결정과 근거 |
| `data/` | 오프라인 엑셀 DB. 기준 파일은 사용자가 지정 |
| `weather-proxy/` | 실시간 기상 Worker. `src/sites.js`는 runtime과 대조 필요 |
| `reports-api/` | 제보·승인·공개 보호 Worker와 D1 관련 코드 |
| `.github/workflows/` | 기상·조석 자동 갱신 및 PR CI |
| `weather_today.json`, `weather_week.json`, `tide_today.json`, `tide_month.json` | 자동 생성 데이터 |
| `notices.json` | 탐조기획 공지 |
| `tide_station_mapping.json`, `weather_rules.json` | 조석 매핑·탐조 적합도 규칙 |
| `index_backup_before_v21.html`, `index_v23.html` | 과거 백업. 수정 금지 |

## Claude Code 작업 안내

- 독립 리뷰에서는 실제 diff·근거·검증 결과를 대조하고 미확인 사항을 분리합니다. 리뷰가 곧 수정·병합·배포 승인은 아닙니다.
- 공통 안전 규칙을 이 파일에 복제하지 않습니다. 좌표·종·ID·자동 생성 파일·비밀정보·동시 수정은 AI_WORK_RULES.md 원문을 확인합니다.
- 완료 보고는 AI_WORK_RULES.md 12항을 따릅니다. 완료 상세는 PR 또는 인수인계 아카이브에 남기고 HANDOVER.md에는 현재 상태만 유지합니다.
