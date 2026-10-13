삭제·가림·철회된 공개 위치가 과거 API 응답·타이머·GPS 콜백으로 복구되는 경로를 서버 epoch/revision, D1 원자 snapshot/CAS/terminal, 클라이언트 primary 권한·nonce·fresh postflight·요청 시작 기준 5초 만료로 차단합니다. PR13의 추천 안전·S1-R/S2-A와 PR16의 위치 보호 기능을 통합했으며, 승인된 공개 정책과 190개 탐조지 데이터·좌표를 유지합니다.

독립 감사에서 발견한 구 Worker 지연 쓰기를 SQL writer fence와 원자 transaction claim으로 차단하고, 순차 purge CLI의 부분 삭제 위험을 첫 쓰기 전에 막았습니다. 실제 원격 D1이 거부한 trigger 문법도 동일 의미의 조건부 RAISE로 수정하여 원자 rollback을 재검증했습니다. 비파괴적 canonical seed/backfill과 정상 공개·관리 CAS 경로를 보존합니다.

**Draft / 운영 전환 대기.** 최신 사용자 위임은 수정·병합·배포까지 포함하지만, 비공개 운영 D1의 Git 밖 DPAPI 암호화 백업에 대한 구체적 자료 반출 범위 승인과 실제 복구 증거가 남아 있습니다. 자동 승인 검토가 해당 export를 거부하여 실행하지 않았으며, main·Worker 활성화·Pages·운영 D1·실사용자 변경은 하지 않았습니다. Paid는 실제 인증 계정의 Current plan으로 확인했습니다.

- 제품: 57184029864139fcf8603f34b39b0089c33ba9c5
- 검증 문서: b36cd773069e59d46866c325a4a218b6364341ce
- 통합 main: 6feac41ae485bf16080324e40104de6d7b1ee8e5; 최신 merge-tree 충돌0.
- PR13 b12e20c1 / PR16 24529898 기능 포함. 두 PR 자체를 변경하거나 중복 병합하지 않습니다.

| 독립 재실행 | 결과 |
|---|---|
| 자동 7스위트 | 812 PASS / 0 FAIL / 1 SKIP |
| 실제 Chrome·Leaflet 5폭 | 242/242 |
| native writer fence / actual-handler D1 CAS | 13/13 / 10/10 |
| 실제 원격 합성 migration | 4/4; 최초 실패 원장 별도 보존 |
| SQL 의미 비교 / purge CLI entry | 96/96 / 6/6 |
| 고정 정상 입력 | 190곳·176후보, 제보 ON/OFF 전체 signature·top10·좌표 불변 |

[정확 CI](https://github.com/wooil1964/birdmap/actions/runs/38442910120)의 실제 로그를 확인했고 CI merge6b131c37e47eb53d5cff209769d7b04006f1398c의 tree가 제품과 동일합니다. skip1은 rolling monthly tide window 밖의 과거 공식 표본입니다. Pages artifact11837076250의 388개 runtime asset을 전수 검증했습니다.

보호 rollback용 public/admin normal·maintenance 4개 버전은 실제 업로드됐고 최종 제품과 runtime byte가 일치합니다. 아직 활성화하지 않았습니다. 0004b writer pre-barrier와 0005는 별도 원자 migration으로 적용하며, 구 버전·과거 DB 복원으로 삭제/철회/epoch/revision을 되돌리지 않습니다. destructive purge는 fenced DB에서 미지원입니다. 물리 GPS/native 앱과 실제 운영 권한·캐시 시험은 미실행으로 남겨 둡니다.

[최종 FINDINGS](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/FINDINGS.md) · [실행 원장](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/FINAL_MANIFEST.json) · [재개 지침](https://github.com/wooil1964/birdmap/blob/b36cd773069e59d46866c325a4a218b6364341ce/docs/p1-paid-deployment/NEXT_SESSION.md)
