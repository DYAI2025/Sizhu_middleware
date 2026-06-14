import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PodDispatchService } from "../services/podDispatchService";
import * as fulfillmentConfig from "../../src/lib/apiConnections/fulfillmentConfig";
import type { FulfillmentConfig } from "../../src/lib/apiConnections/fulfillmentConfig";

/**
 * T7 — REQ-O-002 / AC-O-002c: idempotency-ready (the ONE unbuilt criterion).
 * VCHK-SFB-006 (Gelato dispatch safety).
 *
 * PRD: "an idempotency key is generated and logged (sanitized) before any real
 * dispatch work — even though no real dispatch happens this run."
 *
 * Companions already cover the OTHER criteria (do NOT duplicate):
 *   - AC-O-002a (disabled / MISSING_POD_CONTRACT controlled error) + AC-O-002b
 *     (no fake success outside DEMO_LOCAL): pod.dispatch.branches.test.ts +
 *     no-fake-success.mode.test.ts.
 * This file ONLY proves AC-O-002c.
 *
 * ── Kritische semantische Glättung — BOUNDARY feature (the key guards a real
 *    network POST to Gelato, so it must survive a retry) ──────────────────────
 *   These:      "An idempotency key is generated and logged before dispatch"
 *               (construction-level: a key field exists on the result).
 *   Gegenthese: The key is PRESENT but NON-DETERMINISTIC — e.g. built from
 *               `Date.now()` or `crypto.randomUUID()`. A naive "key is truthy"
 *               test stays GREEN, yet user value is ZERO: every retry of the SAME
 *               logical order produces a NEW key, so Gelato treats each retry as a
 *               brand-new order → duplicate prints + duplicate charges. The whole
 *               point of an idempotency key (safe retry) is silently destroyed.
 *               Second face: the key "is logged" but leaks a SECRET (hash of the
 *               API key) or raw customer PII (birth date / name) into the log.
 *   Schärfung:  (a) Call dispatchArtifact TWICE with the SAME (workflowRunId,
 *               artifact.id) and assert the key is EQUAL across calls — this FAILS
 *               for Date.now()/randomUUID. (b) Different identity → DIFFERENT key.
 *               (c) The key + sanitized metadata never contains the sentinel POD
 *               secret nor raw PII. All exercised through the real
 *               PodDispatchService at the would-dispatch point (safety gates pass →
 *               MISSING_POD_CONTRACT; NO real POST happens).
 *
 *   MUTATION THIS CATCHES: if the coder generates the key with
 *   `Date.now()` / `crypto.randomUUID()` / `Math.random()` (anything not derived
 *   purely from workflowRunId + artifact.id), test (1) "deterministic per logical
 *   order" goes RED because the two calls return different keys.
 *
 * Evidence class: integration (real PodDispatchService, no live Gelato call).
 *
 * ── Intended public surface (the CONTRACT the coder must satisfy) ────────────
 *   On a non-DEMO_LOCAL dispatch that reaches the would-dispatch point, the
 *   returned object carries a top-level string `idempotencyKey`, AND the same
 *   value is surfaced (sanitized, for "logged") at
 *   `gatewayIssue.sanitizedRequestMetadata.idempotencyKey`. The key is a pure,
 *   deterministic function of (workflowRunId, artifact.id) and contains no secret
 *   or PII.
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

// Sentinels we will assert NEVER appear in the key or sanitized metadata.
const SECRET_SENTINEL = "sk_gelato_SECRET_DO_NOT_LEAK_5f3a91c2";
const PII_BIRTHDATE = "1990-07-23";
const PII_NAME = "Wei Zhang";

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Default to a NON-DEMO mode so the mock-success path is never under test here.
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

/** A fully-ready config so dispatch reaches the would-dispatch point. */
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

/**
 * Drive a non-DEMO dispatch all the way to the would-dispatch point (all safety
 * gates pass) so an idempotency key MUST have been generated. Returns the result.
 */
async function dispatchToWouldDispatchPoint(
  workflowRunId: string,
  input: any,
  art: { id: string; url: string },
) {
  process.env.SECRET_REF_GELATO_API_KEY = SECRET_SENTINEL;
  vi.spyOn(fulfillmentConfig, "getGelatoFulfillmentConfig").mockReturnValue(readyConfig());
  return svc.dispatchArtifact(workflowRunId, input, art);
}

/**
 * Pull the idempotency key from whichever sanctioned surface(s) carry it, and
 * ASSERT it is a non-empty string. The hard assertion matters: without it, two
 * pre-implementation calls both return `undefined` and a bare
 * `expect(k1).toBe(k2)` would FALSELY pass (undefined === undefined). By failing
 * here on a missing/empty key, the determinism test (1) is RED before the key
 * exists AND stays a true determinism check afterwards.
 */
function idempotencyKeyOf(result: any): string {
  const top = result?.idempotencyKey;
  const meta = result?.gatewayIssue?.sanitizedRequestMetadata?.idempotencyKey;
  // Contract: at minimum the top-level field is present; if both exist they agree.
  if (typeof top === "string" && typeof meta === "string") {
    expect(meta).toBe(top);
  }
  const key = (typeof top === "string" ? top : meta) as string;
  expect(typeof key, "idempotencyKey must be a string on result.idempotencyKey (and/or gatewayIssue.sanitizedRequestMetadata.idempotencyKey)").toBe("string");
  expect(key.length, "idempotencyKey must be non-empty").toBeGreaterThan(0);
  return key;
}

describe("AC-O-002c — idempotency key is generated before any real dispatch work", () => {
  it("surfaces a non-empty idempotency key at the would-dispatch point (still ok:false)", async () => {
    const result = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);

    // The key is generated EVEN THOUGH dispatch is blocked (no real POST happened).
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("MISSING_POD_CONTRACT");

    const key = idempotencyKeyOf(result);
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });
});

describe("AC-O-002c — DETERMINISM (kills the non-deterministic-key Gegenthese)", () => {
  // (1) THE CORE PROPERTY. Two dispatches of the SAME logical order
  // (same workflowRunId + same artifact.id) MUST yield the SAME key, so a retry
  // does NOT create a duplicate Gelato order.
  // MUTATION CAUGHT: Date.now() / crypto.randomUUID() / Math.random() → the two
  // keys differ → this assertion goes RED.
  it("same (workflowRunId, artifact.id) → SAME key across two calls", async () => {
    const first = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);
    vi.restoreAllMocks(); // reset the spy; re-armed inside the helper for call 2
    const second = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);

    const k1 = idempotencyKeyOf(first);
    const k2 = idempotencyKeyOf(second);
    expect(k1).toBe(k2);
  });

  // (2) Distinct per different logical order — a different run OR a different
  // artifact must NOT collide (otherwise two real orders would be deduped away).
  it("different workflowRunId → DIFFERENT key", async () => {
    const a = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);
    vi.restoreAllMocks();
    const b = await dispatchToWouldDispatchPoint("wf-2", { subject: "s" }, artifact);

    expect(idempotencyKeyOf(a)).not.toBe(idempotencyKeyOf(b));
  });

  it("different artifact.id (same run) → DIFFERENT key", async () => {
    const a = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);
    vi.restoreAllMocks();
    const b = await dispatchToWouldDispatchPoint(
      "wf-1",
      { subject: "s" },
      { id: "artifact-2", url: "https://example.com/b.png" },
    );

    expect(idempotencyKeyOf(a)).not.toBe(idempotencyKeyOf(b));
  });
});

describe("AC-O-002c — no fake success (regression guard)", () => {
  // Generating the key must NOT flip the result to success outside DEMO_LOCAL.
  it("key present but result stays ok:false / MISSING_POD_CONTRACT, never mock_success", async () => {
    const result = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);

    const key = idempotencyKeyOf(result);
    expect(key.length).toBeGreaterThan(0); // key exists...
    expect(result.ok).toBe(false); // ...yet no success was invented
    expect(result.error_code).toBe("MISSING_POD_CONTRACT");
    expect(JSON.stringify(result)).not.toContain("mock_success");
  });
});

describe("AC-O-002c — SANITIZED: no secret, no PII in the key or logged metadata", () => {
  it("key + sanitized metadata never contain the POD API key value", async () => {
    const result = await dispatchToWouldDispatchPoint("wf-1", { subject: "s" }, artifact);

    const key = idempotencyKeyOf(result);
    expect(key).not.toContain(SECRET_SENTINEL);

    // The whole sanitized request metadata (what gets "logged") must be secret-free.
    const meta = JSON.stringify(result?.gatewayIssue?.sanitizedRequestMetadata ?? {});
    expect(meta).not.toContain(SECRET_SENTINEL);
    // And the full result object never echoes the secret anywhere.
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
  });

  it("key never echoes raw customer PII (birth date / name) passed via input", async () => {
    const piiInput = {
      subject: "personalized print",
      customerName: PII_NAME,
      birthDate: PII_BIRTHDATE,
    };
    const result = await dispatchToWouldDispatchPoint("wf-1", piiInput, artifact);

    const key = idempotencyKeyOf(result);
    // The idempotency key derives from order IDENTITY (run + artifact), not from
    // raw PII — so the key itself must not embed the raw birth date or name.
    expect(key).not.toContain(PII_BIRTHDATE);
    expect(key).not.toContain(PII_NAME);
  });
});

describe("AC-O-002c — DEMO_LOCAL is unaffected (idempotency is a real-dispatch concern)", () => {
  it("DEMO_LOCAL still returns the mock success path unchanged", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const result = await svc.dispatchArtifact("wf-1", { subject: "s" }, artifact);
    // Mock path is the single legal fake-success site; idempotency must not break it.
    expect(result.ok).toBe(true);
    expect(result.status).toBe("mock_success");
  });
});
