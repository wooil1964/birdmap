# 최소 읽기 전용 PR CI 제안

root만 실제 .github/workflows 파일을 수정한다. 이 문서는 제안이며 workflow를 실행하지 않았다.

현재 protected=false/rulesets=[]/requiredchecks off지만 구현 source에 성공한 PR CI 자체가 없다. 기존 update-weather/tide/share workflows는 운영 데이터 commit/push가 있으므로 재사용하지 않는다. 새 workflow는 pull_request/수동 dispatch만, contents:read, secrets 없음, checkout credential 미보존, 운영 URL POST·DELETE/Cloudflare 명령/Pages artifact deployment/기상 updater 실행을 포함하지 않는다. 일반 회귀를 실제 GitHub runner에서 재실행하고 실패나 Chrome 미준비를 skip로 성공 처리하지 않는다.

```yaml
name: Publication security regression
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: publication-security-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
jobs:
  regression:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      PYTHONUTF8: '1'
      PYTHONIOENCODING: utf-8
      PYTHONDONTWRITEBYTECODE: '1'
      WRANGLER_SEND_METRICS: 'false'
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version: '24.18.0'
          package-manager-cache: false
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - name: Require installed Chrome
        shell: bash
        run: |
          chrome=$(command -v google-chrome || command -v google-chrome-stable || true)
          test -n "$chrome"
          echo "CHROME_PATH=$chrome" >> "$GITHUB_ENV"
          "$chrome" --version
      - name: Front regression with actual Chrome
        shell: bash
        run: node --test --test-reporter=tap .github/scripts/test_*.mjs
      - name: Public and admin API, SQLite publication and CAS
        working-directory: reports-api
        run: node --test --test-reporter=tap
      - name: Weather proxy
        run: node --test --test-reporter=tap weather-proxy/test/*.test.mjs
      - name: Python weather, tide and share
        shell: bash
        run: |
          python .github/scripts/test_weather.py
          python .github/scripts/test_tide.py
          python .github/scripts/test_share_pages.py
      - name: Exact normal recommendation signatures
        run: node .github/scripts/compare_p1s_recommendation.mjs b12e20c1b6d856a021898a0c1c9221b30393a221 HEAD
```

현재 share tests의 --check는 artifact를 생성하지 않고 저장본 정합만 검사한다. tide의1skip은 공식 표본일이 고정 rolling window 밖인 기존 범위이며 보안 필수 시험이 아니다. Python 소스는 이 스위트 범위에서 stdlib/ZIP/XML 사용이며 별도 dependency 설치 불필요다. CI의 정확 실행 SHA/merge commit와 root가 검증한 source는 Git blob hash로 대조한다. signature comparator의 JSON 결과는 runner에서 명시적으로 on/off 190/176 및 전체 signature/top10/unsafe0을 assert하도록 작은 검증 wrapper가 필요하다. JSON 생성 exit0만으로 동일 판정을 하지 않는다.

S2 182/21/12, S1R171, 기존 publication Chrome165/새 위험, actual local workerd는 root의 독립 원장으로 추가 입증한다. 기존 Chrome runner는 OUT 경로를 구현 결과 폴더로 쓰며 기존 source script에는 Windows/독립 analysis worktree 경로가 있다. 이 스크립트를 CI에 직접 붙이려면 output/ref/analysis source를 명시적 portable parameter로 먼저 바꾸고 실제 로그와 실패 assertion을 보존해야 한다. 신규 스크립트의 미실행을 CI pass라고 하지 않는다.

현재 날짜 자동 JSON validators를 CI에 포함한다면 실제 생성 배치 날짜가 runner의 KST 현재일과 일치해야 한다. PR 작성 다음 날에 오래된 JSON이 실패하는 것을 날짜 검사 삭제로 우회하지 않는다. 최신 main 자동 자료를 정상 통합하거나 별도 pinned-batch 회귀와 운영 current-batch 검증을 명확히 구분한다. 권장 최소 workflow에는 고정 합성 입력과 생성기 unit tests만 포함하고, 배포 직전 root의 실제 current-batch validator를 별도 필수 관문으로 유지한다.

[setup-node 공식 저장소](https://github.com/actions/setup-node)는 v6의 Node24 runtime 및 package-manager-cache:false 지원을 설명한다. 최신 v7도 있지만 existing repo workflow의 v6 계열과 맞춰 새로운 불필요한 toolchain 변화를 최소화한다. [GitHub token permissions 공식 문서](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)에 따라 least privilege contents:read와 credential 비보존을 사용한다.
