# 데이터 표준 v1.1 — Phase 1 검증 설계와 Phase 2 이후 통과 기준

이 문서는 **앞으로 실행할 검증 계획**이다. Phase 1에서는 저장소 소스와 초안의 정적 검토만 수행한다. 아래 시험, SQL, migration, export, restore는 운영·로컬 모두 이번 단계에서 실행하지 않는다. 운영 데이터나 민감 좌표를 시험자료로 복제하지 않는다.

## 1. 기준 자료와 검증 범위

다음 값은 사용자가 이번 요청에 제공한 **Phase 0 실측 결과**다. 이번 작업에서 재조회한 값이 아니며, 향후 운영 적용일의 기대 건수로 고정해서는 안 된다. 아래 값은 먼저 합성 회귀 fixture의 조건으로 사용하고, 실제 이전 승인 직전에 별도의 읽기 전용 실측으로 기준 시점과 변경 순번을 다시 확정한다.

| 항목 | 제공된 기준 | 이전 검증에서의 의미 |
| --- | --- | --- |
| reports | 21건: approved 17, rejected 4, pending 0 | 상태를 포함해 모든 출처 행 보존 |
| site_id | 존재 16, NULL 5, 잘못된 ID 0 | 기존 ID 유지, 미연결을 자동 배정하지 않음 |
| siteData | 190개 ID | 동일 이름을 병합하지 않고 ID 집합 자체를 비교 |
| spot_key | 21건 모두 NULL | 가까운 좌표·동일 이름으로 연결하지 않음 |
| species | 단일 종 21, 여러 종 0 | 현재 21행은 각각 하나의 sighting으로 대응 |
| bird_count | 정수 1이 13건, NULL 8건 | count_value 13건에 1, 8건에 NULL; 정확도는 추정하지 않음 |
| 공개 좌표 | public_lat/public_lon 모두 NULL 21건 | NULL을 실제 좌표로 채우지 않고 공개 정책과 분리 |
| 공개 결과 | 승인 17건 모두 실제 좌표 사용 | 기존 응답의 좌표 수치 동일 여부만 내부 비교 |
| 대략 좌표 | 정상 쌍 19, 둘 다 NULL 2 | NULL을 새로 생성하지 않고 값 그대로 보존 |
| pending_public | 승인 자료 15건에 1 잔류 | 잔류값을 임의로 0으로 바꾸지 않음 |
| name_public | 0 또는 1만 존재 | 원값 유지; 이 문서에서 미제공 분포를 추정하지 않음 |
| 이상값 | 확인한 날짜·좌표·해시 이상 0, dedupe 중복 0 | 새 기준 시점의 재검증 결과와 구분 |
| 운영 구조 | reports, _cf_KV; FK·trigger·migration 이력 없음 | Cloudflare 내부 테이블을 이전·편집하지 않음 |
| 인덱스 | 운영 reports_site_history 없음, 저장소에는 있음 | 신규 계획에 명시; 자동 적용하지 않음 |
| Time Travel | 2026-09-20 09:15 UTC 이후 조회 가능했던 상태 | 현재 복구 가능 시점이나 시험 성공을 보장하지 않음 |

기준 코드: `reports-api/src/public.js`, `admin.js`, `shared.js`, `schema.sql`, `reports-api/test/*.mjs`, `index.html`. README보다 실제 응답 조립 코드를 계약의 기준으로 삼는다. 현재 README 일부에는 승인 응답의 이력·동의한 이름을 생략한 설명이 있다.

기존 `test/helpers.mjs`의 `fakeDb()`는 실제 Node SQLite 메모리 DB에 schema.sql을 실행한다. SQL 문법·UNIQUE 등을 시험할 수 있으나 `batch()`는 단순 순차 실행으로, D1 트랜잭션 원자성을 재현하지 않는다. 이번 Phase 1에서는 이 시험도 실행하지 않는다. 향후 단위시험 통과와 D1 staging의 원자성 시험 통과를 별도 증거로 남긴다.

## 2. 측정 가능한 검증 게이트

다음 게이트를 모두 통과해야 신규 읽기 경로로 전환한다. 불일치가 발생하면 원자료를 고쳐 통과시키지 않고 전환을 중단한다. NULL·빈 문자열·숫자 0·문자열 "0"의 구분을 유지한다.

| ID | 검증 | 통과 기준 |
| --- | --- | --- |
| V01 | 전체 스키마 정적 대조 | ER·전체 컬럼 사전·DDL의 테이블/컬럼/타입/NULL/DEFAULT/CHECK/UNIQUE/FK/ON DELETE가 모두 일치. 문서에만 있는 제약 0개 |
| V02 | 영구 ID·출처 일대일 대응 | source_id 누락·중복 0. 기존 reports.id 유지. reports 1행당 legacy checklist 1개, legacy snapshot 1개. 동일 이름 sites도 각각 유지 |
| V03 | 22개 기존 필드 보존 | 원자료와 호환 필드의 NULL 포함 필드별 불일치 0. 승인·반려 모두 보존. site_id·spot_key·pending_public·name_public의 자동 수정 0 |
| V04 | legacy 의미 보존 | record_mode=legacy_report. 없는 effort·complete_list·번식 확인·taxon_id는 NULL. 과거 reviews/audit 생성 0. 현재 행은 legacy_reports_snapshot으로 구분 |
| V05 | 종명·수량 보존 | 현재 단일 종 21건은 sighting 21개. count_value는 1인 13건/NULL 8건, accuracy는 unknown. 원문 변경 0. 여러 종 합성 자료는 미해석 원문을 보존하고 종별 count/taxon은 NULL |
| V06 | 참조 무결성 | FK 위반·잘못된 site 참조·self/다단/고아 spot 연결 0. 발견한 기존 예외는 자동 보정 없이 사전 심사. ON DELETE RESTRICT에 의한 의도치 않은 원자료 삭제 방지 확인 |
| V07 | 좌표 구분·공개 | actual/approx/public 각각 값·NULL 유지. 신규 자료의 불완전 쌍 거부. 정상 승인 actual 공개 허용. 대기·상태·탐조지 이력 응답의 금지 필드 노출 0 |
| V08 | 신규 제보 저장 전 정책 | 번식 비관련 확인이 true인 명시적 값일 때만 접수. 누락/null/false/문자열 "true"/숫자 1 등 대체값 거부. 거부 요청의 raw·관찰·첨부·본문 로그 영속 저장 0 |
| V09 | 정상 관찰의 정책 오판 방지 | 종명·희귀 여부·보호등급·관찰월만 바꾼 동등 요청의 승인 자격·공개 정책 차이 0. AI·키워드·규칙의 번식 가능성 추정에 의한 자동 차단 0. 종명·계절을 근거로 번식 확정을 기록한 행 0 |
| V10 | 관리자 변경 추적 | 전환 이후 승인된 변경마다 actor/request/전후 버전/시각을 실제 사건으로 기록. 같은 요청 재전송의 중복 review·audit 0. 취소·실패 요청의 성공 이력 0 |
| V11 | API 호환 | 아래 계약표의 상태코드·키·타입·필드 생략·순서·페이지·캐시·Origin 동작 일치. 의미 없는 generatedAt만 비교 예외. 설명되지 않은 응답 차이 0 |
| V12 | 원자성·동시성 | 성공한 쓰기의 양쪽 누락·부분 반영 0. 의도적 중간 오류 시 대상 batch 전체 원복. 같은 행 동시 수정은 버전 충돌로 식별하며 조용한 변경 유실 0 |
| V13 | migration 멱등성 | 동일 버전/동일 checksum 재실행으로 추가 원자료·관찰·검토·감사 0. 동일 버전/다른 checksum은 실행 전 중단. 중간 실패를 완료로 표시한 이력 0 |
| V14 | taxa 계보 | 분류체계 버전 변경·1→N split·N→1 merge 이후 기존 sightings.taxon_id·species_original 자동 변경 0. 재동정은 명시적 사건과 이전 연결을 보존 |
| V15 | 금지 자료 정리 | 의도적으로 넣은 합성 금지정보 sentinel이 활성 DB/legacy mirror/변경 대기열/첨부/감사 전후값/캐시/운영 로그에 남지 않음. 비민감 처리 기록만 유지 |
| V16 | 재처리에 의한 부활 방지 | purge tombstone 대상의 오래된 backfill·재시도·동기화 이벤트 재생 후 관찰·원자료·첨부 재생성 0. 복구 이후에도 서비스를 열기 전에 같은 차단 적용 |
| V17 | rollback | 정책을 적용한 reports writer를 유지하면서 읽기 플래그 복귀 후 새 접수·관리자 변경 유실 0. 신규 구조 DROP/전체 restore 없이 서비스 복귀 |
| V18 | 성능·인덱스 | 실제 쿼리 계획과 rows_read·시간을 비교. 데이터 크기별 예상 인덱스 사용 확인. p95 허용치는 Phase 2에서 확정; 최초 제안은 동등 조건 기존 대비 20% 이내 악화 |
| V19 | 지도·기상·조석 경계 | 기존 sites ID/대표 좌표/기상·조석 연결 및 파일 내용 변경 0. 신규 읽기 사용 시 기존 마커·검색·최근목록·팝업·페이지 동작 일치 |
| V20 | 실행 증거·민감정보 | 시험은 합성 자료로 수행. 보고서에 실제 좌표·실명·IP 해시·원문 요청 없음. 실행 환경/코드 버전/파일 checksum/집계/오류/통과 여부를 기록 |

현재 개체수 1은 숫자가 알려졌다는 뜻이다. 실제로 정확히 센 값인지에 대한 근거는 없으므로 `count_value IS NOT NULL`과 `count_accuracy='unknown'`의 조합을 허용해야 한다. unknown 정확도를 count_value NULL과 동치로 제약하면 기존 자료를 잘못 바꾸게 된다.

여러 종 합성 자료에서는 `species_original`의 전체 원문을 하나의 미해석 sighting으로 보존하는 초안 방식을 검증한다. 합산 bird_count는 checklist의 legacy 호환 필드와 snapshot에 남기고 sighting에 배분하지 않는다. 나중에 검증된 종별 분리는 독립적으로 승인한 정제 작업이다. 기존 문자열에 현재 입력 normalizer를 다시 적용해 원문을 바꾸지 않는다.

## 3. API·관리자 호환 시험

| 경로/동작 | 그대로 비교할 계약과 합성 사례 |
| --- | --- |
| POST /reports | 성공 201, ok/id/status=pending/publicVisibility, 허용된 경우에만 approximate spot. Origin·Turnstile·rate limit·중복·잘못된 JSON·본문 크기 오류. 실제 좌표를 성공 응답에 넣지 않음 |
| GET /reports/approved | ok/generatedAt/spots/fixedSpots. 독립점 + 연결 이력 종 합집합. history.id/date/species와 동의한 reporter. 연결해도 원문 종 수정 없음. 각 축의 public 값이 NULL일 때 기존 actual fallback 결과 비교 |
| GET /reports/pending | pending AND pending_public=1 AND 대략 좌표 정상 쌍만. 승인 15건의 pending_public=1 잔류가 노출되지 않음. 실제 좌표·이름·개체수·메모 없음 |
| GET /reports/site/<id> | siteId/total/limit/offset/history. 승인+site_id 조건. observed_on→received_at→id 내림차순. 기본 5/최대 50. offset 초과 때 history=[]여도 total 유지. 좌표·내부 total_count·메모·개체수 없음 |
| GET /reports/<uuid>/status | 상태·publicVisibility·receivedAt·decidedAt만; no-store. 종·이름·좌표 없음. 없는 ID=404 |
| 관리자 목록 | status/all, species, spotKey. 현재 species가 있으면 status보다 우선하며 spotKey도 status와 교집합을 만들지 않음. 이 우선순위를 무의식적으로 변경하지 않음 |
| approve | 선택적으로 종·actual/public 좌표·관찰일·site·이름 동의·메모 수정. 생략한 값 유지. status approved. dedupe 원값 보존 여부를 호환 규칙과 대조 |
| reject | rejected, pending_public=0, 결정 시각. 제보 자체 보존 |
| unpublish | pending, pending_public=0. 황색 마커로 되살아나지 않음 |
| link/unlink | report UUID 또는 fixed:<siteId>:<n>. 연결 시 approved와 결정 시각. 원문 종 변경 없음. 해제하면 독립점 복귀 |
| consent | 이름 공개만 변경; 관찰 삭제 없음. reporter 키를 NULL로 추가하는 것과 키 자체를 생략하는 것을 구분 |
| visibility | 대기 상태에서만 공개 켜기. 기존 대략 좌표 유지, 없을 때 생성하는 기존 규칙. 승인 상태에서 켜기는 오류 |
| site | site 연결/해제만. status·실제 좌표·spot_key 변경 없음 |
| 관리자 인증 | 모든 경로 Access JWT 검증. 서명/issuer/audience/만료/허용 actor 오류는 변경 0. 설정 부재 fail-closed |

승인·대기·탐조지 이력 GET의 `Cache-Control: public, max-age=60`, 상태의 `no-store`, 필드 생략, Origin 응답을 함께 비교한다. 승인 목록의 SQL은 동일 관찰일·접수 시각에 ID tie-break를 명시하지 않지만 탐조지 이력은 명시한다. 비교기는 근거 없이 모든 배열을 정렬해서 순서 오류를 숨기지 않는다. 순서가 미정인 동률 그룹만 별도로 기록하고 API에 새 순서를 부여하는 일은 별도 변경으로 승인한다.

기존 관리자 link는 대상이 approved인지 검사하지 않고 대상 spot_key 유무를 검사한다. fixed key는 형식만 검사한다. 따라서 pending/rejected 대상, 존재하지 않는 fixed ID, 연결 대상의 공개 취소, 자기 연결, 다단 연결을 합성 시험에 넣는다. 기존 결함을 호환 비교 도중 몰래 수정하지 않되, 새 무결성 게이트와 충돌하는 상태는 전환을 중단하고 명시적으로 처리한다.

필수 입력 정책 변경과 응답 호환은 구분한다. 과거 POST 요청에는 번식 비관련 확인이 없으므로 **과거 요청을 그대로 수락하면서 새 확인을 필수로 만들 수는 없다.** 향후 정책 전환 시 화면·서버를 조정한 후 확인 누락은 저장 전에 거부한다. 정책 전환 전/후의 기대 응답을 나누어 시험한다. rollback 대상도 해당 확인을 강제하는 reports writer여야 한다.

## 4. 실패 주입·동시성·재실행 시나리오

아래 시험은 Phase 2 이후 허가된 격리 환경에서만 구현·실행한다. 이번 문서는 SQL 실행용 시험 파일을 만들지 않는다.

| 사례 | 주입 지점 | 확인할 결과 |
| --- | --- | --- |
| batch 중간 실패 | legacy 변경 뒤, 새 raw/checklist/sighting/review/audit 각각의 앞뒤 | 전부 함께 commit 또는 전부 rollback. 실패 후 성공 응답 없음 |
| 성공 응답 유실 | commit 직후 네트워크 단절 후 같은 request 재시도 | 같은 logical 요청은 원래 결과 재사용; 중복 데이터·이벤트 0 |
| idempotency 키 오용 | 같은 키로 다른 본문 전송 | 기존 결과를 다른 요청 성공으로 반환하지 않고 충돌 거부 |
| 동일 행 동시 승인 | 두 관리자가 같은 revision에 수정 | 하나만 정해진 revision을 차지; 다른 요청은 충돌을 알리고 재검토 |
| 별개 행 동시 처리 | 접수와 승인, consent와 site, link와 대상 unpublish | 허가 문맥이 다른 요청에 섞이지 않음; 부모·자식 공개 상태 일관성 |
| snapshot 경계 | 기존 행 복사 도중 접수·승인·수정 | received_at만으로 증분을 찾지 않음. 변경 fence/순번 또는 동등한 원자적 경계로 최신 상태 누락 0 |
| 구버전 Worker 혼재 | control 모드 전환 앞뒤 구버전 쓰기 | 성공한 쓰기는 모두 추적. 무기록 쓰기는 거부; 정상 API 가용성을 유지할 배포·drain·재시도 절차 검증 |
| 허가 범위 위반 | mutation_permits의 다른 ID/action/request 재사용 | 대상 외 변경 거부. batch 종료 후 사용 가능한 잔류 허가 0 |
| permit 도중 crash | 허가 발급 뒤 프로세스 종료 | 트랜잭션 실패 시 허가·변경 모두 취소. 독립 세션이 잔류 허가로 쓸 수 없음 |
| migration 중단 | DDL 각 단계/seed/백필/완료 기록 앞뒤 | 미완료를 완료로 기록하지 않음. 정확한 실패 지점에서 재개하거나 전체 안전 재실행 |
| checksum 불일치 | 이미 적용된 파일 한 글자 변경 | 재실행 전 중단. IF NOT EXISTS로 실제 구조 차이를 숨기지 않음 |
| 번식 확인 누락 | 원문·첨부 시작 전 | raw·일반 관찰·첨부·본문 로그 생성 0 |
| 잘못된 확인 후 관리자 발견 | 신규 pending 또는 이미 공개된 합성 자료 | 즉시 일반 조회에서 배제; 원자료·첨부·대기열·민감 감사값 제거; 비민감 처리 기록만 유지 |
| purge 뒤 오래된 이벤트 | 백필/dual-write 재시도/복구 후 replay | tombstone에 의해 재생성 차단. no-op 재실행으로 purge 안전성 유지 |
| DB 또는 신규 read 장애 | 새 읽기 경로 응답 실패 | 기존 read로 플래그 복귀. 신규 접수분이 reports에 모두 남음 |
| rollback 후 기능 접근 | detailed checklist/media/taxa 등 legacy에 표현 불가 기능 | 가역 전환 구간에서는 비활성. 무손실 양방향 표현이 입증되기 전 활성화하지 않음 |

mutation_permits/migration_control 같은 운영 제어 표는 사용자 권한 인증을 대체하지 않는다. 실제 관리자 인증과 허가 범위 검증을 먼저 수행하고, DB 허가 발급·변경·검증·소비를 하나의 D1 원자적 단위로 시험한다. 평문 DB 접속권한을 가진 관리자가 모든 제약을 우회할 수 있다는 사실과 앱 경로의 추적 보장은 구분한다.

## 5. 분류체계·환경·개인정보 검증

분류군 합성 fixture에는 같은 국명을 가진 다른 개념, source/version별 개념, synonym→accepted, 1→2 split, 2→1 merge, 잘못된 parent/accepted 참조와 순환을 넣는다. accepted_taxon_id 하나만으로 1→N split을 표현했다고 간주하지 않는다. split은 새 버전 개념들과 분류 판단 근거를 명시적으로 보관해야 하며, 과거 sighting의 종 개념을 일괄 치환하지 않는다. 재동정 이력은 실제 변경 시점에만 생성한다.

환경 자료는 source/data_type/target_time/retrieved_at의 역할을 따로 검증한다. forecast를 observed로 표기하지 않고, 최신 weather/tide를 과거 관찰에 자동 연결하지 않는다. 기존 21건의 media/environment 레코드는 0개가 기준이며 없는 내용을 빈 가짜 이벤트로 생성하지 않는다.

원본 immutable 제약은 일반 운영에서의 덮어쓰기 금지다. 금지된 번식정보 제거 절차에는 통제된 삭제 예외가 필요하다. purge 시험의 sentinel 검색 대상은 raw payload, reports note/좌표, 정제 관찰, media 원본·파생파일·EXIF, audit before/after JSON, review 자유문, 동기화 대기열, 오류 로그와 캐시까지다. 감사에는 처리 종류·opaque ID·처리시각·actor 등 비민감 사실만 남긴다. 좌표나 원문에서 만든 해시도 대체 기록으로 남기지 않는다.

Cloudflare Time Travel의 과거 버전과 이미 다운로드된 외부 사본을 활성 DB purge만으로 즉시 지울 수 있다고 주장하지 않는다. 복구 시점보다 나중에 만들어진 purge 차단 목록을 복구된 DB 밖에서 확보하고, 복구 후 서비스 개방 전에 재적용하는 절차가 필요하다. 실제 보존기간과 운영 접근 제한은 Phase 2 전 결정 사항이다.

현재 브라우저는 이력 첫 페이지를 60초 보관하고, 주기적으로 승인·대기 목록을 갱신하며 fetch 실패 시 기존 마커를 남긴다. 따라서 서버에서 지웠다는 사실만으로 열려 있는 모든 화면에서 즉시 사라졌다고 검증하지 않는다. 신규 정책의 캐시 삭제/갱신과 최대 노출시간 목표를 별도로 정하고, 오프라인·기다운로드 사본은 통제 한계로 문서화한다.

## 6. 시험 환경과 실행 순서

1. **Phase 1 정적 검토**: DDL·문서·대응표·검증 SQL의 참조 이름과 제약을 대조한다. 기존 소스와 사용자가 제공한 Phase 0 결과만 사용한다. SQL 실행·DB 생성·배포 없음.
2. **Phase 2 로컬 합성 시험**: 별도 승인 후 격리 SQLite/D1 runtime에서 schema·변환·제약·재실행을 실제 실행한다. 파일 기반 실제 운영 snapshot은 사용하지 않는다. 기존 시험 대역의 batch를 원자적으로 고치거나 전용 통합 fixture를 사용한다.
3. **Phase 2 격리 D1 시험**: 별도로 허용된 staging DB에서 D1 batch·trigger·foreign key·쿼리/바인딩 한도·timeout·실패 주입·동시성·purge를 검증한다. 동일 계정이어도 운영 바인딩을 사용할 수 없는 실행 설정을 확인한다.
4. **승인된 운영 사전 실측**: 최신 스키마·건수·연결·NULL·복구 범위를 읽기 전용으로 재확정한다. 기준이 달라지면 제공된 21건 수치에 억지로 맞추지 않는다.
5. **백필·shadow 준비**: 운영 쓰기는 별도 승인을 받은 단계에서만 시작한다. 버전·checksum·허가된 manifest와 완료 기준을 고정하고 실패 시 read 전환을 막는다.
6. **shadow 비교**: 동일한 일관성 경계의 legacy/new 응답을 대조한다. 제안 관측기간은 최소 24시간과 모든 관리자 액션별 실제 또는 staging 재현 사례다. 개인정보 차이·누락·중복 0이 필수이며 미발생 액션을 기간만 채웠다고 통과시키지 않는다.
7. **읽기 전환·rollback 훈련**: 호환 기능만 켠 상태에서 flag 전환, 신규 오류, reports 복귀, 이후 쓰기 유지까지 확인한다. 신규 상세기능은 이 가역 구간에 활성화하지 않는다.
8. **후속 기능 승인**: 안정화 후 detailed checklist·taxa 관리·media·환경 수집을 각기 시험하고 별도 활성화한다. 구구조 유지·보존 종료는 별도 결정이다.

성능 합성 규모는 21행·1만행·10만행을 제안하며 대기/승인 비율, 한 탐조지에 집중된 이력, 같은 날짜 대량 자료, 연결 지점, 큰 메모를 포함한다. 운영 크기와 비용 한도를 확인한 뒤 조정한다. `/reports/site/<id>`의 window COUNT, 큰 offset, 전체 approved/admin 목록도 측정한다. `reports_site_history` 인덱스가 있더라도 COUNT·전체 목록 비용까지 사라졌다고 가정하지 않는다.

## 7. 사용자 결과물 35항 추적표

문서가 존재한다는 사실과 구현이 검증됐다는 사실을 구분한다. Phase 1의 통과는 설계의 완결성, Phase 2 이후의 통과는 아래 게이트의 실제 실행 증거로 판단한다.

| 요청 번호 | 필수 결과물 | 검토·시험 연결 |
| --- | --- | --- |
| 1 | 최종 ER | V01, V06: 모든 FK와 cardinality가 DDL과 일치 |
| 2 | 각 테이블 목적 | V01: 각 보조 표의 실제 운영 소비자 설명 |
| 3 | 전체 컬럼 | V01, V03: 누락 없는 필드 사전 |
| 4 | SQLite/D1 자료형 | V01: affinity/실제 저장 타입과 앱 검증 구분 |
| 5 | NOT NULL | V01, V04: legacy 미확인 값 강제 채움 없음 |
| 6 | DEFAULT | V01, V04: 이름동의·effort·번식확인 기본 추정 없음 |
| 7 | CHECK | V01, V05, V07: NULL·type·쌍·enum·날짜 검증 경계 |
| 8 | UNIQUE | V02, V13: 출처·요청·버전 중복 방지 |
| 9 | foreign key | V06, V14: 참조와 순환 검사 |
| 10 | ON DELETE | V06, V15: 일반 삭제 제한과 purge 예외 |
| 11 | 인덱스와 이유 | V18: 실제 WHERE/ORDER BY와 연결 |
| 12 | reports 전체 대응표 | V03: 22필드 원값 왕복 비교 |
| 13 | 기존 21건 규칙 | V02~V05: 제공된 기준 fixture 보존 |
| 14 | legacy/new 구분 | V04, V08: source/record mode와 정책 차이 |
| 15 | 원본·검증자료 분리 | V03, V04, V15: snapshot/최초입력/수정이력 구분 |
| 16 | 신규 제보 흐름 | V08~V12: 저장 전 확인·검증·원자적 접수 |
| 17 | 전체 탐조 checklist 흐름 | V04, V05, V17: effort·complete_list와 단계별 활성화 |
| 18 | 번식 관련 차단 | V08, V09, V15, V16 |
| 19 | 관리자 검토 | V10~V12: 8개 현행 액션과 추가 사건 |
| 20 | 좌표 저장·공개 | V07, V11: actual/approx/public/공개정책 구분 |
| 21 | taxa 버전 관리 | V14: split/merge와 과거 동정 고정 |
| 22 | migration 버전 | V13: 순번·checksum·완료표시 |
| 23 | 멱등성 | V02, V13, V16: 재실행·동일 키/다른 내용·삭제 후 replay |
| 24 | dual-write | V10, V12: 단일 D1 원자성·구버전 통제 |
| 25 | shadow-read | V07, V11, V20: 일관된 기준·노출 없는 diff |
| 26 | rollback | V17: policy-aware reports 경로와 신규 접수 보존 |
| 27 | API 전환 순서 | V08, V11, V17: 입력 정책과 read adapter 분리 |
| 28 | 테스트 전략 | 이 문서의 V01~V20 및 시험 단계 |
| 29 | 무결성 SQL | V01~V07, V13: 각 질의 목적·기대값·출력 민감도 검토 |
| 30 | 성능·인덱스 | V18: 격리 부하와 운영 사전 기준 |
| 31 | 개인정보·좌표 | V07~V09, V15, V16, V20 |
| 32 | migration SQL 초안 | V01, V13: 비실행 초안·매개변수·전제조건 명시 |
| 33 | 예상 파일 변경 | V19, V20: 이번 설계 파일과 미래 구현 파일 구분 |
| 34 | 사람의 결정 사항 | 정책 활성 시점·보존·purge/복구·성능 gate·분류 기준을 확정 전 표시 |
| 35 | Phase 2 이후 계획 | 이 문서 6절: 단계마다 통과 증거와 실행 권한 별도 확인 |

## 8. 결과 기록 양식

각 실행에는 환경 식별자(운영 여부 포함), UTC 시각, 코드 버전, migration checksum, 입력 fixture manifest checksum, 기준 순번, V01~V20 결과, 불일치 건수와 분류, 중단/복귀 결정을 남긴다. 민감 값을 로그로 덤프하지 않고 좌표·실명·해시는 동일 여부와 건수만 기록한다. 실패 예시도 합성 자료로 재현한다.

Phase 1 결과 표시는 `정적 검토`, `미실행`, `설계상 미결정`으로 구분한다. `SQL 통과`, `D1 무결성 보장`, `복원 성공` 같은 문구는 해당 단계의 실제 실행 증거가 있을 때만 사용한다.

## 9. 재개 요청의 v1.1 추가 검증

기존 V01/V03/V06/V12에 다음 사례를 추가한다. SQL 실행 전 정적 검토와 이후 비운영 실행 시험을 구분한다.

- legacy coordinate_uncertainty_m/submitted_at/submitted_by NULL 보존, source snapshot과 created/captured 시각 구분.
- sites source JSON의 ID·name·lat·lon 바인딩 일치, 지역/서식지 없는 값 NULL, 영구 site ID 변경 거부.
- 환경값의 숫자 타입과 단위·강수 기간·조위 기준면, 관측소 좌표와 실제 관찰좌표 구분.
- review가 다른 checklist의 sighting을 참조하면 복합 FK로 실패.
- JSON 키 순서/공백 및 정수·실수 표기 차이는 값이 같으면 충돌이 아님. 필수 22키 누락·추가·중복은 실패.
- canonical 논리 JSON으로 source_fingerprint 생성·재검증. SQL payload의 바이트 표기 차이와 내용 변경 구분.
- species_original과 sighting 출처는 일반 UPDATE 불가; 정정은 species_identified/taxon/실제 review·audit로 기록.
- purge tombstone은 before_json/after_json 모두 NULL CHECK, 오래된 요청 재생으로 삭제 자료 부활 금지.
- capability 오류/404/지원하지 않는 버전/혼합 epoch에서 확인 우회 없이 안전한 재시도. 실제 거부 본문은 로그에 남지 않음.

위 항목을 포함한 실제 SQL/D1 시험은 이번 Phase 1에서 실행하지 않았다.
