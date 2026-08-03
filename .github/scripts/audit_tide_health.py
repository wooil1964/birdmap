#!/usr/bin/env python3
"""Build tide_health.json from daily and monthly tide data."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
TIDE_TODAY_PATH = ROOT / "tide_today.json"
TIDE_MONTH_PATH = ROOT / "tide_month.json"
OUTPUT_PATH = ROOT / "tide_health.json"
KST = timezone(timedelta(hours=9))


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to read {path.name}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"{path.name} must contain a JSON object")
    return data


def site_ids(data: dict[str, Any]) -> set[str]:
    sites = data.get("sites")
    if not isinstance(sites, dict):
        return set()
    return {str(site_id) for site_id in sites}


def sort_site_ids(values: set[str] | list[str]) -> list[str]:
    return sorted(values, key=lambda value: (0, int(value)) if value.isdigit() else (1, value))


def monthly_day(site: Any, date_text: str) -> dict[str, Any] | None:
    if not isinstance(site, dict):
        return None
    days = site.get("days")
    if not isinstance(days, list):
        return None
    for day in days:
        if isinstance(day, dict) and day.get("date") == date_text:
            return day
    return None


def stale_entries(tide_month: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    sites = tide_month.get("sites")
    if not isinstance(sites, dict):
        return entries
    for site_id, site in sites.items():
        if not isinstance(site, dict):
            continue
        days = site.get("days")
        if not isinstance(days, list):
            continue
        for day in days:
            if not isinstance(day, dict) or day.get("stale") is not True:
                continue
            entries.append(
                {
                    "siteId": str(site_id),
                    "name": site.get("name", ""),
                    "date": day.get("date", ""),
                    "error": day.get("error", ""),
                }
            )
    return entries


def main() -> None:
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    tide_today = read_json(TIDE_TODAY_PATH)
    tide_month = read_json(TIDE_MONTH_PATH)

    daily_ids = site_ids(tide_today)
    monthly_ids = site_ids(tide_month)
    tide_today_fresh = tide_today.get("date") == today
    month_sites = tide_month.get("sites") if isinstance(tide_month.get("sites"), dict) else {}
    sites_without_today_fallback = []
    if not tide_today_fresh:
        for site_id in sort_site_ids(daily_ids):
            if monthly_day(month_sites.get(site_id), today) is None:
                sites_without_today_fallback.append(site_id)

    output = {
        "checkedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "today": today,
        "tideTodayDate": tide_today.get("date", ""),
        "tideTodayFresh": tide_today_fresh,
        "tideTodayStatus": tide_today.get("status", ""),
        "tideTodaySiteCount": len(daily_ids),
        "tideMonthGeneratedAt": tide_month.get("generatedAt", ""),
        "tideMonthStatus": tide_month.get("status", ""),
        "tideMonthTargetCount": len(monthly_ids),
        "dailyOnlySiteIds": sort_site_ids(daily_ids - monthly_ids),
        "monthOnlySiteIds": sort_site_ids(monthly_ids - daily_ids),
        "sitesWithoutTodayFallback": sites_without_today_fallback,
        "monthStaleEntries": stale_entries(tide_month),
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"{OUTPUT_PATH.name}: today={today}, "
        f"tideTodayFresh={tide_today_fresh}, monthStaleEntries={len(output['monthStaleEntries'])}",
        flush=True,
    )


if __name__ == "__main__":
    main()
