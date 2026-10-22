# VWorld 전용 중계 — PR 후보, 미배포

2026-10-22 14:50:43 KST, 사용자가 미등록이라고 확인한 `example.com`의 실제 HTTPS 문서에서 이전 Pages 성공 검사와 같은 개발키를 사용했습니다. 자연 Referer `https://example.com`으로 보낸 **1회 요청이 HTTP 200 / PNG / 256×256**이었고 사용자가 실제 지리 지도를 확인했습니다. **현재 개발키와 검사 조건에서는 등록 도메인 제한만으로 보호하기에 불충분합니다.** 다른 키나 운영키 전환 후 정책까지 일반화하지 않습니다. Pages 성공 16회와 실제 OSM 20개 검사는 반복하지 않았습니다.

상담센터가 직접 연결과 Cloudflare 중계를 허용했다는 사용자 확인에 따라 PR 후보의 기본 전송 경로를 독립 Worker로 바꿨습니다. **실제 Worker 생성·키 업로드·배포·main 병합·운영 DB 변경은 하지 않았습니다.** 현재 후보는 endpoint가 비어 있고 Worker도 비활성 설정이므로 OSM으로 표시됩니다.

## 변경과 보존

`src/worker.mjs`와 `wrangler.toml`은 새 `birdmap-vworld-tiles`만 대상으로 합니다. 기존 reports public/admin, weather, events, D1, 서비스 바인딩, 관리자 secret을 사용하지 않습니다. 같은 Cloudflare 계정의 포함 요청량·청구·플랫폼 장애까지 분리되는 구조는 아닙니다.

브라우저는 공개 `/tiles/{z}/{x}/{y}.png` 주소만 사용하고, Worker는 고정 VWorld HTTPS Base 경로로 변환합니다. 줌 6–19, 정규 정수 x/y, 국내 보기 범위와 교차하는 타일만 허용합니다. 경계 타일은 범위 밖 일부를 포함할 수 있습니다. 임의 URL·레이어·쿼리·키를 받지 않습니다.

Worker 레이어에도 같은 국내 bounds를 지정했습니다. 넓은 PC 초기 화면의 주변 타일 6개가 서버에서 거절돼 정상 지도까지 OSM으로 잠기는 결합 오류를 합성 검사로 재현한 뒤 수정했습니다. 이제 이 타일들을 브라우저가 요청하지 않습니다. 국내 bounds 밖 주변 배경은 비어 있을 수 있고, 중심이 국내 범위를 벗어나면 기존 정책대로 OSM으로 바뀝니다. 실제 배포 후 넓은 PC·휴대전화의 범위 가장자리 표시도 육안 확인해야 합니다.

Origin/Referer는 정확한 Pages origin과 비교하는 보조 통제입니다. 비브라우저의 헤더 위조와 공개 중계 남용을 완전히 막는 인증이 아닙니다. `CF-Connecting-IP`는 Cloudflare가 제공하는 값으로 사용하고 원본 IP를 앱 로그·저장소에 남기지 않습니다. IP별 600/분, 위치별 합계 6000/분은 **초기 제안값**이며 모바일 공유 IP와 실제 요청량에 맞춰 조정해야 합니다. Native rate-limit은 위치별 근사치여서 전 세계 합산·일일 VWorld 할당량을 보장하지 않습니다. 정확한 전역 상한이 필요하면 별도 리소스 설계가 필요합니다. [공식 Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

upstream 헤더와 본문 읽기에 총 8초 제한, 본문 2 MiB 상한, PNG magic/IHDR 256×256/청크 경계·CRC/IEND 검사를 적용합니다. PNG 구조 검사는 지리 내용 판정이나 전체 이미지 디코딩을 대신하지 않습니다. 구조가 정상인 오류 안내 PNG까지 식별하는 보장은 없습니다. 리디렉션은 `manual`로 받고 200 이외 응답을 거절합니다. Workers는 `redirect: 'error'`를 지원하지 않습니다. [공식 Request](https://developers.cloudflare.com/workers/runtime-apis/request/)

재시도·저장소·Cache API·KV·R2·서비스 워커를 사용하지 않습니다. upstream `cache: 'no-store'`, 성공·오류 응답의 브라우저/CDN 저장 금지 헤더를 설정하고 상충하는 upstream 헤더를 전달하지 않습니다. 타일 저장·재배포 캐시 허용 여부는 별도 미확인이므로 캐싱을 활성화하지 않습니다. 애플리케이션 로그와 Workers observability는 꺼 두었습니다. 계정 차원의 로그·플랫폼 내부 처리까지 이 코드가 통제하지는 못합니다. [공식 Fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/)

Worker 오류·429·시간 초과 시 기존 브라우저 정책으로 OSM에 복귀합니다. 실패한 endpoint는 세션 내 잠겨 지도 이동·공급자 재선택으로 요청이 반복되지 않으며 명시적 다시 시도만 해제합니다. **실패 후 키를 브라우저로 전달하는 자동 직접 WMTS 경로는 없습니다.** 직접 모드는 기존 검증 도구 호환을 위해 명시적으로만 남아 있고 운영 권고에서 제외했습니다.

## 운영용 키 공급 검토 — 실행하지 않음

GitHub `VWORLD_API_KEY`와 Cloudflare Worker secret은 자동 공유되지 않습니다. 향후 승인된 별도 배포 job에서 GitHub Secret을 환경 변수로 전달하고, 공식 Wrangler Action의 `secrets` 목록에 같은 이름을 지정하는 방식이 적합합니다. Pages 작업에는 이 secret을 전달하지 않습니다. [Wrangler Action](https://github.com/cloudflare/wrangler-action), [GitHub Secrets](https://docs.github.com/en/actions/concepts/security/secrets)

검토용 연결 모양은 아래와 같습니다. 이는 실행되는 workflow 파일이 아니며, action 버전 고정·정확한 main commit 확인·배포 환경 승인·계정 권한 설정을 마친 뒤 별도로 적용해야 합니다.

```yaml
# Future, separately approved Worker deployment step only.
# A pinned cloudflare/wrangler-action invokes the dedicated config.
with:
  command: deploy --config vworld-tiles/wrangler.toml --var TILES_ENABLED:true
  secrets: |
    VWORLD_API_KEY
env:
  VWORLD_API_KEY: ${{ secrets.VWORLD_API_KEY }}
```

실제 job에는 Cloudflare account ID와 최소 권한 API token도 필요합니다. 현재 계정·token·허용 리소스·namespace 충돌·공유 포함량은 조회하지 않았습니다. 기존 관리자 token을 재사용하지 말고, Cloudflare 권한이 계정의 다른 Worker에도 미치는 범위를 배포 전 확인해야 합니다. secret·명령 추적·전체 예외·upstream URL을 로그로 출력하거나 `.dev.vars`·캐시·아티팩트에 저장하지 않습니다. 소스의 `[secrets].required`는 이름만 선언합니다.

`wrangler secret put`은 새 버전을 즉시 배포합니다. `versions secret put`도 원격 변경입니다. 따라서 이번 준비에서는 어느 쪽도 실행하지 않았습니다. [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

향후 Pages 배포 단계에는 키 대신 아래 **공개 설정**만 staging 산출물에 공급합니다. 추적 설정과 보호용 rollback artifact는 현재의 정확한 빈 설정을 유지합니다. 실행 중인 일반 PR CI에는 실제 secret을 제공하지 않습니다.

```js
window.BIRDMAP_MAP_CONFIG = {
  vworldMode: 'worker',
  vworldTileEndpoint: 'https://birdmap-vworld-tiles.wooil-birdmap.workers.dev/tiles'
};
```

이 주소는 기존 Worker에서 관찰된 계정 subdomain을 바탕으로 정한 **후보 주소**입니다. 해당 호스트의 실제 생성·소유·접속 가능 여부는 아직 검증하지 않았습니다. 프런트는 이 정확한 주소만 허용합니다. 최종 주소가 다르면 코드와 합성 검사를 함께 갱신해야 합니다.

직접 WMTS를 선택하면 GitHub Secret으로 공급해도 결과 파일과 방문자 Network·타일 URL·Leaflet 메모리에는 키가 노출됩니다. 이를 숨겨지거나 비공개라고 표현하지 않습니다. 현재 개발키에서는 도메인 제한이 불충분하므로 직접 방식으로 공개 운영하는 것을 권하지 않습니다. Worker 방식은 VWorld 키를 서버 secret에서 사용하지만 공개 중계 자체의 남용 가능성은 남습니다.

운영키 전환이 같은 키의 승인 상태 변경이면 별도 프런트 키 교체가 필요하지 않을 수 있습니다. 다른 키가 발급되면 GitHub Secret과 독립 Worker secret을 승인된 절차로 함께 갱신해야 합니다. 키 문자열 유지·서버 인증 정책 자동 변경은 공개 문서에서 확인하지 못했습니다. secret 교체만으로 잠긴 기존 브라우저 세션이 자동 재시도하지는 않으므로 새로고침/명시적 재시도가 필요합니다. [VWorld FAQ](https://www.vworld.kr/v4po_brdfaq_s001.do?bodIde=52&pageIndex=2)

## 성능·비용

캐싱을 쓰지 않아 성공한 타일 요청은 각각 Worker 1회와 VWorld upstream 1회를 발생시킵니다. 추가 네트워크 구간·응답 검사가 생기며, 실제 Cloudflare 지연·모바일 데이터·CPU는 미측정입니다. 229곳은 타일 요청 수가 아닙니다. 기존 후보 한 화면의 15개 타일은 실측 사례 한 건이며 월간 요청 예측치가 아닙니다.

현재 Workers Paid는 계정당 월 최소 USD 5, 요청 1000만 건·CPU 3000만 ms 포함, 초과 요청 100만 건당 USD 0.30·CPU 100만 ms당 USD 0.02입니다. 기존 Paid 계정이면 Worker마다 USD 5가 추가되는 구조가 아닙니다. 포함량은 다른 Worker와 공유하며 cache hit도 Worker 요청에는 포함됩니다. 계정의 실제 플랜·사용량은 미확인입니다. [공식 가격](https://developers.cloudflare.com/workers/platform/pricing/)

예를 들어 월 1만 방문 × 방문당 100타일이면 100만 요청, 10만 방문 × 200타일이면 2000만 요청입니다. 후자는 다른 계정 사용을 무시해도 요청 초과분 약 USD 3에 기본료와 CPU 요금이 더해지는 계산입니다. 이는 사용 패턴 가정이며 견적이나 VWorld 할당량 확인이 아닙니다. VWorld 허용 일일/월간 요청 수와 예상 방문·이동량을 확정하기 전 무제한 비용 보호를 주장하지 않습니다.

## 완료와 승인 후 확인할 항목

- 완료: 기존 등록 Pages 16타일·실제 OSM 20개 증거 재사용, 등록 외 HTTPS 1타일 성공, 새 Worker 단위 검사, 실제 Worker bounds 판정을 결합한 PC/모바일 합성 검사 56개, 실제 로컬 workerd/네이티브 제한 검사 7개, Wrangler 4.151.3 `--dry-run` 구성·번들 검사. 실제 키/배포를 사용한 Worker 검사가 아닙니다.
- 승인 후: 계정/후보 호스트/namespace/할당량/서버 호출 인증 조건 확인 → 독립 Worker secret 공급과 제한된 활성화 → 실제 Cloudflare 송신 경로의 Base 타일 및 오류 판정 → 실제 Pages에서 Worker 경로·키 부재·OSM 복귀·성능 확인 → 실제 휴대전화 확인 → 별도 승인된 운영 Pages 전환. 기존 Pages 성공을 다시 직접 요청하는 방식으로 반복하지 않습니다.
- Worker에서 정상 응답을 얻지 못하면 서버 호출 조건을 확인하고 비활성화/OSM을 유지합니다. Pages Referer를 위조하거나 임의 인증 경로로 우회하지 않습니다.
- 최종 승인 전에는 main 병합, 운영 Pages/Worker 배포, secret 업로드 및 운영 DB 변경을 실행하지 않습니다.

## 실제 휴대전화 확인표

아래는 아직 사용자가 실제 Android Chrome/iPhone Safari에서 확인해야 합니다. 브라우저 크기·터치 에뮬레이션 통과와 구분합니다.

- Wi-Fi와 이동통신에서 첫 표시, 이동·확대·축소, 한반도/제주/도서 지역, 가로·세로 회전과 작은 화면의 버튼 겹침·44px 터치 접근.
- 검색·필터·추천 후 마커/팝업 유지, 맛집·숙박·KSA, 네이버·카카오·Windy·eBird 및 길찾기 앱 전환·복귀.
- 기상·오늘 적합도·내일 예보·조석, 출현종 제보 화면과 위치 선택·취소. 검사용 제보를 운영 서버에 실제 제출하지 않습니다.
- 보호종 상세 좌표가 공개 화면·공유 링크에 나오지 않는지, 위치 숨김·비번식 확인 정책, 위치 권한 허용/거절 시 화면 유지.
- 운영자와 조율한 장애 검사에서 OSM 복귀 안내, 연속 자동 재시도 없음, 명시적 재시도, 저장된 OSM 선택 유지. 완전 오프라인에서는 OSM도 네트워크가 필요하므로 지도가 보인다고 보장하지 않습니다.
- 오래 사용한 탭의 메모리/배터리·데이터 사용, 느린 통신의 체감 대기·부분 타일, 지도 출처 표시. 화면 녹화·스크린샷·진단 공유에 실제 키/요청 URL을 포함하지 않습니다.

## 상담센터에 남은 짧은 질문

1. 같은 개발키로 등록 외 `example.com`의 자연 Referer에서도 WMTS Base가 성공했습니다. WMTS 개발키와 운영키의 도메인 검사 기준·적용 시점은 무엇인가요?
2. 허용하신 Cloudflare 서버 중계는 어떤 서버 인증/등록 설정으로 호출해야 하나요? Pages Referer를 대신 넣지 않고 호출하려고 합니다.
3. 운영 승인 때 키 문자열은 그대로인지, 재발급되는지와 WMTS 요청 할당량을 알려 주세요. 캐시 없이 중계할 예정이며 저장·캐시는 별도 승인 전 사용하지 않습니다.
4. 2026-10-30 개정약관 시행 후에도 이번 직접 연결·Cloudflare 중계 허용 조건이 동일한가요?

2026-10-30 개정 예정 공지는 앞선 설계 검토에서 확인했으며 이번 지원센터 허용이 그 이후 조건까지 확정한다는 증거는 없습니다. [공식 개정 공지](https://www.vworld.kr/v4po_brdnotice_s002.do?brdIde=34515)
