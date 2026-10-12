# Workers Free 권한 SQL 최소 변경 독립 검토

제품 기준: c025d75f964ab36f6f2eae541a99461f6de59b70. 원본 publication.js와 로컬 파일은 Git LF / Windows CRLF 차이만 정규화한 후 동일함을 확인했다. 실제 로컬 Miniflare/workerd D1, 기존 운영 DDL 48개와 migration0005의 합성 복제만 사용했다. 운영 API, D1, 배포는 사용하지 않았다. 제품 코드는 수정하지 않았다.

## 결과

| 방식 | HEAD rows_read | rows_written | 판정 |
|---|---:|---:|---|
| 기존 singleton + 이름 IN 전체 카탈로그 스캔 | 103 | 0 | 기준 |
| rowid IN 22개 + 이름 IN 22개 | 45 | 0 | 가능하나 더 낮은 대안 존재 |
| 22개 rowid/name 단일 조회의 scalar COUNT 합 + singleton | 23 | 0 | 우선 권고 |
| 냉시작: singleton과 JSON name/rowid 목록을 단일 SELECT로 조회 | 103 | 0 | 안전한 locator discovery |
| PRAGMA schema_version | 실행 불가 | 해당 없음 | SQLITE_AUTH |
| SELECT schema_version FROM pragma_schema_version | 실행 불가 | 해당 없음 | SQLITE_AUTH |

103 = sqlite_schema 102개 객체를 방문한 비용 + singleton 1개다. sqlite_schema의 이름 검색에는 사용 가능한 인덱스가 없다. rowid 검색은 INTEGER PRIMARY KEY를 사용한다. IN rowid 방식의 45행에는 22개 임시 IN 집합 방문 비용이 포함됐다. 22개 scalar 조회는 매번 실제 카탈로그 22행과 singleton 1행을 읽었다. 이것은 SQL 프로브의 실제 측정값이며 운영 edge 부하나 CPU 비용의 측정이 아니다.

최종 프로브: 51 pass / 0 fail / 0 skip. 모든 필수 trigger를 한 개씩 DROP했을 때 22개 이름/type/rowid 검증이 즉시 21개로 감소했다(22/22). 복구 후 검증된 전체 목록으로 힌트를 갱신하면 다시 22개가 됐다. unrelated schema 변경과 다른 trigger 이름의 rowid 재사용도 검사했다. 초기 IN 비용 가정 실패, locator 배열 정렬의 하네스 실패, CRLF 바이트 비교 실패를 숨기지 않았다. 각각 수정 후 별도 출력 경로로 재실행했다.

## 권고 계약

캐시에 저장할 수 있는 것은 name → schema rowid의 **조회 위치 힌트**뿐이다. guard가 존재한다는 성공 증거, epoch/revision, 공개 권한 허가, D1 데이터는 캐시하지 않는다. 매 요청마다 first-primary에서 singleton과 모든 22개 guard의 현재 존재/type/name을 **같은 SQL snapshot**으로 다시 확인한다.

예시 warm scalar:

~~~sql
SELECT epoch, CAST(revision AS TEXT) AS revision, typeof(revision) AS revision_type,
  ((SELECT COUNT(*) FROM sqlite_schema
      WHERE rowid=? AND type='trigger' AND name=?)
   + ... 22개 독립 scalar ...) AS guards
FROM public_publication_state WHERE id=1;
~~~

이름과 rowid를 매개변수로 바인딩한다. 각 expected name은 정확하게 한 번만 포함하고 rowid는 유일한 안전한 정수여야 한다. WeakMap을 사용하는 경우 원래 D1 binding 객체를 키로 삼고, 매 요청 새로 생성되는 first-primary session의 state 권한을 재사용하지 않는다.

냉시작은 같은 SELECT에 다음 subquery를 넣는다.

~~~sql
(SELECT json_group_array(json_object('name',name,'rowid',rowid))
 FROM sqlite_schema
 WHERE type='trigger' AND name IN (...22개 expected names...)) AS guardLocators
~~~

한 SQL에서 나온 현재 epoch/revision과 locator 목록을 검사한다. exact 22 distinct expected names, finite safe integer rowids, duplicate 없음, state 계약을 모두 확인하기 전에는 힌트를 저장하지 않는다. 원본 count의 성공을 단순 캐시하는 방식은 금지한다.

힌트가 오래됐으면 false negative만 가능해야 한다. 당해 응답을 503으로 폐쇄하고 힌트를 제거하는 간단한 방법이 안전하다. 복구를 즉시 시도하려면 전체 name scan을 다시 검증하고 **state + payload 전체 batch를 새 primary snapshot에서 재실행**해야 한다. 예전 batch payload를 별도 최신 state rescan 결과로 승격시키면 안 된다. 새 batch의 revision이 기대값과 다르면 기존대로 409가 되어야 한다.

nonce, request-start 5초 lease, fresh postflight, CAS, terminal, 원자 revision 증가 trigger, B6 projection에는 변경이 필요 없다. D1 migration도 필요 없다. 정상 warm HEAD와 모든 publication payload state 첫 statement에 동일 검증을 적용할 수 있다. 파일 변경 최소 범위는 publication.js와 그 직접 회귀시험이다.

## 위협 경계와 미확인

- 캐시를 신뢰해 schema guard 검사를 생략하는 schema-cookie 설계는 채택하지 않는다. 실제 workerd에서 schema_version 조회가 거부됐다.
- 권한 있는 DDL 작성자가 trigger를 같은 이름의 다른 본문으로 교체하면 기존 name-count 계약도 이를 증명하지 못한다. 제안은 이 기존 경계를 악화시키지 않는다. 이름이 동일한 잘못된 본문까지 위협 범위에 포함하려면 검증된 migration SQL 본문 fingerprint와 매번 SQL 내용 대조가 추가로 필요하다. 최초 배포에서는 계속 검증한 DDL/catalog fingerprint를 대조해야 한다.
- 캐시 힌트 초기화 시 첫 요청은 103행이다. isolate 재생성·기기 수·cold burst 빈도는 실제 재측정 예산에 별도 반영해야 한다. 23행을 모든 요청의 무조건 보장 비용으로 보고하면 안 된다.
- schema snapshot과 public state snapshot을 분리하지 않는다. payload도 같은 primary batch에 있어야 한다.
- 정확 좌표, 길찾기, 동의 철회, B6 과거 보호행, terminal 삭제, primary nonce/fresh-postflight/fail-closed를 부모 작업의 전체 회귀 범위로 유지한다.
- 현행 날짜 validator 실패는 이 SQL 검토로 해결되지 않는다.

## 재현 자료

명령(실제 실행):

~~~powershell
node docs/p1-free-capacity/server/schema_rowid_probe.mjs C:/Users/김진호/.codex/worktrees/p1-publication-security-guards/birdmap C:/Users/김진호/.codex/worktrees/p1-publication-final-audit/birdmap/docs/p1-free-capacity/server/rowid-probe-final-cold C:/Users/김진호/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules
~~~

최종 결과: rowid-probe-final-cold/ROWID_LOOKUP_PROBE.json. 23행/103행의 실제 metadata와 query plan, 모든 trigger DROP/restore 결과를 포함한다. 이전 결과: rowid-probe, rowid-probe-corrected, rowid-probe-scalar, rowid-probe-final. 제품 변경과 최종 부하 측정은 부모 작업자가 별도 브랜치에서 수행한다.

