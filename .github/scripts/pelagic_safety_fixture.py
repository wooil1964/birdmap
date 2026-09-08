"""C01 회귀 fixture: 실제 주간 생성 경로로 선상 안전 판정용 주간 문서를 만든다.

stdin으로 {"siteId":"48","now":"2026-09-08 09:00","cases":[{"name":"c1","windSpeed":6.01,"waveM":0.7,"precipitation3h":0}]}
를 받아 case마다 실제 build_week_days()·week_json_text()가 만들어낸 weather_week 문서 '텍스트'를 돌려준다.
테스트는 이 텍스트를 그대로 JSON.parse 해서 index.html 추천 함수에 넣는다(원자료 → 생성기 → JSON → 추천).
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_weather as weather
from site_data import load_runtime_sites


def synthetic_series(now: datetime, wind: float, wave: float, rain: float):
    """생성기가 실제로 받는 Windy 모양의 3시간 시계열. 풍속은 hypot(0, w)라 원자료가 그대로 남는다."""
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    steps = weather.WEEK_FORECAST_DAYS * 24 // weather.WEEK_SAMPLE_HOUR_STEP
    stamps = [start + timedelta(hours=weather.WEEK_SAMPLE_HOUR_STEP * step) for step in range(steps)]
    timestamps = [moment.timestamp() * 1000 for moment in stamps]
    count = len(timestamps)
    atmospheric = {
        "ts": timestamps,
        "wind_u-surface": [0.0] * count, "wind_v-surface": [-wind] * count,
        "gust-surface": [wind] * count, "past3hprecip-surface": [rain] * count,
        "temp-surface": [18.0] * count, "visibility-surface": [20000.0] * count,
        "lclouds-surface": [10.0] * count, "mclouds-surface": [None] * count, "hclouds-surface": [None] * count,
    }
    return atmospheric, {"ts": list(timestamps), "waves_height-surface": [wave] * count}


def week_document(site: dict, rules: dict, now: datetime, case: dict) -> str:
    atmospheric, wave = synthetic_series(now, case["windSpeed"], case["waveM"], case["precipitation3h"])
    days = weather.build_week_days(site, rules, atmospheric, wave, now)
    start_date, end_date = weather.week_window(now)
    entry = {
        "name": site["name"], "ruleKey": str(site.get("weatherRuleKey") or "general_birding"),
        "fieldSources": {"atmosphere": "windy", "visibility": "open_meteo", "wave": "windy"},
        "fallbackSource": "none", "days": days,
    }
    return weather.week_json_text({
        "startDate": start_date.isoformat(), "endDate": end_date.isoformat(),
        "generatedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "forecastDayCount": weather.WEEK_FORECAST_DAYS,
        "sampleIntervalHours": weather.WEEK_SAMPLE_HOUR_STEP,
        "siteCount": 1, "sites": {str(site["id"]): entry},
    })


def main() -> None:
    request = json.load(sys.stdin)
    site_id = str(request.get("siteId", "48"))
    site = next(site for site in load_runtime_sites() if str(site["id"]) == site_id)
    rules = weather.load_rules()
    now = (datetime.strptime(request["now"], "%Y-%m-%d %H:%M").replace(tzinfo=weather.KST)
           if request.get("now") else datetime.now(weather.KST))
    json.dump({case["name"]: week_document(site, rules, now, case) for case in request["cases"]},
              sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
