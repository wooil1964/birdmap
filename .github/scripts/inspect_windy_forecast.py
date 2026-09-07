"""One-site, one-request inspection; never print payloads or raw responses."""
import math
import os
from datetime import datetime, timedelta

import update_weather as weather


def inspect():
    key = os.environ.get("WINDY_API_KEY", "").strip()
    if not key:
        print("apiError: WINDY_API_KEY not configured")
        print("atmosphericRequests: 0")
        return 1
    site = weather.load_site_data()[0]
    # Production uses this GFS branch after the ICON visibility probe fails.
    model = "gfs"
    parameters = [p for p in weather.ATMOSPHERIC_PARAMETERS if p != "visibility"]
    weather.MAX_REQUEST_ATTEMPTS = 1
    print("Windy forecast inspection", flush=True)
    print(f"site: {site['id']} / {site['name']}", flush=True)
    print(f"model: {model}", flush=True)
    print("atmosphericRequests: 1", flush=True)
    print("waveRequests: 0", flush=True)
    print("openMeteoRequests: 0", flush=True)
    try:
        data = weather.request_forecast(key, float(site["lat"]), float(site["lon"]), parameters, model)
    except Exception as exc:
        print(f"apiError: {weather.safe_error(exc)}", flush=True)
        return 1
    print("apiError: none")
    timestamps = data.get("ts")
    if not isinstance(timestamps, list) or not timestamps or any(
        isinstance(t, bool) or not isinstance(t, (int, float)) or not math.isfinite(t)
        for t in timestamps
    ):
        print("inspectionError: missing or invalid timestamps")
        return 1
    if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
        print("inspectionError: timestamps are not strictly increasing")
        return 1
    dates = [datetime.fromtimestamp(t / 1000, weather.KST) for t in timestamps]
    today = datetime.now(weather.KST).date()
    forecast_days = sorted({d.date() for d in dates if d.date() >= today})
    week_days = [d for d in forecast_days if d < today + timedelta(days=7)]
    print(f"timestampCount: {len(timestamps)}")
    print(f"firstTimestampMs: {timestamps[0]}")
    print(f"lastTimestampMs: {timestamps[-1]}")
    print(f"firstForecastKST: {dates[0]:%Y-%m-%d %H:%M} KST")
    print(f"lastForecastKST: {dates[-1]:%Y-%m-%d %H:%M} KST")
    print(f"startDateKST: {dates[0].date()}")
    print(f"endDateKST: {dates[-1].date()}")
    print(f"inspectionDateKST: {today}")
    print(f"forecastCalendarDays: {len(set(d.date() for d in dates))}")
    print(f"availableCalendarDaysFromToday: {len(forecast_days)}")
    print(f"availableCalendarDaysWithinSevenDays: {len(week_days)}")
    print(f"forecastSpanHours: {(timestamps[-1] - timestamps[0]) / 3600000:g}")
    print("spacingHours (offset from first timestamp):")
    start = 0
    intervals = [(b - a) / 3600000 for a, b in zip(timestamps, timestamps[1:])]
    for i, spacing in enumerate(intervals):
        if i + 1 == len(intervals) or intervals[i + 1] != spacing:
            lo = (timestamps[start] - timestamps[0]) / 3600000
            hi = (timestamps[i + 1] - timestamps[0]) / 3600000
            print(f"  {lo:g}-{hi:g}h: {spacing:g}h ({i + 1 - start} intervals)")
            start = i + 1
    return 0


if __name__ == "__main__":
    raise SystemExit(inspect())
