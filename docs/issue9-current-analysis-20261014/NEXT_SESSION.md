# Issue9 분석 재개 지침

이번 최신 main 점수/정렬/제보·보호·계절/최소A/B 분석은 완료했다. 제품 구현은 승인하지 않았다.

- 고정 main 399b2f3ac579e365bd48e611465fb5624ce5d9c4.
- 분석 branch codex/issue9-recommendation-analysis-20261014.
- 작업트리 C:/Users/김진호/.codex/worktrees/issue9-recommendation-current/birdmap.
- 현재 문서까지 포함하는 로컬 체크포인트는 git log -1 --format='%H %s'로 확인한다. 게시 영수증에 분석 완료 커밋을 기록한다.
- 과거 P1A-D·배포검증을 재실행하지 않는다. 먼저 FINDINGS/INPUT_MANIFEST/RESULTS/PROGRESS 및 ISSUE_RECEIPT.json(있으면)을 읽는다.

## 재현 명령

작업트리 root에서 Node24/Python3.12를 사용한다.

```powershell
node docs/issue9-current-analysis-20261014/analyze.mjs
node docs/issue9-current-analysis-20261014/independent_check.mjs
node --test docs/issue9-current-analysis-20261014/targeted.test.mjs
```

기존 자동 회귀와validator 명령은 FINDINGS에 있다. 고정 결과 재현은 runtime.mjs가 Git의 pinned main blob과 저장한 sanitized 집계를 읽는다. capture는 기존 집계가 있으면 거부하므로 실행하지 않는다. 새 main/새 집계는 별도 디렉터리·manifest·clock으로 취득한다. 기존 취득/실패 원문을 덮어쓰지 않는다.

## 완료

190곳, 주간10274표본, 후보174, ON/OFFtop10 및 유형/지역 비율, 실제100배열×2전체추천, A/B비교, 결측/P0/보호표현/반복제보 합성시험, 현재validator,397PASS/0FAIL/1SKIP, 독립173assertions.

## 남은 것과 승인 경계

- A stable-ID 동점 적용은 별도 사용자 구현 승인 필요. A는 배열 의존만 해소하며 낮은ID 편향 해결은 아니다.
- B 동점 분산은 여러 계절/발행시점 자료에서 검증하고 정책 승인을 받아야 한다. 이번OFF지역4→6을 생태 정확도 증가로 부르지 않는다.
- 일반종 수량문자열 정규화/종별 관찰일·노력량·서식환경 모델/cap16·quota4312 변경/주간 최대발행연령/S1-P는 별도 설계·승인 대상이다.
- Chrome/전체 제품CI/운영보안은 이번 분석의 미실행 범위이며 PASS로 표시하지 않는다. 제품 수정 계획이 승인되면 영향 검증을 새 SHA에서 수행한다.
- Issue9 게시를 하지 않았다면 원격 분석branch저장→ISSUE_REPORT.md 게시→댓글전체본문 재조회 일치→ISSUE_RECEIPT 저장을 완료한다. 이미 게시됐으면 중복 게시하지 않는다.
- main병합·Worker/Pages배포·D1쓰기·실사용자자료변경 금지 유지.

## 最終 저장·게시 확인

- 분석 완료/push SHA: 3fe8fa4d7572676f678b2696fad57ebd0e0518cb.
- Issue9: https://github.com/wooil1964/birdmap/issues/9#issuecomment-6161188211.
- 전체 댓글 재조회 후 게시 본문이 전송 문자열과 정확히 일치했다. ISSUE_REPORT/ISSUE_RECEIPT에 보존했다.
- 다음 세션은 중복 게시·현재 완료 시험 반복을 하지 않는다. 사용자 승인 전 제품 적용·운영 변경을 하지 않는다.
