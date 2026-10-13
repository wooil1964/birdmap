# 새 primary fallback 독립 재검증 — 5c03d3b

정확한 검증 SHA: 5c03d3b125260c883e9133102ac64129f11ca9da. 이 커밋은 F87_SERVER_AUDIT.md의 primary fallback 요구를 보완했다. 제품 코드는 수정하지 않았다.

실제 workerd Worker-isolate 프로브 **15/15 통과**:

- 정상 상태 첫 권한 조회103행, 이후23행.
- concurrency1/10/20 각각200회, 모두23행 읽기·쓰기0·정상 응답.
- 일반 payload 비용은 f87과 동일(approved144/pending24/recent144/field60/history205/contributors147).
- successful HEAD locator repair는 native session621에서 warm 검증한 후 **새 session622**에서 cold 검증했다. 두 세션 모두 first-primary로 생성됐다.
- successful payload locator repair는 session623에서 state+payload를 읽고, **새 session624**에서 cold state+payload 전체를 다시 읽었다. 모든 prepared statement의 session ID와 batch session ID가 일치했다. 이전 batch 데이터의 혼용이 없다.
- 복구 재현을 위해 unrelated trigger2개를 추가하므로 이후 cold catalog cost104/105는 정상 fixture103과 구분했다. warm 비용은23행 그대로다.

변경 전 f87에 같은 실제 Worker primary-session 시험을 적용하면 HEAD repair는 first-primary session1개만 사용하여 **11 pass /1 fail, exit1**이다. 실패 후 뒤의 payload/missing-guard 시험은 이 실행에서 미실행이었다. f87-native-primary-contract-failure/WORKER_ISOLATE_MANIFEST.json에 입력 SHA·실제 trace·실패 assertion을 보존했다. 새 SHA에서는 두 경로 모두 통과했다.

원본72건 publication security suite를 정확한5c archive와 같은 SHA fixture로 독립 실행해 **72 pass /0 fail /0 skip, exit0**을 확인했다. root의 성공 보고를 복사하지 않았다.

증거:

- 5c03-worker-native-primary/WORKER_ISOLATE_MANIFEST.json
- 5c03-independent-publication72.log
- f87-native-primary-contract-failure/WORKER_ISOLATE_MANIFEST.json
- worker_isolate_cost_probe.mjs, worker_isolate_wrapper.mjs

이 검증은 원격 read-replica lag 실험이 아니다. 로컬에 replica가 없지만, 코드가 모든 복구 읽기에 새 first-primary를 생성한다는 실제 native session 경로는 확인했다. 기존 슬롯 힌트는 검증 성공 증거가 아니며, 매 query의22개 실제 guard 확인을 유지한다. 상한·nonce·postflight·CAS·terminal·B6 변경 없음.

독립 용량 계산기는 independent_final_budget.py에 준비했다. 최종 성공 Chrome raw+normalized 결과를 받기 전에는 실행하지 않는다. 초기/steady/outside 분리와 raw 요청 수·실제 노출시간을 독립 재계산하며, 기존 계정 rolling24h(Worker1242, D1 read62111/write665)를 추가한다.10분 timer는6회×3목록=18 payload/h이며, fresh HEAD sharing 비용을0으로 간주하지 않는다. warm/cold 및 느린 응답에 따른 추가 폐쇄·복구 민감도는 분리한다.

용량 시나리오는 각 코호트 이용시간이 **같은 UTC 일일 quota 구간에 들어간다는 조건**이다. UTC00:00/KST09:00 reset을 걸치면 요청이 둘 이상의 quota day에 분산될 수 있다.20명×8시간의5초 조회 최소115200회는 전체 요청 수의 하한이며, 이를 한 quota day에 넣으면 Free100000을 초과한다. 현재4750ms cadence는 nominal121264회다. 어떤 모델도 현재 날짜 기상 validator 실패를 통과로 바꾸지 않는다.

