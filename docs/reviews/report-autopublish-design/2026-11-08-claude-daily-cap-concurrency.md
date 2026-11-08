# 자동 공개 하루 한도의 동시성 검토와 보완 설계 (2026-11-08, Claude)

> 범위: 분석과 설계만 다룬다. 코드는 바꾸지 않았다. 자동 공개는 OFF라 현재 운영 영향은 없다.
> 기준 코드: main `8597868` — `reports-api/src/autopublic.js` `classifySubmission`, `canonical/persistence.js` `persistQuick`, `public.js` `handleCanonicalSubmit`

## 1. 현재 동작

1. `handleCanonicalSubmit`이 `classifySubmission`으로 판정한다. 판정은 아래 SELECT 한 번으로 오늘(KST) 자동 공개 건수를 센다.
   ```sql
   SELECT SUM(CASE WHEN ip_hash=?1 THEN 1 ELSE 0 END) AS ip, COUNT(*) AS total
     FROM reports WHERE received_at>=?2 AND pending_public=1
   ```
   - `ip ≥ 5`이면 `rate_review`, `total ≥ REPORTS_AUTO_PUBLIC_DAILY_MAX`(기본 50)이면 `global_cap`으로 보류한다.
2. 판정 결과로 `pending_public`, 접수증(`accepted`), 판정 기록(`reviews`)을 만든다.
3. 그다음 `persistQuick`이 한 번의 `db.batch`로 저장한다. 저장 대상: CAPTCHA 사용 기록, reports, raw_submissions, checklists, sightings, reviews.

## 2. 초과가 생기는 경로

판정(1)과 저장(3)이 별도 요청이라, 그 사이에 다른 접수가 끼어들 수 있다.

| 시점 | 접수 A | 접수 B |
|---|---|---|
| t1 | COUNT = 49 → 적격 | |
| t2 | | COUNT = 49 → 적격 |
| t3 | batch 저장(50번째) | |
| t4 | | batch 저장(51번째) ← **한도 초과** |

- 같은 IP 한도(5건)도 같은 이유로 넘을 수 있다.
- 초과 폭은 판정~저장 사이에 동시에 들어온 적격 접수 수만큼이다. 현재 접수 빈도(하루 수 건)에서는 1~2건 수준으로 추정한다.
- 보안 영향: 초과분도 허용 목록·내용 판정을 통과한 제보다. 따라서 보호종 좌표 노출로 이어지지는 않는다. 영향은 "하루 공개량 상한"이라는 운영 정책이 정확히 지켜지지 않는 것이다.

## 3. 보완 방법 비교

| 방법 | 장점 | 단점 | 판단 |
|---|---|---|---|
| **A. 저장 batch 안의 조건 확인(assertion) + 1회 재판정** | 기존 장치(`assertion()` → `transaction_assertions.ok CHECK(ok=1)`) 재사용, 마이그레이션 없음, 접수증·판정 기록·DB가 항상 일치 | 실패한 접수는 저장을 한 번 더 시도 | **권장** |
| B. `INSERT … SELECT CASE WHEN COUNT<cap THEN 1 ELSE 0 END`로 SQL에서 결정 | 재시도 없음 | 접수증·`reviews` 사유·checklists 값을 SQL 결과와 맞추기 어려움(JS가 먼저 만든 값과 어긋날 수 있음) | 비권장 |
| C. 일일 카운터 표 + 조건부 UPDATE | 명시적 | D1 마이그레이션 필요, 카운터와 실제 행이 어긋날 수 있음 | 비권장 |
| D. Durable Object 카운터 | 강한 직렬화 | 새 인프라·배포 대상 추가 | 과함 |

## 4. 권장안 A 상세

### 4.1 저장 batch에 조건 추가 (`pending_public=1`인 접수만)

reports INSERT **뒤에** 다음 두 문장을 넣는다. 기존 `assertion`/`clearAssertion` 함수를 그대로 쓴다.

```js
// 오늘 자동 공개 수(방금 넣은 행 포함)가 한도 이하일 때만 batch 전체가 확정된다.
assertion(db, `autocap:${id}`,
  "(SELECT COUNT(*) FROM reports WHERE received_at>=? AND pending_public=1) <= ?" +
  " AND (SELECT COUNT(*) FROM reports WHERE received_at>=? AND pending_public=1 AND ip_hash=?) <= ?",
  [dayStart, globalMax, dayStart, ipHash, IP_DAILY_MAX]),
clearAssertion(db, `autocap:${id}`)
```

- D1의 `batch()`는 문장들을 순서대로 실행하는 **하나의 SQL 트랜잭션**이다. 한 문장이라도 실패하면 전체가 롤백된다(Cloudflare D1 문서의 batch 설명). 쓰기는 D1 기본 인스턴스에서 차례로 처리되므로, 뒤에 확정되는 batch의 COUNT에는 먼저 확정된 행이 포함된다.
- 따라서 t4의 접수 B는 COUNT가 51이 되어 `ok=0` → CHECK 실패 → **B의 저장 전체가 롤백**된다. reports·원자료·CAPTCHA 사용 기록·판정 기록 모두 저장되지 않는다.

### 4.2 실패 처리 (`persistQuick`의 catch → `handleCanonicalSubmit`)

1. 기존 순서를 유지한다. 재전송 확인 → CAPTCHA 재사용 확인 → 중복 확인.
2. 그 뒤 `pending_public=1` 접수였다면 한도를 다시 센다. 한도에 도달했으면 새 오류 코드(예: `AUTO_PUBLIC_CAP_RACE`)로 구분해 올린다.
3. `handleCanonicalSubmit`은 이 오류를 받으면 같은 요청을 **보류 상태로 다시 만든다.**
   - `pending_public=0`
   - `holdReasons=['global_cap']` 또는 `['rate_review']`
   - 판정 기록 `hold:…`
   - 이 상태로 **한 번만** 다시 저장한다. CAPTCHA 기록도 롤백되었으므로 같은 토큰으로 다시 저장할 수 있다.
4. 보류 상태 재저장은 자동 공개 조건이 없으므로 다시 경합하지 않는다.
5. 그래도 실패하면 기존과 같이 `WRITE_FAILED`(503, 같은 요청으로 재시도 안내).

### 4.3 지켜지는 성질

- 하루 자동 공개 수가 한도를 넘지 않는다(같은 IP 5건도 같음).
- 접수증, `reports`, `checklists`, `reviews`, 원자료의 판정 결과가 항상 일치한다. 원자료 `payload_json.accepted`에는 최종 접수증만 저장된다.
- 재전송: 같은 `request_id`가 다시 오면 `replayQuick`이 저장된 최종 상태로 답한다(변경 없음).
- 스위치 OFF: `pending_public=1`인 접수가 없으므로 이 문장은 batch에 들어가지 않는다. 현행과 같다.

### 4.4 같은 방식으로 함께 볼 수 있는 경합

`possible_duplicate`(같은 종·같은 날·200 m)도 판정 뒤 저장 사이에 같은 경합이 있다. 이것도 같은 방식(조건 확인 + 1회 재판정)으로 막을 수 있다. 다만 SQL 안에서 거리를 계산해야 해서 문장이 복잡해진다. 1차에서는 한도만 다루고, 중복은 관리자 사후 확인에 맡기는 것을 권한다.

## 5. 검증 계획 (구현할 때)

| 검사 | 방법 |
|---|---|
| 경합 재현(메모리 SQLite) | 두 접수를 모두 판정한 뒤 저장 순서를 엇갈려 실행(한도 1) → 첫째 공개, 둘째 보류(`global_cap`), 접수증·DB·판정 기록 일치 |
| 같은 IP 한도 | 같은 `ip_hash`로 5건 공개 후 경합 접수 → `rate_review` |
| 원자성 | 실패한 batch 뒤 reports·raw·captcha·reviews에 흔적이 없음, 재저장 1회 |
| 실제 D1 의미 | CI의 native D1(Miniflare 고정 버전)에서 `Promise.all`로 N건 동시 접수(한도 K) → 정확히 K건 공개 |
| 회귀 | 기존 서버 전체, 독립 보안 행렬, 변이 검사, 스위치 OFF 동일성 |

## 6. 결론

- 현재 초과 가능성은 실제로 있다(코드 주석에도 표시됨). 다만 보안 노출이 아니라 운영 상한의 정확성 문제다.
- 마이그레이션 없이 기존 assertion 장치로 보완할 수 있다. **자동 공개를 켜기 전에** 반영할 것을 권한다.
