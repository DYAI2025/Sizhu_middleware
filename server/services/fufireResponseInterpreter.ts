/**
 * FuFire response interpreter + prompt-variable mapper (REQ-F-002 / REQ-F-003 / Task T4).
 *
 * This is the RESPONSE side of the FuFire integration — the value-critical
 * "no invented data" boundary. Its single job is to turn a REAL provider
 * response (bazi + wuxing only) into the small set of prompt variables the
 * downstream prompt template needs, WITHOUT ever guessing, laundering a
 * provider caveat, or binding a value computed for the wrong subject.
 *
 * True-Line invariants enforced here (PRD §2 AC-F-002a..f, AC-F-003a..c, §3.3;
 * VCHK-SFB-001 / 004 / 005 / 007):
 *
 *  - **No invented data (VCHK-SFB-001 / AC-F-002b).** A prompt variable whose
 *    declared source field is absent is left UNDEFINED and an issue carrying
 *    {@link PROMPT_VARIABLE_SOURCE_MISSING} is recorded. We never substitute a
 *    placeholder, a default, or a "reasonable" guess.
 *  - **Provenance, not a guess (AC-F-002a).** Every resolved variable records
 *    the exact source path it was read from (`sources`), so a reviewer can audit
 *    where each value came from.
 *  - **Located-source guard (AC-F-002f, corrected FX5/FX9).** The WESTERN dominance
 *    (`western_dominant` ← wuxing.dominant_element) is geocentric + LOCATION-INVARIANT
 *    (proven live across Berlin/Sydney/Quito) — bound unguarded; the original 0,0-trap
 *    premise (that this value was location-specific) was empirically false and is retired
 *    for it. The EASTERN dominance (`eastern_dominant` ← argmax(fusion.wu_xing_vectors.
 *    bazi_pillars)) IS location-dependent, so the guard applies THERE: a fusion result
 *    whose echoed coords do not match the real subject is a value for the wrong location
 *    → invented data → NOT bound; an issue carrying {@link PROMPT_VARIABLE_SOURCE_MISSING}
 *    and the word "location" is recorded.
 *  - **Honest caveat, never laundered (AC-F-002e / VCHK-SFB-004).** The
 *    provider-declared day-pillar `anchor_verification` ("unverified") is
 *    surfaced verbatim; nothing relabels the *interpretation* as verified.
 *  - **Deferred ops render-block (AC-F-002d / VCHK-SFB-007).** `bazi_trace` and
 *    `chronometry` have no real captured samples this run, so any mapping
 *    attempt is reported as {@link PROMPT_VARIABLE_SOURCE_MISSING} and is never
 *    marked `verified`.
 *  - **Claim-discipline (AC-F-003c / VCHK-SFB-005).** Only chart *calculation*
 *    may ever be called verifiable; the interpretation is never described as
 *    "verified truth" / "objective truth" / "guaranteed fortune".
 *
 * This module is intentionally PURE: no env/secret access, no I/O. It cannot
 * leak a secret because it never reads one (AC-F-002c) — it computes its output
 * entirely from the response objects handed to it.
 */

/**
 * The literal token recorded whenever a required prompt-variable source is
 * absent, or a mapping is attempted against a deferred/unverified operation.
 * Downstream code (and the contract test) greps for this exact string, so it
 * MUST NOT be reworded.
 */
import type {
  FufireCompileFields,
  FufireCompileProvenance,
} from "../contracts/fufireContract";

export const PROMPT_VARIABLE_SOURCE_MISSING = "PROMPT_VARIABLE_SOURCE_MISSING" as const;

/** Claim-discipline marker: the data carried is a chart *calculation*, NOT an oracle. */
const CALCULATION_NOTE =
  "chart calculation only; interpretation is not a verified or guaranteed claim";

/** Supported render locales. `de` and `en` select different (paired) animal sources. */
export type PromptLocale = "de" | "en";

/** The prompt variables this run maps. Values are absent when their source is missing/blocked. */
export interface PromptVariables {
  /** Year-pillar animal. de → pillars.year.tier ("Pferd"); en → chinese.year.animal ("Horse"). */
  animal?: string;
  /** Year-pillar element, e.g. "Metall" (← pillars.year.element). */
  element?: string;
  /** Solar year, e.g. 1990 (← transition.solar_year). */
  birth_year?: number;
  /**
   * WESTERN (geocentric planet-rulership) dominant element, e.g. "Holz"
   * (← wuxing.dominant_element). LOCATION-INVARIANT by design — verified live
   * 2026-06-14 (FX): identical across Berlin/Sydney/Quito at the same instant
   * (geocentric planet positions do not depend on the observer's lat/lon). The
   * former 0,0-trap guard (AC-F-002f) was based on a false premise and is RETIRED
   * for this field (FX5); it is bound regardless of subject coordinates.
   */
  western_dominant?: string;
  /**
   * EASTERN (located, bazi-pillar) dominant element, e.g. "Feuer"
   * (← argmax(fusion.wu_xing_vectors.bazi_pillars)). LOCATION-DEPENDENT — bound
   * only when the fusion response coords match the subject (the located guard is
   * load-bearing here, unlike the western vector). Requires the fusion operation
   * (FX9); absent + flagged when fusion was not run or coords mismatch.
   */
  eastern_dominant?: string;
  /** @deprecated alias of {@link western_dominant} (back-compat; same value, no guard). */
  dominant_element?: string;
}

/** The source path each resolved variable was read from (provenance, AC-F-002a). */
export type PromptVariableSources = Partial<Record<keyof PromptVariables, string>>;

/** Birth coordinates of the real subject the prompt is for. */
export interface SubjectCoordinates {
  lat: number;
  lon: number;
}

export interface ResolvePromptVariablesInput {
  /** Real bazi response (the shape of `docs/contracts/fufire-samples/bazi.response.json`). */
  bazi?: unknown;
  /** Real wuxing response (the shape of `docs/contracts/fufire-samples/wuxing.response.json`). */
  wuxing?: unknown;
  /**
   * Real fusion response (FX9; flat, `wu_xing_vectors.{western_planets,bazi_pillars}`).
   * Source of the EASTERN (located) dominance. Absent ⇒ eastern_dominant is
   * unresolved + flagged (never guessed).
   */
  fusion?: unknown;
  /** Active render locale; selects the (paired) animal source. Defaults to "en". */
  locale?: PromptLocale | string;
  /** The real subject's birth coordinates — used to guard the LOCATED (eastern/fusion) source. */
  subject?: SubjectCoordinates;
}

export interface ResolvePromptVariablesResult {
  /** Only the variables whose source was present (and, for wuxing, location-matched). */
  variables: PromptVariables;
  /** The matched source path per resolved variable (provenance). */
  sources: PromptVariableSources;
  /** Alias of {@link sources} — same object, exposed under the provenance synonym. */
  matchedPaths: PromptVariableSources;
  /** Human-/grep-readable issues; each missing/blocked source pushes one entry. */
  issues: string[];
  /** Alias of {@link issues} — same array, exposed under the synonym callers may read. */
  errors: string[];
}

export type FufireOperation = "bazi" | "bazi_trace" | "chronometry" | "wuxing" | string;

export interface InterpretFufireResponseInput {
  operation: FufireOperation;
  response: unknown;
}

export interface InterpretFufireResponseResult {
  operation: FufireOperation;
  /**
   * Whether this operation produces a mapping we can treat as a verifiable chart
   * *calculation*. Deferred ops are never `true`. (Never asserts the
   * interpretation itself is "verified truth" — see {@link CALCULATION_NOTE}.)
   */
  verified: boolean;
  /** Provider-declared caveats surfaced verbatim (e.g. day-pillar anchor status). */
  caveats: string[];
  /** Alias of {@link caveats} — the day-pillar caveat read under its dedicated synonym. */
  dayPillar: string[];
  /** Issues, e.g. {@link PROMPT_VARIABLE_SOURCE_MISSING} for deferred/unverified ops. */
  issues: string[];
  /** Claim-discipline note: this is a calculation, not an oracle (AC-F-003c). */
  note: string;
}

// ---------------------------------------------------------------------------
// Internal helpers — safe, typed traversal of an `unknown` response object.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a value at a dot-path (e.g. `"pillars.year.element"`) from an unknown
 * object, returning `undefined` if any segment is missing or not an object.
 * Crucially distinguishes "path present" (`{ found: true }`) from "path absent"
 * so that a legitimately-present `null`/`0`/`""` is not mistaken for missing.
 */
function readPath(root: unknown, path: string): { found: boolean; value: unknown } {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

/** A required string source: present + a non-empty string, else "missing". */
function resolveString(
  root: unknown,
  path: string,
): { value?: string; found: boolean } {
  const { found, value } = readPath(root, path);
  if (found && typeof value === "string" && value.trim() !== "") {
    return { value, found: true };
  }
  return { found: false };
}

/** A required number source: present + a finite number, else "missing". */
function resolveNumber(
  root: unknown,
  path: string,
): { value?: number; found: boolean } {
  const { found, value } = readPath(root, path);
  if (found && typeof value === "number" && Number.isFinite(value)) {
    return { value, found: true };
  }
  return { found: false };
}

/** Issue text for an absent required source (greppable for the missing token). */
function missingSourceIssue(variable: string, path: string): string {
  return `${PROMPT_VARIABLE_SOURCE_MISSING}: ${variable} (no source at ${path})`;
}

// ---------------------------------------------------------------------------
// resolvePromptVariables (REQ-F-003 source map; AC-F-002a/b/f, AC-F-003a/b)
// ---------------------------------------------------------------------------

/**
 * The locale-driven animal source. The two sources are kept PAIRED (same
 * year pillar) and selected by locale — never mixed within one render
 * (PRD §3.3, AC-F-002a).
 */
const ANIMAL_SOURCE_BY_LOCALE: Record<PromptLocale, string> = {
  de: "pillars.year.tier", // "Pferd"
  en: "chinese.year.animal", // "Horse"
};

/**
 * Resolve the prompt variables from REAL bazi + wuxing responses, recording the
 * matched source path for each, and an issue for every required source that is
 * absent or blocked. Never guesses a value.
 */
export function resolvePromptVariables(
  input: ResolvePromptVariablesInput,
): ResolvePromptVariablesResult {
  const { bazi, wuxing, fusion, subject } = input;
  const locale: PromptLocale = input.locale === "de" ? "de" : "en";

  const variables: PromptVariables = {};
  const sources: PromptVariableSources = {};
  const issues: string[] = [];

  // Provenance paths are recorded with their RESPONSE prefix (`bazi.` / `wuxing.`
  // / `fusion.`) so the audit trail is uniform + says WHICH response each value
  // came from (review consistency fix).
  // --- animal (locale-driven; sources kept paired, selected by locale) ------
  const animalPath = ANIMAL_SOURCE_BY_LOCALE[locale];
  const animal = resolveString(bazi, animalPath);
  if (animal.found) {
    variables.animal = animal.value;
    sources.animal = `bazi.${animalPath}`;
  } else {
    issues.push(missingSourceIssue("animal", `bazi.${animalPath}`));
  }

  // --- element ← pillars.year.element ---------------------------------------
  const ELEMENT_PATH = "pillars.year.element";
  const element = resolveString(bazi, ELEMENT_PATH);
  if (element.found) {
    variables.element = element.value;
    sources.element = `bazi.${ELEMENT_PATH}`;
  } else {
    issues.push(missingSourceIssue("element", `bazi.${ELEMENT_PATH}`));
  }

  // --- birth_year ← transition.solar_year (a number) ------------------------
  const BIRTH_YEAR_PATH = "transition.solar_year";
  const birthYear = resolveNumber(bazi, BIRTH_YEAR_PATH);
  if (birthYear.found) {
    variables.birth_year = birthYear.value;
    sources.birth_year = `bazi.${BIRTH_YEAR_PATH}`;
  } else {
    issues.push(missingSourceIssue("birth_year", `bazi.${BIRTH_YEAR_PATH}`));
  }

  // --- western_dominant ← wuxing.dominant_element (LOCATION-INVARIANT) ----------
  // FX5 / corrected AC-F-002f: the wuxing top-level dominant_element is the WESTERN
  // (geocentric planet-rulership) dominance, proven LOCATION-INVARIANT by the live
  // probe (identical at Berlin/Sydney/Quito, same instant). The former 0,0-trap
  // guard rested on a false premise (that this value was location-specific) and is
  // RETIRED for the western field — it is bound regardless of subject coordinates.
  // `dominant_element` is kept as a deprecated alias of western_dominant.
  const WESTERN_PATH = "dominant_element";
  const western = resolveString(wuxing, WESTERN_PATH);
  if (western.found) {
    variables.western_dominant = western.value;
    variables.dominant_element = western.value; // @deprecated alias
    sources.western_dominant = "wuxing.dominant_element";
    sources.dominant_element = "wuxing.dominant_element";
  } else {
    issues.push(missingSourceIssue("western_dominant", `wuxing.${WESTERN_PATH}`));
  }

  // --- eastern_dominant ← argmax(fusion.wu_xing_vectors.bazi_pillars) -----------
  // The EASTERN (located, bazi-pillar) dominance IS location-dependent, so the
  // located guard is load-bearing here: the fusion response must have been computed
  // at coordinates matching the real subject, else it is a value for the WRONG
  // location → invented data → not bound (AC-F-002f, correctly applied to the
  // located source). Requires the fusion operation; absent ⇒ flagged, never guessed.
  const EASTERN_PATH = "wu_xing_vectors.bazi_pillars";
  const baziVector = readPath(fusion, EASTERN_PATH);
  if (!baziVector.found || !isRecord(baziVector.value)) {
    issues.push(missingSourceIssue("eastern_dominant", `fusion.${EASTERN_PATH}`));
  } else if (!responseMatchesSubject(fusion, subject)) {
    issues.push(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: eastern_dominant location mismatch ` +
        `(fusion computed at ${describeResponseLocation(fusion)} ≠ subject)`,
    );
  } else {
    const dom = argmaxElement(baziVector.value);
    if (dom !== undefined) {
      variables.eastern_dominant = dom;
      sources.eastern_dominant = `fusion.${EASTERN_PATH} (argmax)`;
    } else {
      issues.push(missingSourceIssue("eastern_dominant", `fusion.${EASTERN_PATH}`));
    }
  }

  // `matchedPaths`/`errors` are synonyms callers may read; they reference the
  // SAME objects as `sources`/`issues` (not copies), so they can never drift.
  return { variables, sources, matchedPaths: sources, issues, errors: issues };
}

/**
 * True only when a (located) response's echoed source coordinates match the
 * subject's birth coordinates. If either side is unknown, we CANNOT prove they
 * match, so we treat it as a mismatch (fail closed — no invented binding). Used
 * for the LOCATED sources (fusion/eastern); the western wuxing vector is
 * location-invariant and does NOT use this guard (FX5).
 */
function responseMatchesSubject(
  response: unknown,
  subject: SubjectCoordinates | undefined,
): boolean {
  if (!subject || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lon)) {
    return false;
  }
  const lat = readPath(response, "input.lat");
  const lon = readPath(response, "input.lon");
  if (
    !lat.found ||
    !lon.found ||
    typeof lat.value !== "number" ||
    typeof lon.value !== "number"
  ) {
    return false;
  }
  return coordsEqual(lat.value, subject.lat) && coordsEqual(lon.value, subject.lon);
}

/** Coordinate equality with a tolerance smaller than any meaningful location delta. */
function coordsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** A short, secret-free description of where a located result was computed (for the issue). */
function describeResponseLocation(response: unknown): string {
  const lat = readPath(response, "input.lat");
  const lon = readPath(response, "input.lon");
  const latStr = typeof lat.value === "number" ? String(lat.value) : "?";
  const lonStr = typeof lon.value === "number" ? String(lon.value) : "?";
  return `${latStr},${lonStr}`;
}

/**
 * Deterministic argmax over an element→weight vector (e.g. the fusion
 * bazi_pillars vector): returns the element key with the strictly-largest finite
 * numeric weight. Returns undefined if the vector has no usable numeric entry, or
 * if the top weight is tied (ambiguous → not bound, never an arbitrary guess).
 */
function argmaxElement(vector: Record<string, unknown>): string | undefined {
  let best: string | undefined;
  let bestVal = -Infinity;
  let tied = false;
  for (const [key, raw] of Object.entries(vector)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    if (raw > bestVal) {
      bestVal = raw;
      best = key;
      tied = false;
    } else if (raw === bestVal) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

// ---------------------------------------------------------------------------
// renderPromptTemplate (REQ-F-003; AC-F-003a/b)
// ---------------------------------------------------------------------------

const TEMPLATE_PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Replace `{{var}}` placeholders with `variables[var]`. If the template
 * references a variable that has no resolved value, the render is BLOCKED with
 * an error carrying {@link PROMPT_VARIABLE_SOURCE_MISSING} — never emitting an
 * unfilled or guessed placeholder (AC-F-003a/b / VCHK-SFB-001). Only the safe
 * mapped variables are interpolated.
 */
export function renderPromptTemplate(
  template: string,
  variables: PromptVariables & Record<string, unknown>,
): string {
  const missing: string[] = [];

  const rendered = template.replace(TEMPLATE_PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null) {
      missing.push(name);
      return _match; // placeholder kept only so the error message is precise; throws below.
    }
    return String(value);
  });

  if (missing.length > 0) {
    throw new Error(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: render-block — unresolved template ` +
        `variable(s): ${missing.join(", ")}`,
    );
  }

  return rendered;
}

// ---------------------------------------------------------------------------
// interpretFufireResponse (REQ-F-002; AC-F-002d/e, AC-F-003c)
// ---------------------------------------------------------------------------

/** Operations that have NO real captured sample this run and must render-block. */
const DEFERRED_OPERATIONS: ReadonlySet<string> = new Set(["bazi_trace", "chronometry"]);

/**
 * Interpret a single FuFire response into an auditable summary:
 *  - `bazi`: surface the provider-declared day-pillar `anchor_verification`
 *    caveat verbatim ("unverified"), never relabeled (AC-F-002e). The
 *    interpretation is never described as verified truth (AC-F-003c).
 *  - `bazi_trace` / `chronometry`: deferred — no real sample, so the result
 *    carries {@link PROMPT_VARIABLE_SOURCE_MISSING} and is never `verified`
 *    (AC-F-002d / VCHK-SFB-007).
 *  - `wuxing`: the chart calculation is mappable; still carries the
 *    claim-discipline note.
 */
export function interpretFufireResponse(
  input: InterpretFufireResponseInput,
): InterpretFufireResponseResult {
  const { operation, response } = input;
  const caveats: string[] = [];
  const issues: string[] = [];

  if (DEFERRED_OPERATIONS.has(operation)) {
    // No real sample exists for these — any prompt-variable mapping is blocked,
    // and nothing about them may be asserted as a verified mapping.
    issues.push(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: operation "${operation}" is deferred ` +
        `(no real sample this run); response mapping is render-blocked`,
    );
    return {
      operation,
      verified: false,
      caveats,
      dayPillar: caveats,
      issues,
      note: CALCULATION_NOTE,
    };
  }

  if (operation === "bazi") {
    // Surface the provider-declared day-pillar caveat exactly as the provider
    // stated it — do NOT launder "unverified" into "verified".
    const anchor = readPath(
      response,
      "derivation_trace.day.day_anchor_evidence.anchor_verification",
    );
    if (anchor.found && typeof anchor.value === "string") {
      caveats.push(`day-pillar anchor_verification: ${anchor.value}`);
    } else {
      // Absence of the caveat field is itself a missing source for the
      // verification status — record it rather than implying it is verified.
      issues.push(
        `${PROMPT_VARIABLE_SOURCE_MISSING}: day-pillar anchor_verification absent ` +
          `(cannot assert verification status)`,
      );
    }
    return {
      operation,
      // Only the chart *calculation* is treatable as verifiable; the note keeps
      // this honest — we never call the interpretation "verified truth".
      verified: true,
      caveats,
      dayPillar: caveats,
      issues,
      note: CALCULATION_NOTE,
    };
  }

  if (operation === "wuxing" || operation === "fusion") {
    // Both are treatable chart *calculations* (wuxing = western vector; fusion =
    // western + eastern/bazi vectors). The note keeps the claim honest.
    return {
      operation,
      verified: true,
      caveats,
      dayPillar: caveats,
      issues,
      note: CALCULATION_NOTE,
    };
  }

  // Any unknown / unlisted operation is treated as deferred: fail closed.
  issues.push(
    `${PROMPT_VARIABLE_SOURCE_MISSING}: unknown operation "${operation}"; ` +
      `response mapping is render-blocked`,
  );
  return {
    operation,
    verified: false,
    caveats,
    dayPillar: caveats,
    issues,
    note: CALCULATION_NOTE,
  };
}

// ---------------------------------------------------------------------------
// readCompileFields — Year-Pillar raw tokens + provenance (read-side projection)
// ---------------------------------------------------------------------------

/**
 * Unwrap the `{ data }` bazi envelope if present, else return the value as-is.
 * The REAL captured response is `{ _note, data }`; callers may also pass the
 * already-unwrapped inner object. We treat a record carrying a `data` object as
 * the envelope; anything else is assumed already-unwrapped.
 */
function unwrapData(response: unknown): unknown {
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }
  return response;
}

/** A present-and-string value at `path`, else `undefined` (never throws). */
function optionalString(root: unknown, path: string): string | undefined {
  const { found, value } = readPath(root, path);
  return found && typeof value === "string" ? value : undefined;
}

/** A present-and-finite-number value at `path`, else `undefined` (never throws). */
function optionalNumber(root: unknown, path: string): number | undefined {
  const { found, value } = readPath(root, path);
  return found && typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** A present-and-boolean value at `path`, else `undefined` (never throws). */
function optionalBoolean(root: unknown, path: string): boolean | undefined {
  const { found, value } = readPath(root, path);
  return found && typeof value === "boolean" ? value : undefined;
}

/**
 * Surface the Year-Pillar raw tokens, key dates, solar-year transition, and the
 * engine provenance block from a REAL bazi response.
 *
 * Accepts either the wrapped `{ data }` envelope (the live capture shape) or an
 * already-unwrapped inner object. This is a pure, no-invented-data projection: a
 * source field that is absent (or the wrong type) is left `undefined` — it is
 * never substituted, defaulted, or guessed, and a missing field never throws
 * (mirrors the interpreter's "no invented data" boundary). `provenance` is always
 * returned as an object so callers can read its (possibly-undefined) fields
 * without a null-check.
 */
export function readCompileFields(response: unknown): FufireCompileFields {
  const data = unwrapData(response);

  const provenance: FufireCompileProvenance = {
    engineVersion: optionalString(data, "provenance.engine_version"),
    rulesetId: optionalString(data, "provenance.ruleset_id"),
    parameterSetId: optionalString(data, "provenance.parameter_set_id"),
    ephemerisId: optionalString(data, "provenance.ephemeris_id"),
    computationTimestamp: optionalString(data, "provenance.computation_timestamp"),
  };

  return {
    yearStem: optionalString(data, "pillars.year.stamm"),
    yearBranch: optionalString(data, "pillars.year.zweig"),
    animalDe: optionalString(data, "pillars.year.tier"),
    animalEn: optionalString(data, "chinese.year.animal"),
    elementDe: optionalString(data, "pillars.year.element"),
    birthLocal: optionalString(data, "dates.birth_local"),
    birthUtc: optionalString(data, "dates.birth_utc"),
    lichunLocal: optionalString(data, "dates.lichun_local"),
    isBeforeLichun: optionalBoolean(data, "transition.is_before_lichun"),
    solarYear: optionalNumber(data, "transition.solar_year"),
    provenance,
  };
}
