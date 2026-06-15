import { describe, it, expect } from "vitest";
import {
  ALLOWED_FUFIRE_OPERATIONS,
  isAllowedFuFireOperation,
  collectRequestedOperations,
  validateRequestedOperations,
  sanitizeTestRunBody,
} from "../services/fufireOperations";

/**
 * FX6 — fufireOperations.ts mutation-hardening suite (Stryker survivor backlog).
 *
 * Origin: the Stryker baseline scored fufireOperations.ts at 51.8% (27 survived).
 * This module is the server security boundary for the operation-only FuFire
 * endpoint (REQ-A-001): it enforces the operation allowlist and strips
 * body-controlled steering fields (URL / header / secret-ref) so the client can
 * never influence the outbound request. The existing tests pin shapes but leave
 * the conditionals, the dedup, the null/array guards, and the exact
 * retained/stripped key sets unpinned, so mutants in those spots survived.
 *
 * Hot-spots targeted (line numbers from the module under test):
 *   - L51 / L66: typeof / Array.isArray conditionals — both branches pinned.
 *   - L69: the singular `operation` allowlist-collection check.
 *   - L90: validateRequestedOperations `.filter(...)` MethodExpression + the
 *     `!isAllowedFuFireOperation` negation.
 *   - L101: sanitizeTestRunBody guard `body === null || typeof body !== "object"
 *     || Array.isArray(body)` (Logical / Equality / Conditional / StringLiteral).
 *   - L105: nested `input` sanitization conditional.
 *
 * Every assertion pins an EXACT value, drives BOTH branches of each conditional,
 * and asserts exact retained/stripped key sets — written to KILL specific
 * surviving mutants, not to read well. The objective oracle is the Stryker score.
 */

// ── 0. allowlist constant: the four server-owned operations, exact set ─────────
describe("FX6 ALLOWED_FUFIRE_OPERATIONS — exact server-owned set", () => {
  it("is exactly chronometry / bazi / baziTrace / wuxing / fusion in order", () => {
    expect([...ALLOWED_FUFIRE_OPERATIONS]).toEqual([
      "chronometry",
      "bazi",
      "baziTrace",
      "wuxing",
      "fusion",
    ]);
  });
});

// ── 1. isAllowedFuFireOperation — each allowed true, everything else false ─────
describe("FX6 isAllowedFuFireOperation — string-literal allowlist membership", () => {
  // Kills L51 typeof guard (each literal must be recognised) and any
  // StringLiteral mutation of an allowlist entry.
  for (const op of ALLOWED_FUFIRE_OPERATIONS) {
    it(`returns true for allowed operation "${op}"`, () => {
      expect(isAllowedFuFireOperation(op)).toBe(true);
    });
  }

  it("returns false for an unknown operation name", () => {
    expect(isAllowedFuFireOperation("podDispatch")).toBe(false);
    expect(isAllowedFuFireOperation("Bazi")).toBe(false); // case-sensitive
    expect(isAllowedFuFireOperation("baziTrace ")).toBe(false); // no trim
    expect(isAllowedFuFireOperation("")).toBe(false);
  });

  // Kills the L51 `typeof op === "string"` clause: non-strings must be rejected
  // even though `[].includes` would coerce/short-circuit differently. With the
  // typeof clause flipped/removed, some of these would throw or pass.
  it("returns false for non-string inputs (typeof guard)", () => {
    expect(isAllowedFuFireOperation(undefined)).toBe(false);
    expect(isAllowedFuFireOperation(null)).toBe(false);
    expect(isAllowedFuFireOperation(123)).toBe(false);
    expect(isAllowedFuFireOperation(["bazi"])).toBe(false);
    expect(isAllowedFuFireOperation({ op: "bazi" })).toBe(false);
    expect(isAllowedFuFireOperation(true)).toBe(false);
  });
});

// ── 2. collectRequestedOperations — array + singular + dedup, exact output ─────
describe("FX6 collectRequestedOperations — array, singular field, dedup", () => {
  // Kills L64 Array.isArray conditional (must read the array) and the L66 typeof
  // filter inside the loop (non-string entries dropped, not stringified).
  it("collects all string entries from requestedOperations array", () => {
    expect(
      collectRequestedOperations({ requestedOperations: ["bazi", "wuxing"] }),
    ).toEqual(["bazi", "wuxing"]);
  });

  it("drops non-string entries from the array (typeof filter at L66)", () => {
    expect(
      collectRequestedOperations({
        requestedOperations: ["bazi", 123, null, undefined, { x: 1 }, "wuxing"],
      }),
    ).toEqual(["bazi", "wuxing"]);
  });

  // Kills L69: the singular `operation` field must be collected. If the typeof
  // check or the push is mutated, the singular op is lost.
  it("collects the singular `operation` string field", () => {
    expect(collectRequestedOperations({ operation: "chronometry" })).toEqual([
      "chronometry",
    ]);
  });

  it("ignores a non-string singular `operation` field (typeof guard at L69)", () => {
    expect(collectRequestedOperations({ operation: 42 })).toEqual([]);
    expect(collectRequestedOperations({ operation: ["bazi"] })).toEqual([]);
  });

  // Kills the L90/L73 `new Set` dedup MethodExpression: duplicates across the
  // array AND across array+singular must collapse to one each, order preserved.
  it("de-duplicates repeated operations within the array", () => {
    expect(
      collectRequestedOperations({ requestedOperations: ["bazi", "bazi", "wuxing", "bazi"] }),
    ).toEqual(["bazi", "wuxing"]);
  });

  it("de-duplicates across array and singular `operation` field", () => {
    expect(
      collectRequestedOperations({
        requestedOperations: ["bazi", "wuxing"],
        operation: "bazi",
      }),
    ).toEqual(["bazi", "wuxing"]);
  });

  it("appends a distinct singular `operation` after the array entries", () => {
    expect(
      collectRequestedOperations({
        requestedOperations: ["bazi"],
        operation: "chronometry",
      }),
    ).toEqual(["bazi", "chronometry"]);
  });

  // Kills L64 conditional→true mutation: a non-array requestedOperations must be
  // ignored, not iterated.
  it("ignores a non-array requestedOperations field", () => {
    expect(collectRequestedOperations({ requestedOperations: "bazi" })).toEqual([]);
    expect(collectRequestedOperations({ requestedOperations: 5 })).toEqual([]);
  });

  // Kills the L61 `body ?? {}` nullish-coalescing default: nullish / non-object
  // bodies must yield an empty list, never throw.
  it("returns [] for empty / nullish / primitive bodies", () => {
    expect(collectRequestedOperations({})).toEqual([]);
    expect(collectRequestedOperations(null)).toEqual([]);
    expect(collectRequestedOperations(undefined)).toEqual([]);
  });
});

// ── 3. validateRequestedOperations — pass, reject, dedup, single, empty ────────
describe("FX6 validateRequestedOperations — allowlist enforcement", () => {
  it("accepts a body whose every requested op is allowed", () => {
    expect(
      validateRequestedOperations({ requestedOperations: ["bazi", "wuxing"] }),
    ).toEqual({ ok: true, disallowed: [] });
  });

  it("accepts a single allowed `operation` field", () => {
    expect(validateRequestedOperations({ operation: "baziTrace" })).toEqual({
      ok: true,
      disallowed: [],
    });
  });

  it("accepts an empty request (no operations) as valid", () => {
    expect(validateRequestedOperations({})).toEqual({ ok: true, disallowed: [] });
    expect(validateRequestedOperations(null)).toEqual({ ok: true, disallowed: [] });
  });

  // Kills L90 `.filter(op => !isAllowedFuFireOperation(op))` — the negation and
  // the filter itself. A disallowed op must be surfaced and ok must be false.
  it("rejects a body naming a disallowed operation, listing it exactly", () => {
    expect(
      validateRequestedOperations({ requestedOperations: ["bazi", "podDispatch"] }),
    ).toEqual({ ok: false, disallowed: ["podDispatch"] });
  });

  it("rejects a single disallowed `operation` field", () => {
    expect(validateRequestedOperations({ operation: "deleteShop" })).toEqual({
      ok: false,
      disallowed: ["deleteShop"],
    });
  });

  // Kills the L91 `disallowed.length === 0` Equality mutation: multiple
  // disallowed ops are all listed (de-duplicated upstream) and ok is false.
  it("lists every distinct disallowed op (deduped) and sets ok false", () => {
    const result = validateRequestedOperations({
      requestedOperations: ["bazi", "evil", "evil", "alsoEvil"],
    });
    expect(result.ok).toBe(false);
    expect(result.disallowed).toEqual(["evil", "alsoEvil"]);
  });

  it("a single allowed operation field is accepted (explicit literal)", () => {
    const result = validateRequestedOperations({ operation: "chronometry" });
    expect(result.ok).toBe(true);
    expect(result.disallowed).toEqual([]);
  });
});

// ── 4. sanitizeTestRunBody — null / non-object / array guard (L101) ────────────
describe("FX6 sanitizeTestRunBody — input-shape guard (L101)", () => {
  // Kills the L101 `body === null` Equality + Conditional: null → {}.
  it("returns {} for null", () => {
    expect(sanitizeTestRunBody(null)).toEqual({});
  });

  // Kills the `typeof body !== "object"` StringLiteral / Equality clause:
  // primitives → {}.
  it("returns {} for primitive (non-object) bodies", () => {
    expect(sanitizeTestRunBody(undefined)).toEqual({});
    expect(sanitizeTestRunBody("bazi")).toEqual({});
    expect(sanitizeTestRunBody(42)).toEqual({});
    expect(sanitizeTestRunBody(true)).toEqual({});
  });

  // Kills the `|| Array.isArray(body)` Logical clause: an array is typeof
  // "object" and not null, so only the Array.isArray arm rejects it. Without it,
  // an array would be spread into a string-keyed object.
  it("returns {} for an array body (Array.isArray arm)", () => {
    expect(sanitizeTestRunBody(["bazi", "wuxing"])).toEqual({});
    expect(sanitizeTestRunBody([])).toEqual({});
  });

  // The complementary TRUE branch: a real object must NOT be coerced to {}.
  it("a plain object is processed, not short-circuited to {}", () => {
    expect(sanitizeTestRunBody({ keepMe: "yes" })).toEqual({ keepMe: "yes" });
  });
});

// ── 5. sanitizeTestRunBody — steering fields STRIPPED, birth fields KEPT ───────
describe("FX6 sanitizeTestRunBody — strips steering fields, keeps payload", () => {
  const STEERING = {
    fuFireConfig: { baseUrl: "https://evil.example" },
    fufirePath: "/v1/exfiltrate",
    baseUrl: "https://attacker.test",
    apiKeySecretRef: "SECRET_REF_STOLEN",
    authHeaderName: "X-Steal-Auth",
  };

  it("strips every forbidden steering field at the top level (exact key set)", () => {
    const cleaned = sanitizeTestRunBody({
      operation: "bazi",
      ...STEERING,
    });
    // Exact retained key set: only the benign operation survives.
    expect(Object.keys(cleaned).sort()).toEqual(["operation"]);
    expect("fuFireConfig" in cleaned).toBe(false);
    expect("fufirePath" in cleaned).toBe(false);
    expect("baseUrl" in cleaned).toBe(false);
    expect("apiKeySecretRef" in cleaned).toBe(false);
    expect("authHeaderName" in cleaned).toBe(false);
    expect(cleaned.operation).toBe("bazi");
  });

  it("keeps the exact set of allowed birth fields", () => {
    const cleaned = sanitizeTestRunBody({
      operation: "wuxing",
      requestedOperations: ["wuxing"],
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      manualLat: 52.52,
      manualLon: 13.405,
      timezone: "Europe/Berlin",
      ...STEERING,
    });
    expect(Object.keys(cleaned).sort()).toEqual([
      "birthDate",
      "birthTime",
      "birthTimeKnown",
      "manualLat",
      "manualLon",
      "operation",
      "requestedOperations",
      "timezone",
    ]);
    expect(cleaned.birthDate).toBe("1990-06-15");
    expect(cleaned.manualLat).toBe(52.52);
    expect(cleaned.timezone).toBe("Europe/Berlin");
  });

  // Kills the L105 nested-input conditional: steering fields inside `input` must
  // also be stripped, while benign input fields survive — exact key set.
  it("strips steering fields nested inside `input` (L105) and keeps birth data", () => {
    const cleaned = sanitizeTestRunBody({
      operation: "bazi",
      input: {
        birthDate: "1991-01-02",
        birthTime: "09:05",
        ...STEERING,
      },
    });
    const input = cleaned.input as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(["birthDate", "birthTime"]);
    expect("baseUrl" in input).toBe(false);
    expect("apiKeySecretRef" in input).toBe(false);
    expect(input.birthDate).toBe("1991-01-02");
    expect(input.birthTime).toBe("09:05");
  });

  // Kills the L105 `!Array.isArray(cleaned.input)` clause: an array `input` is
  // left as-is (not run through the object stripper) — must round-trip unchanged
  // and NOT be turned into a string-keyed object.
  it("leaves an array `input` untouched (not sanitized as an object)", () => {
    const cleaned = sanitizeTestRunBody({ input: ["bazi", "wuxing"] });
    expect(Array.isArray(cleaned.input)).toBe(true);
    expect(cleaned.input).toEqual(["bazi", "wuxing"]);
  });

  // Kills the L105 `cleaned.input && typeof === "object"` clause: a primitive
  // `input` is left as-is, never stripped/replaced.
  it("leaves a primitive `input` untouched", () => {
    expect(sanitizeTestRunBody({ input: "raw" }).input).toBe("raw");
    expect(sanitizeTestRunBody({ input: 7 }).input).toBe(7);
  });

  it("returns a payload that NEVER echoes a steering value (no SSRF leak)", () => {
    const cleaned = sanitizeTestRunBody({
      operation: "bazi",
      input: { birthDate: "1990-06-15", ...STEERING },
      ...STEERING,
    });
    const serialized = JSON.stringify(cleaned);
    expect(serialized).not.toContain("attacker.test");
    expect(serialized).not.toContain("SECRET_REF_STOLEN");
    expect(serialized).not.toContain("X-Steal-Auth");
    expect(serialized).not.toContain("/v1/exfiltrate");
    expect(serialized).not.toContain("evil.example");
  });

  // Kills the L105 conditional being widened to ANY object: only the key literally
  // named `input` is recursively stripped. A sibling object field whose name is
  // not "input" must be retained verbatim (steering inside a non-`input` object is
  // out of scope for the nested pass and must round-trip unchanged), proving the
  // recursion is gated on the exact `input` key, not "is this value an object".
  it("only recurses into the `input` key, leaving sibling objects untouched", () => {
    const cleaned = sanitizeTestRunBody({
      operation: "bazi",
      input: { birthDate: "1990-06-15", baseUrl: "https://attacker.test" },
      metadata: { note: "kept", baseUrl: "https://sibling.example" },
    });
    // `input` is recursively stripped: its baseUrl is gone.
    expect(cleaned.input).toEqual({ birthDate: "1990-06-15" });
    // `metadata` is NOT the `input` key, so it is retained verbatim (object copied
    // by reference, no recursion) — its baseUrl survives unchanged.
    expect(cleaned.metadata).toEqual({
      note: "kept",
      baseUrl: "https://sibling.example",
    });
    expect(Object.keys(cleaned).sort()).toEqual(["input", "metadata", "operation"]);
  });

  // Kills the L114 strip-loop ConditionalExpression `false` mutation specifically
  // at the TOP level: when a steering field is the ONLY field, the result must be
  // exactly {} (field dropped), not { baseUrl: ... }. Pairs with the keep tests
  // that pin the complementary `true`-mutation kill.
  it("drops a lone top-level steering field to exactly {}", () => {
    expect(sanitizeTestRunBody({ baseUrl: "https://attacker.test" })).toEqual({});
    expect(sanitizeTestRunBody({ apiKeySecretRef: "SECRET_REF_STOLEN" })).toEqual({});
  });
});

// ── 6. validateRequestedOperations — ok flag tracks disallowed independently ───
describe("FX6 validateRequestedOperations — ok flag vs disallowed list", () => {
  // Kills the L90 negation flip (`!isAllowedFuFireOperation` → `isAllowedFuFireOperation`):
  // with a mix of allowed + disallowed ops, the disallowed list must contain ONLY
  // the disallowed name — never the allowed ones. A flipped negation would list
  // the allowed ops and drop the real offender, so the exact-equality bites.
  it("lists only the disallowed op from a mixed allowed/disallowed body", () => {
    const result = validateRequestedOperations({
      requestedOperations: ["chronometry", "bazi", "podDispatch", "wuxing"],
    });
    expect(result.ok).toBe(false);
    expect(result.disallowed).toEqual(["podDispatch"]);
  });

  // Kills the L91 `disallowed.length === 0` → `> 0` / `!== 0` EqualityOperator
  // mutations independently of the disallowed contents: an all-allowed body must
  // set ok TRUE with an empty list; this directly contradicts a `!== 0` mutant
  // (which would force ok false here).
  it("sets ok true with empty disallowed when every op is allowed", () => {
    const result = validateRequestedOperations({
      requestedOperations: ["chronometry", "bazi", "baziTrace", "wuxing"],
    });
    expect(result.ok).toBe(true);
    expect(result.disallowed).toEqual([]);
  });
});
