// 공개 제보 접수 Worker.
// - POST /reports          로그인 없이 누구나 제보한다. 항상 status='pending' 으로만 들어간다.
// - GET  /reports/approved 승인된 제보의 종과 공개 좌표만 내보낸다.
// 승인·수정·반려 기능은 이 Worker 에 없다. 관리자 API 는 별도 Worker(admin.js)에 있다.

import {
  WorkerError,
  RATE_DAY_MAX,
  RATE_WINDOW_MAX,
  RATE_WINDOW_MINUTES,
  dedupeHash,
  errorResponse,
  allowedOrigin,
  ipHash,
  jsonResponse,
  preflightResponse,
  publicSpots,
  validateReport,
  verifyTurnstile,
} from "./shared.js";

const MAX_BODY_BYTES = 4096;

function database(env) {
  if (!env?.REPORTS_DB) {
    throw new WorkerError(
      "NOT_CONFIGURED",
      "제보 접수가 아직 설정되지 않았습니다.",
      503,
    );
  }
  return env.REPORTS_DB;
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new WorkerError("BODY_TOO_LARGE", "제보 내용이 너무 깁니다.", 413);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new WorkerError("BODY_INVALID", "제보 내용을 읽을 수 없습니다.", 400);
  }
}

// 같은 IP 해시의 최근 접수 건수로 제출 횟수를 제한한다.
async function enforceRateLimit(db, hash, now) {
  const windowStart = new Date(
    now.getTime() - RATE_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN received_at >= ?2 THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN received_at >= ?3 THEN 1 ELSE 0 END) AS daily
       FROM reports WHERE ip_hash = ?1 AND received_at >= ?3`,
    )
    .bind(hash, windowStart, dayStart)
    .all();
  const recent = Number(results?.[0]?.recent || 0);
  const daily = Number(results?.[0]?.daily || 0);
  if (recent >= RATE_WINDOW_MAX || daily >= RATE_DAY_MAX) {
    throw new WorkerError(
      "RATE_LIMITED",
      "제보가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
  }
}

async function handleSubmit(request, env) {
  const db = database(env);
  const now = new Date();
  const body = await readJsonBody(request);
  const report = validateReport(body, now);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRateLimit(db, hash, now);

  // 사람이 보낸 요청인지 먼저 확인한 뒤에만 저장한다.
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);

  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO reports
           (id, status, species, lat, lon, observed_on, received_at,
            bird_count, reporter, note, ip_hash, dedupe_hash)
         VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
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
      )
      .run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message))) {
      throw new WorkerError(
        "DUPLICATE_REPORT",
        "같은 종·위치·날짜의 제보가 이미 접수되어 있습니다.",
        409,
      );
    }
    throw error;
  }

  // 접수만 알린다. 승인 전에는 어떤 경로로도 공개되지 않는다.
  return jsonResponse(request, env, { ok: true, id, status: "pending" }, 201);
}

async function handleApproved(request, env) {
  const db = database(env);
  const { results } = await db
    .prepare(
      // merged_into 가 있는 행은 다른 지점에 종을 합친 기록이므로 점을 따로 찍지 않는다.
      `SELECT id, species, lat, lon, public_lat, public_lon
         FROM reports WHERE status = 'approved' AND merged_into IS NULL
        ORDER BY received_at`,
    )
    .all();
  return jsonResponse(
    request,
    env,
    { ok: true, generatedAt: new Date().toISOString(), spots: publicSpots(results) },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}

export async function handleRequest(request, env) {
  try {
    if (!allowedOrigin(request, env)) {
      throw new WorkerError(
        "ORIGIN_NOT_ALLOWED",
        "Origin is not allowed",
        403,
      );
    }
    if (request.method === "OPTIONS") {
      return preflightResponse(request, env, "GET, POST, OPTIONS");
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/reports/approved") {
      return await handleApproved(request, env);
    }
    if (request.method === "POST" && url.pathname === "/reports") {
      return await handleSubmit(request, env);
    }
    if (url.pathname !== "/reports" && url.pathname !== "/reports/approved") {
      throw new WorkerError("NOT_FOUND", "Unknown endpoint", 404);
    }
    return jsonResponse(
      request,
      env,
      {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
      },
      405,
      { Allow: "GET, POST, OPTIONS" },
    );
  } catch (error) {
    return errorResponse(request, env, error);
  }
}

export default { fetch: handleRequest };
