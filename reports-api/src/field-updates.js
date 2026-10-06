// 현장소식: 탐조 현장에서 회원이 "지금 보여요 / 찾는 중 / 안 보여요 / 다시 나타남"을 빠르게 공유하는 실시간 정보.
// 장기 자료인 출현종 제보(reports)와 테이블·경로·수명이 완전히 다르다. reports 와는 아무것도 공유하지 않는다.
//
//   GET  /field-updates                유효한(TTL 안의) 현장소식. 실제 좌표는 내보내지 않는다.
//   POST /field-updates                새 현장소식(visible | searching) 등록
//   POST /field-updates/<id>/status    상태 이벤트 추가(안 보여요·다시 나타남·찾았어요). 이전 이벤트는 지우지 않는다.
//   POST /field-updates/<id>/confirm   '확인' 한 번. 같은 브라우저는 소식마다 한 번만.
//
// 위치 추적 기능은 없다. 좌표는 등록하는 순간 사용자가 확인한 한 점만 저장된다.
import {
  WorkerError,
  approximateCoordinate,
  ipHash,
  isSensitiveReport,
  jsonResponse,
  normalizeCoordinate,
  normalizeSpecies,
  sha256Hex,
  verifyTurnstile,
} from "./shared.js";

// 소식이 지도에 남는 시간. 마지막 활동(상태 변경 또는 확인) 뒤로 이 시간이 지나면 응답에서 빠진다.
// 값을 바꿀 곳은 여기 하나다. 프런트 표시는 응답의 ttlHours 를 따른다.
export const FIELD_UPDATE_TTL_HOURS = 3;

export const FIELD_STATUSES = ["visible", "searching", "not_visible", "reappeared"];
const CREATE_STATUSES = ["visible", "searching"];
// 현재 상태 → 보낼 수 있는 다음 상태. '안 보여요'를 눌러도 이력은 그대로 남고 새 이벤트만 쌓인다.
const TRANSITIONS = {
  searching: ["visible", "not_visible"],
  visible: ["not_visible"],
  reappeared: ["not_visible"],
  not_visible: ["reappeared"],
};
const CONFIRMABLE = ["visible", "reappeared"];

export const FIELD_NOTE_MAX = 100;
export const FIELD_NICKNAME_MAX = 20;
export const FIELD_COUNT_MAX = 999;
const LIST_LIMIT = 100;
const HISTORY_LIMIT = 8;
// 제출 횟수 제한(IP 해시 기준). 회원 식별이 아니라 도배를 막는 용도다.
const WRITE_WINDOW_MINUTES = 10;
const WRITE_WINDOW_MAX = 10;
const WRITE_DAY_MAX = 80;
const CONFIRM_WINDOW_MAX = 30;

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const SOURCES = ["gps", "map"];

function cleanText(raw, max, field) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text) return null;
  if (text.length > max) {
    throw new WorkerError("FIELD_TEXT_TOO_LONG", `${field}은(는) ${max}자까지 입력할 수 있어요.`, 400);
  }
  if (/[<>]/.test(text)) {
    throw new WorkerError("FIELD_TEXT_INVALID", `${field}에 < 또는 > 는 쓸 수 없어요.`, 400);
  }
  return text;
}

function validateStatus(raw) {
  const status = String(raw ?? "");
  if (!FIELD_STATUSES.includes(status)) {
    throw new WorkerError("FIELD_STATUS_INVALID", "알 수 없는 상태예요. 다시 선택해 주세요.", 400);
  }
  return status;
}

function validateDevice(raw) {
  const id = String(raw ?? "");
  if (!DEVICE_ID.test(id)) {
    throw new WorkerError("FIELD_DEVICE_REQUIRED", "브라우저 정보를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.", 400);
  }
  return id;
}

function validateCount(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > FIELD_COUNT_MAX) {
    throw new WorkerError("FIELD_COUNT_INVALID", `개체수는 1~${FIELD_COUNT_MAX} 사이의 숫자로 입력해 주세요.`, 400);
  }
  return value;
}

// 둥지·번식 관련 낱말이 있으면 등록하지 않는다(기존 출현종 제보의 번식 보호 정책과 같은 낱말 목록).
// 보호종은 등록은 되지만 공개 좌표가 대략 좌표로 바뀐다.
function protection(species, note) {
  const breeding = isSensitiveReport({ note: note || "", speciesText: species, species: [] });
  const sensitiveSpecies = isSensitiveReport({ note: "", speciesText: "", species: [species] });
  return { breeding, sensitiveSpecies };
}

function userHash(deviceId, env) {
  return sha256Hex(`device:${env.REPORT_IP_SALT || ""}:${deviceId}`);
}

function iso(date) {
  return date.toISOString();
}

function cutoffIso(now) {
  return iso(new Date(now.getTime() - FIELD_UPDATE_TTL_HOURS * 3600 * 1000));
}

async function enforceRate(db, table, hash, now, max) {
  const windowStart = iso(new Date(now.getTime() - WRITE_WINDOW_MINUTES * 60 * 1000));
  const dayStart = iso(new Date(now.getTime() - 24 * 3600 * 1000));
  const row = await db
    .prepare(
      `SELECT SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) AS recent,
              COUNT(*) AS daily
         FROM ${table} WHERE ip_hash = ?1 AND created_at >= ?3`,
    )
    .bind(hash, windowStart, dayStart)
    .first();
  if (Number(row?.recent || 0) >= max || Number(row?.daily || 0) >= WRITE_DAY_MAX) {
    throw new WorkerError("FIELD_RATE_LIMITED", "너무 자주 보내고 있어요. 잠시 후 다시 시도해 주세요.", 429);
  }
}

// 공개 응답 한 건. 실제 좌표(lat, lon)는 어디에도 넣지 않는다.
function publicEntry(row, events, confirmCount) {
  const entry = {
    id: row.id,
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
    history: events.map((event) => ({ status: event.status, at: event.created_at, nickname: event.nickname })),
  };
  if (Number(row.location_hidden) === 1) entry.locationHidden = true;
  return entry;
}

async function loadEntries(db, rows) {
  if (!rows.length) return [];
  const marks = rows.map((_, index) => `?${index + 1}`).join(", ");
  const ids = rows.map((row) => row.id);
  const { results: events } = await db
    .prepare(
      `SELECT field_update_id, status, nickname, created_at FROM field_update_events
        WHERE field_update_id IN (${marks}) ORDER BY created_at ASC, rowid ASC`,
    )
    .bind(...ids)
    .all();
  const { results: counts } = await db
    .prepare(
      `SELECT field_update_id, COUNT(*) AS n FROM field_update_confirmations
        WHERE field_update_id IN (${marks}) GROUP BY field_update_id`,
    )
    .bind(...ids)
    .all();
  const eventsById = new Map();
  for (const event of events || []) {
    if (!eventsById.has(event.field_update_id)) eventsById.set(event.field_update_id, []);
    eventsById.get(event.field_update_id).push(event);
  }
  const countById = new Map((counts || []).map((row) => [row.field_update_id, Number(row.n)]));
  return rows.map((row) => {
    const list = eventsById.get(row.id) || [];
    return publicEntry(row, list.slice(-HISTORY_LIMIT), countById.get(row.id) || 0);
  });
}

const COLUMNS = `id, species, bird_count, status, public_lat, public_lon, location_hidden, nickname, note,
                 created_at, updated_at, last_confirmed_at, last_activity_at, user_hash`;

async function loadActive(db, id, now) {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`)
    .bind(id)
    .first();
  if (!row) throw new WorkerError("FIELD_NOT_FOUND", "찾을 수 없는 현장소식이에요.", 404);
  if (row.last_activity_at < cutoffIso(now)) {
    throw new WorkerError("FIELD_EXPIRED", "시간이 지나 이미 사라진 현장소식이에요.", 410);
  }
  return row;
}

async function handleList(request, env, helpers) {
  const db = helpers.database(env);
  const now = new Date();
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM field_updates
        WHERE last_activity_at >= ?1 ORDER BY last_activity_at DESC LIMIT ${LIST_LIMIT}`,
    )
    .bind(cutoffIso(now))
    .all();
  const updates = await loadEntries(db, results || []);
  return jsonResponse(
    request,
    env,
    { ok: true, serverTime: iso(now), ttlHours: FIELD_UPDATE_TTL_HOURS, updates },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function handleCreate(request, env, helpers) {
  const db = helpers.database(env);
  const now = new Date();
  const body = await helpers.readJsonBody(request);
  const status = validateStatus(body?.status);
  if (!CREATE_STATUSES.includes(status)) {
    throw new WorkerError("FIELD_STATUS_NOT_ALLOWED", "처음 등록은 '지금 보여요' 또는 '찾는 중'만 가능해요.", 400);
  }
  const species = normalizeSpecies(body?.species);
  if (species.length !== 1) {
    throw new WorkerError("SPECIES_INVALID", "종명은 하나만 선택해 주세요.", 400);
  }
  const { lat, lon } = normalizeCoordinate(body?.lat, body?.lon);
  const count = validateCount(body?.count);
  const note = cleanText(body?.note, FIELD_NOTE_MAX, "메모");
  const nickname = cleanText(body?.nickname, FIELD_NICKNAME_MAX, "닉네임") || "익명";
  const device = validateDevice(body?.deviceId);
  const source = SOURCES.includes(body?.locationSource) ? body.locationSource : null;
  const accuracy = Number.isFinite(Number(body?.gpsAccuracy)) && Number(body.gpsAccuracy) >= 0
    ? Math.min(100000, Math.round(Number(body.gpsAccuracy))) : null;

  const { breeding, sensitiveSpecies } = protection(species[0], note);
  if (breeding) {
    throw new WorkerError("FIELD_BREEDING_NOT_ALLOWED", "번식 관련 정보는 현장소식으로 공유할 수 없어요.", 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_events", hash, now, WRITE_WINDOW_MAX);
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);

  const user = await userHash(device, env);
  // 보호종은 실제 위치 대신 대략 좌표만 공개한다. 점은 등록 때 한 번 만들어 고정한다.
  const publicPoint = sensitiveSpecies ? approximateCoordinate(lat, lon) : { lat, lon };
  const id = crypto.randomUUID();
  const at = iso(now);
  await db.batch([
    db.prepare(
      `INSERT INTO field_updates
         (id, species, bird_count, status, lat, lon, public_lat, public_lon, location_hidden, nickname, note,
          location_source, gps_accuracy, created_at, updated_at, last_confirmed_at, last_activity_at, user_hash, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, NULL, ?14, ?15, ?16)`,
    ).bind(id, species[0], count, status, lat, lon, publicPoint.lat, publicPoint.lon, sensitiveSpecies ? 1 : 0,
      nickname, note, source, accuracy, at, user, hash),
    db.prepare(
      `INSERT INTO field_update_events (id, field_update_id, status, nickname, created_at, user_hash, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(crypto.randomUUID(), id, status, nickname, at, user, hash),
  ]);
  const row = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [row]);
  return jsonResponse(request, env, { ok: true, update }, 201);
}

async function handleStatus(request, env, id, helpers) {
  const db = helpers.database(env);
  const now = new Date();
  const body = await helpers.readJsonBody(request);
  const status = validateStatus(body?.status);
  const nickname = cleanText(body?.nickname, FIELD_NICKNAME_MAX, "닉네임") || "익명";
  const device = validateDevice(body?.deviceId);
  const row = await loadActive(db, id, now);
  if (row.status === status) {
    throw new WorkerError("FIELD_STATUS_SAME", "이미 같은 상태로 올라와 있어요.", 409);
  }
  if (!(TRANSITIONS[row.status] || []).includes(status)) {
    throw new WorkerError("FIELD_STATUS_TRANSITION", "지금 상태에서는 선택할 수 없는 상태예요.", 409);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_events", hash, now, WRITE_WINDOW_MAX);
  await verifyTurnstile(body?.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);

  const user = await userHash(device, env);
  const at = iso(now);
  // 새 이벤트를 덧붙이고 현재 상태만 바꾼다. created_at(최초 관찰시간)과 last_confirmed_at 은 건드리지 않는다.
  await db.batch([
    db.prepare(
      `INSERT INTO field_update_events (id, field_update_id, status, nickname, created_at, user_hash, ip_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(crypto.randomUUID(), id, status, nickname, at, user, hash),
    db.prepare(
      "UPDATE field_updates SET status = ?2, updated_at = ?3, last_activity_at = ?3 WHERE id = ?1",
    ).bind(id, status, at),
  ]);
  const fresh = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [fresh]);
  return jsonResponse(request, env, { ok: true, update }, 201);
}

async function handleConfirm(request, env, id, helpers) {
  const db = helpers.database(env);
  const now = new Date();
  const body = await helpers.readJsonBody(request);
  const device = validateDevice(body?.deviceId);
  const row = await loadActive(db, id, now);
  if (!CONFIRMABLE.includes(row.status)) {
    throw new WorkerError("FIELD_NOT_CONFIRMABLE", "지금 보이는 상태의 소식만 확인할 수 있어요.", 409);
  }
  const user = await userHash(device, env);
  if (user === row.user_hash) {
    throw new WorkerError("FIELD_CONFIRM_OWN", "직접 올린 소식은 확인할 수 없어요.", 409);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const hash = await ipHash(ip, env.REPORT_IP_SALT);
  await enforceRate(db, "field_update_confirmations", hash, now, CONFIRM_WINDOW_MAX);

  const at = iso(now);
  try {
    // 확인 기록이 먼저 들어가야 한다. UNIQUE 에 걸리면 뒤의 갱신은 실행되지 않는다(배치는 한 묶음).
    await db.batch([
      db.prepare(
        `INSERT INTO field_update_confirmations (id, field_update_id, user_hash, ip_hash, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(crypto.randomUUID(), id, user, hash, at),
      // 최초 관찰시간(created_at)과 상태 변경시간(updated_at)은 그대로 두고 확인·활동 시각만 올린다.
      db.prepare(
        "UPDATE field_updates SET last_confirmed_at = ?2, last_activity_at = ?2 WHERE id = ?1",
      ).bind(id, at),
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error?.message))) {
      throw new WorkerError("FIELD_ALREADY_CONFIRMED", "이미 확인하셨어요.", 409);
    }
    throw error;
  }
  const fresh = await db.prepare(`SELECT ${COLUMNS} FROM field_updates WHERE id = ?1`).bind(id).first();
  const [update] = await loadEntries(db, [fresh]);
  return jsonResponse(request, env, { ok: true, update }, 201);
}

const PATH = /^\/field-updates(?:\/([0-9a-f-]{36})\/(status|confirm))?$/;

// /field-updates 경로가 아니면 null 을 돌려주어 호출한 쪽이 기존 라우팅을 이어가게 한다.
export async function handleFieldUpdates(request, env, url, helpers) {
  const match = PATH.exec(url.pathname);
  if (!match) return null;
  const [, id, action] = match;
  if (!id && request.method === "GET") return handleList(request, env, helpers);
  if (!id && request.method === "POST") return handleCreate(request, env, helpers);
  if (id && request.method === "POST") {
    return action === "status" ? handleStatus(request, env, id, helpers) : handleConfirm(request, env, id, helpers);
  }
  throw new WorkerError("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
