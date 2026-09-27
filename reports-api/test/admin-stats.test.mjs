// 관리자 통계 API. 실제 스키마 위에 합성 제보 7건을 넣고 집계 기준을 하나씩 고정한다.
// 외부 호출은 가짜(Access 공개키)이며 운영 D1 은 건드리지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { environments, installAuthStubs } from "../local-test/helpers.mjs";
import { handleRequest as adminHandler } from "../src/admin.js";
import { adminStats, recentCutoff } from "../src/admin-stats.js";
import { ADMIN_PAGE } from "../src/admin-page.js";
import { canonicalDb } from "./helpers.mjs";

// 2026-09-27 21:00 KST. 최근 30일 = 2026-08-29 00:00 KST(= 08-28T15:00Z) 이후 접수.
const NOW = new Date("2026-09-27T12:00:00.000Z");
const R = [
  // id, status, species, observed_on, received_at, site_id, reporter
  ["r1", "approved", "큰노랑발도요", "2026-09-20", "2026-09-21T00:00:00.000Z", "1", "홍길동"],
  ["r2", "approved", "큰노랑발도요 · 민물도요", "2026-08-15", "2026-08-28T15:00:00.000Z", "2", "홍길동"],
  ["r3", "rejected", "흰죽지", "2026-09-01", "2026-08-28T14:59:59.999Z", null, "홍길동"],
  ["r4", "pending", "검은목논병아리", "2025-12-31", "2026-09-27T14:59:00.000Z", null, "홍길동 "],
  ["r5", "approved", "민물도요", "2025-01-10", "2026-09-20T00:00:00.000Z", null, null],
  ["r6", "approved", "흰죽지", "2025-01-11", "2026-09-20T00:00:00.000Z", "1", "  "],
  ["r7", "rejected", "민물도요", "2026-09-02", "2026-09-22T00:00:00.000Z", "1", "김철수"],
];

function seeded() {
  const db = canonicalDb();
  const site = db.sqlite.prepare("INSERT INTO sites (site_id, site_name, lat, lon, registry_source, registry_revision, source_record_json, created_at) VALUES (?, ?, 36, 127, 'test', 'rev', '{}', '2026-09-20')");
  site.run("1", "유부도"); site.run("2", "매향리");
  const insert = db.sqlite.prepare(`INSERT INTO reports (id, status, species, observed_on, received_at, site_id, reporter,
    lat, lon, approx_lat, approx_lon, public_lat, public_lon, admin_note, ip_hash, dedupe_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, 35.123456, 126.654321, 35.1, 126.6, 35.2, 126.7, 'SECRET-ADMIN-NOTE', 'IPHASH-' || ?1, 'DEDUPE-' || ?1)`);
  for (const r of R) insert.run(...r);
  return db;
}

const stats = (db, query = "") => adminStats(db, new URL("https://admin.example/admin/api/stats?" + query), NOW);
const byKey = (rows, key) => Object.fromEntries(rows.map((r) => [r[key] === null ? "(null)" : r[key], r]));

test("최근 30일 경계는 KST 날짜 기준이다", () => {
  assert.equal(recentCutoff(NOW), "2026-08-28T15:00:00.000Z");
  // KST 로는 이미 9/28 인 UTC 9/27 16:00 에는 창도 하루 밀린다.
  assert.equal(recentCutoff(new Date("2026-09-27T16:00:00.000Z")), "2026-08-29T15:00:00.000Z");
});

test("운영 현황: 총=승인+반려+대기, 최근 30일은 received_at(KST), 익명은 사람 수에서 뺀다", async () => {
  const { summary: s } = await stats(seeded());
  assert.equal(s.total, 7);
  assert.equal(s.approved + s.rejected + s.pending, s.total);
  assert.deepEqual([s.approved, s.rejected, s.pending], [4, 2, 1]);
  // r3(08-28 23:59:59 KST)만 빠진다. UTC 로 잘랐다면 r2(08-29 00:00 KST)도 빠졌을 것이다.
  assert.equal(s.recent30, 6);
  // '홍길동', '홍길동 '(뒤 공백), '김철수' = 3명. 이름 미입력 2건은 사람 수로 세지 않는다.
  assert.equal(s.reporters, 3);
  assert.equal(s.anonymous_reports, 2);
  // 등록 종수는 승인만: 큰노랑발도요·민물도요·흰죽지. 대기(검은목논병아리)는 빠진다.
  assert.equal(s.species, 3);
});

test("종별: 승인만, ' · ' 로 나눠 종마다 세고 날짜는 observed_on", async () => {
  const { rows } = await stats(seeded(), "view=species");
  const m = byKey(rows, "species");
  assert.deepEqual(Object.keys(m).sort(), ["민물도요", "큰노랑발도요", "흰죽지"]);
  assert.deepEqual(m["큰노랑발도요"], { species: "큰노랑발도요", total: 2, approved: 2, first_observed: "2026-08-15", last_observed: "2026-09-20", sites: 2, reporters: 1 });
  assert.deepEqual(m["민물도요"], { species: "민물도요", total: 2, approved: 2, first_observed: "2025-01-10", last_observed: "2026-08-15", sites: 1, reporters: 1 });
  assert.deepEqual(m["흰죽지"], { species: "흰죽지", total: 1, approved: 1, first_observed: "2025-01-11", last_observed: "2025-01-11", sites: 1, reporters: 0 });
});

test("상태 필터를 고르면 그 상태만으로 다시 센다", async () => {
  const db = seeded();
  const rejected = await stats(db, "view=species&status=rejected");
  assert.deepEqual(rejected.summary.total, 2);
  assert.equal(rejected.summary.species, 2);
  assert.equal(rejected.ecologyStatus, "rejected");
  assert.deepEqual(rejected.rows.map((r) => r.species).sort(), ["민물도요", "흰죽지"]);
  const pending = await stats(db, "view=monthly&status=pending");
  assert.deepEqual(pending.rows, [{ month: "2025-12", total: 1, approved: 0, species: 1, reporters: 1 }]);
});

test("지역별: 연결된 site_id 만 탐조지역으로, 없으면 미연결 한 줄(승인만)", async () => {
  const { rows } = await stats(seeded(), "view=sites");
  const m = byKey(rows, "site_id");
  assert.deepEqual(m["1"], { site_id: "1", site_name: "유부도", total: 2, species: 2, last_observed: "2026-09-20", reporters: 1 });
  assert.deepEqual(m["2"], { site_id: "2", site_name: "매향리", total: 1, species: 2, last_observed: "2026-08-15", reporters: 1 });
  assert.deepEqual(m["(null)"], { site_id: null, site_name: null, total: 1, species: 1, last_observed: "2025-01-10", reporters: 0 });
  assert.equal(rows.at(-1).site_id, null, "미연결 지역은 마지막 줄");
});

test("월별·연도별은 observed_on 기준(승인만)", async () => {
  const db = seeded();
  const monthly = await stats(db, "view=monthly");
  assert.deepEqual(monthly.rows, [
    { month: "2026-09", total: 1, approved: 1, species: 1, reporters: 1 },
    { month: "2026-08", total: 1, approved: 1, species: 2, reporters: 1 },
    { month: "2025-01", total: 2, approved: 2, species: 2, reporters: 0 },
  ]);
  const yearly = await stats(db, "view=yearly");
  assert.deepEqual(yearly.rows, [
    { year: "2026", total: 2, species: 2, reporters: 1, sites: 2 },
    { year: "2025", total: 2, species: 2, reporters: 0, sites: 1 },
  ]);
});

test("제보자별: 건수는 모든 상태, 종수·지역 수는 승인만, 이름은 정확히 같은 값끼리", async () => {
  const { rows } = await stats(seeded(), "view=reporters");
  const m = byKey(rows, "reporter");
  assert.deepEqual(m["홍길동"], { reporter: "홍길동", total: 3, approved: 2, rejected: 1, pending: 0, species: 2, sites: 2, last_observed: "2026-09-20" });
  assert.deepEqual(m["홍길동 "], { reporter: "홍길동 ", total: 1, approved: 0, rejected: 0, pending: 1, species: 0, sites: 0, last_observed: "2025-12-31" });
  assert.deepEqual(m["김철수"], { reporter: "김철수", total: 1, approved: 0, rejected: 1, pending: 0, species: 0, sites: 0, last_observed: "2026-09-02" });
  // 이름 없는 2건(NULL, 공백뿐)은 한 줄로만 나온다.
  assert.deepEqual(m["(null)"], { reporter: null, total: 2, approved: 2, rejected: 0, pending: 0, species: 2, sites: 1, last_observed: "2025-01-11" });
  assert.equal(rows.length, 4);
  assert.equal(rows.at(-1).reporter, null, "(이름 미입력)은 마지막 줄");
});

test("상세 목록과 필터: 제보자·미입력·미연결·종·연월", async () => {
  const db = seeded();
  const ids = async (q) => (await stats(db, "view=list&" + q)).rows.map((r) => r.id).sort();
  assert.deepEqual(await ids("reporter=" + encodeURIComponent("홍길동")), ["r1", "r2", "r3"]);
  assert.deepEqual(await ids("noReporter=1"), ["r5", "r6"]);
  assert.deepEqual(await ids("noSite=1"), ["r3", "r4", "r5"]);
  assert.deepEqual(await ids("siteId=1&status=approved"), ["r1", "r6"]);
  assert.deepEqual(await ids("species=" + encodeURIComponent("민물도요")), ["r2", "r5", "r7"]);
  assert.deepEqual(await ids("year=2025&month=01"), ["r5", "r6"]);
  assert.deepEqual(await ids("from=2026-09-01&to=2026-09-02"), ["r3", "r7"]);
  // 종 필터는 여러 종 행에서 그 종만 센다.
  const only = await stats(db, "view=species&species=" + encodeURIComponent("민물도요"));
  assert.equal(only.summary.species, 1);
  assert.deepEqual(only.rows.map((r) => [r.species, r.total]), [["민물도요", 2]]);
  const list = await stats(db, "view=list&noReporter=1");
  assert.deepEqual(Object.keys(list.rows[0]).sort(), ["id", "observed_on", "received_at", "reporter", "site_id", "site_name", "species", "status"]);
});

test("잘못된 필터는 400 으로 거부한다", async () => {
  for (const q of ["view=drop", "status=deleted", "from=2026-13-01", "year=26", "month=13", "siteId=" + encodeURIComponent("1;DROP")]) {
    await assert.rejects(stats(seeded(), q), (e) => e.status === 400 && e.code === "STATS_FILTER_INVALID", q);
  }
});

test("통계 응답에는 좌표·해시·관리자 메모·관리자 이메일이 없고, 인증 없이는 열리지 않는다", async (t) => {
  const auth = await installAuthStubs(); t.after(auth.restore);
  const db = seeded(), { admin } = environments(db);
  const get = (q, token) => adminHandler(new Request("https://admin.example/admin/api/stats?" + q, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} }), admin);
  for (const view of ["summary", "species", "sites", "reporters", "monthly", "yearly", "list"]) {
    const res = await get("view=" + view, auth.token);
    assert.equal(res.status, 200, view);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const text = await res.text();
    for (const banned of ["lat", "lon", "approx", "public_", "ip_hash", "dedupe", "admin_note", "SECRET-ADMIN-NOTE", "IPHASH", "DEDUPE", "35.1", "126.6", "@example"])
      assert.ok(!text.includes(banned), view + " 응답에 " + banned);
  }
  const anonymous = await get("view=reporters", null);
  assert.ok([401, 403].includes(anonymous.status), "인증 없는 접근 " + anonymous.status);
  assert.ok(!(await anonymous.text()).includes("홍길동"));
});

test("관리자 화면: 통계 탭은 상태 탭과 분리되고 배지·기존 탭은 그대로다", () => {
  assert.match(ADMIN_PAGE, /<button type="button" data-status="pending" aria-pressed="true">승인 대기 <b id="pendingCount">-<\/b>건<\/button>/);
  for (const s of ["approved", "rejected", "all"]) assert.ok(ADMIN_PAGE.includes('data-status="' + s + '"'));
  assert.match(ADMIN_PAGE, /<button type="button" id="statsTab" aria-pressed="false">통계<\/button>/, "통계 탭에는 data-status 가 없다");
  assert.ok(!/data-status="'\s*\+/.test(ADMIN_PAGE), "통계 목록 버튼이 data-status 를 쓰지 않는다");
  assert.ok(ADMIN_PAGE.includes("document.getElementById('pendingCount').textContent=pending.length"), "배지 갱신 코드 유지");
  assert.ok(ADMIN_PAGE.includes("document.querySelector('main').style.display=name?'none':''"), "통계를 열면 카드 목록을 숨긴다");
  assert.match(ADMIN_PAGE, /<button type="button" id="usageTab" aria-pressed="false">이용 통계<\/button>/, "이용 통계 탭에도 data-status 가 없다");
  assert.ok(ADMIN_PAGE.includes("button.id!=='statsTab'&&button.id!=='usageTab'"), "두 통계 탭은 서로를 닫지 않는다");
});
