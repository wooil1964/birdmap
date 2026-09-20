import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCoordinate,
  normalizeObservedOn,
  normalizeSpecies,
  publicPayload,
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

test("공개 출력에는 비공개 항목이 빠지고 공개 좌표가 쓰인다", () => {
  const { spots } = publicPayload([
    {
      id: "a",
      species: "동박새 · 쇠솔새",
      lat: 37.1,
      lon: 127.1,
      public_lat: 37.2,
      public_lon: 127.2,
      observed_on: "2026-09-19",
      reporter: "홍길동",
      name_public: 0,
      note: "설명",
      bird_count: 3,
      admin_note: "메모",
      ip_hash: "hash",
      spot_key: null,
    },
  ]);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].lat, 37.2);
  assert.equal(spots[0].lon, 127.2);
  assert.deepEqual(spots[0].species, ["동박새", "쇠솔새"]);
  // 관찰일은 이력에 들어가지만 이름·설명·메모·IP 해시·개체수는 어디에도 없다.
  assert.equal(spots[0].history[0].date, "2026-09-19");
  assert.equal("reporter" in spots[0].history[0], false);
  const serialized = JSON.stringify(spots);
  for (const leak of ["홍길동", "설명", "메모", "hash", "\"bird_count\""]) {
    assert.equal(serialized.includes(leak), false, leak);
  }
});

test("공개 좌표가 없으면 실제 좌표를 쓴다", () => {
  const { spots } = publicPayload([
    { id: "b", species: "개개비", lat: 37.3, lon: 127.3, public_lat: null, public_lon: null, observed_on: "2026-09-19", spot_key: null },
  ]);
  assert.equal(spots[0].lat, 37.3);
  assert.equal(spots[0].lon, 127.3);
});

test("이름 공개에 동의한 제보만 제보자 이름을 내보낸다", () => {
  const rows = [
    { id: "y", species: "큰노랑발도요", lat: 35.4, lon: 126.5, observed_on: "2026-09-13", reporter: "홍길동", name_public: 1, spot_key: null },
    { id: "n", species: "큰노랑발도요", lat: 35.4, lon: 126.5, observed_on: "2026-03-15", reporter: "김철수", name_public: 0, spot_key: "y" },
  ];
  const { spots } = publicPayload(rows);
  const history = spots[0].history;
  assert.equal(history.length, 2);
  // 최근 관찰일이 먼저 온다.
  assert.equal(history[0].date, "2026-09-13");
  assert.equal(history[0].reporter, "홍길동");
  // 동의하지 않은 제보는 이름 필드 자체가 없다(화면에서 익명 제보로 표시된다).
  assert.equal(history[1].date, "2026-03-15");
  assert.equal("reporter" in history[1], false);
  assert.equal(JSON.stringify(spots).includes("김철수"), false);
});

test("같은 종이 다른 날짜로 제보되면 두 건이 모두 남는다", () => {
  const rows = [
    { id: "a", species: "큰노랑발도요", lat: 35.4, lon: 126.5, observed_on: "2026-09-13", name_public: 0, spot_key: null },
    { id: "b", species: "큰노랑발도요", lat: 35.4, lon: 126.5, observed_on: "2026-03-15", name_public: 0, spot_key: "a" },
  ];
  const { spots } = publicPayload(rows);
  assert.equal(spots.length, 1);
  assert.deepEqual(spots[0].history.map((h) => h.date), ["2026-09-13", "2026-03-15"]);
  assert.deepEqual(spots[0].history.map((h) => h.id), ["a", "b"]);
});

test("지점에 연결해도 기존 종은 남고 새 종만 더해진다", () => {
  const rows = [
    { id: "base", species: "동박새 · 큰유리새", lat: 37.5, lon: 126.9, observed_on: "2026-05-01", name_public: 0, spot_key: null },
    { id: "add", species: "쇠솔새 · 동박새", lat: 37.5, lon: 126.9, observed_on: "2026-05-02", name_public: 0, spot_key: "base" },
  ];
  const { spots } = publicPayload(rows);
  assert.equal(spots.length, 1, "연결된 제보는 자기 점을 갖지 않는다");
  assert.deepEqual(spots[0].species, ["동박새", "큰유리새", "쇠솔새"]);
  assert.equal(spots[0].history.length, 2);
});

test("수동 붉은 점에 붙인 이력은 fixedSpots 로 따로 나간다", () => {
  const { spots, fixedSpots } = publicPayload([
    { id: "r1", species: "꺅도요", lat: 35.85, lon: 126.67, observed_on: "2026-09-20", reporter: "관찰자", name_public: 1, spot_key: "fixed:21:0" },
  ]);
  assert.deepEqual(spots, [], "연결된 제보는 새 점을 만들지 않는다");
  assert.equal(fixedSpots["fixed:21:0"].history.length, 1);
  assert.equal(fixedSpots["fixed:21:0"].history[0].reporter, "관찰자");
  assert.deepEqual(fixedSpots["fixed:21:0"].history[0].species, ["꺅도요"]);
});

test("관리자 이메일 목록을 정규화한다", () => {
  assert.deepEqual(parseAdminEmails(" A@b.com , c@d.com ,"), [
    "a@b.com",
    "c@d.com",
  ]);
  assert.deepEqual(parseAdminEmails(""), []);
});
