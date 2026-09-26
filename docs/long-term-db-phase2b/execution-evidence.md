# Phase 2B 실행 증거

2026-09-26 로컬 구현과 검증 결과다. [기계 판독 결과/소스 hash](test-results.json), [보존 검사](preservation.json), [A–Z 보고서](README.md)를 함께 읽는다. 운영 D1 인증을 다시 시도하거나 실제 자료를 export할 필요가 없는 단계였으며 Cloudflare 운영 호출은 하지 않았다.

## 최종 결과

| 시험 | 결과 |
|---|---|
| 실제 Miniflare D1 신규 시험 | 32 PASS / 0 FAIL |
| 원본을 보존한 Phase 2A proof 재실행 | 17 PASS / 0 FAIL |
| 기존 reports-api | 106 PASS / 0 FAIL |
| CLI/현재 브라우저 함수 protocol | 5 PASS / 0 FAIL |
| weather-proxy | 36 PASS / 0 FAIL |
| Python offline weather/tide/share | 80 PASS / 0 FAIL / 1 SKIP (81개) |
| 전체 프런트 | 203 PASS / 1 FAIL (204개) |
| 변경 전 HEAD 임시 복사본 프런트 | 동일 203 PASS / 동일 1 FAIL |

실패는 test_weekly_recommendation.mjs:1560의 저장 자료 날짜 가정이다. 2026-09-17 주간 최고 만조 <850cm를 요구하지만 현재 저장 파일은 882cm다. 기존 코드/자료에서도 동일하다. 날씨·조석 기능과 자동 자료를 바꾸지 않았으며 실패를 skip하거나 assertion을 완화하지 않았다. 사용자는 이 기존 실패 1개를 예외로 기록하고 Phase 2B를 완료하라는 선택을 명시적으로 회신했다. 예외는 이 시험에 한정되며 운영 활성화나 Phase 2C 실행을 허용하지 않는다.

## 시험 환경과 격리

Node 24.18.0, Wrangler 4.137.0, Miniflare 5.20260921.0-alpha. 이미 설치된 도구만 사용했다. Miniflare d1Persist=false, 합성 바인딩, loopback 서버로 실제 SQL/batch/FK/trigger를 실행했다. CAPTCHA와 Access JWKS는 합성 stub이지만 서명 검증은 실제 crypto를 쓴다. 예상하지 않은 fetch는 시험에서 오류다.

Phase 2A runner/fixture/model/DDL/config를 바이트 그대로 짧은 Windows Temp 경로로 복사하고 현재 Worker/test/schema/index 복사본과 실행했다. 원래 Phase 2A evidence를 갱신하지 않았다. 원본 runner는 이 격리된 로컬에서 Wrangler migrations apply --local 2회(두 번째 추가 0) 및 SELECT ledger를 수행했다. **운영 migration apply는 0회**다. CLI 자식의 Cloudflare 환경변수는 원본 runner가 제거한다.

5개 protocol 시험의 SQLite는 합성 fixture를 새로 만든 로컬 파일이다. D1 export가 아니며 verify-only 전후 바이트가 같았다. 브라우저 protocol은 실제 inline 함수와 ADMIN_PAGE handler를 VM에서 실행한 시험이다. 새 기능의 전체 DOM/CAPTCHA end-to-end 시험이라고 주장하지 않는다. 기존 프런트 시험은 사전 설치 Chrome headless를 사용한다.

## 재현 명령

저장소 루트에서 실행한다. 이미 통과한 시험은 소스 변경/미해결 원인이 있을 때만 다시 실행한다.

```powershell
$toolchain='C:\Users\김진호\AppData\Local\npm-cache\_npx\d77349f55c2be1c0\node_modules'
node reports-api/local-test/run.mjs $toolchain
node --test --test-reporter=tap reports-api/local-test/protocol-check.mjs
node reports-api/local-test/repeat-phase2a.mjs $toolchain
```

기존 API/날씨 Worker 각각의 폴더에서 node --test --test-reporter=tap을 실행했다. Python은 번들 python.exe로 unittest discover -s .github/scripts -p test_*.py, PYTHONDONTWRITEBYTECODE=1을 사용했다. 프런트는 .github/scripts/test_*.mjs 전체에 node --test를 실행했다. Windows에서는 CHROME_PATH를 설치된 Chrome으로 지정하고 Python 경로를 PATH 앞에 넣되 실패하는 WindowsApps 별칭은 시험 자식 환경에서 제외했다. PYTHONUTF8=1/PYTHONIOENCODING=utf-8로 한국어 출력이 UTF-8로 전달되게 했다. 원본 환경 설정 파일은 바꾸지 않았다.

baseline-regression.mjs는 git ls-files/show/diff/rev-parse만 읽고 추적 파일을 임시 디렉터리에 복사한다. 변경 파일의 HEAD 바이트는 그 복사본에만 적용한다. Git checkout/reset/restore/fetch는 사용하지 않는다.

## 실패 회차와 보완

- 초기 Python/Chrome 경로 오류 및 Python 한국어 인코딩 오류는 시험 자식 환경에서 해결했다.
- 긴 Windows 임시 경로의 로컬 Wrangler internal error는 더 짧은 Temp 복사본에서 재실행해 17/17로 해결했다. 원격 인증 실패가 아니다.
- HEAD 비교 도구의 기본 1MB Git stdout 제한 때문에 큰 index.html이 잘리는 문제가 있었다. 64MB 제한과 정확한 exit 검사로 수정했다. 잘린 복사본의 3개 실패를 최종 결과로 사용하지 않는다.
- sandbox CreateProcessWithLogonW 1909 뒤에는 승인된 개별 로컬 명령으로 검증/문서화를 완료했다. 같은 HTML의 overlay 실패는 정상 프로세스 환경 재실행에서 통과했다. 애플리케이션을 수정해 없앤 실패가 아니다.
- 최종 GitHub 공개 조회는 자동 승인 검토의 사용량 오류로 실행되지 않았다. 종료 시 remote main 최신 SHA는 미확인이다. 시작 때 읽은 SHA 및 종료 시 로컬 origin/main 참조를 혼동하지 않는다.

## 입증한 범위

quick의 confirmation 거부 시 쓰기 0; 중간/후반 실패 시 모든 관찰 테이블 동일; 같은 요청 재시도/변경 conflict; CAPTCHA 검증 동안 다른 요청이 성공한 순서; 공개 철회 뒤 마커 재노출 방지; 관리자 8 action과 22필드 canonical projection 동등성; 값/revision 동일 SELECT; CAS와 순번/이벤트 제약; 일반 UPDATE/DELETE 제한; native purge와 최소 tombstone; 190 ID/좌표/FK; backfill 21건 의미/manifest/부분 상태/registry/날짜; DTO와 maintenance/shadow를 시험했다.

기존 approved 17/rejected 4/site NULL 5/count 1 13/count NULL 8은 합성 21건의 보존 시험 결과다. 실제 운영 건수를 새로 조회한 수치가 아니다. 최종 FK 위반 0, transaction_assertions 0.

## 보존·미검증 범위

시작 기준 파일 487개(기존 추적 462 + Phase 1 13 + Phase 2A 12) 중 의도한 애플리케이션 5개만 변경됐다. 남은 482개 hash 동일. 운영 Wrangler 설정/자동 날씨·조석 JSON/기존 테스트/Phase 1·2A 원본은 그대로다. Git diff --check 통과. main HEAD 동일.

운영 D1 write/remote migration/Worker deploy/maintenance/export/restore/commit/push는 각각 0이다. 운영 DB/배포에 다른 주체의 변경이 없었는지까지 독립 실측하지 않았다. 원격 CAS/changes()/동시성·mixed deployment·동결/drain·Time Travel 복구·백업 purge·legacy purge 정책은 미검증/운영자 결정이다. Phase 2C는 시작하지 않았다.

## Phase 2B 검토 산출물 및 원격 main 읽기 전용 재확인

사용자의 검토용 산출물 요청에 따라 기존 코드/DB/Worker는 수정하지 않고 전체 추적 파일 패치와 파일 목록을 추가했다. Phase 2C는 시작하지 않았다.

- 원격 조회 완료 시각(UTC): 2026-09-26T10:06:37.8128022Z
- 조회 명령: `git ls-remote --exit-code origin refs/heads/main`
- **origin 서버의 최신 main SHA: `15c9b192d2b24faaffb9f44a625dcd43d0e30710`**
- 로컬 HEAD: `d39bf4bf2d7e147b246f867f56567f814eddd4b9` (변경 없음)
- 로컬 remote-tracking origin/main: `6bf58a583391b174ccd15117ddeaef233010e1ee` (갱신하지 않음)
- fetch/pull 없이 원격 refs/heads/main만 읽었다. 위 조회 성공은 앞선 문단의 종료 시 조회 실패/최신 SHA 미확인 상태를 보완한다. 이 시각 이후의 원격 변경을 의미하지 않는다.
- [전체 파일 목록](phase2b-file-inventory.md), [추적 파일 전체 패치](phase2b-working-tree.patch), [미추적 파일 목록](untracked-files.txt)을 생성했다.
- 패치 범위: `git diff --no-color --no-ext-diff --no-textconv --binary --full-index HEAD --`. HEAD 대비 추적 파일의 staged/unstaged 전체 변경을 포함한다. 이번 상태의 staged 변경은 0이다. 미추적 파일 내용은 Git diff에 포함되지 않으며 별도 목록에 기록했다.
- 패치 SHA-256: `ef752dcd1cd47cac61217f521c6e67c1efa5a3354d968430e42e6ebf2070cb29`
- Phase 1/2A의 기존 미추적 25개는 새 Phase 2B 파일로 잘못 분류하지 않았다. 상세 목록은 현재 저장소 기준이며 무시된 로컬 실행 산출물도 별도 구분했다.
- 이번 검토 산출물 작업에서도 코드 변경·운영 D1 쓰기·원격 migration·Worker 배포·commit·push는 모두 0이다.

검토 산출물 최종 검증: 변경 추적 파일 5개, Phase 2B 신규 전달 파일 24개(이번 산출물 3개 포함), 기존 Phase 1/2A 미추적 25개, 현재 일반 미추적 49개. patch 파일은 현재 전체 git diff와 바이트가 같고 untracked-files.txt는 실제 Git 목록과 같다. 이번 요청에서 허용한 문서/산출물을 제외한 기존 590개 파일의 경로+내용 hash 집계가 작업 전후 동일하여 코드와 로컬 DB를 추가 수정하지 않았음을 확인했다.
