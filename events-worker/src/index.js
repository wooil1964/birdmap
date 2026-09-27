// 탐조지도 기능 이용 통계 수집 Worker (birdmap-events).
// POST /events 로 페이지를 떠날 때 한 번 묶어 보낸 이벤트 합계를 받아 날짜(KST)별로 더한다.
// 제보 Worker·제보 DB 와는 코드도 데이터도 공유하지 않는다.
//
// 저장하지 않는 것: IP·IP 해시, User-Agent 원문(기기 유형 4가지로만 줄인다), referrer, URL,
// 좌표, 검색어, 이름, 쿠키·세션·사용자 식별자. 허용 목록 밖의 필드가 하나라도 있으면 전체를 거절한다.
import { SITES } from "../../weather-proxy/src/sites.js";

const MAX_BODY_BYTES = 4096;
const MAX_ITEMS = 20;   // 한 번에 보낼 수 있는 (이벤트·필드 조합) 수
const MAX_COUNT = 50;   // 한 조합의 최대 횟수(한 방문에서 이 이상은 비정상으로 본다)

const SOURCES_SITE = ["marker", "search", "weekly", "share"];
const SOURCES_SPOT = ["marker", "search", "recent"];
const LINK_TYPES = ["kakao", "naver", "windy", "ebird", "ksa", "other"];
const RESULT_BUCKETS = ["0", "1", "2_5", "6_plus"];

// 이벤트마다 허용하는 필드. true=필수, false=선택. 값 목록이 있으면 그 안의 값만 받는다.
const EVENTS = {
  report_button_click: {},
  recent_report_click: {},
  birdsite_popup_open: { site_id: true, source: [false, SOURCES_SITE] },
  report_spot_popup_open: { source: [false, SOURCES_SPOT] },
  weekly_panel_open: {},
  weekly_recommendation_click: { site_id: true },
  notice_panel_open: {},
  search_use: { result_count: [true, RESULT_BUCKETS] },
  external_link_click: { link_type: [true, LINK_TYPES], site_id: false },
  route_toggle: {},
};

// 흔한 크롤러·자동화 도구만 거른다(완벽한 봇 판별이 목적이 아니다).
const BOT_UA = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|phantomjs|puppeteer|playwright|selenium|curl|wget|python|httpclient|okhttp|axios|node-fetch|undici|go-http|java\//i;

export function deviceType(ua) {
  if (/ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return "mobile";
  if (/windows nt|macintosh|x11|cros|linux/i.test(ua)) return "desktop";
  return "other";
}

// KST 기준 오늘 날짜(YYYY-MM-DD).
export function kstDay(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function reply(status, origin) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(null, { status, headers });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// 항목 하나를 검사해 저장할 행 모양으로 바꾼다. 틀리면 null.
function normalize(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const rule = EVENTS[item.event];
  if (!rule || !Object.hasOwn(EVENTS, item.event)) return null;
  for (const key of Object.keys(item)) if (key !== "event" && key !== "n" && !Object.hasOwn(rule, key)) return null;
  if (!Number.isSafeInteger(item.n) || item.n < 1 || item.n > MAX_COUNT) return null;
  const row = { event: item.event, site_id: "", source: "", link_type: "", result_bucket: "", n: item.n };
  for (const [key, spec] of Object.entries(rule)) {
    const [required, values] = Array.isArray(spec) ? spec : [spec, null];
    const value = item[key];
    if (value === undefined) { if (required) return null; continue; }
    if (typeof value !== "string") return null;
    if (key === "site_id") { if (!Object.hasOwn(SITES, value)) return null; }
    else if (!values.includes(value)) return null;
    row[key === "result_count" ? "result_bucket" : key] = value;
  }
  return row;
}

export async function handleRequest(request, env, now = new Date()) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env).includes(origin) ? origin : "";
  if (url.pathname !== "/events") return reply(404);
  if (request.method !== "POST") return reply(405, allowed);
  if (!allowed) return reply(403);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) return reply(413, allowed);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return reply(413, allowed);
  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, allowed); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => k !== "events")) return reply(400, allowed);
  const items = body.events;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) return reply(400, allowed);
  const rows = items.map(normalize);
  if (rows.some((r) => !r)) return reply(400, allowed);

  const ua = request.headers.get("User-Agent") || "";
  // 봇으로 보이면 저장만 하지 않고 정상처럼 끝낸다(재전송을 부르지 않도록).
  if (!ua || BOT_UA.test(ua)) return reply(204, allowed);
  if (!env.EVENTS_DB) return reply(503, allowed);

  const day = kstDay(now), device = deviceType(ua);
  // 같은 요청 안의 같은 조합은 한 번에 더한다.
  const merged = new Map();
  for (const r of rows) {
    const key = [r.event, r.site_id, r.source, r.link_type, r.result_bucket].join("\u0000");
    const prev = merged.get(key);
    if (prev) prev.n += r.n; else merged.set(key, { ...r });
  }
  const sql = `INSERT INTO daily_usage (day, event, site_id, source, device_type, link_type, result_bucket, count)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
               ON CONFLICT (day, event, site_id, source, device_type, link_type, result_bucket)
               DO UPDATE SET count = count + ?8`;
  try {
    await env.EVENTS_DB.batch([...merged.values()].map((r) =>
      env.EVENTS_DB.prepare(sql).bind(day, r.event, r.site_id, r.source, device, r.link_type, r.result_bucket, r.n)));
  } catch (error) {
    console.error("events: write failed", String(error?.message || error));
    return reply(503, allowed);
  }
  return reply(204, allowed);
}

export default { fetch: (request, env) => handleRequest(request, env) };
