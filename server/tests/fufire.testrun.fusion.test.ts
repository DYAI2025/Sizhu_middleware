import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FuFireDataService } from "../services/fufireDataService";
import {
  buildFusionRequest,
  FuFireRequestBuilderError,
  type NormalizedBirthInput,
} from "../services/fufireRequestBuilders";

/**
 * FX9 — fusion operation end-to-end (review finding I-1). Covers the gap the
 * cluster review flagged: buildFusionRequest had no builder test and no
 * executeTestRun integration ever requested the fusion op, so the fusion
 * request-body path + the eastern_dominant happy path through a real fetch were
 * unproven. This file closes both.
 */

const SAMPLES = "docs/contracts/fufire-samples";
const load = (f: string) => JSON.parse(readFileSync(join(process.cwd(), `${SAMPLES}/${f}`), "utf8"));
const baziSample = load("bazi.response.json");
const wuxingSample = load("wuxing.response.json");
const fusionSample = load("fusion.response.json").data; // unwrap the {_note,data} capture

const BAZI_PATH = "/v1/calculate/bazi";
const WUXING_PATH = "/v1/calculate/wuxing";
const FUSION_PATH = "/v1/calculate/fusion";
const REAL_LAT = 52.52;
const REAL_LON = 13.405;

const BERLIN_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: REAL_LAT,
  manualLon: REAL_LON,
  manualTimezone: "Europe/Berlin",
  requestedOperations: ["bazi", "wuxing", "fusion"] as string[],
};

const SECRET_REF = "SECRET_REF_FUFIRE_API_KEY";
const ENV_KEYS = [SECRET_REF, "FUFIRE_API_KEY_SECRET_REF", "FUFIRE_API_KEY"];
const saved: Record<string, string | undefined> = {};

function mockFufireFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const href = typeof url === "string" ? url : String(url);
    let body: unknown = {};
    if (href.includes(FUSION_PATH)) body = fusionSample;
    else if (href.includes(BAZI_PATH)) body = baziSample;
    else if (href.includes(WUXING_PATH)) body = wuxingSample;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env[SECRET_REF] = "sentinel-key-DO-NOT-LEAK";
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

describe("FX9 buildFusionRequest — flat shape, lat/lon required", () => {
  const BERLIN: NormalizedBirthInput = {
    birthDate: "1990-06-15",
    birthTime: "14:30",
    birthTimeKnown: true,
    lat: REAL_LAT,
    lon: REAL_LON,
    timezone: "Europe/Berlin",
  };

  it("produces a flat body with single ISO date + required lat/lon; no elements / no nested birth", () => {
    const body = buildFusionRequest(BERLIN) as Record<string, unknown>;
    expect(body.date).toBe("1990-06-15T14:30:00");
    expect(body.lat).toBe(REAL_LAT);
    expect(body.lon).toBe(REAL_LON);
    expect(body.tz).toBe("Europe/Berlin");
    expect("elements" in body).toBe(false);
    expect("birth" in body).toBe(false);
  });

  it("throws when a required coordinate is missing (defense-in-depth floor)", () => {
    expect(() => buildFusionRequest({ ...BERLIN, lat: undefined } as NormalizedBirthInput)).toThrow(FuFireRequestBuilderError);
    expect(() => buildFusionRequest({ ...BERLIN, lon: undefined } as NormalizedBirthInput)).toThrow(/"lon"/);
  });
});

describe("FX9 executeTestRun — fusion op reaches eastern_dominant end-to-end", () => {
  it("requesting fusion routes /v1/calculate/fusion and binds eastern_dominant=Feuer from the live-shaped sample", async () => {
    const spy = mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun(BERLIN_INPUT);

    // The fusion path was actually called.
    expect(spy.mock.calls.some(([u]) => String(u).includes(FUSION_PATH))).toBe(true);

    // The built fusion request body is in result.requests (flat, lat/lon present).
    const fusionReq = result.requests.find((r: any) => r.operation === "fusion");
    expect(fusionReq).toBeTruthy();
    expect(fusionReq.body.lat).toBe(REAL_LAT);
    expect(fusionReq.body.lon).toBe(REAL_LON);

    // eastern_dominant reaches the result (argmax of bazi_pillars = Feuer), and
    // western_dominant binds too — both through the real executeTestRun path.
    expect(result.promptVariables.eastern_dominant).toBe("Feuer");
    expect(result.promptVariables.western_dominant).toBe("Holz");
    expect(result.responses.find((r: any) => r.operation === "fusion")?.data).toBeDefined();
  });

  it("without the fusion op, eastern_dominant stays unbound + flagged (no guess)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({ ...BERLIN_INPUT, requestedOperations: ["bazi", "wuxing"] });
    expect(result.promptVariables.eastern_dominant).toBeUndefined();
    expect((result.promptVariableIssues ?? []).some((i: string) => /eastern_dominant/.test(i))).toBe(true);
  });
});
