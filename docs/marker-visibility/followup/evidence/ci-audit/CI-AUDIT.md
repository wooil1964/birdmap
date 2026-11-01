# PR #62 후속 CI 감사

기존 실행: https://github.com/wooil1964/birdmap/actions/runs/41257408265
기존 커밋: `e2112a6bb9ab9cc248c588ebc5edcf71405fbabf`
기준 커밋: `df900110bb21be678e096fa3ded905359105b7ea`

## GitHub에서 실제 실행된 단계

`original-jobs.json`은 GitHub public Actions API에서 읽어 보관한 원본이다. `gps-browser` 작업은 성공했다. `regression` 작업은 Front regression 단계에서 실패했고, 뒤의 단계 8–20은 전부 skipped였다. 즉, 기존 실행의 녹색 GPS 결과만으로 후속 보안 검사를 통과했다고 볼 수 없다.

건너뛴 검사는 지도 전환/타일 오류, 섬 검색, 공개·관리 API/SQLite, Weather proxy, Python/SEO, 추천 서명, 공개/동의 Chrome, 느린 CDN Chrome, 제보자 통계, 현장 기능 은퇴, native D1/CAS, 보호 Pages 패키징 및 artifact 업로드이다. 진단 artifact 업로드만 always 조건으로 성공했다.

## 별도 안전 경로의 재실행

운영 제보 제출·실제 GPS 취득·운영 D1 변경을 하지 않았다. 섬 검색·공개/동의·느린 CDN·통계·현장 은퇴 브라우저 래퍼에서 계측한 운영 요청과 외부 non-GET은 0이다. 지도 장애 검사는 로컬 index.html과 합성 Worker 타일을 사용하며, 제보 조회 실패 콘솔은 별도로 기록한다(운영 요청 0 계측 래퍼와 혼동하지 않음). Native 검사는 고정 버전 `miniflare@5.20261006.1-alpha`와 로컬 메모리 D1, 합성 인증으로 실행했다.

| 후속 검사 | 로컬 결과 |
|---|---:|
| 지도 빠른 전환/타일 장애 전체 | 66 통과·1 실패; wide 불규칙 wheel은 기준에서도 동일 재현 |
| 섬 검색 Chrome | 25/25 통과 |
| 공개·관리 API/SQLite | 371/371 통과 |
| Weather proxy | 36/36 통과 |
| Python 기존 + 새 마커 범위 계약 | 155 통과, 기존 tide 1 skip |
| SEO 동기화 | 194 페이지·196 sitemap URL 통과 |
| 정확 추천 서명 | with/without sightings 모두 일치; exit 0 |
| 공개·동의 Chrome | 147/147 통과 |
| 느린 CDN 1024px Chrome | 31/31 통과 |
| 제보자 lifetime 통계 Chrome | 135/135 통과 |
| 현장 기능 은퇴·일반 제보 Chrome | 60/60 통과 |
| Native D1 registry/fence/CAS/issue28 | 96/96 명시 검사 + 3개 registry ops 스크립트 통과 |
| 보호 Pages 대기 패키지 | 695 파일 로컬 준비 통과 |
| GitHub 보호 artifact 업로드 | 로컬로 대체할 수 없는 업로드 단계; 원래 실행 skipped, 운영 배포 없음 |

Python tide의 1 skip은 공식 표본 날짜가 이동 월간 범위 밖이라는 기존 조건이다. 검사를 삭제하거나 새 skip을 추가하지 않았다.

Native CAS의 첫 실행은 출력 폴더가 없어서 결과 저장에 실패했지만 로직 10건은 모두 통과했다. CI와 같이 출력 폴더를 만든 뒤 정확한 스크립트를 재실행해 exit 0, 10/10을 확인했다(`native-cas-rerun.log`).

## 새로 발견해 바로잡은 계약 검사 회귀

주간 추천 3건과 별개로, 기존 PR의 마커 연결 변경이 과거 HTML 동결 검사의 정확 문자열 경계와 충돌했다. 원래 e2112의 깨끗한 환경 재실행에서 9개 사례가 실패했고(`before-*.log`), 기준 df90011의 해당 32개 사례는 전부 통과했다(`base-*.log`).

수정은 `.github/scripts/marker_visibility_contract.py`가 PR #62에서 검토한 4개 HTML 변경만 정확히 역변환하도록 제한했다. 누락·중복·부분 변경·변조와 알려지지 않은 마커 조각은 거부한다. GPS 검사 변조 사례는 마커 정규화 후 GPS 조각을 검사한다. 전체 HTML이 df90011로 정확히 복원되는지, 보안·좌표·수 변경이 계속 드러나는지를 새 3개 계약 검사로 확인했다. 보안·좌표·데이터 비교를 제거하지 않았다.

## 주간 추천 기존 실패 증거

df90011에서 새로 실행한 주간 검사는 180건 중 177 통과·3 실패였다(`baseline-weekly-rerun.tap`). 수정 작업 트리의 전체 Front regression은 609건 중 606 통과·같은 3건 실패다. `audit-summary.json`의 `sameFailureNames`가 true이며 실패 이름은 다음과 같다.

- 612행: 최종 선발 전 caution 제외 후 같은 축 보충, 점수 하한선 없음 (`0 !== 3`)
- 1799행: R01 G 산림 탐조지는 조석 자료가 없어도 감점 없이 기상 점수 + 출현 가점이다 (`null.rankScore`)
- 1873행: R02 B·E 편집 목록이 없으면 자동 추천 그대로이고, 출현 자료가 없으면 기존 결과와 같다 (예상 ID 목록 대신 빈 목록)

테스트의 `todayKstMonth()`는 모의 가을 월을 사용하지만 `now`를 주지 않으면 `Date`는 실제 11월 1일을 사용한다. 기존 증거와 동일한 계절/날짜 fixture 불일치이며 이 작업에서 추천 구현이나 해당 테스트는 변경하지 않았다.

main 병합·운영 배포·운영 DB 변경은 수행하지 않았다. 로컬 통과 증거와 GitHub 원격 check 상태는 별개로 보고해야 한다.

## 추가 기존 지도 실패

전체 후속 실행에서 `wide wheel_flicks_uneven_per_ip_limit`이 실패했다. 1920×1080의 20초 불규칙 휠 장면에서 VWorld가 유지되어야 하는 기대와 달리 OSM으로 전환되었다. `tilesRequested=129`, `errors=33`, `reason=tile_error`, `locked=true`, `zoom=13`, `flicks=32`, `levels=[12,13]`이다.

전체 검사는 67건 중 66 통과·1 실패로 끝났다(`basemap/result.json`). 기준 df90011에서 같은 장면만 별도로 실행한 결과 PC 통과·wide 실패(1/2)이며 위 상태와 수치가 정확히 같다(`basemap-baseline-uneven-result.json`). 양쪽 페이지 예외는 없고, 통과한 PC와 실패한 wide 모두 제보 조회 Failed to fetch 콘솔 2건이 있다. 현재 코드의 같은 단독 재실행은 2/2 통과했으며 wide 타일 요청 90·오류 0이다(`basemap-current-uneven-result.json`). 즉, 기준에서도 재현되는 시점/부하에 민감한 기존 지도 동작/검사 실패를 추가로 발견한 것이다. 전체 첫 실패 증거를 유지하며 주간 3건만이 유일한 전체 검사 실패라고 보고하지 않는다. 관련 지도 구현은 이 작업에서 수정하지 않았다.
