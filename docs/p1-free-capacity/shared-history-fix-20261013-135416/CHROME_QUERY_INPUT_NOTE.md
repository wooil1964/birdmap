# Chrome 원형 실패와 입력 보정

최초 수정후 Chrome 원형은5pass/5fail을 기록했다. 이력2건·검색index2건·팝업2건은 유지됐으나 searchA/B만0이었다. 저장된 helper가 대문자A/B 검색어를 normalizeQuery 없이 저수준searchReportEntries에 직접 전달했다. 실제UI는 normalizeQuery를 적용한 activeTerms를 사용한다. 기존 함수를 바꾸거나 검색 기대1을0으로 낮추지 않았다.

원형helper와결과는그대로보존한다. 별도복사본에서두검색어에실제normalizeQuery만적용하고 모든 assertion을유지한다. 보정한같은입력으로수정전3d도다시FAIL인지확인하고수정후9b129는PASS인지확인한다. 생산코드의검색규칙은변경하지않는다.
