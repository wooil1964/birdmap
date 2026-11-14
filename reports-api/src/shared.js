import { identifyBird, isListedBirdName } from './bird-names.js';
import { LEGAL_PROTECTED_NAMES, MAP_LOCATION_SENSITIVE } from './protected-birds.js';
import { OFFICIAL_BIRD_NAMES } from './official-bird-names.js';
// 공개 접수 Worker 와 관리자 Worker 가 함께 쓰는 검증·응답·인증 헬퍼.
// 기존 weather-proxy Worker 의 응답 형식(ok/error 봉투, Origin 허용 목록)을 그대로 따른다.

export const PRODUCTION_ORIGIN = "https://wooil1964.github.io";

// 제보 좌표 허용 범위(한반도와 부속 도서). 범위 밖 좌표는 오작동이거나 장난이다.
export const LAT_MIN = 33.0;
export const LAT_MAX = 39.0;
export const LON_MIN = 124.0;
export const LON_MAX = 132.0;

export const MAX_SPECIES = 10;
// 학명·영명(최대 33자)과 수량 표기를 담기 위해 30 → 40. 화면 입력칸 전체 제한(200자)은 그대로다.
export const MAX_SPECIES_LENGTH = 40;
export const MAX_REPORTER_LENGTH = 40;
export const MAX_NOTE_LENGTH = 500;
export const MAX_BIRD_COUNT = 100000;
// 관찰 날짜에 과거 방향 상한은 두지 않는다. 지도가 최근 출현만이 아니라
// 지난 탐조 자료도 쌓는 곳이라 2017년·2020년 관찰도 실제 날짜 그대로 등록한다.
// 미래 날짜와 없는 날짜는 계속 막는다(normalizeObservedOn 참조).

// 서버 측 제출 횟수 제한. 완전한 차단이 아니라 관리자가 검토할 양을 줄이는 장치다.
export const RATE_WINDOW_MINUTES = 10;
export const RATE_WINDOW_MAX = 5;
export const RATE_DAY_MAX = 20;

export class WorkerError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.status = status;
  }
}

/* ── 응답 ───────────────────────────────────────────────────────────── */

export function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (
    env?.ENVIRONMENT !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return origin;
  }
  return false;
}

export function responseHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonResponse(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(request, env), ...extra },
  });
}

// DB freeze gate (system_state trigger) rejected the write. Nothing was stored.
export function rethrowIfFrozen(error) {
  if (/reports_write_frozen/.test(String(error?.message))) {
    const frozen = new WorkerError("WRITE_MAINTENANCE", "제보 쓰기를 잠시 중지했습니다. 잠시 후 다시 시도해 주세요.", 503);
    frozen.retryAfter = 60;
    throw frozen;
  }
}

export function errorResponse(request, env, error) {
  try { rethrowIfFrozen(error); } catch (frozen) { error = frozen; }
  const known = error instanceof WorkerError;
  return jsonResponse(
    request,
    env,
    {
      ok: false,
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "Unexpected error",
      },
    },
    known ? error.status : 500,
    error?.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
  );
}

export function preflightResponse(request, env, methods) {
  return new Response(null, {
    status: 204,
    headers: {
      ...responseHeaders(request, env),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/* ── 시각 ───────────────────────────────────────────────────────────── */

export function kstDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

/* ── 입력 검증 ──────────────────────────────────────────────────────── */

// 제어문자를 지운다. 줄바꿈은 note 에서만 살린다.
function stripControl(text, keepNewline = false) {
  let out = "";
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    // C0 제어문자와 DEL 을 지운다. note 에서만 줄바꿈을 살린다.
    if (code < 32 || code === 127) {
      if (keepNewline && code === 10) out += character;
      continue;
    }
    out += character;
  }
  return out.trim();
}

const SPECIES_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9()'. -]+$/;
// 꺾쇠는 출력 단계에서 이스케이프하지만, 입력 단계에서도 함께 막는다(다중 방어).
const MARKUP_PATTERN = /[<>]/;


// A complete, unique parse of official Korean names only. Never split English/scientific
// names or salvage a prefix of an unknown token. Whitespace is required between birds.
export function splitOfficialSpecies(raw) {
  const text = String(raw ?? '').normalize('NFC').trim();
  if (!text || text.length > 1000) return null;
  const memo = new Map();
  function paths(at) {
    if (at === text.length) return [[]];
    if (memo.has(at)) return memo.get(at);
    const found = [];
    for (const name of OFFICIAL_BIRD_NAMES) {
      if (!text.startsWith(name, at)) continue;
      const tail = text.slice(at + name.length);
      const quantity = /^(?:\s*([1-9][0-9]{0,5})(?:\s*(?:마리|개체))?)?/.exec(tail)[0];
      if (quantity && Number(/\d+/.exec(quantity)?.[0]) > MAX_BIRD_COUNT) continue;
      const end = at + name.length + quantity.length;
      if (end < text.length && !/\s/.test(text[end])) continue;
      const next = end + (/^\s*/.exec(text.slice(end))[0].length);
      for (const rest of paths(next)) {
        found.push([text.slice(at, end).trim(), ...rest]);
        if (found.length > 1) { memo.set(at, found); return found; }
      }
    }
    memo.set(at, found); return found;
  }
  const result = paths(0);
  return result.length === 1 ? result[0] : null;
}

export function normalizeSpecies(raw) {
  // 줄바꿈은 제어문자로 지워지기 전에 구분자로 먼저 쓴다(그러지 않으면 앞뒤 종명이 붙어 버린다).
  const tokens = String(raw ?? "")
    .split(/[,;·\r\n]+/)
    .flatMap((part) => splitOfficialSpecies(part) || [part])
    .map((part) => stripControl(part))
    .filter(Boolean);
  if (!tokens.length) {
    throw new WorkerError("SPECIES_REQUIRED", "출현종을 입력해 주세요.", 400);
  }
  if (tokens.length > MAX_SPECIES) {
    throw new WorkerError(
      "SPECIES_TOO_MANY",
      `출현종은 한 번에 ${MAX_SPECIES}종까지 입력할 수 있습니다.`,
      400,
    );
  }
  const seen = [];
  for (const token of tokens) {
    if (token.length > MAX_SPECIES_LENGTH || !SPECIES_PATTERN.test(token)) {
      throw new WorkerError(
        "SPECIES_INVALID",
        `종명으로 쓸 수 없는 값입니다: ${token.slice(0, MAX_SPECIES_LENGTH)}`,
        400,
      );
    }
    // Repeated quantities must reach the ambiguity guard instead of being silently lost.
    if (!seen.includes(token) || /[0-9]/.test(token)) seen.push(token);
  }
  return seen;
}

function optionalText(raw, max, field, keepNewline) {
  if (raw === undefined || raw === null || raw === "") return null;
  const text = stripControl(raw, keepNewline);
  if (!text) return null;
  if (text.length > max) {
    throw new WorkerError(
      "TEXT_TOO_LONG",
      `${field}은(는) ${max}자까지 입력할 수 있습니다.`,
      400,
    );
  }
  if (MARKUP_PATTERN.test(text)) {
    throw new WorkerError(
      "TEXT_INVALID",
      `${field}에 < 또는 > 는 쓸 수 없습니다.`,
      400,
    );
  }
  return text;
}

export function normalizeCoordinate(rawLat, rawLon) {
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new WorkerError(
      "COORDINATE_REQUIRED",
      "지도에서 위치를 선택해 주세요.",
      400,
    );
  }
  if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) {
    throw new WorkerError(
      "COORDINATE_OUT_OF_RANGE",
      "국내 탐조 범위 밖의 좌표입니다.",
      400,
    );
  }
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

export function normalizeObservedOn(raw, now = new Date()) {
  const text = stripControl(raw ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new WorkerError(
      "OBSERVED_ON_REQUIRED",
      "관찰 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.",
      400,
    );
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || kstDateString(parsed) !== text) {
    throw new WorkerError("OBSERVED_ON_INVALID", "없는 날짜입니다.", 400);
  }
  const today = kstDateString(now);
  if (text > today) {
    throw new WorkerError(
      "OBSERVED_ON_FUTURE",
      "관찰 날짜는 오늘보다 뒤일 수 없습니다.",
      400,
    );
  }
  // 과거 방향 제한은 없다. 지난 탐조 자료를 실제 관찰 날짜 그대로 남기기 위해서다.
  // 접수 시각(received_at)은 따로 저장되므로 관찰일과 섞이지 않는다.
  return text;
}

function normalizeBirdCount(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_BIRD_COUNT) {
    throw new WorkerError(
      "COUNT_INVALID",
      `관찰 개체수는 1 이상 ${MAX_BIRD_COUNT} 이하의 정수여야 합니다.`,
      400,
    );
  }
  return value;
}

// 제보 본문을 저장 가능한 형태로 바꾼다. 하나라도 어긋나면 WorkerError 를 던진다.
export function validateReport(input, now = new Date()) {
  if (!input || typeof input !== "object") {
    throw new WorkerError("BODY_INVALID", "제보 내용을 읽을 수 없습니다.", 400);
  }
  const species = normalizeSpecies(input.species);
  const { lat, lon } = normalizeCoordinate(input.lat, input.lon);
  if (input.hideLocation !== undefined && typeof input.hideLocation !== "boolean") {
    throw new WorkerError("HIDE_LOCATION_INVALID", "위치 가리기 값이 올바르지 않습니다.", 400);
  }
  return {
    species,
    speciesText: species.join(" · "),
    lat,
    lon,
    observedOn: normalizeObservedOn(input.observedOn, now),
    birdCount: normalizeBirdCount(input.birdCount),
    reporter: optionalText(input.reporter, MAX_REPORTER_LENGTH, "제보자 이름", false),
    note: optionalText(input.note, MAX_NOTE_LENGTH, "참고 설명", true),
    // 이름 공개는 명시적으로 동의한 경우에만 1 이다. 값이 없으면 비공개로 본다.
    namePublic: input.namePublic === true || input.namePublic === 1 ? 1 : 0,
    // 위치 가리기는 제보자가 체크한 경우에만 참이다. 기본은 정확한 위치 공개.
    hideLocation: input.hideLocation === true,
  };
}

/* ── 승인 전 공개(황색 마커) ────────────────────────────────────────── */

// 승인 전 제보는 실제 좌표를 절대 내보내지 않는다. 접수 때 실제 지점에서
// 1.5~4.5km 떨어진 점을 한 번 만들어 저장하고, 공개 API 는 그 점만 쓴다.
// 반올림(소수점 자르기)은 쓰지 않는다. 격자 위에 놓여 원래 지점이 좁혀지기 때문이다.
// 매 요청마다 다시 계산하지 않는 이유도 같다. 여러 번 받아 평균 내면 실제 지점이 드러난다.
export const APPROX_MIN_METERS = 1500;
export const APPROX_MAX_METERS = 4500;

function randomUnitPair() {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return [values[0] / 2 ** 32, values[1] / 2 ** 32];
}

export function approximateCoordinate(lat, lon, randomPair) {
  const [angleSeed, radiusSeed] = randomPair || randomUnitPair();
  const bearing = angleSeed * 2 * Math.PI;
  // 면적 기준으로 고르게 퍼뜨린다. 거리만 균등하게 뽑으면 안쪽에 몰린다.
  const near = APPROX_MIN_METERS ** 2;
  const far = APPROX_MAX_METERS ** 2;
  const distance = Math.sqrt(near + radiusSeed * (far - near));
  const metersPerLat = 111320;
  const metersPerLon = Math.max(1, metersPerLat * Math.cos((lat * Math.PI) / 180));
  const movedLat = lat + (distance * Math.cos(bearing)) / metersPerLat;
  const movedLon = lon + (distance * Math.sin(bearing)) / metersPerLon;
  // 국내 범위를 벗어나면 지도 밖에 찍히므로 경계로 되돌린다.
  return {
    lat: Number(Math.min(LAT_MAX, Math.max(LAT_MIN, movedLat)).toFixed(5)),
    lon: Number(Math.min(LON_MAX, Math.max(LON_MIN, movedLon)).toFixed(5)),
  };
}

// 둥지·번식지와 보호종은 승인 전 공개를 보류한다. 관리자가 확인한 뒤에만 지도에 올린다.
// ponytail: 종명·낱말 목록으로만 판정한다. 규칙이 복잡해지면 관리자 설정값으로 옮긴다.
export const SENSITIVE_KEYWORDS = ['둥지', '번식', '포란', '육추', '새끼', '영소'];
export const SENSITIVE_SPECIES = [
  '저어새', '노랑부리저어새', '노랑부리백로', '황새', '먹황새', '따오기',
  '두루미', '재두루미', '흑두루미', '검독수리', '참수리', '흰꼬리수리',
  '매', '참매', '수리부엉이', '올빼미', '팔색조', '뿔쇠오리', '넓적부리도요',
];

// Treat unresolved names as non-public without guessing a corrected spelling.
// A legal designation is NOT itself a reason to hide confirmed non-breeding.
const PROTECTION_SPLIT = /[,;·/\r\n]+/;
const protectedNames = new Set([...SENSITIVE_SPECIES, ...LEGAL_PROTECTED_NAMES, ...Object.keys(MAP_LOCATION_SENSITIVE)]);
// 단순 문장부호 오기(따옴표·작은따옴표·백틱·마침표·쉼표)만 지운 한글 종명. 원문은 바꾸지 않고 판정·집계에만 쓴다.
// 지운 결과가 공식 국명(수량 포함)과 정확히 맞을 때만 쓰고, 아니면 입력 그대로 둔다.
// ?·추정·류 등 동정 불확실 표현은 지우지 않으므로 분류 미확인으로 남는다. 영문(학명·영명)이 섞이면 건드리지 않는다.
// 숫자 사이의 문장부호(3.5 등)는 수량 자체가 불확실하므로 지우지 않는다.
const STRAY_PUNCTUATION = /(?<!\d)['’‘`"“”.,]|['’‘`"“”.,](?!\d)/g;
export function normalizeSpeciesToken(token) {
  const text = String(token ?? '').normalize('NFC').trim();
  if (/[A-Za-z]/.test(text) || !/[가-힣]/.test(text) || !/['’‘`"“”.,]/.test(text)) return text;
  const cleaned = text.replace(STRAY_PUNCTUATION, '').replace(/\s+/g, ' ').trim();
  const parsed = parseSpeciesItems([cleaned]);
  return parsed.clean && parsed.items.length && parsed.items.every(item => officialBirdNames.has(item.name)) ? cleaned : text;
}
function isRestrictedSpeciesToken(token) {
  const parsed = parseSpeciesItems([normalizeSpeciesToken(token)]);
  // Preserve the 10-species cap and duplicate-name ambiguity even on legacy reads.
  // Earlier parsers can split an old whitespace string into too many items
  // without marking parsed.clean=false; that is not a public disclosure grant.
  if (!parsed.clean || !parsed.items.length || parsed.items.length > MAX_SPECIES || parsed.duplicates.length > 0) return true;
  return parsed.items.some(item => !identifyBird(item.name));
}
// 분류 미확인: 공식 국명·학명·영명(identifyBird)으로 완전히 식별되지 않는 이름. 원문은 바꾸지 않고 판정에만 쓴다.
// 종수에서는 빼고, 공개 여부(승인)와 위치 판정은 이 값과 따로 정한다.
export const isUnclassifiedSpecies = name => typeof name !== 'string' || !name.trim() || isRestrictedSpeciesToken(name.trim());
// Classify protected birds separately from the general publication veto.
// Only OLD protected rows lacking original non-breeding evidence remain
// location-restricted so a policy change never retroactively leaks coordinates.
export function isProtectedSpeciesReport(report) {
  const raw = report?.speciesText;
  const names = Array.isArray(report?.species) ? report.species : [];
  const sources = [...names, ...(typeof raw === 'string' && raw ? [raw] : [])];
  return sources.some(name => typeof name === 'string' &&
    name.split(PROTECTION_SPLIT).some(token => {
      // 문장부호 오기로 보호종 판정을 피하지 못하게 정규화한 이름으로 검사한다.
      const parsed = parseSpeciesItems([normalizeSpeciesToken(token)]);
      return parsed.clean && parsed.items.some(item => {
        const id = identifyBird(item.name);
        return protectedNames.has(item.name) || (!!id && protectedNames.has(id.key));
      });
    }));
}

export function hasBreedingEvidence(report) {
  // A literal non-breeding statement is not positive breeding evidence, and never confirms by itself.
  const haystack = [report?.note || '', report?.speciesText || report?.species || ''].join(' ').normalize('NFC')
    .replace(/비번식|\bnon[- ]breeding\b/gi, '');
  return SENSITIVE_KEYWORDS.some(word => haystack.includes(word)) || /\b(nest(?:ing|s)?|breed(?:ing)?|chicks?|nestlings?|fledglings?|incubat(?:e|ing|ion))\b/i.test(haystack);
}

// Three states: missing/invalid evidence is unknown, never a non-breeding declaration.
// Confirmation belongs to the original observation; edits to its identity invalidate it.
export function reportBreedingStatus(row) {
  let input;
  try { input = JSON.parse(row.location_input); } catch {}
  if (hasBreedingEvidence(row) || hasBreedingEvidence(input)) return 'breeding';
  if (row.non_breeding_confirmed !== 1 || input?.non_breeding_confirmed !== true) return 'unknown';
  try {
    // Before whitespace splitting, the saved species text used delimiter-only normalization.
    // Accept that exact old representation, never a taxonomic/approximate equivalence.
    const oldTokens = String(input.species ?? '').split(/[,;·\r\n]+/).map(part=>stripControl(part)).filter(Boolean);
    const oldText = oldTokens.length > 0 && oldTokens.length <= MAX_SPECIES && oldTokens.every(token=>token.length<=MAX_SPECIES_LENGTH && SPECIES_PATTERN.test(token))
      ? [...new Set(oldTokens)].join(' · ') : null;
    let original;
    try { original = validateReport({...input, birdCount:null}); } catch {
      if (oldText !== row.species) return 'unknown';
      // The original species spelling was validated by the old rules above. Validate
      // every remaining immutable field even when new token limits reject that old text.
      original = validateReport({...input, species:'까치', birdCount:null});
    }
    if ((original.speciesText === row.species || (oldText !== null && oldText === row.species)) && original.lat === row.lat && original.lon === row.lon &&
        original.observedOn === row.observed_on && original.note === (row.note ?? null)) return 'non_breeding';
  } catch {}
  return 'unknown';
}

// 위치 판정만 한다. 기록·종명 공개 여부는 여기서 정하지 않는다.
// 번식이면 항상 가린다. 원본 비번식 확인이 있으면 제보자의 위치 가리기 선택(isLocationHidden)을 따른다.
// 비번식 확인이 없으면 보호종과 분류 미확인(보호종일 수 있음) 종명의 정확 좌표를 소급 공개하지 않는다.
export function isLocationRestricted(row) {
  const breeding = reportBreedingStatus(row);
  if (breeding === 'breeding') return true;
  if (breeding === 'non_breeding') return false;
  const sources = [
    { speciesText: row.species, species: splitSpecies(row.species) },
    { species: speciesNamesOf(row) },
    ...publicSightingsOf(row).map(item => ({ species: [item.name] })),
  ];
  return sources.some(report => isProtectedSpeciesReport(report) || hasUnclassifiedSpecies(report));
}

export function siteHistoryPayload(rows, limit, offset) {
  const visible = (rows || []).filter(row => !isLocationRestricted(row) && !isLocationHidden(row));
  return { total: visible.length, limit, offset, history: visible.slice(offset, offset + limit).map(historyEntry) };
}

// 승인 전(자동 공개) 보류 판정: 번식 증거 또는 분류 미확인 종명. 승인된 기록의 공개 차단에는 쓰지 않는다.
export function isSensitiveReport(report) {
  return hasBreedingEvidence(report) || hasUnclassifiedSpecies(report);
}
export function hasUnclassifiedSpecies(report) {
  // 원문과 구조화된 식별 결과 모두 검사한다. 한쪽의 일반종 값으로 다른 쪽의
  // 미확인·혼합 입력을 덮어쓰지 않는다. 누락·빈 값도 확인된 종명이 아니다.
  const raw = report?.speciesText;
  const names = Array.isArray(report?.species) ? report.species : [];
  const sources = [...names, ...(typeof raw === 'string' && raw ? [raw] : [])];
  if (!sources.length) return true;
  return sources.some(name => typeof name !== 'string' || !name.trim() ||
    name.split(PROTECTION_SPLIT).some(token => isRestrictedSpeciesToken(token.trim())));
}

// 승인 전 제보는 공개하지 않는다. 과거 pending_public/approx_* 값도 공개 허가가 아니다.
export function pendingPayload() {
  return [];
}

// 저장된 과거 접수증의 spot까지 제거한다. 불변 원자료 자체는 수정하지 않는다.
/* ── 종명·개체수 분리 ───────────────────────────────────────────────── */
// 토큰마다 '국명' 또는 '국명+숫자(마리|개체)'만 인정한다: 동박새3 = 동박새 3 = 동박새 3마리 = 동박새 3개체.
// 숫자는 1 이상(앞자리 0 없음)이어야 하고, 숫자가 없으면 개체수는 미입력(null)이다(1로 보지 않는다).
// 하나라도 이 꼴이 아니면 clean=false: 구조화하지 않고 자동 공개도 하지 않는다(관리자 검토).
// 이름은 한글 국명 또는 학명·영명 꼴(영문자·'.-·공백, 단어 5개까지). 영문 이름 뒤 숫자도 개체수다(Calidris pygmaea 3).
const SPECIES_ITEM = /^([가-힣]{1,30}|[A-Za-z][A-Za-z'.-]*(?: [A-Za-z'.-]+){0,4})(?:\s*([1-9][0-9]{0,5})\s*(?:마리|개체)?)?$/;
export function parseSpeciesItems(tokens) {
  const items = [];
  let clean = (tokens || []).length > 0;
  for (const raw of (tokens || []).flatMap(token => splitOfficialSpecies(token) || [token])) {
    const original = String(raw || '').normalize('NFC').trim();
    const m = SPECIES_ITEM.exec(original.replace(/\s+/g, ' ')); // 원문(original)은 그대로 두고 비교만 공백을 정리한다
    const count = m && m[2] !== undefined ? Number(m[2]) : null;
    if (!m || (count !== null && count > MAX_BIRD_COUNT)) { clean = false; items.push({ original, name: null, count: null }); continue; }
    items.push({ original, name: m[1].replace(/\s+/g, ' '), count });
  }
  const names = items.map(i => i.name).filter(Boolean);
  const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  return { clean, items, duplicates, species: [...new Set(names)] };
}

// 정본 sightings 에 넣을 종별 값. 같은 종이 두 번이면 합산하지 않고 불확실로 둔다.
// 한 종만 쓰고 숫자를 생략했다면 접수 양식의 개체수를 그 종의 개체수로 쓴다(기존 규칙). 둘이 다르면 불확실.
export function sightingValues(parsed, birdCount) {
  const single = parsed.items.length === 1;
  return parsed.items.map(item => {
    const conflict = single && item.count !== null && birdCount !== null && birdCount !== undefined && item.count !== birdCount;
    const ambiguous = parsed.duplicates.includes(item.name) || conflict;
    const count = ambiguous ? null : (item.count ?? (single ? (birdCount ?? null) : null));
    return { species_original: item.original, species_identified: item.name, interpretation: ambiguous ? 'unknown' : 'single', taxon_id: null,
      count_value: count, count_accuracy: 'unknown', count_source: ambiguous ? 'ambiguous_group' : count === null ? 'not_recorded' : 'reported',
      interpretation_note: parsed.duplicates.includes(item.name) ? 'duplicate_species' : conflict ? 'count_conflict' : null };
  });
}

// 기존 자료는 공식 국명 전체가 맞는 경우만 읽기 단계에서 해석한다. 원문·정본 DB는 수정하지 않는다.
const officialBirdNames = new Set(OFFICIAL_BIRD_NAMES);
const legacyTokens = text => String(text || '').split(/[·,;\r\n/]+/).map(normalizeSpeciesToken).flatMap(token => splitOfficialSpecies(token) || [token]).map(s => s.trim()).filter(Boolean);
export function legacySpeciesItems(text) {
  const items = legacyTokens(text).map(token => {
    const parsed = parseSpeciesItems([token]);
    const item = parsed.items[0];
    return parsed.clean && officialBirdNames.has(item.name)
      ? { name: item.name, count: item.count, countStatus: item.count === null ? 'not_recorded' : 'reported' }
      : { name: token, count: null, countStatus: 'uncertain' };
  });
  return groupPublicSightings(items);
}
// 관리자 통계·공개 개체수 표시용 읽기 해석(원문·정본 불변). 공식 국명은 legacySpeciesItems 와 같고, 그 밖의 이름도
// "이름+숫자(마리|개체)" 꼴이면 숫자를 개체수로 센다. 범위·물결표·뒤따르는 말 등 수량이 불확실하면 세지 않는다.
// solo: 행의 유일한 이름(접수 양식 개체수와 대조할 수 있음).
const LOOSE_COUNT = /^(\D+?)\s*([1-9][0-9]{0,5})\s*(?:마리|개체)?$/;
export function statsSpeciesItems(text) {
  const items = legacySpeciesItems(text).map(item => {
    if (item.countStatus !== 'uncertain' || officialBirdNames.has(item.name)) return item;
    const m = LOOSE_COUNT.exec(item.name.normalize('NFC').trim());
    return m && Number(m[2]) <= MAX_BIRD_COUNT ? { name: m[1].trim(), count: Number(m[2]), countStatus: 'reported' } : item;
  });
  const grouped = groupPublicSightings(items), solo = legacyTokens(text).length === 1;
  return grouped.map(item => ({ ...item, unclassified: isUnclassifiedSpecies(item.name), solo }));
}
function groupPublicSightings(items) {
  const groups = new Map();
  for (const item of items) {
    if (groups.has(item.name)) groups.set(item.name, { name: item.name, count: null, countStatus: 'uncertain' });
    else groups.set(item.name, item);
  }
  return [...groups.values()];
}
export function publicSightingsOf(row) {
  let rows;
  try { rows = JSON.parse(row?.public_sightings || 'null'); } catch {}
  if (!Array.isArray(rows) || !rows.length) {
    // 분류 미확인 이름의 명확한 수량도 통계와 같은 규칙으로 읽는다(원문 불변).
    const legacy = statsSpeciesItems(row?.species).map(({ name, count, countStatus }) => ({ name, count, countStatus }));
    return /[0-9]/.test(row?.species || '') && legacy.some(i => officialBirdNames.has(i.name)) ? legacy : [];
  }
  return groupPublicSightings(rows.filter(r => typeof r?.name === 'string' && r.name).map(r => {
    const known = r.state === 'single' && Number.isSafeInteger(r.count) && r.count > 0 && r.count <= MAX_BIRD_COUNT;
    return { name: r.name, count: known ? r.count : null,
      countStatus: r.state !== 'single' ? 'uncertain' : known ? 'reported' : 'not_recorded' };
  }));
}
// 통계·검색·지도에서 구조화된 식별 국명을 우선한다. 과거 원문은 공식 국명 정확 일치만 분리한다.
export function speciesNamesOf(row) {
  let identified = [];
  try { identified = typeof row?.identified_species === 'string' ? JSON.parse(row.identified_species) : []; } catch {}
  const names = Array.isArray(identified) ? identified.filter(n => typeof n === 'string' && n) : [];
  return names.length ? [...new Set(names)] : legacySpeciesItems(row?.species).map(i => i.name);
}
// 국명 미확정은 읽기 전용 검토 표시로만 분류한다. 승인 상태·원문·정본에는 쓰지 않는다.
export function unconfirmedSpeciesOf(row) {
  // 2025 목록의 국명·학명·영명으로 확인되면 확인된 이름이다. 목록 밖 학명 꼴·그 밖의 이름은 사후 검토 표시 대상이다.
  return speciesNamesOf(row).filter(name => !isListedBirdName(name));
}
export function identifiedSpeciesSql(env, withCounts = false) {
  const canonical = env?.REPORTS_WRITE_MODE === 'CANONICAL_DUAL_WRITE';
  const names = canonical
    ? "(SELECT json_group_array(species_identified) FROM (SELECT species_identified FROM sightings WHERE checklist_id=reports.id AND species_identified IS NOT NULL ORDER BY source_ordinal)) AS identified_species"
    : 'NULL AS identified_species';
  if (!withCounts) return names;
  const counts = canonical
    ? "(SELECT json_group_array(json_object('name',species_identified,'count',count_value,'state',interpretation)) FROM (SELECT species_identified,count_value,interpretation FROM sightings WHERE checklist_id=reports.id AND species_identified IS NOT NULL ORDER BY source_ordinal)) AS public_sightings"
    : 'NULL AS public_sightings';
  return names + ',' + counts;
}

// 대기 제보는 서버가 자동 공개(public_unverified)라고 계산한 경우만 그렇게 알리고, 나머지는 withheld 다.
// 보류 사유는 코드만 담는다. 좌표·종·메모는 어떤 경우에도 넣지 않는다.
export function receiptPayload(body) {
  const out = {
    ok: body.ok,
    id: body.id,
    status: body.status,
    publicVisibility: body.status === 'pending' ? (body.publicVisibility === 'public_unverified' ? 'public_unverified' : 'withheld') : body.publicVisibility,
  };
  const reasons = Array.isArray(body.holdReasons) ? body.holdReasons.filter(r => typeof r === 'string' && /^[a-z_]{1,32}$/.test(r)) : [];
  if (body.status === 'pending' && out.publicVisibility === 'withheld' && reasons.length) out.holdReasons = reasons;
  return out;
}

/* ── 위치 가리기 ────────────────────────────────────────────────────── */

// 위치 가리기 = public_lat/lon 에 실제와 다른 공개 좌표가 들어 있는 상태(제보자 요청이든 관리자 지정이든).
// 공개 API 는 이 여부(참/거짓)만 내보내고, 실제 좌표는 어떤 경우에도 함께 보내지 않는다.
export const LOCATION_HIDDEN_SQL =
  "(public_lat IS NOT NULL AND public_lon IS NOT NULL AND (public_lat <> lat OR public_lon <> lon))";

export function isLocationHidden(row) {
  return row?.public_lat != null && row?.public_lon != null &&
    (Number(row.public_lat) !== Number(row.lat) || Number(row.public_lon) !== Number(row.lon));
}

// 가릴 때 쓸 공개 좌표. 이미 밖에 나간 대략 좌표가 있으면 그 점을 그대로 쓴다.
// 새 점을 또 만들면 여러 점을 모아 실제 위치를 좁힐 수 있기 때문이다(approximateCoordinate 참조).
export function hiddenCoordinate(row) {
  const moved = (lat, lon) => lat != null && lon != null && (Number(lat) !== Number(row.lat) || Number(lon) !== Number(row.lon));
  if (moved(row.public_lat, row.public_lon)) return { lat: row.public_lat, lon: row.public_lon };
  if (moved(row.approx_lat, row.approx_lon)) return { lat: row.approx_lat, lon: row.approx_lon };
  return approximateCoordinate(row.lat, row.lon);
}

/* ── 해시 ───────────────────────────────────────────────────────────── */

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 원본 IP 는 저장하지 않는다. 솔트가 없으면 제한 자체를 포기하지 않고 요청을 거부한다.
export function ipHash(ip, salt) {
  if (!salt) {
    throw new WorkerError(
      "NOT_CONFIGURED_SALT",
      "제보 접수가 아직 설정되지 않았습니다.",
      503,
    );
  }
  return sha256Hex(`${salt}:${ip || "unknown"}`);
}

// 같은 종·좌표(소수 4자리)·관찰일이면 같은 제보로 본다.
export function dedupeHash(report) {
  const key = [
    report.species.slice().sort().join("|"),
    report.lat.toFixed(4),
    report.lon.toFixed(4),
    report.observedOn,
  ].join(":");
  return sha256Hex(key);
}

/* ── 자동 등록 방지 (Turnstile) ─────────────────────────────────────── */

// idempotencyKey: UUID of the logical submission (request_id). Retries of the same request reuse it,
// different requests never share it. Omitted on the legacy path, which has no client request_id.
export async function verifyTurnstile(token, ip, secret, fetchImpl = fetch, idempotencyKey) {
  if (!secret) {
    throw new WorkerError(
      "NOT_CONFIGURED_CAPTCHA",
      "제보 접수가 아직 설정되지 않았습니다.",
      503,
    );
  }
  if (!token || typeof token !== "string") {
    throw new WorkerError(
      "CAPTCHA_REQUIRED",
      "자동 등록 방지 확인을 완료해 주세요.",
      400,
    );
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  if (idempotencyKey) body.set("idempotency_key", idempotencyKey);
  let payload;
  try {
    const response = await fetchImpl(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    payload = await response.json();
  } catch {
    throw new WorkerError(
      "CAPTCHA_UNAVAILABLE",
      "자동 등록 방지 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  if (!payload?.success) {
    // 클라이언트 응답에는 넣지 않는다. 설정 진단은 `wrangler tail` 로만 본다.
    console.log(
      "turnstile_failed " +
        JSON.stringify({
          codes: payload?.["error-codes"] ?? [],
          hostname: payload?.hostname ?? null,
        }),
    );
    throw new WorkerError(
      "CAPTCHA_FAILED",
      "자동 등록 방지 확인에 실패했습니다.",
      403,
    );
  }
  return true;
}

/* ── 관리자 인증 (Cloudflare Access JWT) ────────────────────────────── */

function base64UrlToBytes(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlToJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(text)));
}

const FORBIDDEN = new WorkerError(
  "ADMIN_FORBIDDEN",
  "관리자 권한이 필요합니다.",
  403,
);

// Access 가 붙인 JWT 를 Worker 안에서 다시 검증한다.
// 설정값이 하나라도 비어 있으면 통과시키지 않고 503 으로 닫는다(열림 기본값 금지).
export async function verifyAccessJwt(token, options) {
  const { teamDomain, aud, adminEmails, fetchImpl = fetch, now = Date.now() } =
    options || {};
  if (!teamDomain || !aud || !adminEmails?.length) {
    throw new WorkerError(
      "NOT_CONFIGURED",
      "관리자 인증이 아직 설정되지 않았습니다.",
      503,
    );
  }
  if (!token || typeof token !== "string") throw FORBIDDEN;

  const parts = token.split(".");
  if (parts.length !== 3) throw FORBIDDEN;

  let header;
  let payload;
  try {
    header = base64UrlToJson(parts[0]);
    payload = base64UrlToJson(parts[1]);
  } catch {
    throw FORBIDDEN;
  }
  if (header?.alg !== "RS256" || !header?.kid) throw FORBIDDEN;

  const issuer = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload?.iss !== issuer) throw FORBIDDEN;

  const audience = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
  if (!audience.includes(aud)) throw FORBIDDEN;

  const seconds = Math.floor(now / 1000);
  if (!payload?.exp || payload.exp <= seconds) throw FORBIDDEN;
  if (payload?.nbf && payload.nbf > seconds + 60) throw FORBIDDEN;

  let jwks;
  try {
    const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`);
    jwks = await response.json();
  } catch {
    throw new WorkerError(
      "ADMIN_AUTH_UNAVAILABLE",
      "관리자 인증 서버에 연결할 수 없습니다.",
      503,
    );
  }
  const jwk = (jwks?.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw FORBIDDEN;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw FORBIDDEN;

  const email = String(payload?.email || "").toLowerCase();
  if (!email || !adminEmails.includes(email)) throw FORBIDDEN;
  return { email };
}

export function parseAdminEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/* ── 공개 출력 ──────────────────────────────────────────────────────── */

// 공개 지도에 내보내는 값은 종과 좌표뿐이다.
// 제보자·관찰일·개체수·설명·관리자 메모는 API 응답에 넣지 않는다.
export function splitSpecies(text) {
  return String(text || "")
    .split(" · ")
    .filter(Boolean);
}

// 이력 한 줄. 이름은 공개에 동의했고 실제로 입력된 경우에만 넣는다.
// 동의하지 않았거나 이름이 없으면 필드 자체를 만들지 않아 화면에서 '익명 제보'가 된다.
// 지점별 이력(publicPayload)과 탐조지별 이력(/reports/site/<id>)이 같은 규칙을 쓴다.
export function historyEntry(row) {
  const entry = {
    id: row.id,
    date: row.observed_on,
    species: speciesNamesOf(row),
  };
  const sightings = publicSightingsOf(row).map(item => isUnclassifiedSpecies(item.name) ? { ...item, unclassified: true } : item);
  if (sightings.length) entry.sightings = sightings;
  // 분류 미확인 이름은 원문 그대로 보이고 표시만 붙인다(종수 제외).
  const unclassified = entry.species.filter(isUnclassifiedSpecies);
  if (unclassified.length) entry.unclassified = unclassified;
  if (Number(row.name_public) === 1 && row.reporter) entry.reporter = row.reporter;
  return entry;
}

function newestFirst(a, b) {
  return String(b.date).localeCompare(String(a.date));
}

// 승인된 행들로 공개 지도가 쓸 값을 만든다.
// spot_key 가 없는 제보는 자기 점을 갖고, 있는 제보는 그 지점의 이력으로만 붙는다.
// 원본 행을 고쳐 쓰지 않으므로 개별 이력 조회와 공개 취소가 그대로 가능하다.
export function publicPayload(rows) {
  const all = (rows || []).filter(row => !isLocationRestricted(row) && (!row.spot_key || !isLocationHidden(row)));
  const byKey = new Map();
  for (const row of all) {
    if (!row.spot_key) continue;
    if (!byKey.has(row.spot_key)) byKey.set(row.spot_key, []);
    byKey.get(row.spot_key).push(row);
  }

  const spots = all
    .filter((row) => !row.spot_key)
    .map((row) => {
      const attached = byKey.get(row.id) || [];
      // 연결된 제보의 종을 뒤에 더한다. 기존 종은 지우지 않는다.
      const species = speciesNamesOf(row);
      for (const extra of attached) {
        for (const name of speciesNamesOf(extra)) {
          if (!species.includes(name)) species.push(name);
        }
      }
      const spot = {
        id: row.id,
        lat: row.public_lat ?? row.lat,
        lon: row.public_lon ?? row.lon,
        species,
        history: [row, ...attached].map(historyEntry).sort(newestFirst),
      };
      const unclassified = species.filter(isUnclassifiedSpecies);
      if (unclassified.length) spot.unclassified = unclassified;
      if (isLocationHidden(row)) spot.locationHidden = true;
      return spot;
    });

  // index.html 에 손으로 등록된 붉은 점에 붙는 이력. 그 점의 좌표·출현종은 건드리지 않는다.
  const fixedSpots = {};
  for (const [key, list] of byKey) {
    if (!key.startsWith("fixed:")) continue;
    fixedSpots[key] = { history: list.map(historyEntry).sort(newestFirst) };
  }

  return { spots, fixedSpots };
}
