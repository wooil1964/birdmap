"""Keep current-date checks separate from archive structural validation.
Usage: python run_modes.py <worktree> <fresh-output-directory>
No source JSON or remote service is changed.
"""
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
import contextlib
import hashlib
import io
import json
import os
import subprocess
import sys

root=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve(); out.mkdir(exist_ok=False)
sys.path.insert(0, str(root/".github/scripts"))
import validate_weather as tv
import validate_weather_week as wv
from update_weather import KST

now=datetime.now(KST)
source=json.loads((root/"weather_today.json").read_text(encoding="utf-8"))
evaluation=datetime.strptime(source["generatedAt"][:-4], "%Y-%m-%d %H:%M").replace(tzinfo=KST)
class Frozen(datetime):
    @classmethod
    def now(cls,tz=None):
        return evaluation.astimezone(tz) if tz else evaluation.replace(tzinfo=None)

rows=[]
for mode, validator, file, freeze, expected in [
    ("current-stored-today",tv,"weather_today.json",False,"Batch date mismatch"),
    ("current-stored-week",wv,"weather_week.json",False,None),
    ("historical-original-today",tv,"weather_today.json",True,None),
    ("historical-original-week",wv,"weather_week.json",True,None)]:
    buf=io.StringIO(); error=None
    try:
        with contextlib.ExitStack() as stack:
            stack.enter_context(contextlib.redirect_stdout(buf))
            if freeze: stack.enter_context(patch.object(validator,"datetime",Frozen))
            validator.validate(root/file)
    except Exception as e: error=type(e).__name__+": "+str(e)
    (out/(mode+".log")).write_text(buf.getvalue()+(error or "PASS")+"\n",encoding="utf-8")
    met=(error is None) if expected is None else error is not None and expected in error
    rows.append({"mode":mode,"evaluationKst":(evaluation if freeze else now).isoformat(),
                 "sourceSha256":hashlib.sha256((root/file).read_bytes()).hexdigest(),
                 "validationPassed":error is None,"error":error,"expectationMet":met})

# Different immutable input, not the archived batch with its date rewritten.
commit=subprocess.check_output(["git","rev-parse",sys.argv[3] if len(sys.argv)>3 else "origin/main"],cwd=root,text=True).strip()
raw=subprocess.check_output(["git","show",commit+":weather_today.json"],cwd=root)
current=json.loads(raw)
path=out/"actual-main-current-today.json";path.write_bytes(raw)
buf=io.StringIO(); error=None
try:
    with contextlib.redirect_stdout(buf): tv.validate(path)
except Exception as e: error=type(e).__name__+": "+str(e)
(out/"current-actual-main-today.log").write_text(buf.getvalue()+(error or "PASS")+"\n",encoding="utf-8")
rows.append({"mode":"current-actual-main-today","sourceGitCommit":commit,"sourceDate":current["date"],
             "sourceGeneratedAt":current["generatedAt"],"evaluationKst":now.isoformat(),
             "sourceSha256":hashlib.sha256(raw).hexdigest(),"validationPassed":error is None,
             "error":error,"expectationMet":error is None})
result={"rows":rows,"note":"Archived today is still rejected on the current date. Historical validation and current structural batch validation do not prove recommendation freshness."}
(out/"MODES.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,ensure_ascii=False,indent=2)); assert all(x["expectationMet"] for x in rows)
