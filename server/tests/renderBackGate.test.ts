/**
 * renderBackGate.test.ts — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-009, NON-DEFERRABLE
 * hard-gate). The council's demand: TRUTH LIVES AT THE PIXEL. No prior gate reads back the
 * rendered bytes — this one does.
 *
 * `assertRenderBackIntegrity(overlayPlan, renderResult)` proves the rendered artifact's glyphs
 * ARE the exact expected codepoints — no substitution, no Tofu, nothing added or dropped:
 *   1. CODEPOINT-SET equality   — the manifest's unique codepoint set === overlayPlan.codepoints
 *                                 set (nothing added/dropped).
 *   2. RENDER-BACK byte-equality — for each manifest entry, recompute the font's outline for that
 *                                 codepoint (fontkit glyphForCodePoint(cp).path.toSVG()) and assert
 *                                 it BYTE-EQUALS the path actually embedded in renderResult.svg for
 *                                 that token, AND that entry.glyphId === glyphForCodePoint(cp).id
 *                                 (no glyph substitution between intent and output).
 *   3. NO TOFU                  — every glyphId !== 0.
 *   4. NFC IDEMPOTENCE          — every char === NFC(char).
 *
 * RED-first. The build of every plan/render here goes through the REAL compile + renderer with
 * the REAL font — never a mock. Test (b) is the RED-on-revert oracle: tamper one embedded path /
 * one glyphId / swap a token's codepoint and the gate MUST throw; if the byte-equality check is
 * removed, the tampered render passes and (b) goes RED.
 *
 * The font binary (assets/fonts/NotoSansSC.ttf) is git-ignored but present locally. If it is
 * absent in this env the suite SKIPS-with-reason — it never false-passes by checking nothing.
 */

import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertRenderBackIntegrity,
  RenderBackIntegrityError,
} from "../services/renderBackGate";
import { compileBaziSolo } from "../services/baziSoloCompile";
import {
  renderBaziSoloSvg,
  type RenderableOverlayPlan,
  type RenderBaziSoloResult,
} from "../services/baziSoloRenderer";
import type { BaziSoloRunResult } from "../services/baziSoloRunService";
import { POST_LICHUN_BAZI, type LichunFixture } from "./fixtures/lichun-pair.fixture";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FONT_PATH = resolve(REPO_ROOT, "assets/fonts/NotoSansSC.ttf");
const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/** The font is present + a real (≥1MB) font, not an error-page stub. */
const FONT_PRESENT = existsSync(FONT_PATH) && statSync(FONT_PATH).size > 1024 * 1024;
const describeIfFont = FONT_PRESENT ? describe : describe.skip;
if (!FONT_PRESENT) {
  // eslint-disable-next-line no-console
  console.warn(
    `[renderBackGate.test] SKIPPED — font absent at ${FONT_PATH}. ` +
      "Fetch it (see assets/fonts/README.md) to run the render-back gate.",
  );
}

/** Wrap a raw FuFire bazi envelope into a realistic BaZiSoloRunResult (mirrors the compile test). */
function makeRun(baziEnvelope: LichunFixture): BaziSoloRunResult {
  return {
    runId: "render-back-gate-test-0001",
    status: "ok",
    readinessStatus: "READY",
    rawBundle: {
      requests: [{ operation: "bazi", body: { date: "1990-02-06T10:00:00+01:00" } }],
      responses: [{ operation: "bazi", data: baziEnvelope }],
      gatewayIssues: [],
      warnings: [],
    },
  } as BaziSoloRunResult;
}

/** Compile + render the POST-lichun subject through the REAL pipeline (no mocks). */
function compileAndRender(): {
  overlayPlan: RenderableOverlayPlan;
  renderResult: RenderBaziSoloResult;
} {
  const compiled = compileBaziSolo(makeRun(POST_LICHUN_BAZI), { templateId: TEMPLATE_ID });
  if (compiled.status !== "COMPILED") {
    throw new Error(`fixture did not COMPILE: ${JSON.stringify(compiled)}`);
  }
  const overlayPlan = compiled.overlayPlan;
  const renderResult = renderBaziSoloSvg(overlayPlan, { fontPath: FONT_PATH });
  return { overlayPlan, renderResult };
}

/** Deep-clone a render result so a tamper test never mutates the shared fixture. */
function cloneRender(r: RenderBaziSoloResult): RenderBaziSoloResult {
  return {
    svg: r.svg,
    fontPostscriptName: r.fontPostscriptName,
    codepointManifest: r.codepointManifest.map((e) => ({ ...e })),
  };
}

describeIfFont("assertRenderBackIntegrity (REQ-F-009 — truth at the pixel)", () => {
  it("(a) a FAITHFUL render (real compile → real renderer → gate) returns { ok: true }", () => {
    const { overlayPlan, renderResult } = compileAndRender();
    expect(assertRenderBackIntegrity(overlayPlan, renderResult, { fontPath: FONT_PATH })).toEqual({
      ok: true,
    });
  });

  describe("(b) TAMPER — a divergence between intent and output is caught (RED-on-revert)", () => {
    it("THROWS RENDER_BACK_MISMATCH when one token's embedded path is mutated", () => {
      const { overlayPlan, renderResult } = compileAndRender();
      const tampered = cloneRender(renderResult);
      // Corrupt the FIRST embedded <path d="…"> — flip the leading moveto coordinate. The glyphId
      // and codepoint are untouched, so ONLY the render-back byte-equality check can catch this.
      tampered.svg = tampered.svg.replace(/(<path\b[^>]*\bd=")M(\d)/, "$1M9$2");
      expect(tampered.svg).not.toBe(renderResult.svg); // the mutation actually landed

      let thrown: unknown;
      try {
        assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(RenderBackIntegrityError);
      expect((thrown as RenderBackIntegrityError).code).toBe("RENDER_BACK_MISMATCH");
      // Names the failing token (audit detail).
      expect((thrown as RenderBackIntegrityError).message).toContain(
        renderResult.codepointManifest[0].key,
      );
    });

    it("THROWS RENDER_BACK_MISMATCH when one manifest entry's glyphId is swapped to another glyph", () => {
      const { overlayPlan, renderResult } = compileAndRender();
      const tampered = cloneRender(renderResult);
      // Claim a DIFFERENT (still > 0) glyph id than the codepoint actually resolves to — a glyph
      // substitution that the glyphId-vs-glyphForCodePoint(cp).id check must reject.
      tampered.codepointManifest[0].glyphId = renderResult.codepointManifest[0].glyphId + 1;

      expect(() =>
        assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH }),
      ).toThrow(RenderBackIntegrityError);
      expect(() =>
        assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH }),
      ).toThrow(/RENDER_BACK_MISMATCH/);
    });

    it("THROWS CODEPOINT_SET_MISMATCH when a token's codepoint is swapped (plan/render diverge)", () => {
      const { overlayPlan, renderResult } = compileAndRender();
      const tampered = cloneRender(renderResult);
      // Swap the first entry's codepoint to one NOT in the plan's codepoint set (馬, U+99AC —
      // the traditional form, not the simplified 马 the plan emitted).
      const intruder = "馬".codePointAt(0) as number;
      expect(overlayPlan.codepoints).not.toContain(intruder);
      tampered.codepointManifest[0] = {
        ...tampered.codepointManifest[0],
        codepoint: intruder,
        char: "馬",
      };

      let thrown: unknown;
      try {
        assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(RenderBackIntegrityError);
      expect((thrown as RenderBackIntegrityError).code).toBe("CODEPOINT_SET_MISMATCH");
    });
  });

  it("(c) THROWS CODEPOINT_SET_MISMATCH when a codepoint is DROPPED from the manifest", () => {
    const { overlayPlan, renderResult } = compileAndRender();
    const tampered = cloneRender(renderResult);
    // Drop the manifest entry for a codepoint that appears EXACTLY once, so its codepoint leaves
    // the manifest's unique set entirely (年 U+5E74 — the pillar-label char, single occurrence).
    const dropCp = "年".codePointAt(0) as number;
    expect(overlayPlan.codepoints).toContain(dropCp);
    tampered.codepointManifest = tampered.codepointManifest.filter((e) => e.codepoint !== dropCp);
    expect(tampered.codepointManifest.length).toBeLessThan(renderResult.codepointManifest.length);

    let thrown: unknown;
    try {
      assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(RenderBackIntegrityError);
    expect((thrown as RenderBackIntegrityError).code).toBe("CODEPOINT_SET_MISMATCH");
    expect((thrown as RenderBackIntegrityError).message).toMatch(/5E74|年|drop|missing/i);
  });

  it("(d) THROWS TOFU_GLYPH when a manifest entry carries glyphId 0 (.notdef)", () => {
    const { overlayPlan, renderResult } = compileAndRender();
    const tampered = cloneRender(renderResult);
    // A .notdef (Tofu) glyph — must never be claimed as a rendered glyph.
    tampered.codepointManifest[0].glyphId = 0;

    let thrown: unknown;
    try {
      assertRenderBackIntegrity(overlayPlan, tampered, { fontPath: FONT_PATH });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(RenderBackIntegrityError);
    expect((thrown as RenderBackIntegrityError).code).toBe("TOFU_GLYPH");
    expect((thrown as RenderBackIntegrityError).message).toContain(
      renderResult.codepointManifest[0].key,
    );
  });
});
