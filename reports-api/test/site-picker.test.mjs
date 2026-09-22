// 관리자 승인 화면의 탐조 지역 선택 목록 검증.
// 화면에 들어가는 원본(SITE_PICKER_JS)을 그대로 평가해서 확인한다.
import assert from "node:assert/strict";
import test from "node:test";

import { SITE_PICKER_JS } from "../src/site-picker.js";
import { ADMIN_PAGE } from "../src/admin-page.js";

// 화면과 같은 이스케이프 함수. 목록 문자열이 그대로 HTML 로 들어가므로 같이 검증한다.
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

// index.html 의 siteData 에서 가져오는 필드만 흉내 낸다(실제 값).
const SITES = [
  { id: "1", name: "어청도", region: "전북 군산", sido: "전북", sigungu: "군산", lat: 36.1197, lon: 125.9796 },
  { id: "14", name: "걸매리", region: "충남 아산·당진", sido: "충남", sigungu: "아산·당진", lat: 36.9, lon: 126.8 },
  { id: "19", name: "유부도", region: "충남 서천", sido: "충남", sigungu: "서천", lat: 36.0, lon: 126.68 },
  { id: "107", name: "매향리", region: "경기 화성", sido: "경기", sigungu: "화성", lat: 37.06, lon: 126.72 },
  { id: "150", name: "주남저수지", region: "경남 창원", sido: "경남", sigungu: "창원", lat: 35.31, lon: 128.68 },
  { id: "160", name: "순천만", region: "전남 순천", sido: "전남", sigungu: "순천", lat: 34.88, lon: 127.51 },
  { id: "171", name: "천수만", region: "충남 서산", sido: "충남", sigungu: "서산", lat: 36.55, lon: 126.45 },
  // 좌표가 없는 탐조지: 거리 계산에서는 빠지고 검색으로는 찾을 수 있어야 한다.
  { id: "900", name: "좌표없는곳", region: "강원 인제", sido: "강원", sigungu: "인제", lat: null, lon: null },
];

function picker(siteList = SITES) {
  const body =
    SITE_PICKER_JS +
    "\nreturn {siteRegion,haversineKm,nearestSites,siteOptionsHtml};";
  return new Function("esc", "siteList", body)(esc, siteList);
}

// <option value="19" selected>유부도 — 충남 서천 · 약 3.2km</option> 를 뜯어 본다.
function options(html) {
  return [...html.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(
    (m) => ({ value: m[1], selected: / selected/.test(m[2]), label: m[3] }),
  );
}

function groupNames(html) {
  return [...html.matchAll(/<optgroup label="([^"]*)"/g)].map((m) => m[1]);
}

test("탐조지명과 시·군·구를 함께 보여 준다", () => {
  const { siteOptionsHtml } = picker();
  const list = options(siteOptionsHtml({ lat: 36.0, lon: 126.7 }, "", ""));
  const yubudo = list.find((o) => o.value === "19");
  assert.equal(yubudo.label, "유부도 — 충남 서천 · 약 1.8km");
  // ID 는 연결용 value 로만 남고 화면 문구에는 나오지 않는다.
  assert.ok(!/(^|\s)19(\s|·)/.test(yubudo.label));
});

test("탐조지 이름 일부로 검색된다", () => {
  const { siteOptionsHtml } = picker();
  const list = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "유부", ""));
  assert.deepEqual(list.filter((o) => o.value).map((o) => o.value), ["19"]);
});

test("행정구역으로도 검색된다", () => {
  const { siteOptionsHtml } = picker();
  const bySido = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "충남", ""));
  assert.deepEqual(bySido.filter((o) => o.value).map((o) => o.value), ["14", "19", "171"]);
  const bySigungu = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "화성", ""));
  assert.deepEqual(bySigungu.filter((o) => o.value).map((o) => o.value), ["107"]);
});

test("검색 결과가 없으면 안내 문구를 보여 준다", () => {
  const { siteOptionsHtml } = picker();
  const html = siteOptionsHtml({ lat: 36, lon: 126.7 }, "없는지명", "");
  assert.match(html, /검색 결과가 없습니다/);
  assert.equal(options(html).filter((o) => o.value).length, 0);
});

test("검색어를 지우면 전체 목록이 다시 나온다", () => {
  const { siteOptionsHtml } = picker();
  const html = siteOptionsHtml({ lat: 36, lon: 126.7 }, "  ", "");
  const ids = new Set(options(html).filter((o) => o.value).map((o) => o.value));
  assert.equal(ids.size, SITES.length);
});

test("제보 실제 좌표에서 가까운 탐조지 5곳을 위에 두고 거리를 km 로 적는다", () => {
  const { siteOptionsHtml } = picker();
  // 유부도 바로 옆 좌표.
  const html = siteOptionsHtml({ lat: 36.01, lon: 126.69 }, "", "");
  assert.deepEqual(groupNames(html), ["제보 위치에서 가까운 탐조지", "전체 탐조지"]);
  const near = html.split("</optgroup>")[0];
  const list = options(near).filter((o) => o.value);
  assert.equal(list.length, 5);
  assert.equal(list[0].value, "19");
  assert.ok(list.every((o) => / · 약 \d+\.\d㎞?km$/.test(o.label) || / · 약 \d+\.\dkm$/.test(o.label)));
  // 거리는 오름차순이어야 한다.
  const km = list.map((o) => Number(/약 ([\d.]+)km/.exec(o.label)[1]));
  assert.deepEqual(km, [...km].sort((a, b) => a - b));
  // 가까운 목록에 나온 탐조지는 전체 목록에서 중복되지 않는다.
  const all = options(html).filter((o) => o.value);
  assert.equal(new Set(all.map((o) => o.value)).size, all.length);
});

test("좌표가 없는 탐조지는 거리 계산에서 빠지고 검색으로는 찾을 수 있다", () => {
  const { nearestSites, siteOptionsHtml } = picker();
  const near = nearestSites({ lat: 36.01, lon: 126.69 }, 99);
  assert.ok(!near.some((hit) => hit.site.id === "900"));
  assert.equal(near.length, SITES.length - 1);
  const found = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "인제", ""));
  assert.deepEqual(found.filter((o) => o.value).map((o) => o.value), ["900"]);
});

test("제보 좌표가 없으면 거리 순 없이 전체 목록만 보여 준다", () => {
  const { siteOptionsHtml } = picker();
  const html = siteOptionsHtml({ lat: null, lon: null }, "", "");
  assert.deepEqual(groupNames(html), ["전체 탐조지"]);
  assert.equal(options(html).filter((o) => o.value).length, SITES.length);
});

test("이미 고른 탐조지는 검색 결과에서 밀려나도 목록에 남는다", () => {
  const { siteOptionsHtml } = picker();
  const html = siteOptionsHtml({ lat: 36, lon: 126.7 }, "순천", "19");
  assert.ok(groupNames(html).includes("현재 선택"));
  const selected = options(html).filter((o) => o.selected);
  assert.deepEqual(selected.map((o) => o.value), ["19"]);
});

test("선택된 탐조지 ID 가 option 의 value 로 그대로 유지된다", () => {
  const { siteOptionsHtml } = picker();
  const html = siteOptionsHtml({ lat: 36.01, lon: 126.69 }, "", "107");
  const selected = options(html).filter((o) => o.selected);
  assert.ok(selected.length >= 1);
  assert.ok(selected.every((o) => o.value === "107"));
});

test("탐조지 이름에 든 꺾쇠 문자는 이스케이프된다", () => {
  const { siteOptionsHtml } = picker([
    { id: "1", name: '<img src=x onerror="alert(1)">', region: "전북 군산", sido: "전북", sigungu: "군산", lat: 36, lon: 126 },
  ]);
  const html = siteOptionsHtml({ lat: 36, lon: 126 }, "", "");
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("거리 계산이 index.html 의 haversineKm 과 같은 값을 낸다", () => {
  const { haversineKm } = picker();
  // 유부도-매향리 실측 대조값(약 118km).
  const km = haversineKm({ lat: 36.0, lon: 126.68 }, { lat: 37.06, lon: 126.72 });
  assert.ok(Math.abs(km - 118) < 2, "got " + km);
  assert.equal(haversineKm({ lat: 36, lon: 126 }, { lat: 36, lon: 126 }), 0);
});

test("승인 화면에 탐조 지역 검색창과 목록 코드가 들어 있다", () => {
  assert.ok(ADMIN_PAGE.includes("f-siteq"));
  assert.ok(ADMIN_PAGE.includes("function siteOptionsHtml("));
  // 기존 승인 동작은 그대로 f-site 의 값(탐조지 ID)을 읽는다.
  assert.ok(ADMIN_PAGE.includes("card.querySelector('.f-site')"));
});
