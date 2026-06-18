/**
 * baziSymbolMapper — the deterministic BaZi symbol authority.
 *
 * FuFire emits toneless-pinyin romanizations for the Four Pillars (e.g. stamm="Geng",
 * zweig="Wu"). This module is the SINGLE authoritative source mapping those
 * romanizations to their canonical hanzi, toned pinyin, WuXing phase, and (for branches)
 * Chinese-zodiac animal — ROLE-KEYED.
 *
 * FINDING-2 — the role-keyed collision:
 *   "Wu" is BOTH a Heavenly Stem (戊 / Earth 土) AND an Earthly Branch (午 / Horse 马 / Fire 火).
 *   It is the ONLY cross-role collision in the 10-stem × 12-branch system. A single flat
 *   map keyed by romanization could only hold ONE "Wu" and would silently corrupt the
 *   other role. Therefore the lookups are SEPARATE per role:
 *     - mapStem(romanized)   → StemSymbol   ("Wu" → 戊 Earth)
 *     - mapBranch(romanized) → BranchSymbol ("Wu" → 午 Horse)
 *     - mapAnimal(romanized) → BranchSymbol (zodiac view of a branch)
 *     - mapWuxing(value)     → WuxingSymbol (EN | DE | German FuFire value)
 *   There is deliberately NO flat combined map.
 *
 * Unknown tokens return a SOURCE_NEEDED sentinel — never a guessed value (no fake success).
 */

export interface StemSymbol {
  readonly hanzi: string;
  readonly pinyin: string;
  readonly wuxingHanzi: string;
  readonly wuxingPinyin: string;
  readonly wuxingEn: string;
}

export interface BranchSymbol {
  readonly hanzi: string;
  readonly pinyin: string;
  readonly animalEn: string;
  readonly animalDe: string;
  readonly animalHanzi: string;
  readonly animalPinyin: string;
  readonly wuxingHanzi: string;
  readonly wuxingPinyin: string;
}

export interface WuxingSymbol {
  readonly hanzi: string;
  readonly pinyin: string;
  readonly en: string;
  readonly de: string;
}

export interface SourceNeeded {
  readonly status: "SOURCE_NEEDED";
  readonly raw: string;
}

const sourceNeeded = (raw: string): SourceNeeded => ({ status: "SOURCE_NEEDED", raw });

/**
 * 10 Heavenly Stems (天干), keyed by toneless-pinyin romanization as FuFire emits them.
 */
export const STEMS: Readonly<Record<string, StemSymbol>> = Object.freeze({
  Jia: { hanzi: "甲", pinyin: "jiǎ", wuxingHanzi: "木", wuxingPinyin: "mù", wuxingEn: "Wood" },
  Yi: { hanzi: "乙", pinyin: "yǐ", wuxingHanzi: "木", wuxingPinyin: "mù", wuxingEn: "Wood" },
  Bing: { hanzi: "丙", pinyin: "bǐng", wuxingHanzi: "火", wuxingPinyin: "huǒ", wuxingEn: "Fire" },
  Ding: { hanzi: "丁", pinyin: "dīng", wuxingHanzi: "火", wuxingPinyin: "huǒ", wuxingEn: "Fire" },
  Wu: { hanzi: "戊", pinyin: "wù", wuxingHanzi: "土", wuxingPinyin: "tǔ", wuxingEn: "Earth" },
  Ji: { hanzi: "己", pinyin: "jǐ", wuxingHanzi: "土", wuxingPinyin: "tǔ", wuxingEn: "Earth" },
  Geng: { hanzi: "庚", pinyin: "gēng", wuxingHanzi: "金", wuxingPinyin: "jīn", wuxingEn: "Metal" },
  Xin: { hanzi: "辛", pinyin: "xīn", wuxingHanzi: "金", wuxingPinyin: "jīn", wuxingEn: "Metal" },
  Ren: { hanzi: "壬", pinyin: "rén", wuxingHanzi: "水", wuxingPinyin: "shuǐ", wuxingEn: "Water" },
  Gui: { hanzi: "癸", pinyin: "guǐ", wuxingHanzi: "水", wuxingPinyin: "shuǐ", wuxingEn: "Water" },
});

/**
 * 12 Earthly Branches (地支), keyed by toneless-pinyin romanization as FuFire emits them.
 * NOTE the deliberate "Wu" → 午 (Horse) entry, distinct from the stem "Wu" → 戊.
 */
export const BRANCHES: Readonly<Record<string, BranchSymbol>> = Object.freeze({
  Zi: { hanzi: "子", pinyin: "zǐ", animalEn: "Rat", animalDe: "Ratte", animalHanzi: "鼠", animalPinyin: "shǔ", wuxingHanzi: "水", wuxingPinyin: "shuǐ" },
  Chou: { hanzi: "丑", pinyin: "chǒu", animalEn: "Ox", animalDe: "Ochse", animalHanzi: "牛", animalPinyin: "niú", wuxingHanzi: "土", wuxingPinyin: "tǔ" },
  Yin: { hanzi: "寅", pinyin: "yín", animalEn: "Tiger", animalDe: "Tiger", animalHanzi: "虎", animalPinyin: "hǔ", wuxingHanzi: "木", wuxingPinyin: "mù" },
  Mao: { hanzi: "卯", pinyin: "mǎo", animalEn: "Rabbit", animalDe: "Hase", animalHanzi: "兔", animalPinyin: "tù", wuxingHanzi: "木", wuxingPinyin: "mù" },
  Chen: { hanzi: "辰", pinyin: "chén", animalEn: "Dragon", animalDe: "Drache", animalHanzi: "龙", animalPinyin: "lóng", wuxingHanzi: "土", wuxingPinyin: "tǔ" },
  Si: { hanzi: "巳", pinyin: "sì", animalEn: "Snake", animalDe: "Schlange", animalHanzi: "蛇", animalPinyin: "shé", wuxingHanzi: "火", wuxingPinyin: "huǒ" },
  Wu: { hanzi: "午", pinyin: "wǔ", animalEn: "Horse", animalDe: "Pferd", animalHanzi: "马", animalPinyin: "mǎ", wuxingHanzi: "火", wuxingPinyin: "huǒ" },
  Wei: { hanzi: "未", pinyin: "wèi", animalEn: "Goat", animalDe: "Ziege", animalHanzi: "羊", animalPinyin: "yáng", wuxingHanzi: "土", wuxingPinyin: "tǔ" },
  Shen: { hanzi: "申", pinyin: "shēn", animalEn: "Monkey", animalDe: "Affe", animalHanzi: "猴", animalPinyin: "hóu", wuxingHanzi: "金", wuxingPinyin: "jīn" },
  You: { hanzi: "酉", pinyin: "yǒu", animalEn: "Rooster", animalDe: "Hahn", animalHanzi: "鸡", animalPinyin: "jī", wuxingHanzi: "金", wuxingPinyin: "jīn" },
  Xu: { hanzi: "戌", pinyin: "xū", animalEn: "Dog", animalDe: "Hund", animalHanzi: "狗", animalPinyin: "gǒu", wuxingHanzi: "土", wuxingPinyin: "tǔ" },
  Hai: { hanzi: "亥", pinyin: "hài", animalEn: "Pig", animalDe: "Schwein", animalHanzi: "猪", animalPinyin: "zhū", wuxingHanzi: "水", wuxingPinyin: "shuǐ" },
});

/**
 * 5 WuXing phases (五行), keyed by EN name, DE name, AND the German value FuFire emits.
 * (EN and DE forms coincide for the value FuFire sends, but all forms are accepted.)
 */
const WUXING_BY_KEY: Readonly<Record<string, WuxingSymbol>> = Object.freeze((() => {
  const phases: WuxingSymbol[] = [
    { hanzi: "木", pinyin: "mù", en: "Wood", de: "Holz" },
    { hanzi: "火", pinyin: "huǒ", en: "Fire", de: "Feuer" },
    { hanzi: "土", pinyin: "tǔ", en: "Earth", de: "Erde" },
    { hanzi: "金", pinyin: "jīn", en: "Metal", de: "Metall" },
    { hanzi: "水", pinyin: "shuǐ", en: "Water", de: "Wasser" },
  ];
  const map: Record<string, WuxingSymbol> = {};
  for (const phase of phases) {
    map[phase.en] = phase;
    map[phase.de] = phase;
  }
  return map;
})());

/** Look up a Heavenly Stem by its toneless-pinyin romanization (e.g. "Geng" → 庚). */
export function mapStem(romanized: string): StemSymbol | SourceNeeded {
  return STEMS[romanized] ?? sourceNeeded(romanized);
}

/** Look up an Earthly Branch by its toneless-pinyin romanization (e.g. "Wu" → 午 Horse). */
export function mapBranch(romanized: string): BranchSymbol | SourceNeeded {
  return BRANCHES[romanized] ?? sourceNeeded(romanized);
}

/** Look up the zodiac animal (a branch's animal view) by branch romanization (e.g. "Zi" → Rat). */
export function mapAnimal(romanized: string): BranchSymbol | SourceNeeded {
  return BRANCHES[romanized] ?? sourceNeeded(romanized);
}

/** Look up a WuXing phase by EN name, DE name, or the German value FuFire emits. */
export function mapWuxing(value: string): WuxingSymbol | SourceNeeded {
  return WUXING_BY_KEY[value] ?? sourceNeeded(value);
}
