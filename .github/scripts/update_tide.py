#!/usr/bin/env python3
"""Build tide_today.json from the KHOA tide forecast OpenAPI."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "birdmap_latest_v24_MasterDB_조석연동_업데이트용.xlsx"
OUTPUT_PATH = ROOT / "tide_today.json"
MAPPING_PATH = ROOT / "tide_station_mapping.json"
API_URL = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService"
REQUEST_TIMEOUT_SECONDS = 10
MAX_WORKERS = 8
KST = timezone(timedelta(hours=9))
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def cell_column(reference: str) -> str:
    match = re.match(r"[A-Z]+", reference)
    return match.group(0) if match else ""


def load_tide_sites() -> list[dict[str, str]]:
    if not DB_PATH.exists():
        raise RuntimeError(f"MasterDB not found: {DB_PATH}")
    with zipfile.ZipFile(DB_PATH) as workbook:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared.append("".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")))

        workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
        relationships = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        relation_targets = {
            relation.attrib["Id"]: relation.attrib["Target"].lstrip("/")
            for relation in relationships.findall("pkg:Relationship", NS)
        }
        sheet_path = ""
        for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
            if sheet.attrib.get("name") == "v24_tideMapping":
                relation_id = sheet.attrib[f"{{{NS['rel']}}}id"]
                sheet_path = relation_targets[relation_id]
                break
        if not sheet_path:
            raise RuntimeError("v24_tideMapping sheet not found")
        if not sheet_path.startswith("xl/"):
            sheet_path = f"xl/{sheet_path}"

        sheet_root = ET.fromstring(workbook.read(sheet_path))
        rows: list[dict[str, str]] = []
        for row in sheet_root.findall("main:sheetData/main:row", NS):
            values: dict[str, str] = {}
            for cell in row.findall("main:c", NS):
                column = cell_column(cell.attrib.get("r", ""))
                value_node = cell.find("main:v", NS)
                value = value_node.text if value_node is not None and value_node.text else ""
                if cell.attrib.get("t") == "s" and value:
                    value = shared[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                values[column] = value.strip()
            rows.append(values)

    if not rows:
        raise RuntimeError("v24_tideMapping sheet is empty")
    headers = {column: name for column, name in rows[0].items()}
    columns = {name: column for column, name in headers.items()}
    required = {"ID", "탐조권역", "tideUse", "tideStationName", "tideStationCode", "tideRuleKey"}
    missing = sorted(required - columns.keys())
    if missing:
        raise RuntimeError(f"Missing MasterDB columns: {', '.join(missing)}")

    targets: list[dict[str, str]] = []
    for row in rows[1:]:
        tide_use = row.get(columns["tideUse"], "").strip().upper()
        if tide_use not in {"Y", "YES", "예"}:
            continue
        targets.append(
            {
                "id": row.get(columns["ID"], "").strip(),
                "name": row.get(columns["탐조권역"], "").strip(),
                "dbStationName": row.get(columns["tideStationName"], "").strip(),
                "dbStationCode": row.get(columns["tideStationCode"], "").strip(),
                "ruleKey": row.get(columns["tideRuleKey"], "").strip(),
            }
        )
    return targets


def load_station_mapping() -> dict[str, Any]:
    if not MAPPING_PATH.exists():
        raise RuntimeError(f"Tide station mapping not found: {MAPPING_PATH}")
    try:
        mapping = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Invalid tide station mapping: {exc}") from exc
    sites = mapping.get("sites")
    if not isinstance(sites, dict):
        raise RuntimeError("tide_station_mapping.json sites must be an object")
    return sites


def resolve_tide_sites(
    targets: list[dict[str, str]], mapping_sites: dict[str, Any]
) -> tuple[list[dict[str, str]], int]:
    resolved: list[dict[str, str]] = []
    review_count = 0
    for target in targets:
        site = dict(target)
        if site["dbStationCode"]:
            site["stationCode"] = site["dbStationCode"]
            site["stationName"] = site["dbStationName"]
            site["mappingMethod"] = "master_db"
            resolved.append(site)
            continue
        mapped = mapping_sites.get(site["id"])
        if not isinstance(mapped, dict) or mapped.get("needsReview") is True:
            review_count += 1
            continue
        station_code = str(mapped.get("tideStationCode") or "").strip()
        station_name = str(mapped.get("tideStationName") or "").strip()
        if not station_code or not station_name:
            review_count += 1
            continue
        site["stationCode"] = station_code
        site["stationName"] = station_name
        site["mappingMethod"] = str(mapped.get("method") or "auto_mapping")
        resolved.append(site)
    return resolved, review_count


def xml_to_data(element: ET.Element) -> Any:
    children = list(element)
    if not children:
        return (element.text or "").strip()
    data: dict[str, Any] = {}
    for child in children:
        key = child.tag.rsplit("}", 1)[-1]
        value = xml_to_data(child)
        if key in data:
            if not isinstance(data[key], list):
                data[key] = [data[key]]
            data[key].append(value)
        else:
            data[key] = value
    return data


def request_prediction(
    api_key: str, station_code: str, date_text: str, diagnostic: bool = False
) -> dict[str, Any]:
    decoded_key = urllib.parse.unquote(api_key)
    parameters = {
        "serviceKey": decoded_key,
        "obsCode": station_code,
        "reqDate": date_text,
        "type": "json",
        "numOfRows": "300",
    }
    query = urllib.parse.urlencode(
        parameters
    )
    url = f"{API_URL}?{query}"
    if diagnostic:
        masked_parameters = dict(parameters)
        masked_parameters["serviceKey"] = "***"
        masked_query = urllib.parse.urlencode(
            {key: value for key, value in parameters.items() if key != "serviceKey"}
        )
        print(f"First request URL: {API_URL}?serviceKey=***&{masked_query}", flush=True)
        print(f"First request parameters: {masked_parameters}", flush=True)
    request = urllib.request.Request(
        url, headers={"Accept": "application/json, application/xml", "User-Agent": "birdmap-tide/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
            safe_body = body.replace(api_key, "***").replace(decoded_key, "***")
            content_type = response.headers.get("Content-Type", "")
            if diagnostic:
                response_format = "JSON" if body.lstrip().startswith(("{", "[")) else "XML" if body.lstrip().startswith("<") else "UNKNOWN"
                print(f"First request HTTP status: {response.status}", flush=True)
                print(f"First response format: {response_format} ({content_type})", flush=True)
                print(f"First response body (500 chars): {safe_body[:500]}", flush=True)
            if body.lstrip().startswith("<"):
                return xml_to_data(ET.fromstring(body))
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        safe_body = body.replace(api_key, "***").replace(decoded_key, "***")
        if diagnostic:
            response_format = "JSON" if body.lstrip().startswith(("{", "[")) else "XML" if body.lstrip().startswith("<") else "UNKNOWN"
            print(f"First request HTTP status: {exc.code}", flush=True)
            print(f"First response format: {response_format}", flush=True)
            print(f"First response body (500 chars): {safe_body[:500]}", flush=True)
        raise RuntimeError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{type(exc.reason).__name__}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError(f"Timeout after {REQUEST_TIMEOUT_SECONDS}s") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON: {exc}") from exc


def find_prediction_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        if any("tph_time" in item or "hl_code" in item for item in payload):
            return payload
    if isinstance(payload, dict):
        for value in payload.values():
            rows = find_prediction_rows(value)
            if rows:
                return rows
    if isinstance(payload, list):
        for value in payload:
            rows = find_prediction_rows(value)
            if rows:
                return rows
    return []


def event_time(row: dict[str, Any]) -> str:
    raw = str(row.get("tph_time") or row.get("time") or "").strip()
    match = re.search(r"(?:T|\s)(\d{2}:\d{2})(?::\d{2})?", raw)
    if match:
        return match.group(1)
    match = re.search(r"\b(\d{2}:\d{2})\b", raw)
    return match.group(1) if match else raw


def classify_event(row: dict[str, Any]) -> str:
    code = str(row.get("hl_code") or row.get("type") or "").strip().lower()
    if code in {"저조", "low", "l", "0"} or "저" in code or "low" in code:
        return "low"
    if code in {"고조", "high", "h", "1"} or "고" in code or "high" in code:
        return "high"
    return ""


def summary_for(rule_key: str) -> str:
    if rule_key == "island_ferry_tide":
        return "조석은 참고하고 여객선 운항 여부를 함께 확인하세요."
    if rule_key == "pelagic_wave_tide":
        return "조석과 파고, 출항 공지를 함께 확인하세요."
    return "간조 전후 2시간 추천"


def build_site_result(site: dict[str, str], payload: dict[str, Any], now: datetime) -> dict[str, Any]:
    rows = find_prediction_rows(payload)
    if not rows:
        raise RuntimeError("KHOA response contains no tide predictions")
    lows = [event_time(row) for row in rows if classify_event(row) == "low" and event_time(row)]
    highs = [event_time(row) for row in rows if classify_event(row) == "high" and event_time(row)]
    if not lows and not highs:
        raise RuntimeError("KHOA response contains no high/low tide events")
    return {
        "name": site["name"],
        "stationName": site["stationName"],
        "lowTide": ", ".join(lows) if lows else "정보 없음",
        "highTide": ", ".join(highs) if highs else "정보 없음",
        "summary": summary_for(site["ruleKey"]),
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "stale": False,
    }


def load_previous_sites() -> dict[str, Any]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous tide data unavailable: {exc}", flush=True)
        return {}
    sites = data.get("sites", {})
    return sites if isinstance(sites, dict) else {}


def main() -> None:
    targets = load_tide_sites()
    mapping_sites = load_station_mapping()
    sites, review_count = resolve_tide_sites(targets, mapping_sites)
    print(f"Loading {len(targets)} tide-enabled sites", flush=True)
    print(f"Verified mappings: {len(sites)}", flush=True)
    print(f"Review/excluded mappings: {review_count}", flush=True)
    if not sites:
        raise RuntimeError("No verified tide station mappings; existing tide_today.json preserved")
    api_key = os.environ.get("KHOA_API_KEY", "").strip()
    if not api_key:
        print("KHOA_API_KEY: not configured", flush=True)
        raise RuntimeError("GitHub Secret KHOA_API_KEY is not configured")
    print("KHOA_API_KEY: *** (configured)", flush=True)

    previous_sites = load_previous_sites()
    now = datetime.now(KST)
    date_text = now.strftime("%Y%m%d")
    results: dict[str, Any] = {}
    success_count = 0
    failed_count = 0
    reused_count = 0

    first_site = sites[0]
    print("Testing first tide station before full run", flush=True)
    first_payload = request_prediction(
        api_key, first_site["stationCode"], date_text, diagnostic=True
    )
    results[first_site["id"]] = build_site_result(first_site, first_payload, now)
    success_count = 1
    print(f"Site 1/{len(sites)} {first_site['name']}: OK", flush=True)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(request_prediction, api_key, site["stationCode"], date_text): (position, site)
            for position, site in enumerate(sites[1:], start=2)
        }
        for future in as_completed(futures):
            position, site = futures[future]
            try:
                payload = future.result()
                result = build_site_result(site, payload, now)
            except Exception as exc:
                failed_count += 1
                previous = previous_sites.get(site["id"])
                if isinstance(previous, dict):
                    result = dict(previous)
                    result["stale"] = True
                    result["error"] = str(exc) or type(exc).__name__
                    results[site["id"]] = result
                    reused_count += 1
                    print(f"Site {position}/{len(sites)} {site['name']}: {result['error']} - REUSED", flush=True)
                else:
                    print(f"Site {position}/{len(sites)} {site['name']}: {exc}", flush=True)
            else:
                results[site["id"]] = result
                success_count += 1
                print(f"Site {position}/{len(sites)} {site['name']}: OK", flush=True)

    print(f"Success: {success_count}", flush=True)
    print(f"Failed: {failed_count}", flush=True)
    print(f"Reused: {reused_count}", flush=True)
    if success_count == 0:
        raise RuntimeError("No successful KHOA API responses; existing tide_today.json preserved")

    output = {
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "KHOA Tide Forecast OpenAPI",
        "status": "ok" if failed_count == 0 else "partial",
        "siteCount": len(results),
        "successCount": success_count,
        "failedCount": failed_count,
        "reusedCount": reused_count,
        "sites": results,
    }
    temporary_path = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"{OUTPUT_PATH.name}: {len(results)} sites saved", flush=True)


if __name__ == "__main__":
    main()
