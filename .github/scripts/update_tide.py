#!/usr/bin/env python3
"""Build tide_today.json from the KHOA tide forecast OpenAPI."""

from __future__ import annotations

import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from threading import Lock
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
REQUEST_TIMEOUT_SECONDS = 15
MAX_WORKERS = 2
MAX_RETRIES = 1
RETRY_DELAYS_SECONDS = (3,)
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
    "19": ("군산외항", "DT_0018"),
    "49": ("울산", "DT_0020"),
    "107": ("궁평항", "SO_1268"),
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
        mapped = mapping_sites.get(site["id"])
        # Reviewed per-site mappings take precedence over legacy DB/overrides.
        if isinstance(mapped, dict) and mapped.get("mappingVersion") == 2:
            site["needsReview"] = bool(mapped.get("needsReview"))
            site["codeVerified"] = bool(mapped.get("codeVerified"))
            site["reviewReason"] = str(mapped.get("reviewReason") or "")
            review_count += int(site["needsReview"])
            if mapped.get("tideStationCode"):
                site["stationCode"] = mapped["tideStationCode"]
                site["stationName"] = mapped["tideStationName"]
                site["mappingMethod"] = mapped["method"]
                resolved.append(site)
            continue
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


class RequestStats:
    """Count real HTTP attempts, including retries, across worker threads."""

    def __init__(self, budget_seconds: float = 600):
        self.deadline = time.monotonic() + budget_seconds
        self.lock = Lock()
        self.attempts: dict[str, int] = {}
        self.timeouts = 0
        self.budget_skips = 0

    def remaining(self) -> float:
        return self.deadline - time.monotonic()

    def record(self, station_code: str, date_text: str) -> None:
        with self.lock:
            key = f"{station_code}:{date_text}"
            self.attempts[key] = self.attempts.get(key, 0) + 1

    def timeout(self) -> None:
        with self.lock:
            self.timeouts += 1

    def budget_skip(self) -> None:
        with self.lock:
            self.budget_skips += 1

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "apiRequestCount": sum(self.attempts.values()),
                "requestedStationDateCount": len(self.attempts),
                "retryCount": sum(n - 1 for n in self.attempts.values()),
                "timeoutCount": self.timeouts,
                "budgetSkippedRequestCount": self.budget_skips,
                "requestAttemptsByStationDate": dict(sorted(self.attempts.items())),
            }


class PredictionError(RuntimeError):
    def __init__(self, message: str, retryable: bool = False, timeout: bool = False):
        super().__init__(message)
        self.retryable = retryable
        self.timeout = timeout


def check_api_status(payload: Any) -> None:
    if not isinstance(payload, dict):
        return
    response = payload.get("response", payload)
    if not isinstance(response, dict):
        return
    header = response.get("header", response.get("cmmMsgHeader", {}))
    if not isinstance(header, dict):
        return
    code = str(header.get("resultCode", header.get("returnReasonCode", ""))).strip()
    if code and code not in {"0", "00", "000", "0000", "200", "NORMAL_SERVICE"}:
        # Do not persist raw server messages: they can contain a request URL/key.
        raise PredictionError(f"KHOA resultCode={code}", code in {"01", "04", "05", "23"}, code == "05")


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


def safe_error(exc: Exception) -> str:
    """Never persist arbitrary transport exceptions or authenticated URLs."""
    message = str(exc) if isinstance(exc, PredictionError) else type(exc).__name__
    key = os.environ.get("KHOA_API_KEY", "").strip()
    if key:
        decoded = urllib.parse.unquote(key)
        for value in sorted({key, decoded, urllib.parse.quote_plus(decoded), urllib.parse.quote(decoded, safe="")}, key=len, reverse=True):
            message = message.replace(value, "[REDACTED]")
    return re.sub(r"(?i)(serviceKey\s*[=:]\s*)[^&\s]+", r"\1[REDACTED]", message)


def request_prediction(
    api_key: str, station_code: str, date_text: str, diagnostic: bool = False,
    stats: RequestStats | None = None,
) -> dict[str, Any]:
    parameters = {
        "serviceKey": urllib.parse.unquote(api_key), "obsCode": station_code,
        "reqDate": date_text, "type": "json", "numOfRows": "300", "pageNo": "1",
    }
    request = urllib.request.Request(
        f"{API_URL}?{urllib.parse.urlencode(parameters)}",
        headers={"Accept": "application/json, application/xml", "User-Agent": "birdmap-tide/2.0"},
    )
    if diagnostic:
        print(f"KHOA station={station_code} date={date_text} timeout={REQUEST_TIMEOUT_SECONDS}s", flush=True)
    for attempt in range(MAX_RETRIES + 1):
        if stats and stats.remaining() <= 0:
            stats.budget_skip()
            raise PredictionError("KHOA request budget exhausted")
        timeout = min(REQUEST_TIMEOUT_SECONDS, stats.remaining()) if stats else REQUEST_TIMEOUT_SECONDS
        if stats:
            stats.record(station_code, date_text)
        try:
            with urllib.request.urlopen(request, timeout=max(0.01, timeout)) as response:
                body = response.read().decode("utf-8", errors="replace")
            payload = xml_to_data(ET.fromstring(body)) if body.lstrip().startswith("<") else json.loads(body)
            check_api_status(payload)
            # Validate dates before sharing a station response with multiple sites.
            prediction_rows_for_date(payload, datetime.strptime(date_text, "%Y%m%d").date().isoformat())
            return payload
        except urllib.error.HTTPError as exc:
            error = PredictionError(f"KHOA HTTP {exc.code}", exc.code in {408, 429, 500, 502, 503, 504}, exc.code in {408, 504})
        except (TimeoutError, urllib.error.URLError) as exc:
            reason = exc.reason if isinstance(exc, urllib.error.URLError) else exc
            timed_out = isinstance(reason, TimeoutError) or "timed out" in str(reason).lower()
            error = PredictionError("KHOA timeout" if timed_out else f"KHOA transport error: {type(reason).__name__}", True, timed_out)
        except (json.JSONDecodeError, ET.ParseError):
            error = PredictionError("KHOA malformed JSON/XML", True)
        except PredictionError as exc:
            error = exc
        if error.timeout and stats:
            stats.timeout()
        if not error.retryable or attempt >= MAX_RETRIES:
            raise error
        delay = RETRY_DELAYS_SECONDS[min(attempt, len(RETRY_DELAYS_SECONDS) - 1)]
        if stats and stats.remaining() <= delay:
            stats.budget_skip()
            raise error
        time.sleep(delay)
    raise PredictionError("KHOA request failed after retries")


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
        "predcTdlvVl",
        "predcTdlvl",
        "predcTdlv",
        "predcTideLevel",
        "tideLevel",
        "tph_level",
        "level",
    ):
        value = str(row[key]).strip() if row.get(key) is not None else ""
        if value:
            return re.sub(r"\s*cm$", "", value, flags=re.I).strip()
    for key, raw_value in row.items():
        normalized = re.sub(r"[^a-z]", "", str(key).lower())
        if "predc" in normalized and ("tdlv" in normalized or "tidelevel" in normalized):
            value = str(raw_value).strip() if raw_value is not None else ""
            if value:
                return re.sub(r"\s*cm$", "", value, flags=re.I).strip()
    return ""


def summary_for(rule_key: str) -> str:
    if rule_key == "island_ferry_tide":
        return "조석은 참고하고 여객선 운항 여부를 함께 확인하세요."
    if rule_key == "pelagic_wave_tide":
        return "조석과 파고, 출항 공지를 함께 확인하세요."
    return "탐조지별 검증된 조석 기준과 현장 여건을 확인하세요."


def prediction_rows_for_date(payload: Any, date_iso: str) -> list[dict[str, Any]]:
    check_api_status(payload)
    rows = find_prediction_rows(payload)
    if not rows:
        raise PredictionError("KHOA response contains no tide predictions")
    for row in rows:
        raw = str(row.get("predcDt") or row.get("predcDateTime") or row.get("tph_time") or row.get("time") or "")
        if not re.match(re.escape(date_iso) + r"[ T]", raw) or not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", event_time(row)):
            raise PredictionError(f"KHOA prediction date/time mismatch: expected {date_iso}")
        if not classify_event(row):
            raise PredictionError("KHOA unknown high/low tide event")
        try:
            valid_level = math.isfinite(float(event_level(row)))
        except ValueError:
            valid_level = False
        if not valid_level:
            raise PredictionError("KHOA missing or invalid tide level")
    return sorted(rows, key=event_time)


def build_site_result(site: dict[str, Any], payload: Any, now: datetime, date_iso: str | None = None) -> dict[str, Any]:
    date_iso = date_iso or now.date().isoformat()
    rows = prediction_rows_for_date(payload, date_iso)
    aliases = {"군산외항": "군산"}
    expected_name = aliases.get(site["stationName"], site["stationName"])
    for row in rows:
        returned_code = row.get("obsCode") or row.get("stationCode")
        returned_name = row.get("obsvtrNm")
        if returned_code and str(returned_code) != site["stationCode"]:
            raise PredictionError("KHOA station code mismatch")
        if returned_name and aliases.get(str(returned_name).strip(), str(returned_name).strip()) != expected_name:
            raise PredictionError("KHOA station name mismatch")
    result = {
        "name": site["name"], "stationName": site["stationName"], "stationCode": site["stationCode"],
        "date": date_iso, "summary": summary_for(site["ruleKey"]),
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "generatedAt": now.strftime("%Y-%m-%d %H:%M KST"),
        "stale": False, "source": "KHOA Tide Forecast OpenAPI",
    }
    for kind in ("low", "high"):
        events = [row for row in rows if classify_event(row) == kind]
        result[kind + "Tide"] = ", ".join(event_time(row) for row in events) or "정보 없음"
        result[kind + "TideLevel"] = ", ".join(event_level(row) for row in events) or "정보 없음"
    return result


def build_tomorrow_result(site: dict[str, Any], payload: Any, now: datetime, date_iso: str | None = None) -> dict[str, Any]:
    return build_site_result(site, payload, now, date_iso)


def read_optional_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def has_tide_data(result: Any) -> bool:
    if not isinstance(result, dict) or result.get("unavailable") or result.get("dataUnavailable"):
        return False
    found = False
    for kind in ("low", "high"):
        times = str(result.get(kind + "Tide", "")).split(",")
        levels = str(result.get(kind + "TideLevel", "")).split(",")
        if len(times) == 1 and times[0].strip() in {"", "정보 없음", "조석정보 없음"}:
            continue
        if len(times) != len(levels):
            return False
        for clock, level in zip(times, levels):
            if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", clock.strip()):
                return False
            try:
                if not math.isfinite(float(level)):
                    return False
            except ValueError:
                return False
        found = True
    return found


def normalize_cached_day(day: Any, site: dict[str, Any], date_iso: str, source: str, generated_at: str) -> dict[str, Any] | None:
    if not has_tide_data(day) or day.get("date", date_iso) != date_iso:
        return None
    # Old daily files have no stationCode: use only their stored exact station name.
    # Monthly records always carry a code; a changed mapping must never reuse it.
    code = day.get("stationCode")
    if code:
        if code != site["stationCode"]:
            return None
    elif day.get("stationName") != site["stationName"]:
        return None
    result = {k: v for k, v in day.items() if k != "tomorrow"}
    original_time = day.get("generatedAt") or day.get("monthlyGeneratedAt") or generated_at or ""
    result.update({
        "name": site["name"], "stationCode": site["stationCode"], "stationName": site["stationName"],
        "date": date_iso, "stale": True, "fallbackSource": source,
        "generatedAt": original_time, "updated": original_time,
        "generationTimeUnknown": not bool(original_time),
        "summary": "재사용 조석예보 자료입니다. 생성 시각과 출처를 확인하세요.",
        # Existing UI reads staleDaily, not stale. Keep warnings visible without UI edits.
        "staleDaily": True, "staleDailyDate": str(original_time)[:10],
    })
    if source == "tide_month":
        result.update(monthFallback=True, monthFallbackStale=True, monthlyGeneratedAt=original_time)
    return result


def fallback_for_date(sites: list[dict[str, Any]], date_iso: str, daily: dict[str, Any], monthly: dict[str, Any]) -> dict[str, Any]:
    results = {}
    for site in sites:
        old = daily.get("sites", {}).get(site["id"], {})
        candidates = []
        if daily.get("tomorrowDate") == date_iso and isinstance(old.get("tomorrow"), dict):
            day = dict(old["tomorrow"])
            day.setdefault("stationCode", old.get("stationCode", ""))
            day.setdefault("stationName", old.get("stationName", ""))
            candidates.append((day, "previous_tomorrow", day.get("updated") or old.get("updated", "")))
        if daily.get("date") == date_iso:
            # Preserve a successful earlier same-day refresh before monthly fallback.
            candidates.append((old, old.get("fallbackSource") or "previous_today", old.get("updated", "")))
        # Monthly forecasts are station data, not site-specific measurements.
        # Share only an identical code/date, including with sites outside the
        # monthly target list; never borrow a neighbouring station's forecast.
        month_days = [
            (month_site, day)
            for month_site in monthly.get("sites", {}).values()
            if isinstance(month_site, dict) and month_site.get("stationCode") == site["stationCode"]
            for day in month_site.get("days", [])
            if isinstance(day, dict) and day.get("date") == date_iso
        ]
        for month_site, month_day in month_days:
            if isinstance(month_day, dict) and month_day.get("date") == date_iso:
                day = dict(month_day)
                day.setdefault("stationCode", month_site.get("stationCode", ""))
                day.setdefault("stationName", month_site.get("stationName", ""))
                # A legacy stale monthly day has no trustworthy per-day generation time.
                stamp = day.get("generatedAt") or ("" if day.get("stale") else monthly.get("generatedAt", ""))
                candidates.append((day, "tide_month", stamp))
        for day, source, stamp in candidates:
            result = normalize_cached_day(day, site, date_iso, source, stamp)
            if result:
                results[site["id"]] = result
                break
    return results


def no_data(site: dict[str, Any], date_iso: str, error: str, station_missing: bool = False) -> dict[str, Any]:
    result = {
        "name": site["name"], "stationName": site.get("stationName", "공식 직접 관측소 미확인"),
        "stationCode": site.get("stationCode", ""), "date": date_iso,
        "lowTide": "정보 없음", "highTide": "정보 없음",
        "lowTideLevel": "정보 없음", "highTideLevel": "정보 없음",
        "summary": "공식 직접 관측소/API 지원 검토 필요" if station_missing else "조석정보 없음",
        "stale": True, "fallbackSource": "none", "generatedAt": "", "updated": "",
        "dataUnavailable": True, "error": error,
    }
    if station_missing:
        result["unavailable"] = True
    return result


def group_by_station(sites: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for site in sites:
        groups.setdefault(site["stationCode"], []).append(site)
    return list(groups.values())


def fetch_and_build(
    api_key: str, groups: list[list[dict[str, Any]]], date_text: str, now: datetime,
    site_positions: dict[str, int], total_targets: int, build_fn: Any,
    previous_for: Any, label: str, stats: RequestStats | None = None,
) -> tuple[dict[str, Any], int, int, int]:
    results: dict[str, Any] = {}
    success_count = failed_count = reused_count = 0
    codes = [group[0]["stationCode"] for group in groups]
    if len(codes) != len(set(codes)):
        raise ValueError("Duplicate stationCode groups would cause duplicate API calls")
    date_iso = datetime.strptime(date_text, "%Y%m%d").date().isoformat()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(request_prediction, api_key, group[0]["stationCode"], date_text, False, stats): group
            for group in groups
        }
        for future in as_completed(futures):
            group = futures[future]
            try:
                payload = future.result()
            except Exception as exc:
                payload, request_error = None, safe_error(exc)
            else:
                request_error = ""
            for site in group:
                error = request_error
                if not error:
                    try:
                        result = build_fn(site, payload, now, date_iso)
                    except Exception as exc:
                        error = safe_error(exc)
                if error:
                    failed_count += 1
                    previous = previous_for(site["id"])
                    if isinstance(previous, dict) and has_tide_data(previous):
                        result = dict(previous, stale=True, error=error)
                        reused_count += 1
                    else:
                        result = no_data(site, date_iso, error)
                if has_tide_data(result):
                    success_count += 1
                result["refreshedAt"] = now.strftime("%Y-%m-%d %H:%M KST")
                results[site["id"]] = result
            print(f"[{label}] {group[0]['stationCode']} {len(group)} site(s): {request_error or 'response processed'}", flush=True)
    return results, success_count, failed_count, reused_count


def build_daily_output(api_key: str, now: datetime, stats: RequestStats | None = None) -> dict[str, Any]:
    targets = load_tide_sites()
    mapping_sites = load_station_mapping()
    sites, review_count = resolve_tide_sites(targets, mapping_sites)
    if not sites:
        raise RuntimeError("No usable tide station mappings")
    stats = stats or RequestStats(600)
    daily = read_optional_json(OUTPUT_PATH)
    monthly = read_optional_json(TIDE_MONTH_PATH)
    dates = [now.date().isoformat(), (now + timedelta(days=1)).date().isoformat()]
    groups = group_by_station(sites)
    results_by_date = []
    counts = []
    positions = {target["id"]: n for n, target in enumerate(targets, 1)}
    resolved_ids = {site["id"] for site in sites}
    missing = [target for target in targets if target["id"] not in resolved_ids]
    for date_iso, label in zip(dates, ("today", "tomorrow")):
        fallback = fallback_for_date(sites, date_iso, daily, monthly)
        results, success, failed, reused = fetch_and_build(
            api_key, groups, date_iso.replace("-", ""), now, positions, len(targets),
            build_site_result, fallback.get, label, stats,
        )
        for site in missing:
            entry = mapping_sites.get(site["id"], {})
            known_candidates = any(c.get("codeVerified") for c in entry.get("candidates", []))
            # A known official station with untested API support is not evidence
            # that no observation station exists. Avoid that UI label.
            results[site["id"]] = no_data(site, date_iso, entry.get("reviewReason") or "공식 직접 관측소/API 지원 미확인", not known_candidates)
            results[site["id"]]["stationReview"] = True
            results[site["id"]]["refreshedAt"] = now.strftime("%Y-%m-%d %H:%M KST")
            results[site["id"]]["summary"] = entry.get("reviewReason") or "공식 직접 관측소/API 지원 미확인"
        results_by_date.append(results)
        counts.append((success, failed + len(missing), reused))
    results, tomorrow_results = results_by_date
    live_station_count = len({s["stationCode"] for s in results.values() if not s.get("stale") and has_tide_data(s)})
    month_count = sum(s.get("fallbackSource") == "tide_month" for s in results.values())
    for site_id, result in results.items():
        result["tomorrow"] = tomorrow_results[site_id]
        if tomorrow_results[site_id].get("stale") and has_tide_data(tomorrow_results[site_id]):
            result.setdefault("staleDaily", True)
            result.setdefault("staleDailyDate", "")
    success, failed, reused = counts[0]
    tomorrow_success, tomorrow_failed, tomorrow_reused = counts[1]
    output = {
        "date": dates[0], "tomorrowDate": dates[1], "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "KHOA Tide Forecast OpenAPI", "status": "ok" if failed == 0 else "partial",
        "targetSiteCount": len(targets), "linkedSiteCount": len(sites), "siteCount": len(results),
        "uniqueStationCount": len(groups), "plannedStationDateCount": len(groups) * 2,
        "successCount": success, "liveSuccessCount": success - reused, "liveSuccessStationCount": live_station_count,
        "failedCount": failed, "reusedCount": reused, "fallbackCount": reused, "monthFallbackCount": month_count,
        "previousTomorrowFallbackCount": sum(s.get("fallbackSource") == "previous_tomorrow" for s in results.values()),
        "unavailableSiteCount": sum(not has_tide_data(s) for s in results.values()),
        "noStationCount": len(missing), "noStationSites": [{"id": s["id"], "name": s["name"]} for s in missing],
        "reviewCount": review_count,
        "codeReviewSites": [{"id": t["id"], "name": t["name"], "reason": mapping_sites.get(t["id"], {}).get("reviewReason", "")}
                            for t in targets if mapping_sites.get(t["id"], {}).get("needsReview")],
        "tomorrowSuccessCount": tomorrow_success, "tomorrowFailedCount": tomorrow_failed,
        "tomorrowLiveSuccessCount": tomorrow_success - tomorrow_reused, "tomorrowReusedCount": tomorrow_reused,
        "tomorrowStatus": "ok" if tomorrow_failed == 0 else "partial", "sites": results,
        **stats.snapshot(),
    }
    return output


def main() -> None:
    api_key = os.environ.get("KHOA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("KHOA_API_KEY is not configured; existing data preserved")
    output = build_daily_output(api_key, datetime.now(KST))
    temporary_path = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"Saved {output['siteCount']} sites; live={output['liveSuccessCount']}, fallback={output['fallbackCount']}, HTTP attempts={output['apiRequestCount']}", flush=True)


if __name__ == "__main__":
    main()
