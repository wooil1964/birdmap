import { SITES } from "./sites.js";

const KMA_BASE_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const PRODUCTION_ORIGIN = "https://wooil1964.github.io";
const CACHE_TTL_SECONDS = 15 * 60;
const UPSTREAM_TIMEOUT_MS = 8_000;
const TOMORROW_TIMEOUT_MS = 5_000;

export class WorkerError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.status = status;
  }
}

export function latLonToKmaGrid(lat, lon) {
  const DEGRAD = Math.PI / 180;
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const re = RE / GRID;
  let sn =
    Math.tan(Math.PI * 0.25 + SLAT2 * DEGRAD * 0.5) /
    Math.tan(Math.PI * 0.25 + SLAT1 * DEGRAD * 0.5);
  sn =
    Math.log(Math.cos(SLAT1 * DEGRAD) / Math.cos(SLAT2 * DEGRAD)) /
    Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + SLAT1 * DEGRAD * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(SLAT1 * DEGRAD)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + OLAT * DEGRAD * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - OLON * DEGRAD;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

function kstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function kmaDate(parts) {
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}`;
}

function previousKstHour(date, baseMinute, availabilityMinute) {
  const current = kstParts(date);
  let target = new Date(
    Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour - (current.minute < availabilityMinute ? 1 : 0),
      baseMinute,
    ),
  );
  const parts = kstParts(new Date(target.getTime() - 9 * 60 * 60 * 1000));
  return { date: kmaDate(parts), time: `${pad(parts.hour)}${pad(baseMinute)}` };
}

export function kmaBaseTimes(date = new Date()) {
  return {
    observation: previousKstHour(date, 0, 40),
    forecast: previousKstHour(date, 30, 45),
    village: latestVillageForecastBase(date),
  };
}

export function latestVillageForecastBase(date = new Date()) {
  const current = kstParts(date);
  const currentMinutes = current.hour * 60 + current.minute;
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const hour = [...baseHours]
    .reverse()
    .find((candidate) => candidate * 60 + 10 <= currentMinutes);
  if (hour !== undefined) {
    return { date: kmaDate(current), time: `${pad(hour)}00` };
  }
  const previous = new Date(
    Date.UTC(current.year, current.month - 1, current.day - 1),
  );
  return {
    date: `${previous.getUTCFullYear()}${pad(previous.getUTCMonth() + 1)}${pad(previous.getUTCDate())}`,
    time: "2300",
  };
}

export function createCacheKey(siteId, grid, baseTimes) {
  return [
    "kma-v2",
    siteId,
    `${grid.nx}x${grid.ny}`,
    `${baseTimes.observation.date}${baseTimes.observation.time}`,
    `${baseTimes.forecast.date}${baseTimes.forecast.time}`,
    `${baseTimes.village.date}${baseTimes.village.time}`,
  ].join(":");
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (
    env?.ENVIRONMENT !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  return false;
}

function responseHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(request, env, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(request, env), ...extraHeaders },
  });
}

function errorResponse(request, env, error) {
  const known = error instanceof WorkerError;
  return jsonResponse(
    request,
    env,
    {
      ok: false,
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "Unexpected worker error",
      },
    },
    known ? error.status : 500,
  );
}

export async function fetchJsonWithTimeout(
  url,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  fetchImpl = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new WorkerError(
        "KMA_HTTP_ERROR",
        `KMA returned HTTP ${response.status}`,
        502,
      );
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new WorkerError("KMA_INVALID_JSON", "KMA returned invalid JSON", 502);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WorkerError("KMA_TIMEOUT", "KMA request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function kmaUrl(path, serviceKey, grid, base, numOfRows = 100) {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: String(numOfRows),
    dataType: "JSON",
    base_date: base.date,
    base_time: base.time,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });
  return `${KMA_BASE_URL}/${path}?${params}`;
}

function kmaItems(payload) {
  const header = payload?.response?.header;
  if (!header || header.resultCode !== "00") {
    throw new WorkerError(
      "KMA_API_ERROR",
      header?.resultMsg || "KMA response did not contain a success header",
      502,
    );
  }
  const items = payload?.response?.body?.items?.item;
  if (!Array.isArray(items)) {
    throw new WorkerError("KMA_EMPTY_DATA", "KMA returned no weather items", 502);
  }
  return items;
}

function numeric(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function rainAmount(value) {
  if (value == null) return null;
  if (value === "강수없음") return 0;
  const match = String(value).match(/[\d.]+/);
  return match ? Number.parseFloat(match[0]) : null;
}

export function windDirectionName(degrees) {
  if (!Number.isFinite(degrees)) return null;
  const names = [
    "북풍",
    "북동풍",
    "동풍",
    "남동풍",
    "남풍",
    "남서풍",
    "서풍",
    "북서풍",
  ];
  return names[Math.round(((degrees % 360) + 360) / 45) % 8];
}

function kstTimestamp(dateText, timeText) {
  if (!dateText || !timeText) return null;
  return `${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)} ${timeText.slice(0, 2)}:${timeText.slice(2, 4)} KST`;
}

export function normalizeObservation(items) {
  const values = Object.fromEntries(
    items.map((item) => [item.category, item.obsrValue]),
  );
  const direction = numeric(values.VEC);
  const first = items[0] || {};
  return {
    dataTime: kstTimestamp(first.baseDate, first.baseTime),
    temperature: numeric(values.T1H),
    windSpeed: numeric(values.WSD),
    windDirectionDegrees: direction,
    windDirection: windDirectionName(direction),
    rain: rainAmount(values.RN1),
    humidity: numeric(values.REH),
  };
}

function skyName(value) {
  return { "1": "맑음", "3": "구름 많음", "4": "흐림" }[String(value)] || null;
}

export function normalizeForecast(items, now = new Date()) {
  const nowParts = kstParts(now);
  const nowKey = `${kmaDate(nowParts)}${pad(nowParts.hour)}${pad(nowParts.minute)}`;
  const groups = new Map();
  for (const item of items) {
    const key = `${item.fcstDate}${item.fcstTime}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const keys = [...groups.keys()].sort();
  const selectedKey = keys.find((key) => key >= nowKey) || keys[0];
  const selected = groups.get(selectedKey) || [];
  const values = Object.fromEntries(
    selected.map((item) => [item.category, item.fcstValue]),
  );
  const first = selected[0] || items[0] || {};
  const direction = numeric(values.VEC);
  return {
    issuedAt: kstTimestamp(first.baseDate, first.baseTime),
    forecastTime: kstTimestamp(first.fcstDate, first.fcstTime),
    temperature: numeric(values.T1H),
    windSpeed: numeric(values.WSD),
    windDirectionDegrees: direction,
    windDirection: windDirectionName(direction),
    rain: rainAmount(values.RN1),
    humidity: numeric(values.REH),
    sky: skyName(values.SKY),
  };
}

function tomorrowKmaDate(now = new Date()) {
  const current = kstParts(now);
  const tomorrow = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );
  return `${tomorrow.getUTCFullYear()}${pad(tomorrow.getUTCMonth() + 1)}${pad(tomorrow.getUTCDate())}`;
}

function normalizeTomorrowPeriod(items, targetDate, targetTime, label) {
  const selected = items.filter(
    (item) => item.fcstDate === targetDate && item.fcstTime === targetTime,
  );
  if (!selected.length) return null;
  const values = Object.fromEntries(
    selected.map((item) => [item.category, item.fcstValue]),
  );
  const direction = numeric(values.VEC);
  return {
    label,
    forecastTime: kstTimestamp(targetDate, targetTime),
    temperature: numeric(values.TMP),
    windSpeed: numeric(values.WSD),
    windDirection: windDirectionName(direction),
    rainProbability: numeric(values.POP),
    sky: skyName(values.SKY),
  };
}

export function normalizeTomorrowForecast(items, now = new Date()) {
  const targetDate = tomorrowKmaDate(now);
  return {
    morning: normalizeTomorrowPeriod(
      items,
      targetDate,
      "0900",
      "내일 오전",
    ),
    afternoon: normalizeTomorrowPeriod(
      items,
      targetDate,
      "1500",
      "내일 오후",
    ),
  };
}

async function requestKmaWeather(siteId, site, env, now) {
  const grid = latLonToKmaGrid(Number(site.lat), Number(site.lon));
  const baseTimes = kmaBaseTimes(now);
  const tomorrowRequest = fetchJsonWithTimeout(
    kmaUrl(
      "getVilageFcst",
      env.KMA_SERVICE_KEY,
      grid,
      baseTimes.village,
      1000,
    ),
    TOMORROW_TIMEOUT_MS,
  )
    .then((payload) => normalizeTomorrowForecast(kmaItems(payload), now))
    .catch(() => null);
  const [observationPayload, forecastPayload] = await Promise.all([
    fetchJsonWithTimeout(
      kmaUrl(
        "getUltraSrtNcst",
        env.KMA_SERVICE_KEY,
        grid,
        baseTimes.observation,
      ),
    ),
    fetchJsonWithTimeout(
      kmaUrl(
        "getUltraSrtFcst",
        env.KMA_SERVICE_KEY,
        grid,
        baseTimes.forecast,
      ),
    ),
  ]);
  const tomorrow = await tomorrowRequest;

  return {
    ok: true,
    siteId,
    siteName: site.name,
    source: "KMA",
    grid,
    observation: normalizeObservation(kmaItems(observationPayload)),
    forecast: normalizeForecast(kmaItems(forecastPayload), now),
    tomorrow,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

export async function handleRequest(request, env = {}, ctx = {}) {
  const origin = allowedOrigin(request, env);
  if (origin === false) {
    return errorResponse(
      request,
      env,
      new WorkerError("ORIGIN_NOT_ALLOWED", "Origin is not allowed", 403),
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(request, env),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "GET") {
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or OPTIONS" },
      },
      405,
      { Allow: "GET, OPTIONS" },
    );
  }

  const url = new URL(request.url);
  if (url.pathname !== "/weather") {
    return errorResponse(
      request,
      env,
      new WorkerError("NOT_FOUND", "Unknown endpoint", 404),
    );
  }

  const siteId = url.searchParams.get("siteId")?.trim();
  if (!siteId) {
    return errorResponse(
      request,
      env,
      new WorkerError("MISSING_SITE_ID", "siteId is required", 400),
    );
  }
  const site = SITES[siteId];
  if (!site) {
    return errorResponse(
      request,
      env,
      new WorkerError("INVALID_SITE_ID", "Unknown birding site", 404),
    );
  }
  if (site.pelagic) {
    return errorResponse(
      request,
      env,
      new WorkerError(
        "MARINE_PRIMARY_REQUIRED",
        "Pelagic sites must keep marine weather as the primary source",
        422,
      ),
    );
  }
  if (!env.KMA_SERVICE_KEY) {
    return errorResponse(
      request,
      env,
      new WorkerError(
        "MISSING_KMA_SERVICE_KEY",
        "KMA service key is not configured",
        503,
      ),
    );
  }

  try {
    const now = new Date();
    const grid = latLonToKmaGrid(Number(site.lat), Number(site.lon));
    const baseTimes = kmaBaseTimes(now);
    const cacheKey = createCacheKey(siteId, grid, baseTimes);
    const cacheRequest = new Request(
      `https://birdmap-weather-cache.invalid/${encodeURIComponent(cacheKey)}`,
    );
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheRequest);
    if (cachedResponse) {
      const cachedBody = await cachedResponse.json();
      cachedBody.cached = true;
      return jsonResponse(request, env, cachedBody, 200, {
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      });
    }

    const body = await requestKmaWeather(siteId, site, env, now);
    const storedResponse = new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    const write = cache.put(cacheRequest, storedResponse);
    if (ctx.waitUntil) ctx.waitUntil(write);
    else await write;
    return jsonResponse(request, env, body, 200, {
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    });
  } catch (error) {
    return errorResponse(request, env, error);
  }
}

export default {
  fetch: handleRequest,
};

export const WORKER_CONFIG = Object.freeze({
  cacheTtlSeconds: CACHE_TTL_SECONDS,
  upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
  tomorrowTimeoutMs: TOMORROW_TIMEOUT_MS,
  productionOrigin: PRODUCTION_ORIGIN,
  secretName: "KMA_SERVICE_KEY",
});
