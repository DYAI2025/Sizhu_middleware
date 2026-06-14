import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FuFireDataService } from "../services/fufireDataService";
import { PROMPT_VARIABLE_SOURCE_MISSING } from "../services/fufireResponseInterpreter";

/**
 * FX3 — interpretFufireResponse is WIRED-IN-PROD on the live executeTestRun path
 * (REQ-F-002 / AC-F-002e, AC-F-003c).
 *
 * Lens-4 of the live-smoke adversarial verification (2026-06-14) refuted a naive
 * "F-002 production-verified" with: interpretFufireResponse (the day-pillar
 * `anchor_verification` caveat-surfacing half) had ZERO production callers —
 * executeTestRun called only resolvePromptVariables, so the provider's
 * "unverified" caveat was present in live data but NEVER surfaced on the path.
 *
 * Kritische semantische Glättung:
 *   These:      "executeTestRun returns the responses."
 *   Gegenthese: it returns the raw bazi response (which CONTAINS anchor_verification)
 *               but never runs interpretFufireResponse, so the honest caveat is
 *               silently dropped from the result the console/pipeline consumes —
 *               and AC-F-002e ("caveat surfaced, never laundered") is unmet despite
 *               green raw-response tests.
 *   Schärfung:  drive executeTestRun (HTTP mocked to the REAL bazi sample) and
 *               assert result.responseInterpretation carries the day-pillar caveat
 *               VERBATIM. Can only pass if interpretFufireResponse is actually
 *               invoked on the execute path — i.e. wired-in-prod.
 *
 * MUTATION NOTE: reverting the FX3 wiring (removing the responseInterpretation map
 * + return) turns assertion (1) RED — responseInterpretation is absent and the
 * "day-pillar anchor_verification: unverified" caveat is nowhere in the result.
 *
 * Evidence class: integration-fake at the HTTP boundary (global.fetch mocked with
 * the REAL captured bazi sample); exercises the REAL executeTestRun path.
 */

const baziSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/bazi.response.json"), "utf8"),
);
const wuxingSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/wuxing.response.json"), "utf8"),
);

const REAL_LAT = 52.52;
const REAL_LON = 13.405;
const BAZI_PATH = "/v1/calculate/bazi";
const WUXING_PATH = "/v1/calculate/wuxing";

const BERLIN_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: REAL_LAT,
  manualLon: REAL_LON,
  manualTimezone: "Europe/Berlin",
  requestedOperations: ["bazi", "wuxing"] as string[],
};

const SECRET_REF = "SECRET_REF_FUFIRE_API_KEY";
const SENTINEL_KEY = "sentinel-fufire-key-DO-NOT-LEAK";
const ENV_KEYS = [SECRET_REF, "FUFIRE_API_KEY_SECRET_REF", "FUFIRE_API_KEY"];
const saved: Record<string, string | undefined> = {};

function mockFufireFetch(overrides?: { bazi?: unknown; wuxing?: unknown }) {
  const baziBody = overrides && "bazi" in overrides ? overrides.bazi : baziSample;
  const wuxingBody = overrides && "wuxing" in overrides ? overrides.wuxing : wuxingSample;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const href = typeof url === "string" ? url : String(url);
    let body: unknown = {};
    if (href.includes(BAZI_PATH)) body = baziBody;
    else if (href.includes(WUXING_PATH)) body = wuxingBody;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env[SECRET_REF] = SENTINEL_KEY;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("FX3 — day-pillar caveat surfaced on the live executeTestRun path (wired-in-prod)", () => {
  it("surfaces the provider day-pillar anchor_verification caveat VERBATIM (bazi)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun(BERLIN_INPUT);

    expect(result.responseInterpretation).toBeDefined();
    const bazi = (result.responseInterpretation as any[]).find((r) => r.operation === "bazi");
    expect(bazi).toBeTruthy();
    // The captured bazi sample's anchor_verification is "unverified" — it must be
    // carried through exactly, never relabeled as verified.
    expect(bazi.caveats.some((c: string) => /anchor_verification:/.test(c))).toBe(true);
    expect(bazi.caveats.join(" ")).toContain(baziSample.derivation_trace.day.day_anchor_evidence.anchor_verification);
    // The chart CALCULATION may be verifiable, but the note keeps interpretation honest.
    expect(bazi.note).toMatch(/calculation/i);
  });

  it("is ADDITIVE — raw responses + mapped promptVariables both still present", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun(BERLIN_INPUT);

    // FX3 did not replace the existing surfaces.
    const byOp = new Map<string, any>(result.responses.map((r: any) => [r.operation, r]));
    expect(byOp.get("bazi")?.data?.pillars?.year?.element).toBe("Metall");
    expect(result.promptVariables?.element).toBe("Metall");
    expect(result.promptVariables?.birth_year).toBe(1990);
  });

  it("deferred op (chronometry) interpretation is render-blocked, not verified", async () => {
    mockFufireFetch({ bazi: baziSample });
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      ...BERLIN_INPUT,
      requestedOperations: ["bazi", "chronometry"],
    });

    // chronometry supplies a timezone (BERLIN_INPUT) so it reaches the fetch loop
    // and the mock returns a body → it MUST appear in responseInterpretation, and
    // MUST render-block (deferred op, no real sample). Unconditional (review M1).
    const chrono = (result.responseInterpretation as any[]).find((r) => r.operation === "chronometry");
    expect(chrono).toBeTruthy();
    expect(chrono.verified).toBe(false);
    expect(chrono.issues.some((i: string) => i.includes(PROMPT_VARIABLE_SOURCE_MISSING))).toBe(true);
    // bazi remains verified-calculation with its caveat.
    const bazi = (result.responseInterpretation as any[]).find((r) => r.operation === "bazi");
    expect(bazi?.verified).toBe(true);
  });

  it("the sentinel API key never leaks into the interpretation surface", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun(BERLIN_INPUT);
    expect(JSON.stringify(result.responseInterpretation ?? [])).not.toContain(SENTINEL_KEY);
  });
});
