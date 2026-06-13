import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAppMode } from "../../src/lib/app/appMode";
import { PodDispatchService } from "../services/podDispatchService";

/**
 * REQ-D-001 (AC-D-001a..d) + REQ-O-002 (AC-O-002a..c) + VCHK-SFB-006.
 * "No fake success in production": production persistence → SUPABASE_NOT_CONFIGURED;
 * Gelato dispatch → no mock success outside DEMO_LOCAL.
 *
 * AC-D-001d pins the production-vs-DEMO_LOCAL distinction at the REAL getAppMode()
 * source (src/lib/app/appMode.ts), NOT a re-implemented check. The SAME source backs
 * the no-fake-dispatch gate (AC-O-002b).
 *
 * Kritische semantische Glättung — REQ-D-001/REQ-O-002 (BOUNDARY: mode-driven side effects):
 *   These:      "Dispatch returns a result; persistence returns a result."
 *   Gegenthese: A misbuild lets DEMO_LOCAL fake-success leak into a path read as
 *               production — dispatch returns { ok:true, status:'mock_success' } when
 *               the operator believes they are in production. Tests pass because they
 *               only ever exercise DEMO_LOCAL. Value (never invent fulfillment success)
 *               is destroyed silently. (Vision "Demo-mode leakage".)
 *   Schärfung:  Drive the REAL PodDispatchService with APP_MODE set to a NON-DEMO mode
 *               and assert ok:false (no 'mock_success'); and with DEMO_LOCAL assert the
 *               mock is the ONLY mode that may fake success. Pin the mode boundary at the
 *               real getAppMode() source so a re-implemented check can't drift past it.
 *
 * Evidence class: real-boundary-smoke for the mode source; integration (real service,
 * no live Gelato call) for the dispatch decision — both honest, no live network.
 */

const MODE_ENV = ["APP_MODE", "VITE_APP_MODE"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of MODE_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of MODE_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AC-D-001d — mode boundary pinned at the real getAppMode() source", () => {
  it("APP_MODE=PRODUCTION resolves to a NON-DEMO mode", () => {
    process.env.APP_MODE = "PRODUCTION";
    expect(getAppMode()).not.toBe("DEMO_LOCAL");
    expect(getAppMode()).toBe("PRODUCTION");
  });

  it("APP_MODE=DEMO_LOCAL resolves to DEMO_LOCAL (the only mock-permitted mode)", () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    expect(getAppMode()).toBe("DEMO_LOCAL");
  });

  it("CONFIG_REQUIRED / PRODUCTION_NOT_READY are NON-DEMO (no mock permitted)", () => {
    process.env.APP_MODE = "CONFIG_REQUIRED";
    expect(getAppMode()).not.toBe("DEMO_LOCAL");
    process.env.APP_MODE = "PRODUCTION_NOT_READY";
    expect(getAppMode()).not.toBe("DEMO_LOCAL");
  });

  // RED-CONTRACT / drift flag (AC-D-001d, audit note N5):
  // PRD §266-272 requires resolving the inconsistency between the app default
  // (DEMO_LOCAL, commit 4980ee9) and server/index.ts:90 (CONFIG_REQUIRED). This test
  // pins the EXPECTED resolution: with NO mode env set, the system must NOT silently
  // present a production-capable mode. The current source defaults to DEMO_LOCAL, which
  // the coder must reconcile (explicit, labeled) so demo-success cannot leak. If the
  // team's resolution is "default DEMO_LOCAL but never production", this test documents
  // that the *unset* default is at least an explicit, mock-permitted mode — never an
  // implicit production mode.
  it("unset mode default is an explicit DEMO/CONFIG mode, never an implicit production mode", () => {
    delete process.env.APP_MODE;
    delete process.env.VITE_APP_MODE;
    const mode = getAppMode();
    expect(mode).not.toBe("PRODUCTION");
    expect(mode).not.toBe("SUPABASE_READY");
  });
});

describe("AC-O-002b / VCHK-SFB-006 — no fake Gelato dispatch success outside DEMO_LOCAL", () => {
  const svc = new PodDispatchService();
  const artifact = { id: "artifact-1", url: "https://example.com/a.png" };

  for (const mode of ["PRODUCTION", "CONFIG_REQUIRED", "SUPABASE_READY", "PRODUCTION_NOT_READY"]) {
    it(`mode=${mode}: dispatch returns ok:false (no 'mock_success')`, async () => {
      process.env.APP_MODE = mode;
      const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("mock_success");
    });
  }

  it("AC-O-002a — disabled / missing contract yields a controlled error, no outbound order", async () => {
    process.env.APP_MODE = "PRODUCTION";
    process.env.POD_ENABLED = "false";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    // A stable, controlled error code (POD disabled / MISSING_POD_CONTRACT family).
    expect(typeof result.error_code).toBe("string");
    expect(result.error_code.length).toBeGreaterThan(0);
  });

  it("AC-D-001c — DEMO_LOCAL is the ONLY mode where a mock success may be returned", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    // Demo mode is allowed to mock; this documents the single legal fake-success site.
    expect(result.ok).toBe(true);
  });
});
