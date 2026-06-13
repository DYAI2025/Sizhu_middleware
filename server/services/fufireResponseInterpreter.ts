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
 *  - **The 0,0 trap (AC-F-002f).** The captured wuxing sample was computed at
 *    `input.lat:0, input.lon:0` — a SHAPE fixture. A `dominant_element` derived
 *    at coordinates that do not match the real subject is a value computed for
 *    the wrong location → invented data → NOT bound; an issue carrying both
 *    {@link PROMPT_VARIABLE_SOURCE_MISSING} and the word "location" is recorded.
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
  /** Western-vector dominant element, e.g. "Holz" (← wuxing.dominant_element); 0,0-guarded. */
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
  /** Active render locale; selects the (paired) animal source. Defaults to "en". */
  locale?: PromptLocale | string;
  /** The real subject's birth coordinates — used to guard the wuxing 0,0 trap. */
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
  const { bazi, wuxing, subject } = input;
  const locale: PromptLocale = input.locale === "de" ? "de" : "en";

  const variables: PromptVariables = {};
  const sources: PromptVariableSources = {};
  const issues: string[] = [];

  // --- animal (locale-driven; sources kept paired, selected by locale) ------
  const animalPath = ANIMAL_SOURCE_BY_LOCALE[locale];
  const animal = resolveString(bazi, animalPath);
  if (animal.found) {
    variables.animal = animal.value;
    sources.animal = animalPath;
  } else {
    issues.push(missingSourceIssue("animal", animalPath));
  }

  // --- element ← pillars.year.element ---------------------------------------
  const ELEMENT_PATH = "pillars.year.element";
  const element = resolveString(bazi, ELEMENT_PATH);
  if (element.found) {
    variables.element = element.value;
    sources.element = ELEMENT_PATH;
  } else {
    issues.push(missingSourceIssue("element", ELEMENT_PATH));
  }

  // --- birth_year ← transition.solar_year (a number) ------------------------
  const BIRTH_YEAR_PATH = "transition.solar_year";
  const birthYear = resolveNumber(bazi, BIRTH_YEAR_PATH);
  if (birthYear.found) {
    variables.birth_year = birthYear.value;
    sources.birth_year = BIRTH_YEAR_PATH;
  } else {
    issues.push(missingSourceIssue("birth_year", BIRTH_YEAR_PATH));
  }

  // --- dominant_element ← wuxing.dominant_element, GUARDED by the 0,0 trap ---
  // A wuxing result computed at coordinates that do not match the real subject
  // is a value computed for the WRONG location → invented data → not bound
  // (AC-F-002f / VCHK-SFB-001).
  const DOMINANT_PATH = "dominant_element";
  const dominant = resolveString(wuxing, DOMINANT_PATH);
  if (!dominant.found) {
    issues.push(missingSourceIssue("dominant_element", DOMINANT_PATH));
  } else if (!wuxingMatchesSubject(wuxing, subject)) {
    // The source value exists but was computed for a different location (the
    // captured sample's 0,0). Surface BOTH the missing token and "location" so
    // downstream code can distinguish a location mismatch from a plain absence.
    issues.push(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: dominant_element location mismatch ` +
        `(wuxing computed at ${describeWuxingLocation(wuxing)} ≠ subject)`,
    );
  } else {
    variables.dominant_element = dominant.value;
    sources.dominant_element = "wuxing.dominant_element";
  }

  // `matchedPaths`/`errors` are synonyms callers may read; they reference the
  // SAME objects as `sources`/`issues` (not copies), so they can never drift.
  return { variables, sources, matchedPaths: sources, issues, errors: issues };
}

/**
 * True only when the wuxing response's source coordinates match the subject's
 * birth coordinates. If either side is unknown, we CANNOT prove they match, so
 * we treat it as a mismatch (fail closed — no invented binding).
 */
function wuxingMatchesSubject(
  wuxing: unknown,
  subject: SubjectCoordinates | undefined,
): boolean {
  if (!subject || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lon)) {
    return false;
  }
  const lat = readPath(wuxing, "input.lat");
  const lon = readPath(wuxing, "input.lon");
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

/** A short, secret-free description of where a wuxing result was computed (for the issue). */
function describeWuxingLocation(wuxing: unknown): string {
  const lat = readPath(wuxing, "input.lat");
  const lon = readPath(wuxing, "input.lon");
  const latStr = typeof lat.value === "number" ? String(lat.value) : "?";
  const lonStr = typeof lon.value === "number" ? String(lon.value) : "?";
  return `${latStr},${lonStr}`;
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

  if (operation === "wuxing") {
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
