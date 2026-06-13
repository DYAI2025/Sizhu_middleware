import { describe, it, expect } from "vitest";

/**
 * REQ-F-001 — Build FuFire request bodies from normalized birth input (server-side),
 * against docs/contracts/fufire-api-reference.md. (AC-F-001a..g)
 *
 * Kritische semantische Glättung — REQ-F-001 (PURE transforms: normalized input → request body):
 *   These:      "A request body is produced for each operation."
 *   The builders are pure functions (input object → request body object). The honest
 *   risk is NOT a runtime/boundary failure mode — it is producing a body that does not
 *   match the authoritative contract (the historical miss: src/tests/fufire.test.ts
 *   asserted hardcoded literals against locally-defined objects, never invoking a
 *   builder — green and useless).
 *   Schärfung (logic-level): assert the body FROM THE BUILDER OUTPUT (AC-F-001f), pinning
 *   the contract's exact shape boundaries: chronometry NESTED (birth.*), bazi/bazi_trace/
 *   wuxing FLAT, single ISO `date`, wuxing lat/lon REQUIRED, default-noon 12:00:00,
 *   no {year,month,day,hour}, no {elements:[]}.
 *   (No invented boundary/overflow/NaN tests — these are pure transforms with no I/O.)
 *
 * Evidence class: integration-fake / pure-logic (asserted from real builder output).
 *
 * STATUS: RED CONTRACT — `server/services/fufireRequestBuilders.ts` does not exist yet.
 * The import drives the coder to create it (T3). The intended public surface (named
 * builder functions + a NormalizedBirthInput shape) is derived from PRD §3.1 + §3.4.
 */

// Intended module + surface the coder must create (T3). Importing a not-yet-existing
// module makes this file fail at load time — the explicit red contract.
import {
  buildChronometryRequest,
  buildBaziRequest,
  buildBaziTraceRequest,
  buildWuxingRequest,
  normalizeBirthInput,
  type NormalizedBirthInput,
} from "../services/fufireRequestBuilders";

// A representative normalized birth input (the Berlin-born subject from the real samples).
const BERLIN: NormalizedBirthInput = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  lat: 52.52,
  lon: 13.405,
  timezone: "Europe/Berlin",
};

describe("AC-F-001a — chronometry builder (NESTED birth.*)", () => {
  it("produces { birth: { calendar_policy, datetime: <ISO>, location: {lat, lon}, timezone } } with no flat date/time", () => {
    const body = buildChronometryRequest(BERLIN);
    expect(body).toHaveProperty("birth");
    expect(body.birth).toHaveProperty("calendar_policy");
    expect(typeof body.birth.datetime).toBe("string");
    expect(body.birth.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(body.birth.location).toEqual({ lat: 52.52, lon: 13.405 });
    expect(body.birth.timezone).toBe("Europe/Berlin");
    // The contract: chronometry is the ONLY nested shape — no flat date/time.
    expect((body as Record<string, unknown>).date).toBeUndefined();
    expect((body as Record<string, unknown>).time).toBeUndefined();
  });
});

describe("AC-F-001b — bazi / bazi_trace builders (FLAT, single ISO date)", () => {
  it("bazi: flat ISO `date`, no {year,month,day,hour}", () => {
    const body = buildBaziRequest(BERLIN);
    expect(typeof body.date).toBe("string");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const keys = Object.keys(body);
    for (const forbidden of ["year", "month", "day", "hour"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("bazi_trace: same flat shape, include_trace === true", () => {
    const body = buildBaziTraceRequest(BERLIN);
    expect(typeof body.date).toBe("string");
    expect(body.include_trace).toBe(true);
  });

  it("optional flat fields, when present, use only the contract's allowed enums", () => {
    const body = buildBaziRequest({
      ...BERLIN,
      standard: "CIVIL",
      boundary: "midnight",
      ambiguousTime: "earlier",
      nonexistentTime: "error",
    } as NormalizedBirthInput);
    if (body.standard !== undefined) expect(["CIVIL", "LMT", "TLST"]).toContain(body.standard);
    if (body.boundary !== undefined) expect(["midnight", "zi"]).toContain(body.boundary);
    if (body.ambiguousTime !== undefined) expect(["earlier", "later"]).toContain(body.ambiguousTime);
    if (body.nonexistentTime !== undefined) expect(["error", "shift_forward"]).toContain(body.nonexistentTime);
  });
});

describe("AC-F-001c — wuxing builder (FLAT, lat/lon REQUIRED)", () => {
  it("flat ISO `date` plus required lat & lon; no {elements:[]}", () => {
    const body = buildWuxingRequest(BERLIN);
    expect(typeof body.date).toBe("string");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(typeof body.lat).toBe("number");
    expect(typeof body.lon).toBe("number");
    expect(body.lat).toBe(52.52);
    expect(body.lon).toBe(13.405);
    expect((body as Record<string, unknown>).elements).toBeUndefined();
  });
});

describe("AC-F-001d — default-noon rule", () => {
  it("birth time unknown → ISO time component 12:00:00, birth_time_known:false, source default_noon", () => {
    const normalized = normalizeBirthInput({
      birthDate: "1990-06-15",
      birthTimeKnown: false,
      lat: 52.52,
      lon: 13.405,
      timezone: "Europe/Berlin",
    });
    // The normalized ISO datetime must land on noon when time is unknown.
    const body = buildBaziRequest(normalized);
    expect(body.date).toContain("12:00:00");
    expect(body.birth_time_known).toBe(false);
    // The normalizer records the default-noon source + warning (AC-F-001d).
    expect(normalized.birthTimeSource ?? normalized.birth_time_source).toBe("default_noon");
  });
});

describe("AC-F-001f — bodies asserted FROM builder output, not re-hardcoded literals", () => {
  it("changing the input changes the produced ISO date (proves output is computed, not constant)", () => {
    const a = buildBaziRequest(BERLIN);
    const b = buildBaziRequest({ ...BERLIN, birthDate: "1985-12-01", birthTime: "08:15" });
    expect(a.date).not.toBe(b.date);
    expect(b.date).toContain("1985-12-01");
    expect(b.date).toContain("08:15");
  });
});

describe("AC-F-001g — no secret in any builder output / sanitized request metadata", () => {
  it("no FUFIRE_API_KEY / X-API-Key value leaks into the request body", () => {
    process.env.FUFIRE_API_KEY = "super-secret-fufire-key-DO-NOT-LEAK";
    const bodies = [
      buildChronometryRequest(BERLIN),
      buildBaziRequest(BERLIN),
      buildBaziTraceRequest(BERLIN),
      buildWuxingRequest(BERLIN),
    ];
    for (const body of bodies) {
      expect(JSON.stringify(body)).not.toContain("super-secret-fufire-key-DO-NOT-LEAK");
    }
  });
});
