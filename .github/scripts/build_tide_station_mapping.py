#!/usr/bin/env python3
"""Map BirdMap tide sites to the nearest official KHOA tide station."""

from __future__ import annotations

import csv
import importlib.util
import io
import json
import math
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / "index.html"
OUTPUT_PATH = ROOT / "tide_station_mapping.json"
DATASET_PAGE = "https://www.data.go.kr/data/15146602/fileData.do"
DATASET_API = "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do"
DOWNLOAD_API = "https://www.data.go.kr/cmm/cmm/fileDownload.do"
PUBLIC_DATA_PK = "15146602"
PUBLIC_DATA_DETAIL_PK = "uddi:81b0665b-4f21-41e8-91f1-d3ecc4a7a3f1"
REQUEST_TIMEOUT_SECONDS = 20
REVIEW_DISTANCE_KM = 80.0
AMBIGUITY_GAP_KM = 5.0
KST = timezone(timedelta(hours=9))
SPECIAL_GUNSAN_SITES = ("유부도", "새만금", "금강호", "금강하구")
FORECAST_STATION_OVERRIDES = {
    "17": "DT_0067",  # 태안 해안 -> 안흥
    "25": "DT_0092",  # 순천만 -> 여호항
    "49": "DT_0020",  # 호미곶 -> 울산
    "50": "DT_0020",  # 청림운동장 -> 울산
    "71": "DT_0092",  # 보성 벌교갯벌 -> 여호항
}
NO_FORECAST_STATION_SITE_IDS = {"51", "52", "55"}

UPDATE_TIDE_PATH = Path(__file__).with_name("update_tide.py")
UPDATE_TIDE_SPEC = importlib.util.spec_from_file_location("birdmap_update_tide", UPDATE_TIDE_PATH)
if UPDATE_TIDE_SPEC is None or UPDATE_TIDE_SPEC.loader is None:
    raise RuntimeError(f"Cannot load {UPDATE_TIDE_PATH}")
update_tide = importlib.util.module_from_spec(UPDATE_TIDE_SPEC)
UPDATE_TIDE_SPEC.loader.exec_module(update_tide)


def request_bytes(request: urllib.request.Request) -> bytes:
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {request.full_url}")
        return response.read()


def discover_official_csv() -> tuple[bytes, str]:
    body = urllib.parse.urlencode(
        {
            "publicDataDetailPk": PUBLIC_DATA_DETAIL_PK,
            "publicDataPk": PUBLIC_DATA_PK,
            "atchFileId": "",
            "fileDetailSn": "1",
        }
    ).encode("utf-8")
    metadata_request = urllib.request.Request(
        DATASET_API,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "birdmap-tide-mapping/1.0",
        },
    )
    metadata = json.loads(request_bytes(metadata_request).decode("utf-8"))
    if metadata.get("status") is not True:
        raise RuntimeError("Official station file metadata request failed")
    attachment_id = str(metadata.get("atchFileId") or "").strip()
    file_detail_sn = str(metadata.get("fileDetailSn") or "1").strip()
    if not attachment_id:
        raise RuntimeError("Official station file attachment ID is missing")
    download_url = DOWNLOAD_API + "?" + urllib.parse.urlencode(
        {
            "atchFileId": attachment_id,
            "fileDetailSn": file_detail_sn,
            "insertDataPrcus": "N",
        }
    )
    csv_request = urllib.request.Request(
        download_url,
        headers={"Accept": "text/csv,*/*", "User-Agent": "birdmap-tide-mapping/1.0"},
    )
    return request_bytes(csv_request), attachment_id


def load_official_stations() -> tuple[list[dict[str, Any]], str]:
    raw, attachment_id = discover_official_csv()
    text = raw.decode("cp949")
    rows = list(csv.DictReader(io.StringIO(text)))
    required = {
        "조위관측소 고유번호",
        "관측소 유형",
        "조위관측소 명",
        "조위관측소 위도",
        "조위관측소 경도",
    }
    if not rows or not required.issubset(rows[0]):
        raise RuntimeError("Official station CSV columns are invalid")
    stations: list[dict[str, Any]] = []
    for row in rows:
        if row["관측소 유형"].strip() != "조위관측소":
            continue
        stations.append(
            {
                "code": row["조위관측소 고유번호"].strip(),
                "name": row["조위관측소 명"].strip(),
                "lat": float(row["조위관측소 위도"]),
                "lon": float(row["조위관측소 경도"]),
            }
        )
    codes = [station["code"] for station in stations]
    if len(stations) < 50 or len(codes) != len(set(codes)):
        raise RuntimeError(f"Official station list failed validation: {len(stations)} stations")
    return stations, attachment_id


def load_site_data() -> dict[str, dict[str, Any]]:
    html = HTML_PATH.read_text(encoding="utf-8")
    match = re.search(r"var siteData=(\[.*?\]);\s*var markerRegistry=", html, re.S)
    if not match:
        raise RuntimeError("index.html siteData not found")
    sites = json.loads(match.group(1))
    if len(sites) < 183:
        raise RuntimeError(f"siteData count is unexpectedly low: {len(sites)}")
    ids = [str(site["id"]) for site in sites]
    duplicate_ids = sorted({site_id for site_id in ids if ids.count(site_id) > 1})
    if duplicate_ids:
        raise RuntimeError(f"Duplicate siteData IDs found: {', '.join(duplicate_ids)}")
    print(f"siteData count: {len(sites)}", flush=True)
    return {str(site["id"]): site for site in sites}


def normalize_name(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def ranked_stations(site: dict[str, Any], stations: list[dict[str, Any]]) -> list[tuple[float, dict[str, Any]]]:
    return sorted(
        (
            (
                haversine_km(float(site["lat"]), float(site["lon"]), station["lat"], station["lon"]),
                station,
            )
            for station in stations
        ),
        key=lambda item: item[0],
    )


def choose_station(
    site_id: str, site: dict[str, Any], stations: list[dict[str, Any]]
) -> dict[str, Any]:
    ranked = ranked_stations(site, stations)
    site_name = normalize_name(str(site["name"]))
    selected_distance, selected = ranked[0]
    method = "nearest"
    needs_review = False

    if site.get("island"):
        name_matches = [
            item
            for item in ranked
            if len(normalize_name(item[1]["name"])) >= 2
            and normalize_name(item[1]["name"]) in site_name
        ]
        if name_matches:
            selected_distance, selected = name_matches[0]
            method = "name_match"

    if any(normalize_name(name) in site_name for name in SPECIAL_GUNSAN_SITES):
        gunsan_candidates = [item for item in ranked if "군산" in item[1]["name"]]
        if gunsan_candidates:
            selected_distance, selected = gunsan_candidates[0]
            method = "special_rule_gunsan_review"
            needs_review = True

    if selected_distance >= REVIEW_DISTANCE_KM:
        needs_review = True
        method += "_distance_review"
    if method == "nearest" and len(ranked) > 1 and ranked[1][0] - ranked[0][0] < AMBIGUITY_GAP_KM:
        needs_review = True
        method = "nearest_ambiguous_review"

    if site_id in NO_FORECAST_STATION_SITE_IDS:
        return {
            "name": site["name"],
            "lat": float(site["lat"]),
            "lon": float(site["lon"]),
            "tideStationCode": "",
            "tideStationName": "관측소 없음",
            "stationLat": None,
            "stationLon": None,
            "distanceKm": None,
            "needsReview": True,
            "method": "no_forecast_station_within_80km",
        }

    override_code = FORECAST_STATION_OVERRIDES.get(site_id)
    if override_code:
        override = next((station for station in stations if station["code"] == override_code), None)
        if override is None:
            raise RuntimeError(f"Official fallback station not found: {override_code}")
        override_distance = haversine_km(
            float(site["lat"]), float(site["lon"]), override["lat"], override["lon"]
        )
        if override_distance >= REVIEW_DISTANCE_KM:
            raise RuntimeError(
                f"Fallback station exceeds {REVIEW_DISTANCE_KM:.0f}km: "
                f"site {site_id}, {override_code}, {override_distance:.2f}km"
            )
        selected = override
        selected_distance = override_distance
        needs_review = False
        method = "forecast_fallback"

    return {
        "name": site["name"],
        "lat": float(site["lat"]),
        "lon": float(site["lon"]),
        "tideStationCode": selected["code"],
        "tideStationName": selected["name"],
        "stationLat": selected["lat"],
        "stationLon": selected["lon"],
        "distanceKm": round(selected_distance, 2),
        "needsReview": needs_review,
        "method": method,
    }


def reuse_existing_mapping(reason: Exception) -> bool:
    if not OUTPUT_PATH.exists():
        return False
    try:
        existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    sites = existing.get("sites")
    if (
        existing.get("source") != "KHOA official tide station list"
        or existing.get("siteCount") not in {88, 92, 98, 99}
        or not isinstance(sites, dict)
        or len(sites) not in {88, 92, 98, 99}
    ):
        return False
    print(f"Official station refresh failed: {reason}", flush=True)
    print("Reusing validated tide_station_mapping.json", flush=True)
    return True


def main() -> None:
    try:
        stations, attachment_id = load_official_stations()
    except Exception as exc:
        if reuse_existing_mapping(exc):
            return
        raise
    site_data = load_site_data()
    targets = update_tide.load_tide_sites()
    if len(targets) != 99:
        raise RuntimeError(f"Tide target count is not 99: {len(targets)}")

    mapped_sites: dict[str, Any] = {}
    for position, target in enumerate(targets, start=1):
        site = site_data.get(target["id"])
        if not site:
            raise RuntimeError(f"siteData ID not found: {target['id']}")
        result = choose_station(target["id"], site, stations)
        mapped_sites[target["id"]] = result
        state = "REVIEW" if result["needsReview"] else "OK"
        distance = (
            f"{result['distanceKm']:.2f}km"
            if result["distanceKm"] is not None
            else "distance unavailable"
        )
        print(
            f"Site {position}/{len(targets)} {site['name']}: "
            f"{result['tideStationName']} {distance} {state}",
            flush=True,
        )

    review_count = sum(1 for site in mapped_sites.values() if site["needsReview"])
    mapped_count = len(mapped_sites) - review_count
    now = datetime.now(KST)
    output = {
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "KHOA official tide station list",
        "sourceUrl": DATASET_PAGE,
        "sourceDataset": "해양수산부 국립해양조사원_조위관측소 운영 현황_20250818",
        "sourceAttachmentId": attachment_id,
        "stationCount": len(stations),
        "siteCount": len(mapped_sites),
        "mappedCount": mapped_count,
        "reviewCount": review_count,
        "reviewDistanceKm": REVIEW_DISTANCE_KM,
        "sites": mapped_sites,
    }
    temporary_path = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"Mapped: {mapped_count}", flush=True)
    print(f"Needs review: {review_count}", flush=True)
    print(f"{OUTPUT_PATH.name}: {len(mapped_sites)} sites saved", flush=True)


if __name__ == "__main__":
    main()
