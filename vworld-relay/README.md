# VWorld 서울 중계 (AWS Lambda, ap-northeast-2)

VWorld는 Cloudflare 출구를 거절한다. 2026-10-25 서울 배치 시험에서 `remote-ICN`으로 실행해도 520이었다. 반면 국내 클라우드는 받아 준다. 같은 날 비공개 Lambda 가짜 키 시험에서 TLS 1.3, HTTP 200, `InvalidParameterValue`/`key`를 확인했다. 그래서 `birdmap-vworld-tiles` Worker는 접근 통제와 limiter를 그대로 맡고, VWorld 호출만 이 함수로 보낸다.

```
브라우저 → Worker (Origin/Referer, limiter 180/300, PNG 검증, SigV4 서명) → 함수 URL (AWS_IAM) → 이 함수 → api.vworld.kr
```

## 패키지

- 파일: `vworld-relay/index.mjs`와 `vworld-tiles/src/worker.mjs`, 같은 상대 경로로 묶는다.
- 핸들러: `vworld-relay/index.handler`
- 런타임: Node.js 22, arm64, 128 MB, 제한 10초

## 인증

함수 URL의 인증 방식은 **AWS_IAM**이다.
- 서명이 없거나 틀린 요청은 AWS가 403으로 막는다. 함수는 실행되지 않는다.
- 호출 권한은 전용 IAM 사용자 하나에만 준다. 이 함수 하나에 대한 `lambda:InvokeFunctionUrl`과, `lambda:InvokedViaFunctionUrl` 조건이 붙은 `lambda:InvokeFunction`이다.
- 함수는 `requestContext.authorizer.iam.userArn`이 `RELAY_INVOKER_ARN`과 같을 때만 처리한다. 계정 안의 다른 주체도 막는다.

## 환경변수(저장 시 암호화)

| 위치 | 이름 | 내용 |
| --- | --- | --- |
| 이 함수 | `VWORLD_API_KEY` | VWorld 키. 이 함수에만 둔다 |
| 이 함수 | `RELAY_INVOKER_ARN` | 호출을 허용할 전용 사용자 ARN |
| Worker | `RELAY_URL` | 서울 function URL만 허용 |
| Worker | `RELAY_ACCESS_KEY_ID`, `RELAY_SECRET_ACCESS_KEY` | 전용 사용자의 키. secret으로 저장 |

Worker는 SigV4로 서명한다. 서명 구현은 AWS get-vanilla 시험 벡터와 curl `--aws-sigv4` 결과로 확인했다.

## 응답

- 범위 안 타일: 검증된 256×256 PNG(base64)
- 그 외: 고정 문구 403/404/405/503
- VWorld 실패: 502 + `X-Tile-Upstream` 고정 분류. Worker는 이 분류를 `relay-` 접두어로 전달한다.

## 운영 설정

- 실행 역할에 권한이 없다. 로그를 남기지 않는다.
- VPC·NAT 없음.
- 예약 동시성은 계정 한도가 허용할 때 설정한다.
- `Invocations` 일 합계 경보: 50,000 주의, 80,000 긴급.
- Budgets 경보.
- 긴급 중지: 동시성 0 + 호출 키 비활성화.

Worker에 `RELAY_URL`과 호출 키가 있으면 Worker는 이 함수만 호출한다. 그 뒤 Worker의 `VWORLD_API_KEY`는 배포 도구 `relay` 단계에서 제거한다.
