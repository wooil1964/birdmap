// 일반종 자동 공개(미검증) 판정. 설계: docs/reviews/report-autopublish-design/2026-11-08-claude-design.md
// 원칙: 허용 목록에 정확히 있는 종만 자동 공개한다. 모르는 것은 전부 보류(fail-closed).
// 상태값은 새로 만들지 않는다: pending + pending_public=1 + reviews(submitted, system:auto-public, auto_public:<정책>)
// 세 가지를 모두 갖추고, 읽는 시점에 아래 판정을 다시 통과해야만 공개된다.
import { LEGAL_PROTECTED_NAMES, MAP_LOCATION_SENSITIVE } from './protected-birds.js';
import { hasBreedingEvidence, isLocationRestricted, isLocationHidden, splitSpecies, kstDateString, parseSpeciesItems, speciesNamesOf, publicSightingsOf, identifiedSpeciesSql } from './shared.js';

export const AUTO_PUBLIC_POLICY = 'auto-public-v1';
export const AUTO_PUBLIC_ACTOR = 'system:auto-public';
export const AUTO_PUBLIC_REASON = 'auto_public:' + AUTO_PUBLIC_POLICY;
export const UNVERIFIED_MAX_DAYS = 14;   // 이 기간 안에 관리자가 확인하지 않으면 읽기에서 내린다(쓰기 없음).
export const STALE_DAYS = 7;             // 관찰일이 이보다 오래되면 접수 때 보류
export const MAX_SPECIES = 5;
export const DUPLICATE_METERS = 200;
export const IP_DAILY_MAX = 5;
export const GLOBAL_DAILY_MAX_DEFAULT = 50;
const DEFAULT_COUNT_MAX = 300;

// 시범 허용 후보 15종(2026-11-08 공식 자료 대조: docs/reviews/report-autopublish-design/2026-11-08-claude-pilot18-review.md).
// 허용 "후보"일 뿐 확정 정책이 아니다. 자동 공개 스위치는 별도 승인 전까지 OFF. 이름은 2025 한국조류목록 국명과 정확히 일치해야 한다.
// 시범 18종 중 제외: 집비둘기(2025 목록에 없음, 같은 속 낭비둘기=법정 II급), 왜가리(지정 번식지), 노랑턱멧새(같은 속 법정 II급 3종).
export const COMMON_SPECIES = Object.freeze({
  '참새': {}, '까치': {}, '직박구리': {}, '멧비둘기': {}, '박새': {},
  '붉은머리오목눈이': {}, '물까치': {}, '큰부리까마귀': {}, '딱새': {}, '동박새': {},
  '청둥오리': { countMax: 3000 }, '흰뺨검둥오리': { countMax: 3000 }, '쇠오리': { countMax: 3000 },
  '민물가마우지': {}, '쇠딱다구리': {},
});

// 법정 보호 조류(멸종위기 I·II급, 천연기념물 종 지정, 해양보호생물 + 법령명↔국명 연결). 출처와 목록은 protected-birds.js.
// 자동 공개 관문 전용이며 위치 정책 v2 판정은 바꾸지 않는다. 안전성은 허용 목록이 보장하고, 이 목록은 사유 표시·겹침 검사용이다.
export const PROTECTED_SPECIES = LEGAL_PROTECTED_NAMES;
// 탐조지도 자체 위치 민감종(법정 보호종 아님). 사유 'location_sensitive' 로 따로 보류한다.
export const MAP_SENSITIVE_SPECIES = new Set(Object.keys(MAP_LOCATION_SENSITIVE));
// 희귀종·혼동종 검토 목록: 허용 종과 이름·외형이 헷갈리거나 동정 확인이 필요한 종.
// 집비둘기·노랑턱멧새는 시범 18종 검토에서 보류(혼동·국명 근거)로 옮겼다.
export const RARE_REVIEW_SPECIES = new Set([
  '집비둘기', '노랑턱멧새',
  '말똥가리', '쇠백로', '중대백로', '넓적부리', '양비둘기', '염주비둘기', '떼까마귀', '갈까마귀', '까마귀',
  '검은머리쑥새', '청다리도요', '흰뺨오리', '가창오리', '아메리카홍머리오리', '쇠가마우지', '가마우지',
]);

export const SYNONYMS = Object.freeze({}); // 관습명 → 국명. 지정한 것만 인정한다(부분·유사 일치 없음).

export const HOLD_REASONS = ['auto_public_disabled', 'breeding', 'protected', 'location_sensitive', 'rare_review', 'name_unconfirmed', 'species_parse', 'count_anomaly',
  'stale_observation', 'possible_duplicate', 'rate_review', 'global_cap', 'note_review'];

const QUANTITY = /^(.+?)\s*(\d+)\s*(?:마리|개체)?$/;
const UNCERTAIN = /[?？]|추정|미확인|아마|같음|비슷|류$|\bsp\.?$|\bspp\.?$|또는|\bor\b/i;
const CONTACT = /https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+|\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/i;

export function speciesName(token) {
  const text = String(token || '').normalize('NFC').trim();
  const m = QUANTITY.exec(text);
  const name = (m ? m[1] : text).trim();
  return SYNONYMS[name] || name;
}

// 저장·접수와 무관하게 내용만으로 판정한다(읽을 때 다시 쓰는 부분).
export function contentReasons(report) {
  const reasons = new Set();
  const tokens = (report.species || []).map(t => String(t || '').normalize('NFC').trim()).filter(Boolean);
  if (hasBreedingEvidence({ note: report.note, speciesText: report.speciesText || tokens.join(' · ') })) reasons.add('breeding');
  if (!tokens.length || tokens.length > MAX_SPECIES) reasons.add('name_unconfirmed');
  // 종명·개체수를 확실히 나눌 수 없거나(꼴 불일치), 같은 종이 두 번이거나, 양식 개체수와 다르면 보류.
  const parsed = parseSpeciesItems(tokens);
  if (!parsed.clean || parsed.duplicates.length) reasons.add('species_parse');
  const count = report.birdCount;
  if (parsed.items.length === 1 && parsed.items[0].count !== null && count !== null && count !== undefined && parsed.items[0].count !== count) reasons.add('species_parse');
  let countMax = Infinity;
  for (const [i, token] of tokens.entries()) {
    if (UNCERTAIN.test(token)) { reasons.add('name_unconfirmed'); continue; }
    const item = parsed.items[i], name = item?.name || speciesName(token);
    if (PROTECTED_SPECIES.has(name)) reasons.add('protected');
    if (MAP_SENSITIVE_SPECIES.has(name)) reasons.add('location_sensitive');
    if (RARE_REVIEW_SPECIES.has(name)) reasons.add('rare_review');
    const common = item?.name && Object.hasOwn(COMMON_SPECIES, name) ? COMMON_SPECIES[name] : null;
    if (!common) { reasons.add('name_unconfirmed'); continue; }
    const limit = common.countMax || DEFAULT_COUNT_MAX;
    countMax = Math.min(countMax, limit);
    // 종명 뒤 수량 표기("참새 5000마리")도 그 종의 상한을 넘으면 보류한다.
    if (item.count !== null && item.count > limit) reasons.add('count_anomaly');
  }
  if (count !== null && count !== undefined && !(Number.isSafeInteger(count) && count >= 0 && count <= countMax)) reasons.add('count_anomaly');
  if (report.note && CONTACT.test(String(report.note))) reasons.add('note_review');
  return reasons;
}

export const autoPublicEnabled = env => env?.REPORTS_AUTO_PUBLIC === '1' && env?.REPORTS_WRITE_MODE === 'CANONICAL_DUAL_WRITE';
export const unverifiedReadsEnabled = env => env?.REPORTS_UNVERIFIED_READS === '1' && env?.REPORTS_WRITE_MODE === 'CANONICAL_DUAL_WRITE';

function kstDayStartIso(now) { return new Date(Date.parse(kstDateString(now) + 'T00:00:00+09:00')).toISOString(); }
function daysBetween(a, b) { return Math.floor((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function meters(a, b) {
  const r = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// 하루 자동 공개 건수: 같은 날(KST) "자동 공개"로 판정되어 저장된 접수 판정 기록(reviews seq 1)을 센다.
// 관리자가 뒤에 공개 중지·승인·반려해도 줄지 않는 누적값이다. 판정과 저장 batch 확인이 같은 정의를 쓴다.
const AUTO_COUNT = `SELECT COUNT(*) FROM reviews AS rv WHERE rv.sequence=1 AND rv.decision='submitted' AND rv.actor_id='${AUTO_PUBLIC_ACTOR}' AND rv.reason_code='${AUTO_PUBLIC_REASON}' AND rv.created_at>=?`;
const AUTO_COUNT_IP = `${AUTO_COUNT} AND EXISTS (SELECT 1 FROM reports AS r WHERE r.id=rv.checklist_id AND r.ip_hash=?)`;
function dailyCap(env) {
  const cap = Number(env?.REPORTS_AUTO_PUBLIC_DAILY_MAX);
  return Number.isSafeInteger(cap) && cap >= 0 ? cap : GLOBAL_DAILY_MAX_DEFAULT;
}
// 저장 batch 안에서 확인할 조건(방금 넣은 판정 기록 포함 건수 <= 한도)과, 실패 뒤 "한도 때문인지" 확인할 조건.
// 두 SQL 의 자리표시자 순서는 같다(values 를 그대로 쓴다).
export function capGuard(env, ipHash, now = new Date()) {
  const dayStart = kstDayStartIso(now), cap = dailyCap(env);
  return {
    condition: `(${AUTO_COUNT}) <= ? AND (${AUTO_COUNT_IP}) <= ?`,
    values: [dayStart, cap, dayStart, ipHash, IP_DAILY_MAX],
    reachedSql: `SELECT CASE WHEN (${AUTO_COUNT}) >= ? THEN 1 ELSE 0 END AS global_cap, CASE WHEN (${AUTO_COUNT_IP}) >= ? THEN 1 ELSE 0 END AS rate_review`,
  };
}

// 접수 판정. 내용 판정 + 접수 시점에만 의미 있는 판정(관찰일, 중복, 상한).
// 상한은 여기서 한 번 보고, 동시 접수는 persistQuick 의 batch 조건(capGuard)으로 다시 막는다.
export async function classifySubmission(db, env, report, ipHash, now = new Date()) {
  if (!autoPublicEnabled(env)) return { eligible: false, reasons: ['auto_public_disabled'] };
  const reasons = contentReasons(report);
  if (daysBetween(report.observedOn, kstDateString(now)) > STALE_DAYS) reasons.add('stale_observation');
  const names = new Set((report.species || []).map(speciesName));
  const sameDay = (await db.prepare("SELECT species,lat,lon FROM reports WHERE observed_on=?1 AND status<>'rejected'").bind(report.observedOn).all()).results || [];
  if (sameDay.some(r => splitSpecies(r.species).some(t => names.has(speciesName(t))) && meters(r, report) <= DUPLICATE_METERS)) reasons.add('possible_duplicate');
  const dayStart = kstDayStartIso(now);
  const counts = await db.prepare(`SELECT (${AUTO_COUNT}) AS total, (${AUTO_COUNT_IP}) AS ip`).bind(dayStart, dayStart, ipHash).first();
  if (Number(counts?.ip || 0) >= IP_DAILY_MAX) reasons.add('rate_review');
  if (Number(counts?.total || 0) >= dailyCap(env)) reasons.add('global_cap');
  const ordered = HOLD_REASONS.filter(r => reasons.has(r));
  return { eligible: ordered.length === 0, reasons: ordered };
}

// 접수 묶음에 함께 넣는 자동 판정 기록(reviews). 스위치가 꺼져 있으면 기록하지 않는다(현행과 동일).
export function submissionReview(id, now, result) {
  return {
    review_id: `review:submit:${id}`, checklist_id: id, sequence: 1, decision: 'submitted', sighting_id: null,
    validated_taxon_id: null, validated_count: null, validated_count_accuracy: null, from_status: null, to_status: 'pending',
    actor_id: AUTO_PUBLIC_ACTOR, request_id: id, event_index: 0,
    reason_code: result.eligible ? AUTO_PUBLIC_REASON : 'hold:' + result.reasons.join(','), note: null, created_at: now,
  };
}

// 행에 붙여 읽는 자동 판정 기록. reports 와 같은 스냅샷에서 읽는다.
export const AUTO_DECISION_SQL = `(SELECT reason_code FROM reviews WHERE checklist_id=reports.id AND sequence=1 AND decision='submitted' AND actor_id='${AUTO_PUBLIC_ACTOR}') AS auto_decision`;

// 공개 읽기 후보: 자동 공개 표시가 남은 대기 행만. 최종 판정은 unverifiedPayload 가 한다.
export function unverifiedStatement(db, evidence) {
  return db.prepare(`SELECT id,status,species,note,lat,lon,public_lat,public_lon,observed_on,bird_count,received_at,pending_public,${evidence},${AUTO_DECISION_SQL},${identifiedSpeciesSql({REPORTS_WRITE_MODE:'CANONICAL_DUAL_WRITE'}, true)}
    FROM reports WHERE status='pending' AND pending_public=1 ORDER BY observed_on DESC,received_at DESC,id DESC`);
}

// 기록 자체가 자동 공개 상태인지(읽기 스위치와 무관). 관리자 표시에도 쓴다.
export function unverifiedState(row, now = new Date()) {
  if (row?.status !== 'pending' || row.auto_decision !== AUTO_PUBLIC_REASON) return null;
  if (Number(row.pending_public) !== 1) return 'withdrawn';
  const report = { species: splitSpecies(row.species), speciesText: row.species, birdCount: row.bird_count ?? null, note: row.note };
  const ageDays = (now.getTime() - Date.parse(row.received_at)) / 86400000;
  if (!(ageDays <= UNVERIFIED_MAX_DAYS) || contentReasons(report).size || isLocationRestricted(row)) return 'stopped';
  return 'public';
}

// 공개 응답: 스위치 + 기록 + 재판정을 모두 통과한 대기 제보만. 실제 좌표 대신 공개 좌표 규칙(가림이면 가림 점)을 쓴다.
export function unverifiedPayload(rows, env, now = new Date()) {
  if (!unverifiedReadsEnabled(env)) return [];
  return (rows || []).filter(row => unverifiedState(row, now) === 'public').map(row => {
    const spot = { id: row.id, status: 'pending', verified: false, lat: row.public_lat ?? row.lat, lon: row.public_lon ?? row.lon,
      species: speciesNamesOf(row), date: row.observed_on };
    const sightings = publicSightingsOf(row);
    if (sightings.length) spot.sightings = sightings;
    if (isLocationHidden(row)) { spot.locationHidden = true; spot.approximate = true; }
    return spot;
  });
}

export function holdReasonsOf(autoDecision) {
  const text = String(autoDecision || '');
  return text.startsWith('hold:') ? text.slice(5).split(',').filter(r => HOLD_REASONS.includes(r)) : [];
}
