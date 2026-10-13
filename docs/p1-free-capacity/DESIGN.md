# Workers Free 최소 보완 설계

기준 제품: `c025d75f964ab36f6f2eae541a99461f6de59b70`.
전용 브랜치: `codex/p1-publication-free-capacity`.
최신 main 확인값: `07680616b62771bc0102c8c886e149345c25347e`.
main58 대비 자동 weather/tide 자료 네 파일 변경이며 제품 변경은 없다. main·Worker·Pages·운영 D1·실사용자 자료·요금제는 변경하지 않는다.

## 서버: 물리 조회 위치 힌트만 보관

기존 HEAD의 103행은 singleton 1행과 sqlite_schema 전체 scan 102행이다. 첫 primary 조회에서 필수22개 trigger의 name과 rowid를 발견한다. 이후에도 매번 primary snapshot의 singleton과22개 scalar rowid/name/type 조건을 실제 검사한다. 권한 승인 결과·epoch/revision·trigger 존재를 캐시하지 않는다. 실제 로컬 workerd warm 조회는23행, cold는103행이다. IN 방식은 임시 구조 비용으로45행이어서 선택하지 않았다. D1 PRAGMA schema_version/cookie는 실제 SQLITE_AUTH로 금지돼 사용하지 않는다.

힌트가 어긋나면 폐기하고 새 first-primary session에서 전체 schema 검사를 한다. 자료 API는 이 새 session에서 state와 모든 payload SQL의 원자 batch를 다시 준비·실행한다. 첫 batch의 payload를 나중 guard 검사로 적격 승격하지 않는다. 모든 query/session 수치를 로컬 native D1 binding으로 관찰한다. 같은 세션의 두 번째 query를 primary라고 가정한 초기안은 결함 재현 후 수정했다.

필수22개 DROP, rowid 이동/복구, DB binding 분리, batch 사이 권한 변경을 검사한다. migration·SQL trigger·CAS·deleted terminal·canonical dual-write·공개 좌표 projection은 변경하지 않는다. 기존 name/type 검사보다 더 강한 trigger 본문 fingerprint를 구현했다고 주장하지 않는다. production isolate 수명·지역별 cold 빈도는 미측정이다.

## 클라이언트: 진행 중 요청만 합치고 250ms 먼저 갱신

동일 path와 local generation의 겹친 자료 조회만 합친다. completed 응답이나 positive permission cache는 새로 보관하지 않는다. 초기 pageshow는 이미 진행 중인 bootstrap에 합류한다. BFCache 복원·visibility·권한 변경·오류·만료·mutation은 기존 좌표/팝업/길찾기/동의 UI의 destructive invalidation을 유지한다. 겹치지 않은 초기 승인 조회는 남으며 전부 제거됐다고 보고하지 않는다.

요청 시작 기준5,000ms 상한·first-primary·nonce·fresh postflight·route/GPS 직전 fresh 검증·unknown fail-closed를 유지한다. 실제 polling은4,750ms로 앞당기며 5초라고 숨겨 보고하지 않는다. RTT75ms 조건에서는 만료 경계 전에 갱신할 수 있다. RTT+timer 지연이250ms를 넘으면 종전대로 만료·폐쇄·전체 조회한다. lease 상한을 늘려 가용성을 확보하지 않는다. 가상 clock의300ms/jitter 반례도 보존한다.

동일 revision이어도 KST 날짜가 바뀌면 recent/monthly query가 바뀌므로 fresh HEAD가 날짜 변경을 발견할 때 전체 invalidation/refetch한다. field TTL은 기존 fresh server clock과 fieldIsActive로 처리한다. sealed DTO는 검토 대안으로 남기고 구현하지 않는다.

20명 Chrome에서 현장소식만 재수신한 뒤 ready=true가 전체 목록 복구를 가리는 문제가 발견됐다. 별도 needsRefresh를 모든 invalidation에 설정하고 같은 generation의 정상4목록 조회가 모두 true로 완료됐을 때만 해제한다. partial endpoint의 권한 갱신만으로 전체 복구를 완료했다고 해석하지 않는다. 이 최소 수정은 실제 브라우저 수정 전 실패/후 회귀를 별도로 검증해야 한다.

## 용량 및 검증 경계

동일 로컬 합성73제보/3현장소식, 실제 Chrome10/20명65초·75ms 조건과 native workerd endpoint 비용으로 계정 합산1h/8h를 모델링한다. 짧은 실험의 일일 외삽은 실제 하루 이용량이 아니다. 계정 baseline Worker1242/D1read62111/write665는 이전 읽기 전용24시간 관측이며 사용자가 제공한1230 D1쿼리/58000행/496쓰기와 기간·단위가 다르다. 쿼리수를 Worker 요청수로 바꾸지 않는다.

5초 HEAD만20명8h에115,200요청으로 Free100,000/day를 넘는다. 선택4.75초의 HEAD 공칭 약121,264회는 더 많다. SQL 개선만으로 이 하한을 없앨 수 없다. 10분3목록 조회·사용자 상호작용·재복구·cold isolate·다른 Worker를 따로 고려한다. 무료 한도를 넘는 조건은 운영 승인하지 않는다.

기존10/12 고정 JSON의 현재10/13 validator Batch date mismatch는 별도 미해결로 보존한다. 최신main 실제10/13 새배치 통과를 과거 실패의 수정으로 보고하지 않는다. 기존 활성 Worker의 S1-R/B6 부재는 코드 위험이며 실제 이용자 민감좌표 유출 사고의 증거가 아니다. 이번 작업에서 운영 API/private 행을 조회·복제하지 않는다.

## 증거 보존

자동 승인 검토가 기존 비용 assertion을 먼저23으로 바꾸려던 하네스 적응을 통과값 조작 위험으로 거절했다. 해당 변경은 실행되지 않았다. 원형 하네스 실패와 새 독립 관찰 프로브를 함께 보존하며 기대값 변경으로 통과시키지 않는다. Chrome 원형 복구 실패 및 coalescing으로 바뀌는 동시요청 계약은 별도 시험으로 근거를 남긴다.
