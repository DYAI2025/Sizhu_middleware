import { describe, it, expect } from "vitest";
import {
  normalizeBirthInput,
  normalizeBirthInputWithWarnings,
  type NormalizeResult,
} from "../services/birthInputNormalizer";
import {
  type NormalizedBirthInput,
  BIRTH_TIME_UNKNOWN_WARNING,
  DEFAULT_NOON_SOURCE,
  DEFAULT_NOON_TIME,
} from "../contracts/fufireContract";

/**
 * FX6 — birthInputNormalizer mutation-hardening suite (Stryker survivor backlog).
 *
 * Origin: the 2026-06-14 Stryker run scored birthInputNormalizer.ts at 39.3%
 * (17 survived). The survivors clustered on the default-noon decision in
 * `normalizeBirthInputWithWarnings`:
 *
 *   - L57 `const warnings: string[] = [];`  → ArrayDeclaration mutant: returning
 *     `["Stryker was here"]` instead of `[]` survives unless we assert the EXACT
 *     contents of `warnings` on the NOT-defaulted branch (must be empty).
 *   - L60 `typeof input.birthTime === "string" && input.birthTime.trim() !== ""`
 *     → typeof/trim/=== ""/MethodExpression/StringLiteral mutants: survive unless
 *     we exercise present vs absent vs "" vs whitespace-only birthTime and pin the
 *     resulting branch.
 *   - L61 `input.birthTimeKnown === false || !hasUsableTime` → LogicalOperator
 *     (&&↔||) / EqualityOperator (===↔!==) / BooleanLiteral (false↔true) mutants:
 *     survive unless we drive BOTH operands across BOTH truth values and assert
 *     which branch each combination lands in.
 *   - L65/71 the if/else blocks and L67/74 the forced booleans → survive unless
 *     we assert the EXACT normalized birthTime, birthTimeKnown, birthTimeSource,
 *     birth_time_source on BOTH branches.
 *
 * Schärfung: assert EXACT produced values, drive the FULL truth table of
 * (birthTime ∈ {present, absent, "", whitespace}) × (birthTimeKnown ∈ {true,
 * false, undefined}), and assert the warnings array EXACTLY (it carries the
 * BIRTH_TIME_UNKNOWN_DEFAULT_NOON warning iff the time was defaulted, and is
 * empty otherwise). The objective oracle for this file is the Stryker mutation
 * score, not a human reading — these assertions are written to KILL the
 * surviving mutants.
 */

// A complete, builder-ready base input with a KNOWN, usable time.
const KNOWN: NormalizedBirthInput = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  lat: 52.52,
  lon: 13.405,
  timezone: "Europe/Berlin",
};

/**
 * Assert the result represents an APPLIED default-noon: the time was forced to
 * 12:00:00, marked unknown, provenance recorded on both spellings, and the
 * single default-noon warning surfaced (EXACTLY, no more, no fewer).
 */
function expectDefaulted(result: NormalizeResult, expectedWarning = BIRTH_TIME_UNKNOWN_WARNING): void {
  expect(result.normalized.birthTime).toBe(DEFAULT_NOON_TIME);
  expect(result.normalized.birthTime).toBe("12:00:00");
  expect(result.normalized.birthTimeKnown).toBe(false);
  expect(result.normalized.birthTimeSource).toBe(DEFAULT_NOON_SOURCE);
  expect(result.normalized.birthTimeSource).toBe("default_noon");
  expect(result.normalized.birth_time_source).toBe(DEFAULT_NOON_SOURCE);
  expect(result.normalized.birth_time_source).toBe("default_noon");
  // Warnings carry EXACTLY the default-noon warning — kills L57 ArrayDeclaration
  // (a hard-coded ["Stryker was here"] would change length/contents) and any
  // mutant that drops or duplicates the push on L70.
  expect(result.warnings).toEqual([expectedWarning]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toBe("BIRTH_TIME_UNKNOWN_DEFAULT_NOON");
}

/**
 * Assert the result PRESERVED a known time verbatim: birthTime is the supplied
 * value, birthTimeKnown forced to true, NO provenance recorded, and the warnings
 * array is EXACTLY empty.
 */
function expectPreserved(result: NormalizeResult, expectedTime: string): void {
  expect(result.normalized.birthTime).toBe(expectedTime);
  expect(result.normalized.birthTimeKnown).toBe(true);
  // The else-branch never touches provenance — assert it is absent so a mutant
  // that always sets default_noon (L68/69 leaking into the else) is killed.
  expect(result.normalized.birthTimeSource).toBeUndefined();
  expect(result.normalized.birth_time_source).toBeUndefined();
  // NOT defaulted ⇒ warnings EXACTLY empty. Kills L57 ArrayDeclaration mutant
  // (`[]` → ["Stryker was here"]) and any mutant that pushes on the else path.
  expect(result.warnings).toEqual([]);
  expect(result.warnings).toHaveLength(0);
}

describe("normalizeBirthInputWithWarnings — default-noon truth table (FX6)", () => {
  // ── birthTimeKnown === true (caller claims time is known) ──────────────────

  it("known + usable time: PRESERVES verbatim, marks known, NO warning", () => {
    // hasUsableTime=true, birthTimeKnown!==false ⇒ timeUnknown=false ⇒ else branch.
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "14:30", birthTimeKnown: true });
    expectPreserved(result, "14:30");
  });

  it("known + HH:MM:SS time: preserves the exact string (no reformatting)", () => {
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "09:07:42", birthTimeKnown: true });
    expectPreserved(result, "09:07:42");
  });

  it("known but EMPTY-STRING time: still DEFAULTS (no usable time overrides the flag)", () => {
    // birthTimeKnown=true but trim()==="" ⇒ hasUsableTime=false ⇒ !hasUsableTime=true
    // ⇒ timeUnknown=true. Kills the L60 StringLiteral mutant (=== "" → === "Stryker")
    // and the L61 LogicalOperator mutant (|| → &&, which would require BOTH operands
    // true and so would NOT default here since birthTimeKnown===false is false).
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "", birthTimeKnown: true });
    expectDefaulted(result);
  });

  it("known but WHITESPACE-only time: still DEFAULTS (trim() removes the blanks)", () => {
    // Kills the L60 MethodExpression mutant that drops .trim() (without trim,
    // "   " !== "" is true ⇒ hasUsableTime=true ⇒ would PRESERVE "   " and emit no
    // warning). With trim it must DEFAULT.
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "   ", birthTimeKnown: true });
    expectDefaulted(result);
    // And the preserved-path value "   " must NOT survive onto birthTime.
    expect(result.normalized.birthTime).not.toBe("   ");
  });

  it("known but birthTime ABSENT (undefined): DEFAULTS (typeof guard fails)", () => {
    // Kills the L60 typeof mutant: with `typeof input.birthTime === "string"`
    // removed/inverted, undefined.trim() would throw or hasUsableTime would flip.
    const input: NormalizedBirthInput = {
      birthDate: "1990-06-15",
      birthTimeKnown: true,
      lat: 52.52,
      lon: 13.405,
      timezone: "Europe/Berlin",
    };
    const result = normalizeBirthInputWithWarnings(input);
    expectDefaulted(result);
  });

  // ── birthTimeKnown === false (caller explicitly says unknown) ──────────────

  it("unknown flag + usable time: DEFAULTS anyway (explicit false forces noon)", () => {
    // hasUsableTime=true BUT birthTimeKnown===false ⇒ first operand true ⇒
    // timeUnknown=true (OR). Kills the L61 EqualityOperator mutant (=== → !==,
    // which would make `false !== false` = false and PRESERVE the time) and the
    // BooleanLiteral mutant (false → true, `false === true` = false ⇒ preserve).
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "14:30", birthTimeKnown: false });
    expectDefaulted(result);
    // The supplied, otherwise-usable time must be overwritten by noon.
    expect(result.normalized.birthTime).not.toBe("14:30");
  });

  it("unknown flag + absent time: DEFAULTS", () => {
    const input: NormalizedBirthInput = {
      birthDate: "1990-06-15",
      birthTimeKnown: false,
      lat: 52.52,
      lon: 13.405,
      timezone: "Europe/Berlin",
    };
    const result = normalizeBirthInputWithWarnings(input);
    expectDefaulted(result);
  });

  // ── birthTimeKnown === undefined (neither true nor false) ──────────────────

  it("flag UNDEFINED + usable time: PRESERVES (undefined is not === false)", () => {
    // birthTimeKnown===false is FALSE (undefined !== false), hasUsableTime=true ⇒
    // !hasUsableTime=false ⇒ timeUnknown = false||false = false ⇒ PRESERVE.
    // Kills the L61 EqualityOperator mutant (=== → !==: undefined !== false = true
    // ⇒ would wrongly DEFAULT) and confirms the OR short-circuit semantics.
    const input = { ...KNOWN, birthTime: "14:30" } as NormalizedBirthInput;
    delete (input as { birthTimeKnown?: boolean }).birthTimeKnown;
    const result = normalizeBirthInputWithWarnings(input);
    expectPreserved(result, "14:30");
  });

  it("flag UNDEFINED + absent time: DEFAULTS (no usable time triggers noon)", () => {
    // birthTimeKnown===false is false, hasUsableTime=false ⇒ !hasUsableTime=true ⇒
    // timeUnknown=true. The ONLY thing forcing the default here is the time check,
    // so this kills mutations that neuter the `!hasUsableTime` operand.
    const input: NormalizedBirthInput = {
      birthDate: "1990-06-15",
    } as NormalizedBirthInput;
    const result = normalizeBirthInputWithWarnings(input);
    expectDefaulted(result);
  });

  it("flag UNDEFINED + empty-string time: DEFAULTS", () => {
    const input = { ...KNOWN, birthTime: "" } as NormalizedBirthInput;
    delete (input as { birthTimeKnown?: boolean }).birthTimeKnown;
    const result = normalizeBirthInputWithWarnings(input);
    expectDefaulted(result);
  });

  // ── Immutability / passthrough integrity ──────────────────────────────────

  it("preserves unrelated fields and does NOT mutate the caller's object", () => {
    const input: NormalizedBirthInput = { ...KNOWN, birthTime: "14:30", birthTimeKnown: true };
    const snapshot = { ...input };
    const result = normalizeBirthInputWithWarnings(input);
    // Caller object untouched (the normalizer spreads into a fresh object).
    expect(input).toEqual(snapshot);
    // Unrelated fields carried through verbatim.
    expect(result.normalized.birthDate).toBe("1990-06-15");
    expect(result.normalized.lat).toBe(52.52);
    expect(result.normalized.lon).toBe(13.405);
    expect(result.normalized.timezone).toBe("Europe/Berlin");
  });

  it("defaulting does not clobber unrelated fields", () => {
    const result = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "", birthTimeKnown: false });
    expect(result.normalized.birthDate).toBe("1990-06-15");
    expect(result.normalized.lat).toBe(52.52);
    expect(result.normalized.lon).toBe(13.405);
    expect(result.normalized.timezone).toBe("Europe/Berlin");
  });

  it("each call returns a FRESH warnings array (no shared mutable state)", () => {
    const a = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "", birthTimeKnown: false });
    const b = normalizeBirthInputWithWarnings({ ...KNOWN, birthTime: "14:30", birthTimeKnown: true });
    expect(a.warnings).toEqual([BIRTH_TIME_UNKNOWN_WARNING]);
    expect(b.warnings).toEqual([]);
    expect(a.warnings).not.toBe(b.warnings);
  });
});

describe("normalizeBirthInput — thin wrapper returns ONLY the normalized payload (FX6)", () => {
  it("known time: returns the preserved NormalizedBirthInput (no warnings field)", () => {
    const out = normalizeBirthInput({ ...KNOWN, birthTime: "14:30", birthTimeKnown: true });
    expect(out.birthTime).toBe("14:30");
    expect(out.birthTimeKnown).toBe(true);
    expect(out.birthTimeSource).toBeUndefined();
    expect(out.birth_time_source).toBeUndefined();
    // It returns the .normalized member directly — there is no `warnings` key on it.
    expect((out as unknown as { warnings?: unknown }).warnings).toBeUndefined();
  });

  it("unknown time: returns the defaulted NormalizedBirthInput", () => {
    const out = normalizeBirthInput({ ...KNOWN, birthTime: "", birthTimeKnown: false });
    expect(out.birthTime).toBe("12:00:00");
    expect(out.birthTimeKnown).toBe(false);
    expect(out.birthTimeSource).toBe("default_noon");
    expect(out.birth_time_source).toBe("default_noon");
  });

  it("wrapper output equals the .normalized of the with-warnings call (same input)", () => {
    const input: NormalizedBirthInput = { ...KNOWN, birthTime: "", birthTimeKnown: false };
    const wrapped = normalizeBirthInput({ ...input });
    const full = normalizeBirthInputWithWarnings({ ...input });
    expect(wrapped).toEqual(full.normalized);
  });
});
