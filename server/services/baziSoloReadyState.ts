/**
 * baziSoloReadyState — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-008, slice-1 minimal).
 *
 * THE state machine that decides whether a BaZi-solo run is `ready_for_shipping` or `BLOCKED`.
 * It is FAIL-CLOSED by construction: it runs the REQUIRED gates IN ORDER, collects every gate's
 * verdict, and returns `ready_for_shipping` ONLY when EVERY gate PASSES — any single failing gate
 * yields `BLOCKED` carrying the names of the gates that failed. There is no "mostly ready" state
 * and no path on which a missing/blocked upstream step is laundered into a ready verdict.
 *
 * It does NOT reimplement any pipeline step. It COMPOSES the existing, already-tested authorities:
 *   - {@link BaziSoloRunResult}        — the real FuFire run (raw bundle + run status), no mock.
 *   - {@link compileBaziSolo}'s result — the deterministic, lichun-verified overlay plan.
 *   - {@link renderBaziSoloSvg}'s result — the outlined SVG + per-token codepoint manifest.
 *   - {@link assertRenderBackIntegrity} — the pixel-truth render-back hard-gate (throws on drift).
 *
 * The six REQUIRED gates, evaluated in order:
 *   G1 raw_data_present      — `run.rawBundle.responses` is non-empty (honest FuFire data exists).
 *   G2 fufire_success        — `run.status !== "BLOCKED"` (the real run was not rejected).
 *   G3 hanzi_compiled        — `compileResult.status === "COMPILED"` (deterministic hanzi resolved).
 *   G4 lichun_verified       — compile did not block on lichun AND the lichun side (`isBeforeLichun`)
 *                              is present on the COMPILED plan (provenance carried through from ST-6).
 *   G5 render_back_integrity — `assertRenderBackIntegrity(overlayPlan, renderResult)` does not throw
 *                              (the rendered bytes ARE the verified codepoints — no substitution/Tofu).
 *   G6 golden_hash           — a stable digest of the rendered codepoint→path mapping equals the
 *                              pinned {@link EXPECTED_GOLDEN} for the known fixture pipeline. This is
 *                              the REGRESSION ANCHOR: a font/render drift that changes any glyph's
 *                              outline changes the digest → BLOCKED.
 *
 * Determinism (P4-friendly): the golden hash is computed purely from the rendered SVG + manifest
 * via sha256 over a sorted codepoint→path mapping — no `Date.now()`, no `Math.random()`, no I/O
 * beyond the font read that G5 already performs. The same inputs always yield the same verdict.
 */

import { createHash } from "node:crypto";

import type { BaziSoloRunResult } from "./baziSoloRunService";
import type { BaziSoloCompileResult } from "./baziSoloCompile";
import type { RenderBaziSoloResult } from "./baziSoloRenderer";
import {
  assertRenderBackIntegrity,
  type AssertRenderBackIntegrityOptions,
} from "./renderBackGate";

/** The required gates, in evaluation order. The order is part of the contract (G1 first, G6 last). */
export const BAZI_SOLO_READY_GATES = [
  "raw_data_present",
  "fufire_success",
  "hanzi_compiled",
  "lichun_verified",
  "render_back_integrity",
  "golden_hash",
] as const;

/** A single required gate's logical name. */
export type BaziSoloReadyGate = (typeof BAZI_SOLO_READY_GATES)[number];

/** A gate verdict — PASS only when the gate's invariant held; FAIL otherwise (fail-closed). */
export type GateVerdict = "PASS" | "FAIL";

/** The per-gate verdict map (every required gate is always present). */
export type BaziSoloReadyGates = Record<BaziSoloReadyGate, GateVerdict>;

/** The inputs to the state machine — the honest outputs of the run / compile / render steps. */
export interface BaziSoloReadyInputs {
  /** The real FuFire run result (raw bundle + run status). */
  run: BaziSoloRunResult;
  /** The compile step's result (COMPILED overlay plan, or a deterministic BLOCK). */
  compileResult: BaziSoloCompileResult;
  /** The render step's result (outlined SVG + per-token codepoint manifest). */
  renderResult: RenderBaziSoloResult;
}

/** Options for {@link evaluateBaziSoloReady}. */
export interface EvaluateBaziSoloReadyOptions extends AssertRenderBackIntegrityOptions {
  // (font-path override is inherited from AssertRenderBackIntegrityOptions; used by tests.)
}

/** A READY verdict — every gate passed. Carries the gate map + the matched golden anchor. */
export interface BaziSoloReady {
  status: "ready_for_shipping";
  gates: BaziSoloReadyGates;
  /** The rendered-mapping digest that matched {@link EXPECTED_GOLDEN}. */
  goldenHash: string;
}

/** A BLOCKED verdict — at least one gate failed. Carries the gate map + the failed gate names. */
export interface BaziSoloBlocked {
  status: "BLOCKED";
  gates: BaziSoloReadyGates;
  /** The gates that FAILED, in evaluation order. Always non-empty on a BLOCKED verdict. */
  failedGates: BaziSoloReadyGate[];
}

export type BaziSoloReadyResult = BaziSoloReady | BaziSoloBlocked;

/**
 * The pinned golden digest for the KNOWN fixture pipeline.
 *
 * Derivation: the digest of the rendered codepoint→path mapping produced by the REAL pipeline for
 * the POST-lichun 1990-02-06 fixture (`POST_LICHUN_BAZI`):
 *   compileBaziSolo(makeRun(POST_LICHUN_BAZI), { templateId: "bazi_solo_beijing_modern_v1" })
 *     → renderBaziSoloSvg(overlayPlan, { fontPath: assets/fonts/NotoSansSC.ttf })
 *     → goldenHashOf(renderResult)
 * with the bundled Noto Sans SC font (assets/fonts/NotoSansSC.ttf, OFL). Computed once from that
 * exact pipeline and pinned here; a font/render drift that changes any glyph outline changes this
 * digest and the golden_hash gate then BLOCKS. To re-pin after an INTENTIONAL font/layout change,
 * read the value the test reports for the faithful pipeline and replace this constant.
 */
export const EXPECTED_GOLDEN =
  "eb25b53a840b37327f63303312f76d96469336d0818cadc56c725cf4ff47f54d";

/**
 * Reverse the renderer's XML-attribute escaping so the extracted `d` is the raw path string —
 * mirrors renderBackGate's own unescape so the golden mapping is over the real outline bytes.
 */
function unescapeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/** Extract the embedded `<path d="…">` strings from the rendered SVG, in document order (unescaped). */
function extractEmbeddedPaths(svg: string): string[] {
  const matches = svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g);
  return Array.from(matches, (m) => unescapeXmlAttr(m[1]));
}

/**
 * Compute the deterministic golden digest of a render result.
 *
 * The mapping is `codepoint → the ACTUAL rendered path bytes`. We pair each manifest entry with the
 * SVG `<path>` emitted at the same index (the renderer emits exactly one path per manifest entry, in
 * order — the same 1:1 invariant render-back relies on), sha256 each path string, sort the pairs by
 * codepoint (then by path-hash, to keep duplicate codepoints stable), concat `codepoint:pathHash`
 * rows, and sha256 the whole. A change to ANY rendered outline changes exactly one row → the digest.
 *
 * Returns `undefined` when the manifest and SVG paths are not 1:1 (a structurally broken render that
 * cannot have a trustworthy golden — the gate then fails closed rather than hashing a mismatch).
 */
export function goldenHashOf(renderResult: RenderBaziSoloResult): string | undefined {
  const manifest = renderResult.codepointManifest;
  const paths = extractEmbeddedPaths(renderResult.svg);
  if (paths.length !== manifest.length) {
    return undefined; // manifest/SVG not 1:1 — no trustworthy mapping to hash.
  }

  const rows = manifest
    .map((entry, i) => {
      const pathHash = createHash("sha256").update(paths[i]).digest("hex");
      return { codepoint: entry.codepoint, pathHash };
    })
    .sort((a, b) =>
      a.codepoint !== b.codepoint
        ? a.codepoint - b.codepoint
        : a.pathHash.localeCompare(b.pathHash),
    )
    .map((r) => `${r.codepoint}:${r.pathHash}`)
    .join("|");

  return createHash("sha256").update(rows).digest("hex");
}

/**
 * Evaluate the BaZi-solo ready-state. Runs the six required gates in order, fail-closed.
 *
 * @param inputs the honest outputs of the run / compile / render steps.
 * @param opts   optional font-path override (forwarded to the render-back gate; used by tests).
 * @returns `ready_for_shipping` (with the matched `goldenHash`) iff EVERY gate passed; otherwise
 *          `BLOCKED` with the names of the gates that failed. The full gate map is always returned.
 */
export function evaluateBaziSoloReady(
  inputs: BaziSoloReadyInputs,
  opts: EvaluateBaziSoloReadyOptions = {},
): BaziSoloReadyResult {
  const { run, compileResult, renderResult } = inputs;

  // --- G1 raw_data_present: the run surfaced at least one honest FuFire response ------------
  const rawDataPresent = run.rawBundle.responses.length > 0;

  // --- G2 fufire_success: the real run was not rejected (never a mock fallback) -------------
  const fufireSuccess = run.status !== "BLOCKED";

  // --- G3 hanzi_compiled: deterministic hanzi resolved (compile did not fail closed) --------
  const hanziCompiled = compileResult.status === "COMPILED";

  // --- G4 lichun_verified: compile did not block on lichun AND the lichun side is present ----
  // The COMPILED plan carries `isBeforeLichun` (a boolean) only when the lichun hard-gate passed
  // and FuFire's provenance was consumed (ST-6). On a BLOCKED compile there is no plan ⇒ FAIL.
  const lichunVerified =
    compileResult.status === "COMPILED" &&
    typeof compileResult.overlayPlan.isBeforeLichun === "boolean";

  // --- G5 render_back_integrity: the rendered BYTES are the verified codepoints (no drift) ---
  // Only meaningful against a COMPILED plan; on a non-COMPILED compile there is nothing to verify
  // the render against, so the gate fails closed. assertRenderBackIntegrity throws on any violation
  // (including font-read failure), which is caught here as a FAIL — never a soft pass.
  let renderBackIntegrity = false;
  if (compileResult.status === "COMPILED") {
    try {
      assertRenderBackIntegrity(compileResult.overlayPlan, renderResult, opts);
      renderBackIntegrity = true;
    } catch {
      renderBackIntegrity = false;
    }
  }

  // --- G6 golden_hash: the rendered codepoint→path mapping matches the pinned anchor ---------
  // Computed from the actual rendered bytes; a drift in any glyph outline changes the digest.
  const goldenHash = goldenHashOf(renderResult);
  const goldenHashOk = goldenHash !== undefined && goldenHash === EXPECTED_GOLDEN;

  const gates: BaziSoloReadyGates = {
    raw_data_present: rawDataPresent ? "PASS" : "FAIL",
    fufire_success: fufireSuccess ? "PASS" : "FAIL",
    hanzi_compiled: hanziCompiled ? "PASS" : "FAIL",
    lichun_verified: lichunVerified ? "PASS" : "FAIL",
    render_back_integrity: renderBackIntegrity ? "PASS" : "FAIL",
    golden_hash: goldenHashOk ? "PASS" : "FAIL",
  };

  // Fail-closed: collect failures in the contractual gate order; ready ONLY when none failed.
  const failedGates = BAZI_SOLO_READY_GATES.filter((gate) => gates[gate] === "FAIL");

  if (failedGates.length === 0) {
    // goldenHashOk === true here implies goldenHash is a defined string.
    return { status: "ready_for_shipping", gates, goldenHash: goldenHash as string };
  }

  return { status: "BLOCKED", gates, failedGates };
}
