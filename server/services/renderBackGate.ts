/**
 * renderBackGate — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-009, NON-DEFERRABLE hard-gate).
 *
 * THE GATE THE COUNCIL DEMANDED: truth lives at the PIXEL. Every other gate on this path checks
 * the INTENT (the compiled overlay plan, the manifest the renderer self-reports). None reads back
 * the rendered BYTES. This one does — it re-derives each glyph's outline straight from the font
 * and proves the artifact the POD provider will print carries the EXACT expected codepoints, with
 * no glyph substitution, no Tofu (.notdef), and nothing added or dropped between intent and output.
 *
 * `assertRenderBackIntegrity(overlayPlan, renderResult)` enforces four invariants:
 *
 *   1. CODEPOINT-SET equality — the manifest's UNIQUE codepoint set === overlayPlan.codepoints set.
 *      Nothing added, nothing dropped. (The manifest is per-CHAR — a 2-char token expands to two
 *      entries — so we compare the de-duplicated codepoint SETS, not lengths.)
 *
 *   2. RENDER-BACK byte-equality — for each manifest entry we recompute the font's own outline for
 *      that codepoint (`glyphForCodePoint(cp).path.toSVG()`) and assert it BYTE-EQUALS the `d`
 *      string actually embedded in `renderResult.svg` for that token, AND that the entry's glyphId
 *      equals `glyphForCodePoint(cp).id`. Together these prove the codepoint→rendered-path mapping
 *      was faithful: no glyph was substituted between what the plan intended and what was emitted.
 *
 *   3. NO TOFU — every glyphId !== 0 (.notdef would print a blank box).
 *
 *   4. NFC IDEMPOTENCE — every char === NFC(char) (a non-canonical form could resolve to a
 *      different glyph at the provider than the one we verified here).
 *
 * On any violation it throws {@link RenderBackIntegrityError} with a greppable `code`
 * (`CODEPOINT_SET_MISMATCH` / `RENDER_BACK_MISMATCH` / `TOFU_GLYPH`) and which token failed.
 * On success it returns `{ ok: true }`.
 *
 * It reuses the SAME off-the-shelf glyph-outlining technique the renderer uses (fontkit:
 * open font → `glyphForCodePoint` → `path.toSVG()`), so the render-back is an INDEPENDENT
 * recomputation against the real font — never a re-read of the renderer's own self-report.
 *
 * Pure aside from reading the font FILE: no env/secret access, no network, no clock, no RNG.
 */

import { existsSync, statSync } from "node:fs";

import * as fontkit from "fontkit";
import type { Font, FontCollection } from "fontkit";

import {
  DEFAULT_FONT_PATH,
  type CodepointManifestEntry,
  type RenderableOverlayPlan,
  type RenderBaziSoloResult,
} from "./baziSoloRenderer";

/** Below this size a "font" file is almost certainly an error page, not a real font. */
const MIN_FONT_BYTES = 1024 * 1024;

/** Options for {@link assertRenderBackIntegrity}. */
export interface AssertRenderBackIntegrityOptions {
  /** Override the font path (defaults to {@link DEFAULT_FONT_PATH}). Used by tests. */
  fontPath?: string;
}

/** The successful gate verdict. */
export interface RenderBackIntegrityOk {
  readonly ok: true;
}

/** The distinct, greppable failure modes of the render-back gate. */
export type RenderBackIntegrityCode =
  | "CODEPOINT_SET_MISMATCH"
  | "RENDER_BACK_MISMATCH"
  | "TOFU_GLYPH";

/**
 * Thrown when the rendered artifact diverges from the verified intent — a glyph was substituted,
 * a Tofu box slipped in, or the codepoint set drifted. NEVER swallowed into a soft pass.
 */
export class RenderBackIntegrityError extends Error {
  readonly code: RenderBackIntegrityCode;
  /** The logical token key that failed, when the failure is attributable to one token. */
  readonly token?: string;
  constructor(code: RenderBackIntegrityCode, message: string, token?: string) {
    super(`${code}: ${message}`);
    this.name = "RenderBackIntegrityError";
    this.code = code;
    this.token = token;
  }
}

/** A TrueTypeCollection exposes `.fonts[]`; a single font does not. */
function isFontCollection(opened: Font | FontCollection): opened is FontCollection {
  return Array.isArray((opened as FontCollection).fonts);
}

/**
 * Open the font, failing CLOSED on any problem (absent file, stub-sized file, fontkit failure) —
 * the gate must never "pass" because it could not read the font. Mirrors the renderer's fail-loud
 * open discipline; thrown as a plain Error since this is a gate-infrastructure fault, not a
 * render-back integrity violation.
 */
function openFont(fontPath: string): Font {
  if (!existsSync(fontPath)) {
    throw new Error(`RENDER_BACK_GATE: font not found at ${fontPath} — cannot verify the render`);
  }
  const sizeBytes = statSync(fontPath).size;
  if (sizeBytes < MIN_FONT_BYTES) {
    throw new Error(
      `RENDER_BACK_GATE: font at ${fontPath} is ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB ` +
        "(< 1MB) — likely an error page, not a real font; cannot verify the render",
    );
  }
  let opened: Font | FontCollection;
  try {
    opened = fontkit.openSync(fontPath);
  } catch (err) {
    throw new Error(
      `RENDER_BACK_GATE: fontkit could not open ${fontPath}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  return isFontCollection(opened) ? opened.fonts[0] : opened;
}

/** Render a code point as `U+XXXX` for diagnostics. */
function hex(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Reverse {@link xmlAttr} (the renderer's attribute-escape) so the extracted `d` string is
 * compared in its raw (unescaped) form against the recomputed outline.
 */
function unescapeXmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Extract the embedded `<path d="…">` strings from the rendered SVG, in document order. The
 * renderer emits exactly one `<path>` per manifest entry, in manifest order, so the i-th extracted
 * path corresponds to the i-th manifest entry. Returns the UNESCAPED `d` values.
 */
function extractEmbeddedPaths(svg: string): string[] {
  const matches = svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g);
  return Array.from(matches, (m) => unescapeXmlAttr(m[1]));
}

/** The unique code-point set of a list of code points (insertion-order irrelevant for a Set). */
function uniqueSet(codepoints: readonly number[]): Set<number> {
  return new Set(codepoints);
}

/**
 * Assert the rendered artifact's glyphs ARE the exact expected code points — no substitution, no
 * Tofu, nothing added or dropped. See the module header for the four invariants.
 *
 * @param overlayPlan  the COMPILED overlay plan whose `codepoints` set is the source of truth.
 * @param renderResult the renderer's output (`svg` + per-token `codepointManifest`).
 * @param opts         optional font-path override (defaults to {@link DEFAULT_FONT_PATH}).
 * @returns `{ ok: true }` when every invariant holds.
 * @throws {RenderBackIntegrityError} on the first violation, naming the failing token.
 */
export function assertRenderBackIntegrity(
  overlayPlan: RenderableOverlayPlan,
  renderResult: RenderBaziSoloResult,
  opts: AssertRenderBackIntegrityOptions = {},
): RenderBackIntegrityOk {
  const manifest = renderResult.codepointManifest;

  // --- 1. CODEPOINT-SET equality — nothing added or dropped between plan and render ----------
  const planSet = uniqueSet(overlayPlan.codepoints ?? []);
  const manifestSet = uniqueSet(manifest.map((e) => e.codepoint));

  const dropped = [...planSet].filter((cp) => !manifestSet.has(cp)); // in plan, missing from render
  const added = [...manifestSet].filter((cp) => !planSet.has(cp)); // in render, not in plan
  if (dropped.length > 0 || added.length > 0) {
    const parts: string[] = [];
    if (dropped.length > 0) parts.push(`dropped from render: ${dropped.map(hex).join(", ")}`);
    if (added.length > 0) parts.push(`added to render (not in plan): ${added.map(hex).join(", ")}`);
    throw new RenderBackIntegrityError(
      "CODEPOINT_SET_MISMATCH",
      `manifest codepoint set != overlayPlan codepoint set — ${parts.join("; ")}`,
    );
  }

  // The renderer emits one <path> per manifest entry, in order — extract them for byte-comparison.
  const embeddedPaths = extractEmbeddedPaths(renderResult.svg);
  if (embeddedPaths.length !== manifest.length) {
    throw new RenderBackIntegrityError(
      "RENDER_BACK_MISMATCH",
      `manifest has ${manifest.length} entr${manifest.length === 1 ? "y" : "ies"} but the SVG ` +
        `embeds ${embeddedPaths.length} <path> element(s) — manifest/SVG are not 1:1`,
    );
  }

  const font = openFont(opts.fontPath ?? DEFAULT_FONT_PATH);

  // --- per-entry invariants (in manifest order, so the i-th SVG path matches entry i) --------
  for (let i = 0; i < manifest.length; i += 1) {
    const entry: CodepointManifestEntry = manifest[i];

    // 4. NFC idempotence — a non-canonical char could resolve to a different glyph downstream.
    if (entry.char !== entry.char.normalize("NFC")) {
      throw new RenderBackIntegrityError(
        "RENDER_BACK_MISMATCH",
        `"${entry.char}" ${hex(entry.codepoint)} (token "${entry.key}") is not in NFC form ` +
          `(NFC=${entry.char.normalize("NFC")}) — refusing to trust a non-canonical glyph`,
        entry.key,
      );
    }

    // 3. NO TOFU — glyph id 0 is .notdef; it would print a blank box.
    if (entry.glyphId === 0) {
      throw new RenderBackIntegrityError(
        "TOFU_GLYPH",
        `"${entry.char}" ${hex(entry.codepoint)} (token "${entry.key}") resolved to glyph id 0 ` +
          "(.notdef / Tofu) — a blank box must never reach print",
        entry.key,
      );
    }

    // 2. RENDER-BACK byte-equality — recompute the font's outline for this codepoint and prove the
    // embedded path + glyphId match it exactly (no substitution between intent and output).
    const refGlyph = font.glyphForCodePoint(entry.codepoint);
    if (entry.glyphId !== refGlyph.id) {
      throw new RenderBackIntegrityError(
        "RENDER_BACK_MISMATCH",
        `"${entry.char}" ${hex(entry.codepoint)} (token "${entry.key}") manifest glyphId ` +
          `${entry.glyphId} != font glyphId ${refGlyph.id} for that codepoint — glyph substitution`,
        entry.key,
      );
    }

    const recomputed = refGlyph.path.toSVG();
    const embedded = embeddedPaths[i];
    if (recomputed !== embedded) {
      throw new RenderBackIntegrityError(
        "RENDER_BACK_MISMATCH",
        `"${entry.char}" ${hex(entry.codepoint)} (token "${entry.key}") embedded path does NOT ` +
          "byte-equal the font's recomputed outline for that codepoint — the rendered glyph is " +
          "not the one its codepoint outlines to (substitution / corruption between intent and output)",
        entry.key,
      );
    }
  }

  return { ok: true };
}
