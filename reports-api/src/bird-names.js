// 종명 식별: 공식 국명·학명·영명으로 같은 종을 알아본다. 제보 원문은 바꾸지 않고, 비교용 키만 만든다.
// 이 판정은 "공개 여부"가 아니라 "식별 가능한 이름인지"만 본다. 희귀·미조·미기록 가능종이라는 이유로 거르지 않으며,
// 어떤 이름도 "국내 미기록종"으로 확정하지 않는다.
import { OFFICIAL_BIRD_NAMES } from './official-bird-names.js';
import { BIRD_NAME_TABLE } from './official-bird-aliases.js';
import { IOC_SPECIES, IOC_ENGLISH } from './ioc-taxa.js';
import { CROSSWALK_SYNONYMS, CROSSWALK_EXTRA } from './ioc-crosswalk.js';

const official = new Set(OFFICIAL_BIRD_NAMES);
const byScientific = new Map(BIRD_NAME_TABLE.map(([ko, sci]) => [sci.toLowerCase(), ko]));
const byEnglish = new Map(BIRD_NAME_TABLE.map(([ko, , eng]) => [eng.toLowerCase(), ko]));
const aliasesByKorean = new Map(BIRD_NAME_TABLE.map(([ko, sci, eng]) => [ko, [ko, sci, eng]]));
// 2025 목록 밖 이름은 국제 분류목록(IOC World Bird List)과 대조한다. 형식만 맞는다고 실존 종으로 확정하지 않는다.
const IOC = new Map(); // 속명(소문자) → 종소명 Set
for (const part of IOC_SPECIES.split(';')) { const [g, e] = part.split(':'); IOC.set(g.toLowerCase(), new Set(e.split(','))); }
const IOC_BY_ENGLISH = new Map(IOC_ENGLISH.split(String.fromCharCode(10)).map(l => l.split('|')).map(([eng, bin]) => [eng.toLowerCase(), bin]));
const IOC_ENGLISH_OF = new Map([...IOC_BY_ENGLISH].map(([eng, bin]) => [bin.toLowerCase(), eng]));
// 다른 분류목록(AviList v2025·Clements v2025·HBW/BirdLife·Howard&Moore·Peters)의 학명 → IOC 학명 동의어, IOC 에는 없고 다른 목록에만 있는 종.
const isIocSpecies = bin => { const [g, e] = bin.split(' '); return !!IOC.get(g)?.has(e); };
// IOC 현존 종으로 이어지는 동의어만 쓴다(멸종종으로 이어지는 항목은 제외).
const SYNONYM = new Map(CROSSWALK_SYNONYMS.split(';').map(x => x.split('>')).filter(([syn, canon]) => isIocSpecies(canon) && !isIocSpecies(syn)).map(([syn, canon]) => [syn, canon]));
const SYNONYMS_OF = new Map();
for (const [syn, canon] of SYNONYM) SYNONYMS_OF.set(canon, [...(SYNONYMS_OF.get(canon) || []), syn]);
const OTHER_LIST_ONLY = new Set(CROSSWALK_EXTRA.split(';').map(x => x.split('>')[0]));
const BINOMIAL = /^([A-Za-z][a-z]{2,}) ([a-z]{2,})(?: [a-z]{2,})?$/; // 속 종소명 [아종명]
const clean = name => String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');

// 반환: { key, kind, aliases } 또는 null(식별 불가). 같은 종의 국명·학명·영명은 같은 key 를 가진다.
// kind: official | scientific | english(2025 한국 목록) | ioc_scientific | ioc_english(IOC 15.2 에서 확인) |
//       synonym_scientific(다른 분류목록의 학명을 IOC 학명으로 연결) | other_list_scientific(IOC 에는 없고 AviList/Clements 등에만 있는 종)
//       scientific_genus_only(속은 맞으나 종소명이 어느 목록에도 없음: 실존 종으로 판정하지 않음 → 호출 쪽에서 관리자 검토)
// 속명이 IOC 에도 없거나 형식이 아니면 null → 관리자 검토. 어떤 이름도 "국내 미기록종"으로 확정하지 않는다.
// 한국 목록과 IOC 는 속·학명이 다른 종이 있다(예: Charadrius dubius ↔ Thinornis dubius). 영명이 같으면 같은 종으로 이어, 두 학명을 모두 별칭으로 둔다.
const iocBinomialsOfKorean = new Map();
const addIoc = (ko, bin) => iocBinomialsOfKorean.set(ko, [...(iocBinomialsOfKorean.get(ko) || []), bin, ...(SYNONYMS_OF.get(bin) || [])]);
for (const [eng, bin] of IOC_BY_ENGLISH) { const ko = byEnglish.get(eng); if (ko) addIoc(ko, bin.toLowerCase()); }
for (const [, sci] of BIRD_NAME_TABLE) { const canon = SYNONYM.get(sci.toLowerCase()); if (canon) addIoc(byScientific.get(sci.toLowerCase()), canon); }
const fromKorean = ko => ({ key: ko, aliases: [...new Set([...aliasesByKorean.get(ko).map(a => a.toLowerCase()), ...(iocBinomialsOfKorean.get(ko) || [])])] });
function fromBinomial(bin, lower, kind) {
  const eng = IOC_ENGLISH_OF.get(bin);
  const ko = byScientific.get(bin) || (eng && byEnglish.get(eng));
  if (ko) return { ...fromKorean(ko), kind };
  return { key: bin, kind, aliases: [bin, ...(eng ? [eng] : []), ...(SYNONYMS_OF.get(bin) || [])] };
}
export function identifyBird(rawName) {
  const name = clean(rawName);
  if (!name) return null;
  if (official.has(name)) return { ...fromKorean(name), kind: 'official' };
  const lower = name.toLowerCase();
  const sci = byScientific.get(lower);
  if (sci) return { ...fromKorean(sci), kind: 'scientific' };
  const eng = byEnglish.get(lower);
  if (eng) return { ...fromKorean(eng), kind: 'english' };
  const iocEng = IOC_BY_ENGLISH.get(lower);
  if (iocEng) return fromBinomial(iocEng.toLowerCase(), lower, 'ioc_english');
  const m = BINOMIAL.exec(name);
  if (!m) return null;
  const bin = (m[1] + ' ' + m[2]).toLowerCase(), epithets = IOC.get(m[1].toLowerCase());
  if (!epithets) {
    if (SYNONYM.has(bin)) return fromBinomial(SYNONYM.get(bin), lower, 'synonym_scientific');
    return OTHER_LIST_ONLY.has(bin) ? { key: bin, kind: 'other_list_scientific', aliases: [bin] } : null;
  }
  if (epithets.has(m[2])) return fromBinomial(bin, lower, 'ioc_scientific');
  if (SYNONYM.has(bin)) return fromBinomial(SYNONYM.get(bin), lower, 'synonym_scientific');
  if (OTHER_LIST_ONLY.has(bin)) return { key: bin, kind: 'other_list_scientific', aliases: [bin] };
  // 속만 맞고 종소명이 어느 목록에도 없다: 실존 종으로 판정하지 않는다(원문 보존, 관리자 검토).
  return { key: lower, kind: 'scientific_genus_only', aliases: [lower] };
}
// 2025 한국조류목록에서 확인되는 이름인지(국명·학명·영명). IOC 에서만 확인되거나 속만 맞는 이름은 false(관리자 화면에 확인 표시).
export const isListedBirdName = name => { const id = identifyBird(name); return !!id && ['official', 'scientific', 'english'].includes(id.kind); };
