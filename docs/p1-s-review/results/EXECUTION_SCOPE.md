# 직접 실행 범위

대상 product SHA: 7eb6764a0ea1c1e1ac6b97b3752d14dc05a8ff3e. 모든 source-extraction 시험은 실제 함수를 사용하며 제품 guard를 대체하지 않는다. 저장된 결과는 이전 실행의 스냅샷이다. 미래 실행은 날짜나 새 PR head에 따라 달라질 수 있다.

## 기존 스위트 실행 명령

```powershell
# repo root, 번들 Python 환경
$env:BIRDMAP_PYTHON='C:/Users/김진호/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
node --import ./docs/p1-s-review/scripts/python_runtime_preload.mjs --test .github/scripts/test_weekly_recommendation.mjs
& $env:BIRDMAP_PYTHON -m unittest discover -s .github/scripts -p test_weather.py
& $env:BIRDMAP_PYTHON -m unittest discover -s .github/scripts -p test_tide.py
node --test .github/scripts/test_today_weather_midnight.mjs .github/scripts/test_field_news.mjs .github/scripts/test_report_search.mjs .github/scripts/test_site_history_cache.mjs .github/scripts/test_recent_contributors.mjs .github/scripts/test_notice_kst_date.mjs .github/scripts/test_briefing_kst_month.mjs .github/scripts/test_tide_fallback.mjs .github/scripts/test_data_autorefresh.mjs
$env:CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import ./docs/p1-s-review/scripts/browser_network_isolation.mjs --test .github/scripts/test_notice_close_hit.mjs .github/scripts/test_month_tide_button.mjs
# 각각 reports-api와 weather-proxy 작업 디렉터리에서
node --test
```

Python 조석22건의 skip1은 `test_official_sample_values_match_saved_unchanged_station_forecasts` 실제 test_tide.py:352의 "Official sample dates are outside the rolling monthly window" 조건이다. 공식 과거 표본 날짜와 현재 rolling 자료의 겹침이 없어 비교를 실행하지 않은 것이며 성공으로 세지 않았다.

## 임시 결합 실행

merge-tree cb24c5085f8f297c0197950a756e41d08082dd98 archive를 review-only .scratch/combined에 풀었다. 주간·frontend9파일을 같은 명령으로 실행해242pass, Python50pass 및 조석21pass/1skip였다. node의 relative preload는 extract에 임시 복사했으며 product source에는 적용하지 않았다. today/week validator를 실제 combined JSON에 실행해 exit0였다. source와 JSON hash는 merge_metadata.json에 남긴다. 임시 extract는 stage하지 않는다.

## 한계

현재 validator 성공은 현재 입력이 통과한다는 뜻이다. actual required field가 누락된 합성 today 문서까지 거부한다는 증거가 아니므로 별도 matrix를 사용했다. 547개 회귀 성공과 새 계약 재현 실패를 함께 보고한다. 새 E2E의 API·CAPTCHA·기상 proxy·telemetry는 합성/차단이며 배포 설정이나 physical GPS/외부 내비게이션 시험이 아니다.
