// 공개 접수 Worker 와 관리자 Worker 가 함께 쓰는 검증·응답·인증 헬퍼.
// 기존 weather-proxy Worker 의 응답 형식(ok/error 봉투, Origin 허용 목록)을 그대로 따른다.

export const PRODUCTION_ORIGIN = "https://wooil1964.github.io";

// 제보 좌표 허용 범위(한반도와 부속 도서). 범위 밖 좌표는 오작동이거나 장난이다.
export const LAT_MIN = 33.0;
export const LAT_MAX = 39.0;
export const LON_MIN = 124.0;
export const LON_MAX = 132.0;

export const MAX_SPECIES = 10;
export const MAX_SPECIES_LENGTH = 30;
export const MAX_REPORTER_LENGTH = 40;
export const MAX_NOTE_LENGTH = 500;
export const MAX_BIRD_COUNT = 100000;
export const MAX_OBSERVED_AGE_DAYS = 730;

// 서버 측 제출 횟수 제한. 완전한 차단이 아니라 관리자가 검토할 양을 줄이는 장치다.
export const RATE_WINDOW_MINUTES = 10;
export const RATE_WINDOW_MAX = 5;
export const RATE_DAY_MAX = 20;

export class WorkerError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.status = status;
  }
}

/* ── 응답 ───────────────────────────────────────────────────────────── */

export function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (
    env?.ENVIRONMENT !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  return false;
}

export function responseHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonResponse(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(request, env), ...extra },
  });
}

export function errorResponse(request, env, error) {
  const known = error instanceof WorkerError;
  return jsonResponse(
    request,
    env,
    {
      ok: false,
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "Unexpected error",
      },
    },
    known ? error.status : 500,
  );
}

export function preflightResponse(request, env, methods) {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseHeaders(request, env),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/* ── 시각 ───────────────────────────────────────────────────────────── */

export function kstDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/* ── 입력 검증 ──────────────────────────────────────────────────────── */

// 제어문자를 지운다. 줄바꿈은 note 에서만 살린다.
function stripControl(text, keepNewline = false) {
  let out = "";
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    // C0 제어문자와 DEL 을 지운다. note 에서만 줄바꿈을 살린다.
    if (code < 32 || code === 127) {
      if (keepNewline && code === 10) out += character;
      continue;
    }
    out += character;
  }
  return out.trim();
}

const SPECIES_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9()'. -]+$/;
// 꺾쇠는 출력 단계에서 이스케이프하지만, 입력 단계에서도 함께 막는다(다중 방어).
const MARKUP_PATTERN = /[<>]/;

export function normalizeSpecies(raw) {
  const tokens = stripControl(raw)
    .split(/[,;·\n]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    throw new WorkerError("SPECIES_REQUIRED", "출현종을 입력해 주세요.", 400);
  }
  if (tokens.length > MAX_SPECIES) {
    throw new WorkerError(
      "SPECIES_TOO_MANY",
      `출현종은 한 번에 ${MAX_SPECIES}종까지 입력할 수 있습니다.`,
      400,
    );
  }
  const seen = [];
  for (const token of tokens) {
    if (token.length > MAX_SPECIES_LENGTH || !SPECIES_PATTERN.test(token)) {
      throw new WorkerError(
        "SPECIES_INVALID",
        `종명으로 쓸 수 없는 값입니다: ${token.slice(0, MAX_SPECIES_LENGTH)}`,
        400,
      );
    }
    if (!seen.includes(token)) seen.push(token);
  }
  return seen;
}

function optionalText(raw, max, field, keepNewline) {
  if (raw === undefined || raw === null || raw === "") return null;
  const text = stripControl(raw, keepNewline);
  if (!text) return null;
  if (text.length > max) {
    throw new WorkerError(
      "TEXT_TOO_LONG",
      `${field}은(는) ${max}자까지 입력할 수 있습니다.`,
      400,
    );
  }
  if (MARKUP_PATTERN.test(text)) {
    throw new WorkerError(
      "TEXT_INVALID",
      `${field}에 < 또는 > 는 쓸 수 없습니다.`,
      400,
    );
  }
  return text;
}

export function normalizeCoordinate(rawLat, rawLon) {
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new WorkerError(
      "COORDINATE_REQUIRED",
      "지도에서 위치를 선택해 주세요.",
      400,
    );
  }
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
    throw new WorkerError(
      "COORDINATE_OUT_OF_RANGE",
      "국내 탐조 범위 밖의 좌표입니다.",
      400,
    );
  }
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

export function normalizeObservedOn(raw, now = new Date()) {
  const text = stripControl(raw ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new WorkerError(
      "OBSERVED_ON_REQUIRED",
      "관찰 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.",
      400,
    );
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || kstDateString(parsed) !== text) {
    throw new WorkerError("OBSERVED_ON_INVALID", "없는 날짜입니다.", 400);
  }
  const today = kstDateString(now);
  if (text > today) {
    throw new WorkerError(
      "OBSERVED_ON_FUTURE",
      "관찰 날짜는 오늘보다 뒤일 수 없습니다.",
      400,
    );
  }
  const oldest = new Date(parsed.getTime());
  oldest.setUTCDate(oldest.getUTCDate() + MAX_OBSERVED_AGE_DAYS);
  if (kstDateString(oldest) < today) {
    throw new WorkerError(
      "OBSERVED_ON_TOO_OLD",
      `관찰 날짜는 최근 ${MAX_OBSERVED_AGE_DAYS}일 이내여야 합니다.`,
      400,
    );
  }
  return text;
}

function normalizeBirdCount(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_BIRD_COUNT) {
    throw new WorkerError(
      "COUNT_INVALID",
      `관찰 개체수는 1 이상 ${MAX_BIRD_COUNT} 이하의 정수여야 합니다.`,
      400,
    );
  }
  return value;
}

// 제보 본문을 저장 가능한 형태로 바꾼다. 하나라도 어긋나면 WorkerError 를 던진다.
export function validateReport(input, now = new Date()) {
  if (!input || typeof input !== "object") {
    throw new WorkerError("BODY_INVALID", "제보 내용을 읽을 수 없습니다.", 400);
  }
  const species = normalizeSpecies(input.species);
  const { lat, lon } = normalizeCoordinate(input.lat, input.lon);
  return {
    species,
    speciesText: species.join(" · "),
    lat,
    lon,
    observedOn: normalizeObservedOn(input.observedOn, now),
    birdCount: normalizeBirdCount(input.birdCount),
    reporter: optionalText(input.reporter, MAX_REPORTER_LENGTH, "제보자 이름", false),
    note: optionalText(input.note, MAX_NOTE_LENGTH, "참고 설명", true),
    // 이름 공개는 명시적으로 동의한 경우에만 1 이다. 값이 없으면 비공개로 본다.
    namePublic: input.namePublic === true || input.namePublic === 1 ? 1 : 0,
  };
}

/* ── 승인 전 공개(황색 마커) ────────────────────────────────────────── */

// 승인 전 제보는 실제 좌표를 절대 내보내지 않는다. 접수 때 실제 지점에서
// 1.5~4.5km 떨어진 점을 한 번 만들어 저장하고, 공개 API 는 그 점만 쓴다.
// 반올림(소수점 자르기)은 쓰지 않는다. 격자 위에 놓여 원래 지점이 좁혀지기 때문이다.
// 매 요청마다 다시 계산하지 않는 이유도 같다. 여러 번 받아 평균 내면 실제 지점이 드러난다.
export const APPROX_MIN_METERS = 1500;
export const APPROX_MAX_METERS = 4500;

function randomUnitPair() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return [values[0] / 2 ** 32, values[1] / 2 ** 32];
}

export function approximateCoordinate(lat, lon, randomPair) {
  const [angleSeed, radiusSeed] = randomPair || randomUnitPair();
  const bearing = angleSeed * 2 * Math.PI;
  // 면적 기준으로 고르게 퍼뜨린다. 거리만 균등하게 뽑으면 안쪽에 몰린다.
  const near = APPROX_MIN_METERS ** 2;
  const far = APPROX_MAX_METERS ** 2;
  const distance = Math.sqrt(near + radiusSeed * (far - near));
  const metersPerLat = 111320;
  const metersPerLon = Math.max(1, metersPerLat * Math.cos((lat * Math.PI) / 180));
  const movedLat = lat + (distance * Math.cos(bearing)) / metersPerLat;
  const movedLon = lon + (distance * Math.sin(bearing)) / metersPerLon;
  // 국내 범위를 벗어나면 지도 밖에 찍히므로 경계로 되돌린다.
  return {
    lat: Number(Math.min(LAT_MAX, Math.max(LAT_MIN, movedLat)).toFixed(5)),
    lon: Number(Math.min(LON_MAX, Math.max(LON_MIN, movedLon)).toFixed(5)),
  };
}

// 둥지·번식지와 보호종은 승인 전 공개를 보류한다. 관리자가 확인한 뒤에만 지도에 올린다.
// ponytail: 종명·낱말 목록으로만 판정한다. 규칙이 복잡해지면 관리자 설정값으로 옮긴다.
export const SENSITIVE_KEYWORDS = ['둥지', '번식', '포란', '육추', '새끼', '영소'];
export const SENSITIVE_SPECIES = [
  '저어새', '노랑부리저어새', '노랑부리백로', '황새', '먹황새', '따오기',
  '두루미', '재두루미', '흑두루미', '검독수리', '참수리', '흰꼬리수리',
  '매', '참매', '수리부엉이', '올빼미', '팔색조', '뿔쇠오리', '넓적부리도요',
];

export function isSensitiveReport(report) {
  const haystack = [report?.note || '', report?.speciesText || ''].join(' ');
  if (SENSITIVE_KEYWORDS.some((word) => haystack.includes(word))) return true;
  return (report?.species || []).some((name) => SENSITIVE_SPECIES.includes(name));
}

// 승인 전 공개 목록. 종·관찰일·대략 좌표만 내보낸다.
// 제보자·개체수·설명·실제 좌표·관리자 메모는 어떤 경우에도 넣지 않는다.
export function pendingPayload(rows) {
  return (rows || [])
    .filter((row) => Number.isFinite(row.approx_lat) && Number.isFinite(row.approx_lon))
    .map((row) => ({
      id: row.id,
      status: 'pending',
      lat: row.approx_lat,
      lon: row.approx_lon,
      approximate: true,
      species: splitSpecies(row.species),
      date: row.observed_on,
    }));
}

/* ── 해시 ───────────────────────────────────────────────────────────── */

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 원본 IP 는 저장하지 않는다. 솔트가 없으면 제한 자체를 포기하지 않고 요청을 거부한다.
export function ipHash(ip, salt) {
  if (!salt) {
    throw new WorkerError(
      "NOT_CONFIGURED_SALT",
      "제보 접수가 아직 설정되지 않았습니다.",
      503,
    );
  }
  return sha256Hex(`${salt}:${ip || "unknown"}`);
}

// 같은 종·좌표(소수 4자리)·관찰일이면 같은 제보로 본다.
export function dedupeHash(report) {
  const key = [
    report.species.slice().sort().join("|"),
    report.lat.toFixed(4),
    report.lon.toFixed(4),
    report.observedOn,
  ].join(":");
  return sha256Hex(key);
}

/* ── 자동 등록 방지 (Turnstile) ─────────────────────────────────────── */

export async function verifyTurnstile(token, ip, secret, fetchImpl = fetch) {
  if (!secret) {
    throw new WorkerError(
      "NOT_CONFIGURED_CAPTCHA",
      "제보 접수가 아직 설정되지 않았습니다.",
      503,
    );
  }
  if (!token || typeof token !== "string") {
    throw new WorkerError(
      "CAPTCHA_REQUIRED",
      "자동 등록 방지 확인을 완료해 주세요.",
      400,
    );
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  let payload;
  try {
    const response = await fetchImpl(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    payload = await response.json();
  } catch {
    throw new WorkerError(
      "CAPTCHA_UNAVAILABLE",
      "자동 등록 방지 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  if (!payload?.success) {
    // 클라이언트 응답에는 넣지 않는다. 설정 진단은 `wrangler tail` 로만 본다.
    console.log(
      "turnstile_failed " +
        JSON.stringify({
          codes: payload?.["error-codes"] ?? [],
          hostname: payload?.hostname ?? null,
        }),
    );
    throw new WorkerError(
      "CAPTCHA_FAILED",
      "자동 등록 방지 확인에 실패했습니다.",
      403,
    );
  }
  return true;
}

/* ── 관리자 인증 (Cloudflare Access JWT) ────────────────────────────── */

function base64UrlToBytes(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(text)));
}

const FORBIDDEN = new WorkerError(
  "ADMIN_FORBIDDEN",
  "관리자 권한이 필요합니다.",
  403,
);

// Access 가 붙인 JWT 를 Worker 안에서 다시 검증한다.
// 설정값이 하나라도 비어 있으면 통과시키지 않고 503 으로 닫는다(열림 기본값 금지).
export async function verifyAccessJwt(token, options) {
  const { teamDomain, aud, adminEmails, fetchImpl = fetch, now = Date.now() } =
    options || {};
  if (!teamDomain || !aud || !adminEmails?.length) {
    throw new WorkerError(
      "NOT_CONFIGURED",
      "관리자 인증이 아직 설정되지 않았습니다.",
      503,
    );
  }
  if (!token || typeof token !== "string") throw FORBIDDEN;

  const parts = token.split(".");
  if (parts.length !== 3) throw FORBIDDEN;

  let header;
  let payload;
  try {
    header = base64UrlToJson(parts[0]);
    payload = base64UrlToJson(parts[1]);
  } catch {
    throw FORBIDDEN;
  }
  if (header?.alg !== "RS256" || !header?.kid) throw FORBIDDEN;

  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload?.iss !== issuer) throw FORBIDDEN;

  const audience = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!audience.includes(aud)) throw FORBIDDEN;

  const seconds = Math.floor(now / 1000);
  if (!payload?.exp || payload.exp <= seconds) throw FORBIDDEN;
  if (payload?.nbf && payload.nbf > seconds + 60) throw FORBIDDEN;

  let jwks;
  try {
    const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`);
    jwks = await response.json();
  } catch {
    throw new WorkerError(
      "ADMIN_AUTH_UNAVAILABLE",
      "관리자 인증 서버에 연결할 수 없습니다.",
      503,
    );
  }
  const jwk = (jwks?.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw FORBIDDEN;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw FORBIDDEN;

  const email = String(payload?.email || "").toLowerCase();
  if (!email || !adminEmails.includes(email)) throw FORBIDDEN;
  return { email };
}

export function parseAdminEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/* ── 공개 출력 ──────────────────────────────────────────────────────── */

// 공개 지도에 내보내는 값은 종과 좌표뿐이다.
// 제보자·관찰일·개체수·설명·관리자 메모는 API 응답에 넣지 않는다.
export function splitSpecies(text) {
  return String(text || "")
    .split(" · ")
    .filter(Boolean);
}

// 이력 한 줄. 이름은 공개에 동의했고 실제로 입력된 경우에만 넣는다.
// 동의하지 않았거나 이름이 없으면 필드 자체를 만들지 않아 화면에서 '익명 제보'가 된다.
function historyEntry(row) {
  const entry = {
    id: row.id,
    date: row.observed_on,
    species: splitSpecies(row.species),
  };
  if (Number(row.name_public) === 1 && row.reporter) entry.reporter = row.reporter;
  return entry;
}

function newestFirst(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

// 승인된 행들로 공개 지도가 쓸 값을 만든다.
// spot_key 가 없는 제보는 자기 점을 갖고, 있는 제보는 그 지점의 이력으로만 붙는다.
// 원본 행을 고쳐 쓰지 않으므로 개별 이력 조회와 공개 취소가 그대로 가능하다.
export function publicPayload(rows) {
  const all = rows || [];
  const byKey = new Map();
  for (const row of all) {
    if (!row.spot_key) continue;
    if (!byKey.has(row.spot_key)) byKey.set(row.spot_key, []);
    byKey.get(row.spot_key).push(row);
  }

  const spots = all
    .filter((row) => !row.spot_key)
    .map((row) => {
      const attached = byKey.get(row.id) || [];
      // 연결된 제보의 종을 뒤에 더한다. 기존 종은 지우지 않는다.
      const species = splitSpecies(row.species);
      for (const extra of attached) {
        for (const name of splitSpecies(extra.species)) {
          if (!species.includes(name)) species.push(name);
        }
      }
      return {
        id: row.id,
        lat: row.public_lat ?? row.lat,
        lon: row.public_lon ?? row.lon,
        species,
        history: [row, ...attached].map(historyEntry).sort(newestFirst),
      };
    });

  // index.html 에 손으로 등록된 붉은 점에 붙는 이력. 그 점의 좌표·출현종은 건드리지 않는다.
  const fixedSpots = {};
  for (const [key, list] of byKey) {
    if (!key.startsWith("fixed:")) continue;
    fixedSpots[key] = { history: list.map(historyEntry).sort(newestFirst) };
  }

  return { spots, fixedSpots };
}
