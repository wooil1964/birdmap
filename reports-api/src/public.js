// 공개 제보 접수 Worker.
// - POST /reports              로그인 없이 누구나 제보한다. 항상 status='pending' 으로만 들어간다.
// - GET  /reports/approved     승인된 제보의 종과 공개 좌표만 내보낸다(붉은 점).
// - GET  /reports/pending      공개가 허용된 승인 대기 제보의 종과 대략 좌표만 내보낸다(황색 마커).
// - GET  /reports/site/<id>    그 탐조지에 연결된 승인 제보의 출현 이력만 내보낸다(좌표 없음).
// - GET  /reports/<id>/status  제보자가 자기 접수 상태만 확인한다(종·좌표는 돌려주지 않는다).
// 승인·수정·반려 기능은 이 Worker 에 없다. 관리자 API 는 별도 Worker(admin.js)에 있다.

import {
  WorkerError,
  approximateCoordinate,
  historyEntry,
  isSensitiveReport,
  pendingPayload,
  RATE_DAY_MAX,
  RATE_WINDOW_MAX,
  RATE_WINDOW_MINUTES,
  dedupeHash,
  errorResponse,
  allowedOrigin,
  ipHash,
  jsonResponse,
  preflightResponse,
  publicPayload,
  validateReport,
  verifyTurnstile,
} from "./shared.js";

const MAX_BODY_BYTES = 4096;
// 탐조지별 출현 이력을 한 번에 가져올 건수. 화면은 5건부터 보여 준다.
const SITE_HISTORY_DEFAULT = 5;
const SITE_HISTORY_MAX = 50;
const SITE_HISTORY_PATH = "/reports/site/";
// siteData 의 탐조지 id 형식.
const SITE_ID = /^[0-9A-Za-z_-]{1,16}$/;

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
  // 승인 전 지도에 올릴 대략 좌표. 실제 좌표는 관리자만 본다.
  const approx = approximateCoordinate(report.lat, report.lon);
  // 둥지·번식지와 보호종은 관리자가 확인할 때까지 지도에 올리지 않는다.
  const pendingPublic = isSensitiveReport(report) ? 0 : 1;
  try {
    await db
      .prepare(
        `INSERT INTO reports
           (id, status, species, lat, lon, observed_on, received_at,
            bird_count, reporter, note, ip_hash, dedupe_hash, name_public,
            approx_lat, approx_lon, pending_public)
         VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
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
        report.namePublic,
        approx.lat,
        approx.lon,
        pendingPublic,
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

  // 공개가 허용된 건만 지도에 바로 올릴 값을 함께 돌려준다.
  // 보류된 건은 좌표를 돌려주지 않으므로 화면에서도 황색 마커를 만들 수 없다.
  const accepted = {
    ok: true,
    id,
    status: "pending",
    publicVisibility: pendingPublic ? "approximate" : "withheld",
  };
  if (pendingPublic) {
    accepted.spot = {
      id,
      status: "pending",
      lat: approx.lat,
      lon: approx.lon,
      approximate: true,
      species: report.species,
      date: report.observedOn,
    };
  }
  return jsonResponse(request, env, accepted, 201);
}

// 승인 대기 제보 중 공개가 허용된 건만 내보낸다.
// 승인된 제보는 여기에 절대 섞이지 않는다(상태 구분은 서버에서만 한다).
async function handlePending(request, env) {
  const db = database(env);
  const { results } = await db
    .prepare(
      `SELECT id, species, observed_on, approx_lat, approx_lon
         FROM reports
        WHERE status = 'pending' AND pending_public = 1
          AND approx_lat IS NOT NULL AND approx_lon IS NOT NULL
        ORDER BY observed_on DESC, received_at DESC`,
    )
    .all();
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      spots: pendingPayload(results),
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}

// 탐조지(siteData.id)에 연결된 승인 제보의 출현 이력.
// 관리자가 site_id 를 지정한 제보만 나온다. 좌표는 한 건도 내보내지 않으므로
// 민감종의 지점이 지역별 이력을 통해 간접 노출되지 않는다.
// 전체를 한 번에 주지 않고 limit/offset 으로 필요한 범위만 준다.
async function handleSiteHistory(request, env, siteId, url) {
  const db = database(env);
  const limit = Math.min(
    SITE_HISTORY_MAX,
    Math.max(1, Number(url.searchParams.get("limit")) || SITE_HISTORY_DEFAULT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM reports WHERE status = 'approved' AND site_id = ?1`,
    )
    .bind(siteId)
    .first();
  const { results } = await db
    .prepare(
      // 같은 관찰일이면 접수 시각과 id 로 순서를 고정한다(페이지가 밀리지 않는다).
      `SELECT id, species, observed_on, reporter, name_public
         FROM reports
        WHERE status = 'approved' AND site_id = ?1
        ORDER BY observed_on DESC, received_at DESC, id DESC
        LIMIT ?2 OFFSET ?3`,
    )
    .bind(siteId, limit, offset)
    .all();
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      siteId,
      total: Number(total?.n || 0),
      limit,
      offset,
      history: (results || []).map(historyEntry),
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}

// 제보자가 접수 번호로 자기 제보의 처리 상태만 확인한다.
// 종·좌표·제보자·메모는 돌려주지 않는다.
async function handleStatus(request, env, id) {
  const db = database(env);
  const row = await db
    .prepare(
      `SELECT status, pending_public, received_at, decided_at
         FROM reports WHERE id = ?1`,
    )
    .bind(id)
    .first();
  if (!row) {
    throw new WorkerError("NOT_FOUND", "접수 번호를 찾을 수 없습니다.", 404);
  }
  const visibility =
    row.status === "approved"
      ? "approved"
      : row.status === "rejected"
        ? "not_published"
        : Number(row.pending_public) === 1
          ? "approximate"
          : "withheld";
  return jsonResponse(
    request,
    env,
    {
      ok: true,
      id,
      status: row.status,
      publicVisibility: visibility,
      receivedAt: row.received_at,
      decidedAt: row.decided_at,
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function handleApproved(request, env) {
  const db = database(env);
  const { results } = await db
    .prepare(
      // spot_key 가 있는 행은 다른 지점의 이력으로만 붙고 자기 점을 갖지 않는다.
      `SELECT id, species, lat, lon, public_lat, public_lon,
              observed_on, reporter, name_public, spot_key
         FROM reports WHERE status = 'approved'
        ORDER BY observed_on DESC, received_at DESC`,
    )
    .all();
  return jsonResponse(
    request,
    env,
    { ok: true, generatedAt: new Date().toISOString(), ...publicPayload(results) },
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
    if (request.method === "GET" && url.pathname === "/reports/pending") {
      return await handlePending(request, env);
    }
    if (url.pathname.startsWith(SITE_HISTORY_PATH)) {
      const siteId = decodeURIComponent(url.pathname.slice(SITE_HISTORY_PATH.length));
      if (!SITE_ID.test(siteId)) {
        throw new WorkerError("SITE_ID_INVALID", "탐조지 ID 형식이 아닙니다.", 400);
      }
      if (request.method !== "GET") {
        return jsonResponse(
          request,
          env,
          {
            ok: false,
            error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          },
          405,
          { Allow: "GET, OPTIONS" },
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
            error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          },
          405,
          { Allow: "GET, OPTIONS" },
        );
      }
      return await handleStatus(request, env, status[1]);
    }
    if (request.method === "POST" && url.pathname === "/reports") {
      return await handleSubmit(request, env);
    }
    if (
      url.pathname !== "/reports" &&
      url.pathname !== "/reports/approved" &&
      url.pathname !== "/reports/pending"
    ) {
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
