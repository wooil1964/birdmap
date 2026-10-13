# 숨김·만료 수정 후 서버 계약 표적 재검증

제품 입력 SHA: `38a616c10f9edd93f1ab389c62b7bcc9b3ca96fd`. 이전 대조 SHA: `26ad356418bbef61f8a583821ad63353cb85843a`. branch `codex/p1-publication-free-capacity`. 현행 index 제품소스로 시험했다. 서버업무코드·D1 schema 변경0. subagent commit/push/배포/운영API·D1 접근0.

## 결과

| 실행 | PASS | FAIL | SKIP | exit |
| --- | ---: | ---: | ---: | ---: |
| 기존108 원형 fixture 최초 재실행 |88|20|0|1|
| fixture 필수 의존성 보충 뒤 동일108 |108|0|0|0|
| 현재 제품 handler + 실제 로컬 native D1 CAS |10|0|0|0|

108분해는 publication security72 /hide-location5 /독립 서버 계약11 /head freshness20이다. 원형88/20 결과는 targeted-contract.log로 그대로 보존한다. 최종은 targeted-contract-final.log이며 두 실행을 같은 성공원장으로 덮지 않는다.

## 최초20FAIL 원인 및 보완 근거

기존 docs/p1-publication-final-audit/server/head-freshness.test.mjs는 실제 브라우저가 아닌 VM fixture다. 새 제품의 hidden 및 head-generation/anchor 확인에서 fixture가 document를 제공하지 않아 ReferenceError가 발생했다. 이 실패는20개 모두 동일 환경 의존성 결손이다. 최종 실행 전 root가 fixture만 다음처럼 보충했다.

- 두 VM context에 document.hidden=false.
- leaseState에 generation 및 anchor.
- 실제 publicationSame 함수를 VM에 함께 추출.
- 각 시험head에 원래 정상 context의 generation/anchor.

assertion·기대값·원래5000ms 상한·remaining+1 timer 검사는 변경하지 않았다. head-freshness-fixture.diff에 정확한 차이가 있고 finalize.mjs는 위 의존성 추가를 역변환하여 원형 SHA38 시험소스와 동일함을 검증한다. expectedValuesAndAssertionsUnchanged=true. 최초20FAIL을 제품의 성공으로 재분류하지 않고 최종 별도108PASS를 보고한다.

## 서버 실제 D1 재검증

앞선 load-audit 원장의 native_mutations.mjs를 이 새 폴더로 복사하고 exact-SHA assertion1곳만26→38로 바꿨다. 역변환 문자열 동일 검증으로 handler/SQL/assertion 불변을 증명했다. 이전 하네스·원장은 변경하지 않았다.

새 Miniflare workerd native D1(persistence=false)에 합성 데이터만 넣었다. 실제 product public/admin handler를 Node에서 실행하고 SQL은 native D1에 위임한다. 실제 Worker-isolate CPU/remote RTT 측정이 아니다. Access와 Turnstile은 합성 JWKS/검증응답을 사용한다.

- 같은제보 approve/reject2·10·20 경쟁: 승인/반려 승자200하나, 나머지409; 정본revision/publicrevision 및review/audit 일관성.
- hide 후 과거expected authority GET409, 새authority GET은 보호대략좌표.
- unpublish/hide/consent 경합은 단일CAS승자; 철회 뒤 정확좌표 목록 제외 및 정상재승인.
- 동시삭제2·10·20: terminal 유지, 삭제event1, 늦은status404 및 직접복구SQL 거부.
- confirm/delete 경합: 삭제409를 완료로 처리하지 않는다. freshHEAD 뒤 명시적retry200 및 terminal 확인.
- batch 강제실패는 source 상태와publicrevision 전부rollback.

NATIVE_MUTATIONS.json 및native-mutations.log에10PASS/0FAIL/0SKIP,exit0을 저장했다. 기존 cold/warm15×3 및1800부하는 재실행하지 않았다.

## 불변 증명과 한계

reports-api와weather-proxy의 tracked64개 파일 전체는26→38 Gitblob 동일이며현재 working source도같다. 공개/관리 Worker, 권한epoch/revision, CAS/terminal, D1 migration/schema·wrangler bindings 관련소스에변경이없다. SERVER_RECHECK_MANIFEST.json에64개의before/current Gitblob 및normalizedSHA256을기록했다. 이것은운영바인딩재조회결과가아닌로컬소스동일성증명이다.

190곳·Validator·Chrome 및 전체결과 불변은root가별도원장에서검증한다. 여기에서는 운영Replica·네트워크부하·계정quota·전체회귀·물리GPS·외부앱·CI를시험하지않았다. 표적 서버차단결함0은 운영승인을 뜻하지 않는다. WorkersFree 용량과 CI/rollback 등 기존운영차단은유지한다.

## 실제 실행

```powershell
node --test reports-api/test/publication-security.test.mjs reports-api/test/hide-location.test.mjs docs/p1-publication-final-audit/server/independent-contract.test.mjs docs/p1-publication-final-audit/server/head-freshness.test.mjs
node docs/p1-free-capacity/visibility-expiry-fix-20261013/server/native_mutations.mjs <repo> <NEW-output> C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules
node docs/p1-free-capacity/visibility-expiry-fix-20261013/server/summarize.mjs <repo> <this-output>
node docs/p1-free-capacity/visibility-expiry-fix-20261013/server/finalize.mjs <repo> <this-output>
```

재현은항상새output을사용한다. 현재server자료는검증문서·하네스·합성결과만이며새서버코드수정권고는없다.
