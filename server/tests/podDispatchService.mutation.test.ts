import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import {
  PodDispatchService,
  deriveIdempotencyKey,
} from "../services/podDispatchService";
import * as fulfillmentConfig from "../../src/lib/apiConnections/fulfillmentConfig";
import type { FulfillmentConfig } from "../../src/lib/apiConnections/fulfillmentConfig";

/**
 * FX6 — mutation-kill augmentation for server/services/podDispatchService.ts.
 *
 * Baseline 64.4%, 31 survivors — dominated by:
 *   - StringLiteral survivors: the EXACT error_code AND message string of each
 *     safety branch + the MISSING_POD_CONTRACT branch were never asserted
 *     (existing tests only check error_code, never message).
 *   - OptionalChaining survivors: `artifact?.id` (artifact present → id flows into
 *     sanitizedRequestMetadata; artifact undefined → no crash, key still derived).
 *   - BooleanLiteral / determinism survivors on deriveIdempotencyKey:
 *     same identity → same key; different → different; the `artifactId ?? ''`
 *     fallback making the function total; SHA-256 (not Date.now/uuid) so it is a
 *     pure deterministic hash.
 *
 * Companions (pod.dispatch.branches / pod.idempotency / pod.failure.sanitization)
 * cover error_code reachability + PII-sanitization + key determinism THROUGH the
 * service. This file augments by: asserting EXACT message strings, exercising
 * deriveIdempotencyKey DIRECTLY against known SHA-256 reference values, and
 * pinning the artifact?.id optional-chaining on BOTH branches.
 *
 * Evidence class: unit + integration (real PodDispatchService + real exported
 * pure function; no live Gelato call).
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

const SECRET_SENTINEL = "sk_gelato_SECRET_DO_NOT_LEAK_9a7f0e21";
const PII_BIRTHDATE = "1988-02-29";
const PII_NAME = "Mei PII Chen";

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Default to a NON-DEMO mode so the mock-success path is never accidentally the
  // branch under test (DEMO_LOCAL has its own dedicated cases).
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

// Reference oracle for the idempotency key: an INDEPENDENT re-implementation of
// the documented contract (SHA-256 of `${workflowRunId}:${artifactId ?? ''}`).
// This pins the exact algorithm, separator, and fallback — a mutant that changes
// any of those produces a different digest than this oracle.
function expectedKey(workflowRunId: string, artifactId?: string): string {
  return createHash("sha256")
    .update(`${workflowRunId}:${artifactId ?? ""}`)
    .digest("hex");
}

// ───────────────────────────────────────────────────────────────────────────
// deriveIdempotencyKey — direct pure-function tests (determinism + ?? '' + hash)
// ───────────────────────────────────────────────────────────────────────────
describe("deriveIdempotencyKey — determinism, totality, exact digest", () => {
  it("is a 64-char lowercase hex SHA-256 digest", () => {
    const key = deriveIdempotencyKey("wf-1", "artifact-1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toHaveLength(64);
  });

  it("matches the exact known SHA-256 reference value (pins separator + composition)", () => {
    // Precomputed: createHash('sha256').update('wf-1:artifact-1').digest('hex')
    expect(deriveIdempotencyKey("wf-1", "artifact-1")).toBe(
      "2079ac804156a9adf9770c6a59ef49d604e07d1c8e869aa431699fd3cebee90f",
    );
    expect(deriveIdempotencyKey("wf-1", "artifact-1")).toBe(
      expectedKey("wf-1", "artifact-1"),
    );
  });

  it("same (workflowRunId, artifactId) → SAME key (deterministic, kills Date.now/uuid mutants)", () => {
    const a = deriveIdempotencyKey("wf-9", "artifact-9");
    const b = deriveIdempotencyKey("wf-9", "artifact-9");
    expect(a).toBe(b);
  });

  it("different workflowRunId → DIFFERENT key", () => {
    expect(deriveIdempotencyKey("wf-1", "artifact-1")).not.toBe(
      deriveIdempotencyKey("wf-2", "artifact-1"),
    );
  });

  it("different artifactId → DIFFERENT key", () => {
    expect(deriveIdempotencyKey("wf-1", "artifact-1")).not.toBe(
      deriveIdempotencyKey("wf-1", "artifact-2"),
    );
  });

  it("the ':' separator is load-bearing: key differs from the no-separator concatenation (kills separator-removal mutant)", () => {
    // A mutant that drops the ':' separator hashes `${run}${artifact}` instead of
    // `${run}:${artifact}`. The real key (with ':') must therefore differ from the
    // bare concatenation. SHA-256('wf-1:artifact-1') !== SHA-256('wf-1artifact-1').
    const realKey = deriveIdempotencyKey("wf-1", "artifact-1");
    const noSeparator = createHash("sha256")
      .update("wf-1artifact-1")
      .digest("hex");
    expect(realKey).toBe(expectedKey("wf-1", "artifact-1"));
    expect(realKey).not.toBe(noSeparator);
  });

  it("the ':' separator disambiguates boundaries: ('xa','b') !== ('x','ab')", () => {
    // With the ':' separator these distinct (run, artifact) pairs hash to
    // 'xa:b' vs 'x:ab' respectively — they must NOT collide. (NB: a pair like
    // ('a','b:c') vs ('a:b','c') WOULD collide even WITH ':', so it is not a
    // valid separator test — both yield 'a:b:c'.)
    expect(deriveIdempotencyKey("xa", "b")).not.toBe(
      deriveIdempotencyKey("x", "ab"),
    );
  });

  it("artifactId undefined → still TOTAL (no throw) and equals the empty-segment form (?? '')", () => {
    // The `artifactId ?? ''` fallback: undefined must hash IDENTICALLY to ''.
    // A mutant that drops the `?? ''` (hashing literal 'undefined') breaks this.
    let undefinedKey = "";
    expect(() => {
      undefinedKey = deriveIdempotencyKey("wf-1");
    }).not.toThrow();
    expect(undefinedKey).toMatch(/^[0-9a-f]{64}$/);
    expect(undefinedKey).toBe(deriveIdempotencyKey("wf-1", ""));
    expect(undefinedKey).toBe(expectedKey("wf-1", undefined));
    // Exact reference digest of 'wf-1:' (empty artifact segment).
    expect(undefinedKey).toBe(
      "6066e729eacdb01f30b65eb8a3be9ed1335ef7e65cbfc7895ad33ca4974a3582",
    );
    // And the empty-segment hash must NOT collide with the populated form.
    expect(undefinedKey).not.toBe(deriveIdempotencyKey("wf-1", "artifact-1"));
  });

  it("does NOT hash the literal string 'undefined' for a missing artifactId", () => {
    // Guards the `?? ''` against a mutant that interpolates `undefined` directly.
    expect(deriveIdempotencyKey("wf-1")).not.toBe(
      expectedKey("wf-1", "undefined"),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Each safety branch: EXACT error_code AND EXACT message string.
// (Existing tests assert error_code only — these pin the message StringLiterals.)
// ───────────────────────────────────────────────────────────────────────────
describe("dispatchArtifact — each safety branch's EXACT error_code AND message", () => {
  it("POD_PROVIDER_DISABLED: exact code + message", async () => {
    delete process.env.POD_ENABLED; // config.enabled === false
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_PROVIDER_DISABLED");
    expect(result.message).toBe("Fulfillment provider is not enabled.");
    expect(result.gatewayIssue.errorCode).toBe("POD_PROVIDER_DISABLED");
    expect(result.gatewayIssue.message).toBe("Fulfillment provider is not enabled.");
  });

  it("POD_DISPATCH_DISABLED: exact code + message", async () => {
    process.env.POD_ENABLED = "true";
    // POD_DISPATCH_MODE unset → defaults to 'disabled'.
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_DISPATCH_DISABLED");
    expect(result.message).toBe("Dispatch mode is currently disabled.");
    expect(result.gatewayIssue.message).toBe("Dispatch mode is currently disabled.");
  });

  it("NO_ACCEPTED_ARTIFACT_FOR_DISPATCH: exact code + message (artifact undefined)", async () => {
    process.env.POD_ENABLED = "true";
    process.env.POD_DISPATCH_MODE = "order";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, undefined);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_ACCEPTED_ARTIFACT_FOR_DISPATCH");
    expect(result.message).toBe(
      "There is no approved final artifact to dispatch.",
    );
    expect(result.gatewayIssue.message).toBe(
      "There is no approved final artifact to dispatch.",
    );
  });

  it("NO_POD_PRODUCT_UID_MAPPING: exact code + message (env config has empty mappings)", async () => {
    process.env.POD_ENABLED = "true";
    process.env.POD_DISPATCH_MODE = "order";
    // The genuine env-driven config always has productMappings: [].
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_POD_PRODUCT_UID_MAPPING");
    expect(result.message).toBe("Missing product mapping configuration.");
    expect(result.gatewayIssue.message).toBe(
      "Missing product mapping configuration.",
    );
  });

  it("NO_POD_API_KEY_CONFIGURED: exact code + message INTERPOLATES the secretRef name", async () => {
    delete process.env.SECRET_REF_GELATO_API_KEY; // no key present
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_POD_API_KEY_CONFIGURED");
    // The message embeds config.secretRef via template string — pin the exact text.
    expect(result.message).toBe("Missing secret for SECRET_REF_GELATO_API_KEY.");
    expect(result.gatewayIssue.message).toBe(
      "Missing secret for SECRET_REF_GELATO_API_KEY.",
    );
  });

  it("NO_POD_API_KEY_CONFIGURED message tracks a DIFFERENT secretRef (proves interpolation, not a constant)", async () => {
    delete process.env.SECRET_REF_GELATO_API_KEY;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig({ secretRef: "SECRET_REF_OTHER_KEY" }),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.error_code).toBe("NO_POD_API_KEY_CONFIGURED");
    expect(result.message).toBe("Missing secret for SECRET_REF_OTHER_KEY.");
  });

  it("MISSING_POD_CONTRACT: exact code + message at the would-dispatch point", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("MISSING_POD_CONTRACT");
    expect(result.message).toBe(
      "Gelato order creation contract schema is currently unknown. Safe adapter boundary engaged.",
    );
    expect(result.gatewayIssue.errorCode).toBe("MISSING_POD_CONTRACT");
    expect(result.gatewayIssue.message).toBe(
      "Gelato order creation contract schema is currently unknown. Safe adapter boundary engaged.",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// gatewayIssue shape literals (StringLiteral survivors on the issue object).
// ───────────────────────────────────────────────────────────────────────────
describe("dispatchArtifact — gatewayIssue carries the exact provider/operation literals", () => {
  it("MISSING_POD_CONTRACT issue: providerKind/providerName/operation/severity/status literals", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    const issue = result.gatewayIssue;
    expect(issue.providerKind).toBe("fulfillment");
    expect(issue.providerName).toBe("Gelato_Proxy");
    expect(issue.operation).toBe("create_order");
    expect(issue.severity).toBe("critical");
    expect(issue.status).toBe("open");
    expect(issue.retryable).toBe(false);
    expect(issue.retryCount).toBe(0);
  });

  it("_failure issue (POD_PROVIDER_DISABLED): same provider/operation literals + retryable false", async () => {
    delete process.env.POD_ENABLED;
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    const issue = result.gatewayIssue;
    expect(issue.providerKind).toBe("fulfillment");
    expect(issue.providerName).toBe("Gelato_Proxy");
    expect(issue.operation).toBe("create_order");
    expect(issue.severity).toBe("critical");
    expect(issue.status).toBe("open");
    expect(issue.retryable).toBe(false);
    expect(issue.retryCount).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// artifact?.id optional-chaining — BOTH branches (present AND absent).
// ───────────────────────────────────────────────────────────────────────────
describe("dispatchArtifact — artifact?.id optional chaining (present AND absent)", () => {
  it("artifact PRESENT → its id flows into sanitizedRequestMetadata.artifactId (MISSING_POD_CONTRACT)", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-7", { subject: "s" }, {
      id: "artifact-present-7",
      url: "https://example.com/x.png",
    });
    const meta = result.gatewayIssue.sanitizedRequestMetadata;
    expect(meta.workflowRunId).toBe("wf-7");
    expect(meta.artifactId).toBe("artifact-present-7");
    // The key is derived from the PRESENT artifact id at the would-dispatch point.
    expect(result.idempotencyKey).toBe(
      expectedKey("wf-7", "artifact-present-7"),
    );
    expect(meta.idempotencyKey).toBe(result.idempotencyKey);
  });

  it("artifact PRESENT but id UNDEFINED → no crash; artifactId undefined; key uses empty segment", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    // artifact is truthy (passes the !artifact gate) but has no id → artifact?.id
    // is undefined. The optional chain must not crash and the key falls back to ''.
    const result = await svc.dispatchArtifact("wf-8", { subject: "s" }, {
      url: "https://example.com/y.png",
    } as any);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("MISSING_POD_CONTRACT");
    expect(result.gatewayIssue.sanitizedRequestMetadata.artifactId).toBeUndefined();
    expect(result.idempotencyKey).toBe(expectedKey("wf-8", undefined));
    expect(result.idempotencyKey).toBe(deriveIdempotencyKey("wf-8", ""));
  });

  it("artifact ABSENT (undefined) → _failure branch reads artifact?.id without crashing; artifactId undefined", async () => {
    delete process.env.POD_ENABLED; // POD_PROVIDER_DISABLED branch, artifact?.id on undefined
    const result = await svc.dispatchArtifact("wf-3", { subject: "s" }, undefined);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_PROVIDER_DISABLED");
    const meta = result.gatewayIssue.sanitizedRequestMetadata;
    expect(meta.workflowRunId).toBe("wf-3");
    // artifact?.id on undefined → undefined; must not throw, must not invent an id.
    expect(meta.artifactId).toBeUndefined();
    expect("artifactId" in meta).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// isMock boolean branch (DEMO_LOCAL true vs PRODUCTION false) + mock literals.
// ───────────────────────────────────────────────────────────────────────────
describe("dispatchArtifact — isMock boolean branch (DEMO_LOCAL true / non-DEMO false)", () => {
  it("DEMO_LOCAL (isMock true) → ok:true, status 'mock_success', dispatchId 'MOCK-ORDER-' prefix", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mock_success");
    expect(typeof result.dispatchId).toBe("string");
    expect(result.dispatchId.startsWith("MOCK-ORDER-")).toBe(true);
    // The mock path returns NO gatewayIssue / error_code.
    expect(result.error_code).toBeUndefined();
    expect(result.gatewayIssue).toBeUndefined();
  });

  it("non-DEMO (isMock false) → never the mock path even when otherwise fully ready", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe("mock_success");
    expect(JSON.stringify(result)).not.toContain("mock_success");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sanitization: no secret / no PII in any sanitizedRequestMetadata.
// ───────────────────────────────────────────────────────────────────────────
describe("dispatchArtifact — no secret / no PII in sanitizedRequestMetadata", () => {
  const piiInput = {
    subject: "personalized print",
    customerName: PII_NAME,
    birthDate: PII_BIRTHDATE,
    customer: { name: PII_NAME, birthDate: PII_BIRTHDATE },
  };

  it("MISSING_POD_CONTRACT: sanitized metadata holds only order identity + key (no secret, no PII)", async () => {
    process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
    vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(
      readyConfig(),
    );
    const result = await svc.dispatchArtifact("wf-1", piiInput, artifact);
    const metaStr = JSON.stringify(result.gatewayIssue.sanitizedRequestMetadata);
    expect(metaStr).not.toContain(SECRET_SENTINEL);
    expect(metaStr).not.toContain(PII_BIRTHDATE);
    expect(metaStr).not.toContain(PII_NAME);
    // Raw caller input must NOT be echoed under sanitized metadata.
    expect("input" in result.gatewayIssue.sanitizedRequestMetadata).toBe(false);
    // Whole result is secret-free + PII-free too.
    const all = JSON.stringify(result);
    expect(all).not.toContain(SECRET_SENTINEL);
    expect(all).not.toContain(PII_BIRTHDATE);
    expect(all).not.toContain(PII_NAME);
  });

  it("_failure (POD_PROVIDER_DISABLED): sanitized metadata holds only order identity (no PII)", async () => {
    delete process.env.POD_ENABLED;
    const result = await svc.dispatchArtifact("wf-1", piiInput, artifact);
    const meta = result.gatewayIssue.sanitizedRequestMetadata;
    expect(meta.workflowRunId).toBe("wf-1");
    expect(meta.artifactId).toBe("artifact-1");
    expect("input" in meta).toBe(false);
    const all = JSON.stringify(result);
    expect(all).not.toContain(PII_BIRTHDATE);
    expect(all).not.toContain(PII_NAME);
  });
});
