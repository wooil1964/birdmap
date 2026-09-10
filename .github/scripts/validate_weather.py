"""Validate generated data, including truthful fallback accounting."""
import json
import math
from datetime import datetime
from pathlib import Path
from site_data import load_runtime_sites
from update_weather import KST

# today 문서가 실제로 숫자로 저장하는 값은 score 와 파고 좌표뿐이다. 풍속·강수·파고는
# "북동풍 3.6m/s", "강수 없음", "0.5m" 처럼 포맷된 문자열이라 weekly 의 windSpeed·waveM 같은
# 수치 필드가 today 에는 존재하지 않는다.
COORDINATE_FIELDS = ("waveLat", "waveLon")


def finite_number(value):
    """유한한 숫자만 인정한다. Python에서 bool은 int의 서브클래스라 명시적으로 제외한다."""
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def reject_constant(name):
    raise AssertionError(f"Weather contains {name}")


def validate(path=Path(__file__).resolve().parents[2] / "weather_today.json"):
    data = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    sites = data["sites"]
    assert set(sites) == {str(s["id"]) for s in load_runtime_sites()}, "Weather IDs mismatch"
    assert data["date"] == datetime.now(KST).date().isoformat(), "Batch date mismatch"
    assert data["siteCount"] == len(sites)
    assert data["successCount"] + data["failedCount"] == len(sites)
    assert data["staleCount"] == sum(bool(s.get("stale")) for s in sites.values())
    assert data["unavailableSiteCount"] == sum(bool(s.get("dataUnavailable")) for s in sites.values())
    assert data["scoreEligibleCount"] == sum(bool(s.get("scoreEligible")) for s in sites.values())
    for site_id, day in sites.items():
        for field in COORDINATE_FIELDS:
            value = day.get(field)
            assert value is None or finite_number(value), \
                f"{site_id} {field} is not a finite number: {value!r}"
        if day.get("scoreEligible"):
            assert not day.get("stale") and not day.get("dataUnavailable")
            assert day["date"] == data["date"] == day["forecastTime"][:10]
            assert finite_number(day["score"]) and 0 <= day["score"] <= 100, \
                f"{site_id} score is not a finite number in 0-100: {day['score']!r}"
            assert day["generatedAt"] and not day.get("missingScoreFields")
    print(json.dumps({k: v for k, v in data.items() if k != "sites"}, ensure_ascii=True))
    if data["status"] != "ok":
        print("::warning::Weather contains fallback, stale or incomplete data; inspect counts above")
    return data


if __name__ == "__main__":
    validate()
