# 마지막 공지 반영 main 실제 현재 검증

검증한 PR head는 `b12e20c1b6d856a021898a0c1c9221b30393a221`, 마지막 원격 읽기에서 확인한 main은 `89e7e339812fbd9c096008cb5631c88fd8765c03`이다. 결합 tree는 `e02191c1ca4cc00e0faedab2ffd4e10b14c537e2`, source archive는 `C:/Users/김진호/.codex/worktrees/p1-s-pr13-review/birdmap/docs/p1-s-review/.scratch/combinedFinal`이다. 임시 merge-tree 충돌 0이며 실제 branch/main merge·checkout·제품 변경·배포·D1·사용자 쓰기는 없다.

**마지막 원격 refs 읽기는 2026-10-11 07:02:19 KST**이며 이 시각의 main89e7·headb12를 기준으로 한다. 이후 자동 갱신을 무한 추적하지 않는다.

직전 mainb596 대비 변경은 `notices.json` 24줄 추가뿐이며 공지 3개가 추가됐다. 최신 notices Git blob은 결합 tree와 byte 동일하다. 자동 기상/조석 JSON 5개는 b596/main89/직전 결합/마지막 결합 사이 모두 동일하다. 제품 8개도 직전 결합과 마지막 결합 사이 모두 동일하다. 따라서 기존 137개 함수·190곳 전체 siteData/좌표 digest 불변과 unit71/73(기존 main 실패2)은 재사용했다. 이 8/8은 **직전 결합 대비**이며 PR head 대비 strict 제품8 동일성은 main TMAP 차이로 여전히 **7/8**이다. 직전 strict 실패를 지우거나 성공으로 바꾸지 않았다.

실제 Python validators는 **07:00:50 KST**에서 today/week 모두 통과(exit0). 날짜 및 실제 시계를 바꾸거나 190곳을 투영하지 않았다. today date10/11·190/190, week10/11~10/17·10640/10640, generatedAt10/11 04:16 KST·refreshedAt04:18 KST로 직전 데이터와 동일하다.

실제 JS190 평가 시계는 **07:00:53 KST**였다. 저장 today는 190곳 root/item 원문 생성시각이 동일하지만 latestDue05:35보다 오래되어 **current0/reference190/scoreAllowed0**이었다. Python 저장 스키마 통과와 브라우저 저장 자료의 현재 적격 판정을 분리한다. 실제 주간 후보는 **176**, 최종 추천은 **10**이며 exception0이다. 최신 public 최근 제보 snapshot이 제공되지 않아 reportsOFF/브라우저 초기 빈 상태를 썼다. 예전10/8·10/10 고정 snapshot은 사용하지 않았다.

실제 공지 영향 검증은 새 공지와 직전 공지를 **같은 실제 현재 시계**의 최신 weather/rules/siteData에 각각 넣어 비교했다. 전체 후보 **176/176 safe·176/176 eligible**, 최종 **10/10 safe·10/10 eligible**이며 후보 ID 집합 및 최종 ID 순서는 같았다. 공지로 부적격 최종 추천이 되살아난 사례는 **0**, unsafe 최종 추천은 **0**이다. 제품 guard/assertion을 바꾸지 않았다.

현재 top ID는 `7,8,10,15,126,107,14,48,3,5`; 직전 b596 결과와 동일하다. 기상/표시/정렬 점수도 같으며 걸매리(ID14)는91, 굴업도(ID3)·대청도(ID5)는100, 나머지는92다. 추천 날짜·시각은 js_current190.json의 top을 따른다.

이번 추가 작업은 최신 notices 입력의 source 보존과 현재 추천 영향·actual validators/JS190에 한정한다. 기존 F2/F3·전체621회귀 및 unit4개를 반복하지 않았고, Chrome DOM 검증이나 production 최근 제보ON 순위를 이 결과로 주장하지 않는다. 직전 b596 보고서의623/615 오기는621/615로 수정했고 상위 artifact_manifest의 해당 보고서 hash만 갱신했다. b596 결과와 새 final_notice 결과는 따로 보존한다.

파일별 byte/hash와 복사 목록은 final_notice/artifact_manifest.json, 실제 CLI·exit0·refs·clock은 execution_receipts.json, 5자동/8제품/공지 blob 교차 및 후보 전수·공지 영향은 notice_source_current_audit.json에 있다. 결과에 원본 좌표값을 저장하지 않았다.