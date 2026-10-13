# 다음 세션 재개 지침 — PR17 운영 보류

2026-10-13 KST. **BLOCKED — 운영 배포 중단**. 마지막 제품 커밋 `c025d75f964ab36f6f2eae541a99461f6de59b70`; 이 문서가 들어 있는 체크포인트의 정확한 SHA는 `git log -1`/PR17 head로 조회한다(자기 커밋 SHA를 미리 추정하지 않는다). 브랜치 `codex/p1-publication-security-guards`, 별도 독립검증 tree `p1-publication-final-audit/birdmap`.

먼저 AI_WORK_RULES.md, FINDINGS.md, FINAL_MANIFEST.json, PROGRESS.md와 PR17/Issue9 최종 댓글을 읽는다. P1-A~D와 통과한 전체검증을처음부터반복하지 않는다. latest origin/main 및 PR13/16/17 head를 새로조회해 비교하고 필요한 영향시험만추가한다.

## 완료 및 원장

- B1~B5와 B6(저장보호행falseflag/exact) 수정. c025자동710/0/1skip,S2행렬182/특별21/popup12,기본Chrome241 / SQLiteAPI DTO170 / workerdDTO140,5폭 각각통과. 같은6신규시험은old7f2pass4fail→new6pass. 실제workerdB6원형13/확장25,171표현×3cell0누락,일반17오탐0. 원형실패/하네스오류를삭제하지 않았다.
- field saved unknown masking은API hidden=true/nullpoint. 프런트기존number검사로해당행은지도owner선택UI에없다; APIknownid owner삭제/status영수증은유지. 정상새보호등록coarse ownerUI는정상. DB사용자자료수정/임의대략좌표생성금지. S1P승인후전면비공개와구분.
- 고정2026-10-08 22:40KST190/176 ON/OFFsignature/top10 전수불변. 현재기상으로176을주장하지말 것.
- Chrome10/20 cohorts +새c025cost12 +독립Freebudget63. `operations/FREE_CAPACITY_BUDGET.json`, `B6_CAPACITY_COMPATIBILITY.json`, `load-only/INDEPENDENT_FREE_BUDGET_RECALC.json`, Chrome정규화원장참조.20명1hD1약855만/한도500만,10명1h약432만;8h는요청/읽기둘다초과. 실측65초율의모형이지실제하루/실제소진시각아님. 사용자1230D1queries≠계정Worker1242;창별대상구분.
- latestmain b41 B6 merge-tree a69496e7 충돌0/자동5JSON보존. b41today10/12→현재10/13검사exit1,원발행일시계0/weekly0. 데이터날짜를수정해통과시키지말 것.
- 읽기전용CIc025 run38272115326success,artifact11757876081(CImerge88262001.../388files/ZIP90aac4...)2026-11-11만료. CI배포step없음. 실제Worker대기upload는FINDINGS/standby-workers-b6-verified.json 참조. public16ab210b.../maintenance4862c354...가B6포함; old1f00/d403을활성화하지말 것. admincf2b8b90/9ba936ff은c025bundle같음. active494b97/0134cd9a 그대로.

## 다음 정확한 작업

1. 사용자에게보고된Free용량/가용성차단사항의후속지시를확인한다. **사용자는현재숫자만으로운영승인을내리지말라고했다.** 현재추가제품최적화/요금제전환은최종검증보고에서제안한범위일뿐승인됐다고추정하지않는다.
2. 추가보완을지시받으면5초revocation상한·first-primary권한·nonce/freshpostflight/unknown폐쇄를유지한채 중복bootstrap/lease경계4목록refetch 및authoritycatalogscan비용을줄이는최소안부터검토한다. poll/lease연장·무검증권한cache·failopen은금지. HEAD-only도20명8h115200요청이므로이용시간/요금/구조의한계를명시한다. 유료구매는별도승인없으면하지않는다.
3. 변경전실패를보존하고실제Chrome10/20명조건·새D1schema/cost·모든회귀를영향범위로다시실행한다. endpointcost와계정다른Worker/DB를포함한예산을독립대조한다.
4. 필수용량/보안관문통과및사용자별도운영승인후에만운영단계로이동한다. 기존Active소스는Git41650e43 exact이며새보호rollback아니다. 최신보호standby/modulehash/바인딩을읽어확인하고모든writer/oldversion/preview통제·drain·primaryschema확인한다.
5. 운영0004field는ledger에없어도기설치다. 원자Wrangler migration전용dir0005만사용; 기존D1삭제/철회/revision을초기화하지않는다. 이후보호pairedserver→CAS/cache/oldclient→검증소스main/Pages→새기상배치→운영읽기회귀/관찰순서. 자동Pages는mainmerge때반영되므로server준비전merge금지. 매단계오류중단.
6. Reader공개projection정책을이미활성화한authority에서바꿀때는freeze/drain과함께revision도전진시켜같은authority로old허가를재사용하지않게한다. legacyversion을active에0%로남기지않는다(versionoverride위험). maintenance는쓰기닫힘이지모든읽기닫힘아님.

## 주요 재현 명령

PowerShell env: WRANGLER_SEND_METRICS=false, PYTHONUTF8=1, PYTHONIOENCODING=utf-8, CHROME_PATH=실제Chrome. Node24.18/Python/Miniflare경로와complete commands는각 RUN_COMMANDS/receipts에있다.

- `node docs/p1-publication-final-audit/integration/run_integrated.mjs c025d75f964ab36f6f2eae541a99461f6de59b70 58e1a222845680d5217677242ac1df5ff9bf665b` (전체driver1:별도현재날짜validator. 자동6suite710/0/1).
- `node docs/p1-publication-final-audit/integration/b6_before_after.mjs`; `node .../b6_generation_validator.mjs`; `node .../b6_merge_latest_main.mjs`.
- field repro/expanded: `node server/field-saved-protection-read/{repro,expanded}.mjs <repo> <new-out> <Miniflare node_modules> <sha>` (실제경로는README/RUN_COMMANDS확인).
- Chrome exact pinned source: `PUBLICATION_TEST_INDEX_REF`, `PUBLICATION_TEST_ROOT`, `PUBLICATION_TEST_OUTPUT`를새archive/새output으로지정, browser script실행. 기존결과를덮어쓰지말 것.
- `node .../operations/load-only/publication_local_load.mjs <repo> <new-out> <node_modules> <sha> 60`; Chrome부하/normalize/합산script와독립Python budget.

물리GPS/네이티브앱·운영edgeCPU/POP·실제장기quota소진·최신기상배치·글로벌캐시와이미열린old탭의전환은미실행이다. 미실행을PASS로기록하지않고 이미전달된정확점을원격삭제했다고주장하지않는다. S1P/R5후속정책별도,실제사고증거없음.
