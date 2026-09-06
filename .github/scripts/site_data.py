"""Read the runtime's literal site arrays without executing JavaScript."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_runtime_sites(path=ROOT / "index.html"):
    text = Path(path).read_text(encoding="utf-8")
    initial = re.search(r"\bvar\s+siteData\s*=\s*", text)
    if not initial:
        raise ValueError("Runtime siteData declaration missing")
    decoder = json.JSONDecoder()
    sites, end = decoder.raw_decode(text[initial.end():])
    if not isinstance(sites, list):
        raise ValueError("Runtime siteData must be a literal array")
    for match in re.finditer(r"\bsiteData\s*=\s*siteData\.concat\(\s*", text):
        extra, _ = decoder.raw_decode(text[match.end():])
        if not isinstance(extra, list):
            raise ValueError("Runtime additions must be literal arrays")
        sites.extend(extra)
    ids = [str(site["id"]) for site in sites]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("Runtime site IDs are empty or duplicated")
    for site in sites:
        if not site.get("name") or not -90 <= float(site["lat"]) <= 90 or not -180 <= float(site["lon"]) <= 180:
            raise ValueError("Runtime name/coordinates invalid")
    return sites


def load_worker_sites(path=ROOT / "weather-proxy/src/sites.js"):
    text = Path(path).read_text(encoding="utf-8")
    marker = re.search(r"Object\.freeze\(\s*", text)
    if not marker:
        raise ValueError("Worker site registry missing")
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate Worker registry key")
            result[key] = value
        return result
    return json.JSONDecoder(object_pairs_hook=unique_pairs).raw_decode(text[marker.end():])[0]


def compare_sites(runtime, worker):
    by_id = {str(site["id"]): site for site in runtime}
    common = by_id.keys() & worker.keys()
    return {
        "runtimeSiteCount": len(runtime), "workerSiteCount": len(worker),
        "commonIdCount": len(common), "missingWorkerIds": sorted(by_id.keys() - worker.keys()),
        "workerOnlyIds": sorted(worker.keys() - by_id.keys()),
        "nameMismatchIds": sorted(sid for sid in common if by_id[sid]["name"] != worker[sid]["name"]),
        "coordinateMismatchIds": sorted(sid for sid in common if any(abs(float(by_id[sid][f]) - float(worker[sid][f])) > 1e-10 for f in ("lat", "lon"))),
        "pelagicMismatchIds": sorted(sid for sid in common if bool(by_id[sid].get("pelagic")) != bool(worker[sid].get("pelagic"))),
        "environmentMismatchIds": sorted(sid for sid in common if by_id[sid].get("env") != worker[sid].get("environment")),
    }
