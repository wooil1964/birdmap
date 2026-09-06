"""Verify current OpenAPI samples using KHOA_API_KEY without changing tide data.

Use --apply-confirmed-mappings only after the full sample check succeeds.
No key or authenticated request URL is written to output.
"""
import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import update_tide as tide
from build_tide_station_mapping import load_catalog, validate_mapping


SAMPLE_IDS = ("107", "19", "50", "9", "156", "55", "51", "52", "27", "76")
# Codes confirmed in the KHOA station catalog. These mappings require an API
# response check before activation; do not auto-select arbitrary candidates.
PENDING_CODES = {"50": "DT_0091", "51": "DT_0013", "52": "DT_0903"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-confirmed-mappings", action="store_true")
    parser.add_argument("--output", default="tide_api_verification.json")
    args = parser.parse_args()
    now = datetime.now(tide.KST)
    stamp = now.strftime("%Y-%m-%d %H:%M KST")
    api_key = os.environ.get("KHOA_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("KHOA_API_KEY not configured: live OpenAPI verification NOT RUN")
    mapping = json.loads(tide.MAPPING_PATH.read_text(encoding="utf-8"))
    catalog = load_catalog()
    targets = tide.load_tide_sites()
    validate_mapping(mapping, targets, catalog)
    resolved, _ = tide.resolve_tide_sites(targets, mapping["sites"])
    by_id = {site["id"]: site for site in resolved}
    targets_by_id = {site["id"]: site for site in targets}
    samples = []
    for sid in SAMPLE_IDS:
        site = dict(by_id.get(sid, targets_by_id[sid]))
        if sid in PENDING_CODES:
            code = PENDING_CODES[sid]
            site.update(stationCode=code, stationName=catalog[code]["name"])
        samples.append(site)
    stats = tide.RequestStats(600)
    cache = {}
    results, failures = {}, []
    for offset in (0, 1):
        date = now.date() + timedelta(days=offset)
        for site in samples:
            key = (site["stationCode"], date.isoformat())
            if key not in cache:
                try:
                    cache[key] = tide.request_prediction(api_key, key[0], date.strftime("%Y%m%d"), stats=stats)
                except Exception as exc:
                    cache[key] = exc
            try:
                payload = cache[key]
                if isinstance(payload, Exception):
                    raise payload
                day = tide.build_site_result(site, payload, now, date.isoformat())
                results.setdefault(site["id"], []).append(day)
                print(site["name"], key[0], key[1], day["highTide"], day["highTideLevel"])
            except Exception as exc:
                failures.append({"siteId": site["id"], "stationCode": key[0], "date": key[1], "error": tide.safe_error(exc)})
    output = {"checkedAt": stamp, "source": tide.API_URL, "sites": results, "failures": failures, **stats.snapshot()}
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if failures:
        raise SystemExit(f"Live API verification failed for {len(failures)} site-days; mappings unchanged")
    if args.apply_confirmed_mappings:
        for site in samples:
            sid, code = site["id"], site["stationCode"]
            entry = mapping["sites"][sid]
            station = catalog[code]
            entry.update(tideStationCode=code, tideStationName=site["stationName"],
                         stationLat=station["lat"], stationLon=station["lon"],
                         codeVerified=True, codeSourceUrl=station["sourceUrl"],
                         apiSupport="verified", apiVerifiedAt=stamp)
            if sid in PENDING_CODES:
                # Distance is advisory; recompute it only after the explicit
                # per-site choice has been confirmed by the live API.
                import math
                lat1, lat2 = math.radians(entry["lat"]), math.radians(station["lat"])
                dlat, dlon = lat2 - lat1, math.radians(station["lon"] - entry["lon"])
                a = math.sin(dlat / 2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon / 2)**2
                entry["distanceKm"] = round(6371.0088 * 2 * math.asin(math.sqrt(a)), 2)
                entry.update(needsReview=False, reviewReason="같은 해안권/자체 공식 지점의 오늘·내일 고저조 OpenAPI 응답 확인 후 연결.")
            for candidate in entry.get("candidates", []):
                if candidate["stationCode"] == code:
                    candidate.update(apiSupport="verified", apiVerifiedAt=stamp)
        mapping["mappedCount"] = sum(bool(s["tideStationCode"]) for s in mapping["sites"].values())
        mapping["reviewCount"] = sum(bool(s["needsReview"]) for s in mapping["sites"].values())
        mapping["updated"] = stamp
        validate_mapping(mapping, targets, catalog)
        tide.MAPPING_PATH.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
