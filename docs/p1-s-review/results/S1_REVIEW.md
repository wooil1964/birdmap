# PR #13 — S1-R 독립 검증

## 기준·결론

- PR head: `7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e`
- 비교 main: `38b45299c832b8ab8ad549762c02979fa8ddfb28`
- 검토 checkout: 별도 PR 검증 worktree, 읽기 전용.
- 판정: **S1-R 범위 승인 가능. 새로운 보호 표현 결함 또는 일반종 회귀는 이번 독립 실험에서 확인하지 않았다.** PR 전체 S2/병합/UI/운영 판정은 root 검증과 합쳐야 한다.

S1-P의 승인 이후 전면 읽기 보호, canonical pending 공개, hidden 자식의 부모/fixed 연결, 알/산란, unknown 정책은 이번 구현에 포함되지 않았다. 현재 승인된 보호 제보의 종·좌표가 approved/history에 남는 동작을 기존과 비교했으며 같은 정책임을 확인했다. 이를 PR에서 새로 도입한 결함으로 집계하지 않았다.

## 실제 코드 감사

`reports-api/src/shared.js:136`에서 LF/CRLF를 C0 제거 전에 구분자로 처리한다. slash를 신규 입력에 허용하지 않았고, 원문 저장 행을 재작성하지 않는다. 관리자 승인 시 입력 종명 정리와 legacy/canonical 신규 저장에서 사용하는 동일 함수에 적용된다.

`shared.js:317–331`의 보호 판정은 전체 종명 exact → 기존 보호종명+정수 문자열(+마리/개체) → legacy 구분자 재분리 순서다. NFC는 판정 view에만 적용한다. 19종 배열 및 번식6단어는 main과 동일하다. 숫자 일괄 삭제, fuzzy taxon 병합, 매/알 substring 확대가 없다.

보호 판정은 수량 유효성 검증기가 아니다. `저어새0`, `저어새100001`, `저어새01`도 알려진 보호종 base를 보수적으로 보호한다. 수량을 DB에 할당하거나 검증된 관찰 수로 해석하지 않았다. 음수/범위/소수/약/류/괄호 등 모호 표현은 기존과 같이 exact 목록 밖이며 S1-P의 보류 계약으로 남는다.

실제 LF 입력은 String.fromCharCode(10), CRLF는 String.fromCharCode(13,10)로 만들었다. 코드 포인트10을 결과에 기록했다. source의 backslash escape를 실제 줄바꿈으로 오해하는 테스트가 아니다. 반대로 literal backslash+n 입력은 validation에서 거부되었다.

## 독립 실행 결과

| 항목 | 검증 결과 |
|---|---:|
| 보호19종 × exact·수량5종 | 95/95 수정후 protected |
| 보호19종 × mixed 구분자4종 | 76/76 수정후 protected |
| 위171건 중 수정전 누락→수정후 보호 | 152건 |
| 일반종/유사문자열 control | 17/17 유지, 오탐0 |
| 기존 번식 키워드 | 6/6 유지 |
| 모호 보호 입력 | 10건 before/after 동일, 정책 보류 별도 |
| 추가 zero/큰수량/선행0/spaceunit/NFD | 5건 보호, count 검증으로 해석하지 않음 |
| 실제 normalizeSpecies 입력 | 8건 LF/CRLF/CR·구분자·slash·literal backslash 검사 |
| 실제 memory GET recent-sites | 18건 before/after 기대 일치 |
| 실제 memory POST legacy reports | 9건 before/after 기대 일치 |
| 실제 memory POST field-updates + 반복 GET | 10건 before/after, 공개점 고정 확인 |
| 실제 field 번식 입력 차단 | 6/6 FIELD_BREEDING_NOT_ALLOWED |
| 실제 admin planAction | 3건 LF/CRLF/신규 slash거부 기대 일치 |
| 기존 approved/site-history 정책 | before/after 동일 |

recent-sites는 count 보호 입력 및 여러 구분자로 혼합된 **행 전체**를 제외했고 일반 row는 그대로 유지했다. SQL 승인/날짜/hidden 정책과 API shape는 바뀌지 않았다. 실제 DB 행은 GET 전후 불변이며 private 필드가 recent 응답에 없음을 확인했다.

legacy 등록의 `저어새1`, `저어새 2마리`, 일반종+LF/CRLF 보호 수량 표기는 main에서 pending_public=1이었으나 PR에서0이 됐다. 승인 전 spot 응답이 없음을 확인했다. 일반 갈매기/알락오리/동박새의 공개 pending 의미는 유지됐다.

현장소식의 보호 수량 표기는 실제 handleRequest POST에서 locationHidden=true와 대략 공개 좌표가 됐다. 두 번 GET에서 동일 공개점이 유지됐고 실제 좌표와 다른지를 boolean으로 기록했다. 일반 controls는 정확 공개 좌표가 유지됐다. 신규 알/산란 문맥이나 모호 표현까지 해결했다고 주장하지 않는다.

관리자 planAction에 실제 LF/CRLF가 있는 종명을 전달하면 저장용 `저어새 · 참새`로 분리됐고 slash 신규 종명은 거부됐다. 관리자 인증·승인/public 좌표 결정 정책은 수정되지 않았다.

## 방법·제약

`pr13_s1_independent.mjs`는 head 실제 모듈을 import하고, main Git 원문 shared/public/field/admin 모듈을 메모리 module URL로 읽어 동일 입력을 실행한다. import 경로만 읽기 대조를 위해 연결했고 제품 파일은 수정하지 않았다. 실제 schema.sql과 helper로 SQLite :memory:만 사용했다.

Turnstile은 정확 siteverify URL의 로컬 mock만 허용했다. 다른 fetch는 오류로 차단했다. 실제 public endpoint/Worker/D1 연결은0이다. 결과 JSON에는 합성 좌표 수치를 기록하지 않고 actual coordinate 여부·공개점 고정 여부만 썼다. 보호 원본 자료·운영 제보·좌표를 조회하지 않았다.

다음 파일을 root 통합 보고에 사용할 수 있다.

- `pr13_s1_independent.mjs`
- `pr13_s1_independent.json`
- `pr13_s1_review.md`

재현:
```
node pr13_s1_independent.mjs <PR-head-repo> <result-directory>
```

## 남은 확인과 권고

1. S1-R unit/API 검증은 통과한다. 신규 production 코드 수정 지시는 없다.
2. PR 테스트에 NFC/실제 CR/수량0·초과상한 conservative 보호를 추가하면 허용 표현 경계를 더 명시할 수 있다. 이 검증에서는 이미 재현했으며 새 taxonomy/count 정책으로 확대할 필요는 없다.
3. 전체 PR 승인 전 S2, merge 시뮬레이션, 자동 JSON 보존, 모바일/PC 합성 API E2E를 root 증거와 합친다.
4. S1-P의 알려진 위험을 완료로 바꾸지 말고 다음 승인 항목으로 유지한다. 보호 원문·DB·관리자 상태를 쓰거나 수정하지 않았다.
