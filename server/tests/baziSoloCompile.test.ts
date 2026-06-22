/**
 * baziSoloCompile.test.ts — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-004 / REQ-F-005).
 *
 * The deterministic compile STEP that turns a BaZi-solo run's raw FuFire response into a
 * deterministic, VERIFIED overlay-plan (hanzi + which token goes where). It composes the
 * three EXISTING authorities — `assertYearPillarProvenance` (lichun hard-gate),
 * `compileLane1` (deterministic placeholder lane), and (transitively) `baziSymbolMapper` —
 * and FAILS CLOSED on anything unknown/unverified. NO LLM, NO network ever touches this path.
 *
 * RED-first. The fail-closed test (b) is the RED-on-revert oracle: if the SOURCE_NEEDED
 * branch is removed, a guessed/blank glyph (or a literal `{{...}}` token) would leak into the
 * overlay plan instead of BLOCKING — and the assertion that no token contains "{{" / no glyph
 * is fabricated goes RED.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  compileBaziSolo,
  type BaziSoloCompileResult,
} from "../services/baziSoloCompile";
import type { BaziSoloRunResult } from "../services/baziSoloRunService";
import {
  POST_LICHUN_BAZI,
  PRE_LICHUN_BAZI,
  UNVERIFIED_ANCHOR_BAZI,
  type LichunFixture,
} from "./fixtures/lichun-pair.fixture";

const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/**
 * Wrap a raw FuFire bazi envelope into a realistic BaZiSoloRunResult — exactly the
 * shape `createBaziSoloRun` returns on success (the raw `{ operation:"bazi", data }`
 * lives in `rawBundle.responses`, mirroring the live FuFireDataService capture).
 */
function makeRun(
  baziEnvelope: LichunFixture,
  overrides: Partial<BaziSoloRunResult> = {},
): BaziSoloRunResult {
  return {
    runId: "bazi-solo-test-0001",
    status: "ok",
    readinessStatus: "READY",
    rawBundle: {
      requests: [{ operation: "bazi", body: { date: "1990-02-06T10:00:00+01:00" } }],
      responses: [{ operation: "bazi", data: baziEnvelope }],
      gatewayIssues: [],
      warnings: [],
    },
    ...overrides,
  };
}

describe("compileBaziSolo (REQ-F-004 / REQ-F-005)", () => {
  describe("(a) complete verified response → COMPILED with the expected deterministic hanzi", () => {
    it("compiles the POST-lichun subject to year pillar 庚午 (Geng/Wu) deterministically", () => {
      const result = compileBaziSolo(makeRun(POST_LICHUN_BAZI), { templateId: TEMPLATE_ID });

      expect(result.status).toBe("COMPILED");
      if (result.status !== "COMPILED") return; // type-narrow

      // Deterministic year pillar from the lichun guard (provenance, never a constant).
      expect(result.overlayPlan.yearPillarHanzi).toBe("庚午");
      expect(result.overlayPlan.isBeforeLichun).toBe(false);

      // The deterministic tokens carry the EXPECTED hanzi (Geng→庚, branch Wu→午, Horse→马, Metal→金).
      const byKey = Object.fromEntries(result.overlayPlan.tokens.map((t) => [t.key, t.hanzi]));
      expect(byKey["year_stem_hanzi"]).toBe("庚");
      expect(byKey["year_branch_hanzi"]).toBe("午");
      expect(byKey["year_pillar_hanzi"]).toBe("庚午");
      expect(byKey["year_animal_hanzi"]).toBe("马");
      expect(byKey["year_element_hanzi"]).toBe("金");

      // codepoints are derived from the actual emitted hanzi (renderer-ready).
      expect(result.overlayPlan.codepoints).toContain("庚".codePointAt(0));
      expect(result.overlayPlan.codepoints).toContain("午".codePointAt(0));

      // sources are surfaced (audit trail; from the lichun guard's provenance).
      expect(result.sources.yearStem).toContain("pillars.year.stamm");
      expect(result.sources.yearBranch).toContain("pillars.year.zweig");
    });

    it("is DETERMINISTIC — same input yields a deep-equal result", () => {
      const a = compileBaziSolo(makeRun(PRE_LICHUN_BAZI), { templateId: TEMPLATE_ID });
      const b = compileBaziSolo(makeRun(PRE_LICHUN_BAZI), { templateId: TEMPLATE_ID });
      expect(a).toEqual(b);
    });

    it("consumes FuFire's lichun-adjusted pillar — the PRE subject differs (己巳)", () => {
      const result = compileBaziSolo(makeRun(PRE_LICHUN_BAZI), { templateId: TEMPLATE_ID });
      expect(result.status).toBe("COMPILED");
      if (result.status !== "COMPILED") return;
      // Divergence oracle: a label-copied/hardcoded pillar would yield the SAME as POST.
      expect(result.overlayPlan.yearPillarHanzi).toBe("己巳");
      expect(result.overlayPlan.isBeforeLichun).toBe(true);
    });
  });

  describe("(b) unknown/missing romanization → BLOCKED SOURCE_NEEDED (fail-closed, RED-on-revert)", () => {
    it("BLOCKS when a year-pillar romanization is not a known FuFire token", () => {
      // A verified-anchor response (so the lichun gate passes) but with an UNKNOWN stem
      // token — the symbol mapper returns SOURCE_NEEDED for it. The compile MUST fail
      // closed rather than guess or blank a glyph.
      // Note: the lichun guard itself also maps the year pillar, so an unknown YEAR token
      // is caught there. To isolate the compileLane1 SOURCE_NEEDED branch we instead use a
      // verified year pillar but an unknown ELEMENT (which lane1 maps via mapWuxing and the
      // lichun guard does not touch) — proving the fail-closed branch lives in compileBaziSolo,
      // not only in the lichun guard.
      const unknownElement: LichunFixture = {
        ...POST_LICHUN_BAZI,
        data: {
          ...POST_LICHUN_BAZI.data,
          pillars: {
            ...(POST_LICHUN_BAZI.data.pillars as Record<string, unknown>),
            year: {
              ...((POST_LICHUN_BAZI.data.pillars as Record<string, Record<string, unknown>>)
                .year),
              element: "Plutonium", // not a WuXing phase → mapWuxing → SOURCE_NEEDED
            },
          },
        },
      };

      const result = compileBaziSolo(makeRun(unknownElement), { templateId: TEMPLATE_ID });

      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.reason).toBe("SOURCE_NEEDED");
      // No overlay plan is produced on a block (no leaked/guessed/blank glyph).
      expect("overlayPlan" in result).toBe(false);
      // The block names which field is unresolved (audit detail), never a fabricated value.
      expect(JSON.stringify(result.details)).toContain("element");
    });

    it("BLOCKS when an unknown year-pillar STEM token reaches the symbol mapper", () => {
      const unknownStem: LichunFixture = {
        ...POST_LICHUN_BAZI,
        data: {
          ...POST_LICHUN_BAZI.data,
          pillars: {
            ...(POST_LICHUN_BAZI.data.pillars as Record<string, unknown>),
            year: {
              ...((POST_LICHUN_BAZI.data.pillars as Record<string, Record<string, unknown>>)
                .year),
              stamm: "Qux", // unknown stem romanization → SOURCE_NEEDED
            },
          },
        },
      };

      const result = compileBaziSolo(makeRun(unknownStem), { templateId: TEMPLATE_ID });
      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      // Whether caught by the lichun guard (pillar) or lane1 (placeholder), it never COMPILES.
      expect(["SOURCE_NEEDED", "LICHUN_PILLAR_UNVERIFIED"]).toContain(result.reason);
    });

    it("never leaks a literal {{...}} placeholder token in a COMPILED overlay plan", () => {
      // Positive-control of the leak guard: a fully-verified response COMPILES and every
      // emitted token hanzi is a real glyph, never an unfilled `{{...}}` token.
      const result = compileBaziSolo(makeRun(POST_LICHUN_BAZI), { templateId: TEMPLATE_ID });
      expect(result.status).toBe("COMPILED");
      if (result.status !== "COMPILED") return;
      for (const tok of result.overlayPlan.tokens) {
        expect(tok.hanzi).not.toContain("{{");
        expect(tok.hanzi).not.toContain("}}");
        expect(tok.hanzi.length).toBeGreaterThan(0);
      }
    });
  });

  describe("(c) anchor unverified → BLOCKED LICHUN_PILLAR_UNVERIFIED", () => {
    it("BLOCKS (no fake) when the day-pillar anchor_verification is 'unverified'", () => {
      const result = compileBaziSolo(makeRun(UNVERIFIED_ANCHOR_BAZI), {
        templateId: TEMPLATE_ID,
      });
      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.reason).toBe("LICHUN_PILLAR_UNVERIFIED");
      expect("overlayPlan" in result).toBe(false);
    });

    it("BLOCKS LICHUN_PILLAR_UNVERIFIED when the raw bazi response is absent from the bundle", () => {
      const noBazi = makeRun(POST_LICHUN_BAZI, {
        rawBundle: {
          requests: [],
          responses: [], // no bazi op data at all
          gatewayIssues: [],
          warnings: [],
        },
      });
      const result = compileBaziSolo(noBazi, { templateId: TEMPLATE_ID });
      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.reason).toBe("LICHUN_PILLAR_UNVERIFIED");
    });
  });

  describe("(d) NO LLM / NO network in the compile path (static import guard)", () => {
    const moduleSource = readFileSync(
      new URL("../services/baziSoloCompile.ts", import.meta.url),
      "utf8",
    );

    it("does not import compileLane2 (the LLM prose lane)", () => {
      expect(moduleSource).not.toContain("compileLane2");
    });

    it("does not import an LLM / OpenRouter client or a network seam", () => {
      expect(moduleSource).not.toContain("openRouterGateway");
      expect(moduleSource).not.toContain("createOpenRouterProseClient");
      expect(moduleSource).not.toContain("LlmProseClient");
      expect(moduleSource).not.toMatch(/\bfetch\s*\(/);
      expect(moduleSource).not.toContain("import.meta.env");
      // No secret/env read on a pure deterministic compile path.
      expect(moduleSource).not.toContain("process.env");
    });

    it("imports ONLY the deterministic authorities it composes", () => {
      expect(moduleSource).toContain("promptCompilationService");
      expect(moduleSource).toContain("lichunPillarGuard");
    });
  });
});
