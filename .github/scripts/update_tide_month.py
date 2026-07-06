#!/usr/bin/env python3
"""Build tide_month.json for the approved monthly-tide birding sites."""

from __future__ import annotations

import argparse
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from update_tide import (
    KST,
    MAX_WORKERS,
    classify_event,
    event_level,
    event_time,
    find_prediction_rows,
    load_station_mapping,
    load_tide_sites,
    request_prediction,
    resolve_tide_sites,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_PATH = ROOT / "tide_month.json"
DEFAULT_TARGET_SITE_IDS = (
    "9", "107", "12", "156", "14", "17", "122", "19", "146",
    "20", "21", "22", "96", "95", "68", "99", "70", "26",
    "25", "71", "72", "76", "27", "75", "50", "43", "44",
)
SKIPPED_SITES = (
    {
        "siteId": 23,
        "name": "고천암철새도래지",
        "reason": "no tide mapping; tideUse=아니오; showTide=false",
    },
    {
        "siteId": 47,
        "name": "아야진해변",
        "reason": "no tide mapping; tideUse=아니오; showTide=false",
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30, help="Number of days to generate (1-31)")
    parser.add_argument("--list-targets", action="store_true", help="List resolved targets without API calls")
    parser.add_argument(
        "--target-site-ids",
        default=",".join(DEFAULT_TARGET_SITE_IDS),
        help="Comma-separated subset of the approved 27 site IDs",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Output JSON path")
    return parser.parse_args()


def parse_target_site_ids(value: str) -> list[str]:
    site_ids = [item.strip() for item in value.split(",") if item.strip()]
    if not site_ids:
        raise RuntimeError("At least one target site ID is required")
    if len(site_ids) != len(set(site_ids)):
        raise RuntimeError("Target site IDs must not contain duplicates")
    unsupported = [site_id for site_id in site_ids if site_id not in DEFAULT_TARGET_SITE_IDS]
    if unsupported:
        raise RuntimeError(
            "Target site IDs are outside the approved 27-site set: " + ", ".join(unsupported)
        )
    return site_ids


def resolve_targets(target_site_ids: list[str]) -> list[dict[str, str]]:
    all_targets = load_tide_sites()
    targets_by_id = {target["id"]: target for target in all_targets}
    missing_targets = [site_id for site_id in target_site_ids if site_id not in targets_by_id]
    if missing_targets:
        raise RuntimeError(
            "Target site IDs are missing from the existing tide target data: "
            + ", ".join(missing_targets)
        )

    mapping_sites = load_station_mapping()
    resolved, _review_count = resolve_tide_sites(
        [targets_by_id[site_id] for site_id in target_site_ids], mapping_sites
    )
    resolved_by_id = {site["id"]: site for site in resolved}
    unresolved = [site_id for site_id in target_site_ids if site_id not in resolved_by_id]
    if unresolved:
        raise RuntimeError(
            "Target site IDs have no usable tide station mapping: " + ", ".join(unresolved)
        )
    return [resolved_by_id[site_id] for site_id in target_site_ids]


def station_groups(sites: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    groups: dict[str, list[dict[str, str]]] = {}
    for site in sites:
        groups.setdefault(site["stationCode"], []).append(site)
    return groups


def print_targets(sites: list[dict[str, str]]) -> None:
    groups = station_groups(sites)
    print(f"Target sites: {len(sites)}", flush=True)
    print(f"Skipped sites: {len(SKIPPED_SITES)}", flush=True)
    for skipped in SKIPPED_SITES:
        print(
            f"SKIPPED {skipped['siteId']} {skipped['name']}: {skipped['reason']}",
            flush=True,
        )
    print(f"Unique tide stations: {len(groups)}", flush=True)
    for position, site in enumerate(sites, start=1):
        print(
            f"{position:02d}. siteId={site['id']} name={site['name']} "
            f"station={site['stationName']} obsCode={site['stationCode']} "
            f"tideRuleKey={site['ruleKey']} mapping={site['mappingMethod']}",
            flush=True,
        )
    print("Station groups:", flush=True)
    for station_code, linked_sites in sorted(groups.items()):
        names = ", ".join(f"{site['id']} {site['name']}" for site in linked_sites)
        print(
            f"- {station_code} {linked_sites[0]['stationName']}: "
            f"{len(linked_sites)} site(s) [{names}]",
            flush=True,
        )


def build_day(payload: dict[str, Any], date_iso: str) -> dict[str, str]:
    rows = find_prediction_rows(payload)
    if not rows:
        raise RuntimeError("KHOA response contains no tide predictions")
    lows = [event_time(row) for row in rows if classify_event(row) == "low" and event_time(row)]
    highs = [event_time(row) for row in rows if classify_event(row) == "high" and event_time(row)]
    low_levels = [event_level(row) for row in rows if classify_event(row) == "low" and event_level(row)]
    high_levels = [event_level(row) for row in rows if classify_event(row) == "high" and event_level(row)]
    if not lows and not highs:
        raise RuntimeError("KHOA response contains no high/low tide events")
    return {
        "date": date_iso,
        "highTide": ", ".join(highs) if highs else "정보 없음",
        "highTideLevel": ", ".join(high_levels) if high_levels else "정보 없음",
        "lowTide": ", ".join(lows) if lows else "정보 없음",
        "lowTideLevel": ", ".join(low_levels) if low_levels else "정보 없음",
    }


def load_previous_days(output_path: Path) -> dict[str, dict[str, dict[str, Any]]]:
    if not output_path.exists():
        return {}
    try:
        data = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous monthly tide data unavailable: {exc}", flush=True)
        return {}
    previous: dict[str, dict[str, dict[str, Any]]] = {}
    sites = data.get("sites")
    if not isinstance(sites, dict):
        return previous
    for site_id, site in sites.items():
        if not isinstance(site, dict) or not isinstance(site.get("days"), list):
            continue
        previous[str(site_id)] = {
            str(day.get("date")): day
            for day in site["days"]
            if isinstance(day, dict) and day.get("date")
        }
    return previous


def output_path_for(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def main() -> None:
    args = parse_args()
    if not 1 <= args.days <= 31:
        raise RuntimeError("--days must be between 1 and 31")
    target_site_ids = parse_target_site_ids(args.target_site_ids)
    sites = resolve_targets(target_site_ids)
    print_targets(sites)
    if args.list_targets:
        return

    api_key = os.environ.get("KHOA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GitHub Secret KHOA_API_KEY is not configured")
    print("KHOA_API_KEY: *** (configured)", flush=True)

    now = datetime.now(KST)
    dates = [now.date() + timedelta(days=offset) for offset in range(args.days)]
    window_start = dates[0].isoformat()
    window_end = dates[-1].isoformat()
    print(f"Date window: {window_start} to {window_end} ({args.days} days)", flush=True)

    groups = station_groups(sites)
    output_path = output_path_for(args.output)
    previous_days = load_previous_days(output_path)
    site_days: dict[str, dict[str, dict[str, Any]]] = {site["id"]: {} for site in sites}
    successful_stations: set[str] = set()
    failed_stations: set[str] = set()
    successful_requests = 0
    failed_requests = 0
    reused_count = 0

    tasks = [
        (station_code, linked_sites, date)
        for station_code, linked_sites in groups.items()
        for date in dates
    ]
    print(f"KHOA requests planned: {len(tasks)}", flush=True)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                request_prediction,
                api_key,
                station_code,
                date.strftime("%Y%m%d"),
            ): (station_code, linked_sites, date)
            for station_code, linked_sites, date in tasks
        }
        for future in as_completed(futures):
            station_code, linked_sites, date = futures[future]
            date_iso = date.isoformat()
            try:
                day = build_day(future.result(), date_iso)
            except Exception as exc:
                failed_requests += 1
                failed_stations.add(station_code)
                reused_here = 0
                for site in linked_sites:
                    previous = previous_days.get(site["id"], {}).get(date_iso)
                    if isinstance(previous, dict):
                        reused = dict(previous)
                        reused["stale"] = True
                        reused["error"] = str(exc) or type(exc).__name__
                        site_days[site["id"]][date_iso] = reused
                        reused_count += 1
                        reused_here += 1
                print(
                    f"WARNING {station_code} {date_iso}: {exc} "
                    f"(reused for {reused_here} site(s))",
                    flush=True,
                )
            else:
                successful_requests += 1
                successful_stations.add(station_code)
                for site in linked_sites:
                    site_days[site["id"]][date_iso] = dict(day)

    if successful_requests == 0:
        raise RuntimeError("No successful KHOA API responses; existing tide_month.json preserved")

    complete_stations = successful_stations - failed_stations
    results: dict[str, Any] = {}
    for site in sites:
        days = [site_days[site["id"]][date] for date in sorted(site_days[site["id"]])]
        results[site["id"]] = {
            "siteId": int(site["id"]),
            "name": site["name"],
            "stationName": site["stationName"],
            "stationCode": site["stationCode"],
            "tideRuleKey": site["ruleKey"],
            "days": days,
        }

    output = {
        "generatedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "windowStart": window_start,
        "windowEnd": window_end,
        "days": args.days,
        "source": "KHOA Tide Forecast OpenAPI",
        "status": "ok" if failed_requests == 0 else "partial",
        "targetSiteIds": [int(site_id) for site_id in target_site_ids],
        "skippedSiteIds": list(SKIPPED_SITES),
        "stationCount": len(groups),
        "successStationCount": len(complete_stations),
        "failedStationCount": len(failed_stations),
        "successfulRequestCount": successful_requests,
        "failedRequestCount": failed_requests,
        "reusedDataCount": reused_count,
        "sites": results,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(output_path)
    print(f"Successful tide stations: {len(complete_stations)}", flush=True)
    print(f"Failed tide stations: {len(failed_stations)}", flush=True)
    print(f"Reused site-day records: {reused_count}", flush=True)
    print(f"Output: {output_path}", flush=True)


if __name__ == "__main__":
    main()
