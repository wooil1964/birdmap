# 재개 체크포인트 — P1-C/D 완료, 후속 설계·검증 대기

브랜치: analysis/recommendation-masterplan
작업트리: C:/Users/김진호/.codex/worktrees/recommendation-masterplan/birdmap
시작 체크포인트: 8bd44e3
P1-C 완료: 7447c38102c1832a944d5cf4281ae6ebd3b485b0 (commit/push 후 D 시작)

D 보고 커밋은 이 문서와 p1d 결과를 포함한다. 정확한 최신 SHA는 git log -1 --format='%H %s'로 확인한다. Issue #9 게시 링크는 문서 끝의 receipt에 기록한다.

## 완료된 분석

A 첫 측정, B 새 기상 비교·1,000순열×2·세 동점 대안, C 12가점 정책·12,000목록 독립 대조·집계/보호/null 계약, D 5정책×ON/OFF·10,000순열·1,900후보 행·점수 상한·부족분/계절/축 계약을 완료했다. 처음부터 반복하지 않는다.

P1 정량 비교와 설계 우선순위 초안은 완료다. 생태 최적 배점·정원, 연중성과, 제품 정책 확정, P2~P4, 구현은 미완료다. 보호 입력·유효점수 계약, 근거 설명, A1 재현성을 우선 검토한다. max16·4/3/1/2의 즉시 수치 변경 근거는 부족하다.

## 고정 자료

코드35141c0, 평가2026-10-08T22:40:00+09:00, manifest _snapshots/input_manifest_35141c0_2240.json.
기상 gzip2개, 조석·공지·190곳, 기존 승인 집계11곳을 유지했다.
제보 SHA: af77014b5430d7b15d42dd77de8e4ec2a841e48b5151298a7013e3875c4757b6.
확인 main4fc14b3은 이후 자동 자료 네 파일만 다르다. live와 과거 고정 자료를 혼용하지 않는다.

## 결과·재현

C: p1c_reports/independent/recent_species_contract/aggregation_contract/negative_fixtures/null_score_contract.json.
D: p1d_quotas/independent/contract_audit.json.
종합: p1cd_validation.json, 주간/API/broadJS TAP.

```sh
node docs/recommendation-masterplan/_scripts/analyze_p1c.mjs --write
node docs/recommendation-masterplan/_scripts/independent_p1c.mjs
node docs/recommendation-masterplan/_scripts/p1c_recent_species_contract.mjs
node docs/recommendation-masterplan/_scripts/p1c_aggregation_contract.mjs
node docs/recommendation-masterplan/_scripts/p1c_negative_fixtures.mjs
node docs/recommendation-masterplan/_scripts/p1c_null_score_contract.mjs
node docs/recommendation-masterplan/_scripts/analyze_p1d.mjs --write
node docs/recommendation-masterplan/_scripts/independent_p1d.mjs
node docs/recommendation-masterplan/_scripts/p1d_contract_audit.mjs
```

independent는 stdout 전용이며 결과를 별도 JSON에 보존했다. 나머지는 _results에만 쓴다. Node24(node:sqlite)가 필요하다. C의 합성 null validator만 Python이 필요하며 BIRDMAP_PYTHON 또는 arg4로 경로를 지정한다. 운영 API/D1/POST·외부 요청은 없다.

Windows 회귀:
```powershell
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONDONTWRITEBYTECODE='1'
node --import ./docs/recommendation-masterplan/_scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
$apiTests=@(Get-ChildItem reports-api/test -Filter '*.test.mjs' | ForEach-Object {$_.FullName})
if($apiTests.Count -eq 0){throw 'No API test files'}
node --test $apiTests
```

주간126/API170 통과. broadJS227은 겹치는 시험이며 합산하지 않는다. 이전 B171은 helper1을 포함한다. 옛 local-test/*.test.mjs에는 파일이 없어 바로잡았다. 빈 배열로 node --test를 실행하면 전체 자동발견으로 바뀌므로 Count 검사 필요.
Python48/조석21+1skip은 이전 이력이다. 이번 브라우저·연중성과 검증은 없다.
일부 합성 script sourceHash는 checkout CRLF 기준, manifest는 Git raw 기준이므로 같은 파일도 해시가 다를 수 있다.

## 다음 정확한 작업 — 구현 전 설계

1. 사용자 지시가 추가 분석인지 운영 구현 승인인지 구분한다. 현재 운영 적용 승인은 없다.
2. 보호종의 수량·구분자·줄바꿈·동의어 입력 계약, 원문 보존, 모호 입력 공개 제외 명세를 작성한다. 합성 보호 표현과 weekly null/eligible 모순은 기존 결함이며 실제 운영 유출을 확인한 것이 아니다.
3. 프런트의 number/finite/eligible 관문을 명세한다. 고정10,640sample의 모순 점수0건과 validator 차단을 운영 전체 보증으로 해석하지 않는다. 필수 파고 결측과 비대상 null을 구분한다.
4. 표시점수·내부rank·공지priority·정원축·추천방문일·관찰일의 설명을 설계한다. 장소 최신일과 옛 종 합집합을 오늘의 종 출현으로 표시하지 않는다.
5. A1은 배열 재현성 개선 대조이며 낮은ID 편향은 남는다. cap0과 OFF를 구분한다. max16·4/3/1/2 변경은 보류하고 flex2211/A3는 추가 검증안으로 둔다.
6. P2 문헌·국내 현장자료·종별 관찰일·독립 관찰자·노력량·검증된 서식환경 요구를 조사한다. 연중 holdout과 목적별 평가 지표를 설계한다. 단일10월 자료에서 새 확률을 만들지 않는다.
7. 새 시점 실험은 새 manifest·스냅샷·시계로 저장한다. 정책 간 입력은 동일하게 유지하고 후보 제외/정원 미선발 및 정원/prefix 변경을 분리한다.
8. 구현이 승인되면 별도 기능 브랜치에서 작은 변경, 안전·보호·현장소식·삭제 회귀, 브라우저와 롤백을 검증한다. 배포는 별도 승인 대상이다. 분석 브랜치를 통째로 main에 병합하지 않는다.

main·운영 알고리즘·자동 JSON·Pages·Worker·D1·민감 원좌표 수정·배포 금지.
사용자 승인 없이 ID 동점·가점·정원·보호 parser·유효점수 관문을 실제 운영에 적용하지 않는다.


## 최종 저장·Issue 기록 (2026-10-09)

- P1-C 완료: 7447c38102c1832a944d5cf4281ae6ebd3b485b0.
- P1-D 완료 보고: fae50b289b74a9debae2eff0a820de13890fd73a.
- 두 단계 모두 분석 브랜치에 별도 commit/push했다.
- Issue #9 결과: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6071038439.
- 게시 후 전체 댓글을 다시 조회해 ID와 본문이 저장 요청과 정확히 일치함을 확인했다.
- 최신 확인 main: 4fc14b3c7ba19ad4d5b91efa305a80b3d474dc57. 입력·운영 변경은 없다.
- 이 게시 확인 기록을 포함한 최신 체크포인트는 git log -1 --format='%H %s'로 확인한다.
