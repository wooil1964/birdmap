# 재현 도구 오류 기록

확장 스크립트를 생성하는 첫 명령이 존재하지 않는 Python 경로 `C:/Users/김진호/.codex/dependencies/python/python.exe`를 사용해 실패했다. 이에 따라 아직 생성되지 않은 expanded.mjs를 Node로 실행한 부수 오류 `MODULE_NOT_FOUND`도 발생했다. 제품 시험은 수행되지 않았으며 이 도구 오류를 제품 통과나 실패 수에 포함하지 않았다. 원본 tool chunk `e472a1`, exit 1의 핵심 원문:

```text
The term 'C:/Users/김진호/.codex/dependencies/python/python.exe' is not recognized as a name of a cmdlet, function, script file, or executable program.
Error: Cannot find module .../field-saved-protection-read/expanded.mjs
code: MODULE_NOT_FOUND
```

Get-Command로 실제 Python312 경로를 확인한 뒤 script 생성과 실제 Node/workerd 시험을 완료했다. tool chunk `22bf6f`, exit 0, 실제 summary 25 pass /0 fail /0 skip. DTO 파일을 Python 기본 cp949로 읽으려던 확인 명령은 UnicodeDecodeError(tool chunk `a0e6ff`)가 발생했다. UTF-8을 명시한 독립 재읽기에서 JSON 파싱, cases10/lifecycle3/receipt201·201·200 및 manifest hash를 확인했다(tool chunk `7842e1`). UTF-8 원본은 변경하지 않았다.
