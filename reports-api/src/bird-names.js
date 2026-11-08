// 종명 식별: 공식 국명·학명·영명으로 같은 종을 알아본다. 제보 원문은 바꾸지 않고, 비교용 키만 만든다.
// 이 판정은 "공개 여부"가 아니라 "식별 가능한 이름인지"만 본다. 희귀·미조·미기록 가능종이라는 이유로 거르지 않으며,
// 어떤 이름도 "국내 미기록종"으로 확정하지 않는다. 국내 공식 국명은 한국조류학회 2025 목록이 기준이고 여기서 바꾸지 않는다.
import { OFFICIAL_BIRD_NAMES } from './official-bird-names.js';
import { BIRD_NAME_TABLE } from './official-bird-aliases.js';

const official = new Set(OFFICIAL_BIRD_NAMES);
const byScientific = new Map(BIRD_NAME_TABLE.map(([ko, sci]) => [sci.toLowerCase(), ko]));
const byEnglish = new Map(BIRD_NAME_TABLE.map(([ko, , eng]) => [eng.toLowerCase(), ko]));
const aliasesByKorean = new Map(BIRD_NAME_TABLE.map(([ko, sci, eng]) => [ko, [ko, sci, eng]]));
const BINOMIAL = /^([A-Za-z][a-z]{2,}) ([a-z]{2,})(?: [a-z]{2,})?$/; // 속 종소명 [아종명]
const clean = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);

// 국제 분류자료(AviList v2026 기준 + IOC 15.2 연결)는 한국 목록에 없는 이름을 만났을 때 처음 한 번만 해석한다(Worker 시작 시간에 넣지 않는다).
import * as INTL from './intl-taxa.js'; // 번들에는 한 번만 들어간다
let intlData = null;
function intl() {
  if (intlData) return intlData;
  const species = new Map(), english = new Map(), synonyms = new Map(), synonymsOf = new Map(), legacy = new Set(INTL.LEGACY_SPECIES.split(';'));
  for (const line of INTL.AVI_SPECIES.split(NL)) {
    const [genus, ...rest] = line.split(TAB), g = genus.toLowerCase();
    for (const item of rest) { const [epithet, eng] = item.split('~'), bin = g + ' ' + epithet; species.set(bin, eng); if (eng) english.set(eng.toLowerCase(), bin); }
  }
  // 한국 목록이 별개 종으로 구분하는 이름(예: 미국쇠오리 Anas carolinensis)은 국제목록이 합쳤어도 합치지 않는다.
  for (const pair of INTL.AVI_SYNONYMS.split(';')) { const [syn, canon] = pair.split('>'); if (byScientific.has(syn)) continue; synonyms.set(syn, canon); synonymsOf.set(canon, [...(synonymsOf.get(canon) || []), syn]); }
  const englishAlias = new Map();
  for (const pair of INTL.ENGLISH_ALIASES.split(NL)) { const [eng, bin] = pair.split('>'); if (!byEnglish.has(eng)) englishAlias.set(eng, bin); }
  const englishOf = new Map();
  for (const [eng, bin] of englishAlias) englishOf.set(bin, [...(englishOf.get(bin) || []), eng]);
  intlData = { species, english, synonyms, synonymsOf, englishAlias, englishOf, legacy, koOfCanon: new Map(), namesOfKorean: new Map() };
  // 한국 목록의 학명·영명을 AviList 종에 연결한다(두 한국 종이 같은 AviList 종에 닿으면 모호하므로 연결하지 않는다).
  const seen = new Map();
  for (const [ko, sci, eng] of BIRD_NAME_TABLE) {
    const canon = canonOf(sci.toLowerCase()) || canonOf(eng.toLowerCase());
    if (canon) seen.set(canon, seen.has(canon) ? null : ko);
  }
  for (const [canon, ko] of seen) if (ko) { intlData.koOfCanon.set(canon, ko); intlData.namesOfKorean.set(ko, namesOf(canon)); }
  return intlData;
}
// 학명 또는 영명(소문자) → AviList 학명(소문자), 없으면 인정 학명(분할 전 이름 등)이면 그대로, 모르면 null.
function canonOf(lower) {
  const d = intlData;
  if (d.species.has(lower)) return lower;
  if (d.synonyms.has(lower)) return d.synonyms.get(lower);
  if (d.english.has(lower)) return d.english.get(lower);
  if (d.englishAlias.has(lower)) return d.englishAlias.get(lower);
  return d.legacy.has(lower) ? lower : null;
}
// 한 종의 모든 이름(소문자): 학명, AviList 영명, 동의어, 영명 별칭.
function namesOf(canon) {
  const d = intlData, eng = d.species.get(canon);
  return [canon, ...(eng ? [eng.toLowerCase()] : []), ...(d.synonymsOf.get(canon) || []), ...(d.englishOf.get(canon) || [])];
}
const fromKorean = ko => {
  const extra = intlData ? (intlData.namesOfKorean.get(ko) || []) : [];
  return { key: ko, aliases: [...new Set([...aliasesByKorean.get(ko).map(a => a.toLowerCase()), ...extra])] };
};
function fromCanon(canon, kind) {
  const ko = intlData.koOfCanon.get(canon);
  return ko ? { ...fromKorean(ko), kind } : { key: canon, kind, aliases: namesOf(canon) };
}

// 반환: { key, kind, aliases } 또는 null(식별 불가 → 호출 쪽에서 관리자 검토). 같은 종의 국명·학명·영명·동의어는 같은 key 를 가진다.
// kind: official | scientific | english(2025 한국 목록) | avilist_scientific | avilist_english(AviList v2026) |
//       synonym_scientific(IOC·AviList v2025·Clements 등 다른 목록의 학명) | legacy_scientific(AviList v2026에는 없고 IOC 등이 인정하는 종)
// 속만 맞고 종소명이 어느 목록에도 없는 학명, 목록에 없는 영명·한글명은 null.
export function identifyBird(rawName) {
  const name = clean(rawName);
  if (!name) return null;
  intl();
  if (official.has(name)) return { ...fromKorean(name), kind: 'official' };
  const lower = name.toLowerCase();
  const sci = byScientific.get(lower);
  if (sci) return { ...fromKorean(sci), kind: 'scientific' };
  const eng = byEnglish.get(lower);
  if (eng) return { ...fromKorean(eng), kind: 'english' };
  const d = intlData;
  const byName = d.english.get(lower) || d.englishAlias.get(lower);
  if (byName) return fromCanon(byName, 'avilist_english');
  const m = BINOMIAL.exec(name);
  if (!m) return null;
  const bin = (m[1] + ' ' + m[2]).toLowerCase(); // 아종명은 종 판정에 쓰지 않는다
  if (d.species.has(bin)) return fromCanon(bin, 'avilist_scientific');
  if (d.synonyms.has(bin)) return fromCanon(d.synonyms.get(bin), 'synonym_scientific');
  if (d.legacy.has(bin)) return fromCanon(bin, 'legacy_scientific');
  return null;
}
// 2025 한국조류목록에서 확인되는 이름인지(국명·학명·영명). 국제목록에서만 확인되는 이름은 false(관리자 화면에 확인 표시).
export const isListedBirdName = name => { const id = identifyBird(name); return !!id && ['official', 'scientific', 'english'].includes(id.kind); };
