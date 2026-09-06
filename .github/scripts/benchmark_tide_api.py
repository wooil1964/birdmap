"""Compare request settings on identical official station/date pairs."""
import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import update_tide as tide


def main():
    key = os.environ.get("KHOA_API_KEY", "").strip()
    if not key:
        raise SystemExit("KHOA_API_KEY unavailable")
    now = datetime.now(tide.KST)
    sites, _ = tide.resolve_tide_sites(tide.load_tide_sites(), tide.load_station_mapping())
    groups = tide.group_by_station(sites)
    tasks = [(group[0], (now + timedelta(days=offset)).date()) for offset in (0, 1) for group in groups]
    reports = []
    for timeout, workers, delay in ((8, 4, 2), (12, 2, 3), (15, 2, 3)):
        stats = tide.RequestStats(600)
        failures, hashes = [], {}
        started = time.monotonic()
        with patch.object(tide, "REQUEST_TIMEOUT_SECONDS", timeout), patch.object(tide, "RETRY_DELAYS_SECONDS", (delay,)):
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {pool.submit(tide.request_prediction, key, site["stationCode"], date.strftime("%Y%m%d"), False, stats): (site, date) for site, date in tasks}
                for future in as_completed(futures):
                    site, date = futures[future]
                    pair = site["stationCode"] + ":" + date.isoformat()
                    try:
                        result = tide.build_site_result(site, future.result(), now, date.isoformat())
                        events = {field: result[field] for field in ("lowTide", "highTide", "lowTideLevel", "highTideLevel")}
                        hashes[pair] = hashlib.sha256(json.dumps(events, sort_keys=True).encode()).hexdigest()
                    except Exception as exc:
                        failures.append({"stationDate": pair, "error": tide.safe_error(exc)})
        report = {"timeoutSeconds": timeout, "maxWorkers": workers, "maxRetries": tide.MAX_RETRIES,
                  "retryDelaySeconds": delay, "elapsedSeconds": round(time.monotonic() - started, 3),
                  "uniqueStationCount": len(groups), "plannedStationDateCount": len(tasks),
                  "successfulStationDateCount": len(hashes), "failedStationDateCount": len(failures),
                  "failures": failures, "eventHashes": hashes, **stats.snapshot()}
        reports.append(report)
        print(json.dumps({k:v for k,v in report.items() if k not in {"eventHashes", "requestAttemptsByStationDate"}}, ensure_ascii=False), flush=True)
    common = set.intersection(*(set(r["eventHashes"]) for r in reports))
    mismatches = [pair for pair in sorted(common) if len({r["eventHashes"][pair] for r in reports}) != 1]
    output = {"checkedAt": now.isoformat(), "date": now.date().isoformat(), "runs": reports,
              "commonStationDateCount": len(common), "eventMismatchStationDates": mismatches}
    Path("tide_api_benchmark.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if mismatches or any(r["failedStationDateCount"] for r in reports):
        raise SystemExit("Benchmark requires review")


if __name__ == "__main__":
    main()
