## 읽기 전용 Worker 버전 추가 확인

2026-10-11 07:23 KST 기준, 사용자 지정 `wrangler versions view` 두 건과 `wrangler deployments list --name birdmap-reports`를 Wrangler 4.149.0으로 실행했고 모두 exit 0입니다.

| 버전 | 생성 시각 KST | 확인 결과 |
|---|---|---|
| `494b97d1-69ab-40f7-bbbf-e8c6e3c5effc` | 2026-10-08 14:19:39.572 | 조회 시점 최신 배포, 100% 적용 |
| `16dae92a-4bd7-4fda-ba90-d5075604d4db` | 2026-10-06 23:58:25.144 | 직전 배포 버전 |

표시된 바인딩 설정과 secret 이름은 동일하며 `CANONICAL_DUAL_WRITE`가 유지됩니다. Secret 값은 조회·저장하지 않았습니다.

**현재 운영 Worker 버전 미확인 조건은 해소됐습니다. 최종 판정은 조건부 승인 유지입니다.** 메타데이터에는 실제 코드와 S1-R 검증 연결 근거가 없어, 직전 버전을 보호 유지 rollback 대상으로 승인할 수는 없습니다. 보호 유지 rollback·Pages rollback SHA 및 실제 보호 전환/cache 영향 조건은 남습니다.

[검증 문서와 정제 증빙](https://github.com/wooil1964/birdmap/blob/bd1283c3f15461c90199bda0ba8cbbbc54967070/docs/p1-s-review/F23_RECHECK.md)에 기록했습니다. 제품 코드 변경·main 병합·배포·rollback·D1·실사용자 데이터 변경은 수행하지 않았습니다.