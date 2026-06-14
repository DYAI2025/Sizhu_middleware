import { describe, it, expect } from "vitest";
import {
  buildChronometryRequest,
  buildBaziRequest,
  buildBaziTraceRequest,
  buildWuxingRequest,
  toIsoDatetime,
  FuFireRequestBuilderError,
  type NormalizedBirthInput,
} from "../services/fufireRequestBuilders";

/**
 * REQ-F-001 — mutation-hardening suite (Stryker survivor backlog).
 *
 * Origin: the 2026-06-14 Stryker spike scored fufireRequestBuilders.ts at 38.95%
 * (50 survived / 8 no-cov). The existing contract test
 * (`fufire.requestBuilders.test.ts`) pins SHAPE (nested vs flat, single ISO date)
 * but leaves behaviour unpinned in three ways the mutants exploited:
 *
 *   1. THROW paths never exercised — requireCoord / requireString (the
 *      defense-in-depth floor for missing lat/lon/timezone) had zero coverage, so
 *      every mutation inside them survived.
 *   2. Tautological optional-field assertions — the contract test guards each
 *      pass-through with `if (body.x !== undefined) expect(...)`, so a mutant that
 *      DROPS the field (conditional → false) skips the assertion and stays green.
 *   3. Exact values unpinned — toIsoDatetime's padStart / default-noon fallback
 *      and the calendar_policy `??` default were asserted only by regex shape.
 *
 * Schärfung: assert EXACT produced values, assert key PRESENCE/ABSENCE explicitly
 * (so dropping or always-including a field both fail), and drive every throw
 * branch. The objective oracle for this file is the Stryker mutation score, not
 * a human reading — these assertions are written to KILL specific surviving
 * mutants, and the score must rise when this file is present.
 */

const BERLIN: NormalizedBirthInput = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  lat: 52.52,
  lon: 13.405,
  timezone: "Europe/Berlin",
};

// ── 1. THROW paths: requireCoord / requireString (defense-in-depth floor) ──────
describe("REQ-F-001 throw paths — required fields validated, no silent undefined", () => {
  it("chronometry: missing lat throws FuFireRequestBuilderError naming the field", () => {
    const bad = { ...BERLIN, lat: undefined } as NormalizedBirthInput;
    expect(() => buildChronometryRequest(bad)).toThrow(FuFireRequestBuilderError);
    expect(() => buildChronometryRequest(bad)).toThrow(/"lat"/);
  });

  it("chronometry: missing lon throws naming the field", () => {
    const bad = { ...BERLIN, lon: undefined } as NormalizedBirthInput;
    expect(() => buildChronometryRequest(bad)).toThrow(/"lon"/);
  });

  it("chronometry: missing timezone throws naming the field", () => {
    const bad = { ...BERLIN, timezone: undefined } as NormalizedBirthInput;
    expect(() => buildChronometryRequest(bad)).toThrow(/"timezone"/);
  });

  // Kills the requireCoord `||`→`&&` LogicalOperator mutant: NaN is typeof
  // "number" (so the `!==` clause is false) but is NOT finite — only the OR form
  // throws. With `&&`, a NaN coordinate would slip through.
  it("chronometry: NaN lat is rejected (finite-number guard, not just typeof)", () => {
    const bad = { ...BERLIN, lat: NaN } as NormalizedBirthInput;
    expect(() => buildChronometryRequest(bad)).toThrow(FuFireRequestBuilderError);
  });

  // Kills the requireString `||`→`&&` + `.trim()` + `=== ""` mutants: a
  // whitespace-only string is typeof "string" (so the `!==` clause is false);
  // only trimming + the OR form rejects it.
  it("chronometry: whitespace-only timezone is rejected (trimmed-empty guard)", () => {
    const bad = { ...BERLIN, timezone: "   " } as NormalizedBirthInput;
    expect(() => buildChronometryRequest(bad)).toThrow(FuFireRequestBuilderError);
  });

  it("wuxing: missing lat / lon each throw naming the field (lat & lon REQUIRED)", () => {
    expect(() => buildWuxingRequest({ ...BERLIN, lat: undefined } as NormalizedBirthInput)).toThrow(/"lat"/);
    expect(() => buildWuxingRequest({ ...BERLIN, lon: undefined } as NormalizedBirthInput)).toThrow(/"lon"/);
  });

  it("the error carries the correct name (FuFireRequestBuilderError)", () => {
    try {
      buildWuxingRequest({ ...BERLIN, lat: undefined } as NormalizedBirthInput);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).name).toBe("FuFireRequestBuilderError");
    }
  });
});

// ── 2. toIsoDatetime: exact value, default-noon fallback, padStart ─────────────
describe("REQ-F-001 toIsoDatetime — exact ISO value, not just shape", () => {
  it("full HH:MM time is preserved verbatim with :00 seconds", () => {
    expect(toIsoDatetime(BERLIN)).toBe("1990-06-15T14:30:00");
  });

  it("full HH:MM:SS time is preserved verbatim", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "01:02:03" })).toBe("1990-06-15T01:02:03");
  });

  // Kills hh/mm padStart("0") + the `?? "00"` shape: single-digit components pad.
  it("single-digit H:M pads to zero-filled HH:MM:SS", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "9:5" })).toBe("1990-06-15T09:05:00");
  });

  it("hour-only time fills minutes/seconds with 00", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "14" })).toBe("1990-06-15T14:00:00");
  });

  // Kills the time-presence conditional + `&&`→`||`: undefined/empty/whitespace
  // ALL fall back to the contract default-noon, while a `||` mutant would treat
  // empty/whitespace as a real time and emit T00:00:00.
  it("undefined time falls back to default noon 12:00:00", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: undefined })).toBe("1990-06-15T12:00:00");
  });

  it("empty-string time falls back to default noon 12:00:00", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "" })).toBe("1990-06-15T12:00:00");
  });

  it("whitespace-only time falls back to default noon 12:00:00", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "   " })).toBe("1990-06-15T12:00:00");
  });

  // Kills the L107 `.trim()` MethodExpression: a present-but-untrimmed time must
  // still produce a clean component.
  it("trailing-whitespace time is trimmed, not passed through raw", () => {
    expect(toIsoDatetime({ ...BERLIN, birthTime: "14:30 " })).toBe("1990-06-15T14:30:00");
  });
});

// ── 3. chronometry calendar_policy `??` default (both sides pinned) ────────────
describe("REQ-F-001 chronometry calendar_policy — explicit value vs default", () => {
  it("uses the provided calendarPolicy when present (kills `??`→`&&`)", () => {
    const body = buildChronometryRequest({ ...BERLIN, calendarPolicy: "julian" });
    expect(body.birth.calendar_policy).toBe("julian");
  });

  it("falls back to 'gregorian' when calendarPolicy is absent", () => {
    const body = buildChronometryRequest(BERLIN);
    expect(body.birth.calendar_policy).toBe("gregorian");
  });

  it("nests the exact location + timezone (no flat keys)", () => {
    const body = buildChronometryRequest(BERLIN);
    expect(body.birth.location).toEqual({ lat: 52.52, lon: 13.405 });
    expect(body.birth.timezone).toBe("Europe/Berlin");
    expect(body.birth.datetime).toBe("1990-06-15T14:30:00");
  });
});

// ── 4. bazi optional pass-through fields: presence AND absence both pinned ─────
const BAZI_OPTIONALS: Array<{ field: keyof NormalizedBirthInput; key: string; value: unknown }> = [
  { field: "timezone", key: "tz", value: "Europe/Berlin" },
  { field: "lon", key: "lon", value: 13.405 },
  { field: "lat", key: "lat", value: 52.52 },
  { field: "standard", key: "standard", value: "CIVIL" },
  { field: "boundary", key: "boundary", value: "midnight" },
  { field: "ambiguousTime", key: "ambiguousTime", value: "earlier" },
  { field: "nonexistentTime", key: "nonexistentTime", value: "error" },
];

describe("REQ-F-001 bazi optional fields — included iff provided (no tautology)", () => {
  const minimal: NormalizedBirthInput = { birthDate: "1990-06-15", birthTimeKnown: false };

  it("absent: NONE of the optional keys appear in the body (kills conditional→true)", () => {
    const body = buildBaziRequest(minimal);
    for (const { key } of BAZI_OPTIONALS) {
      expect(key in body, `expected "${key}" absent when not provided`).toBe(false);
    }
    // Required fields still present.
    expect(body.date).toBe("1990-06-15T12:00:00");
    expect(body.birth_time_known).toBe(false);
  });

  for (const { field, key, value } of BAZI_OPTIONALS) {
    it(`present: "${field}" → body.${key} === ${JSON.stringify(value)} (kills conditional→false / === flip)`, () => {
      const body = buildBaziRequest({ ...minimal, [field]: value } as NormalizedBirthInput) as Record<string, unknown>;
      expect(key in body).toBe(true);
      expect(body[key]).toBe(value);
    });
  }

  it("birth_time_known passes through exactly (true)", () => {
    expect(buildBaziRequest(BERLIN).birth_time_known).toBe(true);
  });
});

describe("REQ-F-001 bazi_trace — bazi body plus include_trace:true", () => {
  it("include_trace is exactly true and date matches the bazi date", () => {
    const trace = buildBaziTraceRequest(BERLIN);
    expect(trace.include_trace).toBe(true);
    // Independent literal anchor (not SUT-vs-SUT): trace must carry the bazi date.
    expect(trace.date).toBe("1990-06-15T14:30:00");
  });
});

// ── 5. wuxing optional pass-through fields: presence AND absence both pinned ───
const WUXING_OPTIONALS: Array<{ field: keyof NormalizedBirthInput; key: string; value: unknown }> = [
  { field: "timezone", key: "tz", value: "Europe/Berlin" },
  { field: "ambiguousTime", key: "ambiguousTime", value: "later" },
  { field: "nonexistentTime", key: "nonexistentTime", value: "shift_forward" },
];

describe("REQ-F-001 wuxing optional fields — included iff provided", () => {
  // Required lat/lon present; optionals stripped.
  const base: NormalizedBirthInput = {
    birthDate: "1990-06-15",
    birthTimeKnown: true,
    birthTime: "14:30",
    lat: 52.52,
    lon: 13.405,
  };

  it("absent: tz / ambiguousTime / nonexistentTime do not appear", () => {
    const body = buildWuxingRequest(base);
    for (const { key } of WUXING_OPTIONALS) {
      expect(key in body, `expected "${key}" absent when not provided`).toBe(false);
    }
    expect(body.lat).toBe(52.52);
    expect(body.lon).toBe(13.405);
    expect(body.date).toBe("1990-06-15T14:30:00");
  });

  for (const { field, key, value } of WUXING_OPTIONALS) {
    it(`present: "${field}" → body.${key} === ${JSON.stringify(value)}`, () => {
      const body = buildWuxingRequest({ ...base, [field]: value } as NormalizedBirthInput) as Record<string, unknown>;
      expect(key in body).toBe(true);
      expect(body[key]).toBe(value);
    });
  }
});
