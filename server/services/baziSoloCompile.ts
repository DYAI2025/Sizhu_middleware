/**
 * baziSoloCompile — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-004 / REQ-F-005).
 *
 * The deterministic compile STEP. It turns a BaZi-solo run's RAW FuFire bazi response into a
 * deterministic, VERIFIED overlay-plan — the hanzi for each Year-Pillar token and WHERE each
 * token goes — that the SVG renderer (next task) consumes. There is NO LLM and NO network on
 * this path: characters come ONLY from the deterministic symbol authority, never a model.
 *
 * It does not reimplement anything; it COMPOSES three existing deterministic authorities:
 *   - {@link assertYearPillarProvenance} (lichunPillarGuard) — the non-deferrable lichun
 *     hard-gate. Runs FIRST: blocks on an unverified/absent day-pillar anchor (REQ-F-010) and
 *     returns the lichun-adjusted `yearPillarHanzi` + `isBeforeLichun` from FuFire's provenance.
 *   - {@link compileLane1} (promptCompilationService) — the deterministic, NO-LLM placeholder
 *     lane. Maps every Year-Pillar romanization → hanzi via the symbol mapper and reports a
 *     per-field `sourceStatus` + keeps unresolved placeholders as their literal `{{...}}` token.
 *   - (transitively) baziSymbolMapper — the single symbol authority; an unknown token yields
 *     SOURCE_NEEDED, never a guessed glyph.
 *
 * Fail-closed (REQ-F-005), in order:
 *   1. No raw bazi response in the bundle ⇒ BLOCKED `LICHUN_PILLAR_UNVERIFIED` (cannot prove
 *      a lichun-adjusted pillar from nothing — we never fabricate one).
 *   2. The lichun guard throws (unverified anchor / missing pillar / unknown year token) ⇒
 *      BLOCKED `LICHUN_PILLAR_UNVERIFIED`.
 *   3. compileLane1 reports ANY `SOURCE_NEEDED` field, OR any rendered overlay value still
 *      carries a literal `{{...}}` placeholder token ⇒ BLOCKED `SOURCE_NEEDED`. A guessed or
 *      blank glyph can therefore never reach the overlay plan.
 *
 * Only when every gate passes does it return `{ status: "COMPILED", overlayPlan, sources }`.
 *
 * Pure: no env/secret access, no I/O, no clock, no RNG — the same run always yields a deep-equal
 * result (it cannot leak a secret because it never reads one).
 */

import {
  assertYearPillarProvenance,
  LichunPillarBlockedError,
} from "./lichunPillarGuard";
import {
  compileLane1,
  type CompiledTemplate,
  type DeterministicOverlayItem,
} from "./promptCompilationService";
import type { BaziSoloRunResult } from "./baziSoloRunService";

/** Greppable, deterministic block reasons (mirrors the run service's reason discipline). */
export const BAZI_SOLO_COMPILE_BLOCK_REASONS = {
  /** The lichun hard-gate refused: unverified/absent anchor, missing/unknown year pillar. */
  LICHUN_PILLAR_UNVERIFIED: "LICHUN_PILLAR_UNVERIFIED",
  /** A deterministic symbol was unresolved (unknown romanization / unfilled placeholder). */
  SOURCE_NEEDED: "SOURCE_NEEDED",
} as const;

export type BaziSoloCompileBlockReason =
  (typeof BAZI_SOLO_COMPILE_BLOCK_REASONS)[keyof typeof BAZI_SOLO_COMPILE_BLOCK_REASONS];

/** Options for {@link compileBaziSolo}. */
export interface CompileBaziSoloOptions {
  /** Registered poster-template id (selects variant + negative constraints). */
  templateId: string;
  /** Render locale; selects the (paired) animal source. Defaults to "en". */
  locale?: string;
}

/** A single deterministic overlay token — a hanzi and where it renders (renderer contract). */
export interface OverlayToken {
  /** Logical placeholder key, e.g. "year_stem_hanzi" (NOT the `{{...}}` wrapper). */
  key: string;
  /** The deterministic hanzi for this token (always a real glyph on a COMPILED result). */
  hanzi: string;
  /** Overlay zone the renderer paints this token into. */
  zone: string;
  /** Render order within the plan (lower = earlier / higher priority). */
  priority: number;
  /** Toned pinyin for this token, when the lane produced one. */
  pinyin?: string;
}

/** The deterministic, verified overlay plan the SVG renderer consumes. */
export interface BaziSoloOverlayPlan {
  /** Ordered deterministic tokens (hanzi + zone + priority). */
  tokens: OverlayToken[];
  /** The lichun-adjusted Year-Pillar hanzi (e.g. "庚午"), from the lichun guard. */
  yearPillarHanzi: string;
  /** The lichun side FuFire reported, consumed verbatim. */
  isBeforeLichun: boolean;
  /** Unicode code points of every emitted token glyph (renderer font-coverage check). */
  codepoints: number[];
  /** Registered template variant this plan was compiled for. */
  variantId: string;
}

/** A successful compile — the deterministic, verified overlay plan + its provenance sources. */
export interface BaziSoloCompileCompiled {
  status: "COMPILED";
  overlayPlan: BaziSoloOverlayPlan;
  /** Source paths the values were read from (audit trail; from the lichun guard provenance). */
  sources: Record<string, string>;
}

/** A blocked compile — a deterministic, greppable reason + audit details. NEVER a fake plan. */
export interface BaziSoloCompileBlocked {
  status: "BLOCKED";
  reason: BaziSoloCompileBlockReason;
  /** Human-/grep-readable detail (which field/anchor was unresolved). Never a fabricated value. */
  details: string;
}

export type BaziSoloCompileResult =
  | BaziSoloCompileCompiled
  | BaziSoloCompileBlocked;

/**
 * Locate the RAW bazi response data from the run's honest bundle. The bundle stores each op
 * as `{ operation, data?, error? }` (mirroring FuFireDataService); we read the `bazi` op's
 * `data` (the `{ _note, data }` envelope). Absent / errored ⇒ `undefined` (never fabricated).
 */
function findBaziResponse(run: BaziSoloRunResult): unknown {
  const entry = run.rawBundle.responses.find(
    (r) => r.operation === "bazi" && "data" in r && r.data !== undefined,
  );
  return entry?.data;
}

/** True when a compileLane1 overlay value still carries an unfilled `{{...}}` placeholder. */
function hasLiteralPlaceholder(value: string): boolean {
  return value.includes("{{") || value.includes("}}");
}

/**
 * Project the §11 deterministic overlay items (which already carry zone + priority + the
 * resolved value) into the renderer's {@link OverlayToken} contract, keyed by logical key.
 */
function toOverlayToken(item: DeterministicOverlayItem): OverlayToken {
  // `placeholder` is the literal "{{key}}" token — recover the logical key for the renderer.
  const key = item.placeholder.replace(/^\{\{/, "").replace(/\}\}$/, "");
  return {
    key,
    hanzi: item.value,
    zone: item.zone,
    priority: item.priority,
    ...(item.pinyinValue !== undefined ? { pinyin: item.pinyinValue } : {}),
  };
}

const SOURCE_NEEDED_STATUS = "SOURCE_NEEDED";

/**
 * Compile a BaZi-solo run's raw FuFire response into a deterministic, verified overlay plan,
 * or fail closed. See the module header for the gate order and the no-LLM/no-network invariant.
 *
 * @param run   a successful {@link BaziSoloRunResult} (the raw bazi envelope lives in
 *              `rawBundle.responses`).
 * @param opts  the registered template id + optional render locale.
 * @returns a {@link BaziSoloCompileResult} — `COMPILED` with the plan, or `BLOCKED` with a
 *          deterministic, greppable reason. Never a guessed glyph, never an LLM call.
 */
export function compileBaziSolo(
  run: BaziSoloRunResult,
  opts: CompileBaziSoloOptions,
): BaziSoloCompileResult {
  const blocked = (
    reason: BaziSoloCompileBlockReason,
    details: string,
  ): BaziSoloCompileBlocked => ({ status: "BLOCKED", reason, details });

  // --- 0. Locate the honest raw bazi response (never fabricated) -------------------------
  const rawBazi = findBaziResponse(run);
  if (rawBazi === undefined) {
    return blocked(
      BAZI_SOLO_COMPILE_BLOCK_REASONS.LICHUN_PILLAR_UNVERIFIED,
      "no bazi response present in the run bundle — cannot prove a lichun-adjusted pillar",
    );
  }

  // --- 1. Lichun hard-gate FIRST (REQ-F-010): blocks on unverified anchor / missing pillar --
  let provenance;
  try {
    provenance = assertYearPillarProvenance(rawBazi);
  } catch (err) {
    if (err instanceof LichunPillarBlockedError) {
      return blocked(BAZI_SOLO_COMPILE_BLOCK_REASONS.LICHUN_PILLAR_UNVERIFIED, err.message);
    }
    throw err; // a non-guard error is a real fault — never laundered into a block.
  }

  // --- 2. Deterministic placeholder lane (NO LLM): map every romanization → hanzi ----------
  let compiled: CompiledTemplate;
  try {
    compiled = compileLane1({
      templateId: opts.templateId,
      rawFuFireResponse: rawBazi,
      locale: opts.locale,
    });
  } catch (err) {
    // An unknown templateId is fail-closed in compileLane1 (it throws). Surface verbatim.
    const message = err instanceof Error ? err.message : String(err);
    return blocked(BAZI_SOLO_COMPILE_BLOCK_REASONS.SOURCE_NEEDED, message);
  }

  // --- 3a. Fail-closed on any unresolved deterministic SYMBOL (REQ-F-005) ------------------
  // `lichun` may legitimately be API_VERIFIED_REQUIRED-shaped, but the lichun guard already
  // proved the anchor is verified above; any SOURCE_NEEDED here is a genuinely unknown glyph.
  const unresolvedFields = Object.entries(compiled.sourceStatus)
    .filter(([, status]) => status === SOURCE_NEEDED_STATUS)
    .map(([field]) => field);
  if (unresolvedFields.length > 0) {
    return blocked(
      BAZI_SOLO_COMPILE_BLOCK_REASONS.SOURCE_NEEDED,
      `unresolved deterministic symbol(s): ${unresolvedFields.join(", ")} — refusing to guess a glyph`,
    );
  }

  // --- 3b. Leak guard: NO overlay value may still be a literal {{...}} placeholder ---------
  // Belt-and-braces with 3a — if the SOURCE_NEEDED branch above were ever removed, an unfilled
  // token would survive here, so the plan still cannot ship a blank/literal glyph (RED-on-revert).
  const leaked = compiled.deterministicOverlayPlan.find(
    (item) => hasLiteralPlaceholder(item.value),
  );
  if (leaked) {
    return blocked(
      BAZI_SOLO_COMPILE_BLOCK_REASONS.SOURCE_NEEDED,
      `unfilled placeholder leaked into overlay zone "${leaked.zone}" (${leaked.placeholder}) — refusing to render a blank glyph`,
    );
  }

  // --- 4. COMPILED — assemble the deterministic, verified overlay plan ---------------------
  const tokens = compiled.deterministicOverlayPlan.map(toOverlayToken);

  // codepoints are derived from the ACTUAL emitted glyphs (renderer font-coverage check) —
  // deterministic + de-duplicated, never hardcoded.
  const codepoints = Array.from(
    new Set(
      tokens.flatMap((t) => Array.from(t.hanzi).map((ch) => ch.codePointAt(0) as number)),
    ),
  );

  return {
    status: "COMPILED",
    overlayPlan: {
      tokens,
      yearPillarHanzi: provenance.yearPillarHanzi,
      isBeforeLichun: provenance.isBeforeLichun,
      codepoints,
      variantId: compiled.variantId,
    },
    sources: { ...provenance.sources },
  };
}
