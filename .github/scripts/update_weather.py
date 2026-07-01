#!/usr/bin/env python3
"""Build weather_today.json from Windy Point Forecast API data."""

from __future__ import annotations

import json
import math
import os
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / "index.html"
RULES_PATH = ROOT / "weather_rules.json"
OUTPUT_PATH = ROOT / "weather_today.json"
API_URL = "https://api.windy.com/api/point-forecast/v2"
REQUEST_TIMEOUT_SECONDS = 10
MAX_WORKERS = 10
KST = timezone(timedelta(hours=9))
ATMOSPHERIC_PARAMETERS = [
    "wind",
    "windGust",
    "precip",
    "temp",
    "lclouds",
    "mclouds",
    "hclouds",
]


def load_site_data() -> list[dict[str, Any]]:
    html = HTML_PATH.read_text(encoding="utf-8")
    match = re.search(r"var siteData=(\[.*?\]);\s*var markerRegistry=", html, re.S)
    if not match:
        raise RuntimeError("index.html에서 siteData를 찾지 못했습니다.")
    sites = json.loads(match.group(1))
    if len(sites) != 155:
        raise RuntimeError(f"siteData 개수가 155개가 아닙니다: {len(sites)}")
    return sites


def load_rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def request_forecast(
    api_key: str,
    lat: float,
    lon: float,
    parameters: list[str],
    model: str,
) -> dict[str, Any]:
    payload = json.dumps(
        {
            "lat": lat,
            "lon": lon,
            "model": model,
            "parameters": parameters,
            "levels": ["surface"],
            "key": api_key,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "birdmap-weather/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{type(exc.reason).__name__}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise RuntimeError(f"Timeout after {REQUEST_TIMEOUT_SECONDS}s") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON: {exc}") from exc


def nearest_index(timestamps: list[float], target: datetime) -> int:
    if not timestamps:
        raise RuntimeError("Windy 응답에 ts 배열이 없습니다.")
    target_ms = target.timestamp() * 1000
    return min(range(len(timestamps)), key=lambda index: abs(timestamps[index] - target_ms))


def value_at(data: dict[str, Any], key: str, index: int) -> float | None:
    values = data.get(key)
    if not isinstance(values, list) or index >= len(values) or values[index] is None:
        return None
    return float(values[index])


def merge_rule(config: dict[str, Any], key: str) -> tuple[str, dict[str, Any]]:
    aliases = config.get("aliases", {})
    canonical = aliases.get(key, key)
    defaults = dict(config["default"])
    defaults.update(config.get("rules", {}).get(canonical, {}))
    return canonical, defaults


def wind_from_degrees(u: float, v: float) -> float:
    return (math.degrees(math.atan2(-u, -v)) + 360) % 360


def wind_name(degrees: float) -> str:
    names = ["북풍", "북동풍", "동풍", "남동풍", "남풍", "남서풍", "서풍", "북서풍"]
    return names[int((degrees + 22.5) // 45) % 8]


def normalized_cloud(*values: float | None) -> float | None:
    present = [value for value in values if value is not None]
    if not present:
        return None
    cloud = max(present)
    return min(100.0, cloud * 100 if cloud <= 1.5 else cloud)


def grade_for(score: int) -> str:
    stars = 5 if score >= 90 else 4 if score >= 80 else 3 if score >= 70 else 2 if score >= 60 else 1
    return "★" * stars + "☆" * (5 - stars)


def apply_threshold_penalty(value: float | None, ideal: float, maximum: float, points: int) -> int:
    if value is None or value <= ideal:
        return 0
    if maximum <= ideal:
        return points
    ratio = min(1.0, (value - ideal) / (maximum - ideal))
    return round(points * ratio)


def score_weather(
    rule_key: str,
    rule: dict[str, Any],
    wind_speed: float,
    wind_direction: float,
    gust: float | None,
    precipitation: float,
    visibility_km: float | None,
    cloud_pct: float | None,
    wave_m: float | None,
) -> int:
    score = int(rule.get("baseScore", 92))
    score -= apply_threshold_penalty(
        wind_speed, float(rule["windIdealMax"]), float(rule["windMax"]), 28
    )
    if gust is not None and gust > float(rule["gustMax"]):
        score -= min(18, round((gust - float(rule["gustMax"])) * 2))
    if precipitation > float(rule["precip3hMax"]):
        score -= min(30, round((precipitation - float(rule["precip3hMax"])) * 8 + 8))
    if visibility_km is not None and visibility_km < float(rule["visibilityMinKm"]):
        score -= min(22, round((float(rule["visibilityMinKm"]) - visibility_km) * 3))
    if cloud_pct is not None and cloud_pct > float(rule["cloudMaxPct"]):
        score -= min(12, round((cloud_pct - float(rule["cloudMaxPct"])) / 3))
    if wave_m is not None and wave_m > float(rule["waveMaxM"]):
        score -= min(28, round((wave_m - float(rule["waveMaxM"])) * 15 + 5))
    preferred = rule.get("preferredWindFrom")
    if rule_key == "island_migrant" and isinstance(preferred, list) and len(preferred) == 2:
        if float(preferred[0]) <= wind_direction <= float(preferred[1]) and precipitation <= 2:
            score += 8
    return max(0, min(100, score))


def summary_for(
    rule_key: str,
    rule: dict[str, Any],
    score: int,
    wind_speed: float,
    wind_direction: float,
    precipitation: float,
    visibility_km: float | None,
    wave_m: float | None,
) -> str:
    if precipitation > float(rule["precip3hMax"]):
        return "강수 예보가 있어 관찰성과 이동 안전이 떨어질 수 있습니다. 비가 약해지는 시간을 확인하세요."
    if wind_speed > float(rule["windMax"]):
        return "강한 바람이 예상되어 조류 활동과 관찰 안정성이 낮을 수 있습니다."
    if wave_m is not None and wave_m > float(rule["waveMaxM"]):
        return "파고가 높아 선박 운항과 해안 관찰 안전을 우선 확인해야 합니다."
    if visibility_km is not None and visibility_km < float(rule["visibilityMinKm"]):
        return "시정이 낮아 원거리 탐조에 불리합니다. 안개와 박무가 걷히는 시간을 확인하세요."
    if rule_key == "island_migrant" and 225 <= wind_direction <= 337.5:
        return "서풍·북서풍 계열과 낮은 강수 조건으로 이동성 산새 관찰을 기대할 수 있습니다."
    if rule_key == "mudflat_shorebird":
        return "바람과 시정은 갯벌 탐조에 무난합니다. 실제 방문 전 조석 시간을 함께 확인하세요."
    if rule_key == "pelagic_seabird":
        return "풍속과 파고 기준의 선상 탐조 조건입니다. 출항 여부와 현장 안전 공지를 우선 확인하세요."
    if rule_key == "winter_waterfowl":
        return "수면과 농경지의 겨울철새를 관찰하기에 무난한 기상 조건입니다."
    if rule_key == "raptor_migration":
        return "강수와 시정 조건을 기준으로 맹금류 관찰 가능성이 양호합니다."
    if score >= 80:
        return "바람·강수·시정 조건이 오늘 탐조에 대체로 양호합니다."
    return "일부 기상 조건이 탐조에 불리할 수 있으니 Windy 상세 예보를 다시 확인하세요."


def build_site_result(
    site: dict[str, Any],
    rules_config: dict[str, Any],
    atmospheric: dict[str, Any],
    wave: dict[str, Any] | None,
    target: datetime,
) -> dict[str, Any]:
    index = nearest_index(atmospheric.get("ts", []), target)
    u = value_at(atmospheric, "wind_u-surface", index) or 0.0
    v = value_at(atmospheric, "wind_v-surface", index) or 0.0
    wind_speed = math.hypot(u, v)
    wind_direction = wind_from_degrees(u, v)
    gust = value_at(atmospheric, "gust-surface", index)
    precipitation = value_at(atmospheric, "past3hprecip-surface", index) or 0.0
    temperature = value_at(atmospheric, "temp-surface", index)
    if temperature is not None and temperature > 150:
        temperature -= 273.15
    visibility = value_at(atmospheric, "visibility-surface", index)
    visibility_km = visibility / 1000 if visibility is not None and visibility > 100 else visibility
    cloud_pct = normalized_cloud(
        value_at(atmospheric, "lclouds-surface", index),
        value_at(atmospheric, "mclouds-surface", index),
        value_at(atmospheric, "hclouds-surface", index),
    )
    wave_m = None
    if wave:
        wave_index = nearest_index(wave.get("ts", []), target)
        wave_m = value_at(wave, "waves_height-surface", wave_index)

    rule_key, rule = merge_rule(rules_config, str(site.get("weatherRuleKey") or "general_birding"))
    score = score_weather(
        rule_key,
        rule,
        wind_speed,
        wind_direction,
        gust,
        precipitation,
        visibility_km,
        cloud_pct,
        wave_m,
    )
    forecast_time = datetime.fromtimestamp(atmospheric["ts"][index] / 1000, KST)
    return {
        "name": site["name"],
        "score": score,
        "grade": grade_for(score),
        "summary": summary_for(
            rule_key,
            rule,
            score,
            wind_speed,
            wind_direction,
            precipitation,
            visibility_km,
            wave_m,
        ),
        "wind": f"{wind_name(wind_direction)} {wind_speed:.1f}m/s",
        "rain": "강수 없음" if precipitation < 0.1 else f"3시간 강수 {precipitation:.1f}mm",
        "targetGroup": rule["targetGroup"],
        "forecastTime": forecast_time.strftime("%Y-%m-%d %H:%M KST"),
        "temperature": None if temperature is None else f"{temperature:.1f}°C",
        "visibility": None if visibility_km is None else f"{visibility_km:.1f}km",
        "cloud": None if cloud_pct is None else f"{cloud_pct:.0f}%",
        "wave": None if wave_m is None else f"{wave_m:.1f}m",
        "ruleKey": rule_key,
    }


def load_previous_sites() -> dict[str, Any]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        previous = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Previous weather data unavailable: {exc}", flush=True)
        return {}
    sites = previous.get("sites", {})
    return sites if isinstance(sites, dict) else {}


def process_site(
    api_key: str,
    site: dict[str, Any],
    rules: dict[str, Any],
    target: datetime,
) -> dict[str, Any]:
    atmospheric = request_forecast(
        api_key,
        float(site["lat"]),
        float(site["lon"]),
        ATMOSPHERIC_PARAMETERS,
        "gfs",
    )
    wave = None
    if site.get("weatherRuleKey") == "pelagic_seabird":
        wave = request_forecast(
            api_key,
            float(site["lat"]),
            float(site["lon"]),
            ["waves"],
            "gfsWave",
        )
    return build_site_result(site, rules, atmospheric, wave, target)


def main() -> None:
    api_key = os.environ.get("WINDY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GitHub Secret WINDY_API_KEY가 설정되지 않았습니다.")

    sites = load_site_data()
    rules = load_rules()
    previous_sites = load_previous_sites()
    now = datetime.now(KST)
    target = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now > target:
        target = now

    total = len(sites)
    print(f"Loading {total} sites", flush=True)
    print(f"Using up to {MAX_WORKERS} concurrent requests", flush=True)

    results: dict[str, Any] = {}
    success_count = 0
    failed_count = 0
    reused_count = 0
    completed_count = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_site, api_key, site, rules, target): (position, site)
            for position, site in enumerate(sites, start=1)
        }
        for future in as_completed(futures):
            position, site = futures[future]
            site_id = str(site["id"])
            completed_count += 1
            try:
                result = future.result()
            except Exception as exc:
                failed_count += 1
                error_message = str(exc) or type(exc).__name__
                previous = previous_sites.get(site_id)
                if isinstance(previous, dict):
                    reused = dict(previous)
                    reused["stale"] = True
                    reused["error"] = error_message
                    results[site_id] = reused
                    reused_count += 1
                    print(
                        f"Site {position}/{total} ({completed_count} completed) "
                        f"{site['name']}: {error_message} - REUSED",
                        flush=True,
                    )
                else:
                    print(
                        f"Site {position}/{total} ({completed_count} completed) "
                        f"{site['name']}: {error_message}",
                        flush=True,
                    )
            else:
                result["stale"] = False
                result.pop("error", None)
                results[site_id] = result
                success_count += 1
                print(
                    f"Site {position}/{total} ({completed_count} completed) "
                    f"{site['name']}: OK",
                    flush=True,
                )

    print(f"Success: {success_count}", flush=True)
    print(f"Failed: {failed_count}", flush=True)
    print(f"Reused: {reused_count}", flush=True)

    if success_count == 0:
        raise RuntimeError("No successful Windy API responses; existing weather_today.json preserved")

    output = {
        "updated": now.strftime("%Y-%m-%d %H:%M KST"),
        "source": "Windy Point Forecast API",
        "status": "ok" if failed_count == 0 else "partial",
        "siteCount": len(results),
        "successCount": success_count,
        "failedCount": failed_count,
        "reusedCount": reused_count,
        "sites": results,
    }
    temporary_path = OUTPUT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(OUTPUT_PATH)
    print(f"{OUTPUT_PATH.name}: {len(results)} sites saved", flush=True)


if __name__ == "__main__":
    main()
