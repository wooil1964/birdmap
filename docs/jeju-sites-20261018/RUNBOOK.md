# 제주 확장 운영 반영 런북 (2026-10-19, 211 포함 개정)

**반영 범위**
- 전국 206곳(기존 200곳 + 206~211), 제주 17곳.
- 신규 6곳:
  - 206 북촌포구·다려도 육상 조망
  - 207 천지연폭포·공식 산책로(겨울 자동추천 제외)
  - 208 한라생태숲
  - 209 제주곶자왈도립공원
  - 210 비자림
  - 211 종달리해변(해맞이해안로 바다 쪽 올레21 보행로 조망)
- 반영하지 않는 곳:
  - 비양도: 보류(추가 발굴 대상).
  - 수산저수지·쇠소깍: 보류.

**원칙**
- 단계마다 결과를 보고하고 별도 승인을 받은 뒤 다음 단계로 간다.
- 기존 200곳, 시크릿, 운영 제보는 바꾸지 않는다.

## 0. 공통 사전 조건

1. 소스 브랜치 `review/jeju-expansion-20261018`를 최신 `origin/main`에 rebase하거나 merge한다.
   - 2026-10-19 기준 `main`의 추가분은 자동 기상·조석 커밋뿐이라 코드 충돌이 없다.
2. 다시 시험한다(로컬 또는 CI `publication-security-ci`).
   - 프런트·API·Worker·Python 전체, 190곳 고정 비교, native D1·ops-local, Chrome 4종.
3. 이 문서의 명령은 `wrangler@4.149.0`, 로그인된 운영 계정 기준이다. 토큰·시크릿은 출력하지 않는다.

## 1단계 기상 Worker `birdmap-weather-proxy`

**배포 명령**(`weather-proxy/`에서):
```
npx -y wrangler@4.149.0 versions upload --tag jeju-206-211 --message "<소스 SHA>"
npx -y wrangler@4.149.0 versions view <새 버전 id> --json
npx -y wrangler@4.149.0 versions deploy <새 버전 id>@100% --message "jeju 206-211" -y
```
- `versions upload`는 트래픽을 받지 않는다.
- `versions view`로 바인딩을 확인한다. `ENVIRONMENT=production`, secret `KMA_SERVICE_KEY`, compat `2026-07-03`이어야 한다.

**성공 기준**
- 운영 `GET /weather?siteId=` 응답:
  - 1·205·206·207·208·209·210·211 → HTTP 200, `ok:true`(`status` ok 또는 partial).
  - 212 → 404 `INVALID_SITE_ID`.
- 기존 ID의 응답 형식이 배포 전과 같다.

**사전 검증 결과**
- dry-run 번들은 운영 기준(f034164)과 `SITES` 한 줄만 다르다. 기존 200개 값은 그대로다.
- 로컬 라우팅에서 206~211은 수락되고 212는 거부된다.

**복구**
```
npx -y wrangler@4.149.0 versions deploy 76c6023b-7974-4a49-928e-1014135bad4b@100% -y
```
- 76c6023b는 현재 운영 버전이며 버전 목록에 보존돼 있다.

**단계 사이 상태**
- 운영 Pages는 200곳만 요청하므로 영향이 없다.

## 2단계 GitHub Pages(`main` 병합)

**배포 명령**
1. 브랜치를 push한다.
2. PR을 만든다.
3. CI `publication-security-ci`가 성공했는지 확인한다.
4. merge commit으로 병합한다. Pages는 `main`에서 자동 배포된다.
5. 병합하면 `update-weather.yml`이 `index.html`·`sites.js` 경로 변경으로 자동 실행돼 206곳 기상을 Windy 키로 다시 만든다.

**성공 기준**
- Pages 빌드가 성공한다.
- 운영 페이지에서 다음을 확인한다:
  - 지도 제목 206개 권역, `siteData.length===206`.
  - 206~211 검색·마커·프로필·카카오맵·티맵.
  - `/sites/208~211/`, `/share/208~211/`, `share/og/208~211.png`가 HTTP 200.
  - `sitemap.xml`에 신규 4 URL.
- 다음 기상 실행에서 `weather_today.json`·`weather_week.json`이 `siteCount=206`이고 validator 2종을 통과한다.
- 실제 Chrome PC·모바일에서 확인한다.

**단계 사이 상태**
- 첫 기상 실행 전까지 206~211은 `기상 자료 없음`으로 표시되고 추천에서 빠진다(결측 안전 경로).
- 관리자 승인 화면에 206~211이 보이지만, D1 반영 전에 선택하면 `SITE_ID_UNKNOWN`(400)으로 거부된다. 데이터 손상은 없다.
- 공개 제보는 `site_id`를 null로 저장하므로 영향이 없다.
- 3단계 전까지 206~211을 승인 제보에 연결하지 않는다.

**복구**
1. `git revert -m 1 <병합 커밋>` PR을 만들어 병합한다.
2. 기상 Workflow가 경로 변경으로 다시 실행돼 200곳 자료로 돌아간다.
3. 1단계 Worker는 그대로 두어도 된다(206~211 항목은 쓰이지 않는다).

## 3단계 운영 D1 `birdmap-reports` `sites` 206~211 추가

**도구**
- `registry-ops.mjs`: 쓰기는 `reports-api/tools/d1-rest.mjs`의 `write()`를 거친다. `PHASE2E_PRODUCTION_WRITE_APPROVED=<운영 DB id>`가 없으면 거부한다.
- `append-registry.sql`, `rollback-registry.sql`.

**백업(실행 직전, 모두 읽기)**
```
npx -y wrangler@4.149.0 d1 time-travel info birdmap-reports --json      # bookmark 기록(보존 30일)
node docs/jeju-sites-20261018/registry-ops.mjs plan <target.json> <plan.json>
npx -y wrangler@4.149.0 d1 export birdmap-reports --remote --output <날짜>-pre-jeju.sql
```
- `registry-ops plan`은 다음을 수행한다:
  - 200행 전체 스냅샷과 206~211 계획 행을 plan 파일에 저장한다.
  - append 조건을 실제 매개변수로 읽기 전용 SELECT로 검사한다.
- `d1 export`는 선택이다. 실행 중 DB 요청을 막으므로 저사용 시간대에 실행한다.
- 표별 행수도 기록한다(`reports`, `checklists`, `field_updates` 등).

**적용**
```
PHASE2E_PRODUCTION_WRITE_APPROVED=<운영 DB id> node docs/jeju-sites-20261018/registry-ops.mjs apply <target.json> <plan.json>
```
- 실행 직전 generation과 200행 해시가 plan과 같아야 진행한다.
- SQL은 단일 문장이다. 조건이 하나라도 다르면 `REGISTRY_PRECONDITION_FAILED`로 전체 중단된다.

**성공 기준**
- `sites` 206행.
- 기존 200행 해시가 plan의 `snapshotSha256`과 같다.
- 206~211이 plan의 `newRowsSha256`과 같다.
- `reports`·`checklists`·`field_updates` 행수는 실행 전과 같거나, 정상 신규 제보만큼만 늘었다.
- 관리자 화면에서 206~211을 선택해 저장할 수 있다.

**선택적 롤백(기존 제보 보존)**
```
PHASE2E_PRODUCTION_WRITE_APPROVED=<운영 DB id> node docs/jeju-sites-20261018/registry-ops.mjs rollback <target.json> <plan.json>
```
- 206~211 여섯 행만 지운다. 다음 조건을 모두 만족할 때만 실행된다:
  - generation 일치, NORMAL 상태.
  - 여섯 행이 plan과 바이트 동일.
  - 이 ID를 가리키는 `checklists`·`reports`가 0건.
- 다른 표와 기존 200행은 건드리지 않는다.
- 참조 제보가 이미 있으면 거부된다. 그때는 행을 그대로 두고, 노출이 문제면 2단계 Pages 되돌림으로 지도에서만 내린다.
- Time Travel restore는 bookmark 이후의 모든 제보·승인·현장소식을 되돌리므로 마지막 수단이다.

**사전 검증 결과**
- native local D1 18/18:
  - 실패 조건 7종, 기존 200행 동일, 재실행 거부.
  - 선택적 롤백의 거부 3종(stale·행 변경·제보 참조), 성공 시 제보·현장소식 불변, 반복 실행 무변경, checklist 참조 시 거부.
- `ops-local.mjs`: plan → apply(206) → 재적용 거부 → rollback(200, 제보 불변).
- 운영 plan(읽기 전용, 2026-10-19 재실행):
  - NORMAL gen 4, sites 200, 스냅샷 200/200 일치(해시 353b97…), 신규 6행, 충돌 0, 참조 0, 쓰기 0.
  - 약 0.6MB 매개변수 바인딩이 REST에서 정상 처리됨.

## 운영 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| 2단계 직후 첫 기상 실행 전 공백 | 206~211 기상 없음·추천 제외 | 결측 안전 경로 시험 통과. Actions 지연(2~5시간 사례)이 있으면 수동 `workflow_dispatch` |
| 운영 Windy 기상 생성 미검증 | 로컬은 Open-Meteo 대체 경로로만 206/206 성공 | 2단계 후 첫 실행 결과·validator 확인을 성공 기준에 포함 |
| 2→3단계 사이 관리자 지정 | `SITE_ID_UNKNOWN` 400 | 3단계 전까지 206~211 지정 금지. 2·3단계 간격을 짧게 |
| D1 plan 이후 generation 변화 | apply가 중단(안전) | plan 다시 실행 |
| 원격 export 중 DB 요청 차단 | 짧은 지연 | 저사용 시간대, 선택 사항 |
| D1 registry 14·107 문구 차이(기존) | 이번 SQL과 무관 | 별도 과제 |
| 현장 조건(운영시간·통제·주차) 변동 | 안내와 실제가 다를 수 있음 | 안내 문구에 방문 전 확인 명시. 현장 답사는 하지 않음 |
| 공유 카드 글꼴 차이 | CI가 재생성하면 기존 카드가 바뀜 | 208~211 카드만 커밋함 |
| 종달리 겨울 AI 방역 통제 | 하도리 철새도래지 통제초소(2026-10-07~, 범위 미공개)가 해안도로까지 미치면 조망 불가 | 안내문에 통제선·안내 준수 명시. 상시 제한으로 분류하지 않음 |
