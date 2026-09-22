// 관리자 승인 화면의 탐조 지역 선택 목록 검증.
// 화면에 들어가는 원본(SITE_PICKER_JS)을 그대로 평가해서 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { SITE_PICKER_JS } from "../src/site-picker.js";
import { ADMIN_PAGE } from "../src/admin-page.js";

// 실제 서비스 파일. 탐조지 정본이라 여기서 읽어 검증한다.
const INDEX_HTML = fileURLToPath(new URL("../../index.html", import.meta.url));

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
    "\nreturn {siteRegion,haversineKm,nearestSites,siteOptionsHtml,parseSiteData,siteDataArrays," +
    "siteChoiceLabel,sitePickText};";
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

// --- siteData 파싱: 뒤에 이어 붙는 concat 블록 누락 방지 ---

test("최초 선언과 concat 블록의 탐조지를 모두 읽는다", () => {
  const { parseSiteData } = picker();
  const text = [
    "var junk=1;",
    'var siteData=[{"id":"1","name":"어청도"},{"id":"2","name":"외연도"}];',
    "var between=2;",
    "siteData=siteData.concat([",
    '  {"id":"189","name":"도구해수욕장"},',
    '  {"id":"190","name":"임곡항"}',
    "]);",
    // 앞으로 블록이 더 늘어도 자동으로 따라와야 한다.
    "siteData = siteData.concat([",
    '  {"id":"196","name":"새로 추가된 곳"}',
    "]);",
  ].join("\n");
  const sites = parseSiteData(text);
  assert.deepEqual(sites.map((s) => s.id), ["1", "2", "189", "190", "196"]);
});

test("문자열 안의 대괄호를 배열 끝으로 착각하지 않는다", () => {
  const { parseSiteData } = picker();
  const text =
    'var siteData=[{"id":"1","name":"어청도","note":"괄호 ] 와 [ 가 든 설명"}];\n' +
    "siteData=siteData.concat([\n" +
    '  {"id":"190","name":"임곡항","note":"따옴표 \\" 와 대괄호 ] 포함"}\n' +
    "]);";
  const sites = parseSiteData(text);
  assert.deepEqual(sites.map((s) => s.id), ["1", "190"]);
  assert.equal(sites[1].name, "임곡항");
});

test("concat 블록이 없어도 최초 배열만으로 동작한다", () => {
  const { parseSiteData } = picker();
  const sites = parseSiteData('var siteData=[{"id":"1","name":"어청도"}];');
  assert.deepEqual(sites.map((s) => s.id), ["1"]);
});

test("siteData 가 없는 문서에서는 빈 배열을 돌려준다", () => {
  const { parseSiteData } = picker();
  assert.deepEqual(parseSiteData("<html>탐조지 목록이 없는 문서</html>"), []);
});

test("같은 id 가 다시 나와도 한 번만 넣는다", () => {
  const { parseSiteData } = picker();
  const text =
    'var siteData=[{"id":"1","name":"어청도"}];\n' +
    'siteData=siteData.concat([{"id":"1","name":"어청도 중복"}]);';
  const sites = parseSiteData(text);
  assert.deepEqual(sites.map((s) => s.id), ["1"]);
  assert.equal(sites[0].name, "어청도");
});

// --- 실제 index.html 대조: 이 검증이 이번 결함의 재발을 막는다 ---

test("실제 index.html 의 탐조지를 빠짐없이 읽는다 (임곡항 190 포함)", () => {
  const { parseSiteData } = picker();
  const text = fs.readFileSync(INDEX_HTML, "utf8");
  const sites = parseSiteData(text);

  // 최초 배열만 읽던 예전 방식과 비교해 실제로 더 읽는지 확인한다.
  const firstLine = text.split("\n").find((r) => r.indexOf("var siteData=") === 0);
  const firstOnly = JSON.parse(firstLine.replace(/^var siteData=/, "").replace(/;\s*$/, ""));
  assert.ok(
    sites.length > firstOnly.length,
    `concat 으로 더해진 탐조지를 읽지 못했다 (${sites.length} vs ${firstOnly.length})`,
  );

  const ids = sites.map((s) => String(s.id));
  assert.equal(new Set(ids).size, ids.length, "탐조지 id 가 중복됐다");

  const imgok = sites.find((s) => String(s.id) === "190");
  assert.ok(imgok, "임곡항(190)을 찾지 못했다");
  assert.equal(imgok.name, "임곡항");
  assert.equal(imgok.region, "경북 포항");
  assert.equal(typeof imgok.lat, "number");
  assert.equal(typeof imgok.lon, "number");

  // concat 블록에 든 나머지 탐조지도 모두 들어와야 한다.
  for (const id of ["189", "190", "191", "192", "193", "194", "195"]) {
    assert.ok(ids.includes(id), `concat 블록의 탐조지 ${id} 가 빠졌다`);
  }
});

test("실제 index.html 로 만든 목록에서 임곡항이 검색된다", () => {
  const { parseSiteData } = picker();
  const text = fs.readFileSync(INDEX_HTML, "utf8");
  const siteList = parseSiteData(text).map((site) => ({
    id: String(site.id), name: site.name, region: site.region || "",
    sido: site.sido || "", sigungu: site.sigungu || "", lat: site.lat, lon: site.lon,
  }));
  const { siteOptionsHtml } = picker(siteList);

  const byName = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "임곡", ""))
    .filter((o) => o.value);
  assert.deepEqual(byName.map((o) => o.value), ["190"]);
  assert.equal(byName[0].label, "임곡항 — 경북 포항");

  // 행정구역으로도 걸려야 한다.
  const byRegion = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "포항", ""))
    .filter((o) => o.value);
  assert.ok(byRegion.some((o) => o.value === "190"));

  // 검색어가 없을 때 전체 목록에도 들어 있어야 한다.
  const all = options(siteOptionsHtml({ lat: 36, lon: 126.7 }, "", "")).filter((o) => o.value);
  assert.ok(all.some((o) => o.value === "190"));
});

test("임곡항 근처에서 제보하면 임곡항이 가까운 탐조지로 뜬다", () => {
  const { parseSiteData } = picker();
  const text = fs.readFileSync(INDEX_HTML, "utf8");
  const siteList = parseSiteData(text).map((site) => ({
    id: String(site.id), name: site.name, region: site.region || "",
    sido: site.sido || "", sigungu: site.sigungu || "", lat: site.lat, lon: site.lon,
  }));
  const imgok = siteList.find((s) => s.id === "190");
  const { nearestSites } = picker(siteList);
  const near = nearestSites({ lat: imgok.lat + 0.002, lon: imgok.lon + 0.002 }, 5);
  assert.equal(near[0].site.id, "190");
  assert.ok(near[0].km < 1, `거리가 너무 멀다: ${near[0].km}`);
});

// --- 선택된 탐조지역 표시 ---

test("고른 탐조지를 이름과 행정구역으로 보여 준다", () => {
  const { siteChoiceLabel } = picker();
  assert.equal(siteChoiceLabel("19"), "유부도 — 충남 서천");
  assert.equal(siteChoiceLabel(19), "유부도 — 충남 서천");
  assert.equal(siteChoiceLabel(""), "");
  assert.equal(siteChoiceLabel("없는id"), "");
});

test("저장된 값과 같으면 저장됨, 다르면 저장 전으로 표시한다", () => {
  const { sitePickText } = picker();
  const saved = sitePickText("19", "19");
  assert.match(saved, /선택된 탐조지역: <b>유부도 — 충남 서천<\/b>/);
  assert.match(saved, /pickSaved/);
  assert.ok(!/pickDirty/.test(saved));

  const dirty = sitePickText("107", "19");
  assert.match(dirty, /선택된 탐조지역: <b>매향리 — 경기 화성<\/b>/);
  assert.match(dirty, /pickDirty/);
  assert.ok(!/pickSaved/.test(dirty));
});

test("아무것도 고르지 않은 상태를 문구로 알린다", () => {
  const { sitePickText } = picker();
  assert.match(sitePickText("", ""), /지정하지 않음\(독립 출현 지점\)/);
  assert.match(sitePickText("", ""), /pickSaved/);
  // 연결을 풀었지만 아직 저장하지 않은 상태.
  assert.match(sitePickText("", "19"), /pickDirty/);
});

test("목록에 없는 ID 는 번호라도 보여 준다", () => {
  const { sitePickText } = picker();
  assert.match(sitePickText("999", "999"), /<b>999<\/b>/);
});

test("선택 표시에 들어가는 이름도 이스케이프된다", () => {
  const { sitePickText } = picker([
    { id: "1", name: '<img src=x>', region: "전북 군산", sido: "전북", sigungu: "군산", lat: 36, lon: 126 },
  ]);
  const html = sitePickText("1", "1");
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("실제 index.html 기준으로 임곡항 선택 표시가 만들어진다", () => {
  const { parseSiteData } = picker();
  const siteList = parseSiteData(fs.readFileSync(INDEX_HTML, "utf8")).map((s) => ({
    id: String(s.id), name: s.name, region: s.region || "",
    sido: s.sido || "", sigungu: s.sigungu || "", lat: s.lat, lon: s.lon,
  }));
  const { sitePickText, siteChoiceLabel } = picker(siteList);
  assert.equal(siteChoiceLabel("190"), "임곡항 — 경북 포항");
  assert.match(sitePickText("190", ""), /선택된 탐조지역: <b>임곡항 — 경북 포항<\/b>/);
  assert.match(sitePickText("190", ""), /pickDirty/);
  assert.match(sitePickText("190", "190"), /pickSaved/);
});

test("승인 화면에 선택 표시 영역과 갱신 코드가 들어 있다", () => {
  assert.ok(ADMIN_PAGE.includes('class="sitePick"'));
  assert.ok(ADMIN_PAGE.includes("function refreshSitePick("));
  // 마우스 클릭·키보드 선택 모두 change 로 잡는다.
  assert.ok(ADMIN_PAGE.includes("addEventListener('change'"));
  // 저장 결과 문구.
  assert.ok(ADMIN_PAGE.includes("탐조 지역을 저장했습니다"));
});

test("승인 화면에 탐조 지역 검색창과 목록 코드가 들어 있다", () => {
  assert.ok(ADMIN_PAGE.includes("f-siteq"));
  assert.ok(ADMIN_PAGE.includes("function siteOptionsHtml("));
  // 기존 승인 동작은 그대로 f-site 의 값(탐조지 ID)을 읽는다.
  assert.ok(ADMIN_PAGE.includes("card.querySelector('.f-site')"));
});
