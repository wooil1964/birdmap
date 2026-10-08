# P1-S1 독립 보호 판정 감사

기준 main은 `4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57`이다. 감사 대상 10개 파일은 최신 Git 원문과 내용이 같음을 SHA-256 및 Windows CRLF 차이 명시 대조로 확인했다. 분석 브랜치의 운영 소스도 이 코드와 같다. 운영 endpoint, 실제 D1, POST 및 Worker 배포는 호출하지 않았다.

고정 합성 시계는 2026-10-08 22:40 KST다. P1-A~D 운영 스냅샷의 내용 또는 평가시계를 바꾸지 않았다. 이번 결과는 새 합성 입력의 보호 판정 결과이며 과거 추천 재현 결과와 별도다.

## 1. 판정 요약

1. 기존 보호종 19개 문자열의 정확 일치만 검사한다. 수량 접미사와 비정규 구분자는 이 판정을 통과할 수 있다. 신규 입력도 개체수 문자열을 종명에 넣을 수 있고, `normalizeSpecies`는 줄바꿈을 분리하기 전에 지워 여러 종을 붙인다. 이 두 항목은 기존 표현 처리 결함이다.
2. 기존 승인 이후 공개 정책은 관리자 승인과 공개 좌표를 신뢰한다. 정확한 보호종도 `/reports/approved`와 탐조지 이력에는 들어갈 수 있다. canonical quick 등록은 명시적 비번식 확인 뒤 종명에 의한 번식 추론 없이 정확 좌표 공개를 허용하도록 의도됐다. 이 부분 전체를 기존 결함으로 단정하면 안 된다.
3. 이번 사용자 지시의 “보호 대상 표기 차이로 공개 집계 유입 금지, 민감 위치 역추적 금지”를 모든 공개 경로에 보장하려면 승인 이후/정본 등록에도 보호 정책을 다시 적용하는 **정책 전환**이 필요하다. recent-sites만 수정하면 이 보장은 성립하지 않는다.
4. 연결 제보는 독립 마커가 없어도 일반 부모 점과 고정 점 이력/검색에 합쳐져 부모 좌표와 연결된다. 자식의 위치 가리기만으로 부모 공개 지점의 간접 노출을 막을 수 없다.
5. 실제 운영 자료의 민감정보 유출은 확인하지 않았다. 이하 결과는 현재 코드와 합성 SQLite 자료의 동작이다.

선행 정책 근거: `docs/long-term-db-phase2a/README.md:13`은 “종명·희귀도·보호등급·월로 번식 여부를 판정하지 않는다. 일반 비번식 승인 관찰은 실제 관찰좌표 공개 원칙을 유지한다.”라고 명시한다. `shared.js:304`도 기존 보호종 공개 보류 범위를 승인 전으로 설명한다.

## 2. 원문 → 저장 → 공개 → 지도 흐름

| 단계 | 현재 실제 코드 | 보호 판정 및 사각지대 |
|---|---|---|
| 신규 종명 정리 | shared.js:118,136 normalizeSpecies | C0 제거 뒤 comma/semicolon/middot/newline 분리. newline이 먼저 제거되어 붙임. slash는 허용 pattern 밖이라 신규 입력 거부. 숫자/공백/하이픈/괄호 허용. literal 중복만 제거. |
| legacy 등록 | public.js:135 handleSubmit | isSensitiveReport로 pending_public 0/1을 결정. 일반 제보의 pending 좌표는 대략 좌표. 보호 수량 표기가 normal이면 대략 점을 공개할 수 있음. hideLocation은 별도 명시적 요청. |
| canonical quick 등록 | public.js:97; canonical/persistence.js:5 | non_breeding_confirmed 정확 true, 좌표, 요청 ID를 검증. 보호 종명으로 pending 자격을 제한하지 않으며 REPORTS_PENDING_PUBLIC 설정이 공개 결정. hideLocation 미요청이면 pending 좌표가 실제 좌표. 설정/실제 활성 모드는 이번에 읽지 않음. |
| 원문·정본 | canonical/data.js:51,58; persistence.js:33 | native input.species는 immutable raw_submissions에 보존. sightings의 species_original, taxon_id null, 복수종 unparsed_multiple를 보존. legacy reports만 있으면 normalizeSpecies 이전 원문은 없음. 기존 newline 소실을 복원할 수 없음. |
| 관리자 승인/연결 | admin-actions.js:9,33,43,50,52 | 승인/링크는 보호종 재판정 없이 상태·species·공개좌표·site_id·spot_key 변경 계획. 인증, 승인 및 감사를 제거하지 말아야 함. hide/unhide와 public 좌표는 현재 관리자 결정. |
| pending GET | public.js:221; shared.js:321 | status=pending && pending_public=1 && approx 좌표 존재만 검사. 읽기 때 보호 분류 재검증 없음. canonical의 정확 pending 좌표도 approx_offset=false로 응답 가능. |
| approved GET | public.js:340; shared.js:576 | status=approved 전체를 publicPayload에 전달. public_lat/lon null이면 실제 좌표. 쿼리에 note 없음, 보호 재검증 없음. |
| 독립/연결/fixed 이력 | shared.js:559,576 | 부모 마커 species에 연결 자식 species를 합침. parent locationHidden만 설정. 자식 hidden 및 보호 상태가 부모 좌표 연결 차단으로 이어지지 않음. fixed:site:id도 이력을 그대로 공개. |
| 탐조지별 이력 | public.js:251 | status=approved && site_id만 필터. 좌표는 없지만 siteId, 종, 관찰일, 승인 건수(total)가 나옴. 탐조지 지도/팝업과 연결되므로 “좌표가 없으니 간접 노출 없음”이라는 주석은 강한 보장을 증명하지 못함. |
| recent-sites | public.js:367 | 최근 승인 + site_id + 날짜 + 위치 가림 제외 후 isSensitiveReport. current 19종 정확 표기와 번식 6단어는 제외. 표현 gap은 siteId/latestDate/species 노출과 +16 및 동점 우선순위로 연결됨. |
| 프런트 가점 | index.html:4093,4115,4133 | API literal 문자열을 다시 taxon 분류하지 않음. site.latestDate와 species count로 최대16점. 0점이라도 recentTie가 남음. 보호 행 제외는 union/date/tie 앞에서 해야 함. |
| 승인 제보 검색·지도 | index.html:1059,1595,4574 | approved 반환 spots 및 fixed history로 검색 목록을 만들고 공개 좌표를 사용. hidden이면 spot 카카오 길안내를 감춤. 보호 판정 자체는 서버 flag 신뢰. |
| 현장소식 등록 | field-updates.js:97,217 | 번식6단어는 등록 거부. 19종 exact면 한 번 만든 대략 좌표와 location_hidden=1. 접미사 miss면 실제 좌표. 새 POST는 이번에 호출하지 않고 실제 pure protection 함수를 추출해 판정만 실행. |
| 현장소식 읽기 | field-updates.js:132,152,182,197 | TTL/status 확인 뒤 saved public_lat/lon, note, count, nickname, 시각/확인 수 공개. 보호/번식 재검증 없음. 메모 지명/랜드마크는 대략 좌표 보호를 약화시킬 수 있으므로 향후 정책 필요. |
| 현장소식 길안내 | index.html:5392,5405,5534 | locationHidden=true면 fieldPublicPoint null, 길안내 없음, 지역은 시도까지만. 접미사 miss로 flag=false면 방향 유도 및 외부 길안내 가능. |
| 상태/재접수 응답 | public.js:304; canonical/persistence.js:15 | 상태 자체와 시각은 제보 ID를 아는 제보자의 확인 경로. 종·좌표 없음. 새 정책에선 publicVisibility=approved가 실제 비공개 상태와 모순하지 않도록 정의하고 receipt spot/replay에도 적용해야 함. |
| 월간 참여자 | public.js:406 | 모든 승인 수량에는 민감종도 포함하는 기존 명시적 정책. site/species/좌표는 없지만 공개 이름별 월간 수량은 있음. 이를 위치 집계와 같게 취급하지 말고 별도 위험·정책 판단. |

## 3. 독립 재현 결과

`p1s_protection_current.mjs`는 실제 GET handler와 실제 schema.sql을 Node SQLite :memory:에 적용했다. 48개 입력에 legacy literal 및 현행 normalizeSpecies 저장 모드를 적용한 92개 관찰, 연결 지점 2개, pending 정책 행 6개, 과거 현장소식 3개, 승인 상태 3개를 검사했다. 모든 사전 기대값 검증이 통과했다. 통과는 **현재 결함을 재현한 기대값**까지 포함하며 제품 안전 합격을 의미하지 않는다. 합성 좌표는 결과 JSON에 숫자로 내보내지 않고 실제/대략 일치 여부만 저장했다.

| 입력/조건 | current recent-sites | current field create pure 판정 | 의미 |
|---|---|---|---|
| 저어새 | 제외 | 대략 좌표, 길안내 차단 | 정확 19종 판정 작동 |
| 저어새1 / 저어새 1 / 저어새 2마리 | 포함 | 실제 공개 좌표/길안내 가능 | 허용 수량 표현 gap |
| 흰꼬리수리1 / 매1 | 포함 | 실제 공개 좌표/길안내 가능 | 다른 긴/짧은 보호종도 동일 |
| 저어새,울새 / 저어새;울새 / 저어새·울새 | normalize 후 제외 | 복수 종은 현장소식 입력 거부 | canonical join ` · `일 때 정확 보호종 포착 |
| 저어새/울새 | 신규 정리 거부; legacy literal은 포함 | 신규 거부 | 신규 validation와 과거 저장 읽기 차이 |
| 저어새\n울새 / CRLF | 저어새울새로 붙어 포함 | 붙은 1개 종이면 normal | 제어문자 처리 순서 결함 |
| 둥지/새끼/육추/포란/영소/번식 note | 제외 | 등록 거부 | 기존6단어 유지 |
| 알 2개 / 산란 note | 포함 | 일반 허용 | 현행 목록 밖. 추가는 정책 확장 |
| 둥 지 / 새 끼 note | 포함 | 일반 허용 | 띄어쓴 표현 불확실성 |
| 검은어깨매 / 참새 / 알락할미새 | 포함 | 일반 허용 | 짧은 매/알 substring 보호 확대는 오탐 |
| 위치 가린 저어새1 | 제외 | 별도 row policy | hide SQL은 표현 gap과 독립해 작동 |
| pending/rejected 저어새1 | recent/approved/history 제외 | 별도 상태 | 승인 관문 유지 |

정확 저어새 승인 row의 public 좌표가 없으면 approved GET은 실제 좌표를 사용했고 site-history는 종·siteId·total=1을 반환했다. 이것은 현행 승인 정책의 작동이다.

정확 저어새 hidden row를 일반 부모 점에 link한 경우 자식 종/이력은 부모의 실제 좌표에 합쳐지고 부모 locationHidden은 false였다. 고정 점 link도 fixed history에 protected species가 남았다. hidden 자식이 recent-sites에서 제외되는 것과 독립적이다.

canonical pending fixture는 비번식확인+공개설정에 따른 source 의도를 모사한 raw DB 행이다. 실제 write-mode peer handshake 또는 운영 configuration을 검증한 테스트로 오해하면 안 된다.

## 4. 설계 계약 및 두 대안

**R: 기존 목록 표현 방어**와 **P: 공개 권한 정책**을 분리한다.

R은 목록 19종과 기존 번식6단어를 유지한다. 원문 불변 → NFC 및 허용 구분자 분리 → 전체 표준 이름 대조 → 해당 이름 뒤 명시적 정수 수량/마리/개체 표현 해석 → 보호 분류 순서다. 숫자를 지우거나 짧은 매 부분문자열을 찾지 않는다. 수량이 음수·범위·소수·오류인 입력 및 미해석 종은 taxon 확정 없이 ambiguous로 남긴다. count 검증은 보호 판정과 분리한다. 시제품 종명 내 수량문법은 양의 정수만 해석하며 report는 100000, field는 999 상한이다. 울새0/울새 -1/울새100001은 review 보류하며 울새1000은 report 문법 통과/field 문법 보류다. 별도 입력 birdCount 필드의 canonical 0허용/legacy 1이상/field 1이상 기존 계약을 바꾸지 않는다. 표기 문법 허용과 생태적 관찰 적격 판정은 같은 의미가 아니다.

P는 sensitive 및 uncertain 결과가 실제 좌표·연결 이력·siteId/관찰시각·추천 가점/동점·길안내의 간접 신호로 나가지 않게 하는 정책이다. 보호/미확인 row를 공개 union 이전에 제외하는 즉시 읽기 방어를 우선 권고한다. 현재 protected field의 대략 위치 공개를 계속 허용할지는 별도 선택이며 landmark note, 카운트, site 연결, 타이밍으로 역추적이 안 된다는 추가 조건이 필요하다. 이번 design prototype은 가장 보수적인 row 전체 비공개 조건을 사용했다. 19종 분류가 비번식 여부를 추론한다는 뜻은 아니다.

| 평가 | A. shared classifier + 모든 공개 read 방어 | B. 검증 taxon ID + 구조화 sighting/protection projection |
|---|---|---|
| 안전성 | 현재 저장 문자열을 재판정하고 unknown을 보수적으로 보류. approved/fixed/site/pending/field/replay 전체에 적용해야 성립 | 검증된 taxon 버전, 수량, 보호사유로 명확. unresolved fallback 없으면 legacy gap 잔존 |
| 호환성 | 기존 원본, ID, 승인상태, 좌표는 수정하지 않고 read 제외. JSON shape 유지 가능하나 목록/total/보호 표시 의미는 변함 | 기존 raw/checklist/reviews 보존, 정본 읽기 연계. old reports/canonical rollback alignment 필요 |
| 오탐 | unknown 및 괄호 등 애매 표기 exact 공개가 줄 수 있음. 일반 fixture 측정 및 사용자 검토 필요 | 검증된 명칭 대조로 낮출 수 있으나 catalog 불완전/다국어/미해석은 보류 |
| 변경 범위 | shared, public GET SQL/payload, field read/receipt 및 소규모 frontend 방어 | shared+canonical projection/admin taxon/reviews+API+catalog 운영 |
| Worker/D1 | Worker 수정 필요. 즉시 read 제외는 D1 schema/write 불필요. 모든 신규 legacy 원문 보존까지 포함하면 별도 저장계약 필요 | Worker 수정 필요. 현재 taxa/sightings 테이블은 코드상 존재하지만 운영 유효성 미확인. 보호 정책 버전 저장 방식 선택에 따라 추가 D1 작업 필요 |
| API 계약 | response key 유지하되 필터 적용 total/페이지/visible 의미 변경, 원문 공개 과도 노출 축소 | 기존 shape 유지 어댑터 가능; taxon/protection metadata 새로 공개하면 API 변경 필요 |
| 테스트 | literal/normalized/legacy/linked/all GET의 memory handler 단위 및 pagination 가능 | migration/state/append-only/peer gate/legacy parity/rollback 포함 더 큼 |
| 롤백 | read feature flag/전 릴리스 전환 용이하나 미보호 구버전으로 되돌리는 롤백은 부적절 | schema additive 및 projection/version 교대. raw를 재작성하는 롤백 금지 |

권고는 A를 승인 가능한 작은 구현 단위로 구체화하고 B를 정본 종 분류가 확보될 때 연결하는 것이다. A를 recent-sites만 패치하거나 protected 수량 문자열만 고치는 것으로 축소하면 P 보장을 충족하지 못한다. 원문/수량 파싱은 저장용 normalizeSpecies와 보호용 해석을 분리하여 기존 dedupe hash·원자료·표시 이름을 불필요하게 바꾸지 않는다. 과거 newline 정보가 없어 붙은 이름은 unknown으로 처리하고 복원하거나 강제 동의어를 만들지 않는다.

분석 시제품 `p1s_protection_design_prototype.mjs`는 current48개 사례에 R/P를 각각 적용했다. 보호 count/delimiter/NFC 관련 14사례의 R 판정이 작동하고, 음수/범위/모호 표기는 P에서 정확 공개/가점/연결 이력을 보류했다. 일반 fixture 7개 중 R 오탐은 0개였다. P는 `참새(2)`를 unresolved로 보류해 일반 7개 중 1개 정확공개 축소가 생겼다. 이 수치는 작은 fixture의 처리 결과이며 운영 오탐률이나 taxonomy 품질 추정이 아니다. 시제품의 일반 registry는 fixture5종뿐이며 운영 표준종 사전으로 쓰면 안 된다.

## 5. 정확한 구현 대상 및 테스트 조건

- `shared.js:136`: 줄바꿈을 delimiter로 먼저 처리. raw 불변 계약과 C0 처리 순서를 확정. 기존 save normalizer와 별도 보호 parser가 정확히 어디에 위치할지 구현 전 결정.
- `shared.js:313`: shared structured classification(reason/taxon-confidence/public-policy) 분리. 기존 boolean 어댑터 유지 가능. hidden과 sensitive를 혼동하지 않음.
- `public.js:367`: classifier를 union/latestDate 전 적용. 보호 row의 ordinary co-species도 whole row로 제외하여 위치 연결을 막음.
- `public.js:221,251,340`: note/종/공개좌표 보호 판단에 필요한 컬럼을 SELECT한 뒤 처리. note와 actual 좌표는 내부용이며 응답에 추가하지 않음.
- `public.js:251`: raw LIMIT/OFFSET 후 필터만 하면 페이지당 안전 이력이 부족하거나 raw total이 민감 row 수를 노출함. 보호 row를 제거한 view/filter 후 total 및 limit/offset을 계산하거나 bounded scanning+public offset 계약을 구현해야 함. 성능/전체카운트 정확성은 테스트 필요.
- `shared.js:576`: protected/hidden child를 parent species/history/fixedSpots에 합치기 전에 제외. 부모 자체가 보호이면 마커/자식 링크를 공개하지 않음. 기존 일반 고정점 정본 데이터는 수정하지 않음.
- `public.js:97,304`, `canonical/persistence.js:15`: canonical pending 및 idempotent replay/receipt에도 같은 공개 privacy 판단. non_breeding_confirmed는 저장 적격 확인이며 새 privacy 권한을 우회할 수 없음.
- `field-updates.js:97,132,152,182,197`: field create classifier와 기존 active row read defense를 함께 적용. 공개 note/landmark/count/timestamps/confirm 수 및 hidden mode 정의. 일반 등록자의 삭제권(user_hash)·status/event/TTL 유지.
- `admin-actions.js:9`, `canonical/persistence.js:74`: 관리자 인증/원자료 불변/리뷰 감사 유지. 승인 여부와 공개 권한을 분리; hide/unhide가 강제 privacy를 우회하지 않도록 명시.
- `index.html:4093,4115,1059,1595,5392`: 서버가 안전 공개 계약을 제공하며 frontend는 이를 방어적으로 확인. 숫자 strip로 taxonomy 판정하거나 frontend만 필터하는 방안은 부적절. load failure/old cache에서 stale recent tie/bonus가 남는 경로를 교차 테스트.
- 장기 DB `taxa/sightings/reviews`: 외부 taxonomy 출처/version/accepted ID가 검증됐을 때만 사용. verified species/date/observer/effort를 현재 없는 값으로 생성하지 않음.

필수 테스트: current48 × literal/normalizer; 모든 GET 중 민감 exact/suffix/ambiguous; 승인/pending/rejected; hidden publiccoord null/같음/다름/한쪽결측; protected child normal parent/fixed point link; mixed row의 일반종 동시 위치; history first page 및 offsets(total포함); public response count/date/ID absence; source-normal ordinary controls; field create/read/status/confirm/delete/replay; canonical confirmation true/false 및 protected 표기; 기존126 weekly/API170 및 mobile popup/검색/길안내. 기존 source 테스트의 합성 통과만으로 브라우저 모든 화면 검증 완료를 주장하지 않음.

## 6. 공개 반영 및 롤백 명세

실제 구현은 이번 단계 이후 별도 승인을 받는다. 승인 내용은 R 표현 보정, P 공개권한 변경, 알/산란 keyword 확장 여부, unknown 정확공개 보류, field 대략좌표와 메모 공개 정책, 새 legacy 원문 저장 계약을 따로 확정한다.

운영 배포는 classifier/API read defense가 먼저 안전한 공개 view를 제공하고 프런트 계약 방어를 뒤따르는 순서다. 캐시 TTL 및 frontend recent/site history/approved cache를 새 정책과 맞춘다. 이미 공개된 실제좌표를 매 요청 다시 흔들어 새로운 위치 집합을 만들지 않는다. Worker/Pages/DB 단계와 검증 입력은 승인 후 준비하며 이번에는 실행하지 않는다.

롤백은 민감 보호가 유지되는 마지막 검증된 read 정책으로 전환한다. 안전 결함을 재개방하는 예전 classifier로 되돌리는 것을 정상 롤백으로 승인하지 않는다. raw/reviews/audit/원본좌표는 변경하거나 삭제하지 않는다.

## 7. 남은 불확실성

- 운영 활성 canonical/legacy mode, 기존 protected 표기 빈도, 관리자 공개좌표 판단, 실제 taxonomy catalog의 충실도는 읽지 않았다.
- protected19 리스트는 제품 현행 목록이며 법정/생태학적 모든 보호 대상 목록과 일치한다고 검증하지 않았다. current 목록 유지와 대상 확대를 분리해야 한다.
- 고정 점 3개의 기존 종 목록에는 현행19종 exact 교집합이 없다. 신규 승인 history가 붙는 경로의 보호 누락만 합성 재현했다. 실제 고정점을 수정하지 않았다.
- 숫자·parenthesis·범위·종명 복합의 정책은 표준 taxon 대조 및 오탐 데이터가 필요하다.
- 보호종 명칭만으로 생태상 번식 관찰을 확정하지 않는다.
- 실제 운영 유출 여부/원본 좌표/제보자/날짜별 민감 위치는 조회·복제·게시하지 않았다.

재현 명령:
```
node p1s_protection_current.mjs <repo> <results-dir> 4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57
node p1s_protection_design_prototype.mjs <results-dir>
```
