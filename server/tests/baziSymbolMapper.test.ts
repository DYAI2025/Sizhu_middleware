import { describe, it, expect } from "vitest";

/**
 * baziSymbolMapper — the deterministic BaZi symbol authority (FINDING-2).
 *
 * FuFire emits toneless-pinyin romanizations (stamm="Geng", zweig="Wu"). This module
 * is the SINGLE authoritative table mapping those romanizations → hanzi / pinyin /
 * wuxing / zodiac-animal, ROLE-KEYED.
 *
 * CRITICAL DESIGN — the role-keyed collision:
 *   "Wu" is BOTH a Heavenly Stem (戊 / Earth 土) AND an Earthly Branch (午 / Horse 马 / Fire 火).
 *   It is the ONLY cross-role collision in the 10-stem × 12-branch system. A naive single
 *   flat lookup would return one value for both roles and silently corrupt the other.
 *   Therefore lookups are SEPARATE per role: mapStem / mapBranch / mapWuxing / mapAnimal.
 *   `mapBranch("Wu")` MUST return 午 (Horse); `mapStem("Wu")` MUST return 戊 (Earth).
 *
 * Unknown tokens return a SOURCE_NEEDED sentinel — NEVER a guessed value (no fake success).
 *
 * STATUS: RED CONTRACT — `server/services/baziSymbolMapper.ts` does not exist yet.
 * The import drives the coder to create it.
 */

import {
  mapStem,
  mapBranch,
  mapWuxing,
  mapAnimal,
  STEMS,
  BRANCHES,
  type StemSymbol,
  type BranchSymbol,
  type WuxingSymbol,
  type SourceNeeded,
} from "../services/baziSymbolMapper";

const ALL_STEM_KEYS = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"];
const ALL_BRANCH_KEYS = [
  "Zi", "Chou", "Yin", "Mao", "Si", "Wu", "Wei", "Shen", "You", "Xu", "Hai",
  // "Chen" intentionally listed below to keep all 12 explicit
  "Chen",
];

const isSourceNeeded = (v: unknown): v is SourceNeeded =>
  typeof v === "object" && v !== null && (v as { status?: string }).status === "SOURCE_NEEDED";

describe("mapStem — Heavenly Stems", () => {
  it("mapStem('Geng') → 庚 / gēng / Metal 金", () => {
    const s = mapStem("Geng") as StemSymbol;
    expect(s.hanzi).toBe("庚");
    expect(s.pinyin).toBe("gēng");
    expect(s.wuxingHanzi).toBe("金");
    expect(s.wuxingPinyin).toBe("jīn");
    expect(s.wuxingEn).toBe("Metal");
  });

  it("all 10 stems are present and well-formed (table completeness)", () => {
    expect(Object.keys(STEMS).sort()).toEqual([...ALL_STEM_KEYS].sort());
    for (const key of ALL_STEM_KEYS) {
      const s = mapStem(key) as StemSymbol;
      expect(isSourceNeeded(s)).toBe(false);
      expect(s.hanzi).toMatch(/^.$/u);
      expect(s.pinyin.length).toBeGreaterThan(0);
      expect(s.wuxingHanzi.length).toBeGreaterThan(0);
      expect(s.wuxingPinyin.length).toBeGreaterThan(0);
      expect(["Wood", "Fire", "Earth", "Metal", "Water"]).toContain(s.wuxingEn);
    }
  });

  it("unknown stem token → SOURCE_NEEDED sentinel (no guessed value)", () => {
    const r = mapStem("Zzz");
    expect(isSourceNeeded(r)).toBe(true);
    expect((r as SourceNeeded).raw).toBe("Zzz");
  });
});

describe("mapBranch — Earthly Branches", () => {
  it("mapBranch('Shen') → 申 / Monkey 猴", () => {
    const b = mapBranch("Shen") as BranchSymbol;
    expect(b.hanzi).toBe("申");
    expect(b.animalHanzi).toBe("猴");
    expect(b.animalEn).toBe("Monkey");
    expect(b.animalDe).toBe("Affe");
    expect(b.wuxingHanzi).toBe("金");
  });

  it("all 12 branches are present and well-formed (table completeness)", () => {
    expect(Object.keys(BRANCHES).sort()).toEqual([...ALL_BRANCH_KEYS].sort());
    expect(ALL_BRANCH_KEYS.length).toBe(12);
    for (const key of ALL_BRANCH_KEYS) {
      const b = mapBranch(key) as BranchSymbol;
      expect(isSourceNeeded(b)).toBe(false);
      expect(b.hanzi).toMatch(/^.$/u);
      expect(b.animalEn.length).toBeGreaterThan(0);
      expect(b.animalDe.length).toBeGreaterThan(0);
      expect(b.animalHanzi).toMatch(/^.$/u);
    }
  });

  it("unknown branch token → SOURCE_NEEDED sentinel", () => {
    const r = mapBranch("Qqq");
    expect(isSourceNeeded(r)).toBe(true);
    expect((r as SourceNeeded).raw).toBe("Qqq");
  });
});

describe("FINDING-2 — the role-keyed 'Wu' collision (the key test)", () => {
  it("mapBranch('Wu') → 午 (Horse / 马 / Fire), NOT 戊", () => {
    const b = mapBranch("Wu") as BranchSymbol;
    expect(b.hanzi).toBe("午");
    expect(b.animalEn).toBe("Horse");
    expect(b.animalHanzi).toBe("马");
    expect(b.wuxingHanzi).toBe("火");
    // A flat lookup returning the Earth stem 戊 here would make this RED:
    expect(b.hanzi).not.toBe("戊");
  });

  it("mapStem('Wu') → 戊 (Earth / 土), NOT 午", () => {
    const s = mapStem("Wu") as StemSymbol;
    expect(s.hanzi).toBe("戊");
    expect(s.wuxingHanzi).toBe("土");
    expect(s.wuxingEn).toBe("Earth");
    expect(s.hanzi).not.toBe("午");
  });

  it("the two roles resolve 'Wu' to DIFFERENT hanzi — no flat map could satisfy both", () => {
    const stem = mapStem("Wu") as StemSymbol;
    const branch = mapBranch("Wu") as BranchSymbol;
    expect(stem.hanzi).not.toBe(branch.hanzi);
    expect(stem.hanzi).toBe("戊");
    expect(branch.hanzi).toBe("午");
  });
});

describe("mapWuxing — five phases (EN / DE / German FuFire value)", () => {
  it("mapWuxing('Metall') → 金 / jīn", () => {
    const w = mapWuxing("Metall") as WuxingSymbol;
    expect(w.hanzi).toBe("金");
    expect(w.pinyin).toBe("jīn");
    expect(w.en).toBe("Metal");
    expect(w.de).toBe("Metall");
  });

  it("resolves all three key forms (EN, DE, German FuFire value) to the same phase", () => {
    const cases: Array<[string, string]> = [
      ["Wood", "木"], ["Holz", "木"],
      ["Fire", "火"], ["Feuer", "火"],
      ["Earth", "土"], ["Erde", "土"],
      ["Metal", "金"], ["Metall", "金"],
      ["Water", "水"], ["Wasser", "水"],
    ];
    for (const [key, hanzi] of cases) {
      const w = mapWuxing(key) as WuxingSymbol;
      expect(isSourceNeeded(w)).toBe(false);
      expect(w.hanzi).toBe(hanzi);
    }
  });

  it("unknown wuxing value → SOURCE_NEEDED sentinel", () => {
    const r = mapWuxing("Plasma");
    expect(isSourceNeeded(r)).toBe(true);
    expect((r as SourceNeeded).raw).toBe("Plasma");
  });
});

describe("mapAnimal — zodiac animal by branch romanization", () => {
  it("mapAnimal('Zi') → Rat / Ratte / 鼠", () => {
    const a = mapAnimal("Zi") as BranchSymbol;
    expect(a.animalEn).toBe("Rat");
    expect(a.animalDe).toBe("Ratte");
    expect(a.animalHanzi).toBe("鼠");
  });

  it("unknown animal token → SOURCE_NEEDED sentinel", () => {
    const r = mapAnimal("Zzz");
    expect(isSourceNeeded(r)).toBe(true);
  });
});
