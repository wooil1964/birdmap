import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/public.js";
import { isSensitiveReport, normalizeSpecies, splitSpecies, SENSITIVE_SPECIES, SENSITIVE_KEYWORDS, kstDateString } from "../src/shared.js";
import { ORIGIN, fakeDb, publicEnv } from "./helpers.mjs";

const sensitive = (names, note = "") => isSensitiveReport({ note, speciesText: names.join(" · "), species: names });

test("S1-R 기존 보호종 19종·번식 6개 표현은 그대로다", () => {
  assert.equal(SENSITIVE_SPECIES.length, 19);
  assert.deepEqual(SENSITIVE_KEYWORDS, ["둥지", "번식", "포란", "육추", "새끼", "영소"]);
  for (const name of SENSITIVE_SPECIES) assert.equal(sensitive([name]), true, name);
  for (const word of SENSITIVE_KEYWORDS) assert.equal(sensitive(["참새"], `${word} 확인`), true, word);
});

test("S1-R 보호종 뒤에 명확한 수량이 붙어도 보호종이다", () => {
  for (const name of ["저어새1", "저어새 1", "저어새 2마리", "저어새 2 마리", "저어새3개체", "흰꼬리수리1", "매1", "참매 2", "노랑부리저어새12마리"]) {
    assert.equal(sensitive([name]), true, name);
  }
});

test("S1-R 구분자(쉼표·세미콜론·중점·줄바꿈·슬래시) 뒤섞인 일반종+보호종은 보호된다", () => {
  assert.equal(sensitive(["참새, 저어새1"]), true);
  assert.equal(sensitive(["참새; 저어새 2마리"]), true);
  assert.equal(sensitive(["참새 · 매1"]), true);
  assert.equal(sensitive(["참새\n저어새1"]), true);
  assert.equal(sensitive(["참새\r\n흰꼬리수리 1"]), true);
  assert.equal(sensitive(["참새/저어새"]), true); // 과거 저장 자료 읽기 방어
  assert.equal(isSensitiveReport({ note: "", speciesText: "참새 · 저어새1", species: splitSpecies("참새 · 저어새1") }), true);
});

test("S1-R 줄바꿈이 보호종과 일반종을 붙이지 않는다", () => {
  assert.deepEqual(normalizeSpecies("저어새\n흰뺨검둥오리"), ["저어새", "흰뺨검둥오리"]);
  assert.deepEqual(normalizeSpecies("저어새\r\n참새\r\n"), ["저어새", "참새"]);
  assert.equal(sensitive(normalizeSpecies("흰뺨검둥오리\n저어새1")), true);
});

test("S1-R 일반종은 보호종으로 오인하지 않는다", () => {
  for (const name of ["갈매기", "괭이갈매기", "알락오리", "알락할미새", "한국동박새", "동박새", "참새 3마리", "참새1", "쇠제비갈매기2", "붉은배새매", "새매", "매미새", "참매미", "올빼미과"]) {
    assert.equal(sensitive([name]), false, name);
  }
  assert.equal(sensitive(["갈매기 · 알락오리 · 동박새 5마리"]), false);
});

test("S1-R 최근 출현 집계에서 수량 붙은 보호종·줄바꿈 혼합 행은 통째로 빠진다", async () => {
  const ago = (d) => kstDateString(new Date(Date.now() - d * 86400000));
  const rows = [
    { id: "ok", status: "approved", site_id: "15", species: "참새", lat: 36, lon: 126, observed_on: ago(1) },
    ...["저어새1", "저어새 2마리", "흰꼬리수리1", "매1", "참새 · 저어새3", "참새/저어새"].map((species, i) => (
      { id: `p${i}`, status: "approved", site_id: "19", species, lat: 36, lon: 126, observed_on: ago(1) }
    )),
  ];
  const request = new Request("https://reports.example/reports/recent-sites", { method: "GET", headers: ORIGIN });
  const body = await (await handleRequest(request, publicEnv(fakeDb(rows)))).json();
  assert.deepEqual(body.sites.map((s) => s.siteId), ["15"]);
});
