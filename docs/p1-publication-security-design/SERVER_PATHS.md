# 현재 생성 경로와 책임

모든 코드 위치는 PR16 검토 SHA2452989 기준이다. PR16이 PR13을 포함했다는 의미가 아니다. 서버 비교 결과 PR13과 다른 제품 서버 파일은 shared.js이며 S1-R tokenizer/보호 판정 보완이다. 제보 선택·canonical persistence 구조는 동일하다.

## 검증된 경로

|공개 경로|실제 데이터·변환|현재 캐시|보안 영향|
|---|---|---|---|
|GET /reports/approved|public.js:340 handleApproved → reports status=approved → shared publicPayload, spot_key로 자기점/다른점/고정점 이력 분류, 공개좌표 없으면 현재 정책의 실제좌표 fallback|public,max-age=60|철회·hide 이전 public payload 재사용 가능. generatedAt은 조회 뒤 JS 시각이며 권한revision 아님|
|GET /reports/pending|public.js:211 handlePending → status=pending,pending_public=1 및 approx좌표 존재 → pendingPayload|public,max-age=60|반려·철회·가림 전 대기 payload 및 과거 optimistic 접수 spot도 통합 gate 필요|
|GET /reports/recent-sites|public.js:364~404 → 승인·site_id·관찰일 범위·NOT LOCATION_HIDDEN_SQL → isSensitiveReport 제외 → site별 species 집계|public,max-age=60|좌표 없음. 오래된 집계가 보호 입력의 site 연계/추천 가점을 유지할 수 있음. 현재 정책의 필터만 유지|
|GET /reports/site/:id|public.js:251~299 → reports 승인+site_id, total/limit/offset, historyEntry|public,max-age=60|좌표 없는 이력도 기존 공개 연결 상태를 재사용할 수 있어 동일revision cache-key/gate 필요. S1-P 추가 필터는 하지 않음|
|GET /field-updates|field-updates.js:197~214 → 3시간 last_activity_at·status<>deleted·최대100 → events/count를 추가 SELECT → publicEntry|no-store|여러 SELECT가 하나의 권한 snapshot은 아님. field public_lat/public_lon만 송출하지만 일반종은 실제좌표와 동일. serverTime은 권한버전 아님|
|GET /reports/:id/status|public.js:303~337, 상태·공개구분·시각만 송출|no-store|본인 접수 상태 참고. 공개 좌표 표시의 승인 근거로 사용하지 않음|
|GET /reports/capabilities|canonical/control.js:49~52, 기능·maintenance 상태|no-store|쓰기 기능 협상이며 최신 위치 공개권한을 증명하지 않음|
|GET /contributors/monthly|public.js:416~449, 월별 승인 건수·동의한 이름 집계|public,max-age=60|좌표 없는 별도 집계. 철회/이름동의 변경 캐시 무효화 필요. 신규 global gate로 추천 알고리즘을 변경하지 않음|

READ_ONLY_HTTP_HEADERS.json: 위 위치/이력6 GET은 실제 운영에서200이었다. 승인/대기/최근/이력은60초, field/capabilities는no-store를 확인했다. CF-Cache-Status/Age 미제공은 CDN 저장이 없다는 증거가 아니다. 현재 Worker 전체 source/활성 version/Cache Rules/브라우저 이전 cache는 이번 GET으로 증명하지 못했다.

## mutation 및 canonical

- public.js:98 handleCanonicalSubmit → persistQuick. 비번식 확인·captcha redemption·reports+raw/checklists/sightings가 같은 batch다. native pending 공개는 REPORTS_PENDING_PUBLIC에 따른 명시 정책이며 종명만으로 바뀐다고 가정하지 않는다.
- admin-actions.js:9 planAction: unpublish는 status=pending,pending_public=0; reject는rejected; hide는 public/approx 좌표만 바꾸고 실제좌표·승인 상태 유지; hide=false·reapprove도 명시적 관리자 작업이다. 일반 만료를 삭제로 취급할 근거가 아니다.
- canonical/persistence.js:74 persistAdmin: expected_revision으로checklists CAS, reports mirror, reviews/audit append를 하나의batch에 묶는다. 실패는전체rollback. 공개는현재legacy reports를 읽고 shadow.js가정본투영을별도비교한다. 실제 public read-switch·strict/non-strict dual mode는 없다.
- canonical/purge.js:27의 operator-only reports DELETE도publication revision coverage에 포함해야 한다. forbidden purge의 기존 safety-ledger·restore금지 계약을 유지한다.
- field status/confirm/delete는 reports와별도테이블·별도흐름이다. 기존 reports_freeze INSERT/UPDATE trigger와 assertWriteGate가 모든 field 쓰기를 막는다고 가정하지 않는다.

## 네 실패의 책임

|기존독립ID|실패|서버책임|클라이언트책임|
|---|---|---|---|
|V03|승인hide뒤 후속GET의 과거public|현재권한에서public좌표/hidden이일관된snapshot만 송출, cache차단|최초/후속data를authoritative권한과대조하고old목록·검색·팝업·두길찾기 제거|
|V04|철회뒤 후속과거목록|status+공개scope·projection을원자적읽기, 철회즉시버전변경|동일/다른요청순번보다serverstate 우선, 전체snapshot교체|
|V05|다른기기삭제뒤field과거목록|deleted영구terminal, 최신목록 snapshot, 삭제권한증명|누락ID의영구삭제추정 없이 최신snapshot에서제거, 안내폐쇄|
|V06|새로고침뒤 최초과거응답|cache없는현재anchor 및nonce반영, epoch상태신뢰성|기존메모리/storage없이 bootstrap완료전정확위치·길찾기보류|

Chrome에서 별도15unsafe(철회복귀/hide길찾기복귀/새로고침삭제복귀×5폭)가재현됐다. 이번설계에서다시통과시킨것이아니며 TEST_PLAN의차단시험이다.

## 추가 서버 경합 발견 — 캐시와 구분

field-updates.js:277 loadActive는쓰기전읽기다. Turnstile등await 이후:299 UPDATE는WHERE id만쓴다. 사전 not_visible읽기→다른요청:374 deletedcommit→늦은 statusUPDATE reappeared순서이면실제DB가다시공개된다. 에이전트의 실제schema/UPDATE추출sqlite :memory: 모델에서도 공개목록 적격1을확인했다. 전체인증/APIhandler나운영사고를재현한것은아니다. 별도root모델을문서하위에저장한다.

단순revision은이복원값을최신으로승격한다. field 삭제terminal DB제약과write-timeCAS, 이벤트/본행/revision의원자성이필수다. confirm의늦은UPDATE는deleted상태는유지하지만activity를갱신하므로함께차단해야한다. 두동시삭제에서중복event를남기지않도록멱등성도검사한다.
