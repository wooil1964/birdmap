# Validator 시각 계약 최소 수정 완료

- 기준 HEAD: `799ba3c6ba4bd2f62df4666696e0f9e167d02937`
- 제품 수정: `c060f505ab95e5a3854f0e1be77fd8214de6b126`
- 브랜치: `codex/p1-publication-free-capacity`. 원격 main SHA 읽기 확인 `43ac2b60fee9d0f6c72e283837528a7f88d6568f`; 통합·fetch·push·배포하지 않았다.

## 변경 범위와 원인

`validate_weather.py`의 today forecast 날짜 접두사 검사를 실제 날짜/시각 전체 검사로 바꿨다. now를 한 번 취득해 현재 배치 날짜 검사와 발행 미래 검사를 같은 시계로 수행한다. 원래 현재 날짜 assert는 유지했다. 생성시각은 root/item 동일성 확인 후 미래 여부를 검사한다. forecast 대상 시각은 미래여도 거부하지 않는다.

`validate_weather_week.py`의 기존 parse_forecast_time에 두 자리 숫자의 전체 KST 형식 검사를 추가하고 datetime.strptime의 실제 달력/시간 검사를 유지했다. today가 같은 parser를 재사용한다. `24:00`, `16:60`, 미래 today 발행, weekly `16:6`은 모두 거부된다. 입력 유형·잘못된 날짜·접미사도 이 시각 계약에서 거부되며 reference/previous_saved 항목의 기존 보존 정책은 유지한다.

`test_weather.py`의 today fixture는 시험 당일 06시 발행 대신 실제 시험 시각을 분 단위로 사용한다. 새벽에 06시 발행이 미래가 되는 시험 환경 결함을 피하고, forecast 06시 자체는 그대로 둬 정상 미래 예보의 허용도 유지한다. 신규 `test_validator_time_contract.py` 11건은 실제 validate 함수 및 parser를 고정 시계로 호출한다. 제품 JS, 생성기, Worker, D1, 공유 DTO, 공개 정책, 기상 원본 JSON은 변경하지 않았다.

## 수정 전/후 검증

|범위|수정 전|수정 후|
|---|---|---|
|동일 KST 8사례 Python/실제 JS 대조|일치4, 불일치4|일치8, 불일치0|
|신규 Python 11개 method|5 method 통과, 6 method 실패; failure event6/error event4(중첩)|11 pass / 0 fail / 0 skip|
|기존 Python 기상 56건|이전 분석 56 pass 보존|이번 실행 56 pass / 0 fail / 0 skip|
|관련 JS 주간·자정|이번 첫 실행181 pass/1 fail(인코딩)|UTF-8 명시 재실행182 pass/0 fail/0 skip|

수정 전 신규 시험의 error4는 비문자열 forecastTime을 slicing하며 생긴 TypeError/KeyError이며, 하나의 실패 method 내부 subtest다. 전체 건수에 별도 method로 합산하지 않는다. 기존 테스트 assertion 삭제·완화는 없었다. 첫 JS C01 실패는 Python CP949 stdout을 Node가 UTF-8로 읽어 북풍 문자열이 깨진 것이며, 제품/JS assertion 그대로 PYTHONUTF8=1과 PYTHONIOENCODING=utf-8만 지정하면 같은 테스트가 통과한다. 최초 실패 로그도 보존한다. 기존 Chrome 실패2건의 해결로 이 결과를 오인하지 않는다.

자정, 월말, 연말, 윤년/평년, 잘못된 달력 날짜, 같은 날 미래 예보 및 정상 주간 미래 예보를 확인했다. 대조8/8은 저장용 KST 시각 계약 시험이다. 프런트의 ISO+09 확장 입력 지원을 Python 저장 포맷 전체에 새로 도입하지 않았다. 주간 JS 대조는 generatedAt 엄격 parser/non-future 검사이며 전체 추천 알고리즘 비교로 확대하지 않는다.

## 현재 날짜와 과거 원발행 시각은 별도 모드

`modes/MODES.json`에 실제 평가시각·입력 hash·에러를 저장했다.

- 원본 10월12일 today를 현재10월13일 시계로 검증: **FAIL — Batch date mismatch**. 오래된 배치 거부 계약 유지이며 통과로 바꾸지 않았다.
- 원본 week의 현재 모드: PASS.
- 원본 today/week를 원발행 `2026-10-12 16:26 KST` 시계로 각각 검증: 둘 다 PASS.
- 다른 immutable 입력인 저장 main `07680616b62771bc0102c8c886e149345c25347e`의 실제 10월13일07:34 발행 today 배치: 현재 날짜 구조 검증 PASS(190곳). 기존 10월12일 JSON 날짜를 바꾼 자료가 아니다.

과거 구조 검증과 당일 구조 검증의 PASS는 최신 추천 출처/갱신 일정 신선도 또는 운영 배포 PASS가 아니다. 현재 작업트리 기본 today CLI의 오래된 배치 실패는 그대로 남는다.

## 비간섭 및 이전 증거 보존

`INVARIANTS.json`: 기준799의 프런트 전체·reports-api·weather-proxy·원본 JSON·builder·site_data 등430 파일 hash 동일. 권한·nonce·freshpostflight·5초 상한·CAS·철회·terminal 소스 변경0. runtime190곳/ID190 unique, 전필드와 좌표 동일. 기존 DTO 표적32/32, Chrome10/10, 권한 계약8/8의 원장/로그4종 hash 동일. 이 세 결과는 **보존 증거이며 이번 재실행 수치가 아니다**.

## 재현 명령

환경: PYTHONUTF8=1, PYTHONIOENCODING=utf-8, PYTHONDONTWRITEBYTECODE=1. Python3.12, Node24.

```text
python .github/scripts/test_validator_time_contract.py
python .github/scripts/test_weather.py
node --test .github/scripts/test_weekly_recommendation.mjs .github/scripts/test_today_weather_midnight.mjs
```

8대조 재현: 새 output 디렉터리를 만들고 이 폴더의 actual_js_time_contract.mjs를 새 output에 복사한 뒤 `python probe_time_contract.py <worktree> <새 output>`을 실행한다. 원본 JSON은 변경하지 않는다. 모드 검증: `python run_modes.py <worktree> <존재하지 않는 새 output>`; 현재 날짜가 바뀌면 보존한 10월13일 입력도 다시 정상 거부될 수 있다. 실제 시계는 기록과 구별한다. 기존 분석 자료를 덮어쓰지 않았다. 큰 합성 입력 사본·baseline HTML·새 Python cache는 stage하지 않는다.

## 종료와 미해결

승인된 네 시각 검사 보완은 완료했고 제품 커밋으로 저장했다. Load·CI·Workers Free 용량·원형 Chrome 실패2건·운영 갱신 작업은 이번 범위에서 수행하지 않았다. 기존 운영 BLOCKED 유지. push·main·Worker·Pages·D1·실사용자 자료 변경0. 이후 작업은 새 지시가 있어야 진행한다.
