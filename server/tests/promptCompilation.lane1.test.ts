import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compileLane1,
  type CompiledTemplate,
} from "../services/promptCompilationService";

/**
 * RED CONTRACT — Lane-1 deterministic compile (NO LLM, NO network).
 * Feature: prompt-compile-preview · the deterministic placeholder-fill lane.
 *
 * compileLane1({ templateId, rawFuFireResponse }) turns a REAL FuFire bazi
 * response + a registered template into the filled placeholder payload the
 * image-generation lane consumes — using ONLY the existing deterministic
 * authorities (fufireResponseInterpreter.readCompileFields, baziSymbolMapper,
 * templateRegistryService). It never calls an LLM and never invents a value:
 * a SOURCE_NEEDED symbol leaves its placeholder unfilled and flags sourceStatus.
 *
 * Kritische semantische Glättung:
 *   These:      "It fills the placeholders from the FuFire response."
 *   Gegenthese: An unknown stem/branch could be papered over with a guessed
 *               hanzi (a plausible-but-wrong character) — every happy-path test
 *               stays green while a fabricated symbol ships onto a poster.
 *   Schärfung:  An unknown stem ⇒ sourceStatus shows SOURCE_NEEDED and NO guessed
 *               hanzi appears in the placeholder value. Determinism is asserted by
 *               deep-equality of two independent compiles of the same input.
 */

const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/** Minimal real-shaped bazi envelope helper (only the fields the compile reads). */
function baziEnvelope(stamm: string, zweig: string, opts?: { animalEn?: string }): unknown {
  return {
    data: {
      pillars: { year: { stamm, zweig, tier: "—", element: "Metall" } },
      chinese: { year: { animal: opts?.animalEn ?? "—" } },
      dates: {
        birth_local: "1990-06-15T14:30:00+02:00",
        birth_utc: "1990-06-15T12:30:00+00:00",
        lichun_local: "1990-02-04T03:14:00+01:00",
      },
      transition: { solar_year: 1990, is_before_lichun: false },
      provenance: {
        engine_version: "1.0.0-rc1",
        ruleset_id: "traditional_bazi_2026",
      },
    },
  };
}

describe("compileLane1 — deterministic Lane-1 compile", () => {
  it("(1) is deterministic — same input twice ⇒ deep-equal output", () => {
    const input = { templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") };
    const a = compileLane1(input);
    const b = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") });
    expect(a).toEqual(b);
  });

  it("(2) §6 reference — the REAL captured 1990 sample (Geng/Wu) maps to 庚午 / 马 / 金", () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../docs/contracts/fufire-samples/bazi.live.response.json"),
        "utf8",
      ),
    );
    const out: CompiledTemplate = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: raw });

    expect(out.templatePlaceholders["{{year_pillar_hanzi}}"]).toBe("庚午");
    expect(out.templatePlaceholders["{{year_stem_hanzi}}"]).toBe("庚");
    expect(out.templatePlaceholders["{{year_branch_hanzi}}"]).toBe("午");
    expect(out.templatePlaceholders["{{year_animal_hanzi}}"]).toBe("马"); // Horse
    expect(out.templatePlaceholders["{{year_element_hanzi}}"]).toBe("金"); // Metal
    expect(out.templatePlaceholders["{{year_pillar_pinyin}}"]).toBe("gēng wǔ");

    expect(out.variantId).toBe("BEIJING_MODERN_MAINLAND");
    expect(out.regionPolicy).toBe("CN_SIMPLIFIED");
    expect(out.negativeConstraints).toContain("no fake Chinese");
    expect(out.sourceStatus.yearStem).toBe("VERIFIED");
    expect(out.sourceStatus.yearBranch).toBe("VERIFIED");

    // fixed labels
    expect(out.templatePlaceholders["{{year_pillar_label_hanzi}}"]).toBe("年柱");
    expect(out.templatePlaceholders["{{year_pillar_label_pinyin}}"]).toBe("niánzhù");

    // raw data bindings record the FuFire source paths
    expect(out.rawDataBindings.yearStem).toBe("data.pillars.year.stamm");
    expect(out.rawDataBindings.yearBranch).toBe("data.pillars.year.zweig");

    // deterministic overlay plan mirrors §11 zones
    const zones = out.deterministicOverlayPlan.map((o) => o.zone);
    expect(zones).toContain("primary_year_pillar");
    expect(zones).toContain("zodiac_animal");
    expect(zones).toContain("wuxing_phase");
    expect(zones).toContain("provenance_footer");
  });

  it("(3) a Geng/Shen input maps to 庚申 / 猴 (Monkey)", () => {
    const out = compileLane1({
      templateId: TEMPLATE_ID,
      rawFuFireResponse: baziEnvelope("Geng", "Shen", { animalEn: "Monkey" }),
    });
    expect(out.templatePlaceholders["{{year_pillar_hanzi}}"]).toBe("庚申");
    expect(out.templatePlaceholders["{{year_animal_hanzi}}"]).toBe("猴");
  });

  it("(4) an unknown stem ⇒ sourceStatus SOURCE_NEEDED and NO guessed hanzi", () => {
    const out = compileLane1({
      templateId: TEMPLATE_ID,
      rawFuFireResponse: baziEnvelope("Nope", "Wu"),
    });
    expect(out.sourceStatus.yearStem).toBe("SOURCE_NEEDED");
    // No fabricated stem hanzi — the placeholder stays the literal token.
    expect(out.templatePlaceholders["{{year_stem_hanzi}}"]).toBe("{{year_stem_hanzi}}");
    // And the combined pillar must not invent a stem half either.
    expect(out.templatePlaceholders["{{year_pillar_hanzi}}"]).not.toBe("午"); // not silently branch-only
    expect(out.templatePlaceholders["{{year_pillar_hanzi}}"]).toBe("{{year_pillar_hanzi}}");
  });

  it("unknown templateId throws", () => {
    expect(() =>
      compileLane1({ templateId: "no_such_template", rawFuFireResponse: baziEnvelope("Geng", "Wu") }),
    ).toThrow();
  });
});
