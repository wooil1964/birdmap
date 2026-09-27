// index.html 의 이용 통계 블록(usage:start ~ usage:end)을 그대로 꺼내 가짜 브라우저에서 돌린다.
// 전송은 방문 중 모았다가 한 번, 실패는 조용히, 재시도 없음, 허용 필드만 나가는지 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const BLOCK = HTML.slice(HTML.indexOf("/* usage:start"), HTML.indexOf("/* usage:end */"));
const URL_ = "https://birdmap-events.example/events";

function browser({ beacon = () => true, fetchImpl, withBeacon = true, withFetch = true } = {}) {
  const calls = { beacon: [], fetch: [] }, listeners = {}, timers = [];
  const on = (target) => (type, fn, capture) => { (listeners[target + ":" + type + (capture ? ":capture" : "")] ||= []).push(fn); };
  const elements = {};
  const ctx = {
    console, JSON, URL, Object, String, Array,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    location: { href: "https://wooil1964.github.io/birdmap/", host: "wooil1964.github.io", search: "" },
    navigator: withBeacon ? { sendBeacon: (url, body) => { calls.beacon.push({ url, body }); return beacon(url, body); } } : {},
    document: { visibilityState: "visible", addEventListener: on("document"), getElementById: (id) => elements[id] || null },
    window: { addEventListener: on("window") },
  };
  if (withFetch) ctx.fetch = (url, init) => { calls.fetch.push({ url, init }); return fetchImpl ? fetchImpl(url, init) : Promise.resolve({}); };
  vm.createContext(ctx);
  vm.runInContext(BLOCK, ctx);
  const fire = (key, event = {}) => (listeners[key] || []).forEach((fn) => fn(event));
  const click = (matches) => {
    const target = { closest: (sel) => matches[sel] || null };
    fire("document:click:capture", { target }); fire("document:click", { target });
  };
  return { ctx, calls, fire, click, elements, sent: () => calls.beacon.concat(calls.fetch).map((c) => JSON.parse(c.body ?? c.init.body)) };
}

test("EVENTS_API_URL 이 비어 있으면 모으지도 보내지도 않는다", () => {
  const b = browser();
  b.ctx.birdmapUsage.track("route_toggle");
  b.ctx.birdmapUsage.flush();
  b.fire("window:pagehide");
  assert.equal(b.calls.beacon.length + b.calls.fetch.length, 0);
});

test("방문 중에는 보내지 않고, 숨김·종료 때 합계를 한 번에 보낸다", () => {
  const b = browser();
  b.ctx.EVENTS_API_URL = URL_;
  const u = b.ctx.birdmapUsage;
  u.track("route_toggle"); u.track("route_toggle");
  u.track("birdsite_popup_open", { site_id: 19, source: "marker" });
  u.track("search_use", { result_count: u.bucket(3) });
  assert.equal(b.calls.beacon.length, 0, "클릭마다 보내지 않는다");
  b.ctx.document.visibilityState = "hidden";
  b.fire("document:visibilitychange");
  assert.equal(b.calls.beacon.length, 1);
  assert.equal(b.calls.beacon[0].url, URL_);
  assert.equal(typeof b.calls.beacon[0].body, "string", "문자열 본문(text/plain) → preflight 없음");
  assert.deepEqual(b.sent()[0], { events: [
    { event: "route_toggle", n: 2 },
    { event: "birdsite_popup_open", site_id: "19", source: "marker", n: 1 },
    { event: "search_use", result_count: "2_5", n: 1 },
  ] });
  b.fire("window:pagehide"); // 이미 보냈으므로 빈 전송은 없다
  assert.equal(b.calls.beacon.length, 1);
});

test("허용 필드만 나가고 좌표·검색어·이름 등은 버려진다", () => {
  const b = browser();
  b.ctx.EVENTS_API_URL = URL_;
  b.ctx.birdmapUsage.track("birdsite_popup_open", { site_id: "19", lat: 36.1, lon: 126.6, q: "유부도", reporter: "홍길동", url: "https://x", source: "search" });
  b.ctx.birdmapUsage.flush();
  const body = b.calls.beacon[0].body;
  assert.deepEqual(JSON.parse(body).events[0], { event: "birdsite_popup_open", site_id: "19", source: "search", n: 1 });
  for (const banned of ["36.1", "126.6", "유부도", "홍길동", "https://x"]) assert.ok(!body.includes(banned), banned);
});

test("조합 20개·조합당 50회까지만 모은다(메모리·본문 상한)", () => {
  const b = browser();
  b.ctx.EVENTS_API_URL = URL_;
  const u = b.ctx.birdmapUsage;
  for (let i = 0; i < 30; i++) u.track("weekly_recommendation_click", { site_id: String(i + 1) });
  for (let i = 0; i < 80; i++) u.track("weekly_recommendation_click", { site_id: "1" });
  u.flush();
  const events = b.sent()[0].events;
  assert.equal(events.length, 20);
  assert.equal(events[0].n, 50);
});

test("sendBeacon 이 실패·예외면 fetch 로 한 번만 보내고, 그마저 실패해도 조용하며 재시도하지 않는다", async () => {
  for (const beacon of [() => false, () => { throw new Error("blocked"); }]) {
    const b = browser({ beacon, fetchImpl: () => Promise.reject(new Error("offline")) });
    b.ctx.EVENTS_API_URL = URL_;
    b.ctx.birdmapUsage.track("route_toggle");
    assert.doesNotThrow(() => b.ctx.birdmapUsage.flush());
    await new Promise((r) => setImmediate(r));
    assert.equal(b.calls.fetch.length, 1);
    assert.equal(b.calls.fetch[0].init.keepalive, true);
    assert.equal(b.calls.fetch[0].init.credentials, "omit");
    b.ctx.birdmapUsage.flush();
    assert.equal(b.calls.fetch.length, 1, "실패분을 다시 보내지 않는다");
  }
});

test("sendBeacon·fetch 가 아예 없거나 fetch 가 즉시 예외여도 지도 코드로 예외가 번지지 않는다", () => {
  const none = browser({ withBeacon: false, withFetch: false });
  none.ctx.EVENTS_API_URL = URL_;
  none.ctx.birdmapUsage.track("route_toggle");
  assert.doesNotThrow(() => none.ctx.birdmapUsage.flush());
  const throwing = browser({ withBeacon: false, fetchImpl: () => { throw new Error("sync"); } });
  throwing.ctx.EVENTS_API_URL = URL_;
  throwing.ctx.birdmapUsage.track("route_toggle");
  assert.doesNotThrow(() => throwing.ctx.birdmapUsage.flush());
  // 지도 객체가 없는 상태의 load 처리도 삼킨다.
  assert.doesNotThrow(() => none.fire("window:load"));
});

test("클릭 처리: 열린 경우만 세고, 외부 링크는 종류만, 처리 중 예외는 삼킨다", () => {
  const b = browser();
  b.ctx.EVENTS_API_URL = URL_;
  const btn = (pressed) => ({ getAttribute: () => pressed });
  b.click({ "#reportToggleBtn": btn("true") });
  b.click({ "#reportToggleBtn": btn("false") });            // 제보 모드를 끄는 클릭은 세지 않음
  b.elements.noticePanel = { style: { display: "none" } };
  b.click({ "#noticeToggleBtn": {} });                        // 닫힘
  b.elements.todayPanel = { style: { display: "block" } };
  b.click({ "#todayToggleBtn": {} });                         // 열림
  b.click({ "#routeToggleBtn": {} });
  b.click({ "a[href]": { href: "https://map.kakao.com/link/map/x,1,2", closest: () => null } });
  b.click({ "a[href]": { href: "https://wooil1964.github.io/birdmap/share/19/", closest: () => null } }); // 내부 링크 제외
  b.click({ "a[href]": { href: "https://example.org/", closest: () => null } });
  assert.doesNotThrow(() => b.click({ "#reportToggleBtn": { getAttribute: () => { throw new Error("x"); } } }));
  b.ctx.birdmapUsage.flush();
  assert.deepEqual(b.sent()[0].events, [
    { event: "report_button_click", n: 1 }, { event: "weekly_panel_open", n: 1 }, { event: "route_toggle", n: 1 },
    { event: "external_link_click", link_type: "kakao", n: 1 }, { event: "external_link_click", link_type: "other", n: 1 },
  ]);
  const t = b.ctx.birdmapUsage.linkType;
  assert.deepEqual(["https://map.naver.com/p", "https://www.windy.com/?1", "https://ebird.org/hotspot/L1", "https://island.theksa.co.kr/", "javascript:void(0)"].map(t), ["naver", "windy", "ebird", "ksa", ""]);
});

test("검색 결과 구간", () => {
  const u = browser().ctx.birdmapUsage;
  assert.deepEqual([0, 1, 2, 5, 6, 190].map(u.bucket), ["0", "1", "2_5", "2_5", "6_plus", "6_plus"]);
});
