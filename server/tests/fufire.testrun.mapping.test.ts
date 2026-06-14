import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FuFireDataService } from "../services/fufireDataService";
import { PROMPT_VARIABLE_SOURCE_MISSING } from "../services/fufireResponseInterpreter";

/**
 * T9 — WIRED-IN-PROD contract: the FuFire response interpreter is INVOKED on the
 * live `FuFireDataService.executeTestRun` path (REQ-F-002 / REQ-F-003).
 *
 * Phase-3 Gate C/D found the trust-boundary primitive
 * (`server/services/fufireResponseInterpreter.ts` —
 * interpretFufireResponse / resolvePromptVariables / renderPromptTemplate) has
 * ZERO production importers. `executeTestRun` fetches each requested op and
 * pushes the RAW `{ operation, data }` response, never mapping it into the
 * "no invented data" prompt variables. This file is the failing contract that
 * proves the wiring.
 *
 * The companion pure-unit contract `fufire.responseInterpreter.test.ts` proves
 * the interpreter is CORRECT in isolation (and must NOT be edited). It cannot
 * prove the interpreter is REACHED on the real execute path — a green unit test
 * coexists happily with a dead, never-imported module. THIS file closes exactly
 * that gap, end-to-end through `executeTestRun`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Kritische semantische Glättung — BOUNDARY feature (executeTestRun does real
 * HTTP I/O across the FuFire boundary; the interpreter must be wired across two
 * components into the running execute path).
 *
 *   These (self-evident):  "executeTestRun fetches bazi + wuxing and returns the
 *                           responses." The raw responses are present, so a naive
 *                           `responses.length === 2` test stays GREEN.
 *
 *   Gegenthese (green-but-useless): executeTestRun returns the RAW FuFire
 *                           response but NEVER calls the interpreter — so no
 *                           prompt variables are ever mapped, `animal`/`element`/
 *                           `birth_year`/`dominant_element` are absent, and the
 *                           downstream prompt is built from un-mapped data (or,
 *                           worse, the UI guesses). The customer value
 *                           (personalized, source-traced, no-invented-data
 *                           variables) is ZERO, yet "responses present" is green.
 *                           This is the EXACT Gate C/D finding: built (interpreter
 *                           exists, unit-green) but never wired into the running
 *                           system.
 *
 *   Schärfung (the test that kills the Gegenthese): drive `executeTestRun`
 *                           through the assembled path with the FuFire HTTP
 *                           boundary mocked to the REAL captured samples, and
 *                           assert the result carries MAPPED prompt variables with
 *                           values from those samples (element "Metall",
 *                           birth_year 1990, animal "Horse"). This can ONLY pass
 *                           if the interpreter is actually invoked on the
 *                           executeTestRun path — i.e. wired-in-prod.
 *
 * Customer-Value check (Product Vision / VCHK-SFB-001): the user achieves the
 * intended outcome — real, source-traced personalization variables produced from
 * a real provider response, with the "no invented data" + 0,0-location guard
 * surviving the wiring (no value invented for the wrong subject/location).
 *
 * Evidence class: integration-fake at the HTTP boundary (global.fetch mocked with
 * the REAL captured samples), but it exercises the REAL executeTestRun
 * composition path — NOT a hand-built interpreter harness. No live network call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESULT SURFACE this contract encodes (the coder must satisfy it on
 * `FuFireTestRunResult`; mapping is ADDITIVE — the raw `responses` array stays):
 *
 *   result.promptVariables: {
 *     animal?: string;            // de: pillars.year.tier | en: chinese.year.animal
 *     element?: string;           // pillars.year.element        ("Metall")
 *     birth_year?: number;        // transition.solar_year       (1990)
 *     dominant_element?: string;  // wuxing.dominant_element, 0,0-GUARDED
 *   }
 *   result.promptVariableIssues: string[];   // each absent/blocked source pushes
 *                                            // one entry carrying the literal
 *                                            // PROMPT_VARIABLE_SOURCE_MISSING token
 *
 *   (Synonyms are acceptable as long as the canonical names above resolve. The
 *    coder owns wiring resolvePromptVariables({bazi, wuxing, locale, subject})
 *    into executeTestRun, passing the REAL subject coords as `subject`.)
 *
 * MUTATION NOTE: reverting the coder's wiring so executeTestRun pushes raw
 * `{ operation, data }` with NO mapping (the current Gate-C/D state) must turn
 * assertion (1) RED — `result.promptVariables` would be absent/empty and the
 * expected real-sample values (element "Metall", birth_year 1990) would be missing.
 */

// REAL captured responses, used as the mocked-fetch fixtures (integration-fake).
const baziSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/bazi.response.json"), "utf8"),
);
const wuxingSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/wuxing.response.json"), "utf8"),
);

// The REAL subject's birth coordinates (Berlin). The wuxing sample was computed
// at 0,0 (a SHAPE fixture) — so dominant_element must NOT bind to this subject.
const REAL_LAT = 52.52;
const REAL_LON = 13.405;

// FuFire endpoint paths (from dataRequestConfig) — used to route the fetch mock.
const BAZI_PATH = "/v1/calculate/bazi";
const WUXING_PATH = "/v1/calculate/wuxing";

const FULL_BERLIN_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: REAL_LAT,
  manualLon: REAL_LON,
  manualTimezone: "Europe/Berlin",
  requestedOperations: ["bazi", "wuxing"] as string[],
};

// Env that lets executeTestRun reach the fetch loop. The key is read at REQUEST
// time from `process.env[secretRef]` (secretRef defaults to
// SECRET_REF_FUFIRE_API_KEY), so setting it in beforeEach is sufficient. baseUrl
// + enabled come from the import-time default config (https://api.fufire.space,
// enabled: true), which is present without further setup.
const SECRET_REF = "SECRET_REF_FUFIRE_API_KEY";
const SENTINEL_KEY = "sentinel-fufire-key-DO-NOT-LEAK";
const ENV_KEYS = [SECRET_REF, "FUFIRE_API_KEY_SECRET_REF", "FUFIRE_API_KEY"];
const saved: Record<string, string | undefined> = {};

/**
 * A `global.fetch` stub that returns the captured sample matching the requested
 * FuFire path. `overrides` lets a single test swap the bazi/wuxing body (e.g.
 * to drop `transition.solar_year`) without touching the others.
 */
function mockFufireFetch(overrides?: { bazi?: unknown; wuxing?: unknown }) {
  const baziBody = overrides && "bazi" in overrides ? overrides.bazi : baziSample;
  const wuxingBody = overrides && "wuxing" in overrides ? overrides.wuxing : wuxingSample;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const href = typeof url === "string" ? url : String(url);
    let body: unknown;
    if (href.includes(BAZI_PATH)) body = baziBody;
    else if (href.includes(WUXING_PATH)) body = wuxingBody;
    else body = {};
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Resolve the configured secretRef to a sentinel so executeTestRun proceeds
  // past the NO_FUFIRE_API_KEY_CONFIGURED gate into the fetch loop.
  process.env[SECRET_REF] = SENTINEL_KEY;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("T9 (1) — interpreter is INVOKED on the live executeTestRun path (wired-in-prod)", () => {
  it("maps prompt variables from the REAL bazi + wuxing samples on the execute path (en locale)", async () => {
    const fetchSpy = mockFufireFetch();
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    // The execute path did run the real fetch loop for both ops.
    expect(fetchSpy).toHaveBeenCalled();
    expect(result.readinessStatus).toBe("READY");

    // The mapped surface MUST exist — its absence is precisely the Gate-C/D
    // "interpreter never imported / never called" state this contract kills.
    expect(result.promptVariables).toBeDefined();

    // Values come from the REAL captured bazi sample. These can only be present
    // if the interpreter actually ran on the executeTestRun path.
    expect(result.promptVariables.element).toBe("Metall"); // ← pillars.year.element
    expect(result.promptVariables.birth_year).toBe(1990); // ← transition.solar_year
    // en locale animal ← chinese.year.animal ("Horse").
    expect(result.promptVariables.animal).toBe("Horse");
  });

  it("selects the de-locale animal source when locale is 'de' (paired source, never mixed)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();

    // The coder may surface locale via the input; if locale is wired, de must
    // pick pillars.year.tier ("Pferd"). element/birth_year are locale-invariant.
    const result: any = await svc.executeTestRun({ ...FULL_BERLIN_INPUT, locale: "de" } as any);

    expect(result.promptVariables).toBeDefined();
    expect(result.promptVariables.element).toBe("Metall");
    expect(result.promptVariables.birth_year).toBe(1990);
    // de animal source ("Pferd"). If locale wiring is deferred, this still must
    // not be a guessed/invented value — it is either the de source or absent.
    if (result.promptVariables.animal !== undefined) {
      expect(["Pferd", "Horse"]).toContain(result.promptVariables.animal);
    }
  });
});

describe("T9 (2) — missing source ⇒ block, never guess (no invented data through the live path)", () => {
  it("a bazi response missing transition.solar_year surfaces PROMPT_VARIABLE_SOURCE_MISSING for birth_year and does NOT invent a value", async () => {
    // Strip `transition.solar_year` from the bazi body (keep the rest intact).
    const baziNoYear = JSON.parse(JSON.stringify(baziSample));
    delete baziNoYear.transition.solar_year;

    mockFufireFetch({ bazi: baziNoYear });
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    // birth_year must be UNBOUND (not invented, not a default).
    expect(result.promptVariables?.birth_year).toBeUndefined();

    // The block is surfaced as an issue carrying the literal missing-source token.
    const issues: string[] = result.promptVariableIssues ?? [];
    expect(issues.some((i) => i.includes(PROMPT_VARIABLE_SOURCE_MISSING))).toBe(true);
    expect(
      issues.some((i) => i.includes(PROMPT_VARIABLE_SOURCE_MISSING) && i.includes("birth_year")),
    ).toBe(true);

    // The still-present sources (element) remain correctly mapped — the block is
    // scoped to the missing variable, it does not poison the others.
    expect(result.promptVariables?.element).toBe("Metall");
  });
});

describe("T9 (3) — 0,0-location guard holds THROUGH the live path (True-Line: no value for the wrong subject)", () => {
  it("wuxing computed at 0,0 ≠ real subject ⇒ dominant_element NOT bound, location-flagged missing-source issue", async () => {
    // The captured wuxing sample carries input.lat:0 / input.lon:0, while the
    // subject is real Berlin (52.52, 13.405). The dominant_element ("Holz")
    // exists in the response but was computed for the WRONG location → invented
    // data → must NOT be bound to this subject's prompt.
    mockFufireFetch();
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    // dominant_element must be UNBOUND despite being present in the raw response.
    expect(result.promptVariables?.dominant_element).toBeUndefined();

    // The guard surfaces a missing-source issue that mentions the location
    // mismatch (so a reviewer can distinguish it from a plain absence).
    const issues: string[] = result.promptVariableIssues ?? [];
    expect(
      issues.some(
        (i) =>
          i.includes(PROMPT_VARIABLE_SOURCE_MISSING) &&
          /location|dominant_element/.test(i),
      ),
    ).toBe(true);
  });

  it("when the wuxing source coords DO match the subject, dominant_element binds (guard is precise, not blanket)", async () => {
    // Re-point the wuxing sample's input coords to the real subject so the guard
    // passes — proving the guard blocks on MISMATCH, not unconditionally (which
    // would be its own bug: a precise guard, not a blanket refusal).
    const wuxingMatched = JSON.parse(JSON.stringify(wuxingSample));
    wuxingMatched.input.lat = REAL_LAT;
    wuxingMatched.input.lon = REAL_LON;

    mockFufireFetch({ wuxing: wuxingMatched });
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    expect(result.promptVariables?.dominant_element).toBe("Holz");
  });
});

describe("T9 (4) — raw response stays available (mapping is additive, not a replacement)", () => {
  it("the raw FuFire bazi + wuxing responses are still present in result.responses", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    const byOp = new Map<string, any>(result.responses.map((r: any) => [r.operation, r]));
    // Both ops fetched, both raw payloads retained (the test console can show both
    // the raw response AND the mapped variables — wiring must not destroy the raw).
    expect(byOp.get("bazi")?.data).toBeDefined();
    expect((byOp.get("bazi") as any).data.pillars.year.element).toBe("Metall");
    expect(byOp.get("wuxing")?.data).toBeDefined();
    expect((byOp.get("wuxing") as any).data.dominant_element).toBe("Holz");
  });
});

describe("T9 (5) — no PII/secret leak in the mapped result", () => {
  it("the sentinel API key never appears anywhere in the result", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    // The outbound key is read from the secretRef and sent only as the X-API-Key
    // header; it must never be echoed into the mapped result / any metadata.
    expect(JSON.stringify(result)).not.toContain(SENTINEL_KEY);
  });

  it("the mapped variables carry no raw PII fields (only the small, source-traced variable set)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun(FULL_BERLIN_INPUT);

    // promptVariables is a deliberately small, audited surface — not a dumping
    // ground for the raw response. It must not smuggle the raw birth instant /
    // coordinates back out under the "mapped variables" label. (The top-level
    // `input` echo is user-accepted and intentionally NOT asserted against here.)
    const mappedKeys = Object.keys(result.promptVariables ?? {});
    const allowed = new Set(["animal", "element", "birth_year", "dominant_element"]);
    for (const k of mappedKeys) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});

describe("T9 (6) — deferred ops (bazi_trace / chronometry) response-mapping render-blocks (no real samples)", () => {
  it("requesting chronometry does NOT yield a verified mapped variable; it is render-blocked, not asserted as truth", async () => {
    // chronometry additionally requires a timezone; we supply one so it reaches
    // the loop. There is NO real chronometry sample, so even if fetched, its
    // response-mapping must be render-blocked / unverified — never surfaced as a
    // mapped, verified prompt variable.
    mockFufireFetch({ bazi: baziSample });
    const svc = new FuFireDataService();

    const result: any = await svc.executeTestRun({
      ...FULL_BERLIN_INPUT,
      requestedOperations: ["bazi", "chronometry"],
    });

    // bazi still maps; chronometry contributes NO new verified mapped variable
    // (the safe variable set is bounded; a deferred op cannot add to it).
    expect(result.promptVariables?.element).toBe("Metall");
    const mappedKeys = Object.keys(result.promptVariables ?? {});
    const allowed = new Set(["animal", "element", "birth_year", "dominant_element"]);
    for (const k of mappedKeys) {
      expect(allowed.has(k)).toBe(true);
    }
  });
});
