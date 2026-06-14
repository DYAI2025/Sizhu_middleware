import { describe, it, expect } from "vitest";
import { FuFireDataService } from "../services/fufireDataService";

/**
 * Gate-B finding guard: a field NAMED `sanitizedRequestMetadata` must not carry raw
 * birth PII. The NO_GEOCODER_CONFIGURED gatewayIssue previously set
 * `sanitizedRequestMetadata: { input }`, echoing birthDate/time/coords (PII) — the
 * exact anti-pattern fixed for the POD _failure branches (commit a113746). This pins
 * the FuFire-path fix.
 *
 * Mutation: reverting line 159 to `sanitizedRequestMetadata: { input }` turns this RED.
 */

const PII_BIRTHDATE = "1990-06-15";
const PII_NAME = "Jane PII Customer";

describe("FuFire test-run — gatewayIssue.sanitizedRequestMetadata carries no birth PII", () => {
  it("NO_GEOCODER_CONFIGURED issue does not echo raw input PII", async () => {
    const svc = new FuFireDataService();
    // Missing manual coords → NO_GEOCODER branch; PII-laden input.
    const result = await svc.executeTestRun({
      birthDate: PII_BIRTHDATE,
      birthTime: "14:30",
      birthTimeKnown: true,
      customerName: PII_NAME,
      requestedOperations: ["bazi"],
    });

    const issue = (result.gatewayIssues || []).find(
      (g: any) => g.errorCode === "NO_GEOCODER_CONFIGURED",
    );
    expect(issue, "expected a NO_GEOCODER_CONFIGURED gateway issue").toBeTruthy();

    const metaStr = JSON.stringify(issue.sanitizedRequestMetadata ?? {});
    expect(metaStr).not.toContain(PII_BIRTHDATE);
    expect(metaStr).not.toContain(PII_NAME);
    expect(metaStr).not.toContain("14:30");
    // The field carries only the non-PII missing-coordinate diagnostic.
    expect("input" in (issue.sanitizedRequestMetadata ?? {})).toBe(false);
  });
});
