import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PodDispatchService } from "../services/podDispatchService";

/**
 * REQ-O-002 / AC-O-002c sanitization guard — closes the coverage gap a holistic
 * code review surfaced: the pre-dispatch `_failure` branches previously echoed the
 * raw caller `input` (which can carry customer PII: birth date / name) into a field
 * named `sanitizedRequestMetadata`, returned verbatim in the API 400 body.
 *
 * Kritische semantische Glättung:
 *   These:      "A controlled error is returned for a disabled provider."
 *   Gegenthese: the error's sanitizedRequestMetadata echoes the raw `input`, so a
 *               field LABELED sanitized actually leaks PII into the response/logs —
 *               and the reality-ledger "no PII" claim is then false.
 *   Schärfung:  drive a _failure branch with PII-laden input and assert NO raw PII
 *               (sentinel birth date / name) appears anywhere in the result; only
 *               order identity (workflowRunId + artifactId) is present.
 *
 * Mutation: reverting `_failure` to store `{ input }` turns this RED.
 */

const ENV = ["APP_MODE", "VITE_APP_MODE", "POD_ENABLED", "POD_DISPATCH_MODE", "POD_BASE_URL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Non-DEMO mode so the mock-success path is not what we test; POD_ENABLED unset
  // → config.enabled === false → POD_PROVIDER_DISABLED (_failure branch).
  process.env.APP_MODE = "PRODUCTION";
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const PII_BIRTHDATE = "1990-06-15";
const PII_NAME = "Jane PII Customer";

const svc = new PodDispatchService();
const piiInput = {
  workflowRunId: "wf-pii-1",
  birthDate: PII_BIRTHDATE,
  customerName: PII_NAME,
  customer: { name: PII_NAME, birthDate: PII_BIRTHDATE },
};
const artifact = { id: "artifact-pii-1", url: "https://example.com/a.png" };

describe("REQ-O-002 — _failure branches do not leak raw input / PII", () => {
  it("POD_PROVIDER_DISABLED: result carries no raw birth date / name, only order identity", async () => {
    const result = await svc.dispatchArtifact("wf-pii-1", piiInput, artifact);

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("POD_PROVIDER_DISABLED");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(PII_BIRTHDATE);
    expect(serialized).not.toContain(PII_NAME);

    // Only sanitized order identity is surfaced.
    const meta = result.gatewayIssue?.sanitizedRequestMetadata ?? {};
    expect(meta.workflowRunId).toBe("wf-pii-1");
    expect(meta.artifactId).toBe("artifact-pii-1");
    expect("input" in meta).toBe(false);
  });

  it("NO_ACCEPTED_ARTIFACT_FOR_DISPATCH (artifact missing): still no PII echo", async () => {
    // Reach a later branch: enable provider + order mode but pass no artifact.
    process.env.POD_ENABLED = "true";
    process.env.POD_DISPATCH_MODE = "order";
    const result = await svc.dispatchArtifact("wf-pii-2", piiInput, undefined);

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("NO_ACCEPTED_ARTIFACT_FOR_DISPATCH");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(PII_BIRTHDATE);
    expect(serialized).not.toContain(PII_NAME);
  });
});
