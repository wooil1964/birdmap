import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCoordinate,
  normalizeObservedOn,
  normalizeSpecies,
  publicSpots,
  parseAdminEmails,
  validateReport,
} from "../src/shared.js";
import { yesterdayKst } from "./helpers.mjs";

const NOW = new Date("2026-09-20T03:00:00Z"); // 2026-09-20 12:00 KST

test("종명을 쉼표·가운뎃점으로 나누고 중복을 없앤다", () => {
  assert.deepEqual(normalizeSpecies("동박새, 큰유리새 · 동박새"), [
    "동박새",
    "큰유리새",
  ]);
});

test("빈 출현종은 거부한다", () => {
  assert.throws(() => normalizeSpecies("   "), { code: "SPECIES_REQUIRED" });
});

test("종명에 태그 문자를 넣을 수 없다", () => {
  assert.throws(() => normalizeSpecies("<img src=x onerror=alert(1)>"), {
    code: "SPECIES_INVALID",
  });
  assert.throws(() => normalizeSpecies("동박새<script>"), {
    code: "SPECIES_INVALID",
  });
});

test("종명 개수와 길이에 상한이 있다", () => {
  assert.throws(() => normalizeSpecies(Array(11).fill("동박새아").join(",")), {
    code: "SPECIES_TOO_MANY",
  });
  assert.throws(() => normalizeSpecies("가".repeat(31)), {
    code: "SPECIES_INVALID",
  });
});

test("국내 범위를 벗어난 좌표를 거부한다", () => {
  assert.deepEqual(normalizeCoordinate(37.5642583333, 126.8920861111), {
    lat: 37.564258,
    lon: 126.892086,
  });
  assert.throws(() => normalizeCoordinate(51.5, -0.12), {
    code: "COORDINATE_OUT_OF_RANGE",
  });
  assert.throws(() => normalizeCoordinate("어디쯤", 126.9), {
    code: "COORDINATE_REQUIRED",
  });
});

test("관찰 날짜는 형식·미래·오래된 값을 검사한다", () => {
  assert.equal(normalizeObservedOn("2026-09-19", NOW), "2026-09-19");
  assert.throws(() => normalizeObservedOn("2026-9-19", NOW), {
    code: "OBSERVED_ON_REQUIRED",
  });
  assert.throws(() => normalizeObservedOn("2026-02-30", NOW), {
    code: "OBSERVED_ON_INVALID",
  });
  assert.throws(() => normalizeObservedOn("2026-09-21", NOW), {
    code: "OBSERVED_ON_FUTURE",
  });
  assert.throws(() => normalizeObservedOn("2020-01-01", NOW), {
    code: "OBSERVED_ON_TOO_OLD",
  });
});

test("선택 항목의 길이와 태그 문자를 검사한다", () => {
  assert.throws(
    () => validateReport({ species: "동박새", lat: 37.5, lon: 126.9, observedOn: yesterdayKst(), note: "가".repeat(501) }),
    { code: "TEXT_TOO_LONG" },
  );
  assert.throws(
    () => validateReport({ species: "동박새", lat: 37.5, lon: 126.9, observedOn: yesterdayKst(), reporter: "<b>" }),
    { code: "TEXT_INVALID" },
  );
  assert.throws(
    () => validateReport({ species: "동박새", lat: 37.5, lon: 126.9, observedOn: yesterdayKst(), birdCount: 0 }),
    { code: "COUNT_INVALID" },
  );
});

test("정상 제보를 저장 가능한 형태로 바꾼다", () => {
  const report = validateReport(
    {
      species: "큰덤불해오라기 · 붉은등때까치",
      lat: 37.5632527778,
      lon: 126.8969333333,
      observedOn: "2026-09-19",
      birdCount: 2,
      reporter: "홍길동",
      note: "갈대밭 가장자리",
    },
    NOW,
  );
  assert.deepEqual(report.species, ["큰덤불해오라기", "붉은등때까치"]);
  assert.equal(report.speciesText, "큰덤불해오라기 · 붉은등때까치");
  assert.equal(report.lat, 37.563253);
  assert.equal(report.birdCount, 2);
});

test("공개 출력에는 종과 좌표만 담기고 개인정보는 빠진다", () => {
  const spots = publicSpots([
    {
      id: "a",
      species: "동박새 · 쇠솔새",
      lat: 37.1,
      lon: 127.1,
      public_lat: 37.2,
      public_lon: 127.2,
      reporter: "홍길동",
      note: "설명",
      observed_on: "2026-09-19",
      bird_count: 3,
      admin_note: "메모",
      ip_hash: "hash",
    },
  ]);
  assert.deepEqual(spots, [
    { id: "a", lat: 37.2, lon: 127.2, species: ["동박새", "쇠솔새"] },
  ]);
  const serialized = JSON.stringify(spots);
  for (const leak of ["홍길동", "설명", "2026-09-19", "메모", "hash"]) {
    assert.equal(serialized.includes(leak), false, leak);
  }
});

test("공개 좌표가 없으면 실제 좌표를 쓴다", () => {
  const spots = publicSpots([
    { id: "b", species: "개개비", lat: 37.3, lon: 127.3, public_lat: null, public_lon: null },
  ]);
  assert.deepEqual(spots[0], { id: "b", lat: 37.3, lon: 127.3, species: ["개개비"] });
});

test("관리자 이메일 목록을 정규화한다", () => {
  assert.deepEqual(parseAdminEmails(" A@b.com , c@d.com ,"), [
    "a@b.com",
    "c@d.com",
  ]);
  assert.deepEqual(parseAdminEmails(""), []);
});
