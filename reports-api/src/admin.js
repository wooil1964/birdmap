// 관리자 승인 Worker. 이 Worker 의 workers.dev 주소에는 Cloudflare Access 를 건다.
// Access 가 앞에서 로그인을 강제하고, 여기서 Access JWT 를 한 번 더 검증한다.
// 설정값(ACCESS_TEAM_DOMAIN / ACCESS_AUD / ADMIN_EMAILS)이 비어 있으면 503 으로 닫는다.

import {
  WorkerError,
  errorResponse,
  jsonResponse,
  normalizeCoordinate,
  normalizeSpecies,
  parseAdminEmails,
  verifyAccessJwt,
} from "./shared.js";
import { ADMIN_PAGE } from "./admin-page.js";

const ACTIONS = ["approve", "reject", "unpublish", "merge"];

function database(env) {
  if (!env?.REPORTS_DB) {
    throw new WorkerError("NOT_CONFIGURED", "저장소가 연결되지 않았습니다.", 503);
  }
  return env.REPORTS_DB;
}

function accessToken(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") || "";
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return match ? match[1] : "";
}

async function requireAdmin(request, env) {
  return verifyAccessJwt(accessToken(request), {
    teamDomain: env?.ACCESS_TEAM_DOMAIN,
    aud: env?.ACCESS_AUD,
    adminEmails: parseAdminEmails(env?.ADMIN_EMAILS),
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new WorkerError("BODY_INVALID", "요청 내용을 읽을 수 없습니다.", 400);
  }
}

async function listReports(request, env, url) {
  const db = database(env);
  const status = url.searchParams.get("status") || "pending";
  const statement =
    status === "all"
      ? db.prepare(
          `SELECT * FROM reports ORDER BY
             CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
             received_at DESC`,
        )
      : db
          .prepare(
            `SELECT * FROM reports WHERE status = ?1 ORDER BY received_at DESC`,
          )
          .bind(status);
  const { results } = await statement.all();
  return jsonResponse(request, env, { ok: true, reports: results || [] });
}

async function loadReport(db, id) {
  const row = await db
    .prepare(`SELECT * FROM reports WHERE id = ?1`)
    .bind(id)
    .first();
  if (!row) throw new WorkerError("NOT_FOUND", "제보를 찾을 수 없습니다.", 404);
  return row;
}

// 승인 전에 관리자가 종명·좌표를 고칠 수 있다. 값을 보내지 않으면 원래 값을 유지한다.
function editedFields(body, row) {
  const species = body.species === undefined
    ? String(row.species)
    : normalizeSpecies(body.species).join(" · ");
  const coordinate = body.lat === undefined && body.lon === undefined
    ? { lat: row.lat, lon: row.lon }
    : normalizeCoordinate(body.lat, body.lon);
  // 공개 좌표를 따로 두면 민감지의 실제 지점을 가릴 수 있다. null 이면 실제 좌표를 그대로 공개한다.
  const usePublic = body.publicLat !== undefined || body.publicLon !== undefined;
  const publicCoordinate = usePublic
    ? body.publicLat === null || body.publicLat === ""
      ? { lat: null, lon: null }
      : normalizeCoordinate(body.publicLat, body.publicLon)
    : { lat: row.public_lat, lon: row.public_lon };
  return { species, coordinate, publicCoordinate };
}

async function applyAction(request, env, id, admin) {
  const db = database(env);
  const body = await readJson(request);
  const action = String(body?.action || "");
  if (!ACTIONS.includes(action)) {
    throw new WorkerError("ACTION_INVALID", "알 수 없는 처리입니다.", 400);
  }
  const row = await loadReport(db, id);
  const now = new Date().toISOString();
  const adminNote = body.adminNote === undefined ? row.admin_note : String(body.adminNote || "").slice(0, 1000);

  if (action === "reject") {
    await db
      .prepare(
        `UPDATE reports SET status='rejected', decided_at=?2, admin_note=?3 WHERE id=?1`,
      )
      .bind(id, now, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, status: "rejected" });
  }

  if (action === "unpublish") {
    // 공개만 거둔다. 대기 상태로 되돌려 다시 승인할 수 있게 둔다.
    // 기존 탐조지와 그 출현종은 별도 데이터라 여기서 건드리지 않는다.
    await db
      .prepare(
        `UPDATE reports SET status='pending', decided_at=?2, admin_note=?3 WHERE id=?1`,
      )
      .bind(id, now, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, status: "pending" });
  }

  if (action === "merge") {
    // 좌표가 가깝다는 이유로 자동 병합하지 않는다. 관리자가 지정한 지점에만 합친다.
    const targetId = String(body.targetId || "");
    if (!targetId || targetId === id) {
      throw new WorkerError("TARGET_INVALID", "합칠 지점을 선택해 주세요.", 400);
    }
    const target = await loadReport(db, targetId);
    const existing = String(target.species || "").split(" · ").filter(Boolean);
    const incoming = String(row.species || "").split(" · ").filter(Boolean);
    // 기존 출현종은 지우지 않고 없는 종만 뒤에 덧붙인다.
    const merged = existing.concat(
      incoming.filter((name) => !existing.includes(name)),
    );
    await db.batch([
      db
        .prepare(`UPDATE reports SET species=?2, decided_at=?3 WHERE id=?1`)
        .bind(targetId, merged.join(" · "), now),
      db
        .prepare(
          `UPDATE reports SET status='approved', merged_into=?2, decided_at=?3, admin_note=?4 WHERE id=?1`,
        )
        .bind(id, targetId, now, adminNote),
    ]);
    return jsonResponse(request, env, {
      ok: true,
      id,
      status: "approved",
      mergedInto: targetId,
      species: merged,
    });
  }

  const { species, coordinate, publicCoordinate } = editedFields(body, row);
  const siteId = body.siteId === undefined ? row.site_id : String(body.siteId || "") || null;
  await db
    .prepare(
      `UPDATE reports
          SET status='approved', species=?2, lat=?3, lon=?4,
              public_lat=?5, public_lon=?6, site_id=?7,
              merged_into=NULL, decided_at=?8, admin_note=?9
        WHERE id=?1`,
    )
    .bind(
      id,
      species,
      coordinate.lat,
      coordinate.lon,
      publicCoordinate.lat,
      publicCoordinate.lon,
      siteId,
      now,
      adminNote,
    )
    .run();
  return jsonResponse(request, env, {
    ok: true,
    id,
    status: "approved",
    by: admin.email,
  });
}

export async function handleRequest(request, env) {
  try {
    const url = new URL(request.url);

    // 어떤 경로든 관리자 인증을 먼저 통과해야 한다. 페이지도 예외가 아니다.
    const admin = await requireAdmin(request, env);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
      return new Response(ADMIN_PAGE, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (request.method === "GET" && url.pathname === "/admin/api/reports") {
      return await listReports(request, env, url);
    }
    const match = /^\/admin\/api\/reports\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (request.method === "POST" && match) {
      return await applyAction(request, env, match[1], admin);
    }
    throw new WorkerError("NOT_FOUND", "Unknown endpoint", 404);
  } catch (error) {
    return errorResponse(request, env, error);
  }
}

export default { fetch: handleRequest };
