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
## 최종 제품 5c03d3b 재검증 추가

최종 제품 `5c03d3b125260c883e9133102ac64129f11ca9da`에서는 stale schema locator 복구를 **새 first-primary session**에서 수행하고, data endpoint는 새 session에서 readPlan도 다시 만들어 모든 authority+payload batch를 재실행한다. 같은 session의 첫 쿼리 이후 읽기를 primary라고 오인하지 않는 최소 보완이다. 앞서9b 시험과 실패 원장은 그대로 보존했다.

정확한 Git diff는 publication.js와 API 시험의 추가2건, before/after 로그 두 파일뿐이다. 최종 Git archive에서 API253/253을 독립 재실행해 exit0. 영향 없는 비API483개는 앞서9b 독립 통과 원장과 source blob 동일성으로 유지된다. 따라서 최종 기준은 **736 pass / 0 fail / 1 skip**이며, 736 전부를 새로 재실행했다고 주장하지 않는다. 추천/P0/S2 75함수·정적길찾기4함수는 최종SHA에서도 byte 동일이다. index가9b와 동일하므로9b의 fixed190/176 결과·fresh HEAD20·calendar 소스 검토를 유지한다.

최종 SHA와 latest main076 임시 결합도 exit0·충돌0이며 자동6JSON main byte 보존, 서버/index와190곳 자료 유지, 현재10/13 새 today/week validator exit0, 자정·자동갱신48/48을 재확인했다. 최종 merge-tree와 정확한 receipt는 `latest-main-07680616-5c03d3b/summary.json`에 있다. 이 새 배치 성공은 별도 old10/12 archive의 현재날짜 validator 실패를 해결하거나 삭제한 결과가 아니다.

최종 first-primary locator 복구 변경은 permission cache를 추가하지 않고 물리 hint 실패 시 전체 authority/projection을 새 primary에서 다시 검증한다. migration·CAS·삭제terminal·field B6 source는 c025와 계속 동일이다. 운영·요금제 변경은 0이다. 운영 승인 전 Free 용량과 나머지 운영 관문을 별도 판정해야 한다.

## 최종 프런트 부분 복구 보완 3d42910c

실제 Chrome20명 cohort에서 revision 변경을 field 정기 GET이 먼저 확인하면 전체 목록은 폐기되지만 field 한 종류만 다시 표시되고 approved가 복구되지 않는 결함이 발견됐다. 이 실패의 실제 Chrome 원장은 별도 browser/client 원장에 보존한다. 단일 endpoint의 적격 복구를 모든4목록의 복구로 오인한 가용성 결함이며, 미검증 정확좌표를 되살리는 결함으로 단정하지 않는다.

새 제품 SHA `3d42910cb0cea8a5e79c2d57d068c91b86b18332`는 index의 needsRefresh 불변 조건만 추가한다. 초기 및 모든 destructive invalidation에서 flag=true, 모든4 core loader가 true로 완료하고 generation이 같고 허가가 아직 유효할 때에만 false가 된다. 개별 field 응답이 ready를 켜더라도 다음 recheck가 남은 전체 복구를 요청한다. 동의·cache·좌표·원점수·추천 함수·API·migration 변경은 없다.

최종 Git archive 프런트359/359 exit0, 기존 fresh HEAD20/20 exit0, 고정190/176 ON/OFF 전수 signature/top10 불변이다. 이전5c의 API253 및9b의 unchanged proxy/Python/tide/share 결과와 결합한 영향 검증은 **736 pass/0 fail/1 skip**이다. 736 전부를 새로 실행했다는 의미가 아니다.

독립 actual-function flag 시험 **14/14**는 각 core false, null, undefined, 숫자true 흉내, rejection, generation 변경, lease 만료, 진행중 fullrefresh 공유 및 완료 이후 새요청을 검사했다. 오직 모든4true/same-generation/allowed일 때 flag가 clear된다. ready partial 복구에는4목록 재조회가 발생하고 complete ready에는 불필요 재조회가 없다. 실제 Chrome before/after는 별도 browser 원장과 구분하며 본14조건의 loader/permission scheduling은 VM stub이다. 실제 fresh nonce/postflight/5초 상한은 기존20개 제품 함수 회귀로 추가 확인했다.

최신 main076과 최종3d 임시 merge-tree 결합도 충돌0·자동6JSON 원본 보존·현재 새 배치 validator0/0·자정/갱신48/48이다. 정확 tree와 receipt는 `latest-main-07680616-3d42910c/summary.json`. 추천/P0/S2 75함수와 정적 길찾기4함수도 최종3d source에서 불변이다. 기존10/12 archive의 현재 날짜 validator 실패는 미해결 원장에 그대로 남는다. 운영 변경0.
