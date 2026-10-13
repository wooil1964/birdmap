# 공유 승인 응답 고정 이력 최소 수정 결과

범위: 이 회귀의 수정과 표적검증만. 기준체크포인트8583890, 기준제품3d42910, 수정제품9b129940ae484f9f9f777eaecc1ce4473e840f05. 제품수정은loadApprovedReports의fixedSpots 변환7추가/4삭제뿐이다.

원인: 공유Promise의동일DTO를첫소비자가제자리변형해두번째소비자의history가빈배열이됐다. 최소수정은별도nextFixedHistory와각history.slice()로원본map/배열을유지한다. 권한검사순서·freshpostflight·nonce·5000ms·CAS·철회/terminal·추천코드는그대로다.

표적결과: 신규4건은수정전2pass/2fail→후4pass. 승인검색/이력캐시포함3파일32pass/0fail/0skip. 실제publicationFetch 재현에서공유payload1회,두loader true,이력[1,1]/최종1. 실제Chrome5폭10pass/0fail/0skip로이력2건·검색2건·팝업2건및철회후이름/이력제거확인. 권한집중8건exit0.190사이트/190unique/전체필드·좌표불변.

Chrome 최초저장helper의searchA/B는대문자토큰을normalizeQuery없이전달해5pass/5fail을냈다. 실제UI activeTerms 계약대로별도복사본에서normalizeQuery를적용했으며assertion과기대개수는동일하다. 보정입력의수정전3d는5pass/5fail,수정후9b는10pass였다. 원형helper와원형결과는변경하지않았다. 이는별도하네스입력문제이며검색제품코드수정없음.

이번단계의미실행: 전체회귀/원형Chrome241/부하·숨김DOM과고지연/날짜validator/CI/Paid평가/운영작업. 기존차단조건은미해결로유지한다. 신규기능이력회귀는표적범위에서해결됐으며전체배포승인을의미하지않는다. 운영API호출0,외부비GET0,제품·main·Worker·D1·Pages·요금제운영변경0. 원형기존미추적자료보존.
