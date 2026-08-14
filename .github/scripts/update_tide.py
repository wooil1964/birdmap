#!/usr/bin/env python3
"""Build tide_today.json from the KHOA tide forecast OpenAPI."""

from __future__ import annotations

import json
import os
import re
import time
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
TIDE_MONTH_PATH = ROOT / "tide_month.json"
MAPPING_PATH = ROOT / "tide_station_mapping.json"
API_URL = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService"
REQUEST_TIMEOUT_SECONDS = 8
MAX_WORKERS = 4
MAX_RETRIES = 1
RETRY_DELAYS_SECONDS = (2,)
KST = timezone(timedelta(hours=9))
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}
ADDITIONAL_TIDE_SITES = (
    {"id": "7", "name": "교동도", "stationName": "강화대교", "stationCode": "DT_0032"},
    {"id": "13", "name": "화옹호", "stationName": "평택", "stationCode": "DT_0002"},
    {"id": "134", "name": "솔개공원", "stationName": "울산", "stationCode": "DT_0020"},
    {"id": "156", "name": "국화도", "stationName": "대산", "stationCode": "DT_0017"},
    {"id": "174", "name": "송지호", "stationName": "속초", "stationCode": "DT_0012"},
    {"id": "180", "name": "목포 남항·갓바위 해안", "stationName": "목포", "stationCode": "DT_0007"},
    {"id": "181", "name": "제주 예래생태공원·논짓물 하천", "stationName": "모슬포", "stationCode": "DT_0023"},
    {"id": "182", "name": "포항 형산강 하구", "stationName": "포항", "stationCode": "DT_0091"},
    {"id": "183", "name": "영덕 오십천 하구", "stationName": "후포", "stationCode": "DT_0011"},
    {"id": "185", "name": "사천 광포만", "stationName": "삼천포", "stationCode": "DT_0061"},
    {"id": "188", "name": "이천항", "stationName": "부산", "stationCode": "DT_0005", "ruleKey": "pelagic_wave_tide"},
)
FORECAST_STATION_OVERRIDES = {
    "17": ("안흥", "DT_0067"),
    "49": ("울산", "DT_0020"),
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
    target_ids = {target["id"] for target in targets}
    for additional in ADDITIONAL_TIDE_SITES:
        if additional["id"] in target_ids:
            continue
        targets.append(
            {
                "id": additional["id"],
                "name": additional["name"],
                "dbStationName": additional["stationName"],
                "dbStationCode": additional["stationCode"],
                "ruleKey": additional.get("ruleKey", "mudflat_high_tide"),
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
        override = FORECAST_STATION_OVERRIDES.get(site["id"])
        if override:
            site["stationName"], site["stationCode"] = override
            site["mappingMethod"] = "forecast_fallback"
            resolved.append(site)
            continue
        if site["dbStationCode"]:
            site["stationCode"] = site["dbStationCode"]
            site["stationName"] = site["dbStationName"]
            site["mappingMethod"] = "master_db"
            resolved.append(site)
            continue
        mapped = mapping_sites.get(site["id"])
        if not isinstance(mapped, dict):
            review_count += 1
            continue
        if mapped.get("needsReview") is True:
            review_count += 1
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
    for attempt in range(MAX_RETRIES + 1):
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
            error_message = f"HTTP {exc.code}"
            if diagnostic:
                response_format = "JSON" if body.lstrip().startswith(("{", "[")) else "XML" if body.lstrip().startswith("<") else "UNKNOWN"
                print(f"First request HTTP status: {exc.code}", flush=True)
                print(f"First response format: {response_format}", flush=True)
                print(f"First response body (500 chars): {safe_body[:500]}", flush=True)
            if attempt >= MAX_RETRIES:
                raise RuntimeError(error_message) from exc
        except urllib.error.URLError as exc:
            error_message = f"{type(exc.reason).__name__}: {exc.reason}"
            if attempt >= MAX_RETRIES:
                raise RuntimeError(error_message) from exc
        except TimeoutError as exc:
            error_message = f"Timeout after {REQUEST_TIMEOUT_SECONDS}s"
            if attempt >= MAX_RETRIES:
                raise RuntimeError(error_message) from exc
        except json.JSONDecodeError as exc:
            error_message = f"Invalid JSON: {exc}"
            if attempt >= MAX_RETRIES:
                raise RuntimeError(error_message) from exc
        delay = RETRY_DELAYS_SECONDS[min(attempt, len(RETRY_DELAYS_SECONDS) - 1)]
        if diagnostic:
            print(
                f"First request attempt {attempt + 1}/{MAX_RETRIES + 1} failed: "
                f"{error_message}; retrying in {delay}s",
                flush=True,
            )
        time.sleep(delay)
    raise RuntimeError("KHOA request failed after retries")


def find_prediction_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        response = payload.get("response")
        body = response.get("body") if isinstance(response, dict) else None
        items = body.get("items") if isinstance(body, dict) else None
        item = items.get("item") if isinstance(items, dict) else None
        if isinstance(item, dict):
            item = [item]
        if isinstance(item, list) and all(isinstance(row, dict) for row in item):
            return item
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        if any(
            "predcDt" in item
            or "predcTdlvl" in item
            or "predcTdlv" in item
            or "extrSe" in item
            or "extrSeCd" in item
            or "tph_time" in item
            or "hl_code" in item
            for item in payload
        ):
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
    raw = str(
        row.get("predcDt")
        or row.get("predcDateTime")
        or row.get("tph_time")
        or row.get("time")
        or ""
    ).strip()
    match = re.search(r"(?:T|\s)(\d{2}:\d{2})(?::\d{2})?", raw)
    if match:
        return match.group(1)
    match = re.search(r"\b(\d{2}:\d{2})\b", raw)
    return match.group(1) if match else raw


def classify_event(row: dict[str, Any]) -> str:
    code = str(
        row.get("extrSe")
        or row.get("extrSeCd")
        or row.get("hl_code")
        or row.get("hlCode")
        or row.get("type")
        or ""
    ).strip().lower()
    compact = re.sub(r"[.\s_-]", "", code)
    if compact in {"저조", "low", "l", "lw", "0", "2", "4"} or "저" in code or "low" in code:
        return "low"
    if compact in {"고조", "high", "h", "hw", "1", "3"} or "고" in code or "high" in code:
        return "high"
    return ""


def event_level(row: dict[str, Any]) -> str:
    for key in (
        "predcTdlvl",
        "predcTdlv",
        "predcTideLevel",
        "tideLevel",
        "tph_level",
        "level",
    ):
        value = str(row.get(key) or "").strip()
        if value:
            return re.sub(r"\s*cm$", "", value, flags=re.I).strip()
    for key, raw_value in row.items():
        normalized = re.sub(r"[^a-z]", "", str(key).lower())
        if "predc" in normalized and ("tdlv" in normalized or "tidelevel" in normalized):
            value = str(raw_value or "").strip()
            if value:
                return re.sub(r"\s*cm$", "", value, flags=re.I).strip()
    return ""


def summary_for(rule_key: str) -> str:
    if rule_key == "island_ferry_tide":
        return "조석은 참고하고 여객선 운항 여부를 함께 확인하세요."
    if rule_key == "pelagic_wave_tide":
        return "조석과 파고, 출항 공지를 함께 확인하세요."
    return "만조 전후 2시간 추천"


def build_site_result(site: dict[str, str], payload: dict[str, Any], now: datetime) -> dict[str, Any]:
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
        "name": site["name"],
        "stationName": site["stationName"],
        "lowTide": ", ".join(lows) if lows else "정보 없음",
        "highTide": ", ".join(highs) if highs else "정보 없음",
        "lowTideLevel": ", ".join(low_levels) if low_levels else "정보 없음",
        "highTideLevel": ", ".join(high_levels) if high_levels else "정보 없음",
        "summary": summary_for(site["ruleKey"]),
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "stale": False,
    }
def build_tomorrow_result(
    site: dict[str, str], payload: dict[str, Any], now: datetime
) -> dict[str, Any]:
    result = build_site_result(site, payload, now)
    return {
        "lowTide": result["lowTide"],
        "highTide": result["highTide"],
        "lowTideLevel": result["lowTideLevel"],
        "highTideLevel": result["highTideLevel"],
    }



def load_previous_sites(expected_date: str) -> dict[str, Any]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous tide data unavailable: {exc}", flush=True)
        return {}
    if data.get("date") != expected_date:
        print("Previous tide data belongs to a different KST date; reuse disabled", flush=True)
        return {}
    sites = data.get("sites", {})
    return sites if isinstance(sites, dict) else {}


def load_previous_tomorrow_sites(expected_date: str) -> dict[str, Any]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous tomorrow tide data unavailable: {exc}", flush=True)
        return {}
    if data.get("tomorrowDate") != expected_date:
        return {}
    sites = data.get("sites")
    if not isinstance(sites, dict):
        return {}
    results: dict[str, Any] = {}
    for site_id, site in sites.items():
        if not isinstance(site, dict) or not isinstance(site.get("tomorrow"), dict):
            continue
        tomorrow = site["tomorrow"]
        results[str(site_id)] = {
            "name": site.get("name", ""),
            "stationName": site.get("stationName", ""),
            "lowTide": tomorrow.get("lowTide", ""),
            "highTide": tomorrow.get("highTide", ""),
            "lowTideLevel": tomorrow.get("lowTideLevel", ""),
            "highTideLevel": tomorrow.get("highTideLevel", ""),
            "summary": site.get("summary", ""),
            "updated": site.get("updated", ""),
            "stale": True,
            "fallbackSource": "previous_tomorrow",
        }
    if results:
        print(
            f"Previous tide_today.json tomorrow fallback available for {expected_date}: "
            f"{len(results)} site(s)",
            flush=True,
        )
    return results


def load_monthly_day_results(date_iso: str, now: datetime, include_site_fields: bool) -> dict[str, Any]:
    if not TIDE_MONTH_PATH.exists():
        return {}
    try:
        data = json.loads(TIDE_MONTH_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Monthly tide fallback unavailable: {exc}", flush=True)
        return {}
    sites = data.get("sites")
    if not isinstance(sites, dict):
        return {}
    results: dict[str, Any] = {}
    for site_id, site in sites.items():
        if not isinstance(site, dict) or not isinstance(site.get("days"), list):
            continue
        day = next(
            (
                item
                for item in site["days"]
                if isinstance(item, dict) and item.get("date") == date_iso
            ),
            None,
        )
        if not isinstance(day, dict):
            continue
        result = {
            "lowTide": day.get("lowTide", ""),
            "highTide": day.get("highTide", ""),
            "lowTideLevel": day.get("lowTideLevel", ""),
            "highTideLevel": day.get("highTideLevel", ""),
            "stale": True,
            "fallbackSource": "tide_month",
            "monthlyGeneratedAt": data.get("generatedAt", ""),
        }
        if include_site_fields:
            result.update(
                {
                    "name": site.get("name", ""),
                    "stationName": site.get("stationName", ""),
                    "summary": summary_for(str(site.get("tideRuleKey") or "")),
                    "updated": now.strftime("%Y-%m-%d %H:%M KST"),
                }
            )
        results[str(site_id)] = result
    if results:
        print(
            f"Monthly tide fallback available for {date_iso}: {len(results)} site(s)",
            flush=True,
        )
    return results


def first_available(*sources: dict[str, Any]):
    def lookup(site_id: str) -> Any:
        for source in sources:
            value = source.get(site_id)
            if isinstance(value, dict):
                return value
        return None

    return lookup


def fetch_and_build(
    api_key: str,
    groups: list[list[dict[str, str]]],
    date_text: str,
    now: datetime,
    site_positions: dict[str, int],
    total_targets: int,
    build_fn: Any,
    previous_for: Any,
    label: str,
) -> tuple[dict[str, Any], int, int, int]:
    results: dict[str, Any] = {}
    success_count = 0
    failed_count = 0
    reused_count = 0
    if not groups:
        return results, success_count, failed_count, reused_count

    def handle_failure(group: list[dict[str, str]], exc: Exception) -> None:
        nonlocal success_count, failed_count, reused_count
        for site in group:
            failed_count += 1
            previous = previous_for(site["id"])
            if isinstance(previous, dict):
                result = dict(previous)
                result["stale"] = True
                result["error"] = str(exc) or type(exc).__name__
                results[site["id"]] = result
                success_count += 1
                reused_count += 1
                state = f"{result['error']} - REUSED"
            else:
                state = str(exc) or type(exc).__name__
            print(
                f"[{label}] Site {site_positions[site['id']]}/{total_targets} "
                f"{site['name']}: {state}",
                flush=True,
            )

    first_group = groups[0]
    first_site = first_group[0]
    print(f"[{label}] Testing first tide station before full run", flush=True)
    try:
        first_payload = request_prediction(
            api_key, first_site["stationCode"], date_text, diagnostic=True
        )
        for site in first_group:
            results[site["id"]] = build_fn(site, first_payload, now)
            success_count += 1
            print(
                f"[{label}] Site {site_positions[site['id']]}/{total_targets} {site['name']}: OK",
                flush=True,
            )
    except Exception as exc:
        handle_failure(first_group, exc)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                request_prediction, api_key, group[0]["stationCode"], date_text
            ): group
            for group in groups[1:]
        }
        for future in as_completed(futures):
            group = futures[future]
            try:
                payload = future.result()
            except Exception as exc:
                handle_failure(group, exc)
            else:
                for site in group:
                    try:
                        result = build_fn(site, payload, now)
                    except Exception as exc:
                        handle_failure([site], exc)
                    else:
                        results[site["id"]] = result
                        success_count += 1
                        print(
                            f"[{label}] Site {site_positions[site['id']]}/{total_targets} "
                            f"{site['name']}: OK",
                            flush=True,
                        )

    return results, success_count, failed_count, reused_count
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

    now = datetime.now(KST)
    date_text = now.strftime("%Y%m%d")
    date_iso = now.strftime("%Y-%m-%d")
    tomorrow = now + timedelta(days=1)
    tomorrow_date_text = tomorrow.strftime("%Y%m%d")  
    previous_sites = load_previous_sites(date_iso)
    previous_tomorrow_sites = load_previous_tomorrow_sites(date_iso)
    monthly_today_sites = load_monthly_day_results(date_iso, now, True)
    monthly_tomorrow_sites = load_monthly_day_results(tomorrow.strftime("%Y-%m-%d"), tomorrow, False)
    results: dict[str, Any] = {}
    success_count = 0
    resolved_ids = {site["id"] for site in sites}
    unavailable_targets = [target for target in targets if target["id"] not in resolved_ids]
    failed_count = len(unavailable_targets)
    reused_count = 0
    site_positions = {target["id"]: position for position, target in enumerate(targets, start=1)}

    for target in unavailable_targets:
        results[target["id"]] = {
            "name": target["name"],
            "stationName": "관측소 없음",
            "lowTide": "관측소 없음",
            "highTide": "관측소 없음",
            "lowTideLevel": "관측소 없음",
            "highTideLevel": "관측소 없음",
            "summary": "80km 이내에 사용 가능한 공식 조석관측소가 없습니다.",
            "updated": now.strftime("%Y-%m-%d %H:%M KST"),
            "stale": False,
            "unavailable": True,
            "error": "관측소 없음",
        }
        print(
            f"Site {site_positions[target['id']]}/{len(targets)} "
            f"{target['name']}: 관측소 없음",
            flush=True,
        )

    station_groups: dict[str, list[dict[str, str]]] = {}
    for site in sites:
        station_groups.setdefault(site["stationCode"], []).append(site)
    groups = list(station_groups.values())
    today_results, success_count, today_failed, reused_count = fetch_and_build(
        api_key, groups, date_text, now, site_positions, len(targets),
        build_site_result,
        first_available(previous_sites, previous_tomorrow_sites, monthly_today_sites),
        "today",
    )
    results.update(today_results)
    failed_count += today_failed

    tomorrow_results, tomorrow_success, tomorrow_failed, tomorrow_reused = fetch_and_build(
        api_key, groups, tomorrow_date_text, tomorrow, site_positions, len(targets),
        build_tomorrow_result,
        first_available(
            {
                site_id: site.get("tomorrow")
                for site_id, site in previous_sites.items()
                if isinstance(site, dict) and isinstance(site.get("tomorrow"), dict)
            },
            monthly_tomorrow_sites,
        ),
        "tomorrow",
    )
    for site_id, tomorrow_result in tomorrow_results.items():
        if site_id in results:
            results[site_id]["tomorrow"] = tomorrow_result

    print(f"Success: {success_count}", flush=True)
    print(f"Failed: {failed_count}", flush=True)
    print(f"Reused: {reused_count}", flush=True)
    if success_count == 0:
        raise RuntimeError("No successful KHOA API responses; existing tide_today.json preserved")

    output = {
        "date": date_iso,
            "tomorrowDate": tomorrow.strftime("%Y-%m-%d"),
        "tomorrowSuccessCount": tomorrow_success,
        "tomorrowFailedCount": tomorrow_failed,
        "tomorrowReusedCount": tomorrow_reused,
        "tomorrowStatus": "ok" if tomorrow_failed == 0 else "partial",    
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "KHOA Tide Forecast OpenAPI",
        "status": "ok" if failed_count == 0 else "partial",
        "siteCount": len(results),
        "successCount": success_count,
        "liveSuccessCount": success_count - reused_count,
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
