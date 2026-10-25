# VWorld 서울 중계 (AWS Lambda, ap-northeast-2)

VWorld는 Cloudflare 출구를 거절하고(2026-10-25 서울 배치 시험: `remote-ICN`에서도 520) 국내 클라우드 주소는 받아 준다(AWS 서울 가짜 키 시험 200 XML). 그래서 `birdmap-vworld-tiles` Worker는 접근 통제·limiter를 그대로 맡고, VWorld 호출만 이 함수로 보낸다.

```
브라우저 → Worker (Origin/Referer, limiter 180/300, PNG 검증) → 이 함수 (공유 비밀 헤더) → api.vworld.kr
```

- 패키지: `vworld-relay/index.mjs` + `vworld-tiles/src/worker.mjs`, 같은 상대 경로. 핸들러 `vworld-relay/index.handler`, Node.js 22, arm64, 128 MB, 제한 10초.
- 환경변수(저장 시 암호화): `VWORLD_API_KEY`(VWorld 키는 이 함수에만 둔다), `RELAY_SHARED_SECRET`(Worker의 같은 이름 secret과 동일).
- Function URL(AuthType NONE). 함수는 `X-Relay-Auth` 헤더를 상수 시간으로 비교하고, 틀리면 403을 준다. 경로를 보기 전에 검사하고, VWorld는 호출하지 않는다.
- 응답: 범위 안 타일이면 검증된 256×256 PNG(base64). 그 외는 고정 문구 403/404/405/503, VWorld 실패는 502 + `X-Tile-Upstream` 고정 분류. Worker는 이 분류를 `relay-` 접두어로 전달한다.
- 로그 권한 없는 실행 역할(CloudWatch에 아무것도 남기지 않음), VPC·NAT 없음, 예약 동시성(계정 한도가 허용할 때), AWS Budgets 경보.
- Worker 쪽은 `RELAY_URL`(Seoul function URL만 허용)과 `RELAY_SHARED_SECRET`이 있으면 이 함수만 호출한다. 이 함수만 쓰게 된 뒤에는 Worker의 `VWORLD_API_KEY`를 제거한다(배포 도구 `relay` 단계).
