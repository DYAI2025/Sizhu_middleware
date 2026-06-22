/**
 * AM-4 GATING SPIKE — CJK render proof AT THE PIXEL (feature: bazi-baci-solo-no-mock-mvp).
 *
 * PURPOSE
 *   Prove the "no-mock" guarantee is REAL for the one thing the print product cannot
 *   fake: that every BaZi hanzi the workflow can produce will RENDER as the correct,
 *   distinct glyph — no Tofu (.notdef), no silent substitution, no stem/branch collapse.
 *   If this spike FAILS, the whole MVP is honestly BLOCKED. There is no "fake pass":
 *   the hard gate (A/B/C) exits non-zero on any failure.
 *
 * WHY fontkit (NOT resvg / canvas / sharp / skia)
 *   fontkit is a pure-JS glyph/outline library — NO native binding. This repo has a
 *   documented history of native-binding build failures (e.g. @tailwindcss/oxide on
 *   Railway). A spike whose own toolchain can fail to build proves nothing, so the
 *   pixel proof is done at the GLYPH/OUTLINE level (the deterministic layer that a
 *   rasterizer consumes) rather than rasterizing to PNG.
 *
 * THE FONT
 *   assets/fonts/NotoSansSC.ttf — the REAL Noto Sans SC (OFL 1.1, the SC subset of
 *   Noto Sans CJK), fetched from google/fonts. It is a variable font; fontkit opens
 *   the default instance. License text: assets/fonts/OFL.txt. The .ttf binary is
 *   git-ignored (large); the spike fetches it (see README in assets/fonts).
 *
 * THE CODEPOINT SET (the gate's universe)
 *   EVERY `hanzi` value reachable from server/services/baziSymbolMapper.ts:
 *     - 10 Heavenly Stems   (STEMS[*].hanzi)
 *     - 12 Earthly Branches (BRANCHES[*].hanzi)
 *     - branch WuXing hanzi (BRANCHES[*].wuxingHanzi) + stem WuXing hanzi (STEMS[*].wuxingHanzi)
 *     - 12 zodiac animals   (BRANCHES[*].animalHanzi)
 *     - 5 WuXing phases     (the 木火土金水 phase glyphs)
 *   De-duplicated to the unique codepoint set the print product needs.
 *
 * THE GATE
 *   A) COVERAGE      — every codepoint has a real glyph (id !== 0 / not .notdef).      [HARD]
 *   B) RENDER-BACK   — each glyph outlines to an SVG path AND round-trips to the EXACT  [HARD]
 *                      source codepoint (layout + stringsForGlyph), with no substitution.
 *                      Proves the 戊/午 stem-vs-branch collision yields DISTINCT glyph
 *                      ids + DISTINCT path SVGs (must not collapse).
 *   C) NFC           — every hanzi === its NFC form; double-NFC is stable.              [HARD]
 *   D) LICHUN        — real FuFire boundary: a PRE- and POST-lichun birth in the same   [SOFT]
 *                      year yield DIFFERENT year-pillar stem/branch (is_before_lichun
 *                      differs); both map to hanzi and BOTH render without Tofu.
 *                      SKIPPED (not failed) if FuFire is unreachable. A/B/C are the gate.
 *
 * RUN:  npm run spike:cjk
 *       SPIKE_SKIP_LICHUN=1 npm run spike:cjk   (skip D explicitly)
 *
 * EXIT: non-zero on any A/B/C failure (or font/setup failure). D failure does NOT
 *       fail the hard gate, but a D *contradiction* (boundary did not move the pillar)
 *       is reported loudly.
 */

import * as fontkit from "fontkit";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STEMS,
  BRANCHES,
  mapStem,
  mapBranch,
} from "../../server/services/baziSymbolMapper";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FONT_PATH = resolve(REPO_ROOT, "assets/fonts/NotoSansSC.ttf");
const SKIP_LICHUN = process.env.SPIKE_SKIP_LICHUN === "1";

// ── fontkit type narrowing ────────────────────────────────────────────────────
// fontkit.openSync may return a Font OR a TrueTypeCollection (.fonts[]). Narrow to
// a single Font so the spike runs against one concrete instance.
type FKGlyph = {
  id: number;
  path: { toSVG: () => string };
};
type FKFont = {
  postscriptName: string | null;
  numGlyphs: number;
  glyphForCodePoint: (cp: number) => FKGlyph;
  layout: (s: string) => { glyphs: Array<{ id: number; codePoints: number[] }> };
  stringsForGlyph: (gid: number) => string[];
};

function openFont(path: string): FKFont {
  const opened = (fontkit as unknown as { openSync: (p: string) => unknown }).openSync(path);
  // A TrueTypeCollection exposes `.fonts`; a single font does not.
  const maybeCollection = opened as { fonts?: unknown[] };
  const font = (Array.isArray(maybeCollection.fonts) ? maybeCollection.fonts[0] : opened) as FKFont;
  return font;
}

// ── the BaZi codepoint universe ───────────────────────────────────────────────
interface BaziHanzi {
  /** the hanzi character */
  readonly char: string;
  /** human label of its role/source, for diagnostics */
  readonly role: string;
}

/**
 * Collect EVERY hanzi the print product can produce from the symbol mapper.
 * Returns the full (labeled) list AND the de-duplicated unique-codepoint set.
 */
function collectBaziHanzi(): { all: BaziHanzi[]; unique: Map<number, BaziHanzi> } {
  const all: BaziHanzi[] = [];
  const push = (char: string, role: string): void => {
    if (char && char.length > 0) all.push({ char, role });
  };

  for (const [rom, s] of Object.entries(STEMS)) {
    push(s.hanzi, `stem ${rom} (天干)`);
    push(s.wuxingHanzi, `stem ${rom} wuxing`);
  }
  for (const [rom, b] of Object.entries(BRANCHES)) {
    push(b.hanzi, `branch ${rom} (地支)`);
    push(b.wuxingHanzi, `branch ${rom} wuxing`);
    push(b.animalHanzi, `branch ${rom} animal (${b.animalEn})`);
  }

  // De-dup by the FIRST codepoint (every entry is a single CJK char => single CP).
  const unique = new Map<number, BaziHanzi>();
  for (const h of all) {
    const cp = h.char.codePointAt(0);
    if (cp === undefined) continue;
    if (!unique.has(cp)) unique.set(cp, h);
  }
  return { all, unique };
}

// ── output helpers ────────────────────────────────────────────────────────────
const RESULT: Record<"A" | "B" | "C" | "D", "PASS" | "FAIL" | "SKIPPED" | "PENDING"> = {
  A: "PENDING",
  B: "PENDING",
  C: "PENDING",
  D: "PENDING",
};

function hex(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

function header(s: string): void {
  console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);
}

// ── PART A: COVERAGE ──────────────────────────────────────────────────────────
function partA(font: FKFont, unique: Map<number, BaziHanzi>): void {
  header("A) COVERAGE — every BaZi codepoint has a real glyph (no Tofu)");
  const missing: string[] = [];
  for (const [cp, h] of unique) {
    const glyph = font.glyphForCodePoint(cp);
    const ok = glyph && glyph.id !== 0; // id 0 == .notdef == Tofu
    if (!ok) missing.push(`${h.char} ${hex(cp)} [${h.role}] → .notdef (Tofu)`);
  }
  if (missing.length === 0) {
    console.log(`  ✓ all ${unique.size} unique codepoints have a real glyph.`);
    RESULT.A = "PASS";
  } else {
    console.log(`  ✗ ${missing.length} codepoint(s) missing a glyph:`);
    for (const m of missing) console.log(`    - ${m}`);
    RESULT.A = "FAIL";
  }
}

// ── PART B: RENDER-BACK byte-equality + 戊/午 collision proof ───────────────────
function partB(font: FKFont, unique: Map<number, BaziHanzi>): void {
  header("B) RENDER-BACK — glyph outlines + round-trips to the EXACT codepoint");
  const failures: string[] = [];
  const svgByCp = new Map<number, string>();

  for (const [cp, h] of unique) {
    const char = String.fromCodePoint(cp);

    // 1) outline to an SVG path — must be non-empty (a real, drawable glyph).
    const glyph = font.glyphForCodePoint(cp);
    const svg = glyph.path.toSVG();
    if (!svg || svg.trim().length === 0) {
      failures.push(`${char} ${hex(cp)} [${h.role}] → empty outline path`);
      continue;
    }
    svgByCp.set(cp, svg);

    // 2) layout(char) must map back to the SAME codepoint — no substitution.
    const run = font.layout(char);
    const laidCps = run.glyphs.flatMap((g) => g.codePoints);
    if (laidCps.length !== 1 || laidCps[0] !== cp) {
      failures.push(
        `${char} ${hex(cp)} [${h.role}] → layout mapped to [${laidCps.map(hex).join(", ")}] (substitution!)`,
      );
      continue;
    }

    // 3) reverse map: the laid-out glyph's id must resolve back to exactly this char.
    const gid = run.glyphs[0].id;
    const strings = font.stringsForGlyph(gid);
    if (!strings.includes(char)) {
      failures.push(
        `${char} ${hex(cp)} [${h.role}] → glyph#${gid} reverse-maps to [${strings.join(", ")}] (not "${char}")`,
      );
    }
  }

  // ── the headline 戊/午 collision proof ──────────────────────────────────────
  const wuStem = mapStem("Wu"); // → 戊 (Earth)
  const wuBranch = mapBranch("Wu"); // → 午 (Horse, Fire)
  if ("status" in wuStem || "status" in wuBranch) {
    failures.push(`戊/午 collision: mapper returned SOURCE_NEEDED for "Wu" — cannot prove the case`);
  } else {
    const stemChar = wuStem.hanzi; // 戊
    const branchChar = wuBranch.hanzi; // 午
    const stemGid = font.layout(stemChar).glyphs[0].id;
    const branchGid = font.layout(branchChar).glyphs[0].id;
    const stemSvg = svgByCp.get(stemChar.codePointAt(0)!) ?? font.glyphForCodePoint(stemChar.codePointAt(0)!).path.toSVG();
    const branchSvg = svgByCp.get(branchChar.codePointAt(0)!) ?? font.glyphForCodePoint(branchChar.codePointAt(0)!).path.toSVG();

    const distinctChar = stemChar !== branchChar;
    const distinctGid = stemGid !== branchGid;
    const distinctSvg = stemSvg !== branchSvg;

    console.log(`  ── 戊/午 stem-vs-branch collision (the FINDING-2 case) ──`);
    console.log(`     stem  "Wu" → ${stemChar} ${hex(stemChar.codePointAt(0)!)}  glyph#${stemGid}`);
    console.log(`     branch "Wu" → ${branchChar} ${hex(branchChar.codePointAt(0)!)}  glyph#${branchGid}`);
    console.log(`     distinct chars: ${distinctChar} | distinct glyph ids: ${distinctGid} | distinct SVG paths: ${distinctSvg}`);

    if (!(distinctChar && distinctGid && distinctSvg)) {
      failures.push(
        `戊/午 collision COLLAPSED — chars:${distinctChar} gids:${distinctGid} svgs:${distinctSvg} (must all be true)`,
      );
    }
  }

  if (failures.length === 0) {
    console.log(`  ✓ all ${unique.size} glyphs outline + round-trip to their exact codepoint; 戊/午 stay distinct.`);
    RESULT.B = "PASS";
  } else {
    console.log(`  ✗ ${failures.length} render-back failure(s):`);
    for (const f of failures) console.log(`    - ${f}`);
    RESULT.B = "FAIL";
  }
}

// ── PART C: NFC idempotence ───────────────────────────────────────────────────
function partC(unique: Map<number, BaziHanzi>): void {
  header("C) NFC — every hanzi is its own NFC form; double-NFC is stable");
  const failures: string[] = [];
  for (const [cp, h] of unique) {
    const char = String.fromCodePoint(cp);
    const nfc1 = char.normalize("NFC");
    const nfc2 = nfc1.normalize("NFC");
    if (char !== nfc1) {
      failures.push(`${char} ${hex(cp)} [${h.role}] !== its NFC form (${[...nfc1].map((c) => hex(c.codePointAt(0)!)).join(",")})`);
    } else if (nfc1 !== nfc2) {
      failures.push(`${char} ${hex(cp)} [${h.role}] NFC is not idempotent`);
    }
  }
  if (failures.length === 0) {
    console.log(`  ✓ all ${unique.size} hanzi are NFC-stable (char === NFC(char) === NFC(NFC(char))).`);
    RESULT.C = "PASS";
  } else {
    console.log(`  ✗ ${failures.length} NFC failure(s):`);
    for (const f of failures) console.log(`    - ${f}`);
    RESULT.C = "FAIL";
  }
}

// ── PART D: LICHUN boundary (real FuFire, SOFT gate) ──────────────────────────
// Minimal .env loader mirroring the fufire-live-smoke pattern (no dependency).
function loadDotEnv(): void {
  const file = resolve(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key] = m;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** Bridge .env var names to the canonical names the service reads (see fufire-live-smoke). */
function bridgeConfigNames(): void {
  if (!process.env.FUFIRE_BASE_URL && process.env.FUFIRE_API_URL) {
    process.env.FUFIRE_BASE_URL = process.env.FUFIRE_API_URL;
  }
  const secretRef = process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  if (!process.env[secretRef] && process.env.FUFIRE_API_KEY) {
    process.env[secretRef] = process.env.FUFIRE_API_KEY;
  }
}

interface YearPillar {
  stamm: string; // romanized stem
  zweig: string; // romanized branch
}
interface LichunCase {
  label: string;
  birthDate: string;
  isBeforeLichun: boolean;
  year: YearPillar;
  /** the resolved stem+branch hanzi (joined) for display */
  hanzi: string;
}

async function runLichunCase(label: string, birthDate: string): Promise<LichunCase> {
  const { FuFireDataService } = await import("../../server/services/fufireDataService");
  const svc = new FuFireDataService();
  const result = await svc.executeTestRun({
    birthDate,
    birthTime: "12:00",
    birthTimeKnown: true,
    manualLat: 39.9042,
    manualLon: 116.4074,
    manualTimezone: "Asia/Shanghai",
    standard: "CIVIL",
    requestedOperations: ["bazi"],
    locale: "en",
  } as never);

  if (result.readinessStatus !== "READY") {
    throw new Error(`readinessStatus=${result.readinessStatus} (${result.gatewayIssues.map((g) => g.errorCode).join(",") || "no issue detail"})`);
  }
  const baziResp = result.responses.find((r) => r.operation === "bazi");
  const data = baziResp && "data" in baziResp ? (baziResp.data as Record<string, unknown>) : undefined;
  if (!data) throw new Error(`no bazi data in response (${baziResp && "error" in baziResp ? baziResp.error : "missing"})`);

  const pillars = data.pillars as Record<string, YearPillar> | undefined;
  const transition = data.transition as Record<string, unknown> | undefined;
  const year = pillars?.year;
  if (!year || typeof year.stamm !== "string" || typeof year.zweig !== "string") {
    throw new Error("bazi response missing pillars.year.stamm/zweig");
  }
  const isBeforeLichun = Boolean(transition?.is_before_lichun);

  return {
    label,
    birthDate,
    isBeforeLichun,
    year,
    hanzi: "", // filled by caller after mapping
  };
}

async function partD(font: FKFont): Promise<void> {
  header("D) LICHUN boundary — real FuFire moves the year pillar; both render");
  if (SKIP_LICHUN) {
    console.log("  ⊘ SKIPPED (SPIKE_SKIP_LICHUN=1). A/B/C are the hard gate.");
    RESULT.D = "SKIPPED";
    return;
  }

  loadDotEnv();
  bridgeConfigNames();
  const secretRef = process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  if (!process.env[secretRef]) {
    console.log(`  ⊘ SKIPPED — no FuFire key (looked under ${secretRef} / FUFIRE_API_KEY). A/B/C are the hard gate.`);
    RESULT.D = "SKIPPED";
    return;
  }

  let pre: LichunCase;
  let post: LichunCase;
  try {
    // lichun ≈ Feb 4. 1990-02-03 is PRE; 1990-02-06 is POST. Same calendar year.
    [pre, post] = await Promise.all([
      runLichunCase("pre-lichun  1990-02-03", "1990-02-03"),
      runLichunCase("post-lichun 1990-02-06", "1990-02-06"),
    ]);
  } catch (err) {
    console.log(`  ⊘ SKIPPED — FuFire unreachable / error: ${(err as Error).message}`);
    console.log("    (D is the SOFT secondary check; A/B/C are the hard gate.)");
    RESULT.D = "SKIPPED";
    return;
  }

  // Map both year pillars to hanzi via the SAME authority the product uses.
  const mapCase = (c: LichunCase): { ok: boolean; detail: string; chars: string[] } => {
    const stem = mapStem(c.year.stamm);
    const branch = mapBranch(c.year.zweig);
    if ("status" in stem || "status" in branch) {
      return { ok: false, detail: `SOURCE_NEEDED (stamm=${c.year.stamm}, zweig=${c.year.zweig})`, chars: [] };
    }
    c.hanzi = stem.hanzi + branch.hanzi;
    return { ok: true, detail: `${c.year.stamm}/${c.year.zweig} → ${stem.hanzi}${branch.hanzi}`, chars: [stem.hanzi, branch.hanzi] };
  };
  const preMap = mapCase(pre);
  const postMap = mapCase(post);

  console.log(`  pre  : ${pre.label}  is_before_lichun=${pre.isBeforeLichun}  ${preMap.detail}`);
  console.log(`  post : ${post.label}  is_before_lichun=${post.isBeforeLichun}  ${postMap.detail}`);

  const issues: string[] = [];

  // 1) the boundary must MOVE the pillar (this is the whole point of lichun).
  const pillarMoved =
    pre.year.stamm !== post.year.stamm || pre.year.zweig !== post.year.zweig;
  const lichunFlagDiffers = pre.isBeforeLichun !== post.isBeforeLichun;
  if (!pillarMoved) {
    issues.push(`CONTRADICTION: pre and post year pillar are IDENTICAL (${pre.year.stamm}/${pre.year.zweig}) — lichun boundary did not move the year`);
  }
  if (!lichunFlagDiffers) {
    issues.push(`CONTRADICTION: is_before_lichun did not differ (pre=${pre.isBeforeLichun}, post=${post.isBeforeLichun})`);
  }

  // 2) both must map to hanzi and both must render (reuse A/B at the pixel).
  for (const [name, m] of [["pre", preMap], ["post", postMap]] as const) {
    if (!m.ok) {
      issues.push(`${name}: ${m.detail}`);
      continue;
    }
    for (const ch of m.chars) {
      const cp = ch.codePointAt(0)!;
      const glyph = font.glyphForCodePoint(cp);
      const renders = glyph && glyph.id !== 0 && glyph.path.toSVG().trim().length > 0;
      if (!renders) issues.push(`${name}: ${ch} ${hex(cp)} → Tofu / empty outline`);
    }
  }

  if (issues.length === 0) {
    console.log(`  ✓ boundary moved the year pillar (${pre.year.stamm}/${pre.year.zweig} → ${post.year.stamm}/${post.year.zweig}); both render without Tofu.`);
    RESULT.D = "PASS";
  } else {
    console.log(`  ✗ ${issues.length} issue(s):`);
    for (const i of issues) console.log(`    - ${i}`);
    // A D contradiction is reported loudly but does NOT fail the hard A/B/C gate.
    RESULT.D = "FAIL";
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" AM-4 GATING SPIKE — CJK render proof at the pixel");
  console.log(" feature: bazi-baci-solo-no-mock-mvp");
  console.log("══════════════════════════════════════════════════════════════");

  // ── font preflight (BLK-003 if absent / not a real font) ────────────────────
  if (!existsSync(FONT_PATH)) {
    console.error(`\n✗ BLOCKED (BLK-003): font not found at ${FONT_PATH}`);
    console.error("  Fetch it: curl -fL -o assets/fonts/NotoSansSC.ttf \\");
    console.error('    "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"');
    process.exit(3);
  }
  const sizeMB = statSync(FONT_PATH).size / (1024 * 1024);
  if (sizeMB < 1) {
    console.error(`\n✗ BLOCKED (BLK-003): font at ${FONT_PATH} is ${sizeMB.toFixed(2)}MB (<1MB) — likely an error page, not a real font.`);
    process.exit(3);
  }

  let font: FKFont;
  try {
    font = openFont(FONT_PATH);
  } catch (err) {
    console.error(`\n✗ BLOCKED (BLK-003): fontkit could not open the font: ${(err as Error).message}`);
    process.exit(3);
  }

  const { all, unique } = collectBaziHanzi();

  console.log(`\nfont            : ${font.postscriptName ?? "<unknown>"} (${sizeMB.toFixed(1)}MB, ${font.numGlyphs} glyphs)`);
  console.log(`source          : assets/fonts/NotoSansSC.ttf (Noto Sans SC, OFL 1.1)`);
  console.log(`bazi hanzi       : ${all.length} total references → ${unique.size} unique codepoints`);
  console.log(`codepoint set   :`);
  const sorted = [...unique.entries()].sort((a, b) => a[0] - b[0]);
  for (const [cp, h] of sorted) {
    console.log(`   ${h.char}  ${hex(cp).padEnd(8)} ${h.role}`);
  }

  partA(font, unique);
  partB(font, unique);
  partC(unique);
  await partD(font);

  // ── verdict ─────────────────────────────────────────────────────────────────
  header("VERDICT");
  const line = (k: keyof typeof RESULT, name: string) => {
    const r = RESULT[k];
    const mark = r === "PASS" ? "✓" : r === "FAIL" ? "✗" : r === "SKIPPED" ? "⊘" : "?";
    console.log(`  ${mark} ${k}  ${name.padEnd(46)} ${r}`);
  };
  line("A", "COVERAGE (no Tofu)");
  line("B", "RENDER-BACK (round-trip + 戊/午 distinct)");
  line("C", "NFC idempotence");
  line("D", "LICHUN boundary (real FuFire, soft)");

  // Hard gate = A && B && C all PASS. D is advisory.
  const hardPass = RESULT.A === "PASS" && RESULT.B === "PASS" && RESULT.C === "PASS";

  console.log("──────────────────────────────────────────────────────────────");
  if (hardPass) {
    const dNote =
      RESULT.D === "PASS" ? " (D PASS too)"
      : RESULT.D === "SKIPPED" ? " (D skipped — real boundary not exercised)"
      : " (⚠ D FAILED — see above; advisory, does not block the pixel gate)";
    console.log(`OVERALL VERDICT : ✓ PASS — the no-mock CJK render guarantee holds AT THE PIXEL.${dNote}`);
    console.log("                  → MVP is UNBLOCKED on the CJK-render axis.");
  } else {
    console.log("OVERALL VERDICT : ✗ FAIL — the no-mock CJK render guarantee does NOT hold.");
    console.log("                  → MVP is HONESTLY BLOCKED. Do NOT build the flow on this font.");
  }
  console.log("══════════════════════════════════════════════════════════════");

  process.exit(hardPass ? 0 : 1);
}

main().catch((err) => {
  console.error("\n✗ spike crashed:", err?.stack ?? err?.message ?? err);
  process.exit(2);
});
