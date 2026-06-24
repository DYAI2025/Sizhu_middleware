/**
 * baziSoloRenderer.test.ts — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-006, reframed:
 * off-the-shelf glyph-OUTLINING, NOT a hand-rolled vector renderer).
 *
 * The SVG render STEP. It consumes a COMPILED `BaziSoloOverlayPlan` (from baziSoloCompile)
 * and turns each deterministic token's hanzi into an OUTLINED `<path>` placed on a fixed
 * A4@300dpi template, using the proven fontkit technique from scripts/smoke/cjk-render-spike.ts
 * (open font → glyphForCodePoint → glyph.path.toSVG()).
 *
 * The no-mock guarantee here is PRINT-FACING and font-independent:
 *   - every glyph is OUTLINED — the SVG carries NO `<text>` element, so it renders identically
 *     at the POD provider regardless of installed fonts, and is render-back verifiable.
 *   - the 戊/午 stem-vs-branch collision must NOT collapse: distinct hanzi ⇒ distinct `d` paths.
 *   - a .notdef (Tofu) glyph is NEVER emitted: an uncovered codepoint FAILS LOUD (throws),
 *     it does not silently draw a blank box.
 *
 * RED-first. Test (d) is the RED-on-revert oracle: if the Tofu guard is removed, an uncovered
 * codepoint would silently emit a .notdef path instead of throwing — and the assertion goes RED.
 *
 * The font binary (assets/fonts/NotoSansSC.ttf) is git-ignored but present locally. If it is
 * absent in this env the suite SKIPS-with-reason (it never false-passes by rendering nothing).
 */

import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  renderBaziSoloSvg,
  FontNotAvailableError,
  DEFAULT_FONT_PATH,
  type RenderableOverlayPlan,
} from "../services/baziSoloRenderer";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FONT_PATH = resolve(REPO_ROOT, "assets/fonts/NotoSansSC.ttf");

/** The font is present + a real (≥1MB) font, not an error-page stub. */
const FONT_PRESENT = existsSync(FONT_PATH) && statSync(FONT_PATH).size > 1024 * 1024;
const describeIfFont = FONT_PRESENT ? describe : describe.skip;
if (!FONT_PRESENT) {
  // eslint-disable-next-line no-console
  console.warn(
    `[baziSoloRenderer.test] SKIPPED — font absent at ${FONT_PATH}. ` +
      "Fetch it (see assets/fonts/README.md) to run the render gate.",
  );
}

const cp = (ch: string): number => ch.codePointAt(0) as number;

/**
 * Build a minimal COMPILED-shaped overlay plan directly (the renderer only needs the
 * `RenderableOverlayPlan` surface — `tokens[].{key,hanzi}` — not the whole compile pipeline).
 * Includes the headline 戊/午 stem-vs-branch collision pair.
 */
function buildPlan(): RenderableOverlayPlan {
  const tokens = [
    { key: "year_stem_hanzi", hanzi: "戊", zone: "primary_year_pillar", priority: 1 },
    { key: "year_branch_hanzi", hanzi: "午", zone: "stem_branch_detail", priority: 2 },
    { key: "zodiac_animal", hanzi: "马", zone: "zodiac_animal", priority: 3 },
  ];
  return {
    tokens,
    yearPillarHanzi: "戊午",
    isBeforeLichun: false,
    codepoints: Array.from(new Set(tokens.flatMap((t) => Array.from(t.hanzi).map(cp)))),
    variantId: "test-variant",
  };
}

describeIfFont("renderBaziSoloSvg", () => {
  it("(a) emits one outlined <path> per token + a manifest with codepoint/glyphId, and reports the font name", () => {
    const plan = buildPlan();
    const { svg, codepointManifest, fontPostscriptName } = renderBaziSoloSvg(plan, {
      fontPath: FONT_PATH,
    });

    // one <path d="…"> per token glyph (3 single-char tokens ⇒ 3 paths).
    const pathCount = (svg.match(/<path\b/g) ?? []).length;
    expect(pathCount).toBe(plan.tokens.length);

    // A4@300dpi viewBox present.
    expect(svg).toContain('viewBox="0 0 2480 3508"');

    // manifest lists each token's codepoint + a real (non-.notdef) glyphId, all with a path.
    expect(codepointManifest).toHaveLength(plan.tokens.length);
    for (const [i, token] of plan.tokens.entries()) {
      const entry = codepointManifest[i];
      expect(entry.key).toBe(token.key);
      expect(entry.char).toBe(token.hanzi);
      expect(entry.codepoint).toBe(cp(token.hanzi));
      expect(entry.glyphId).toBeGreaterThan(0); // 0 == .notdef == Tofu
      expect(entry.hasPath).toBe(true);
    }

    expect(typeof fontPostscriptName).toBe("string");
    expect(fontPostscriptName.length).toBeGreaterThan(0);
  });

  it("(b) outlines every glyph — the SVG contains NO <text> element (font-independent at print time)", () => {
    const { svg } = renderBaziSoloSvg(buildPlan(), { fontPath: FONT_PATH });
    expect(svg).not.toMatch(/<text\b/i);
    expect(svg).not.toMatch(/<tspan\b/i);
    // and it DID draw real outlines.
    expect(svg).toMatch(/<path\b[^>]*\bd="[^"]+"/);
  });

  it("(c) 戊 and 午 (the stem/branch collision) render as DISTINCT path d strings — not collapsed", () => {
    const { svg } = renderBaziSoloSvg(buildPlan(), { fontPath: FONT_PATH });
    const ds = Array.from(svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)).map((m) => m[1]);
    expect(ds.length).toBeGreaterThanOrEqual(2);

    // first two tokens are 戊 (stem) and 午 (branch); their outlines must differ.
    const [stemD, branchD] = ds;
    expect(stemD).not.toBe(branchD);

    // and both must be non-empty, real outlines.
    expect(stemD.length).toBeGreaterThan(0);
    expect(branchD.length).toBeGreaterThan(0);
  });

  it("(d) a plan with an uncovered/.notdef codepoint THROWS (never emits a Tofu box)", () => {
    // U+E000 is in the Private Use Area — Noto Sans SC has no glyph for it (.notdef).
    const tofu = String.fromCodePoint(0xe000);
    const badPlan: RenderableOverlayPlan = {
      tokens: [{ key: "year_stem_hanzi", hanzi: tofu, zone: "primary_year_pillar", priority: 1 }],
      yearPillarHanzi: tofu,
      isBeforeLichun: false,
      codepoints: [0xe000],
      variantId: "test-variant",
    };
    expect(() => renderBaziSoloSvg(badPlan, { fontPath: FONT_PATH })).toThrow(/notdef|tofu|U\+E000/i);
  });

  it("(e) a missing font file throws a clear FONT_NOT_AVAILABLE error (does NOT silently render nothing)", () => {
    const missing = resolve(REPO_ROOT, "assets/fonts/__does_not_exist__.ttf");
    expect(() => renderBaziSoloSvg(buildPlan(), { fontPath: missing })).toThrow(FontNotAvailableError);
    expect(() => renderBaziSoloSvg(buildPlan(), { fontPath: missing })).toThrow(/FONT_NOT_AVAILABLE/);
  });

  it("(f) S2-A4: every glyph is positioned via its OWN <g transform> — DISTINCT, never origin-stacked", () => {
    const plan = buildPlan();
    const { svg } = renderBaziSoloSvg(plan, { fontPath: FONT_PATH });

    // One positioning <g transform> per <path> (the slice-1 renderer drew bare, origin-stacked paths).
    const groupCount = (svg.match(/<g\b[^>]*\btransform="/g) ?? []).length;
    const pathCount = (svg.match(/<path\b/g) ?? []).length;
    expect(groupCount).toBe(pathCount);
    expect(groupCount).toBe(plan.tokens.length);

    // Transforms are DISTINCT — the slice-1 bug placed every glyph at the font origin (all identical).
    const transforms = Array.from(svg.matchAll(/<g\b[^>]*\btransform="([^"]+)"/g)).map((m) => m[1]);
    expect(new Set(transforms).size).toBe(transforms.length);

    // Each carries a real translate + a Y-flip scale (font outlines are Y-up, SVG is Y-down).
    for (const t of transforms) {
      expect(t).toMatch(/translate\([\d.]+,[\d.]+\)\s+scale\([\d.]+,-[\d.]+\)/);
    }
  });

  it("(g) S2-A4: zones band top→bottom — an earlier-zone glyph sits ABOVE a later-zone glyph", () => {
    // buildPlan: 戊 primary_year_pillar (rank 0) · 午 stem_branch_detail (1) · 马 zodiac_animal (2).
    const { svg } = renderBaziSoloSvg(buildPlan(), { fontPath: FONT_PATH });
    const ys = Array.from(svg.matchAll(/translate\([\d.]+,([\d.]+)\)/g)).map((m) => Number(m[1]));
    expect(ys).toHaveLength(3);
    // Zone rank order ⇒ strictly increasing baseline Y (further down the A4 page).
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });
});

/**
 * The COMMITTED prod font is the ~18KB Noto Sans SC subset (DEFAULT_FONT_PATH), not the 17MB full
 * font. This guards the MIN_FONT_BYTES floor: if it reverts to 1MB the renderer rejects its own prod
 * font and this goes RED (the BLK-003 "so prod can render" regression). Always runs — the subset is
 * committed, so this needs no separate font fetch.
 */
describe("renderBaziSoloSvg — committed prod subset loads (BLK-003 / MIN_FONT_BYTES)", () => {
  const subsetPresent = existsSync(DEFAULT_FONT_PATH) && statSync(DEFAULT_FONT_PATH).size > 4096;
  const itIfSubset = subsetPresent ? it : it.skip;

  itIfSubset("renders 戊午 from the committed ~18KB subset (DEFAULT_FONT_PATH, no override)", () => {
    const plan: RenderableOverlayPlan = {
      tokens: [
        { key: "year_stem_hanzi", hanzi: "戊", zone: "primary_year_pillar", priority: 1 },
        { key: "year_branch_hanzi", hanzi: "午", zone: "stem_branch_detail", priority: 2 },
      ],
      yearPillarHanzi: "戊午",
      isBeforeLichun: false,
      codepoints: [cp("戊"), cp("午")],
      variantId: "subset",
    };
    // No fontPath override ⇒ uses DEFAULT_FONT_PATH (the committed subset).
    const { svg, codepointManifest } = renderBaziSoloSvg(plan);
    expect(codepointManifest).toHaveLength(2);
    expect((svg.match(/<path\b/g) ?? []).length).toBe(2);
  });
});
