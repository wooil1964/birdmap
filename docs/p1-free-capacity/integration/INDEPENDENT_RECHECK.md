# 독립 통합 회귀 — Workers Free 최소 보완

검증 입력 제품 SHA: `9b4555a0be19250a301fec47e5f8fe76cc1e87a5`. 이전 제품: `c025d75f964ab36f6f2eae541a99461f6de59b70`. 검증자는 제품 코드를 수정하지 않았고, Git archive와 별도 merge-tree에서 시험했다. 운영 API 호출·배포·운영 D1 쓰기·실사용자 자료 복제는 0이다.

## 실제 실행 결과

| 범위 | 통과 | 실패 | skip | 종료 코드 |
|---|---:|---:|---:|---:|
| 프런트 자동 회귀 | 359 | 0 | 0 | 0 |
| reports-api 자동 회귀 | 251 | 0 | 0 | 0 |
| weather-proxy | 36 | 0 | 0 | 0 |
| Python 기상 | 56 | 0 | 0 | 0 |
| Python 조석 | 21 | 0 | 1 | 0 |
| 공유 페이지 | 11 | 0 | 0 | 0 |
| 자동 합계 | **734** | **0** | **1** | 각 suite 0 |
| 기존 independent fresh HEAD/5초 상한 | 20 | 0 | 0 | 0 |
| S2 계약 행렬 / 특별 분기 / 팝업 | 182 / 21 / 12 | 0 | 0 | 0 |

S1-R 보호종 표현 171개에 누락 0, 일반종 17개 오탐 0. 승인 관리자·정상 신규 현장소식·known-ID 본인 삭제 경로도 기존 독립 보호계약 시험에서 통과했다. 위 자동 합계에 별도 계약 시험을 더해 고유 시험 개수처럼 보고하지 않는다. Chrome 부하 cohort와 별도 Chrome241 감사는 다른 검증 원장에 기록한다.

고정 시계 2026-10-08 22:40 KST의 탐조지 190개·정상 후보 176개, 제보 ON/OFF 전수 후보 signature와 상위10의 ID·순서·원점수·표시점수·rank·가점·날짜·시각·유형이 PR13 및 c025 기준과 같다. unsafe 후보 0. 추천/P0/S2 75함수는 PR13 source와 동일하고, 최신 main의 정적 길찾기 4함수도 동일하다. 모든 siteData와 좌표가 바뀌지 않았다. 현재 기상에 후보176개라고 주장하는 결과가 아니다.

- ON: `47c90497b6995318031b10e85c0750f77f5898c5ce1a75bfb951b820eb5e9afb`
- OFF: `ecd3d28b8c3d5f23cfbf00bcc305c2171bff01ea4f81027dc1407ffe1a84a758`
- siteData hash: `fd50e35a1f1ad828f425918e28bb1632c9acb2e9206806263cd64d18a8513fd8`
- ID/좌표 hash: `21c25db5b1aa0de03a2f037f720715696c3a2c14f016a00e0c0c4acb18e9df89`

## 최신 main 결합과 validator를 구분한 판정

최신 원격 main은 `07680616b62771bc0102c8c886e149345c25347e`. 제품에 포함된 main58과 실제 차이는 자동 `tide_health.json`, `tide_today.json`, `weather_today.json`, `weather_week.json` 네 파일이다. 이전 하네스의 “기상 두 파일만 다름” 전제가 실패한 원형 로그를 보존했다. 실제 main 변경 파일을 모두 명시하고 결합을 다시 실행했다. 제품 assertion을 삭제하거나 날짜 검사를 완화하지 않았다.

임시 merge-tree `34c89f05b83d275133bf0f3ffbac9bd89e83163c`: 충돌0. 서버·index·추천 데이터는 검증 제품과 byte 동일하고, 자동 JSON6종은 최신 main 원본과 byte 동일하다. 실제 main/ref/index는 변경하지 않았다. merge-tree는 임시 Git tree object만 생성했다.

**기존 현재 날짜 문제는 별도 미해결 원장에 유지한다.** 9b/c025의 고정 archive가 포함한 today는 10/12 자료이고 실제10/13 KST의 unchanged validator는 `Batch date mismatch`로 exit1이다. 따라서 전체 integrated driver의 exit1은 이 별도 시간 검증 실패를 반영한다. 자동734 suite는 모두 exit0이며, validator 실패를 성공으로 집계하지 않았다.

반면 latest-main07680616은 실제 자동 생성된 `2026-10-13 07:34 KST` 자료이다. 정확히 그 새 JSON으로 현재10/13 시계 today validator exit0, weekly validator exit0, 자정·자동갱신 관련48/48이다. 이는 다른 입력의 정상 생성 배치 근거이며 과거10/12 validator 실패가 수정됐다고 보고하지 않는다. JSON·생성일·validator 코드 변경 또는 운영 갱신 dispatch는 없었다. 향후 실시간 신선도·자동 배치 지속 성공은 운영 승인 이전 별도 확인 대상이다.

## 새 SQL 및 프런트 보안 계약 소스 감사

SQL의 WeakMap은 DB binding에 대한 trigger name→sqlite_schema rowid **물리 위치 힌트만** 저장한다. epoch/revision/공개 허가나 guard의 성공 판정을 저장하지 않는다. 모든 warm read는 first-primary session의 같은 snapshot에서 필수22개 trigger의 rowid/name/type를 다시 읽는다. DROP 또는 rowid 이동이면 cold 전체 schema 검사를 수행하고, 자료 endpoint에서는 authority와 모든 payload SQL batch를 전부 재실행한다. 이전 payload를 후속 guard 검사로 적격 승격하지 않는다. CAS·원자 migration·삭제terminal·canonical dual-write·field B6·shared S1-R 코드는 c025와 byte 동일하다. 실제 workerd의 trigger 경합·rows_read는 별도 서버 원장에서 검증해야 하며 본 문서의 소스 감사를 실측 행 비용으로 혼동하지 않는다.

클라이언트는 동일 path와 generation의 **진행 중** data 요청만 합친다. 완료 시 pending entry를 제거하여 응답·positive permission cache가 남지 않는다. 모든 새 payload는 기존 nonce/preflight/atomic projection/fresh postflight 계약을 유지한다. 강제 fresh route/GPS 및 postflight는 action/payload보다 먼저 시작된 in-flight HEAD를 fresh로 사용하지 않는다(기존20개 시험 통과). initial pageshow는 이미 진행 중인 bootstrap을 불필요하게 폐기하지 않으며 BFCache/visibility 복원은 종전처럼 destructive invalidation을 한다.

poll 4,750ms는 공칭 request-start lease 경계 이전 250ms에 갱신을 시작하는 변경이다. request-start+5,000ms 상한·timeout·unknown fail-closed·좌표/팝업/길찾기/GPS/동의 UI 폐쇄는 유지된다. RTT나 timer 지연이 margin을 초과하면 그대로 만료·폐쇄·자료 재조회하며, 가용성을 위해 권한 상한을 연장하지 않는다. 서버가 검증한 HEAD의 KST day가 바뀌면 기존 destructive invalidation과 재조회가 발생하므로 같은 revision만으로 지난 월간 기여자·최근 제보 query window를 재사용하지 않는다. field TTL은 기존 fresh HEAD clock/fieldIsActive가 처리한다. 새 DTO seal/persistent cache는 구현하지 않았다.

20명×8시간에 기존5초 polling만으로도 최소115,200 Worker 요청이 발생한다. 4,750ms에서는 이론 HEAD 요청이 약121,264회가 되므로 이 최소 변경만으로 해당 Free 조건을 PASS로 만들 수 없다. 계정 합산 수요는 실제 Chrome/SQL 새 비용 원장의 재측정으로 판단해야 하며, 소스 리뷰와 짧은 회귀 성공은 운영 용량 승인이 아니다.

## 기존 활성 Worker의 민감 위치 잔여 위험

과거 읽기 전용 활성 소스 대조 원장은 public494b97와 admin0134cd9a의 모듈이 Git41650e43 소스와 byte 동일했음을 증명했다. 이 문서에서는 운영 소스를 새로 조회하지 않고 그 저장 근거를 검토했다. 당시 활성 public에는 S1-R 수량 표현 parser·publication epoch/revision·first-primary·field CAS가 없었고 public max-age60 응답이 있었다. 합성 소스 재현에서 승인되는 신규 보호 표현11개 중10개, 기존 저장 보호 표현12개 중11개를 보호 판정에서 놓쳤다. 기존 flagfalse 저장 보호행을 읽을 때 B6의 null 좌표 폐쇄도 없다.

이것은 해당 입력과 과거 응답이 있으면 정확 위치·길찾기가 남을 수 있는 **재현된 코드 위험**이다. 실제 운영에 그런 private 자료가 존재하거나 누군가 열람했다는 증거가 없고, 이 검증은 실사용자 좌표를 조회·복제하지 않았다. 따라서 사고나 실제 유출을 단정하지 않는다. 현재 활성 소스를 안전 rollback으로 승인할 수 없으며, 이미 전달된 좌표를 원격으로 지울 수 있다고 주장하지 않는다. 운영 보류 중의 잔여 위험과 새 PR의 부하 최적화 승인을 구분해야 한다. 기존 S1-P 승인 후 전면 공개 정책은 별도 과제이며 이번 최소 보완이 구현한 것으로 보고하지 않는다.

## 명령과 재개 자료

- `node run_capacity_regression.mjs 9b4555a0be19250a301fec47e5f8fe76cc1e87a5 58e1a222845680d5217677242ac1df5ff9bf665b` → driver exit1, 자동734/0/1 및 별도 old-today validator exit1.
- `node --test --test-reporter=tap <pinned archive>/docs/p1-publication-final-audit/server/head-freshness.test.mjs` →20/20, exit0.
- `node function_noninterference.mjs 9b4555a0be19250a301fec47e5f8fe76cc1e87a5 07680616b62771bc0102c8c886e149345c25347e` →75+4 source 동일, exit0.
- `node latest_main_capacity.mjs` →임시 결합/6JSON/현재 새배치 validator/48경계 시험, exit0.

모든 정확한 argv·cwd·시각·종료코드는 per-suite JSON과 log에 저장되어 있다. root 통합 보고에는 본 결과를 새 Chrome10/20 부하·actual workerd D1·계정 한도 모형과 결합해야 한다. 이 독립 회귀는 운영 승인을 요청하지 않으며 main/Worker/Pages/D1/요금제 변경을 금지한 사용자 지시를 유지한다.