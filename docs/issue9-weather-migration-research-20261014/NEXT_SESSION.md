# 재개 지침

현재 브랜치 codex/issue9-weather-migration-research-20261014, 고정 main ae8d9ad42fa11300837645618bc8e91ba5474414.
고정자료와 재현결과는 이 폴더. INPUT_MANIFEST/EVALUATION/recent_sites_sanitized/RESULTS/CASE_REPLAY/PROTECTED_SOURCE_MANIFEST를 먼저 읽는다.
기존 P1-A~D 및 PR24 분석을 반복하지 않는다. 실시간 기상자료와 이번 고정자료를 섞지 않는다.
재현: node docs/issue9-weather-migration-research-20261014/analyze.mjs; node --test docs/issue9-weather-migration-research-20261014/test_models.mjs.
캡처 명령은 재실행하지 않는다(기존 스냅샷 immutable). 분석 결과 재생은 원본입력 변경없이 가능하다.
완료: 후보/점수/ON-OFF/순열/기상입력 대조, 연구52+선발35+주간175+API88+Python60, validator2, JMA시간부분재현.
중간 체크포인트 커밋은 git log에서 `pin weather migration research inputs` 제목으로 확인한다.
미완료: FINDINGS/WEATHER_MODEL_OPTIONS/TYPHOON_SEABIRD_DESIGN/COMPARISON/SAFETY_REVIEW 작성·검토, branch push, Issue9게시.
관측24/48h·기압·상층풍·너울실시간·접근허용·관찰노력 없음. 점수/확률 추가금지. 제품 코드는수정하지않는다.
운영 Worker/D1/Pages/main 변경금지. 별도분석브랜치 push/Issue9 기록만 허용. 제품적용은 별도승인.
테스트가 생성한 .github/scripts/__pycache__/는 미추적이며 커밋하지않는다. 실패로그와 RESULTS-01은 보존한다.
