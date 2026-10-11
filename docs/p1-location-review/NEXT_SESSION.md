# 다음 세션 재개

독립 검증용 Draft PR: https://github.com/wooil1964/birdmap/pull/16

초기 게시 head: `2556a20ca249703e3637b2ce5c83a04097f8b552`. 제품 commit은 d3이며 이후 제출 receipt만 추가한 문서 commit이 있으므로 최신 PR head를 다시 고정한다. 게시 본문을 읽어 재확인했고 Draft 상태/충돌 없음이 확인됐다.

## 먼저 확인

1. 이 문서, FINDINGS.md, TEST_AUDIT.md와 results/execution_manifest.json을 읽는다. 완료한 P1-A~D·PR13 전체 분석을 반복하지 않는다.
2. `git fetch origin` 후 원격 main 및 Draft PR의 정확한 head를 고정한다. 이번 기준 main은 `43bff43301d5915a344bf2c20987698597cf8870`, 제품 체크포인트는 `d3efe218ad99f97d8ae6d494031b42e4bdac7ec8`이다.
3. 새 branch는 `codex/p1-location-protection-main-20261011`. 원 `fix/p1-location-protection-stale-guards` f27과 PR13 b12는 변경하지 않았다. 게시 receipt가 있으면 PR URL/초기 게시 head를 확인하고 최신 head와 구분한다.

## 완료 및 남은 일

main 재적용, 티맵/카카오 보존, 원 신규19 및 popup1, 7 mutation, 정상 Chrome5폭75, 보안 variants7, PR13 임시결합/full642, 고정190/176·signature 비교를 완료했다. 기존 실패 assertions·환경 실패·최초 하네스/fixture 오류의 증거를 지우지 않는다.

**전면 보호의 운영 승인 조건은 미충족**: 승인 가림/철회 뒤 더 늦은 요청의 과거 public payload, 다른 기기 삭제 뒤 과거 field 목록, 새로고침 뒤 보호 기억 소실의 4개 보안 속성이 실패한다. Chrome ledger의15 unsafe 재현은 정상75 통과와 별개다. payload 권한 revision/철회·캐시 freshness의 서버 계약을 먼저 설계·승인받아야 한다. 단순 요청 순번·클라이언트 저장만으로 해결됐다고 판정하지 않는다. S1-P 정책은 별도 승인 범위다.

독립 검증자는 MAIN_DIFF.patch, index.html의 reportResponseCurrent/loadApprovedReports/fieldGuardIncoming/fieldMarkerSignature/fieldGuideTarget/fieldRemoveLocal을 우선 읽고 같은 페이지 방어와 서버/새로고침 보호를 분리해 판정한다. 기존 main의2 테스트 계약 불일치는 실패로 유지됐고, 보고351/기존9는 범위 미확인이다.

## 재현 명령

Windows PowerShell에서 Node24, 설치 Chrome의 CHROME_PATH, 지정 Python PATH 및 PYTHONUTF8=1/PYTHONIOENCODING=utf-8/PYTHONDONTWRITEBYTECODE=1을 설정한다. 구체 명령·파일 목록·SHA·exit·카운트는 각 results JSON에 있다.

- `node --test --test-reporter=tap .github/scripts/test_*.mjs` (main 통합:272,270/2/0)
- `node --test --test-reporter=tap .github/scripts/test_location_protection.mjs .github/scripts/test_location_popup_guard.mjs` (20/20)
- `node docs/p1-location-review/scripts/independent_security_variants.mjs --index index.html --out <별도결과파일> --label independent-recheck` (현재3/4, exit1이 기대됨)
- `node docs/p1-location-review/scripts/location_chrome.mjs` (합성API, Chrome5폭, results/browser를 먼저 다른 경로로 보존하여 기존 증거를 덮어쓰지 않는다)
- `node docs/p1-location-review/scripts/source_compatibility.mjs` (script args/상단 refs를 확인하고 현재 새 자료는 별도 저장)
- 원형·mutation 감사: scripts/audit_legacy_scope.mjs 및 mutation_guard_audit.mjs의 CLI를 확인하고 정확 Git archive를 임시환경에 복원해 실행한다.
- PR13 결합은 `git merge-tree --write-tree <검토head> b12e20c1b6d856a021898a0c1c9221b30393a221`; 실제 main을 merge하지 않는다. 결과 tree archive에서 front/reports-api/weather-proxy/Python을 실행한다. 조석은 정확 main workbook blob을 함께 archive해야 한다.
- PR13 고정 비교: 결합 archive의 `.github/scripts/compare_p1s_recommendation.mjs b12e20c1b6d856a021898a0c1c9221b30393a221 <결합tree>`; 시계는2026-10-08 22:40KST.

테스트 재실행은 새 코드/실패/불확실성에 필요한 영향 범위만 수행한다. scratch archive와 Python cache는 커밋하지 않는다. 합성 자료와 공개 site hash만 저장하고 원본 민감 좌표·비밀정보·운영 API raw payload를 저장하지 않는다.

## 권한

다음 단계는 Draft 독립 검증이다. 별도 사용자 운영 승인 전 main 병합, Pages/Worker 업로드·배포·롤백, D1 변경, 실사용자 등록·삭제는 금지한다. PR13을 변경하지 않는다. 전면 서버 정책이나 S1-P를 임의 구현하지 않는다.
