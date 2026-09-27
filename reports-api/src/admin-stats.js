// 관리자 전용 출현종 제보 통계. GET /admin/api/stats (Access 인증 뒤에서만 불린다).
// 읽기 전용 SELECT 만 쓴다. 좌표·ip_hash·dedupe_hash·admin_note 는 어떤 응답에도 넣지 않는다.
//
// 집계 기준
// - 운영 현황(총·승인·반려·대기·최근 30일 접수·참여 제보자): 필터에 맞는 모든 상태.
// - 생태 통계(종수·종별·지역별·월별·연도별, 제보자별 종수·지역 수): 기본 approved 만.
//   상태 필터를 고르면 그 상태만으로 다시 센다.
// - 날짜: 출현 통계는 observed_on(관찰일, KST 문자열). 최근 30일만 received_at 을 KST 날짜로 센다.
// - 종명: reports.species(관리자 수정 반영본)를 ' · ' 로 나눠 종마다 센다. 표준명 변환은 하지 않는다.
// - 제보자: reporter 저장값이 정확히 같은 것끼리만 묶는다. 비었거나 공백뿐이면 '(이름 미입력)' 한 줄.
// - 지역: 관리자가 연결한 site_id 만. 없으면 '미연결 지역'. 좌표로 추정하지 않는다.
import { WorkerError } from "./shared.js";

const VIEWS = ["summary", "species", "sites", "reporters", "monthly", "yearly", "list"];
const STATUSES = ["approved", "rejected", "pending"];
const SITE_ID = /^[0-9A-Za-z_-]{1,16}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LIST_LIMIT = 500;
const SEP = " · ";

function invalid(message) {
  throw new WorkerError("STATS_FILTER_INVALID", message, 400);
}

function text(url, key) {
  const value = url.searchParams.get(key);
  if (value === null || value === "") return null;
  if (value.length > 100) invalid("검색어가 너무 깁니다.");
  return value;
}

export function parseStatsQuery(url) {
  const view = url.searchParams.get("view") || "summary";
  if (!VIEWS.includes(view)) invalid("알 수 없는 통계 종류입니다.");
  const f = {
    species: text(url, "species")?.trim() || null,
    reporter: text(url, "reporter"), // 저장값과 정확히 비교하므로 다듬지 않는다.
    noReporter: url.searchParams.get("noReporter") === "1",
    siteId: text(url, "siteId"),
    noSite: url.searchParams.get("noSite") === "1",
    status: text(url, "status"),
    from: text(url, "from"),
    to: text(url, "to"),
    year: text(url, "year"),
    month: text(url, "month"),
  };
  if (f.siteId && !SITE_ID.test(f.siteId)) invalid("탐조지 ID 형식이 아닙니다.");
  if (f.status && !STATUSES.includes(f.status)) invalid("상태 값이 올바르지 않습니다.");
  if (f.from && !DATE.test(f.from)) invalid("시작일 형식은 YYYY-MM-DD 입니다.");
  if (f.to && !DATE.test(f.to)) invalid("종료일 형식은 YYYY-MM-DD 입니다.");
  if (f.year && !/^\d{4}$/.test(f.year)) invalid("연도 형식은 YYYY 입니다.");
  if (f.month && !/^(0[1-9]|1[0-2])$/.test(f.month)) invalid("월 형식은 01~12 입니다.");
  return { view, filters: f };
}

// KST 오늘을 포함한 30일(오늘-29일 00:00 KST)의 시작 시각을 UTC ISO 로 돌려준다.
// received_at 은 항상 toISOString() 형식이라 문자열 비교로 충분하다.
export function recentCutoff(now = new Date()) {
  const today = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return new Date(Date.parse(today + "T00:00:00+09:00") - 29 * 86400 * 1000).toISOString();
}

// 공통 CTE.
//   f: 필터에 맞는 제보(모든 상태)   x: f 를 종 단위로 펼친 행(id 당 종 수만큼)
// 생태 조건 eco 는 상태 필터가 없으면 approved, 있으면 f 가 이미 그 상태만이라 1.
function base(filters) {
  const where = [], params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replaceAll("?", "?" + params.length)); };
  if (filters.species) add(`instr('${SEP}' || species || '${SEP}', '${SEP}' || ? || '${SEP}') > 0`, filters.species);
  if (filters.noReporter) where.push("TRIM(IFNULL(reporter, '')) = ''");
  else if (filters.reporter !== null) add("reporter = ?", filters.reporter);
  if (filters.noSite) where.push("site_id IS NULL");
  else if (filters.siteId) add("site_id = ?", filters.siteId);
  if (filters.status) add("status = ?", filters.status);
  if (filters.from) add("observed_on >= ?", filters.from);
  if (filters.to) add("observed_on <= ?", filters.to);
  if (filters.year) add("substr(observed_on, 1, 4) = ?", filters.year);
  if (filters.month) add("substr(observed_on, 6, 2) = ?", filters.month);
  let speciesOnly = "";
  if (filters.species) { params.push(filters.species); speciesOnly = ` AND TRIM(sp) = ?${params.length}`; }
  const cte = `WITH RECURSIVE
  f AS (SELECT id, status, species, observed_on, received_at, site_id,
               CASE WHEN TRIM(IFNULL(reporter, '')) = '' THEN NULL ELSE reporter END AS who
          FROM reports${where.length ? " WHERE " + where.join(" AND ") : ""}),
  cut(id, rest, sp) AS (
    SELECT id, species || '${SEP}', NULL FROM f
    UNION ALL
    SELECT id, substr(rest, instr(rest, '${SEP}') + ${SEP.length}), substr(rest, 1, instr(rest, '${SEP}') - 1)
      FROM cut WHERE rest <> ''),
  s AS (SELECT DISTINCT id, TRIM(sp) AS sp FROM cut WHERE sp IS NOT NULL AND TRIM(sp) <> ''${speciesOnly}),
  x AS (SELECT f.*, s.sp FROM f LEFT JOIN s ON s.id = f.id)`;
  return { cte, params, eco: filters.status ? "1" : "status = 'approved'" };
}

const APPROVED = "COUNT(DISTINCT CASE WHEN status = 'approved' THEN id END)";

function viewSql(view, eco) {
  switch (view) {
    case "species":
      return `SELECT sp AS species, COUNT(DISTINCT id) AS total, ${APPROVED} AS approved,
                     MIN(observed_on) AS first_observed, MAX(observed_on) AS last_observed,
                     COUNT(DISTINCT site_id) AS sites, COUNT(DISTINCT who) AS reporters
                FROM x WHERE ${eco} AND sp IS NOT NULL
               GROUP BY sp ORDER BY total DESC, sp`;
    case "sites":
      return `SELECT x.site_id, st.site_name, COUNT(DISTINCT x.id) AS total, COUNT(DISTINCT x.sp) AS species,
                     MAX(x.observed_on) AS last_observed, COUNT(DISTINCT x.who) AS reporters
                FROM x LEFT JOIN sites st ON st.site_id = x.site_id
               WHERE ${eco}
               GROUP BY x.site_id ORDER BY x.site_id IS NULL, total DESC, st.site_name`;
    case "reporters":
      return `SELECT who AS reporter, COUNT(DISTINCT id) AS total, ${APPROVED} AS approved,
                     COUNT(DISTINCT CASE WHEN status = 'rejected' THEN id END) AS rejected,
                     COUNT(DISTINCT CASE WHEN status = 'pending' THEN id END) AS pending,
                     COUNT(DISTINCT CASE WHEN ${eco} THEN sp END) AS species,
                     COUNT(DISTINCT CASE WHEN ${eco} THEN site_id END) AS sites,
                     MAX(observed_on) AS last_observed
                FROM x GROUP BY who ORDER BY who IS NULL, total DESC, who`;
    case "monthly":
      return `SELECT substr(observed_on, 1, 7) AS month, COUNT(DISTINCT id) AS total, ${APPROVED} AS approved,
                     COUNT(DISTINCT sp) AS species, COUNT(DISTINCT who) AS reporters
                FROM x WHERE ${eco} GROUP BY month ORDER BY month DESC`;
    case "yearly":
      return `SELECT substr(observed_on, 1, 4) AS year, COUNT(DISTINCT id) AS total,
                     COUNT(DISTINCT sp) AS species, COUNT(DISTINCT who) AS reporters, COUNT(DISTINCT site_id) AS sites
                FROM x WHERE ${eco} GROUP BY year ORDER BY year DESC`;
    case "list":
      // 관리자 카드와 잇기 위한 id 만 추가로 준다. 좌표·메모·해시는 고르지 않는다.
      return `SELECT f.id, f.status, f.species, f.observed_on, f.received_at, f.site_id, st.site_name, f.who AS reporter
                FROM f LEFT JOIN sites st ON st.site_id = f.site_id
               ORDER BY f.observed_on DESC, f.received_at DESC, f.id DESC LIMIT ${LIST_LIMIT + 1}`;
  }
  return null;
}

export async function adminStats(db, url, now = new Date()) {
  const { view, filters } = parseStatsQuery(url);
  const { cte, params, eco } = base(filters);
  const cutoff = "?" + (params.length + 1);
  const summarySql = `${cte}
    SELECT (SELECT COUNT(*) FROM f) AS total,
           (SELECT COUNT(*) FROM f WHERE status = 'approved') AS approved,
           (SELECT COUNT(*) FROM f WHERE status = 'rejected') AS rejected,
           (SELECT COUNT(*) FROM f WHERE status = 'pending') AS pending,
           (SELECT COUNT(DISTINCT sp) FROM x WHERE ${eco} AND sp IS NOT NULL) AS species,
           (SELECT COUNT(DISTINCT who) FROM f) AS reporters,
           (SELECT COUNT(*) FROM f WHERE who IS NULL) AS anonymous_reports,
           (SELECT COUNT(*) FROM f WHERE received_at >= ${cutoff}) AS recent30`;
  const run = (sql, values) => db.prepare(sql).bind(...values).all().then((r) => r.results || []);
  const detail = viewSql(view, eco);
  const [summary, rows] = await Promise.all([
    run(summarySql, [...params, recentCutoff(now)]),
    detail ? run(`${cte}\n${detail}`, params) : [],
  ]);
  const result = {
    ok: true,
    view,
    filters,
    ecologyStatus: filters.status || "approved",
    recentSince: recentCutoff(now),
    summary: summary[0],
  };
  if (detail) {
    result.rows = rows.slice(0, view === "list" ? LIST_LIMIT : undefined);
    if (view === "list") result.truncated = rows.length > LIST_LIMIT;
  }
  return result;
}
