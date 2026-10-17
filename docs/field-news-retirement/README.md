# 현장소식 서비스 종료

2026-10-17 사용자 요청으로 현장소식 전체를 서비스에서 제거한다. 일반 출현종 제보·운영자 승인·기여자·지도·기상·조석은 유지한다.

- 현재 index.html에서 현장소식 버튼·박스·패널·마커·GPS·자동 조회·제보 연동 코드를 제거한다. 기존 브라우저의 현장소식 localStorage 기록은 삭제하거나 제보로 전환하지 않는다.
- Public Worker는 기본적으로 `/field-updates`와 모든 하위 경로에 `410 FIELD_NEWS_RETIRED`, `no-store`를 반환한다. 일반 라우터와 publication 라우터 모두 D1·본문·GPS 처리 전에 종료한다. 구 화면도 읽기·등록·상태·확인·삭제·제보 입력 재사용을 할 수 없다.
- 운영 manifest는 `FIELD_NEWS_RETIRED="true"`이다. 테스트 전용 과거 handler/D1 검증에는 명시적인 false fixture를 사용한다. 운영에서 이 값을 false로 바꾸거나 이전 활성 버전으로 되돌리지 않는다.
- 기존 D1 테이블·관찰 기록·publication/fence trigger·migration ledger는 보존한다. 데이터 삭제·down migration·복구를 수행하지 않는다.

현재 화면의 publication·동의·철회·지연 응답·다중 클라이언트 시험을 계속 실행한다. 제거된 현장 UI 전용 시험은 종료 응답/DB 무접근/기존 자료 보존/현재 브라우저 무호출 시험으로 교체한다. 과거 화면이나 과거 커밋을 현재 화면 검증의 대신 사용하지 않는다.

`node docs/field-news-retirement/chrome.mjs`는 실제 설치된 Chrome 344/375/1024/1440px에서 현재 UI·함수 부재, lifecycle 재진입 후에도 현장 API/GPS 호출 0건, 일반 제보의 취소·비번식·CAPTCHA·single-flight를 확인한다. 서버 종료 및 D1 보존은 `reports-api/test/field-retirement.test.mjs`에서 확인한다.

운영 전환은 현재 소스의 전체 시험 → Public Worker 종료 버전 배포 → 구 API의 GET/POST/publication 경로 410 및 일반 제보 읽기 확인 → PR 병합/Pages → 실제 Chrome 확인 순서다. Worker 원격 migration은 없다. 관리자 Worker는 변경하지 않는다. 되돌릴 때도 현장소식이 종료된 보호 소스를 사용한다.
