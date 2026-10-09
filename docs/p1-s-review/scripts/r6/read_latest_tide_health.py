"""Read latest main tide files with actual health audit; write review artifact only."""
import json,sys
from pathlib import Path
from datetime import datetime
sys.path.insert(0,str(Path(sys.argv[1])/'.github/scripts'))
import audit_tide_health as health
class FixedDateTime(datetime):
 @classmethod
 def now(cls,tz=None):
  result=datetime.fromisoformat('2026-10-09T21:10:00+09:00')
  return result.astimezone(tz) if tz else result.replace(tzinfo=None)
health.datetime=FixedDateTime
health.OUTPUT_PATH=Path(sys.argv[2])/'combined_tide_health.json'
health.main()
data=json.loads(health.OUTPUT_PATH.read_text(encoding='utf-8'))
print(json.dumps({k:v for k,v in data.items() if not isinstance(v,(list,dict))},ensure_ascii=False))
