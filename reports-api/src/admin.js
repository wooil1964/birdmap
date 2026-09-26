// 관리자 승인 Worker. 이 Worker 의 workers.dev 주소에는 Cloudflare Access 를 건다.
// Access 가 앞에서 로그인을 강제하고, 여기서 Access JWT 를 한 번 더 검증한다.
// 설정값(ACCESS_TEAM_DOMAIN / ACCESS_AUD / ADMIN_EMAILS)이 비어 있으면 503 으로 닫는다.

import {
  WorkerError,
  errorResponse,
  jsonResponse,
  parseAdminEmails,
  verifyAccessJwt,
} from "./shared.js";
import { ADMIN_PAGE } from "./admin-page.js";
import { ACTIONS, loadReport, planAction } from "./admin-actions.js";
import { assertWriteGate, internalCapability, capability, writeMode } from "./canonical/control.js";
import { adminIdentity, replayAdmin, persistAdmin } from "./canonical/persistence.js";
import { applicationDb, first } from "./canonical/data.js";

// link  : 이 제보의 이력을 다른 지점에 붙인다(종 목록은 읽을 때 합치므로 원본을 고쳐 쓰지 않는다).
// unlink: 연결을 끊어 다시 자기 점을 갖게 한다.
// consent: 제보자 이름 공개 여부만 바꾼다(공개 철회 처리).
// visibility: 승인 전 황색 마커 공개 여부를 켜고 끈다(민감지 보류·해제).
// site: 탐조 지역(siteData.id)만 지정·해제한다. 승인 상태와 좌표는 건드리지 않는다.

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
  // The editable values and their CAS revision must come from the same SELECT snapshot.
  let selection='*';
  if(writeMode(env)!=='NORMAL') {
    const exists=await first(db,"SELECT name FROM sqlite_schema WHERE type='table' AND name='checklists'");
    selection=exists?'reports.*,(SELECT revision FROM checklists WHERE checklist_id=reports.id) AS revision':'reports.*,NULL AS revision';
  }
  const status = url.searchParams.get("status") || "pending";
  const species = (url.searchParams.get("species") || "").trim();
  const spotKey = (url.searchParams.get("spotKey") || "").trim();

  // 종별 이력: 이어 붙인 문자열에서 구분자를 포함해 정확히 한 종만 고른다.
  if (species) {
    const { results } = await db
      .prepare(
        `SELECT ${selection} FROM reports
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
        `SELECT ${selection} FROM reports WHERE spot_key = ?1 OR id = ?1
          ORDER BY observed_on DESC, received_at DESC`,
      )
      .bind(spotKey)
      .all();
    return jsonResponse(request, env, { ok: true, reports: results || [] });
  }
  const statement =
    status === "all"
      ? db.prepare(
          `SELECT ${selection} FROM reports ORDER BY
             CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
             received_at DESC`,
        )
      : db
          .prepare(
            `SELECT ${selection} FROM reports WHERE status = ?1 ORDER BY received_at DESC`,
          )
          .bind(status);
  const { results } = await statement.all();
  return jsonResponse(request, env, { ok: true, reports: results || [] });
}
async function applyAction(request,env,id,admin,dual) {
  const binding=database(env),db=dual?applicationDb(binding):binding;
  const body=await readJson(request);
  if(!ACTIONS.includes(String(body?.action||'')))throw new WorkerError('ACTION_INVALID','알 수 없는 처리입니다.',400);
  const identity=dual?await adminIdentity(body,id,admin.email):null;
  if(dual) {
    const saved=await replayAdmin(db,identity,id,admin.email);
    if(saved)return jsonResponse(request,env,saved);
  }
  const row=await loadReport(db,id),now=new Date().toISOString();
  const plan=await planAction(db,body,row,admin,now);
  if(dual) {
    const result=await persistAdmin(binding,{id,body,actor:admin.email,identity,plan,before:row,now});
    return jsonResponse(request,env,result);
  }
  await db.prepare(`UPDATE reports SET ${Object.keys(plan.patch).map(k=>k+'=?').join(',')} WHERE id=?`).bind(...Object.values(plan.patch),id).run();
  return jsonResponse(request,env,plan.result);
}

export async function handleRequest(request, env) {
  try {
    const url = new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/_internal/reports-capability")return await internalCapability(request,env,"admin");

    // 어떤 경로든 관리자 인증을 먼저 통과해야 한다. 페이지도 예외가 아니다.
    const admin = await requireAdmin(request, env);
    if(request.method==="GET"&&url.pathname==="/admin/api/capabilities")return jsonResponse(request,env,{ok:true,...await capability(env,"admin")},200,{"Cache-Control":"no-store"});

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
    // Cutover-window operator steps. Off unless the deploy explicitly sets REPORTS_OPS_ENABLED.
    const ops = /^\/admin\/api\/ops\/(seed|backfill)$/.exec(url.pathname);
    if (request.method === "POST" && ops && env.REPORTS_OPS_ENABLED === "true") {
      // Loaded only when the cutover ops route is enabled (it pulls in tools/backfill-lib).
      const { applyBackfill, applySeed } = await import("./canonical/ops.js");
      const body = await readJson(request), db = database(env);
      return jsonResponse(request, env, { ok: true, ...(ops[1] === "seed" ? await applySeed(db, body) : await applyBackfill(db, body)) }, 200, { "Cache-Control": "no-store" });
    }
    const match = /^\/admin\/api\/reports\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (request.method === "POST" && match) {
      return await applyAction(request, env, match[1], admin, await assertWriteGate(env,"admin"));
    }
    throw new WorkerError("NOT_FOUND", "Unknown endpoint", 404);
  } catch (error) {
    return errorResponse(request, env, error);
  }
}

export default { fetch: handleRequest };
