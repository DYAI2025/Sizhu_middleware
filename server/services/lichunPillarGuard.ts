/**
 * lichunPillarGuard — REQ-F-010 (non-deferrable lichun hard-gate).
 *
 * The Year pillar of a BaZi chart flips at lichun (立春, ~Feb 4), so a birth a few days
 * either side of lichun belongs to a DIFFERENT zodiac year — a value-critical correctness
 * boundary for a print-on-demand artifact. FuFire computes the year pillar WITH lichun,
 * server-side (verified live, AM-4 spike):
 *
 *   1990-02-03 → is_before_lichun=true  → year pillar 己巳 (Ji / Si)
 *   1990-02-06 → is_before_lichun=false → year pillar 庚午 (Geng / Wu)
 *
 * OUR code does NOT recompute the pillar — it CONSUMES FuFire's lichun-adjusted year pillar.
 * This guard's single job is to prove we consume it FAITHFULLY and FAIL CLOSED otherwise:
 *
 *  - **Provenance, never a constant.** The year pillar is read from the response's
 *    `pillars.year.{stamm,zweig}` (via `readCompileFields`), and the matched source path is
 *    recorded. It is never hardcoded, cached, or label-copied — mutate the response and the
 *    output moves with it.
 *  - **No laundering of "unverified".** If the provider-declared day-pillar
 *    `anchor_verification` is "unverified" (the live sample's real value) or absent, the
 *    guard BLOCKS (throws {@link LichunPillarBlockedError}) — the caveat is surfaced verbatim
 *    and is NEVER relabeled as verified.
 *  - **No invented hanzi.** Romanizations are mapped to hanzi only via the authoritative
 *    {@link baziSymbolMapper}; an unknown token yields a `SOURCE_NEEDED` sentinel and BLOCKS
 *    rather than guessing a glyph.
 *
 * Pure module: no env/secret access, no I/O. It computes its output entirely from the
 * response object handed to it (it cannot leak a secret because it never reads one).
 */

import { mapBranch, mapStem, type SourceNeeded } from "./baziSymbolMapper";
import { readCompileFields } from "./fufireResponseInterpreter";

/** Greppable marker recorded whenever the guard fails closed. */
export const LICHUN_PILLAR_BLOCKED = "LICHUN_PILLAR_BLOCKED" as const;

/** The source path each provenance field was read from (audit trail). */
export interface YearPillarSources {
  /** Path the year-pillar STEM romanization was read from. */
  yearStem: string;
  /** Path the year-pillar BRANCH romanization was read from. */
  yearBranch: string;
  /** Path the day-pillar anchor verification status was read from. */
  anchorVerification: string;
  /** Path the lichun side was read from. */
  isBeforeLichun: string;
}

/**
 * The verified Year-Pillar provenance the downstream renderer consumes. Returned only when
 * the guard PASSES — a blocked response throws {@link LichunPillarBlockedError} instead.
 */
export interface YearPillarProvenance {
  /** Year-pillar STEM romanization, exactly as FuFire emitted it (e.g. "Geng"). */
  yearStem: string;
  /** Year-pillar BRANCH romanization, exactly as FuFire emitted it (e.g. "Wu"). */
  yearBranch: string;
  /** Year-pillar hanzi, e.g. "庚午" — stem hanzi + branch hanzi via baziSymbolMapper. */
  yearPillarHanzi: string;
  /** The lichun side FuFire reported for this birth date (consumed verbatim). */
  isBeforeLichun: boolean;
  /** The provider day-pillar anchor status, surfaced verbatim (only present + verified passes). */
  anchorVerification: string;
  /** Always `false` on a returned result — a blocked response throws instead of returning. */
  blocked: false;
  /** Matched source path per provenance field (provenance, never a guess). */
  sources: YearPillarSources;
}

/** Thrown when the guard fails closed (unverified/absent anchor, missing/unknown pillar). */
export class LichunPillarBlockedError extends Error {
  constructor(reason: string) {
    super(`${LICHUN_PILLAR_BLOCKED}: ${reason}`);
    this.name = "LichunPillarBlockedError";
  }
}

const YEAR_STEM_PATH = "pillars.year.stamm";
const YEAR_BRANCH_PATH = "pillars.year.zweig";
const ANCHOR_PATH = "derivation_trace.day.day_anchor_evidence.anchor_verification";
const LICHUN_PATH = "transition.is_before_lichun";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Unwrap the `{ data }` bazi envelope if present, else return as-is (mirrors the interpreter). */
function unwrapData(response: unknown): unknown {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }
  return response;
}

/** Read a string at a dot-path from an unknown object, else `undefined`. */
function readString(root: unknown, path: string): string | undefined {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function isSourceNeeded(value: unknown): value is SourceNeeded {
  return isRecord(value) && value.status === "SOURCE_NEEDED";
}

/**
 * Assert that the Year pillar used downstream comes from FuFire's lichun-adjusted response,
 * with a verified day-pillar anchor — or fail closed.
 *
 * @param interpretedResponse  a REAL FuFire bazi response (the `{ _note, data }` envelope or
 *   the already-unwrapped inner object).
 * @returns the {@link YearPillarProvenance} when the guard passes.
 * @throws {LichunPillarBlockedError} when the anchor is unverified/absent, the year pillar
 *   source is missing, or a romanization is not a known FuFire token.
 */
export function assertYearPillarProvenance(
  interpretedResponse: unknown,
): YearPillarProvenance {
  const data = unwrapData(interpretedResponse);

  // --- 1. No laundering: the provider anchor status must be present + "verified" ---------
  // Read the raw status verbatim (NEVER relabel "unverified" → "verified").
  const anchorVerification = readString(data, ANCHOR_PATH);
  if (anchorVerification === undefined) {
    throw new LichunPillarBlockedError(
      `day-pillar anchor_verification absent at ${ANCHOR_PATH} — cannot assert verified`,
    );
  }
  if (anchorVerification !== "verified") {
    throw new LichunPillarBlockedError(
      `day-pillar anchor_verification is "${anchorVerification}" (not "verified") — ` +
        `refusing to launder an unverified anchor`,
    );
  }

  // --- 2. Provenance: the year pillar is READ FROM the response (never a constant) -------
  // `readCompileFields` is the shared, no-invented-data projection of the response.
  const fields = readCompileFields(interpretedResponse);
  const { yearStem, yearBranch } = fields;

  if (!yearStem || !yearBranch) {
    throw new LichunPillarBlockedError(
      `year-pillar source absent (${YEAR_STEM_PATH} / ${YEAR_BRANCH_PATH}) — ` +
        `no invented pillar`,
    );
  }

  // The lichun side is consumed verbatim; the guard does not recompute it.
  if (typeof fields.isBeforeLichun !== "boolean") {
    throw new LichunPillarBlockedError(
      `lichun side absent at ${LICHUN_PATH} — cannot prove lichun-adjusted consumption`,
    );
  }

  // --- 3. No invented hanzi: map romanizations only via the authoritative mapper ---------
  const stem = mapStem(yearStem);
  if (isSourceNeeded(stem)) {
    throw new LichunPillarBlockedError(
      `unknown year-pillar stem token "${yearStem}" — refusing to guess a hanzi`,
    );
  }
  const branch = mapBranch(yearBranch);
  if (isSourceNeeded(branch)) {
    throw new LichunPillarBlockedError(
      `unknown year-pillar branch token "${yearBranch}" — refusing to guess a hanzi`,
    );
  }

  return {
    yearStem,
    yearBranch,
    yearPillarHanzi: `${stem.hanzi}${branch.hanzi}`,
    isBeforeLichun: fields.isBeforeLichun,
    anchorVerification,
    blocked: false,
    sources: {
      yearStem: `bazi.${YEAR_STEM_PATH}`,
      yearBranch: `bazi.${YEAR_BRANCH_PATH}`,
      anchorVerification: `bazi.${ANCHOR_PATH}`,
      isBeforeLichun: `bazi.${LICHUN_PATH}`,
    },
  };
}
