import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { FuFireDataService } from "../services/fufireDataService";
import { PROMPT_VARIABLE_SOURCE_MISSING } from "../services/fufireResponseInterpreter";

/**
 * FX9 (REQ-F-003) — renderPromptTemplate is WIRED-IN-PROD on the live
 * executeTestRun path. Previously the render half had ZERO production callers
 * (only resolvePromptVariables/interpretFufireResponse were wired). When the
 * caller supplies a `promptTemplate`, the resolved prompt variables are rendered
 * into it; a template referencing an unresolved variable RENDER-BLOCKS (carrying
 * PROMPT_VARIABLE_SOURCE_MISSING), never emitting an unfilled/guessed placeholder.
 *
 * MUTATION NOTE: removing the FX9 render wiring (the renderPromptTemplate call /
 * the renderedPrompt return) turns the happy-path assertion RED.
 */

const baziSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/bazi.response.json"), "utf8"),
);
const wuxingSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/wuxing.response.json"), "utf8"),
);

const BAZI_PATH = "/v1/calculate/bazi";
const WUXING_PATH = "/v1/calculate/wuxing";
const BERLIN_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: 52.52,
  manualLon: 13.405,
  manualTimezone: "Europe/Berlin",
  requestedOperations: ["bazi", "wuxing"] as string[],
};

const SECRET_REF = "SECRET_REF_FUFIRE_API_KEY";
const ENV_KEYS = [SECRET_REF, "FUFIRE_API_KEY_SECRET_REF", "FUFIRE_API_KEY"];
const saved: Record<string, string | undefined> = {};

function mockFufireFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const href = typeof url === "string" ? url : String(url);
    let body: unknown = {};
    if (href.includes(BAZI_PATH)) body = baziSample;
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

describe("FX9 — renderPromptTemplate wired onto the live executeTestRun path", () => {
  it("renders the template from resolved prompt variables (en locale)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      ...BERLIN_INPUT,
      promptTemplate: "{{animal}} of {{element}}, born {{birth_year}}",
    } as any);

    expect(result.renderedPrompt).toBe("Horse of Metall, born 1990");
    expect(result.promptRenderIssue).toBeUndefined();
  });

  it("render-blocks (no unfilled placeholder) when the template references an unresolved variable", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      ...BERLIN_INPUT,
      // eastern_dominant is unresolved (no fusion op requested) → render must block.
      promptTemplate: "dominant: {{eastern_dominant}}",
    } as any);

    expect(result.renderedPrompt).toBeUndefined();
    expect(result.promptRenderIssue).toBeDefined();
    expect(result.promptRenderIssue).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
    // Never emits the raw unfilled placeholder as if it were a value.
    expect(result.renderedPrompt ?? "").not.toContain("{{eastern_dominant}}");
  });

  it("no template supplied ⇒ no render attempted (renderedPrompt absent)", async () => {
    mockFufireFetch();
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun(BERLIN_INPUT);
    expect(result.renderedPrompt).toBeUndefined();
    expect(result.promptRenderIssue).toBeUndefined();
  });
});
