# 진행 기록 — Issue9 최신 main 분석

- 시작·종료 확인 main: 399b2f3ac579e365bd48e611465fb5624ce5d9c4. 최종 원격 확인 2026-10-14 13:46 KST; 동일 SHA였다.
- 작업트리: C:/Users/김진호/.codex/worktrees/issue9-recommendation-current/birdmap.
- 브랜치: codex/issue9-recommendation-analysis-20261014.
- 원래 checkout feat/seo-static-site-pages 및 기존 recommendation-masterplan 증거는 변경하지 않았다.
- AI_WORK_RULES/HANDOVER, 이전 NEXT_SESSION/PROGRESS/P1_DESIGN/DECISIONS를 확인했고 과거 P1A-D 실험을 반복하지 않았다. 현재 main/현재 입력의 독립 재측정이다.
- 현재 추천과 A/B 실제200개 전체 후보 파이프라인(100배열×ON/OFF), 원 selector 대조와 별도173개 불변성/분모 assertions 완료.
- 추천174/190, 후보92점139/174; 상세 RESULTS/FINDINGS/SELECTION_RATIOS.
- 독립 read-only rank/보호/생태 검토 3개 완료. 출력 재집계와 selector prefix 검토는 본 계산과 일치했다. 두 분모(추천축 중첩179 vs 독점174)·취득시각과 재생시각 차이를 보고서에 반영했다.

## 직접 실행한 회귀

- Node C:/Program Files/nodejs/node.exe v24.18.0.
- Python C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe 3.12.
- 환경 PYTHONUTF8=1, PYTHONDONTWRITEBYTECODE=1. BIRDMAP_PYTHON은 위 경로로 지정했지만 weekly의 기존 Python 호출 탐색은 python3/python을 사용한다. 실제 시험은170/170 성공했다.
- weekly170 PASS/0FAIL; reports recent/protection/publication94 PASS/0FAIL; Pythonweather60 PASS/0FAIL; tide21 PASS/0FAIL/1SKIP; new targeted52 PASS/0FAIL.
- 최종 합397 PASS/0FAIL/1SKIP. today/weekvalidator 각각 exit0; 현재10/14 JSON 190/10274.
- 최초 targeted50 PASS/2 FAIL은 새 하네스의 실제 반환필드 오독2건이다. first_run_harness_errors 원문 보존, 두 assertion은 정확한 minutes/sortLevel/tideText/array.length로 수정 유지했다. 제품 수정0.
- independent_check 173 assertions/0failure. 현재190개 siteData/좌표와 보호·nonce/CAS·기상·조석·원제품 소스는 hash/normalized blob 비교 불변.
- Chrome/전체 제품 suite/remoteCI/운영D1·Worker·Pages 검증은 이번 분석에서 미실행. 이전 운영 검증을 이번 실행으로 합산하지 않았다.

## 단계별 증거

1. INPUT_MANIFEST: main·입력 blob/SHA256·함수/원테스트 SHA·siteData/좌표 hash.
2. recent_sites_sanitized: 공개권한 pre/data/post 확인 후 ID/date/count만 저장. 최초 Origin없는요청403, 정상Origin후3 GET성공. 민감 원문 저장0.
3. RESULTS/analysis_run: 원추천·100순열·A/B/190행 결과. 점수/가점/추천일/시각을 분리했다.
4. TARGETED/weekly/reports/weather/tide/validator 로그: 종료코드 TEST_EXIT_CODES.
5. INDEPENDENT_CHECK/SELECTION_RATIOS/COUNTERFACTUALS/SEASON_POLICY_GRID/DATA_DIAGNOSTICS: 독립 분모·추가원인·정책범위.
6. FINDINGS: 확정 측정과 미검증 생태 가설·별도 승인 조건.

## 권한과 범위

변경은 docs/issue9-current-analysis-20261014 안의 분석 도구/합성 테스트/문서/결과뿐이다. main/운영코드/기상원본 JSON/190지점/좌표/Worker/Pages/D1/실사용자 자료 수정0. 공개집계 읽기 외 운영 요청0. 제품 적용·main 병합·배포는 별도 승인 전 금지한다.
