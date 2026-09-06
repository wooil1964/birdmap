"""Validate generated data, including truthful fallback accounting."""
import json
from datetime import datetime
from pathlib import Path
from site_data import load_runtime_sites
from update_weather import KST


def validate(path=Path(__file__).resolve().parents[2] / "weather_today.json"):
    data = json.loads(path.read_text(encoding="utf-8"))
    sites = data["sites"]
    assert set(sites) == {str(s["id"]) for s in load_runtime_sites()}, "Weather IDs mismatch"
    assert data["date"] == datetime.now(KST).date().isoformat(), "Batch date mismatch"
    assert data["siteCount"] == len(sites)
    assert data["successCount"] + data["failedCount"] == len(sites)
    assert data["staleCount"] == sum(bool(s.get("stale")) for s in sites.values())
    assert data["unavailableSiteCount"] == sum(bool(s.get("dataUnavailable")) for s in sites.values())
    assert data["scoreEligibleCount"] == sum(bool(s.get("scoreEligible")) for s in sites.values())
    for day in sites.values():
        if day.get("scoreEligible"):
            assert not day.get("stale") and not day.get("dataUnavailable")
            assert day["date"] == data["date"] == day["forecastTime"][:10]
            assert isinstance(day["score"], (int, float)) and 0 <= day["score"] <= 100
            assert day["generatedAt"] and not day.get("missingScoreFields")
    print(json.dumps({k: v for k, v in data.items() if k != "sites"}, ensure_ascii=True))
    if data["status"] != "ok":
        print("::warning::Weather contains fallback, stale or incomplete data; inspect counts above")
    return data


if __name__ == "__main__":
    validate()
