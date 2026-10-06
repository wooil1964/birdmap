import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { handleRequest } from "../src/public.js";
import { ORIGIN, fakeDb, publicEnv } from "./helpers.mjs";

function call(query = "", method = "GET", rows = []) {
  const request = new Request(`https://reports.example/contributors/monthly${query}`, { method, headers: ORIGIN });
  return handleRequest(request, publicEnv(fakeDb(rows)));
}

let seq = 0;
const row = (observed_on, extra = {}) => ({
  id: `r${++seq}`, status: "approved", species: "동박새", lat: 37, lon: 127,
  observed_on, reporter: null, name_public: 0, ...extra,
});
const pub = (observed_on, reporter, extra = {}) => row(observed_on, { reporter, name_public: 1, ...extra });

test("B. 지정 월: 관찰일 기준으로 센다", async () => {
  const response = await call("?month=2026-10", "GET", [pub("2026-10-05", "진정"), pub("2026-09-20", "진정")]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60");
  assert.deepEqual(await response.json(), {
    month: "2026-10", approvedReports: 1, publicContributors: 1, contributors: [{ name: "진정", count: 1 }],
  });
});

test("제보가 없으면 빈 결과", async () => {
  assert.deepEqual(await (await call("?month=2026-10")).json(),
    { month: "2026-10", approvedReports: 0, publicContributors: 0, contributors: [] });
});

test("A. month 가 없으면 Asia/Seoul 기준 현재 월 (UTC 로는 아직 9월 말)", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-30T15:30:00Z") }); // KST 2026-10-01 00:30
  try {
    const body = await (await call("", "GET", [pub("2026-10-01", "진정"), pub("2026-09-30", "까치딱새")])).json();
    assert.equal(body.month, "2026-10");
    assert.deepEqual(body.contributors, [{ name: "진정", count: 1 }]);
  } finally {
    mock.timers.reset();
  }
});

test("C. 이름 비공개는 contributors 에서 빠지고 approvedReports 에는 들어간다", async () => {
  const body = await (await call("?month=2026-10", "GET", [
    pub("2026-10-02", "진정"), row("2026-10-03", { reporter: "숨김", name_public: 0 }),
  ])).json();
  assert.equal(body.approvedReports, 2);
  assert.deepEqual(body.contributors, [{ name: "진정", count: 1 }]);
  assert.ok(!JSON.stringify(body).includes("숨김"));
});

test("D. reporter 가 NULL·빈 문자열·공백뿐이면 contributors 에서 빠진다", async () => {
  const body = await (await call("?month=2026-10", "GET", [
    pub("2026-10-02", null), pub("2026-10-02", ""), pub("2026-10-02", "   "), pub("2026-10-02", "진정"),
  ])).json();
  assert.equal(body.approvedReports, 4);
  assert.deepEqual(body.contributors, [{ name: "진정", count: 1 }]);
  assert.equal(body.publicContributors, 1);
});

test("E. 민감종·위치 보호 제보도 건수에 들어가지만 민감 정보는 응답에 없다", async () => {
  const body = await (await call("?month=2026-10", "GET", [
    pub("2026-10-02", "진정", { species: "저어새", note: "둥지 확인", site_id: "19", admin_note: "비밀 메모", public_lat: 36.1, public_lon: 126.1 }),
  ])).json();
  assert.deepEqual(body, { month: "2026-10", approvedReports: 1, publicContributors: 1, contributors: [{ name: "진정", count: 1 }] });
  const text = JSON.stringify(body);
  for (const secret of ["저어새", "둥지", "비밀 메모", "r1", "36.1"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(Object.keys(body.contributors[0]), ["name", "count"]);
});

test("F. 건수 내림차순, 같으면 이름 가나다순", async () => {
  const body = await (await call("?month=2026-10", "GET", [
    pub("2026-10-01", "행복합니다"), pub("2026-10-02", "행복합니다"),
    pub("2026-10-03", "이상목"), pub("2026-10-04", "까치딱새"), pub("2026-10-05", "까치딱새"), pub("2026-10-06", "까치딱새"),
    pub("2026-10-07", "이상목"), pub("2026-10-08", "이상목"), pub("2026-10-09", "진정"),
  ])).json();
  assert.deepEqual(body.contributors, [
    { name: "까치딱새", count: 3 }, { name: "이상목", count: 3 },
    { name: "행복합니다", count: 2 }, { name: "진정", count: 1 },
  ]);
  assert.equal(body.publicContributors, 4);
});

test("G. pending·rejected 는 전부 제외", async () => {
  const body = await (await call("?month=2026-10", "GET", [
    pub("2026-10-02", "진정", { status: "pending" }), pub("2026-10-02", "진정", { status: "rejected" }),
  ])).json();
  assert.deepEqual(body, { month: "2026-10", approvedReports: 0, publicContributors: 0, contributors: [] });
});

test("H. 월 경계", async () => {
  const rows = [pub("2026-09-30", "A"), pub("2026-10-01", "B"), pub("2026-10-31", "C"), pub("2026-11-01", "D")];
  const names = async (m) => (await (await call(`?month=${m}`, "GET", rows)).json()).contributors.map((c) => c.name);
  assert.deepEqual(await names("2026-09"), ["A"]);
  assert.deepEqual(await names("2026-10"), ["B", "C"]);
  assert.deepEqual(await names("2026-11"), ["D"]);
});

test("12월은 다음 해 1월 직전까지", async () => {
  const rows = [pub("2026-12-31", "A"), pub("2027-01-01", "B")];
  assert.deepEqual((await (await call("?month=2026-12", "GET", rows)).json()).contributors, [{ name: "A", count: 1 }]);
});

test("I. 잘못된 month 는 400 invalid_month", async () => {
  for (const q of ["?month=2026-9", "?month=test", "?month=2026-13", "?month=2026-00", "?month=", "?month=2026-10-01"]) {
    const response = await call(q);
    assert.equal(response.status, 400, q);
    assert.deepEqual(await response.json(), { error: "invalid_month" }, q);
  }
});

test("GET 이외는 405, 기존 공개 API 는 그대로", async () => {
  assert.equal((await call("", "POST")).status, 405);
  const approved = await handleRequest(new Request("https://reports.example/reports/approved", { headers: ORIGIN }), publicEnv(fakeDb([])));
  assert.equal(approved.status, 200);
});
