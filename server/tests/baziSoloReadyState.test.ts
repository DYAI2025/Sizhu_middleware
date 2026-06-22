/**
 * baziSoloReadyState.test.ts — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-008, slice-1 minimal).
 *
 * The READY-vs-BLOCKED state machine. `evaluateBaziSoloReady({ run, compileResult, renderResult })`
 * runs the REQUIRED gates IN ORDER and is FAIL-CLOSED: a result is `ready_for_shipping` ONLY when
 * every gate PASSES; ANY failing gate → `BLOCKED` with the failed gate names. It does not
 * reimplement any pipeline step — it COMPOSES the real run / compile / render / render-back gates.
 *
 * The six required gates:
 *   G1 raw_data_present     — run.rawBundle.responses non-empty.
 *   G2 fufire_success       — run.status !== "BLOCKED".
 *   G3 hanzi_compiled       — compileResult.status === "COMPILED".
 *   G4 lichun_verified      — compile didn't block on lichun + isBeforeLichun present (ST-6).
 *   G5 render_back_integrity— assertRenderBackIntegrity(plan, render) does not throw.
 *   G6 golden_hash          — stable digest of the rendered codepoint→path mapping === golden.
 *
 * RED-first. Test (d) is the GOLDEN-DRIFT / RED-on-revert oracle: tamper one rendered glyph path
 * and the golden_hash gate must fail (status BLOCKED). If the golden_hash check is removed, that
 * drift slips through and the test goes RED — proving the gate is load-bearing.
 *
 * Built through the REAL compile→render pipeline against the real font. If the font is absent the
 * suite SKIPS-with-reason (it never false-passes by computing a golden over nothing).
 */

import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  evaluateBaziSoloReady,
  EXPECTED_GOLDEN,
  type BaziSoloReadyInputs,
} from "../services/baziSoloReadyState";
import { compileBaziSolo } from "../services/baziSoloCompile";
import { renderBaziSoloSvg } from "../services/baziSoloRenderer";
import type { BaziSoloRunResult } from "../services/baziSoloRunService";
import {
  POST_LICHUN_BAZI,
  type LichunFixture,
} from "./fixtures/lichun-pair.fixture";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FONT_PATH = resolve(REPO_ROOT, "assets/fonts/NotoSansSC.ttf");

/** The font is present + a real (≥1MB) font, not an error-page stub. */
const FONT_PRESENT = existsSync(FONT_PATH) && statSync(FONT_PATH).size > 1024 * 1024;
const describeIfFont = FONT_PRESENT ? describe : describe.skip;
if (!FONT_PRESENT) {
  // eslint-disable-next-line no-console
  console.warn(
    `[baziSoloReadyState.test] SKIPPED — font absent at ${FONT_PATH}. ` +
      "Fetch it (see assets/fonts/README.md) to run the ready-state gate.",
  );
}

const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/**
 * Wrap a raw FuFire bazi envelope into a realistic successful BaZiSoloRunResult — exactly the
 * shape `createBaziSoloRun` returns on success (mirrors baziSoloCompile.test.ts).
 */
function makeRun(
  baziEnvelope: LichunFixture,
  overrides: Partial<BaziSoloRunResult> = {},
): BaziSoloRunResult {
  return {
    runId: "bazi-solo-ready-0001",
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

/**
 * Drive the REAL compile→render pipeline for the known POST-lichun fixture and assemble the
 * ready-state inputs. This is the canonical faithful pipeline the golden hash is pinned to.
 */
function faithfulInputs(): BaziSoloReadyInputs {
  const run = makeRun(POST_LICHUN_BAZI);
  const compileResult = compileBaziSolo(run, { templateId: TEMPLATE_ID });
  if (compileResult.status !== "COMPILED") {
    throw new Error(`fixture precondition failed: compile is ${compileResult.status}`);
  }
  const renderResult = renderBaziSoloSvg(compileResult.overlayPlan, { fontPath: FONT_PATH });
  return { run, compileResult, renderResult };
}

describeIfFont("evaluateBaziSoloReady (REQ-F-008)", () => {
  describe("(a) faithful full pipeline → ready_for_shipping", () => {
    it("returns ready_for_shipping with all six gates PASS and goldenHash === EXPECTED_GOLDEN", () => {
      const result = evaluateBaziSoloReady(faithfulInputs(), { fontPath: FONT_PATH });

      expect(result.status).toBe("ready_for_shipping");
      if (result.status !== "ready_for_shipping") return; // type-narrow

      // every required gate passed
      expect(result.gates.raw_data_present).toBe("PASS");
      expect(result.gates.fufire_success).toBe("PASS");
      expect(result.gates.hanzi_compiled).toBe("PASS");
      expect(result.gates.lichun_verified).toBe("PASS");
      expect(result.gates.render_back_integrity).toBe("PASS");
      expect(result.gates.golden_hash).toBe("PASS");

      // the golden anchor matches the pinned constant
      expect(result.goldenHash).toBe(EXPECTED_GOLDEN);
    });

    it("is DETERMINISTIC — same inputs yield the same goldenHash (no clock / RNG)", () => {
      const a = evaluateBaziSoloReady(faithfulInputs(), { fontPath: FONT_PATH });
      const b = evaluateBaziSoloReady(faithfulInputs(), { fontPath: FONT_PATH });
      if (a.status !== "ready_for_shipping" || b.status !== "ready_for_shipping") {
        throw new Error("precondition: both faithful evaluations must be ready");
      }
      expect(a.goldenHash).toBe(b.goldenHash);
    });
  });

  describe("(b) a BLOCKED run → NOT ready (G1 / G2)", () => {
    it("BLOCKS and reports fufire_success + raw_data_present among failedGates", () => {
      const run = makeRun(POST_LICHUN_BAZI, {
        status: "BLOCKED",
        rawBundle: {
          requests: [],
          responses: [], // no raw data surfaced — the run was rejected
          gatewayIssues: [],
          warnings: [],
        },
      });
      // The downstream steps cannot have produced a real artifact from a blocked run, but the
      // state machine must reach its verdict from the gate inputs alone — compile/render still
      // ran on the (empty) bundle, so feed their honest results.
      const compileResult = compileBaziSolo(run, { templateId: TEMPLATE_ID });
      const inputs = {
        run,
        compileResult,
        // No render is produced when there is nothing to render; pass an empty render shape.
        renderResult: { svg: "<svg></svg>\n", codepointManifest: [], fontPostscriptName: "" },
      } satisfies BaziSoloReadyInputs;

      const result = evaluateBaziSoloReady(inputs, { fontPath: FONT_PATH });

      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.failedGates).toContain("fufire_success");
      expect(result.failedGates).toContain("raw_data_present");
      // fail-closed: a BLOCKED verdict NEVER carries a ready status.
      expect(result.status).not.toBe("ready_for_shipping");
    });
  });

  describe("(c) a compile BLOCKED (SOURCE_NEEDED) → NOT ready (G3)", () => {
    it("BLOCKS and reports hanzi_compiled among failedGates", () => {
      // A verified-anchor response (lichun passes) but an unknown ELEMENT → compileLane1
      // returns SOURCE_NEEDED → compile BLOCKS. The state machine must fail G3.
      const unknownElement: LichunFixture = {
        ...POST_LICHUN_BAZI,
        data: {
          ...POST_LICHUN_BAZI.data,
          pillars: {
            ...(POST_LICHUN_BAZI.data.pillars as Record<string, unknown>),
            year: {
              ...((POST_LICHUN_BAZI.data.pillars as Record<string, Record<string, unknown>>).year),
              element: "Plutonium", // not a WuXing phase → SOURCE_NEEDED
            },
          },
        },
      };
      const run = makeRun(unknownElement);
      const compileResult = compileBaziSolo(run, { templateId: TEMPLATE_ID });
      expect(compileResult.status).toBe("BLOCKED"); // precondition

      const result = evaluateBaziSoloReady(
        {
          run,
          compileResult,
          renderResult: { svg: "<svg></svg>\n", codepointManifest: [], fontPostscriptName: "" },
        },
        { fontPath: FONT_PATH },
      );

      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.failedGates).toContain("hanzi_compiled");
    });
  });

  describe("(d) GOLDEN drift → BLOCKED (golden_hash) — RED-on-revert oracle", () => {
    it("BLOCKS when a single rendered glyph path is tampered (drift the golden anchor)", () => {
      const inputs = faithfulInputs();
      // Tamper exactly ONE rendered path's `d` data — simulating a font/render drift that
      // changes a glyph's outline. The render-back gate (G5) would also catch this; this test
      // pins the golden_hash gate (G6) specifically by asserting it appears in failedGates.
      const tamperedSvg = inputs.renderResult.svg.replace(
        /(<path d=")([^"]+)(")/,
        (_m, pre, d, post) => `${pre}${d} 0 0${post}`, // append a no-op move → different bytes
      );
      const tampered: BaziSoloReadyInputs = {
        ...inputs,
        renderResult: { ...inputs.renderResult, svg: tamperedSvg },
      };

      const result = evaluateBaziSoloReady(tampered, { fontPath: FONT_PATH });

      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.failedGates).toContain("golden_hash");
    });

    it("the golden anchor is the actual rendered mapping — recomputing it equals EXPECTED_GOLDEN", () => {
      // Sanity: the faithful pipeline's goldenHash is EXACTLY the pinned constant, so the gate
      // is comparing against a real, derived anchor (not a vacuous always-pass).
      const result = evaluateBaziSoloReady(faithfulInputs(), { fontPath: FONT_PATH });
      if (result.status !== "ready_for_shipping") {
        throw new Error("precondition: faithful pipeline must be ready");
      }
      expect(result.goldenHash).toBe(EXPECTED_GOLDEN);
      expect(EXPECTED_GOLDEN).toMatch(/^[0-9a-f]{64}$/); // a real sha256 hex digest
    });
  });

  describe("(e) render-back tamper → NOT ready (G5)", () => {
    it("BLOCKS when the manifest is tampered so render-back integrity fails", () => {
      const inputs = faithfulInputs();
      // Corrupt the manifest's first entry codepoint so the render-back codepoint-set check
      // (and/or the per-entry recomputation) fails — assertRenderBackIntegrity throws → G5 fails.
      const manifest = inputs.renderResult.codepointManifest;
      const tamperedManifest = manifest.map((e, i) =>
        i === 0 ? { ...e, codepoint: 0x41 /* 'A' — not in the plan's CJK set */ } : e,
      );
      const tampered: BaziSoloReadyInputs = {
        ...inputs,
        renderResult: { ...inputs.renderResult, codepointManifest: tamperedManifest },
      };

      const result = evaluateBaziSoloReady(tampered, { fontPath: FONT_PATH });

      expect(result.status).toBe("BLOCKED");
      if (result.status !== "BLOCKED") return;
      expect(result.failedGates).toContain("render_back_integrity");
    });
  });

  describe("fail-closed invariant: ANY single failing gate ⇒ never ready_for_shipping", () => {
    it("a render-back failure alone keeps status BLOCKED (not ready)", () => {
      const inputs = faithfulInputs();
      const manifest = inputs.renderResult.codepointManifest;
      const tamperedManifest = manifest.map((e, i) =>
        i === 0 ? { ...e, codepoint: 0x42 } : e,
      );
      const result = evaluateBaziSoloReady(
        { ...inputs, renderResult: { ...inputs.renderResult, codepointManifest: tamperedManifest } },
        { fontPath: FONT_PATH },
      );
      expect(result.status).not.toBe("ready_for_shipping");
      if (result.status === "BLOCKED") {
        expect(result.failedGates.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
