import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PodDispatchService } from "../services/podDispatchService";
import * as fulfillmentConfig from "../../src/lib/apiConnections/fulfillmentConfig";
import type { FulfillmentConfig } from "../../src/lib/apiConnections/fulfillmentConfig";

/**
 * FP4 — Gelato dispatch branch correctness (REQ-O-002 / VCHK-SFB-006).
 *
 * Companion to the tester-authored `no-fake-success.mode.test.ts` (which must NOT
 * be edited). That file asserts `error_code.length > 0` on the disabled path —
 * which never proves WHICH controlled error fired and never reaches the
 * `MISSING_POD_CONTRACT` boundary it names. This file drives `dispatchArtifact`
 * into EACH branch (via env + a config spy where env is insufficient) and asserts
 * the SPECIFIC `error_code` — never `length > 0`.
 *
 * Mutation check: replacing the final `MISSING_POD_CONTRACT` branch with
 * `{ ok:true, status:'mock_success' }` turns the MISSING_POD_CONTRACT case RED
 * (it currently asserts ok:false + the exact code + no 'mock_success').
 *
 * Evidence class: integration (real PodDispatchService, no live Gelato call).
 */

const ENV_KEYS = [
  "APP_MODE",
  "VITE_APP_MODE",
  "POD_ENABLED",
  "POD_DISPATCH_MODE",
  "POD_BASE_URL",
  "SECRET_REF_GELATO_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Default every test to a NON-DEMO mode so the mock-success path is never the
  // one under test (DEMO_LOCAL is covered by its own case).
  process.env.APP_MODE = "PRODUCTION";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const svc = new PodDispatchService();
const artifact = { id: "artifact-1", url: "https://example.com/a.png" };

/** A fully-ready config (enabled + order mode + product mapping + base url). */
function readyConfig(overrides: Partial<FulfillmentConfig> = {}): FulfillmentConfig {
  return {
    providerKind: "fulfillment",
    providerName: "Gelato_Proxy",
    baseUrl: "https://api.example.test",
    authMode: "api_key_header",
    authHeaderName: "X-API-KEY",
    secretRef: "SECRET_REF_GELATO_API_KEY",
    enabled: true,
    dispatchMode: "order",
    timeoutMs: 30000,
    retryCount: 0,
    idempotencyHeaderName: "Idempotency-Key",
    operations: {
      create_order: { key: "create_order", method: "POST", path: "/v4/orders" },
    },
    productMappings: [
      {
        shopProductId: "shop-1",
        externalVariantId: "var-1",
        podProductUid: "pod-uid-1",
        printFileSlot: "front",
      },
    ],
    ...overrides,
  };
}

describe("FP4 — DEMO_LOCAL is the ONLY mock-success site", () => {
  it("DEMO_LOCAL → ok:true + status 'mock_success'", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mock_success");
  });
});

describe("FP4 — each disabled/misconfigured branch yields its SPECIFIC error_code", () => {
  it("POD_ENABLED unset → POD_PROVIDER_DISABLED", async () => {
    delete process.env.POD_ENABLED;
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_PROVIDER_DISABLED");
    expect(JSON.stringify(result)).not.toContain("mock_success");
  });

  it("enabled + POD_DISPATCH_MODE unset (disabled) → POD_DISPATCH_DISABLED", async () => {
    process.env.POD_ENABLED = "true";
    // POD_DISPATCH_MODE unset → defaults to 'disabled'
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_DISPATCH_DISABLED");
  });

  it("enabled + dispatch mode 'order' + empty product mappings → NO_POD_PRODUCT_UID_MAPPING", async () => {
    process.env.POD_ENABLED = "true";
    process.env.POD_DISPATCH_MODE = "order";
    // The real env-driven config always has empty productMappings, so this is the
    // genuine env-reachable branch.
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_POD_PRODUCT_UID_MAPPING");
  });

  it("ready config (mappings present) but no Gelato key → NO_POD_API_KEY_CONFIGURED", async () => {
    delete process.env.SECRET_REF_GELATO_API_KEY;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_POD_API_KEY_CONFIGURED");
  });
});

describe("FP4 — reaching the real MISSING_POD_CONTRACT boundary", () => {
  it("enabled + order mode + mappings + key, non-DEMO_LOCAL → MISSING_POD_CONTRACT, ok:false, no mock_success", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = "real-gelato-key-present";
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    // This is the safe-adapter boundary: even fully configured, we do NOT invent
    // a fulfillment success — we surface the controlled contract-missing error.
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("MISSING_POD_CONTRACT");
    expect(JSON.stringify(result)).not.toContain("mock_success");
    expect(result.gatewayIssue).toBeDefined();
    expect(result.gatewayIssue.errorCode).toBe("MISSING_POD_CONTRACT");
  });
});
