/**
 * baziSoloRenderer — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-006, reframed).
 *
 * The SVG render STEP. It consumes a COMPILED `BaziSoloOverlayPlan` (from {@link baziSoloCompile})
 * and turns each deterministic token's hanzi into an OUTLINED `<path>` placed on a fixed
 * A4@300dpi template — using OFF-THE-SHELF glyph outlining (fontkit), NOT a hand-rolled vector
 * renderer. It reuses the exact technique proven by the AM-4 gating spike
 * (scripts/smoke/cjk-render-spike.ts): open the font → `glyphForCodePoint` → `glyph.path.toSVG()`.
 *
 * WHY fontkit (NOT resvg / canvas / skia / sharp): fontkit is pure-JS (no native binding). This
 * repo has a documented history of native-binding build failures (e.g. @tailwindcss/oxide on
 * Railway), so the render is done at the GLYPH/OUTLINE level — the deterministic layer a
 * rasterizer consumes — never by rasterizing.
 *
 * The no-mock guarantee here is PRINT-FACING and font-independent:
 *   - Every glyph is OUTLINED to an SVG `<path>`. The output carries NO `<text>` element, so the
 *     POD provider renders it identically regardless of installed fonts, and it is render-back
 *     verifiable.
 *   - The 戊/午 stem-vs-branch collision does NOT collapse: distinct hanzi ⇒ distinct `d` paths.
 *   - A .notdef (Tofu) glyph is NEVER emitted: an uncovered codepoint FAILS LOUD (throws). A
 *     blank box can therefore never reach print.
 *
 * Fail-closed:
 *   - Font file absent / unreadable / not a real font ⇒ throw {@link FontNotAvailableError}
 *     (`FONT_NOT_AVAILABLE`) — never silently render nothing.
 *   - Any token glyph resolves to glyph id 0 (.notdef) ⇒ throw {@link NotdefGlyphError} — never
 *     emit a Tofu box.
 *
 * Pure aside from reading the font FILE: no env/secret access, no network, no clock, no RNG. The
 * same plan + font always yields a deep-equal result.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import * as fontkit from "fontkit";
import type { Font, FontCollection, Glyph } from "fontkit";

// CJS-safe repo root. The prod server is bundled to CJS by esbuild, where `import.meta`
// is EMPTY — `fileURLToPath(import.meta.url)` threw at IMPORT time and crashed the server
// before /api/health could answer (Railway healthcheck failure). `npm start` / tsx-dev /
// vitest all run from the project root, so cwd is the repo root.
const REPO_ROOT = process.cwd();

/**
 * Default font: a COMMITTED subset of Noto Sans SC (OFL) covering only the ~47 bazi-solo
 * codepoints (~18KB). The full font stays git-ignored / is not deployed, so this small subset
 * is what ships to prod (Railway) — the slice-1 fix for "render fail-closed because the font
 * is absent". Glyph outlines are byte-identical to the full font's default (Thin) instance, so
 * the render-back golden-hash (ST-7) still matches. Re-generate via:
 *   pyftsubset assets/fonts/NotoSansSC.ttf --text-file=<bazi cjk> \
 *     --output-file=assets/fonts/NotoSansSC-bazi.subset.ttf --no-hinting --desubroutinize
 */
export const DEFAULT_FONT_PATH = resolve(REPO_ROOT, "assets/fonts/NotoSansSC-bazi.subset.ttf");

/** A4 @ 300dpi page, in pixels (210×297 mm). The renderer's fixed canvas. */
export const A4_300DPI_WIDTH = 2480;
export const A4_300DPI_HEIGHT = 3508;

/** Below this size a "font" file is almost certainly an error page, not a real font. */
const MIN_FONT_BYTES = 1024 * 1024;

/** A token the renderer can outline — the subset of an OverlayToken the renderer needs. */
export interface RenderableToken {
  /** Logical placeholder key, e.g. "year_stem_hanzi". Echoed into the manifest. */
  readonly key: string;
  /** The deterministic hanzi to outline (one or more CJK chars). */
  readonly hanzi: string;
  /** Overlay zone (unused by slice-1 layout, kept for plan-shape compatibility). */
  readonly zone?: string;
  /** Render order within the plan (unused by slice-1 grid, kept for compatibility). */
  readonly priority?: number;
}

/**
 * The subset of `BaziSoloOverlayPlan` the renderer consumes. Kept structurally compatible with
 * the compile step's plan so a COMPILED `overlayPlan` is accepted directly (it is a superset).
 */
export interface RenderableOverlayPlan {
  readonly tokens: readonly RenderableToken[];
  readonly yearPillarHanzi?: string;
  readonly isBeforeLichun?: boolean;
  readonly codepoints?: readonly number[];
  readonly variantId?: string;
}

/** Options for {@link renderBaziSoloSvg}. */
export interface RenderBaziSoloOptions {
  /** Override the font path (defaults to {@link DEFAULT_FONT_PATH}). Used by tests. */
  fontPath?: string;
}

/** One manifest row per outlined token — the render audit trail (no secrets, font-independent). */
export interface CodepointManifestEntry {
  /** The token's logical key (echoed from the plan). */
  key: string;
  /** The hanzi that was outlined. */
  char: string;
  /** The first code point of `char` (the glyph-coverage check key). */
  codepoint: number;
  /** The resolved font glyph id (> 0; 0 == .notdef would have thrown). */
  glyphId: number;
  /** True when the glyph outlined to a non-empty path. */
  hasPath: boolean;
}

/** A successful render — outlined SVG + per-token manifest + the font used. */
export interface RenderBaziSoloResult {
  /** A4@300dpi SVG with one `<path>` per token glyph and NO `<text>` element. */
  svg: string;
  /** Per-token codepoint/glyphId/hasPath audit trail (in plan-token order). */
  codepointManifest: CodepointManifestEntry[];
  /** The PostScript name of the font the glyphs were outlined from. */
  fontPostscriptName: string;
}

/** Thrown when the font file is absent, too small, or unreadable — fail loud, never render nothing. */
export class FontNotAvailableError extends Error {
  readonly code = "FONT_NOT_AVAILABLE";
  constructor(message: string) {
    super(`FONT_NOT_AVAILABLE: ${message}`);
    this.name = "FontNotAvailableError";
  }
}

/** Thrown when a token glyph resolves to .notdef (Tofu) — never emit a blank box to print. */
export class NotdefGlyphError extends Error {
  readonly code = "NOTDEF_GLYPH";
  constructor(message: string) {
    super(`NOTDEF_GLYPH: ${message}`);
    this.name = "NotdefGlyphError";
  }
}

/** A TrueTypeCollection exposes `.fonts[]`; a single font does not. */
function isFontCollection(opened: Font | FontCollection): opened is FontCollection {
  return Array.isArray((opened as FontCollection).fonts);
}

/**
 * Open the font, failing CLOSED with {@link FontNotAvailableError} on any problem (absent file,
 * stub-sized file, fontkit open failure). Returns a single concrete {@link Font} instance.
 */
function openFont(fontPath: string): Font {
  if (!existsSync(fontPath)) {
    throw new FontNotAvailableError(`font not found at ${fontPath} (fetch it — see assets/fonts/README.md)`);
  }
  const sizeBytes = statSync(fontPath).size;
  if (sizeBytes < MIN_FONT_BYTES) {
    throw new FontNotAvailableError(
      `font at ${fontPath} is ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB (< 1MB) — likely an error page, not a real font`,
    );
  }
  let opened: Font | FontCollection;
  try {
    opened = fontkit.openSync(fontPath);
  } catch (err) {
    throw new FontNotAvailableError(
      `fontkit could not open ${fontPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return isFontCollection(opened) ? opened.fonts[0] : opened;
}

function hex(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/** Escape a string for safe inclusion in an XML attribute value. */
function xmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A deterministic slice-1 grid: place token i into a single column, top-to-bottom, with a fixed
 * cell size, centered. A4-exact zone positioning is slice-2; this is a fixed template layout that
 * yields stable, distinct positions so the outlined paths are verifiable.
 */
const GRID_CELL = 320; // px per glyph cell at the chosen render size
const GRID_TOP = 400; // px from the top of the page to the first cell baseline area
const GRID_LEFT = (A4_300DPI_WIDTH - GRID_CELL) / 2; // centered single column

interface PlacedGlyph {
  manifest: CodepointManifestEntry;
  /** The transformed (positioned, Y-flipped, scaled) SVG path data for this glyph. */
  d: string;
}

/**
 * Outline one hanzi character to a positioned SVG path `d`, failing closed on .notdef.
 *
 * Font outlines are Y-UP in font units (origin at the baseline); SVG is Y-DOWN. We scale the em
 * to the grid cell and flip Y, then translate into the cell so the placement is deterministic and
 * each distinct glyph yields a distinct `d`.
 */
function outlineChar(
  font: Font,
  char: string,
  key: string,
  cellIndex: number,
): PlacedGlyph {
  const codepoint = char.codePointAt(0) as number;
  const glyph: Glyph = font.glyphForCodePoint(codepoint);

  // Fail loud on Tofu — never emit a .notdef box to print.
  if (glyph.id === 0) {
    throw new NotdefGlyphError(
      `"${char}" ${hex(codepoint)} (token "${key}") has no glyph in ${font.postscriptName} — refusing to emit a Tofu box`,
    );
  }

  const unitsPerEm = font.unitsPerEm || 1000;
  const scale = GRID_CELL / unitsPerEm;
  const x = GRID_LEFT;
  // Baseline Y for this cell. Y-flip: SVG y = baseline - (fontY * scale), achieved below via
  // path.scale(scale, -scale) (flips Y) then translate to the cell baseline.
  const baselineY = GRID_TOP + cellIndex * GRID_CELL + GRID_CELL;

  // Clone the path by transforming a fresh copy: scale (with Y-flip) then translate into place.
  // fontkit's Path.scale/translate mutate + return the path, so re-read the glyph for an unshared
  // path object (glyphForCodePoint returns a fresh glyph each call).
  const path = font.glyphForCodePoint(codepoint).path;
  path.scale(scale, -scale); // Y-flip so the Y-up outline becomes Y-down for SVG
  path.translate(x, baselineY);
  const d = path.toSVG();

  const hasPath = typeof d === "string" && d.trim().length > 0;
  return {
    manifest: { key, char, codepoint, glyphId: glyph.id, hasPath },
    d,
  };
}

/**
 * Render a COMPILED BaZi-solo overlay plan to an A4@300dpi SVG of OUTLINED glyph paths.
 *
 * @param plan a {@link RenderableOverlayPlan} (a COMPILED `overlayPlan` is accepted directly).
 * @param opts optional font path override (defaults to {@link DEFAULT_FONT_PATH}).
 * @returns the outlined `svg`, a per-token `codepointManifest`, and the `fontPostscriptName`.
 * @throws {FontNotAvailableError} if the font file is absent / too small / unreadable.
 * @throws {NotdefGlyphError} if any token glyph resolves to .notdef (Tofu).
 */
export function renderBaziSoloSvg(
  plan: RenderableOverlayPlan,
  opts: RenderBaziSoloOptions = {},
): RenderBaziSoloResult {
  const font = openFont(opts.fontPath ?? DEFAULT_FONT_PATH);

  const placed: PlacedGlyph[] = [];
  let cellIndex = 0;
  for (const token of plan.tokens) {
    // NFC-normalize so the codepoint we look up matches the canonical form (mirrors the spike).
    const normalized = token.hanzi.normalize("NFC");
    // A token may be multi-char (e.g. a 2-char pillar); outline each char as its own path/cell.
    for (const char of Array.from(normalized)) {
      placed.push(outlineChar(font, char, token.key, cellIndex));
      cellIndex += 1;
    }
  }

  const paths = placed
    .map((p) => `  <path d="${xmlAttr(p.d)}" fill="#000000" />`)
    .join("\n");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${A4_300DPI_WIDTH}" height="${A4_300DPI_HEIGHT}" ` +
    `viewBox="0 0 ${A4_300DPI_WIDTH} ${A4_300DPI_HEIGHT}">\n` +
    paths +
    `\n</svg>\n`;

  return {
    svg,
    codepointManifest: placed.map((p) => p.manifest),
    fontPostscriptName: font.postscriptName,
  };
}
