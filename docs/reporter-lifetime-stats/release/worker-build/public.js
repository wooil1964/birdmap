var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/shared.js
var PRODUCTION_ORIGIN = "https://wooil1964.github.io";
var LAT_MIN = 33;
var LAT_MAX = 39;
var LON_MIN = 124;
var LON_MAX = 132;
var MAX_SPECIES = 10;
var MAX_SPECIES_LENGTH = 30;
var MAX_REPORTER_LENGTH = 40;
var MAX_NOTE_LENGTH = 500;
var MAX_BIRD_COUNT = 1e5;
var RATE_WINDOW_MINUTES = 10;
var RATE_WINDOW_MAX = 5;
var RATE_DAY_MAX = 20;
var WorkerError = class extends Error {
  static {
    __name(this, "WorkerError");
  }
  constructor(code, message, status = 500) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.status = status;
  }
};
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (env?.ENVIRONMENT !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  return false;
}
__name(allowedOrigin, "allowedOrigin");
function responseHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "Cache-Control": "no-store"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
__name(responseHeaders, "responseHeaders");
function jsonResponse(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(request, env), ...extra }
  });
}
__name(jsonResponse, "jsonResponse");
function rethrowIfFrozen(error) {
  if (/reports_write_frozen/.test(String(error?.message))) {
    const frozen = new WorkerError("WRITE_MAINTENANCE", "\uC81C\uBCF4 \uC4F0\uAE30\uB97C \uC7A0\uC2DC \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 503);
    frozen.retryAfter = 60;
    throw frozen;
  }
}
__name(rethrowIfFrozen, "rethrowIfFrozen");
function errorResponse(request, env, error) {
  try {
    rethrowIfFrozen(error);
  } catch (frozen) {
    error = frozen;
  }
  const known = error instanceof WorkerError;
  return jsonResponse(
    request,
    env,
    {
      ok: false,
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "Unexpected error"
      }
    },
    known ? error.status : 500,
    error?.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}
  );
}
__name(errorResponse, "errorResponse");
function preflightResponse(request, env, methods) {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseHeaders(request, env),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(preflightResponse, "preflightResponse");
function kstDateString(date = /* @__PURE__ */ new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1e3);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}
__name(kstDateString, "kstDateString");
function stripControl(text, keepNewline = false) {
  let out = "";
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    if (code < 32 || code === 127) {
      if (keepNewline && code === 10) out += character;
      continue;
    }
    out += character;
  }
  return out.trim();
}
__name(stripControl, "stripControl");
var SPECIES_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9()'. -]+$/;
var MARKUP_PATTERN = /[<>]/;
function normalizeSpecies(raw) {
  const tokens = String(raw ?? "").split(/[,;·\r\n]+/).map((part) => stripControl(part)).filter(Boolean);
  if (!tokens.length) {
    throw new WorkerError("SPECIES_REQUIRED", "\uCD9C\uD604\uC885\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.", 400);
  }
  if (tokens.length > MAX_SPECIES) {
    throw new WorkerError(
      "SPECIES_TOO_MANY",
      `\uCD9C\uD604\uC885\uC740 \uD55C \uBC88\uC5D0 ${MAX_SPECIES}\uC885\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
      400
    );
  }
  const seen = [];
  for (const token2 of tokens) {
    if (token2.length > MAX_SPECIES_LENGTH || !SPECIES_PATTERN.test(token2)) {
      throw new WorkerError(
        "SPECIES_INVALID",
        `\uC885\uBA85\uC73C\uB85C \uC4F8 \uC218 \uC5C6\uB294 \uAC12\uC785\uB2C8\uB2E4: ${token2.slice(0, MAX_SPECIES_LENGTH)}`,
        400
      );
    }
    if (!seen.includes(token2)) seen.push(token2);
  }
  return seen;
}
__name(normalizeSpecies, "normalizeSpecies");
function optionalText(raw, max, field, keepNewline) {
  if (raw === void 0 || raw === null || raw === "") return null;
  const text = stripControl(raw, keepNewline);
  if (!text) return null;
  if (text.length > max) {
    throw new WorkerError(
      "TEXT_TOO_LONG",
      `${field}\uC740(\uB294) ${max}\uC790\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
      400
    );
  }
  if (MARKUP_PATTERN.test(text)) {
    throw new WorkerError(
      "TEXT_INVALID",
      `${field}\uC5D0 < \uB610\uB294 > \uB294 \uC4F8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      400
    );
  }
  return text;
}
__name(optionalText, "optionalText");
function normalizeCoordinate(rawLat, rawLon) {
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new WorkerError(
      "COORDINATE_REQUIRED",
      "\uC9C0\uB3C4\uC5D0\uC11C \uC704\uCE58\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
      400
    );
  }
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
    throw new WorkerError(
      "COORDINATE_OUT_OF_RANGE",
      "\uAD6D\uB0B4 \uD0D0\uC870 \uBC94\uC704 \uBC16\uC758 \uC88C\uD45C\uC785\uB2C8\uB2E4.",
      400
    );
  }
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}
__name(normalizeCoordinate, "normalizeCoordinate");
function normalizeObservedOn(raw, now = /* @__PURE__ */ new Date()) {
  const text = stripControl(raw ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new WorkerError(
      "OBSERVED_ON_REQUIRED",
      "\uAD00\uCC30 \uB0A0\uC9DC\uB97C YYYY-MM-DD \uD615\uC2DD\uC73C\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
      400
    );
  }
  const parsed = /* @__PURE__ */ new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || kstDateString(parsed) !== text) {
    throw new WorkerError("OBSERVED_ON_INVALID", "\uC5C6\uB294 \uB0A0\uC9DC\uC785\uB2C8\uB2E4.", 400);
  }
  const today = kstDateString(now);
  if (text > today) {
    throw new WorkerError(
      "OBSERVED_ON_FUTURE",
      "\uAD00\uCC30 \uB0A0\uC9DC\uB294 \uC624\uB298\uBCF4\uB2E4 \uB4A4\uC77C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
      400
    );
  }
  return text;
}
__name(normalizeObservedOn, "normalizeObservedOn");
function normalizeBirdCount(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_BIRD_COUNT) {
    throw new WorkerError(
      "COUNT_INVALID",
      `\uAD00\uCC30 \uAC1C\uCCB4\uC218\uB294 1 \uC774\uC0C1 ${MAX_BIRD_COUNT} \uC774\uD558\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.`,
      400
    );
  }
  return value;
}
__name(normalizeBirdCount, "normalizeBirdCount");
function validateReport(input, now = /* @__PURE__ */ new Date()) {
  if (!input || typeof input !== "object") {
    throw new WorkerError("BODY_INVALID", "\uC81C\uBCF4 \uB0B4\uC6A9\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 400);
  }
  const species = normalizeSpecies(input.species);
  const { lat, lon } = normalizeCoordinate(input.lat, input.lon);
  if (input.hideLocation !== void 0 && typeof input.hideLocation !== "boolean") {
    throw new WorkerError("HIDE_LOCATION_INVALID", "\uC704\uCE58 \uAC00\uB9AC\uAE30 \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
  }
  return {
    species,
    speciesText: species.join(" \xB7 "),
    lat,
    lon,
    observedOn: normalizeObservedOn(input.observedOn, now),
    birdCount: normalizeBirdCount(input.birdCount),
    reporter: optionalText(input.reporter, MAX_REPORTER_LENGTH, "\uC81C\uBCF4\uC790 \uC774\uB984", false),
    note: optionalText(input.note, MAX_NOTE_LENGTH, "\uCC38\uACE0 \uC124\uBA85", true),
    // 이름 공개는 명시적으로 동의한 경우에만 1 이다. 값이 없으면 비공개로 본다.
    namePublic: input.namePublic === true || input.namePublic === 1 ? 1 : 0,
    // 위치 가리기는 제보자가 체크한 경우에만 참이다. 기본은 정확한 위치 공개.
    hideLocation: input.hideLocation === true
  };
}
__name(validateReport, "validateReport");
var APPROX_MIN_METERS = 1500;
var APPROX_MAX_METERS = 4500;
function randomUnitPair() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return [values[0] / 2 ** 32, values[1] / 2 ** 32];
}
__name(randomUnitPair, "randomUnitPair");
function approximateCoordinate(lat, lon, randomPair) {
  const [angleSeed, radiusSeed] = randomPair || randomUnitPair();
  const bearing = angleSeed * 2 * Math.PI;
  const near = APPROX_MIN_METERS ** 2;
  const far = APPROX_MAX_METERS ** 2;
  const distance = Math.sqrt(near + radiusSeed * (far - near));
  const metersPerLat = 111320;
  const metersPerLon = Math.max(1, metersPerLat * Math.cos(lat * Math.PI / 180));
  const movedLat = lat + distance * Math.cos(bearing) / metersPerLat;
  const movedLon = lon + distance * Math.sin(bearing) / metersPerLon;
  return {
    lat: Number(Math.min(LAT_MAX, Math.max(LAT_MIN, movedLat)).toFixed(5)),
    lon: Number(Math.min(LON_MAX, Math.max(LON_MIN, movedLon)).toFixed(5))
  };
}
__name(approximateCoordinate, "approximateCoordinate");
var SENSITIVE_KEYWORDS = ["\uB465\uC9C0", "\uBC88\uC2DD", "\uD3EC\uB780", "\uC721\uCD94", "\uC0C8\uB07C", "\uC601\uC18C"];
var SENSITIVE_SPECIES = [
  "\uC800\uC5B4\uC0C8",
  "\uB178\uB791\uBD80\uB9AC\uC800\uC5B4\uC0C8",
  "\uB178\uB791\uBD80\uB9AC\uBC31\uB85C",
  "\uD669\uC0C8",
  "\uBA39\uD669\uC0C8",
  "\uB530\uC624\uAE30",
  "\uB450\uB8E8\uBBF8",
  "\uC7AC\uB450\uB8E8\uBBF8",
  "\uD751\uB450\uB8E8\uBBF8",
  "\uAC80\uB3C5\uC218\uB9AC",
  "\uCC38\uC218\uB9AC",
  "\uD770\uAF2C\uB9AC\uC218\uB9AC",
  "\uB9E4",
  "\uCC38\uB9E4",
  "\uC218\uB9AC\uBD80\uC5C9\uC774",
  "\uC62C\uBE7C\uBBF8",
  "\uD314\uC0C9\uC870",
  "\uBFD4\uC1E0\uC624\uB9AC",
  "\uB113\uC801\uBD80\uB9AC\uB3C4\uC694"
];
var PROTECTED_QUANTITY = /^(.+?)\s*\d+\s*(?:마리|개체)?$/;
var PROTECTION_SPLIT = /[,;·/\r\n]+/;
function isProtectedSpeciesToken(token2) {
  const text = token2.normalize("NFC").trim();
  if (SENSITIVE_SPECIES.includes(text)) return true;
  const match = PROTECTED_QUANTITY.exec(text);
  return !!match && SENSITIVE_SPECIES.includes(match[1].trim());
}
__name(isProtectedSpeciesToken, "isProtectedSpeciesToken");
function isSensitiveReport(report) {
  const haystack = [report?.note || "", report?.speciesText || ""].join(" ");
  if (SENSITIVE_KEYWORDS.some((word) => haystack.includes(word))) return true;
  const names = report?.species || [];
  return names.some((name) => String(name).split(PROTECTION_SPLIT).some(isProtectedSpeciesToken));
}
__name(isSensitiveReport, "isSensitiveReport");
function pendingPayload(rows2) {
  return (rows2 || []).filter((row) => Number.isFinite(row.approx_lat) && Number.isFinite(row.approx_lon)).map((row) => {
    const spot = {
      id: row.id,
      status: "pending",
      lat: row.approx_lat,
      lon: row.approx_lon,
      // approx_offset: 공개 좌표가 실제 좌표와 다른지만 계산한 값(실제 좌표는 내보내지 않는다). 없으면 대략으로 본다.
      approximate: row.approx_offset === void 0 || row.approx_offset === null ? true : Number(row.approx_offset) === 1,
      species: splitSpecies(row.species),
      date: row.observed_on
    };
    if (Number(row.location_hidden) === 1) spot.locationHidden = true;
    return spot;
  });
}
__name(pendingPayload, "pendingPayload");
var LOCATION_HIDDEN_SQL = "(public_lat IS NOT NULL AND public_lon IS NOT NULL AND (public_lat <> lat OR public_lon <> lon))";
function isLocationHidden(row) {
  return row?.public_lat != null && row?.public_lon != null && (Number(row.public_lat) !== Number(row.lat) || Number(row.public_lon) !== Number(row.lon));
}
__name(isLocationHidden, "isLocationHidden");
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function ipHash(ip, salt) {
  if (!salt) {
    throw new WorkerError(
      "NOT_CONFIGURED_SALT",
      "\uC81C\uBCF4 \uC811\uC218\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
      503
    );
  }
  return sha256Hex(`${salt}:${ip || "unknown"}`);
}
__name(ipHash, "ipHash");
function dedupeHash(report) {
  const key = [
    report.species.slice().sort().join("|"),
    report.lat.toFixed(4),
    report.lon.toFixed(4),
    report.observedOn
  ].join(":");
  return sha256Hex(key);
}
__name(dedupeHash, "dedupeHash");
async function verifyTurnstile(token2, ip, secret, fetchImpl = fetch, idempotencyKey) {
  if (!secret) {
    throw new WorkerError(
      "NOT_CONFIGURED_CAPTCHA",
      "\uC81C\uBCF4 \uC811\uC218\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
      503
    );
  }
  if (!token2 || typeof token2 !== "string") {
    throw new WorkerError(
      "CAPTCHA_REQUIRED",
      "\uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.",
      400
    );
  }
  const body = new URLSearchParams({ secret, response: token2 });
  if (ip) body.set("remoteip", ip);
  if (idempotencyKey) body.set("idempotency_key", idempotencyKey);
  let payload;
  try {
    const response = await fetchImpl(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    payload = await response.json();
  } catch {
    throw new WorkerError(
      "CAPTCHA_UNAVAILABLE",
      "\uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
      503
    );
  }
  if (!payload?.success) {
    console.log(
      "turnstile_failed " + JSON.stringify({
        codes: payload?.["error-codes"] ?? [],
        hostname: payload?.hostname ?? null
      })
    );
    throw new WorkerError(
      "CAPTCHA_FAILED",
      "\uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
      403
    );
  }
  return true;
}
__name(verifyTurnstile, "verifyTurnstile");
var FORBIDDEN = new WorkerError(
  "ADMIN_FORBIDDEN",
  "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
  403
);
function splitSpecies(text) {
  return String(text || "").split(" \xB7 ").filter(Boolean);
}
__name(splitSpecies, "splitSpecies");
function historyEntry(row) {
  const entry = {
    id: row.id,
    date: row.observed_on,
    species: splitSpecies(row.species)
  };
  if (Number(row.name_public) === 1 && row.reporter) entry.reporter = row.reporter;
  return entry;
}
__name(historyEntry, "historyEntry");
function newestFirst(a, b) {
  return String(b.date).localeCompare(String(a.date));
}
__name(newestFirst, "newestFirst");
function publicPayload(rows2) {
  const all = rows2 || [];
  const byKey = /* @__PURE__ */ new Map();
  for (const row of all) {
    if (!row.spot_key) continue;
    if (!byKey.has(row.spot_key)) byKey.set(row.spot_key, []);
    byKey.get(row.spot_key).push(row);
  }
  const spots = all.filter((row) => !row.spot_key).map((row) => {
    const attached = byKey.get(row.id) || [];
    const species = splitSpecies(row.species);
    for (const extra of attached) {
      for (const name of splitSpecies(extra.species)) {
        if (!species.includes(name)) species.push(name);
      }
    }
    const spot = {
      id: row.id,
      lat: row.public_lat ?? row.lat,
      lon: row.public_lon ?? row.lon,
      species,
      history: [row, ...attached].map(historyEntry).sort(newestFirst)
    };
    if (isLocationHidden(row)) spot.locationHidden = true;
    return spot;
  });
  const fixedSpots = {};
  for (const [key, list] of byKey) {
    if (!key.startsWith("fixed:")) continue;
    fixedSpots[key] = { history: list.map(historyEntry).sort(newestFirst) };
  }
  return { spots, fixedSpots };
}
__name(publicPayload, "publicPayload");

// src/writer-fence.js
var WRITER_FENCE_GUARDS = ["reports", "field_updates", "field_update_events", "field_update_confirmations"].flatMap((table) => ["insert", "update", "delete"].map((action) => "writer_fence_" + table + "_" + action));
var wrappers = /* @__PURE__ */ new WeakMap();
var wrapped = /* @__PURE__ */ new WeakSet();
var prepared = /* @__PURE__ */ new WeakMap();
var clean = /* @__PURE__ */ __name((sql) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim(), "clean");
var readonly = /* @__PURE__ */ __name((sql) => {
  if (typeof sql !== "string") return false;
  const text = clean(sql);
  return /^(SELECT|EXPLAIN)\b/i.test(text) || /^PRAGMA\s+(?:table_info|foreign_key_check|index_list|index_info)\b/i.test(text) && !text.includes("=") || /^WITH\b/i.test(text) && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(text);
}, "readonly");
var canonicalOnly = /* @__PURE__ */ __name((sql) => typeof sql === "string" && /^(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:sites|taxa|raw_submissions|checklists|sightings|reviews|audit_log|backfill_runs|transaction_assertions|captcha_redemptions)\b/i.test(clean(sql)) && !/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(?:reports|field_updates|field_update_events|field_update_confirmations)\b/i.test(clean(sql)), "canonicalOnly");
function unavailable() {
  return new WorkerError("WRITE_MAINTENANCE", "\uC81C\uBCF4 \uC4F0\uAE30\uB97C \uC7A0\uC2DC \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 503);
}
__name(unavailable, "unavailable");
async function writerFenceReady(db) {
  try {
    const row = await db.prepare(`SELECT
   (SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name IN (${WRITER_FENCE_GUARDS.map(() => "?").join(",")})) AS guards,
   (SELECT COUNT(*) FROM publication_writer_claim) AS claims,write_frozen FROM public_publication_state WHERE id=1`).bind(...WRITER_FENCE_GUARDS).first();
    return !!row && Number(row.guards) === WRITER_FENCE_GUARDS.length && row.claims === 0 && row.write_frozen === 0;
  } catch {
    return false;
  }
}
__name(writerFenceReady, "writerFenceReady");
function strictWriterDb(binding, required = false) {
  if (!required) return binding;
  if (wrapped.has(binding)) return binding;
  if (wrappers.has(binding)) return wrappers.get(binding);
  async function batch(statements) {
    const sqls = statements.map((s) => prepared.get(s)?.sql);
    const body = statements.map((s) => prepared.get(s)?.raw || s);
    if (sqls.every((sql) => readonly(sql) || canonicalOnly(sql))) return binding.batch(body);
    const claim = binding.prepare(`INSERT INTO publication_writer_claim(id,ok)
   VALUES (1,CASE WHEN EXISTS(SELECT 1 FROM public_publication_state WHERE id=1 AND write_frozen=0)
    AND (SELECT COUNT(*) FROM sqlite_schema WHERE type='trigger' AND name IN (${WRITER_FENCE_GUARDS.map(() => "?").join(",")}))=${WRITER_FENCE_GUARDS.length}
    THEN 1 ELSE 0 END)`).bind(...WRITER_FENCE_GUARDS);
    try {
      const sets = await binding.batch([claim, ...body, binding.prepare("DELETE FROM publication_writer_claim WHERE id=1")]);
      if (!Array.isArray(sets) || sets.length !== body.length + 2) throw unavailable();
      return sets.slice(1, -1);
    } catch (error) {
      if (/publication_writer_(?:ready|required)|UNIQUE constraint failed: publication_writer_claim|no such table: (?:publication_writer_claim|public_publication_state)/i.test(String(error?.message))) throw unavailable();
      throw error;
    }
  }
  __name(batch, "batch");
  function statement(raw, sql) {
    const proxy2 = new Proxy(raw, { get(target, key) {
      if (key === "bind") return (...values) => statement(target.bind(...values), sql);
      if (key === "run" && !readonly(sql)) return async () => (await batch([proxy2]))[0];
      if ((key === "all" || key === "first") && !readonly(sql)) return async (column) => {
        const result = (await batch([proxy2]))[0];
        if (key === "all") return result;
        const row = result.results?.[0] ?? null;
        if (column !== void 0 && row) {
          if (!Object.hasOwn(row, column)) throw new Error("D1_COLUMN_NOTFOUND: Column not found (" + String(column) + ")");
          return row[column];
        }
        return row;
      };
      if (key === "raw" && !readonly(sql)) return () => {
        throw unavailable();
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    prepared.set(proxy2, { raw, sql });
    return proxy2;
  }
  __name(statement, "statement");
  const proxy = new Proxy(binding, { get(target, key) {
    if (key === "prepare") return (sql) => statement(target.prepare(sql), sql);
    if (key === "batch") return batch;
    if (key === "withSession" && typeof target.withSession === "function") return (...args) => strictWriterDb(target.withSession(...args), true);
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  wrappers.set(binding, proxy);
  wrapped.add(proxy);
  return proxy;
}
__name(strictWriterDb, "strictWriterDb");

// src/canonical/data.js
var SCHEMA_VERSION = "phase2a-0001";
var REPORT_COLUMNS = ["id", "status", "species", "lat", "lon", "public_lat", "public_lon", "approx_lat", "approx_lon", "pending_public", "observed_on", "received_at", "decided_at", "bird_count", "reporter", "note", "admin_note", "site_id", "name_public", "spot_key", "ip_hash", "dedupe_hash"];
var FIELD_MAP = { id: "checklist_id", species: "species_text", lat: "actual_lat", lon: "actual_lon", observed_on: "observation_date", bird_count: "shared_bird_count", ip_hash: "compat_ip_hash", dedupe_hash: "compat_dedupe_hash" };
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).filter((k) => value[k] !== void 0).sort().map((k) => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
__name(stable, "stable");
var fingerprint = /* @__PURE__ */ __name((value) => sha256Hex(stable(value)), "fingerprint");
var rows = /* @__PURE__ */ __name(async (db, sql, ...values) => (await db.prepare(sql).bind(...values).all()).results || [], "rows");
var first = /* @__PURE__ */ __name(async (db, sql, ...values) => db.prepare(sql).bind(...values).first(), "first");
var TABLES = /* @__PURE__ */ new Set(["reports", "captcha_redemptions", "sites", "raw_submissions", "checklists", "sightings", "reviews", "audit_log", "backfill_runs", "transaction_assertions"]);
function insert(db, table, value) {
  if (!TABLES.has(table) || Object.keys(value).some((k) => !/^\w+$/.test(k))) throw Error("invalid_internal_statement");
  return db.prepare(`INSERT INTO ${table} (${Object.keys(value).join(",")}) VALUES (${Object.keys(value).map(() => "?").join(",")})`).bind(...Object.values(value));
}
__name(insert, "insert");
function fail(code, message, status = 409) {
  throw new WorkerError(code, message, status);
}
__name(fail, "fail");
function requestId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) fail("REQUEST_ID_REQUIRED", "\uC720\uD6A8\uD55C \uC694\uCCAD \uC2DD\uBCC4\uC790\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.", 400);
  return value;
}
__name(requestId, "requestId");
function assertion(db, key, condition = "changes()=1", values = []) {
  return db.prepare(`INSERT INTO transaction_assertions(assertion_id,ok) VALUES (?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`).bind(key, ...values);
}
__name(assertion, "assertion");
var clearAssertion = /* @__PURE__ */ __name((db, key) => db.prepare("DELETE FROM transaction_assertions WHERE assertion_id=?").bind(key), "clearAssertion");
async function assertNotPurged(db, id) {
  if (await first(db, "SELECT audit_id FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?", id)) fail("REPORT_PURGED", "\uC815\uCC45\uC5D0 \uB530\uB77C \uC81C\uAC70\uB41C \uC694\uCCAD\uC740 \uB2E4\uC2DC \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 410);
}
__name(assertNotPurged, "assertNotPurged");
function applicationDb(db) {
  return {
    prepare(sql) {
      const clean2 = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (!/^(SELECT|PRAGMA|INSERT|UPDATE|DELETE)\b/i.test(clean2) || /;\s*\S/.test(clean2) || /\b(REPLACE|DROP|ALTER)\b/i.test(clean2) || /\bUPDATE\s+["`\[]?(reviews|audit_log|raw_submissions)\b/i.test(clean2) || /\bDELETE\b/i.test(clean2) && !/^DELETE FROM (transaction_assertions WHERE assertion_id|captcha_redemptions WHERE redeemed_at<)=?\?$/i.test(clean2)) {
        fail("APPEND_ONLY", "\uC77C\uBC18 \uACBD\uB85C\uC5D0\uC11C\uB294 \uC6D0\uC790\uB8CC\xB7\uAC80\uD1A0\xB7\uAC10\uC0AC \uAE30\uB85D \uC0AD\uC81C/\uBCC0\uACBD\uC744 \uD5C8\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 403);
      }
      return db.prepare(sql);
    },
    batch(statements) {
      return db.batch(statements);
    }
  };
}
__name(applicationDb, "applicationDb");
function checklistFromReport(r, rawId, capturedAt, native = false) {
  const c = {};
  for (const key of REPORT_COLUMNS) c[FIELD_MAP[key] || key] = r[key];
  return {
    ...c,
    raw_id: rawId,
    source_type: native ? "native" : "legacy_reports",
    source_id: r.id,
    record_mode: native ? "quick_report" : "legacy_report",
    start_time: null,
    timezone: null,
    duration_minutes: null,
    distance_m: null,
    observer_count: null,
    protocol: null,
    complete_list: null,
    // A native report with a public coordinate (위치 가리기) is 'explicit', the same policy the admin path sets.
    coordinate_uncertainty_m: null,
    coordinate_policy: native ? r.public_lat != null && r.public_lon != null ? "explicit" : "actual" : "legacy_fallback",
    created_at: capturedAt,
    revision: 1,
    updated_at: capturedAt
  };
}
__name(checklistFromReport, "checklistFromReport");
function initialSighting(r, capturedAt, native = false) {
  const multiple = /[·,;\n/]/.test(r.species);
  return {
    sighting_id: `sighting:${r.id}:1`,
    checklist_id: r.id,
    source_ordinal: 1,
    species_original: r.species,
    species_identified: null,
    interpretation: multiple ? "unparsed_multiple" : "single",
    taxon_id: null,
    count_value: multiple ? null : r.bird_count,
    count_accuracy: "unknown",
    count_source: multiple ? "ambiguous_group" : r.bird_count === null ? "not_recorded" : native ? "reported" : "legacy_single",
    interpretation_note: null,
    created_at: capturedAt,
    updated_at: capturedAt
  };
}
__name(initialSighting, "initialSighting");
var canonicalProjection = `SELECT ${REPORT_COLUMNS.map((k) => (FIELD_MAP[k] || k) + (FIELD_MAP[k] ? ` AS ${k}` : "")).join(",")} FROM checklists WHERE record_mode IN ('legacy_report','quick_report') AND actual_lat IS NOT NULL AND actual_lon IS NOT NULL`;
function canonicalReadDb(db) {
  return { prepare(sql) {
    if (!/^\s*SELECT\b/i.test(sql) || !/\bFROM reports\b/.test(sql) && !/\bFROM public_publication_state\b/.test(sql)) throw Error("unsupported_read_query");
    return db.prepare(sql.replace(/\bFROM reports\b/g, `FROM (${canonicalProjection}) AS reports`));
  }, batch(statements) {
    return db.batch(statements);
  } };
}
__name(canonicalReadDb, "canonicalReadDb");

// src/canonical/control.js
var BUILD_CAPABILITY = "phase2c-dual-v4-writer-fence";
var MODES = /* @__PURE__ */ new Set(["NORMAL", "READ_ONLY_MAINTENANCE", "CANONICAL_DUAL_WRITE"]);
function writeMode(env) {
  return env.REPORTS_WRITE_MODE === void 0 ? "NORMAL" : env.REPORTS_WRITE_MODE;
}
__name(writeMode, "writeMode");
function closed(code = "WRITE_MAINTENANCE") {
  const e = new WorkerError(code, "\uC81C\uBCF4 \uC4F0\uAE30\uB97C \uC7A0\uC2DC \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 503);
  e.retryAfter = 60;
  throw e;
}
__name(closed, "closed");
async function schemaReady(db) {
  try {
    const tables = ["sites", "taxa", "raw_submissions", "checklists", "sightings", "reviews", "audit_log", "backfill_runs", "transaction_assertions"];
    const objects = (await rows(db, `SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND tbl_name IN (${tables.map(() => "?").join(",")}) ORDER BY type,name`, ...tables)).map((r) => ({ ...r, sql: r.sql.replace(/\s+/g, " ").trim().replace(/;$/, "") }));
    return await fingerprint(objects) === "76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0";
  } catch {
    return false;
  }
}
__name(schemaReady, "schemaReady");
async function capability(env, role) {
  const mode = writeMode(env);
  const configured = env.REPORTS_DUAL_WRITE_ENABLED === "true" && env.REPORTS_CONFIRMATION_REQUIRED === "true" && env.REPORTS_SCHEMA_VERSION === SCHEMA_VERSION && typeof env.REPORTS_ACTIVATION_ID === "string" && env.REPORTS_ACTIVATION_ID.length > 0 && typeof env.REPORTS_RELEASE_ID === "string" && env.REPORTS_RELEASE_ID.length > 0 && ["0", "1"].includes(env.REPORTS_PENDING_PUBLIC) && typeof env.REPORTS_PEER_RELEASE_ID === "string" && env.REPORTS_PEER_RELEASE_ID.length > 0 && typeof env.REPORTS_PEER?.fetch === "function" && typeof env.REPORTS_GATE_TOKEN === "string" && env.REPORTS_GATE_TOKEN.length > 0 && (env.ENVIRONMENT !== "production" || env.REPORTS_REMOTE_VERIFIED === "true");
  return {
    role,
    build: BUILD_CAPABILITY,
    mode,
    activation: env.REPORTS_ACTIVATION_ID || null,
    release: env.REPORTS_RELEASE_ID || null,
    peerRelease: env.REPORTS_PEER_RELEASE_ID || null,
    schema: SCHEMA_VERSION,
    ready: configured && await schemaReady(env.REPORTS_DB) && (env.REPORTS_PUBLICATION_REQUIRED !== "true" || mode === "READ_ONLY_MAINTENANCE" || await writerFenceReady(env.REPORTS_DB))
  };
}
__name(capability, "capability");
async function internalCapability(request, env, role) {
  if (!env.REPORTS_GATE_TOKEN || request.headers.get("X-Reports-Gate") !== env.REPORTS_GATE_TOKEN) return new Response("Not found", { status: 404 });
  return Response.json(await capability(env, role), { headers: { "Cache-Control": "no-store" } });
}
__name(internalCapability, "internalCapability");
async function assertWriteGate(env, role) {
  const mode = writeMode(env);
  if (!MODES.has(mode) || mode === "READ_ONLY_MAINTENANCE") closed();
  if (mode === "NORMAL") {
    if (env.REPORTS_DUAL_WRITE_ENABLED === "true") closed("ROLLOUT_NOT_READY");
    return false;
  }
  const own = await capability(env, role);
  if (!own.ready || !env.REPORTS_PEER?.fetch || !env.REPORTS_GATE_TOKEN || !env.REPORTS_PEER_RELEASE_ID) closed("ROLLOUT_NOT_READY");
  let peer;
  try {
    const response = await env.REPORTS_PEER.fetch(new Request("https://reports-gate.internal/_internal/reports-capability", { headers: { "X-Reports-Gate": env.REPORTS_GATE_TOKEN }, signal: AbortSignal.timeout(3e3) }));
    if (!response.ok) closed("ROLLOUT_NOT_READY");
    peer = await response.json();
  } catch {
    closed("ROLLOUT_NOT_READY");
  }
  if (!peer.ready || peer.role !== (role === "public" ? "admin" : "public") || peer.mode !== mode || peer.build !== BUILD_CAPABILITY || peer.schema !== own.schema || peer.activation !== own.activation || peer.release !== env.REPORTS_PEER_RELEASE_ID || peer.peerRelease !== own.release) closed("ROLLOUT_NOT_READY");
  return true;
}
__name(assertWriteGate, "assertWriteGate");
function publicCapability(request, env) {
  const enabled = writeMode(env) === "CANONICAL_DUAL_WRITE" && env.REPORTS_CONFIRMATION_REQUIRED === "true";
  return jsonResponse(request, env, { ok: true, quickReport: { nonBreedingConfirmation: enabled, requestId: enabled, hideLocation: enabled }, maintenance: writeMode(env) === "READ_ONLY_MAINTENANCE" }, 200, { "Cache-Control": "no-store" });
}
__name(publicCapability, "publicCapability");

// src/canonical/persistence.js
var INPUT_KEYS = ["species", "lat", "lon", "observedOn", "birdCount", "reporter", "namePublic", "note", "non_breeding_confirmed", "hideLocation"];
function quickInput(body) {
  if (body?.non_breeding_confirmed !== true) fail("NON_BREEDING_CONFIRMATION_REQUIRED", "\uBC88\uC2DD \uAD00\uB828 \uAD00\uCC30\uC774 \uC544\uB2C8\uB77C\uB294 \uBA85\uC2DC\uC801 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", 400);
  requestId(body.request_id);
  if (typeof body.lat !== "number" || !Number.isFinite(body.lat) || typeof body.lon !== "number" || !Number.isFinite(body.lon)) fail("COORDINATE_REQUIRED", "\uC2E4\uC81C \uAD00\uCC30\uC88C\uD45C\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.", 400);
  const report = validateReport({ ...body, birdCount: null });
  const n = body.birdCount;
  if (n !== void 0 && n !== null && n !== "" && (!Number.isSafeInteger(n) || n < 0 || n > MAX_BIRD_COUNT)) fail("COUNT_INVALID", "\uC218\uB7C9\uC740 0 \uC774\uC0C1\uC758 \uC815\uC218 \uB610\uB294 \uBBF8\uD655\uC778\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.", 400);
  report.birdCount = n === void 0 || n === null || n === "" ? null : n;
  return { report, input: Object.fromEntries(INPUT_KEYS.filter((k) => body[k] !== void 0).map((k) => [k, body[k]])) };
}
__name(quickInput, "quickInput");
async function replayQuick(db, id, input) {
  await assertNotPurged(db, id);
  const raw = await first(db, "SELECT * FROM raw_submissions WHERE request_id=?", id);
  if (!raw) return null;
  const saved = JSON.parse(raw.payload_json);
  if (raw.source_type !== "native_submission" || raw.source_id !== id || await fingerprint(saved.input) !== await fingerprint(input)) fail("IDEMPOTENCY_CONFLICT", "\uAC19\uC740 \uC694\uCCAD \uC2DD\uBCC4\uC790\uC5D0 \uB2E4\uB978 \uB0B4\uC6A9\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  if (raw.source_fingerprint !== await fingerprint(saved) || !saved.accepted) fail("IDEMPOTENCY_STATE_INVALID", "\uC800\uC7A5\uB41C \uC694\uCCAD\uC744 \uAC80\uC99D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const c = await first(db, "SELECT raw_id FROM checklists WHERE checklist_id=?", id);
  const live = await first(db, "SELECT status,pending_public,approx_lat,approx_lon,(approx_lat<>lat OR approx_lon<>lon) AS approx_offset," + LOCATION_HIDDEN_SQL + " AS location_hidden,species,observed_on FROM reports WHERE id=?", id);
  if (c?.raw_id !== raw.raw_id || !live) fail("IDEMPOTENCY_STATE_INVALID", "\uC800\uC7A5 \uACB0\uACFC\uAC00 \uBD88\uC644\uC804\uD569\uB2C8\uB2E4.");
  const accepted = { ...saved.accepted, status: live.status, publicVisibility: live.status === "approved" ? "approved" : live.status === "rejected" ? "not_published" : Number(live.pending_public) === 1 ? "approximate" : "withheld" };
  delete accepted.spot;
  if (live.status === "pending" && Number(live.pending_public) === 1 && live.approx_lat !== null && live.approx_lon !== null) accepted.spot = { id, status: "pending", lat: live.approx_lat, lon: live.approx_lon, approximate: Number(live.approx_offset) === 1, species: splitSpecies(live.species), date: live.observed_on, ...Number(live.location_hidden) === 1 ? { locationHidden: true } : {} };
  return accepted;
}
__name(replayQuick, "replayQuick");
var REDEMPTION_RETENTION_MS = 60 * 60 * 1e3;
async function persistQuick(binding, row, input, accepted, tokenHash) {
  const db = applicationDb(binding), id = requestId(row.id), now = row.received_at;
  const previous = await replayQuick(db, id, input);
  if (previous) return previous;
  const payload = { input, accepted };
  const raw = { raw_id: `raw:${id}`, source_type: "native_submission", source_id: id, request_id: id, payload_json: stable(payload), submitted_at: now, submitted_by: null, schema_version: "quick-v1", captured_at: now, source_fingerprint: await fingerprint(payload), non_breeding_confirmed: 1, policy_version: "non-breeding-v1" };
  if (typeof tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(tokenHash)) fail("CAPTCHA_REQUIRED", "\uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.", 400);
  const key = `submit:${id}`, cutoff = new Date(Date.parse(now) - REDEMPTION_RETENTION_MS).toISOString();
  const statements = [
    assertion(db, key, "NOT EXISTS (SELECT 1 FROM audit_log WHERE action='forbidden_content_purged' AND target_id=?)", [id]),
    clearAssertion(db, key),
    db.prepare("DELETE FROM captcha_redemptions WHERE redeemed_at<?").bind(cutoff),
    insert(db, "captcha_redemptions", { token_hash: tokenHash, request_id: id, redeemed_at: now }),
    insert(db, "reports", row),
    insert(db, "raw_submissions", raw),
    insert(db, "checklists", checklistFromReport(row, raw.raw_id, now, true)),
    insert(db, "sightings", initialSighting(row, now, true))
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    rethrowIfFrozen(error);
    const replay = await replayQuick(db, id, input);
    if (replay) return replay;
    if (await first(db, "SELECT 1 AS used FROM captcha_redemptions WHERE token_hash=? AND request_id<>?", tokenHash, id)) fail("CAPTCHA_REUSED", "\uC774\uBBF8 \uC0AC\uC6A9\uB41C \uC790\uB3D9 \uB4F1\uB85D \uBC29\uC9C0 \uD655\uC778\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 403);
    if (await first(db, "SELECT id FROM reports WHERE dedupe_hash=? OR id=?", row.dedupe_hash, id)) fail("DUPLICATE_REPORT", "\uAC19\uC740 \uC885\xB7\uC704\uCE58\xB7\uB0A0\uC9DC\uC758 \uC81C\uBCF4\uAC00 \uC774\uBBF8 \uC811\uC218\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    fail("WRITE_FAILED", "\uC81C\uBCF4\uB97C \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC694\uCCAD\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 503);
  }
  return accepted;
}
__name(persistQuick, "persistQuick");

// src/canonical/shadow.js
var FIELDS = /* @__PURE__ */ new Set(["status", "species", "bird_count", "lat", "lon", "reporter", "name_public", "spot_key", "pending_public", "history", "total", "limit", "offset", "publicVisibility", "receivedAt", "decidedAt", "date"]);
function compareShadow(a, b) {
  const found = /* @__PURE__ */ new Set();
  function visit(x, y, key = "response") {
    if (stable(x) === stable(y)) return;
    if (x === null || y === null || typeof x !== typeof y) {
      found.add("shape");
      return;
    }
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) found.add("count");
      for (let i = 0; i < Math.min(x.length, y.length); i++) visit(x[i], y[i], key);
      return;
    }
    if (typeof x === "object" && typeof y === "object") {
      const keys = /* @__PURE__ */ new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) {
        if (k === "generatedAt" || k === "serverTime") continue;
        if (!Object.hasOwn(x, k) || !Object.hasOwn(y, k)) {
          found.add("shape");
          if (FIELDS.has(k)) found.add(k);
        } else visit(x[k], y[k], FIELDS.has(k) ? k : key);
      }
      return;
    }
    found.add(FIELDS.has(key) ? key : "value_or_order");
  }
  __name(visit, "visit");
  visit(a, b);
  return [...found].sort();
}
__name(compareShadow, "compareShadow");
async function shadowRead(request, env, legacyResponse, reader, log = (entry) => console.log(JSON.stringify(entry))) {
  const path = new URL(request.url).pathname;
  const endpoint = path === "/reports/approved" ? "approved" : path === "/reports/pending" ? "pending" : path.startsWith("/reports/site/") ? "site" : "status";
  try {
    const canonical = await reader(request, { ...env, REPORTS_DB: canonicalReadDb(env.REPORTS_DB), REPORTS_SHADOW_READ: "false" });
    const legacyBody = await legacyResponse.json(), canonicalBody = await canonical.json();
    if (legacyBody.publication && (canonicalBody.error?.code === "PUBLICATION_CHANGED" || canonicalBody.publication && (canonicalBody.publication.epoch !== legacyBody.publication.epoch || canonicalBody.publication.revision !== legacyBody.publication.revision))) {
      log({ event: "canonical_shadow_inconclusive", endpoint, reason: "publication_changed" });
      return ["publication_changed"];
    }
    const differences = compareShadow(legacyBody, canonicalBody);
    if (legacyResponse.status !== canonical.status) differences.push("http_status");
    if (differences.length) log({ event: "canonical_shadow_mismatch", endpoint, differences });
    return differences;
  } catch {
    log({ event: "canonical_shadow_error", endpoint });
    return ["read_error"];
  }
}
__name(shadowRead, "shadowRead");

// src/notify.js
var RESEND_URL = "https://api.resend.com/emails";
var SUBJECT = "[\uB4E4\uBAFC \uD0D0\uC870\uC9C0\uB3C4] \uC0C8 \uCD9C\uD604\uC885 \uC81C\uBCF4\uAC00 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4";
function kst(iso2) {
  const t = new Date(Date.parse(iso2) + 9 * 3600 * 1e3).toISOString();
  return t.slice(0, 10) + " " + t.slice(11, 16);
}
__name(kst, "kst");
function emailText(row, env) {
  const lines = [
    "\uC0C8\uB85C\uC6B4 \uCD9C\uD604\uC885 \uC81C\uBCF4\uAC00 \uC811\uC218\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    "",
    "\uC885\uBA85: " + row.species,
    "\uAD00\uCC30\uC77C: " + row.observed_on,
    "\uC811\uC218\uC77C\uC2DC: " + kst(row.received_at) + " (KST)",
    "\uC704\uCE58: " + Number(row.lat).toFixed(5) + ", " + Number(row.lon).toFixed(5),
    "\uC9C0\uB3C4: https://map.kakao.com/link/map/" + encodeURIComponent(row.species) + "," + row.lat + "," + row.lon
  ];
  if (row.bird_count != null) lines.push("\uAC1C\uCCB4\uC218: " + row.bird_count);
  lines.push("\uC81C\uBCF4\uC790: " + (row.reporter || "(\uBBF8\uC785\uB825)"));
  if (row.note) lines.push("\uC124\uBA85: " + row.note);
  lines.push("\uC0C1\uD0DC: \uC2B9\uC778 \uB300\uAE30", "\uC811\uC218 \uBC88\uD638: " + row.id, "", "\uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uC5D0\uC11C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  if (env.ADMIN_PAGE_URL) lines.push("[\uC81C\uBCF4 \uD655\uC778\uD558\uAE30] " + env.ADMIN_PAGE_URL);
  return lines.join("\n");
}
__name(emailText, "emailText");
async function sendEmail(row, env) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL_TO || !env.NOTIFY_EMAIL_FROM) {
    console.warn("notify: email skipped (not configured)", row.id);
    return;
  }
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      // Resend 가 같은 키의 재전송을 24시간 동안 한 번으로 묶는다(제보 ID 기준 1회).
      "Idempotency-Key": "new-report/" + row.id
    },
    body: JSON.stringify({
      from: env.NOTIFY_EMAIL_FROM,
      to: env.NOTIFY_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
      subject: SUBJECT,
      text: emailText(row, env)
    }),
    signal: AbortSignal.timeout(8e3)
  });
  if (!response.ok) throw new Error("email HTTP " + response.status);
}
__name(sendEmail, "sendEmail");
async function notifyNewReport(row, env) {
  try {
    await sendEmail(row, env);
  } catch (error) {
    console.error("notify: email failed", row.id, String(error?.message || error));
  }
}
__name(notifyNewReport, "notifyNewReport");

// src/field-updates.js
var FIELD_UPDATE_TTL_HOURS = 3;
var FIELD_STATUSES = ["visible", "searching", "not_visible", "reappeared"];
var DELETED = "deleted";
var CREATE_STATUSES = ["visible", "searching"];
var TRANSITIONS = {
  searching: ["visible", "not_visible"],
  visible: ["not_visible"],
  reappeared: ["not_visible"],
  not_visible: ["reappeared"]
};
var CONFIRMABLE = ["visible", "reappeared"];
var FIELD_NOTE_MAX = 100;
var FIELD_NICKNAME_MAX = 20;
var FIELD_COUNT_MAX = 999;
var LIST_LIMIT = 100;
var HISTORY_LIMIT = 8;
var WRITE_WINDOW_MINUTES = 10;
var WRITE_WINDOW_MAX = 10;
var WRITE_DAY_MAX = 80;
var CONFIRM_WINDOW_MAX = 30;
var DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
var SOURCES = ["gps", "map"];
function cleanText(raw, max, field) {
  if (raw === void 0 || raw === null) return null;
  const text = String(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text) return null;
  if (text.length > max) {
    throw new WorkerError("FIELD_TEXT_TOO_LONG", `${field}\uC740(\uB294) ${max}\uC790\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC5B4\uC694.`, 400);
  }
  if (/[<>]/.test(text)) {
    throw new WorkerError("FIELD_TEXT_INVALID", `${field}\uC5D0 < \uB610\uB294 > \uB294 \uC4F8 \uC218 \uC5C6\uC5B4\uC694.`, 400);
  }
  return text;
}
__name(cleanText, "cleanText");
function validateStatus(raw) {
  const status = String(raw ?? "");
  if (!FIELD_STATUSES.includes(status)) {
    throw new WorkerError("FIELD_STATUS_INVALID", "\uC54C \uC218 \uC5C6\uB294 \uC0C1\uD0DC\uC608\uC694. \uB2E4\uC2DC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.", 400);
  }
  return status;
}
__name(validateStatus, "validateStatus");
function validateDevice(raw) {
  const id = String(raw ?? "");
  if (!DEVICE_ID.test(id)) {
    throw new WorkerError("FIELD_DEVICE_REQUIRED", "\uBE0C\uB77C\uC6B0\uC800 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 400);
  }
  return id;
}
__name(validateDevice, "validateDevice");
function validateCount(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > FIELD_COUNT_MAX) {
    throw new WorkerError("FIELD_COUNT_INVALID", `\uAC1C\uCCB4\uC218\uB294 1~${FIELD_COUNT_MAX} \uC0AC\uC774\uC758 \uC22B\uC790\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.`, 400);
  }
  return value;
}
__name(validateCount, "validateCount");
function protection(species, note) {
  const breeding = isSensitiveReport({ note: note || "", speciesText: species, species: [] });
  const sensitiveSpecies = isSensitiveReport({ note: "", speciesText: "", species: [species] });
  return { breeding, sensitiveSpecies };
}
__name(protection, "protection");
function userHash(deviceId, env) {
  return sha256Hex(`device:${env.REPORT_IP_SALT || ""}:${deviceId}`);
}
__name(userHash, "userHash");
function iso(date) {
  return date.toISOString();
}
__name(iso, "iso");
function cutoffIso(now) {
  return iso(new Date(now.getTime() - FIELD_UPDATE_TTL_HOURS * 3600 * 1e3));
}
__name(cutoffIso, "cutoffIso");
async function enforceRate(db, table, hash, now, max) {
  const windowStart = iso(new Date(now.getTime() - WRITE_WINDOW_MINUTES * 60 * 1e3));
  const dayStart = iso(new Date(now.getTime() - 24 * 3600 * 1e3));
  const row = await db.prepare(
    `SELECT SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS recent,
              COUNT(*) AS daily
         FROM ${table} WHERE ip_hash = ?1 AND created_at >= ?3`
  ).bind(hash, windowStart, dayStart).first();
  if (Number(row?.recent || 0) >= max || Number(row?.daily || 0) >= WRITE_DAY_MAX) {
    throw new WorkerError("FIELD_RATE_LIMITED", "\uB108\uBB34 \uC790\uC8FC \uBCF4\uB0B4\uACE0 \uC788\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", 429);
  }
}
__name(enforceRate, "enforceRate");
function publicEntry(row, events, confirmCount) {
  const entry = {
    id: row.id,
    rowRevision: row.row_revision,
    expiresAt: new Date(Date.parse(row.last_activity_at) + FIELD_UPDATE_TTL_HOURS * 36e5).toISOString(),
    species: row.species,
    count: row.bird_count,
    status: row.status,
    lat: row.public_lat,
    lon: row.public_lon,
    nickname: row.nickname,
    note: row.note,
    firstSeenAt: row.created_at,
    updatedAt: row.updated_at,
    lastConfirmedAt: row.last_confirmed_at,
    confirmCount,
    history: events.map((event) => ({ status: event.status, at: event.created_at, nickname: event.nickname }))
  };
  const storedHidden = Number(row.location_hidden) === 1;
  const sensitiveSpecies = protection(row.species, "").sensitiveSpecies;
  if (storedHidden || sensitiveSpecies) {
    entry.locationHidden = true;
    if (!storedHidden || row.public_point_masked !== 1) {
      entry.lat = null;
      entry.lon = null;
    }
  }
  return entry;
}
__name(publicEntry, "publicEntry");
async function loadEntries(db, rows2) {
  if (!rows2.length) return [];
  const marks = rows2.map((_, index) => `?${index + 1}`).join(", ");
  const ids = rows2.map((row) => row.id);
  const { results: events } = await db.prepare(
    `SELECT field_update_id, status, nickname, created_at FROM field_update_events
        WHERE field_update_id IN (${marks}) ORDER BY created_at ASC, rowid ASC`
  ).bind(...ids).all();
  const { results: counts } = await db.prepare(
    `SELECT field_update_id, COUNT(*) AS n FROM field_update_confirmations
        WHERE field_update_id IN (${marks}) GROUP BY field_update_id`
  ).bind(...ids).all();
  const eventsById = /* @__PURE__ */ new Map();
  for (const event of events || []) {
    if (!eventsById.has(event.field_update_id)) eventsById.set(event.field_update_id, []);
    eventsById.get(event.field_update_id).push(event);
  }
  const countById = new Map((counts || []).map((row) => [row.field_update_id, Number(row.n)]));
  return rows2.map((row) => {
    const list = eventsById.get(row.id) || [];
    return publicEntry(row, list.slice(-HISTORY_LIMIT), countById.get(row.id) || 0);
  });
}
__name(loadEntries, "loadEntries");
var COLUMNS = `id, species, bird_count, status, public_lat, public_lon, location_hidden, nickname, note,
                 CASE WHEN public_lat IS NOT NULL AND public_lon IS NOT NULL
                   AND (public_lat <> lat OR public_lon <> lon) THEN 1 ELSE 0 END AS public_point_masked,
                 created_at, updated_at, last_confirmed_at, last_activity_at, user_hash, CAST(row_revision AS TEXT) AS row_revision`;
async function loadActive(db, id, now) {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  if (row && !/^[1-9][0-9]{0,18}$/.test(row.row_revision)) throw new WorkerError("FIELD_UNAVAILABLE", "\uD604\uC7A5\uC18C\uC2DD \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694.", 503);
  if (!row || row.status === DELETED) throw new WorkerError("FIELD_NOT_FOUND", "\uCC3E\uC744 \uC218 \uC5C6\uB294 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 404);
  if (row.last_activity_at < cutoffIso(now)) {
    throw new WorkerError("FIELD_EXPIRED", "\uC2DC\uAC04\uC774 \uC9C0\uB098 \uC774\uBBF8 \uC0AC\uB77C\uC9C4 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 410);
  }
  return row;
}
__name(loadActive, "loadActive");
async function fieldWriteFailure(db, id, error) {
  rethrowIfFrozen(error);
  const row = await db.prepare("SELECT status,last_activity_at FROM field_updates WHERE id=?1").bind(id).first();
  if (!row || row.status === DELETED) throw new WorkerError("FIELD_NOT_FOUND", "\uCC3E\uC744 \uC218 \uC5C6\uB294 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 404);
  if (row.last_activity_at < cutoffIso(/* @__PURE__ */ new Date())) throw new WorkerError("FIELD_EXPIRED", "\uC2DC\uAC04\uC774 \uC9C0\uB098 \uC774\uBBF8 \uC0AC\uB77C\uC9C4 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 410);
  if (/field_deleted_terminal|field_revision|transaction_assertions|CHECK constraint/i.test(String(error?.message))) throw new WorkerError("FIELD_REVISION_CONFLICT", "\uD604\uC7A5\uC18C\uC2DD\uC774 \uBA3C\uC800 \uBCC0\uACBD\uB410\uC5B4\uC694. \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 409);
  throw error;
}
__name(fieldWriteFailure, "fieldWriteFailure");
function fieldResponse(request, env, body, status = 200, headers = {}) {
  if (env.REPORTS_PUBLICATION_REQUIRED === "true" && body?.update) body = { ok: body.ok, id: body.update.id, status: body.update.status, rowRevision: body.update.rowRevision };
  return jsonResponse(request, env, body, status, headers);
}
__name(fieldResponse, "fieldResponse");
async function handleList(request, env, helpers) {
  const db = helpers.database(env);
  const now = /* @__PURE__ */ new Date();
  const { results } = await db.prepare(
    `SELECT ${COLUMNS} FROM field_updates
        WHERE last_activity_at >= ?1 AND status <> '${DELETED}' ORDER BY last_activity_at DESC LIMIT ${LIST_LIMIT}`
  ).bind(cutoffIso(now)).all();
  const updates = await loadEntries(db, results || []);
  return jsonResponse(
    request,
    env,
    { ok: true, serverTime: iso(now), ttlHours: FIELD_UPDATE_TTL_HOURS, updates },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleList, "handleList");
async function handleCreate(request, env, helpers) {
  const db = helpers.database(env);
  const now = /* @__PURE__ */ new Date();
  const body = await helpers.readJsonBody(request);
  const status = validateStatus(body?.status);
  if (!CREATE_STATUSES.includes(status)) {
    throw new WorkerError("FIELD_STATUS_NOT_ALLOWED", "\uCC98\uC74C \uB4F1\uB85D\uC740 '\uC9C0\uAE08 \uBCF4\uC5EC\uC694' \uB610\uB294 '\uCC3E\uB294 \uC911'\uB9CC \uAC00\uB2A5\uD574\uC694.", 400);
  }
  const species = normalizeSpecies(body?.species);
  if (species.length !== 1) {
    throw new WorkerError("SPECIES_INVALID", "\uC885\uBA85\uC740 \uD558\uB098\uB9CC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.", 400);
  }
  const { lat, lon } = normalizeCoordinate(body?.lat, body?.lon);
  const count = validateCount(body?.count);
  const note = cleanText(body?.note, FIELD_NOTE_MAX, "\uBA54\uBAA8");
  const nickname = cleanText(body?.nickname, FIELD_NICKNAME_MAX, "\uB2C9\uB124\uC784") || "\uC775\uBA85";
  const device = validateDevice(body?.deviceId);
  const source = SOURCES.includes(body?.locationSource) ? body.locationSource : null;
  const accuracy = Number.isFinite(Number(body?.gpsAccuracy)) && Number(body.gpsAccuracy) >= 0 ? Math.min(1e5, Math.round(Number(body.gpsAccuracy))) : null;
  const { breeding, sensitiveSpecies } = protection(species[0], note);
  if (breeding) {
    throw new WorkerError("FIELD_BREEDING_NOT_ALLOWED", "\uBC88\uC2DD \uAD00\uB828 \uC815\uBCF4\uB294 \uD604\uC7A5\uC18C\uC2DD\uC73C\uB85C \uACF5\uC720\uD560 \uC218 \uC5C6\uC5B4\uC694.", 400);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_events", hash, now, WRITE_WINDOW_MAX);
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  const user = await userHash(device, env);
  const publicPoint = sensitiveSpecies ? approximateCoordinate(lat, lon) : { lat, lon };
  const id = crypto.randomUUID();
  const at = iso(now);
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO field_updates
         (id, species, bird_count, status, lat, lon, public_lat, public_lon, location_hidden, nickname, note,
          location_source, gps_accuracy, created_at, updated_at, last_confirmed_at, last_activity_at, user_hash, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, NULL, ?14, ?15, ?16)`
      ).bind(
        id,
        species[0],
        count,
        status,
        lat,
        lon,
        publicPoint.lat,
        publicPoint.lon,
        sensitiveSpecies ? 1 : 0,
        nickname,
        note,
        source,
        accuracy,
        at,
        user,
        hash
      ),
      db.prepare(
        `INSERT INTO field_update_events (id, field_update_id, status, nickname, created_at, user_hash, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(crypto.randomUUID(), id, status, nickname, at, user, hash)
    ]);
  } catch (error) {
    rethrowIfFrozen(error);
    throw error;
  }
  const row = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [row]);
  return fieldResponse(request, env, { ok: true, update }, 201);
}
__name(handleCreate, "handleCreate");
async function handleStatus(request, env, id, helpers) {
  const db = helpers.database(env);
  const now = /* @__PURE__ */ new Date();
  const body = await helpers.readJsonBody(request);
  const status = validateStatus(body?.status);
  const nickname = cleanText(body?.nickname, FIELD_NICKNAME_MAX, "\uB2C9\uB124\uC784") || "\uC775\uBA85";
  const device = validateDevice(body?.deviceId);
  const row = await loadActive(db, id, now);
  if (row.status === status) {
    throw new WorkerError("FIELD_STATUS_SAME", "\uC774\uBBF8 \uAC19\uC740 \uC0C1\uD0DC\uB85C \uC62C\uB77C\uC640 \uC788\uC5B4\uC694.", 409);
  }
  if (!(TRANSITIONS[row.status] || []).includes(status)) {
    throw new WorkerError("FIELD_STATUS_TRANSITION", "\uC9C0\uAE08 \uC0C1\uD0DC\uC5D0\uC11C\uB294 \uC120\uD0DD\uD560 \uC218 \uC5C6\uB294 \uC0C1\uD0DC\uC608\uC694.", 409);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_events", hash, now, WRITE_WINDOW_MAX);
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  const user = await userHash(device, env);
  const writeNow = /* @__PURE__ */ new Date(), at = iso(writeNow), key = "field-status:" + crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("UPDATE field_updates SET status=?2,updated_at=?3,last_activity_at=?3,row_revision=row_revision+1 WHERE id=?1 AND CAST(row_revision AS TEXT)=?4 AND status=?5 AND status<>'deleted' AND last_activity_at>=?6" + (env.REPORTS_PUBLICATION_REQUIRED === "true" ? " AND julianday(last_activity_at)>=julianday('now','-3 hours')" : "")).bind(id, status, at, row.row_revision, row.status, cutoffIso(writeNow)),
      assertion(db, key),
      clearAssertion(db, key),
      db.prepare("INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(crypto.randomUUID(), id, status, nickname, at, user, hash)
    ]);
  } catch (error) {
    await fieldWriteFailure(db, id, error);
  }
  const fresh = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [fresh]);
  return fieldResponse(request, env, { ok: true, update }, 201);
}
__name(handleStatus, "handleStatus");
async function handleConfirm(request, env, id, helpers) {
  const db = helpers.database(env);
  const now = /* @__PURE__ */ new Date();
  const body = await helpers.readJsonBody(request);
  const device = validateDevice(body?.deviceId);
  const row = await loadActive(db, id, now);
  if (!CONFIRMABLE.includes(row.status)) {
    throw new WorkerError("FIELD_NOT_CONFIRMABLE", "\uC9C0\uAE08 \uBCF4\uC774\uB294 \uC0C1\uD0DC\uC758 \uC18C\uC2DD\uB9CC \uD655\uC778\uD560 \uC218 \uC788\uC5B4\uC694.", 409);
  }
  const user = await userHash(device, env);
  if (user === row.user_hash) {
    throw new WorkerError("FIELD_CONFIRM_OWN", "\uC9C1\uC811 \uC62C\uB9B0 \uC18C\uC2DD\uC740 \uD655\uC778\uD560 \uC218 \uC5C6\uC5B4\uC694.", 409);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_confirmations", hash, now, CONFIRM_WINDOW_MAX);
  const writeNow = /* @__PURE__ */ new Date(), at = iso(writeNow), key = "field-confirm:" + crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("UPDATE field_updates SET last_confirmed_at=?2,last_activity_at=?2,row_revision=row_revision+1 WHERE id=?1 AND CAST(row_revision AS TEXT)=?3 AND status IN ('visible','reappeared') AND last_activity_at>=?4" + (env.REPORTS_PUBLICATION_REQUIRED === "true" ? " AND julianday(last_activity_at)>=julianday('now','-3 hours')" : "")).bind(id, at, row.row_revision, cutoffIso(writeNow)),
      assertion(db, key),
      clearAssertion(db, key),
      db.prepare("INSERT INTO field_update_confirmations(id,field_update_id,user_hash,ip_hash,created_at) VALUES (?1,?2,?3,?4,?5)").bind(crypto.randomUUID(), id, user, hash, at)
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: field_update_confirmations/i.test(String(error?.message))) throw new WorkerError("FIELD_ALREADY_CONFIRMED", "\uC774\uBBF8 \uD655\uC778\uD558\uC168\uC5B4\uC694.", 409);
    await fieldWriteFailure(db, id, error);
  }
  const fresh = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [fresh]);
  return fieldResponse(request, env, { ok: true, update }, 201);
}
__name(handleConfirm, "handleConfirm");
async function handleDelete(request, env, id, helpers) {
  const db = helpers.database(env);
  const now = /* @__PURE__ */ new Date();
  const body = await helpers.readJsonBody(request);
  const device = validateDevice(body?.deviceId);
  const row = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  if (!row) throw new WorkerError("FIELD_NOT_FOUND", "\uCC3E\uC744 \uC218 \uC5C6\uB294 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 404);
  const user = await userHash(device, env);
  if (user !== row.user_hash) {
    if (row.status === DELETED) throw new WorkerError("FIELD_NOT_FOUND", "\uCC3E\uC744 \uC218 \uC5C6\uB294 \uD604\uC7A5\uC18C\uC2DD\uC774\uC5D0\uC694.", 404);
    throw new WorkerError("FIELD_DELETE_FORBIDDEN", "\uC9C1\uC811 \uC62C\uB9B0 \uD604\uC7A5\uC18C\uC2DD\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
  }
  if (row.status === DELETED) return jsonResponse(request, env, { ok: true, id, alreadyDeleted: true }, 200, { "Cache-Control": "no-store" });
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_events", hash, now, WRITE_WINDOW_MAX);
  const at = iso(/* @__PURE__ */ new Date()), key = "field-delete:" + crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("UPDATE field_updates SET status='deleted',row_revision=row_revision+1 WHERE id=?1 AND user_hash=?2 AND CAST(row_revision AS TEXT)=?3 AND status<>'deleted'").bind(id, user, row.row_revision),
      assertion(db, key),
      clearAssertion(db, key),
      db.prepare("INSERT INTO field_update_events(id,field_update_id,status,nickname,created_at,user_hash,ip_hash) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(crypto.randomUUID(), id, DELETED, row.nickname, at, user, hash)
    ]);
  } catch (error) {
    const current = await db.prepare("SELECT status,user_hash FROM field_updates WHERE id=?1").bind(id).first();
    if (current?.status === DELETED && current.user_hash === user) return jsonResponse(request, env, { ok: true, id, alreadyDeleted: true }, 200, { "Cache-Control": "no-store" });
    await fieldWriteFailure(db, id, error);
  }
  return jsonResponse(request, env, { ok: true, id, deletedAt: at }, 200, { "Cache-Control": "no-store" });
}
__name(handleDelete, "handleDelete");
var PATH = /^\/field-updates(?:\/([0-9a-f-]{36})\/(status|confirm|delete))?$/;
async function handleFieldUpdates(request, env, url, helpers) {
  const match = PATH.exec(url.pathname);
  if (!match) return null;
  const [, id, action] = match;
  if (!id && request.method === "GET") return handleList(request, env, helpers);
  if (!id && request.method === "POST") return handleCreate(request, env, helpers);
  if (id && request.method === "POST") {
    if (action === "delete") return handleDelete(request, env, id, helpers);
    return action === "status" ? handleStatus(request, env, id, helpers) : handleConfirm(request, env, id, helpers);
  }
  throw new WorkerError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
__name(handleFieldUpdates, "handleFieldUpdates");
function fieldSnapshotStatements(db, now) {
  const cutoff = cutoffIso(now), active = `SELECT id FROM field_updates WHERE last_activity_at>=?1 AND status<>'deleted' ORDER BY last_activity_at DESC LIMIT ${LIST_LIMIT}`;
  return [
    db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id IN (${active}) ORDER BY last_activity_at DESC`).bind(cutoff),
    db.prepare(`SELECT field_update_id,status,nickname,created_at FROM field_update_events WHERE field_update_id IN (${active}) ORDER BY created_at ASC,rowid ASC`).bind(cutoff),
    db.prepare(`SELECT field_update_id,COUNT(*) AS n FROM field_update_confirmations WHERE field_update_id IN (${active}) GROUP BY field_update_id`).bind(cutoff)
  ];
}
__name(fieldSnapshotStatements, "fieldSnapshotStatements");
function fieldSnapshotPayload(sets, now) {
  const parents = sets[0].results || [], events = sets[1].results || [], counts = sets[2].results || [];
  return { ok: true, serverTime: iso(now), ttlHours: FIELD_UPDATE_TTL_HOURS, updates: parents.map((row) => publicEntry(row, events.filter((e) => e.field_update_id === row.id).slice(-HISTORY_LIMIT), Number(counts.find((c) => c.field_update_id === row.id)?.n || 0))) };
}
__name(fieldSnapshotPayload, "fieldSnapshotPayload");

// src/publication.js
var PUBLICATION_CONTRACT = "publication-v1";
var PUBLICATION_PROJECTION = "legacy-public-v1";
var PUBLICATION_GUARDS = [...WRITER_FENCE_GUARDS, "publication_state_permanent", "publication_state_transition", ...["reports", "field_updates"].flatMap((t) => ["insert", "update", "delete"].map((a) => `publication_${t}_${a}`)), "field_deleted_terminal", "field_revision_valid", "field_revision_advance", "field_event_live", "field_confirmation_live", ...["field_updates", "field_update_events", "field_update_confirmations"].flatMap((t) => ["insert", "update", "delete"].map((a) => `field_freeze_${t}_${a}`))];
var MAX_REV = 9223372036854775807n;
function publicationRevision(value, minimum = 0n) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)) return false;
  const n = BigInt(value);
  return n >= minimum && n <= MAX_REV;
}
__name(publicationRevision, "publicationRevision");
var token = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[0-9a-f]{32}$/.test(v), "token");
function fail2(code, message, status = 503) {
  throw new WorkerError(code, message, status);
}
__name(fail2, "fail");
function publicationRequest(url, head = false) {
  const nonce = url.searchParams.get("nonce");
  if (!token(nonce)) fail2("PUBLICATION_REQUEST_INVALID", "\uACF5\uAC1C \uC704\uCE58 \uD655\uC778 \uC694\uCCAD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
  if (!head && (url.searchParams.get("contract") !== PUBLICATION_CONTRACT || !token(url.searchParams.get("expectedEpoch")) || !publicationRevision(url.searchParams.get("expectedRevision")))) fail2("PUBLICATION_REQUEST_INVALID", "\uACF5\uAC1C \uC704\uCE58 \uD655\uC778 \uC694\uCCAD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
  return { nonce, epoch: url.searchParams.get("expectedEpoch"), revision: url.searchParams.get("expectedRevision") };
}
__name(publicationRequest, "publicationRequest");
var guardLookupHints = /* @__PURE__ */ new WeakMap();
function guardLocators(row) {
  if (!row || typeof row.guardLocators !== "string") return null;
  let slots;
  try {
    slots = JSON.parse(row.guardLocators);
  } catch {
    return null;
  }
  if (!Array.isArray(slots) || slots.length !== PUBLICATION_GUARDS.length) return null;
  const byName = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    if (!slot || !PUBLICATION_GUARDS.includes(slot.name) || byName.has(slot.name) || typeof slot.rowid !== "string" || !/^[1-9][0-9]{0,18}$/.test(slot.rowid) || BigInt(slot.rowid) > MAX_REV) return null;
    byName.set(slot.name, slot.rowid);
  }
  return PUBLICATION_GUARDS.map((name) => [name, byName.get(name)]);
}
__name(guardLocators, "guardLocators");
function publicationStateStatement(db, slots = null) {
  const columns = "epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revision_type,(SELECT COUNT(*) FROM publication_writer_claim) AS writerClaims";
  if (slots) {
    const checks = slots.map((_, i) => `(SELECT COUNT(*) FROM sqlite_schema WHERE rowid=?${i * 2 + 1} AND type='trigger' AND name=?${i * 2 + 2})`);
    return db.prepare(`SELECT ${columns},(${checks.join("+")}) AS guards FROM public_publication_state WHERE id=1`).bind(...slots.flatMap(([name, rowid]) => [rowid, name]));
  }
  return db.prepare(`SELECT ${columns},
 (SELECT json_group_array(json_object('name',name,'rowid',CAST(rowid AS TEXT))) FROM sqlite_schema WHERE type='trigger' AND name IN (${PUBLICATION_GUARDS.map(() => "?").join(",")})) AS guardLocators
 FROM public_publication_state WHERE id=1`).bind(...PUBLICATION_GUARDS);
}
__name(publicationStateStatement, "publicationStateStatement");
function verifiedState(row, slots) {
  if (slots) return row;
  const discovered = guardLocators(row);
  return discovered ? { ...row, guards: discovered.length } : null;
}
__name(verifiedState, "verifiedState");
function rememberGuardLocators(binding, row) {
  const slots = guardLocators(row);
  if (slots) guardLookupHints.set(binding, slots);
}
__name(rememberGuardLocators, "rememberGuardLocators");
function validateState(row, request, head) {
  if (!row || row.writerClaims !== 0 || !token(row.epoch) || row.revision_type !== "integer" || !publicationRevision(row.revision) || Number(row.guards) !== PUBLICATION_GUARDS.length) fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58\uC758 \uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (!head && (row.epoch !== request.epoch || row.revision !== request.revision)) fail2("PUBLICATION_CHANGED", "\uACF5\uAC1C \uC704\uCE58 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB410\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.", 409);
  return { contract: PUBLICATION_CONTRACT, epoch: row.epoch, revision: row.revision, projection: PUBLICATION_PROJECTION, nonce: request.nonce };
}
__name(validateState, "validateState");
function primary(db) {
  return typeof db.withSession === "function" ? db.withSession("first-primary") : db;
}
__name(primary, "primary");
async function publicationAnchor(binding, request) {
  try {
    const db = primary(binding), slots = guardLookupHints.get(binding) || null;
    let row = await publicationStateStatement(db, slots).first();
    if (slots && Number(row?.guards) !== PUBLICATION_GUARDS.length) {
      guardLookupHints.delete(binding);
      row = await publicationStateStatement(primary(binding)).first();
    }
    const anchor = validateState(verifiedState(row, slots && Object.hasOwn(row || {}, "guards") ? slots : null), request, true);
    rememberGuardLocators(binding, row);
    return anchor;
  } catch (e) {
    if (e instanceof WorkerError) throw e;
    fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58\uC758 \uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
}
__name(publicationAnchor, "publicationAnchor");
var paths = /* @__PURE__ */ new Set(["/reports/approved", "/reports/pending", "/reports/recent-sites", "/field-updates", "/contributors/monthly", "/reports/reporter-stats"]);
function isPublicationPath(path) {
  return paths.has(path) || path.startsWith("/reports/site/");
}
__name(isPublicationPath, "isPublicationPath");
function reporterStatsRequest(url) {
  const single = /* @__PURE__ */ __name((name) => {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) fail2("REPORTER_STATS_REQUEST_INVALID", "\uD1B5\uACC4 \uC694\uCCAD \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
    return values.length ? values[0] : null;
  }, "single");
  const reporter = single("reporter"), source = single("source"), reportId = single("reportId"), month = single("month");
  if (typeof reporter !== "string" || !reporter.trim() || reporter.length > MAX_REPORTER_LENGTH || /[\u0000-\u001f\u007f]/.test(reporter)) fail2("REPORTER_STATS_REQUEST_INVALID", "\uD1B5\uACC4 \uC694\uCCAD \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
  if (source === "history") {
    if (typeof reportId !== "string" || !/^[0-9A-Za-z_-]{1,64}$/.test(reportId) || month !== null && month !== "") fail2("REPORTER_STATS_REQUEST_INVALID", "\uD1B5\uACC4 \uC694\uCCAD \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
    return { reporter, source, reportId };
  }
  if (source === "monthly") {
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || reportId !== null && reportId !== "") fail2("REPORTER_STATS_REQUEST_INVALID", "\uD1B5\uACC4 \uC694\uCCAD \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
    const [year, mon] = month.split("-").map(Number), end = mon === 12 ? String(year + 1).padStart(4, "0") + "-01-01" : String(year).padStart(4, "0") + "-" + String(mon + 1).padStart(2, "0") + "-01";
    return { reporter, source, start: month + "-01", end };
  }
  fail2("REPORTER_STATS_REQUEST_INVALID", "\uD1B5\uACC4 \uC694\uCCAD \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
}
__name(reporterStatsRequest, "reporterStatsRequest");
function reporterLifetimeCounts(rows2) {
  const species = /* @__PURE__ */ new Set();
  for (const row of rows2) for (const name of splitSpecies(row.species)) species.add(name);
  return { speciesCount: species.size, reportCount: rows2.length };
}
__name(reporterLifetimeCounts, "reporterLifetimeCounts");
function reporterStatsPlan(db, url) {
  const input = reporterStatsRequest(url);
  const eligible = "status='approved' AND name_public=1 AND reporter IS NOT NULL AND TRIM(reporter)<>'' AND reporter=?1 COLLATE BINARY";
  const witness = input.source === "history" ? `id=?2 AND ${eligible}` : `${eligible} AND observed_on>=?2 AND observed_on<?3`;
  const statement = db.prepare(`SELECT species FROM reports WHERE ${eligible} AND EXISTS(SELECT 1 FROM reports WHERE ${witness})`);
  const params = input.source === "history" ? [input.reporter, input.reportId] : [input.reporter, input.start, input.end];
  return { statements: [statement.bind(...params)], build: /* @__PURE__ */ __name((sets) => {
    const rows2 = sets[0].results || [];
    if (!rows2.length) fail2("REPORTER_STATS_UNAVAILABLE", "\uACF5\uAC1C \uD1B5\uACC4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
    return reporterLifetimeCounts(rows2);
  }, "build") };
}
__name(reporterStatsPlan, "reporterStatsPlan");
function readPlan(db, url, now) {
  const path = url.pathname;
  if (path === "/reports/reporter-stats") return reporterStatsPlan(db, url);
  if (path === "/reports/approved") return { statements: [db.prepare("SELECT id,species,lat,lon,public_lat,public_lon,observed_on,reporter,name_public,spot_key FROM reports WHERE status='approved' ORDER BY observed_on DESC,received_at DESC")], build: /* @__PURE__ */ __name((s) => ({ ok: true, generatedAt: now.toISOString(), ...publicPayload(s[0].results || []) }), "build") };
  if (path === "/reports/pending") return { statements: [db.prepare(`SELECT id,species,observed_on,approx_lat,approx_lon,(approx_lat<>lat OR approx_lon<>lon) AS approx_offset,${LOCATION_HIDDEN_SQL} AS location_hidden FROM reports WHERE status='pending' AND pending_public=1 AND approx_lat IS NOT NULL AND approx_lon IS NOT NULL ORDER BY observed_on DESC,received_at DESC`)], build: /* @__PURE__ */ __name((s) => ({ ok: true, generatedAt: now.toISOString(), spots: pendingPayload(s[0].results || []) }), "build") };
  if (path === "/reports/recent-sites") {
    const days = Math.min(30, Math.max(1, Math.floor(Number(url.searchParams.get("days")) || 14))), today = kstDateString(now), since = kstDateString(new Date(now.getTime() - days * 864e5));
    return { statements: [db.prepare(`SELECT site_id,species,observed_on,note FROM reports WHERE status='approved' AND site_id IS NOT NULL AND site_id<>'' AND observed_on>=?1 AND observed_on<=?2 AND NOT ${LOCATION_HIDDEN_SQL} ORDER BY observed_on DESC,received_at DESC,id DESC`).bind(since, today)], build: /* @__PURE__ */ __name((s) => {
      const bySite = /* @__PURE__ */ new Map();
      for (const row of s[0].results || []) {
        const species = splitSpecies(row.species);
        if (isSensitiveReport({ note: row.note, speciesText: row.species, species })) continue;
        const siteId = String(row.site_id);
        if (!bySite.has(siteId)) bySite.set(siteId, { siteId, latestDate: row.observed_on, species: [] });
        for (const name of species) if (!bySite.get(siteId).species.includes(name)) bySite.get(siteId).species.push(name);
      }
      return { ok: true, days, since, today, sites: [...bySite.values()] };
    }, "build") };
  }
  if (path === "/field-updates") return { statements: fieldSnapshotStatements(db, now), build: /* @__PURE__ */ __name((s) => fieldSnapshotPayload(s, now), "build") };
  if (path.startsWith("/reports/site/")) {
    const siteId = decodeURIComponent(path.slice("/reports/site/".length));
    if (!/^[0-9A-Za-z_-]{1,16}$/.test(siteId)) fail2("SITE_ID_INVALID", "\uD0D0\uC870\uC9C0 ID \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.", 400);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 5)), offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    return { statements: [db.prepare("SELECT id,species,observed_on,reporter,name_public FROM reports WHERE status='approved' AND site_id=?1 ORDER BY observed_on DESC,received_at DESC,id DESC LIMIT ?2 OFFSET ?3").bind(siteId, limit, offset), db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='approved' AND site_id=?1").bind(siteId)], build: /* @__PURE__ */ __name((s) => ({ ok: true, siteId, total: Number(s[1].results?.[0]?.n || 0), limit, offset, history: (s[0].results || []).map(historyEntry) }), "build") };
  }
  const raw = url.searchParams.get("month"), month = raw === null ? kstDateString(now).slice(0, 7) : raw;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail2("INVALID_MONTH", "\uC6D4 \uD615\uC2DD\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", 400);
  const [year, mon] = month.split("-").map(Number), start = month + "-01", end = mon === 12 ? year + 1 + "-01-01" : year + "-" + String(mon + 1).padStart(2, "0") + "-01";
  return { statements: [db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='approved' AND observed_on>=?1 AND observed_on<?2").bind(start, end), db.prepare("SELECT reporter,COUNT(*) AS n FROM reports WHERE status='approved' AND name_public=1 AND reporter IS NOT NULL AND TRIM(reporter)<>'' AND observed_on>=?1 AND observed_on<?2 GROUP BY reporter ORDER BY n DESC,reporter ASC").bind(start, end)], build: /* @__PURE__ */ __name((s) => {
    const contributors = (s[1].results || []).map((r) => ({ name: r.reporter, count: Number(r.n) }));
    return { month, approvedReports: Number(s[0].results?.[0]?.n || 0), publicContributors: contributors.length, contributors };
  }, "build") };
}
__name(readPlan, "readPlan");
async function handlePublicationRead(request, env, url) {
  if (request.method !== "GET") return null;
  const head = url.pathname === "/reports/public-state";
  if (!head && !isPublicationPath(url.pathname)) return null;
  if (!head && !url.searchParams.has("contract") && env.REPORTS_PUBLICATION_REQUIRED !== "true") return null;
  const input = publicationRequest(url, head), binding = env.REPORTS_DB;
  if (!binding) fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58\uC758 \uCD5C\uC2E0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const now = /* @__PURE__ */ new Date();
  if (head) return jsonResponse(request, env, { ok: true, publication: await publicationAnchor(binding, input), serverTime: now.toISOString() }, 200, { "Cache-Control": "no-store" });
  try {
    const db = primary(binding), slots = guardLookupHints.get(binding) || null;
    let plan = readPlan(db, url, now);
    let sets = await db.batch([publicationStateStatement(db, slots), ...plan.statements]);
    if (!Array.isArray(sets) || sets.length !== plan.statements.length + 1) fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58 \uC790\uB8CC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    let row = sets[0].results?.[0], usedSlots = slots;
    if (slots && Number(row?.guards) !== PUBLICATION_GUARDS.length) {
      guardLookupHints.delete(binding);
      usedSlots = null;
      const recoveryDb = primary(binding);
      plan = readPlan(recoveryDb, url, now);
      sets = await recoveryDb.batch([publicationStateStatement(recoveryDb), ...plan.statements]);
      if (!Array.isArray(sets) || sets.length !== plan.statements.length + 1) fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58 \uC790\uB8CC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      row = sets[0].results?.[0];
    }
    const publication = validateState(verifiedState(row, usedSlots), input, false), payload = plan.build(sets.slice(1));
    rememberGuardLocators(binding, row);
    return jsonResponse(request, env, { ...payload, publication, serverTime: now.toISOString() }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    if (e instanceof WorkerError) throw e;
    fail2("PUBLICATION_UNAVAILABLE", "\uACF5\uAC1C \uC704\uCE58 \uC790\uB8CC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
}
__name(handlePublicationRead, "handlePublicationRead");

// src/public.js
function reportReceipt(request, env, body, status = 201) {
  if (env.REPORTS_PUBLICATION_REQUIRED === "true") {
    body = { ...body };
    delete body.spot;
  }
  return jsonResponse(request, env, body, status);
}
__name(reportReceipt, "reportReceipt");
var MAX_BODY_BYTES = 4096;
var SITE_HISTORY_DEFAULT = 5;
var SITE_HISTORY_MAX = 50;
var SITE_HISTORY_PATH = "/reports/site/";
var SITE_ID = /^[0-9A-Za-z_-]{1,16}$/;
function database(env) {
  if (!env?.REPORTS_DB) {
    throw new WorkerError(
      "NOT_CONFIGURED",
      "\uC81C\uBCF4 \uC811\uC218\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
      503
    );
  }
  return strictWriterDb(env.REPORTS_DB, env.REPORTS_PUBLICATION_REQUIRED === "true");
}
__name(database, "database");
async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new WorkerError("BODY_TOO_LARGE", "\uC81C\uBCF4 \uB0B4\uC6A9\uC774 \uB108\uBB34 \uAE41\uB2C8\uB2E4.", 413);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new WorkerError("BODY_INVALID", "\uC81C\uBCF4 \uB0B4\uC6A9\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 400);
  }
}
__name(readJsonBody, "readJsonBody");
async function enforceRateLimit(db, hash, now) {
  const windowStart = new Date(
    now.getTime() - RATE_WINDOW_MINUTES * 60 * 1e3
  ).toISOString();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1e3).toISOString();
  const { results } = await db.prepare(
    `SELECT
         SUM(CASE WHEN received_at >= ?2 THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN received_at >= ?3 THEN 1 ELSE 0 END) AS daily
       FROM reports WHERE ip_hash = ?1 AND received_at >= ?3`
  ).bind(hash, windowStart, dayStart).all();
  const recent = Number(results?.[0]?.recent || 0);
  const daily = Number(results?.[0]?.daily || 0);
  if (recent >= RATE_WINDOW_MAX || daily >= RATE_DAY_MAX) {
    throw new WorkerError(
      "RATE_LIMITED",
      "\uC81C\uBCF4\uAC00 \uB108\uBB34 \uC7A6\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
      429
    );
  }
}
__name(enforceRateLimit, "enforceRateLimit");
async function handleCanonicalSubmit(request, env, ctx) {
  const binding = database(env), db = applicationDb(binding);
  const body = await readJsonBody(request), { report, input } = quickInput(body);
  const saved = await replayQuick(db, body.request_id, input);
  if (saved) return reportReceipt(request, env, saved, 201);
  const now = /* @__PURE__ */ new Date(), ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  try {
    await enforceRateLimit(db, hash, now);
    await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY, (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8e3) }), body.request_id);
  } catch (error) {
    const committed = await replayQuick(db, body.request_id, input);
    if (committed) return reportReceipt(request, env, committed, 201);
    throw error;
  }
  const id = body.request_id, hide = report.hideLocation, approx = hide ? approximateCoordinate(report.lat, report.lon) : { lat: report.lat, lon: report.lon }, pendingPublic = Number(env.REPORTS_PENDING_PUBLIC);
  const accepted = { ok: true, id, status: "pending", publicVisibility: pendingPublic ? "approximate" : "withheld" };
  if (pendingPublic) accepted.spot = { id, status: "pending", lat: approx.lat, lon: approx.lon, approximate: hide, species: report.species, date: report.observedOn, ...hide ? { locationHidden: true } : {} };
  const row = {
    id,
    status: "pending",
    species: report.speciesText,
    lat: report.lat,
    lon: report.lon,
    public_lat: hide ? approx.lat : null,
    public_lon: hide ? approx.lon : null,
    approx_lat: approx.lat,
    approx_lon: approx.lon,
    pending_public: pendingPublic,
    observed_on: report.observedOn,
    received_at: now.toISOString(),
    decided_at: null,
    bird_count: report.birdCount,
    reporter: report.reporter,
    note: report.note,
    admin_note: null,
    site_id: null,
    name_public: report.namePublic,
    spot_key: null,
    ip_hash: hash,
    dedupe_hash: await dedupeHash(report)
  };
  const result = await persistQuick(binding, row, input, accepted, await sha256Hex(body.turnstileToken));
  if (result === accepted) {
    const job = notifyNewReport(row, env);
    if (ctx?.waitUntil) ctx.waitUntil(job);
    else await job;
  }
  return reportReceipt(request, env, result, 201);
}
__name(handleCanonicalSubmit, "handleCanonicalSubmit");
async function handleSubmit(request, env, dual = false, ctx) {
  if (dual) return handleCanonicalSubmit(request, env, ctx);
  const db = database(env);
  const now = /* @__PURE__ */ new Date();
  const body = await readJsonBody(request);
  const report = validateReport(body, now);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRateLimit(db, hash, now);
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  const id = crypto.randomUUID();
  const approx = approximateCoordinate(report.lat, report.lon);
  const pendingPublic = isSensitiveReport(report) ? 0 : 1;
  try {
    await db.prepare(
      `INSERT INTO reports
           (id, status, species, lat, lon, observed_on, received_at,
            bird_count, reporter, note, ip_hash, dedupe_hash, name_public,
            approx_lat, approx_lon, pending_public, public_lat, public_lon)
         VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
    ).bind(
      id,
      report.speciesText,
      report.lat,
      report.lon,
      report.observedOn,
      now.toISOString(),
      report.birdCount,
      report.reporter,
      report.note,
      hash,
      await dedupeHash(report),
      report.namePublic,
      approx.lat,
      approx.lon,
      pendingPublic,
      // 위치 가리기: 승인 뒤에도 같은 대략 좌표를 쓰도록 공개 좌표로도 저장한다.
      report.hideLocation ? approx.lat : null,
      report.hideLocation ? approx.lon : null
    ).run();
  } catch (error) {
    rethrowIfFrozen(error);
    if (/UNIQUE|constraint/i.test(String(error?.message))) {
      throw new WorkerError(
        "DUPLICATE_REPORT",
        "\uAC19\uC740 \uC885\xB7\uC704\uCE58\xB7\uB0A0\uC9DC\uC758 \uC81C\uBCF4\uAC00 \uC774\uBBF8 \uC811\uC218\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.",
        409
      );
    }
    throw error;
  }
  const accepted = {
    ok: true,
    id,
    status: "pending",
    publicVisibility: pendingPublic ? "approximate" : "withheld"
  };
  if (pendingPublic) {
    accepted.spot = {
      id,
      status: "pending",
      lat: approx.lat,
      lon: approx.lon,
      approximate: true,
      species: report.species,
      date: report.observedOn
    };
    if (report.hideLocation) accepted.spot.locationHidden = true;
  }
  return reportReceipt(request, env, accepted, 201);
}
__name(handleSubmit, "handleSubmit");
async function handlePending(request, env) {
  const db = database(env);
  const { results } = await db.prepare(
    `SELECT id, species, observed_on, approx_lat, approx_lon,
              (approx_lat <> lat OR approx_lon <> lon) AS approx_offset,
              ${LOCATION_HIDDEN_SQL} AS location_hidden
         FROM reports
        WHERE status = 'pending' AND pending_public = 1
          AND approx_lat IS NOT NULL AND approx_lon IS NOT NULL
        ORDER BY observed_on DESC, received_at DESC`
  ).all();
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      spots: pendingPayload(results)
    },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handlePending, "handlePending");
async function handleSiteHistory(request, env, siteId, url) {
  const db = database(env);
  const limit = Math.min(
    SITE_HISTORY_MAX,
    Math.max(1, Number(url.searchParams.get("limit")) || SITE_HISTORY_DEFAULT)
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const { results } = await db.prepare(
    `SELECT id, species, observed_on, reporter, name_public,
              COUNT(*) OVER () AS total_count
         FROM reports
        WHERE status = 'approved' AND site_id = ?1
        ORDER BY observed_on DESC, received_at DESC, id DESC
        LIMIT ?2 OFFSET ?3`
  ).bind(siteId, limit, offset).all();
  const rows2 = results || [];
  let total = rows2.length ? Number(rows2[0].total_count) : 0;
  if (!rows2.length && offset > 0) {
    const counted = await db.prepare(
      `SELECT COUNT(*) AS n FROM reports WHERE status = 'approved' AND site_id = ?1`
    ).bind(siteId).first();
    total = Number(counted?.n || 0);
  }
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      siteId,
      total,
      limit,
      offset,
      history: rows2.map(historyEntry)
    },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleSiteHistory, "handleSiteHistory");
async function handleStatus2(request, env, id) {
  const db = database(env);
  const row = await db.prepare(
    `SELECT status, pending_public, received_at, decided_at
         FROM reports WHERE id = ?1`
  ).bind(id).first();
  if (!row) {
    throw new WorkerError("NOT_FOUND", "\uC811\uC218 \uBC88\uD638\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", 404);
  }
  const visibility = row.status === "approved" ? "approved" : row.status === "rejected" ? "not_published" : Number(row.pending_public) === 1 ? "approximate" : "withheld";
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      id,
      status: row.status,
      publicVisibility: visibility,
      receivedAt: row.received_at,
      decidedAt: row.decided_at
    },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleStatus2, "handleStatus");
async function handleApproved(request, env) {
  const db = database(env);
  const { results } = await db.prepare(
    // spot_key 가 있는 행은 다른 지점의 이력으로만 붙고 자기 점을 갖지 않는다.
    `SELECT id, species, lat, lon, public_lat, public_lon,
              observed_on, reporter, name_public, spot_key
         FROM reports WHERE status = 'approved'
        ORDER BY observed_on DESC, received_at DESC`
  ).all();
  return jsonResponse(
    request,
    env,
    { ok: true, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), ...publicPayload(results) },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleApproved, "handleApproved");
var RECENT_SITES_DEFAULT_DAYS = 14;
var RECENT_SITES_MAX_DAYS = 30;
async function handleRecentSites(request, env, url) {
  const db = database(env);
  const days = Math.min(
    RECENT_SITES_MAX_DAYS,
    Math.max(1, Math.floor(Number(url.searchParams.get("days")) || RECENT_SITES_DEFAULT_DAYS))
  );
  const now = /* @__PURE__ */ new Date();
  const today = kstDateString(now);
  const since = kstDateString(new Date(now.getTime() - days * 864e5));
  const { results } = await db.prepare(
    `SELECT site_id, species, observed_on, note
         FROM reports
        WHERE status = 'approved' AND site_id IS NOT NULL AND site_id <> ''
          AND observed_on >= ?1 AND observed_on <= ?2
          AND NOT ${LOCATION_HIDDEN_SQL}
        ORDER BY observed_on DESC, received_at DESC, id DESC`
  ).bind(since, today).all();
  const bySite = /* @__PURE__ */ new Map();
  for (const row of results || []) {
    const species = splitSpecies(row.species);
    if (isSensitiveReport({ note: row.note, speciesText: row.species, species })) continue;
    const siteId = String(row.site_id);
    if (!bySite.has(siteId)) bySite.set(siteId, { siteId, latestDate: row.observed_on, species: [] });
    const site = bySite.get(siteId);
    for (const name of species) if (!site.species.includes(name)) site.species.push(name);
  }
  return jsonResponse(
    request,
    env,
    { ok: true, days, since, today, sites: [...bySite.values()] },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleRecentSites, "handleRecentSites");
var MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
async function handleMonthlyContributors(request, env, url) {
  const raw = url.searchParams.get("month");
  const month = raw === null ? kstDateString(/* @__PURE__ */ new Date()).slice(0, 7) : raw;
  if (!MONTH_PATTERN.test(month)) {
    return jsonResponse(request, env, { error: "invalid_month" }, 400);
  }
  const [year, mon] = month.split("-").map(Number);
  const start = month + "-01";
  const end = (mon === 12 ? year + 1 + "-01" : year + "-" + String(mon + 1).padStart(2, "0")) + "-01";
  const db = database(env);
  const total = await db.prepare(
    "SELECT COUNT(*) AS n FROM reports WHERE status = 'approved' AND observed_on >= ?1 AND observed_on < ?2"
  ).bind(start, end).first();
  const { results } = await db.prepare(
    "SELECT reporter, COUNT(*) AS n FROM reports WHERE status = 'approved' AND name_public = 1 AND reporter IS NOT NULL AND TRIM(reporter) != '' AND observed_on >= ?1 AND observed_on < ?2 GROUP BY reporter ORDER BY n DESC, reporter ASC"
  ).bind(start, end).all();
  const contributors = (results || []).map((row) => ({ name: row.reporter, count: Number(row.n) }));
  return jsonResponse(
    request,
    env,
    {
      month,
      approvedReports: Number(total?.n || 0),
      publicContributors: contributors.length,
      contributors
    },
    200,
    { "Cache-Control": "no-store" }
  );
}
__name(handleMonthlyContributors, "handleMonthlyContributors");
async function handleLegacyRequest(request, env, ctx) {
  try {
    if (request.method === "GET" && new URL(request.url).pathname === "/_internal/reports-capability") return await internalCapability(request, env, "public");
    if (!allowedOrigin(request, env)) {
      throw new WorkerError(
        "ORIGIN_NOT_ALLOWED",
        "Origin is not allowed",
        403
      );
    }
    if (request.method === "OPTIONS") {
      return preflightResponse(request, env, "GET, POST, OPTIONS");
    }
    const url = new URL(request.url);
    const publicationResponse = await handlePublicationRead(request, env, url);
    if (publicationResponse) return publicationResponse;
    if (request.method === "GET" && url.pathname === "/reports/capabilities") return publicCapability(request, env);
    if (request.method === "GET" && url.pathname === "/reports/approved") {
      return await handleApproved(request, env);
    }
    if (request.method === "GET" && url.pathname === "/reports/pending") {
      return await handlePending(request, env);
    }
    if (request.method === "GET" && url.pathname === "/reports/recent-sites") {
      return await handleRecentSites(request, env, url);
    }
    if (request.method === "POST" && /^\/field-updates(?:\/[0-9a-f-]{36}\/(?:status|confirm|delete))?$/.test(url.pathname)) {
      await assertWriteGate(env, "public");
      if (env.REPORTS_PUBLICATION_REQUIRED === "true") {
        let state;
        try {
          state = await database(env).prepare("SELECT write_frozen FROM public_publication_state WHERE id=1").first();
        } catch {
        }
        if (!state || state.write_frozen !== 0) throw new WorkerError("WRITE_MAINTENANCE", "\uD604\uC7A5\uC18C\uC2DD \uC4F0\uAE30\uB97C \uC7A0\uC2DC \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4.", 503);
      }
    }
    const fieldResponse2 = await handleFieldUpdates(request, env, url, { database, readJsonBody });
    if (fieldResponse2) return fieldResponse2;
    if (request.method === "GET" && url.pathname === "/contributors/monthly") {
      return await handleMonthlyContributors(request, env, url);
    }
    if (url.pathname.startsWith(SITE_HISTORY_PATH)) {
      const siteId = decodeURIComponent(url.pathname.slice(SITE_HISTORY_PATH.length));
      if (!SITE_ID.test(siteId)) {
        throw new WorkerError("SITE_ID_INVALID", "\uD0D0\uC870\uC9C0 ID \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4.", 400);
      }
      if (request.method !== "GET") {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }
          },
          405,
          { Allow: "GET, OPTIONS" }
        );
      }
      return await handleSiteHistory(request, env, siteId, url);
    }
    const status = /^\/reports\/([0-9a-f-]{36})\/status$/.exec(url.pathname);
    if (status) {
      if (request.method !== "GET") {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }
          },
          405,
          { Allow: "GET, OPTIONS" }
        );
      }
      return await handleStatus2(request, env, status[1]);
    }
    if (request.method === "POST" && url.pathname === "/reports") {
      return await handleSubmit(request, env, await assertWriteGate(env, "public"), ctx);
    }
    if (url.pathname !== "/reports" && url.pathname !== "/reports/approved" && url.pathname !== "/reports/pending" && url.pathname !== "/reports/recent-sites" && url.pathname !== "/contributors/monthly") {
      throw new WorkerError("NOT_FOUND", "Unknown endpoint", 404);
    }
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }
      },
      405,
      { Allow: "GET, POST, OPTIONS" }
    );
  } catch (error) {
    return errorResponse(request, env, error);
  }
}
__name(handleLegacyRequest, "handleLegacyRequest");
async function handleRequest(request, env, ctx) {
  const response = await handleLegacyRequest(request, env, ctx);
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && env.REPORTS_SHADOW_READ === "true" && (/^\/reports\/(approved|pending)$/.test(path) || path.startsWith("/reports/site/") || /^\/reports\/[0-9a-f-]{36}\/status$/.test(path))) {
    const job = shadowRead(request.clone(), env, response.clone(), handleLegacyRequest);
    if (ctx?.waitUntil) ctx.waitUntil(job);
    else await job;
  }
  return response;
}
__name(handleRequest, "handleRequest");
var public_default = { fetch: handleRequest };
export {
  public_default as default,
  handleLegacyRequest,
  handleRequest
};
//# sourceMappingURL=public.js.map
