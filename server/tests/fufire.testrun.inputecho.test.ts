import { describe, it, expect } from "vitest";
import { FuFireDataService } from "../services/fufireDataService";

/**
 * FX8 (2026-06-14, user "strip the echo") — executeTestRun must NOT echo the raw
 * caller `input` back to the client, and `normalizedBirthPayload` must NOT spread
 * the raw input (which previously leaked customerName + any arbitrary passthrough
 * key into a client-returned field).
 *
 * Kritische semantische Glättung:
 *   These:      "executeTestRun returns a normalized payload."
 *   Gegenthese: it ALSO returned result.input (a verbatim copy of the admin's
 *               birth submission: date/name/coords) AND built normalizedBirthPayload
 *               via `{ ...input }`, so customerName + arbitrary keys rode out under
 *               a label that looks benign.
 *   Schärfung:  drive a run with a sentinel customerName + extra passthrough key and
 *               assert (a) there is NO top-level `input` field, and (b) the sentinel
 *               name / passthrough key do NOT appear in normalizedBirthPayload.
 *
 * MUTATION NOTE: reverting normalizedBirthPayload to `{ ...input, ... }` (or
 * re-adding `input` to the returned object) turns this RED — the sentinel name
 * reappears.
 *
 * No network: a coords-less run hits the NO_GEOCODER early return, which still
 * builds normalizedBirthPayload — exactly the surface under test.
 */

const SENTINEL_NAME = "Jane-PII-Customer-DO-NOT-ECHO";
const SENTINEL_PASSTHROUGH = "arbitrary-passthrough-DO-NOT-ECHO";

describe("FX8 — no raw input echo / no uncontrolled spread in the test-run result", () => {
  it("result has NO top-level `input` field", async () => {
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      customerName: SENTINEL_NAME,
      requestedOperations: ["bazi"],
    } as any);
    expect("input" in result).toBe(false);
  });

  it("normalizedBirthPayload carries no customerName / arbitrary passthrough (no `...input` spread)", async () => {
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      customerName: SENTINEL_NAME,
      somethingArbitrary: SENTINEL_PASSTHROUGH,
      requestedOperations: ["bazi"],
    } as any);

    const payloadStr = JSON.stringify(result.normalizedBirthPayload ?? {});
    expect(payloadStr).not.toContain(SENTINEL_NAME);
    expect(payloadStr).not.toContain(SENTINEL_PASSTHROUGH);
    // Only the controlled normalized birth keys are allowed in the payload.
    const allowed = new Set([
      "birthDate",
      "birthTime",
      "birthTimeKnown",
      "lat",
      "lon",
      "timezone",
      "birthTimeSource",
    ]);
    for (const k of Object.keys(result.normalizedBirthPayload ?? {})) {
      expect(allowed.has(k), `unexpected key "${k}" in normalizedBirthPayload`).toBe(true);
    }
  });

  it("the whole result carries no customerName (it is never needed downstream)", async () => {
    const svc = new FuFireDataService();
    const result: any = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTimeKnown: false,
      customerName: SENTINEL_NAME,
      requestedOperations: ["bazi"],
    } as any);
    // No coords → NO_GEOCODER early return; the sentinel name must appear nowhere.
    expect(JSON.stringify(result)).not.toContain(SENTINEL_NAME);
  });
});
