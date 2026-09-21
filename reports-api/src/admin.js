// 관리자 승인 Worker. 이 Worker 의 workers.dev 주소에는 Cloudflare Access 를 건다.
// Access 가 앞에서 로그인을 강제하고, 여기서 Access JWT 를 한 번 더 검증한다.
// 설정값(ACCESS_TEAM_DOMAIN / ACCESS_AUD / ADMIN_EMAILS)이 비어 있으면 503 으로 닫는다.

import {
  WorkerError,
  approximateCoordinate,
  errorResponse,
  jsonResponse,
  normalizeCoordinate,
  normalizeObservedOn,
  normalizeSpecies,
  parseAdminEmails,
  verifyAccessJwt,
} from "./shared.js";
import { ADMIN_PAGE } from "./admin-page.js";

// link  : 이 제보의 이력을 다른 지점에 붙인다(종 목록은 읽을 때 합치므로 원본을 고쳐 쓰지 않는다).
// unlink: 연결을 끊어 다시 자기 점을 갖게 한다.
// consent: 제보자 이름 공개 여부만 바꾼다(공개 철회 처리).
// visibility: 승인 전 황색 마커 공개 여부를 켜고 끈다(민감지 보류·해제).
// site: 탐조 지역(siteData.id)만 지정·해제한다. 승인 상태와 좌표는 건드리지 않는다.
const ACTIONS = [
  "approve",
  "reject",
  "unpublish",
  "link",
  "unlink",
  "consent",
  "visibility",
  "site",
];

// siteData 의 탐조지 id 형식.
const SITE_ID = /^[0-9A-Za-z_-]{1,16}$/;

// index.html 의 수동 붉은 점은 "fixed:<siteId>:<n>" 키로 가리킨다.
const FIXED_SPOT_KEY = /^fixed:[0-9]{1,6}:[0-9]{1,3}$/;
const REPORT_ID = /^[0-9a-f-]{36}$/;

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
  const species = (url.searchParams.get("species") || "").trim();
  const spotKey = (url.searchParams.get("spotKey") || "").trim();

  // 종별 이력: 이어 붙인 문자열에서 구분자를 포함해 정확히 한 종만 고른다.
  if (species) {
    const { results } = await db
      .prepare(
        `SELECT * FROM reports
          WHERE (' · ' || species || ' · ') LIKE ('% · ' || ?1 || ' · %')
          ORDER BY observed_on DESC, received_at DESC`,
      )
      .bind(species)
      .all();
    return jsonResponse(request, env, { ok: true, reports: results || [] });
  }

  // 지점별 이력: 그 지점에 붙은 제보와 지점 자신을 함께 본다.
  if (spotKey) {
    const { results } = await db
      .prepare(
        `SELECT * FROM reports WHERE spot_key = ?1 OR id = ?1
          ORDER BY observed_on DESC, received_at DESC`,
      )
      .bind(spotKey)
      .all();
    return jsonResponse(request, env, { ok: true, reports: results || [] });
  }
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
    // 반려하면 황색 마커도 즉시 사라져야 한다.
    await db
      .prepare(
        `UPDATE reports SET status='rejected', pending_public=0,
             decided_at=?2, admin_note=?3 WHERE id=?1`,
      )
      .bind(id, now, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, status: "rejected" });
  }

  if (action === "unpublish") {
    // 공개만 거둔다. 대기 상태로 되돌려 다시 승인할 수 있게 둔다.
    // 이때 pending_public 을 반드시 0 으로 내린다. 그러지 않으면 공개를 취소한 제보가
    // 승인 대기 목록을 타고 황색 마커로 되살아난다.
    // 기존 탐조지와 그 출현종은 별도 데이터라 여기서 건드리지 않는다.
    await db
      .prepare(
        `UPDATE reports SET status='pending', pending_public=0,
             decided_at=?2, admin_note=?3 WHERE id=?1`,
      )
      .bind(id, now, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, status: "pending" });
  }

  if (action === "consent") {
    // 제보자가 이름 공개를 철회하면 여기서 비공개로 되돌린다. 제보 자체는 남는다.
    const namePublic = body.namePublic === true || body.namePublic === 1 ? 1 : 0;
    await db
      .prepare(`UPDATE reports SET name_public=?2, admin_note=?3 WHERE id=?1`)
      .bind(id, namePublic, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, namePublic });
  }

  if (action === "visibility") {
    // 승인과는 별개다. 켜도 상태는 'pending' 그대로이고 황색 마커로만 보인다.
    const open = body.public === true || body.public === 1 ? 1 : 0;
    if (open && row.status !== "pending") {
      throw new WorkerError(
        "ACTION_INVALID",
        "승인 대기 중인 제보만 황색 마커로 공개할 수 있습니다.",
        400,
      );
    }
    // 공개를 켤 때 대략 좌표가 없으면(이 기능 이전 자료) 이때 한 번 만든다.
    const approx =
      open && (row.approx_lat == null || row.approx_lon == null)
        ? approximateCoordinate(row.lat, row.lon)
        : { lat: row.approx_lat, lon: row.approx_lon };
    await db
      .prepare(
        `UPDATE reports SET pending_public=?2, approx_lat=?3, approx_lon=?4,
             admin_note=?5 WHERE id=?1`,
      )
      .bind(id, open, approx.lat, approx.lon, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, pendingPublic: open });
  }

  if (action === "site") {
    // 탐조 지역만 저장한다. 개별 출현 지점(spot_key)·실제 좌표·승인 상태는 그대로 둔다.
    // 좌표가 가깝다는 이유로 자동 배정하지 않는다. 관리자가 고른 값만 들어간다.
    const raw =
      body.siteId === undefined || body.siteId === null ? "" : String(body.siteId).trim();
    if (raw && !SITE_ID.test(raw)) {
      throw new WorkerError("SITE_ID_INVALID", "탐조지 ID 형식이 아닙니다.", 400);
    }
    await db
      .prepare(`UPDATE reports SET site_id=?2, admin_note=?3 WHERE id=?1`)
      .bind(id, raw || null, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, siteId: raw || null });
  }

  if (action === "unlink") {
    await db
      .prepare(`UPDATE reports SET spot_key=NULL, admin_note=?2 WHERE id=?1`)
      .bind(id, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, spotKey: null });
  }

  if (action === "link") {
    // 좌표가 가깝다는 이유로 자동 연결하지 않는다. 관리자가 지정한 지점에만 붙인다.
    const spotKey = String(body.spotKey || "");
    if (!spotKey || spotKey === id) {
      throw new WorkerError("TARGET_INVALID", "연결할 지점을 선택해 주세요.", 400);
    }
    if (FIXED_SPOT_KEY.test(spotKey)) {
      // index.html 의 수동 붉은 점. 그 점의 좌표와 출현종은 건드리지 않고 이력만 붙인다.
    } else if (REPORT_ID.test(spotKey)) {
      const target = await loadReport(db, spotKey);
      if (target.spot_key) {
        throw new WorkerError(
          "TARGET_INVALID",
          "이미 다른 지점에 연결된 제보에는 붙일 수 없습니다.",
          400,
        );
      }
    } else {
      throw new WorkerError("TARGET_INVALID", "지점 키 형식이 올바르지 않습니다.", 400);
    }
    // 연결해도 원본 종 목록은 그대로 둔다. 공개 API 가 읽을 때 합집합으로 계산한다.
    await db
      .prepare(
        `UPDATE reports SET status='approved', spot_key=?2, decided_at=?3, admin_note=?4 WHERE id=?1`,
      )
      .bind(id, spotKey, now, adminNote)
      .run();
    return jsonResponse(request, env, { ok: true, id, status: "approved", spotKey });
  }

  const { species, coordinate, publicCoordinate } = editedFields(body, row);
  const siteId = body.siteId === undefined ? row.site_id : String(body.siteId || "") || null;
  // 관찰일도 고칠 수 있다. 값을 보내지 않으면 접수된 날짜를 그대로 둔다(임의로 채우지 않는다).
  const observedOn = body.observedOn === undefined
    ? String(row.observed_on)
    : normalizeObservedOn(body.observedOn);
  const namePublic = body.namePublic === undefined
    ? Number(row.name_public) === 1 ? 1 : 0
    : body.namePublic === true || body.namePublic === 1 ? 1 : 0;
  await db
    .prepare(
      `UPDATE reports
          SET status='approved', species=?2, lat=?3, lon=?4,
              public_lat=?5, public_lon=?6, site_id=?7,
              observed_on=?8, name_public=?9, decided_at=?10, admin_note=?11
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
      observedOn,
      namePublic,
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
