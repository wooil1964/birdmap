# Issue #28 현장소식 통합 개선

현장소식의 공개 반경과 등록자 선택형 출현종 제보 입력을 하나의 변경으로 제공한다. 기준 main은 `79f372f48edee1215ff0d021723051023e9a99b5`이다. 이 문서는 구현·검증·운영 전환 절차를 설명하며 PR 병합이나 Worker 배포가 완료됐다는 증명은 아니다. 실제 배포 결과는 활성 Worker version, PR/CI와 운영 확인 기록으로 별도 확인한다.

## 동작과 보호

- 신규 공개 범위는 문자열 `5 / 10 / 20 / all`, 누락 시 `10`. 잘못된 값은 거부한다. 기존 행은 additive migration의 `all` 기본값으로 공개 범위를 유지한다.
- 일반 GET은 전체 공개 소식만 반환한다. `POST /field-updates/read`는 GPS를 JSON 본문으로 받고 기존 publication contract/nonce/epoch/revision 검증과 같은 primary D1 snapshot 안에서 조회한다. URL에는 GPS를 넣지 않는다.
- 서버는 구면거리와 GPS 오차를 합해 반경을 판정한다. 위치는 유한한 숫자·서비스 권역·오차 1km 이하·30초 이내여야 한다. 실패·권한 거부·느린 응답은 전체 공개만 반환한다. GPS와 조회 이력은 DB에 쓰지 않는다. 응답은 no-store다.
- GPS는 이용자가 제공하는 값으로 조작할 수 있다. 방문 증명이나 엄격한 인증으로 설명하지 않는다. 조회 제한은 IP 해시별 isolate 내부 60회/분, 최대 2,048개 키의 보조 방어다. 분산 요청에 대한 전역 제한을 보장하지 않는다.
- 보호종·위치 가림 소식은 반경 제한 조회에서 통째로 제외한다. 사적 좌표를 거리 판정에 사용하지 않는다. 전체 공개 보호 소식은 기존 고정 대략 좌표/위치 숨김을 유지하고 메모·닉네임·상태 이력 닉네임도 공개 응답에서 가린다. DB 원문은 보존한다. 번식 정보는 등록 거부 및 과거 자료 재판독으로 숨긴다. 보호 위치에는 길안내를 제공하지 않는다.
- 목록 외 상태·확인·타인 삭제와 추측 ID도 거리 제한을 검사한다. 범위 밖에서는 미존재와 같은 404만 반환한다. 등록자 삭제는 기존 device 해시 소유권 조건으로 GPS 없이 가능하다.
- 클라이언트는 명시적인 일회 GPS만 사용한다. 30초, 권한 변경, 숨김, blur, pagehide/BFCache에서 소식·팝업·마커·경로와 늦은 응답을 폐기한다. 기존 길안내 GPS가 새 위치를 알려 주면 접근을 철회할 수 있으나 조회 lease를 연장하지 않는다. 이전 위치의 진행 중 응답도 배제한다.
- 등록 성공 화면, 본인 카드, 로컬 등록 ID만 표시하는 본인 소식 메뉴에서 제보를 선택한다. 초안 조회는 publication 권한과 서버 소유권을 모두 검사하며 읽기만 한다. 저장소 사용이 막힌 브라우저는 메모리 소유권 힌트로 즉시 연동할 수 있다.
- 종명과 최초 관찰 시각을 기존 제보 폼에 채운다. 기존 폼은 날짜만 지원하므로 시각은 참고 설명에도 표시한다. 보호 위치는 초안에서 좌표를 주지 않는다. 일반 위치도 이용자가 다시 확인해야 한다. 비번식 확인·이름 공개 동의·위치 가리기·Turnstile·최종 제출·기존 canonical/운영자 승인 정책을 유지한다. 취소나 초안 조회는 reports를 만들지 않는다. 동시 제출은 막는다.
- 마지막 활동 후 8시간 만료, 상태/확인 이력, 등록자 삭제, 일반 위치 길찾기를 유지한다. 정적 190개 탐조지 좌표·추천·조석·기상 코드는 변경하지 않는다.

## 검증

Node 24의 SQLite 시험과 실제 workerd/Miniflare D1을 함께 사용한다. Chrome은 설치된 실제 브라우저로 실행하며 모바일 화면 크기/터치를 에뮬레이션한다. 합성 GPS·Turnstile·API fixture를 사용하므로 물리 휴대폰 GPS나 실제 CAPTCHA 해결, 카카오/티맵 앱 실행을 인증하지는 않는다. 운영 D1에 시험 소식이나 제보를 넣지 않는다.

| 시험 | 검증 결과 |
|---|---:|
| reports-api 전체, Node SQLite/보안 포함 | 349 통과 |
| 전체 프런트 자동시험, 실제 Chrome 포함 | 445 통과 |
| 신규 통합 Chrome, 344/375/1024/1440px | 70 통과 |
| 기존 publication Chrome | 242 통과 |
| 기존 제보자 통계 Chrome | 135 통과 |
| 신규 실제 workerd D1 | 12 통과 |
| 기존 실제 D1 fence / CAS | 14 / 10 통과 |
| 운영 스키마 재현 Wrangler migration | 11 통과 |

추가 기상/행사 Worker 회귀와 Python 기상·검증기·조석·공유페이지·SEO 검증을 수행한다. 조석 Python의 기존 선택적 시험 한 건은 skip이다. 최종 PR의 전체 CI가 성공해야 운영 변경을 시작한다.

```sh
node --test .github/scripts/test_*.mjs
cd reports-api && node --test
# 저장소 루트, CHROME_PATH는 설치된 Chrome 실행파일
node docs/issue28/chrome.mjs
# CI에 고정한 miniflare@5.20261006.1-alpha의 node_modules 경로
node docs/issue28/native.mjs /path/to/node_modules
```

주요 부정 시험은 5/10/20km 정확 경계·GPS 오차·위조값·잘못된 범위·과거 all 호환, 직접/구 GET·POST·publication·ID 우회, 민감종 오라클·자유문자열 노출, 늦은 GPS/목록 경합·이동·재개·권한 철회, 등록/취소 reports 0건·명시 제출 1건·운영자 대기 정책이다. 본인 메뉴와 저장소 차단도 Chrome에서 확인한다.

등록 직후 본인 소식이 안 보일 때도 소유자 예외나 등록 좌표 재사용으로 공개하지 않는다. 등록 완료 화면에서 선택 범위와 별도 열람 GPS 필요성을 안내하고, 빈 목록·접힌 박스에도 명시적인 주변 조회 버튼을 제공한다. 지도에서 지정한 5km 소식은 GPS 미확인/범위 밖에서 비표시, 범위 안의 새 GPS와 서버 응답 후에만 표시, 위치 만료·blur 후 내용 제거 및 재확인 버튼 유지, 빈 목록의 GPS 거부·중복 클릭·공개 권한 철회까지 실제 Chrome에서 회귀시험한다. 이 화면 수정에는 Worker/D1 변경이 없다.

현장소식은 모바일 전용이다. 기존 주 입력 장치 기준을 박스·GPS 버튼·패널·마커·팝업·길안내 선택창에도 동일하게 적용해 pointer:fine PC에서는 숨긴다. 화면 폭이 넓은 pointer:coarse 폴드·태블릿에서는 유지한다. Chrome 시험은 실제 CSS 미디어 쿼리와 computed style로 PC 비표시 및 넓은 터치 화면 표시를 구분해 확인한다.

## D1 및 운영 전환

`0006_field_visibility.sql` SHA256은 `addd63e875e4e2e01e2d62fd57f83a71c5bd4d71ed63e93e01d37fcee0b4537b`이다. 정확한 파일 하나만 별도 migrations_dir에 복사해 해시를 대조한다. 기존 migration 전체를 운영에 다시 apply하지 않는다. 운영 ledger에는 과거 레거시 파일과 다른 이력이 있기 때문이다.

로컬 Wrangler 시험은 운영 DDL/ledger를 사용자 데이터 없이 재현하고 합성 reports 85건·field 12건을 넣었다. migration 중 CHECK 실패 시 스키마·원래 값·ledger의 전체 원복, 성공 시 기존 20열/정본 값 보존과 all 기본값, 기존 admin schemaReady, FK 0건, 두 번째 apply 완전 no-op을 확인했다.

1. 정확한 후보 SHA의 로컬 시험과 PR CI를 확인한다. main 및 실제 활성 public/admin version, DB/peer/vars/preview 비활성, 데이터 건수·FK·writer claim 0·revision·ledger를 다시 읽는다. Time Travel bookmark를 조회해 기록한다.
2. `public_publication_state`의 예상 epoch/revision/frozen0와 건수/guard를 조건으로 `write_frozen=1, revision=revision+1` CAS를 실행하고 변경 1행을 확인한다. 이 시간에는 현장소식뿐 아니라 제보·운영자 쓰기도 중지된다. system_state나 관찰 자료는 수정하지 않는다.
3. 격리된 0006 하나만 `wrangler d1 migrations apply --remote`로 적용한다. 21열·기존 행 all·writer fence 보존·새 index/guard·기존 insert guard 부재·ledger 단일 추가·FK0·동결 유지를 확인한다.
4. 0006은 기존 publication insert trigger를 동등 의미의 `_scoped` 이름으로 교체한다. 이전 public Worker는 기존 필수 guard를 찾지 못해 공개 조회가 실패해야 한다. 이를 실제 운영 head 503으로 확인한 후 새 검증 source Worker를 100% 전환한다. admin은 변경하지 않는다.
5. 활성 version의 정확한 SHA annotation·DB/peer/필수 vars·preview 비활성 및 실제 API의 기능 marker/TTL8/all-only/no-store를 확인한다. 승인된 CAS로만 thaw한다. 실패 시 동결 유지 및 안전한 동일 보호 source의 maintenance/수정 버전으로 복구한다.
6. Worker 검증 후 PR을 병합한다. GitHub Pages가 main에서 자동 배포되므로 화면을 먼저 병합하지 않는다. Pages build 성공·HTML source hash 일치·실제 Chrome 모바일/PC 운영 조회·등록폼을 확인한다.

거리 제한 행 생성 후 이전 normal Worker로 되돌리거나, guard를 원래 이름으로 복구하거나, down migration·과거 D1 restore를 실행하지 않는다. 삭제/철회/revision을 되돌리지 않는 보호 source 유지가 복구 원칙이다. 새 화면도 등록 직전 서버의 기능 marker를 확인하며 구 Worker에 범위 선택 등록을 보내지 않는다.

## 용량 확인

2026-10-16 21:26 KST의 계정 공식 GraphQL 집계는 UTC 당일 Worker 3,606 요청, D1 168,259행 읽기/269행 쓰기였다. Free 한도 대비 각각 3.606%/3.365%/0.269%이며 집계 지연·샘플링 가능성이 있다. 실제 유료/무료 구독 상태 조회는 권한 403으로 확정하지 못했다. 기존 비용/요금제는 변경하지 않는다.

신규 조회는 D1 쓰기가 없고 기존 publication guard를 유지한다. 공개 범위+활동 시각 복합 index로 전체 공개 조회를 분리한다. 반경 후보는 8시간·20km bounding box로 줄인 뒤 Worker에서 정확 거리를 판정한다. 많은 소식이나 분산 GPS 요청은 추가 읽기/CPU를 유발할 수 있으므로 현재 실측 사용량과 배포 후 오류/사용량을 함께 확인한다. 임의 후보 cap으로 비노출 소식이 공개 소식을 밀어내 존재가 추론되는 방식은 사용하지 않는다.

한도 근거: [Workers 일일 요청](https://developers.cloudflare.com/workers/platform/limits/#daily-requests), [D1 가격 및 Free 한도](https://developers.cloudflare.com/d1/platform/pricing/).
