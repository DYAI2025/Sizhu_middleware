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

/**
 * Below this size a "font" file is almost certainly an error page, not a real font. The COMMITTED
 * prod subset (assets/fonts/NotoSansSC-bazi.subset.ttf) is ~18KB, so the floor sits well below that
 * but above a typical 1–5KB HTML error page. The real structural validation is `fontkit.openSync`,
 * which rejects any non-font regardless of size; this size gate is only a coarse pre-filter.
 * (Was 1MB, which rejected the very prod subset committed for BLK-003 — the renderer fail-closed on
 * its own font, so the subset could never load in prod.)
 */
const MIN_FONT_BYTES = 8 * 1024;

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

/**
 * Format a layout number for an SVG transform: trim to at most 4 decimals and drop a trailing
 * `.0…`, so the transform string is compact and deterministic (no locale, no float noise like
 * `0.30000000000000004`). Integers render bare.
 */
function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
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
 * Deterministic A4@300dpi ZONE/GRID layout (slice-2 — REAL positioning).
 *
 * WHY a wrapping `<g transform>` and NOT a baked-in path transform:
 *   fontkit's `Path.scale()/translate()` are a NO-OP on the string `path.toSVG()` returns in this
 *   version — re-reading the glyph and transforming the Path object does NOT change the emitted `d`,
 *   so the slice-1 renderer drew every glyph at the font's native origin, STACKED (confirmed by
 *   ST-5). We therefore position each glyph with an SVG GROUP wrapper —
 *   `<g transform="translate(X,Y) scale(S,-S)"><path d="<RAW toSVG()>"/></g>` — and leave the inner
 *   `<path d>` as the UNTRANSFORMED font outline. That is load-bearing: the render-back gate
 *   (renderBackGate.ts) and the golden-hash (baziSoloReadyState.ts) recompute
 *   `glyphForCodePoint(cp).path.toSVG()` and byte-compare it to the embedded `d`, so the `d` MUST
 *   stay the raw outline. All layout lives in the group transform; baking it into `d` would break
 *   both gates.
 *
 * Layout model: a fixed two-column grid mapped from each token's ZONE (falling back to plan order
 * for any unknown/absent zone). Font outlines are Y-UP (origin at the baseline); SVG is Y-DOWN — the
 * Y-flip is the `-S` in `scale(S, -S)` on the GROUP, and `translate(X, baselineY)` drops the glyph
 * onto its cell baseline. Each cell gets a distinct (X, baselineY), so distinct tokens get distinct
 * group transforms — real, verifiable layout (no longer origin-stacked).
 */
/**
 * The SINGLE source for the A4@300dpi zone-band geometry. Centralized so the renderer, its tests, and
 * any future caller share ONE set of layout assumptions instead of duplicating magic numbers — tweak a
 * design value (cell size, spacing, margins, or add a zone) in exactly one place. Exported for tests.
 */
export const A4_LAYOUT = {
  /** px: em box per glyph cell at the chosen render size (also the glyph scale denominator). */
  cell: 280,
  /** px: horizontal gap between cells in a row. */
  colGap: 100,
  /** px: vertical distance between successive row baselines. */
  rowStep: 320,
  /** px: baseline Y of the first row. */
  top: 320,
  /** px: left/right page margin. */
  marginX: 200,
  /**
   * Known overlay zones in on-page vertical order (top→bottom). A token's zone decides WHICH band it
   * lands in; the value is only the ordering rank. Unknown/absent zones are appended after the known
   * ones in first-seen plan order, so layout is always total and deterministic.
   */
  zoneOrder: {
    primary_year_pillar: 0,
    stem_branch_detail: 1,
    zodiac_animal: 2,
    wuxing_phase: 3,
  } as Readonly<Record<string, number>>,
} as const;

/** Columns that fit across the A4 page within the margins (deterministic from the page geometry). */
const COLS_PER_ROW = Math.max(
  1,
  Math.floor((A4_300DPI_WIDTH - 2 * A4_LAYOUT.marginX) / (A4_LAYOUT.cell + A4_LAYOUT.colGap)),
);

interface CellPos {
  x: number;
  baselineY: number;
}

/** Resolve a cell's top-left X and baseline Y from its (row, col) — row-major, COLS_PER_ROW wide. */
function cellPosition(row: number, col: number): CellPos {
  return {
    x: A4_LAYOUT.marginX + col * (A4_LAYOUT.cell + A4_LAYOUT.colGap),
    baselineY: A4_LAYOUT.top + row * A4_LAYOUT.rowStep,
  };
}

/**
 * Assign each glyph (indexed in plan order) a (row, col) by ZONE BAND. Zones are stacked vertically
 * in A4_LAYOUT.zoneOrder (known zones first, then any unknown/absent zone in first-seen plan order);
 * within a zone, glyphs fill columns left→right and wrap to the next row; each zone is followed by a
 * gap row. Deterministic, total, collision-free: distinct glyphs always get distinct cells, and a
 * token's zone drives WHERE on the A4 page it lands. The returned positions are in plan order (i.e.
 * positions[i] is the cell for the i-th glyph), so the SVG/manifest stay 1:1 in plan order.
 */
function assignZonePositions(zones: readonly (string | undefined)[]): CellPos[] {
  const order: (string | undefined)[] = [];
  const seen = new Set<string | undefined>();
  const present = new Set(zones);
  for (const [zone] of Object.entries(A4_LAYOUT.zoneOrder).sort((a, b) => a[1] - b[1])) {
    if (present.has(zone)) {
      order.push(zone);
      seen.add(zone);
    }
  }
  for (const zone of zones) {
    if (!seen.has(zone)) {
      order.push(zone);
      seen.add(zone);
    }
  }

  const positions: CellPos[] = new Array(zones.length);
  let row = 0;
  for (const zone of order) {
    let col = 0;
    for (let i = 0; i < zones.length; i++) {
      if (zones[i] !== zone) continue;
      if (col >= COLS_PER_ROW) {
        row += 1;
        col = 0;
      }
      positions[i] = cellPosition(row, col);
      col += 1;
    }
    row += 2; // the zone's last row + one gap row before the next zone
  }
  return positions;
}

interface PlacedGlyph {
  manifest: CodepointManifestEntry;
  /** The RAW, UNTRANSFORMED glyph outline (`path.toSVG()`) — what the render-back gate verifies. */
  d: string;
  /** The SVG group transform that POSITIONS this glyph's raw outline on the A4 canvas. */
  transform: string;
}

/**
 * Outline one hanzi character to its RAW SVG path `d` PLUS a positioning group transform, failing
 * closed on .notdef.
 *
 * The `d` is the font's untransformed outline (so render-back/golden stay byte-stable); the returned
 * `transform` (`translate(x, baselineY) scale(s, -s)`) is what actually places + Y-flips + scales the
 * glyph into its grid cell when wrapped in a `<g>`.
 */
function outlineChar(
  font: Font,
  char: string,
  key: string,
  pos: CellPos,
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
  const scale = A4_LAYOUT.cell / unitsPerEm;

  // The RAW outline — NOT transformed (reuse the glyph already fetched above; one lookup per char).
  // It MUST stay the untransformed outline: the render-back gate + golden-hash independently recompute
  // glyphForCodePoint(cp).path.toSVG() and byte-compare it to this `d`. All layout lives in the group
  // transform below, never baked into `d`.
  const d = glyph.path.toSVG();

  // Position via the GROUP transform: translate to the cell baseline, then scale with a Y-flip
  // (`-scale`) so the Y-up font outline renders Y-down in SVG. Order matters: translate ∘ scale.
  const transform = `translate(${fmt(pos.x)},${fmt(pos.baselineY)}) scale(${fmt(scale)},${fmt(-scale)})`;

  const hasPath = typeof d === "string" && d.trim().length > 0;
  return {
    manifest: { key, char, codepoint, glyphId: glyph.id, hasPath },
    d,
    transform,
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

  // Flatten plan tokens → one entry per glyph (char + token key + zone), in PLAN order. A token may
  // be multi-char (e.g. a 2-char pillar); each char is outlined as its own path/cell. NFC-normalize
  // so the looked-up codepoint matches the canonical form (mirrors the spike).
  const glyphs: { char: string; key: string; zone?: string }[] = [];
  for (const token of plan.tokens) {
    for (const char of Array.from(token.hanzi.normalize("NFC"))) {
      glyphs.push({ char, key: token.key, zone: token.zone });
    }
  }

  // Position by ZONE BAND (deterministic, collision-free); positions are in plan order.
  const positions = assignZonePositions(glyphs.map((g) => g.zone));
  const placed: PlacedGlyph[] = glyphs.map((g, i) => outlineChar(font, g.char, g.key, positions[i]));

  // Emit in PLAN order: one `<g transform>` (the layout) wrapping the RAW `<path d>` (the outline the
  // render-back gate byte-verifies). Document order == manifest order, so the gate stays 1:1.
  const nodes = placed
    .map((p) => `  <g transform="${xmlAttr(p.transform)}"><path d="${xmlAttr(p.d)}" fill="#000000" /></g>`)
    .join("\n");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${A4_300DPI_WIDTH}" height="${A4_300DPI_HEIGHT}" ` +
    `viewBox="0 0 ${A4_300DPI_WIDTH} ${A4_300DPI_HEIGHT}">\n` +
    nodes +
    `\n</svg>\n`;

  return {
    svg,
    codepointManifest: placed.map((p) => p.manifest),
    fontPostscriptName: font.postscriptName,
  };
}
