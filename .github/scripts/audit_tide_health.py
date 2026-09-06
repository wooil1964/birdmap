#!/usr/bin/env python3
"""Build tide_health.json from daily and monthly tide data."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from update_tide import fallback_for_date, has_tide_data, load_station_mapping, load_tide_sites, resolve_tide_sites


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
                    "fallbackSource": day.get("fallbackSource", ""),
                    "generatedAt": day.get("generatedAt", ""),
                    "refreshedAt": day.get("refreshedAt", ""),
                }
            )
    return entries


def api_health_status(fresh: bool, live: int, fallback: int, unavailable: int) -> str:
    if not fresh:
        return "stale_daily_data"
    if live == 0:
        return "api_failed_fallback_available" if fallback else "api_failed_no_data"
    if fallback or unavailable:
        return "partial_api_success"
    return "ok"


def main() -> None:
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    tide_today = read_json(TIDE_TODAY_PATH)
    tide_month = read_json(TIDE_MONTH_PATH)

    daily_ids = site_ids(tide_today)
    monthly_ids = site_ids(tide_month)
    targets = load_tide_sites()
    mapping = load_station_mapping()
    resolved, _ = resolve_tide_sites(targets, mapping)
    resolved_by_id = {site["id"]: site for site in resolved}
    target_ids = {target["id"] for target in targets}
    daily_sites = tide_today.get("sites", {})
    tide_today_fresh = tide_today.get("date") == today
    month_sites = tide_month.get("sites") if isinstance(tide_month.get("sites"), dict) else {}
    available_fallback = fallback_for_date(resolved, today, tide_today, tide_month)
    sites_without_today_fallback = []
    for site_id in sort_site_ids(target_ids):
        if site_id not in available_fallback:
            sites_without_today_fallback.append(site_id)

    live_ids = [sid for sid, day in daily_sites.items() if has_tide_data(day) and day.get("stale") is not True]
    fallback_ids = [sid for sid, day in daily_sites.items() if has_tide_data(day) and day.get("stale") is True]
    live_codes = {daily_sites[sid].get("stationCode") or resolved_by_id.get(sid, {}).get("stationCode") for sid in live_ids}
    live_codes.discard(None)
    tomorrow_expected = (now + timedelta(days=1)).date().isoformat()
    no_station = [{"id": t["id"], "name": t["name"]} for t in targets if t["id"] not in resolved_by_id]
    unavailable_ids = [sid for sid in sort_site_ids(target_ids) if not has_tide_data(daily_sites.get(sid))]
    health_status = api_health_status(tide_today_fresh, len(live_ids), len(fallback_ids), len(unavailable_ids))
    tomorrow_days = [day.get("tomorrow", {}) for day in daily_sites.values()]
    tomorrow_live = sum(has_tide_data(day) and not day.get("stale") for day in tomorrow_days)
    tomorrow_reused = sum(has_tide_data(day) and bool(day.get("stale")) for day in tomorrow_days)
    tomorrow_unavailable = len(targets) - tomorrow_live - tomorrow_reused
    if health_status == "ok" and (tomorrow_reused or tomorrow_unavailable):
        health_status = "partial_api_success"

    output = {
        "checkedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "today": today,
        "tideTodayDate": tide_today.get("date", ""),
        "tideTodayFresh": tide_today_fresh,
        "tideTodayStatus": tide_today.get("status", ""),
        "tideTodaySiteCount": len(daily_ids),
        "siteCount": len(daily_ids),
        "status": health_status,
        "apiLiveWarning": health_status != "ok",
        "targetSiteCount": len(targets),
        "linkedSiteCount": len(resolved),
        "uniqueStationCount": len({s["stationCode"] for s in resolved}),
        "metricsDate": tide_today.get("date"),
        "liveSuccessCount": len(live_ids),
        "tomorrowLiveSuccessCount": tomorrow_live,
        "tomorrowReusedCount": tomorrow_reused,
        "tomorrowUnavailableSiteCount": tomorrow_unavailable,
        "liveSuccessStationCount": len(live_codes),
        "failedCount": tide_today.get("failedCount"),
        "fallbackCount": len(fallback_ids),
        "reusedCount": len(fallback_ids),
        "previousTomorrowFallbackCount": sum(daily_sites[sid].get("fallbackSource") == "previous_tomorrow" for sid in fallback_ids),
        "unavailableSiteCount": len(unavailable_ids),
        "unavailableSiteIds": unavailable_ids,
        "staleSites": [{"id": sid, "name": daily_sites[sid].get("name", ""),
                        "fallbackSource": daily_sites[sid].get("fallbackSource", ""),
                        "generatedAt": daily_sites[sid].get("generatedAt", ""),
                        "refreshedAt": daily_sites[sid].get("refreshedAt", tide_today.get("updated", ""))}
                       for sid in daily_sites if daily_sites[sid].get("stale")],
        "monthFallbackCount": sum(daily_sites[sid].get("fallbackSource") == "tide_month" for sid in fallback_ids),
        "timeoutCount": tide_today.get("timeoutCount"),
        "apiRequestCount": tide_today.get("apiRequestCount"),
        "requestedStationDateCount": tide_today.get("requestedStationDateCount"),
        "retryCount": tide_today.get("retryCount"),
        "budgetSkippedRequestCount": tide_today.get("budgetSkippedRequestCount"),
        "noStationCount": len(no_station),
        "noStationSites": no_station,
        "codeReviewSites": [{"id": t["id"], "name": t["name"], "reason": mapping.get(t["id"], {}).get("reviewReason", "")}
                            for t in targets if mapping.get(t["id"], {}).get("needsReview")],
        "unverifiedCodeSites": [{"id": t["id"], "name": t["name"]} for t in targets if not mapping.get(t["id"], {}).get("codeVerified")],
        "missingDailySiteIds": sort_site_ids(target_ids - daily_ids),
        "tomorrowDateMatches": tide_today.get("tomorrowDate") == tomorrow_expected,
        "dailyDateMismatchSiteIds": [sid for sid, day in daily_sites.items() if day.get("date") not in {None, tide_today.get("date")}],
        "tomorrowDateMismatchSiteIds": [sid for sid, day in daily_sites.items() if isinstance(day.get("tomorrow"), dict)
                                      and day["tomorrow"].get("date") not in {None, tide_today.get("tomorrowDate")}],
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
    if health_status != "ok":
        print(f"::warning::Tide API status={health_status}; live={len(live_ids)}, fallback={len(fallback_ids)}, unavailable={len(unavailable_ids)}", flush=True)


if __name__ == "__main__":
    main()
