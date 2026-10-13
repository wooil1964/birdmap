# f87b9a8 서버 독립 감사 및 실제 Worker 측정

검증 제품 SHA: f87b9a8994d8b4a07896714cbdda50d1c3dec238. 비교 기준: c025d75f964ab36f6f2eae541a99461f6de59b70. 제품 소스는 각 SHA를 git archive로 고정했다. 이 문서는 아직 전체 제품의 배포 승인 문서가 아니다. client 변경과 최종 통합 SHA는 부모 작업에서 별도로 검증한다.

## 실제 측정

기존 운영 DDL 48개 및 ledger 구조를 복제한 로컬 Miniflare/workerd에 **합성 73개 제보(승인60/거절13)와 현장소식3개**만 넣었다. 실제 이용자 행 복사0, 운영 API/D1 요청0, 제품 수정0, 배포0이다.

권한 SQL 비용은 preset23에 맞춘 assertion이 아니라, 실제 Worker fetch의 D1 result metadata를 기록한 관찰값이다. 실제 Worker 환경의 native env.REPORTS_DB 객체를 WeakMap으로 식별했다. instrumentation wrapper는 같은 native 객체에만 동일한 wrapper를 재사용하므로, 원본 binding이 달라지면 새 cache key가 된다. 관찰한 한 isolate의 모든 요청에서 native ID는1개였고, 새 Worker isolate에서는 다시 냉시작이었다. 운영의 isolate churn이나 여러 POP의 동일성은 검증하지 않았다.

| 실제 경로 | c025 rows_read | f87 warm rows_read | 쓰기 |
|---|---:|---:|---:|
| 권한 조회 | 103 | 23 | 0 |
| approved | 224 | 144 | 0 |
| pending | 104 | 24 | 0 |
| recent-sites | 224 | 144 | 0 |
| field-updates | 140 | 60 | 0 |
| history | 285 | 205 | 0 |
| contributors/monthly | 227 | 147 | 0 |

- 냉시작 첫 권한 조회는 두 버전 모두103행이다. f87의 둘째부터23행이며 primary session 호출을 확인했다.
- 각 버전에서 concurrency1/10/20 각각200회, 정상 권한 조회600회가 실제 Worker fetch isolate에서 통과했다. c025는 모두103행, f87은 모두23행. 정상 응답 오류0, SQL 쓰기0.
- 동일 isolate의 냉시작10명 burst: 관찰상103행1회 +23행9회 =310행.20명:103행1회 +23행19회 =540행. 이는 해당 실행의 관찰값이다. 여러 isolate가 각각 냉시작할 수 있으므로, 언제나 냉시작1회라고 예산을 확정하면 안 된다.
- 필수 trigger DROP 뒤 f87은 warm+full-rescan 총125행을 읽고503으로 폐쇄했다. 복원 후 냉시작103행, 다음23행으로 회복했다.
- 사용한 nodejs_compat/AsyncLocalStorage는 지역 측정 wrapper에만 추가했다. 제품 소스는 수정하지 않았다. 운영 CPU10ms 적격성·edge RTT의 증거로 이 로컬 측정을 사용하면 안 된다.
- paired 기준/수정 각13/13 관찰·보안 검사, 추가 cold burst10/20 각각13/13. 같은 실행의 반복 수치를 합산해 새로운 제품 회귀 개수로 주장하지 않는다.
- 원본 f87 publication security suite는 독립70/70 통과했다.

## primary-latest 보완 요청 — 검증 중 발견

f87 publication.js:63 및110은 locator fallback에서 **같은 first-primary session**을 재사용한다. Cloudflare 공식 계약은 first-primary의 첫 query만 primary에서 처리하도록 보장한다. 이후 query는 sequentially consistent replica에서 처리될 수 있다. 로컬 warm+full-rescan request 기록도 session 생성1회/SQL2회다. 이것은 stale 좌표 사고의 증거가 아니라 **사용자의 모든 최종 권한 조회는 primary 최신 자료를 써야 한다는 계약을 입증하지 못한 코드 경로**다.

최소 요구사항:

1. publicationAnchor의 cold fallback에는 새 primary(binding) session을 만든다.
2. handlePublicationRead의 cold fallback에는 새 primary(binding) 및 그 session에서 만든 전체 readPlan/state+payload batch를 사용한다.
3. 복구된 payload를 이전 batch와 섞지 않는다.
4. fallback에서 새 first-primary session이 실제 생성됐다는 시험을 추가한다.
5. 수정 SHA에서 이 실제 Worker probe와70건 관련 회귀를 다시 실행한다.

같은 session의 sequential consistency가 앞선 primary보다 오래된 DB로 돌아가지 않는다는 점은 별도로 인정한다. 하지만 새 primary 읽기 대신 그보다 약한 계약을 적용했다고 숨기지 않는다. 현재 로컬에는 원격 replica가 없으며 served_by_primary 메타데이터도 없어 실제 replica lag를 재현하지 않았다. [Cloudflare read replication 설명](https://developers.cloudflare.com/d1/best-practices/read-replication/)의 first-primary/monotonic 읽기 계약을 근거로 판단했다.

## 안전성 검토

매 warm state query가 모든22개 type/name/rowid를 직접 확인하므로 positive guard proof를 캐시하지 않는다. cold discovery 역시 singleton 상태와 같은 SELECT다. 권한 metadata를 cache에서 반환하지 않고 nonce를 현재 요청에 붙이며, CAS/revision/terminal/migration/B6는 변경되지 않았다. stale locator recovery에서 전체 batch를 다시 실행하는 구조가 포함돼 있고, 그 사이 제보 revision이 변하면409를 반환하는 시험도 통과했다.

동일 이름의 악의적으로 교체한 trigger 본문까지 현재 name-only 계약이 입증하지는 않는다. 기존 카탈로그 이름-count 방식의 경계를 유지한 것이며, 이 변경으로 그 문제를 해결했다고 주장하지 않는다. 배포 시 검증된 DDL fingerprint 대조와 trusted migration 통제는 유지한다.

## 실패 및 미실행 기록

- 기존 publication_local_load.mjs를 새 SHA에 그대로 실행:0pass/1fail, undefined !==22. 새 냉시작 result는 guardLocators 배열이며 옛 harness는 숫자 guards를 직접 요구했다. 원본 실패는 f87-prior-harness/LOAD_MANIFEST.json에 보존했다.
- 비용/예측 assertion을23으로 바꾸는 최초 적응 명령은 자동 승인 검토가 “성공 조작 위험”으로 거부했으며 **실행되지 않았다**. 우회하지 않았다. 대신 위 새 Worker-isolate 관찰 프로브로 비용을 먼저 측정했다. 기존 실패를 성공으로 바꾸지 않았다.
- 첫 독립70 시험은 reports-api만 archive하여 합성 pre-publication-schema 및 canonical fixture가 없어 ENOENT로 실행 실패했다. 원본 로그를 보존하고 **같은 f87 SHA의 fixture3개**를 archive로 더한 뒤 원본 시험을 그대로 다시 실행해70/70을 확인했다.
- 현재 날짜 기상 validator, 실제 GPS/카카오/티맵 native 앱, 운영 장기 quota와 CPU/POP, 운영 권한 서비스의 실제 활성 상태는 이 서버 측정으로 통과하지 않는다.
- Workers Free의20명×8시간은5초 polling만으로115200회 최소 요청이므로, SQL 비용 절감만으로 계정 요청10만/일 문제를 해결하지 못한다. 더 낮은 D1 비용과 전체 Worker 요청 한계를 분리한다.

## 재현 자료

- worker_isolate_cost_probe.mjs, worker_isolate_wrapper.mjs
- c025-worker-isolate-observation/WORKER_ISOLATE_MANIFEST.json
- f87-worker-isolate-observation-v2/WORKER_ISOLATE_MANIFEST.json
- f87-worker-cold-burst-10/WORKER_ISOLATE_MANIFEST.json
- f87-worker-cold-burst-20/WORKER_ISOLATE_MANIFEST.json
- f87-independent-publication70-with-fixtures.log
- f87-independent-publication70.log (initial ENOENT)
- f87-prior-harness/LOAD_MANIFEST.json (old result-contract failure)

호출 형식:

~~~powershell
node docs/p1-free-capacity/server/worker_isolate_cost_probe.mjs <repo> <new-output-dir> <cached-miniflare-esbuild-node_modules> <exact-SHA> [cold-burst10-or20]
~~~

주요 runtime: Node24.18.0, Miniflare5.20261006.1-alpha, source compatibility_date2026-07-03. module/source/bundle hashes와 각 요청의 SQL rows_read/rows_written/first-primary session 횟수가 각 manifest에 있다.

