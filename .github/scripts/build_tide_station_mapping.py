#!/usr/bin/env python3
"""Validate curated per-site mappings; never remap sites by distance."""

from __future__ import annotations

import csv
import importlib.util
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "tide_station_mapping.json"
DATASET_PAGE = "https://www.data.go.kr/data/15146602/fileData.do"
DATASET_API = "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do"
DOWNLOAD_API = "https://www.data.go.kr/cmm/cmm/fileDownload.do"
PUBLIC_DATA_PK = "15146602"
PUBLIC_DATA_DETAIL_PK = "uddi:81b0665b-4f21-41e8-91f1-d3ecc4a7a3f1"
REQUEST_TIMEOUT_SECONDS = 20
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


def load_catalog() -> dict[str, dict[str, Any]]:
    path = Path(__file__).with_name("tide_official_stations.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    stations = data.get("stations", [])
    codes = [s["code"] for s in stations]
    if len(stations) < 50 or len(codes) != len(set(codes)):
        raise RuntimeError("Invalid official station catalog")
    return {s["code"]: s for s in stations}


def validate_mapping(mapping: dict[str, Any], targets: list[dict[str, Any]], catalog: dict[str, Any]) -> None:
    sites = mapping.get("sites", {})
    expected = {t["id"] for t in targets}
    if set(sites) != expected or mapping.get("siteCount") != len(expected):
        raise RuntimeError("Mapping must cover every tide-enabled site exactly once")
    for sid, site in sites.items():
        if site.get("mappingVersion") != 2:
            raise RuntimeError(f"Site {sid} needs an explicit reviewed mapping")
        code = site.get("tideStationCode")
        for candidate in site.get("candidates", []):
            if candidate["stationCode"] not in catalog:
                raise RuntimeError(f"Unverified candidate: {sid}")
        if not code:
            if not site.get("needsReview"):
                raise RuntimeError(f"Missing station {sid} must be marked for review")
            continue
        if code not in catalog:
            raise RuntimeError(f"Official station code unverified: {sid} {code}")
        name = site["tideStationName"]
        if {name, catalog[code]["name"]} - {"군산", "군산외항"} and name != catalog[code]["name"]:
            raise RuntimeError(f"Official station name mismatch: {sid} {code}")
    for sid, code in {"19": "DT_0018", "107": "SO_1268"}.items():
        if sites[sid]["tideStationCode"] != code:
            raise RuntimeError(f"Protected mapping changed: {sid}")
    if sites["52"].get("tideStationCode") == "DT_0013":
        raise RuntimeError("Dokdo must not use Ulleungdo observations")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Validate curated mappings; never auto-select stations")
    parser.add_argument("--record-live-support", action="store_true", help="Record support only from saved live today/tomorrow responses with matching codes")
    args = parser.parse_args()
    mapping = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    targets = update_tide.load_tide_sites()
    validate_mapping(mapping, targets, load_catalog())
    if args.record_live_support:
        daily = update_tide.read_optional_json(update_tide.OUTPUT_PATH)
        confirmed = 0
        for sid, entry in mapping["sites"].items():
            today = daily.get("sites", {}).get(sid, {})
            tomorrow = today.get("tomorrow", {})
            days = ((today, daily.get("date")), (tomorrow, daily.get("tomorrowDate")))
            if not all(date and day.get("date") == date and day.get("stationCode") == entry.get("tideStationCode")
                       and not day.get("stale") and update_tide.has_tide_data(day) and day.get("generatedAt")
                       for day, date in days):
                continue
            entry.update(apiSupport="verified", apiVerifiedAt=today["generatedAt"],
                         apiVerifiedDates=[daily["date"], daily["tomorrowDate"]])
            confirmed += 1
        validate_mapping(mapping, targets, load_catalog())
        OUTPUT_PATH.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Recorded saved live support for {confirmed} sites; station choices unchanged", flush=True)
    print(f"Validated {len(targets)} per-site mappings; no automatic station changes", flush=True)


if __name__ == "__main__":
    main()
