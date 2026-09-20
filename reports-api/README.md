# 출현종 제보 API

들뫼 전국 탐조지도의 출현종 제보 접수와 관리자 승인을 담당하는 Cloudflare Worker 두 개다.
기존 기상 프록시(`weather-proxy/`)와는 **완전히 분리**되어 있어 여기서 장애가 나도 기상·조석은 영향을 받지 않는다.

| Worker | 파일 | 주소 | Cloudflare Access |
|---|---|---|---|
| 공개 접수 | `src/public.js` | `birdmap-reports.<계정>.workers.dev` | **걸지 않는다**(로그인 없이 제보해야 한다) |
| 관리자 승인 | `src/admin.js` | `birdmap-reports-admin.<계정>.workers.dev` | **반드시 건다** |

두 Worker 는 같은 D1 데이터베이스를 보지만, 공개 Worker 에는 승인·수정·반려 코드가 아예 없다.

## 엔드포인트

공개 Worker
- `POST /reports` — 제보 접수. 항상 `status='pending'` 으로만 저장된다.
- `GET /reports/approved` — 승인된 제보의 **종과 공개 좌표만** 반환한다.
  제보자 이름·관찰일·개체수·설명·관리자 메모는 응답에 넣지 않는다.

관리자 Worker (모든 경로가 Access JWT 검증을 통과해야 한다)
- `GET /admin` — 승인 화면
- `GET /admin/api/reports?status=pending|approved|rejected|all`
- `POST /admin/api/reports/<id>` — `{"action":"approve"|"reject"|"unpublish"|"merge", ...}`

## 설정 절차 (저장소 관리자가 직접 수행)

이 절차가 끝나기 전에는 제보 기능이 **꺼진 채로** 남는다.
`index.html` 의 `REPORTS_API_URL` 과 `REPORTS_TURNSTILE_SITE_KEY` 가 비어 있으면
제보 버튼이 생기지 않고 어떤 요청도 나가지 않는다.

### 1. D1 데이터베이스

```
cd reports-api
npx wrangler d1 create birdmap-reports
```

출력된 `database_id` 를 `wrangler.public.toml` 과 `wrangler.admin.toml` 의
`REPLACE_WITH_D1_DATABASE_ID` 자리에 넣는다. 그다음 스키마를 올린다.

```
npx wrangler d1 execute birdmap-reports --remote --file=schema.sql
```

### 2. Turnstile (자동 등록 방지)

Cloudflare 대시보드 → Turnstile → 위젯 추가. 도메인에 `wooil1964.github.io` 를 넣는다.
- **사이트키**는 공개값이다. `index.html` 의 `REPORTS_TURNSTILE_SITE_KEY` 에 넣는다.
- **시크릿키**는 저장소에 넣지 않는다.

```
npx wrangler secret put TURNSTILE_SECRET_KEY -c wrangler.public.toml
npx wrangler secret put REPORT_IP_SALT -c wrangler.public.toml   # 아무 긴 임의 문자열
```

`REPORT_IP_SALT` 는 IP 해시용 솔트다. 원본 IP 는 저장하지 않는다.

### 3. 배포

```
npx wrangler deploy -c wrangler.public.toml
npx wrangler deploy -c wrangler.admin.toml
```

### 4. 관리자 Worker 에 Cloudflare Access 걸기

Cloudflare 대시보드 → Zero Trust → Access → Applications → Add an application → Self-hosted.
보호 대상으로 **`birdmap-reports-admin` 의 workers.dev 주소**를 지정하고,
정책은 본인 이메일만 허용하도록 만든다(Emails 규칙).

만든 뒤 애플리케이션의 **Audience(AUD) 태그**와 **팀 도메인**을 `wrangler.admin.toml` 의
`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` 에 넣고, `ADMIN_EMAILS` 에 승인 권한을 줄 이메일을
쉼표로 구분해 적는다. 그다음 관리자 Worker 를 다시 배포한다.

> 세 값 중 하나라도 비어 있으면 관리자 Worker 는 **열리는 것이 아니라 503 으로 닫힌다.**
> Access 가 앞에서 막고, Worker 가 JWT 를 한 번 더 검증한다(이중 확인).

### 5. 지도에 연결

`index.html` 의 아래 두 값을 채우고 커밋한다. 이때부터 제보 버튼이 보인다.

```js
var REPORTS_API_URL='https://birdmap-reports.<계정>.workers.dev';
var REPORTS_TURNSTILE_SITE_KEY='<Turnstile 사이트키>';
```

## 적용한 보안 조치

- 승인 전 비공개: 공개 API 는 `status='approved'` 인 행만 읽는다. 대기·반려 건은 어떤 공개 경로로도 나가지 않는다.
- 권한 분리: 접수와 승인이 서로 다른 Worker·주소다. 공개 Worker 에는 승인 코드가 없다.
- 관리자 인증: Cloudflare Access + Worker 안의 JWT 검증(서명·발급자·대상·만료·이메일 허용 목록).
  비밀번호를 브라우저에 두거나 주소를 숨기는 방식은 쓰지 않는다.
- 자동 등록 방지: Turnstile 토큰을 서버에서 siteverify 로 확인한 뒤에만 저장한다.
- 제출 횟수 제한: 같은 IP 해시 기준 10분 5건, 24시간 20건.
- 중복 차단: 종·좌표(소수 4자리)·관찰일 해시에 UNIQUE 인덱스.
- 입력 검증: 종명 문자 허용 목록, 길이 상한, 국내 좌표 범위, 관찰일 형식·미래·2년 이내, 본문 4KB 상한.
  꺾쇠 문자는 입력 단계에서 막고 출력 단계에서 다시 이스케이프한다.
- 민감지 보호: 관리자가 `public_lat`/`public_lon` 을 따로 지정하면 실제 좌표 대신 그 좌표만 공개된다.
- 개인정보: 원본 IP 를 저장하지 않고 솔트를 섞은 SHA-256 해시만 남긴다.

### 한계

완전한 스팸 차단은 구조적으로 불가능하다. Turnstile 은 사람이 손으로 넣는 허위 제보를 막지 못하고,
IP 기준 제한은 이동통신 공유 IP 와 VPN 앞에서 약해진다.
**실질적인 방어선은 "관리자가 승인하기 전에는 공개되지 않는다"** 이며,
나머지 장치는 관리자가 검토할 양을 줄이는 역할이다.

## 테스트

```
cd reports-api
node --test test/*.test.mjs
```

D1 은 테스트용 대역(`test/helpers.mjs`)을 쓰고, Access JWT 검증은 실제 RS256 키를 만들어
서명·검증 경로를 그대로 지나간다.
