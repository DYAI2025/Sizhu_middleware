import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createBaziSoloRun,
  type BaziSoloRunDeps,
  type SimulatedOrder,
} from "../services/baziSoloRunService";
import type {
  FuFireTestRunInput,
  FuFireTestRunResult,
} from "../services/fufireDataService";
import type { GatewayIssue } from "../../src/lib/apiConnections/types";

/**
 * Feature bazi-baci-solo-no-mock-mvp — REQ-F-001 / REQ-F-002.
 *
 * Kritische semantische Glättung — REQ-F-002 (BOUNDARY: real FuFire ⇄ no mock):
 *   These:      "createBaziSoloRun turns a sim order into a BaZi run."
 *   Gegenthese: when FuFire is NOT_READY (or the bazi op failed upstream), the
 *               service silently falls back to a MockFuFireProvider / fabricates a
 *               rawBundle, so a caller believes a real BaZi run happened when none did.
 *   Schärfung:  a not-READY / bazi-failed FuFireDataService double yields status
 *               BLOCKED with a deterministic reason and NO fabricated responses; and
 *               the module source imports no MockFuFire* anything. A pass is impossible
 *               if a mock were wired or a rawBundle invented.
 *
 * Evidence class: unit + source-grep guard.
 */

/** Minimal sim order used across the cases. */
const SIM_ORDER: SimulatedOrder = {
  orderId: "sim-order-001",
  birthDate: "1990-05-15",
  birthTime: "08:30",
  birthTimeKnown: true,
  manualLat: 52.52,
  manualLon: 13.405,
  manualTimezone: "Europe/Berlin",
};

/** Deterministic injected id generator so runId never depends on clock/random. */
const deps = (svc: BaziSoloRunDeps["fufire"]): BaziSoloRunDeps => ({
  fufire: svc,
  generateRunId: () => "run-fixed-id",
});

/** A successful (READY) FuFireDataService double returning a real-shaped bundle. */
function readyFufireDouble(): BaziSoloRunDeps["fufire"] {
  return {
    async executeTestRun(input: FuFireTestRunInput): Promise<FuFireTestRunResult> {
      // Assert the service restricted operations to ["bazi"] only.
      expect(input.requestedOperations).toEqual(["bazi"]);
      // Steering fields must never be forwarded from the order body.
      expect((input as Record<string, unknown>).baseUrl).toBeUndefined();
      expect((input as Record<string, unknown>).authHeaderName).toBeUndefined();
      expect((input as Record<string, unknown>).fufirePath).toBeUndefined();
      return {
        normalizedBirthPayload: { birthDate: "1990-05-15" },
        requests: [{ operation: "bazi", body: { date: "1990-05-15" } }],
        responses: [{ operation: "bazi", data: { pillars: { year: { stamm: "Geng" } } } }],
        warnings: [],
        gatewayIssues: [],
        readinessStatus: "READY",
      };
    },
  };
}

/** A NOT_READY double (no fabrication of a bazi response). */
function notReadyFufireDouble(): BaziSoloRunDeps["fufire"] {
  return {
    async executeTestRun(): Promise<FuFireTestRunResult> {
      return {
        normalizedBirthPayload: {},
        requests: [],
        responses: [],
        warnings: [],
        gatewayIssues: [
          {
            id: "gi-1",
            providerKind: "data_request",
            providerName: "FuFire",
            operation: "all",
            errorCode: "NO_FUFIRE_API_KEY_CONFIGURED",
            message: "Missing secret",
            retryable: false,
            retryCount: 0,
            severity: "major",
            status: "open",
            sanitizedRequestMetadata: {},
            sanitizedResponseMetadata: {},
            createdAt: "2026-06-17T00:00:00.000Z",
          } as GatewayIssue,
        ],
        readinessStatus: "NOT_READY",
      };
    },
  };
}

/** A READY-but-bazi-op-failed double: readiness is READY yet the bazi op errored. */
function baziFailedFufireDouble(): BaziSoloRunDeps["fufire"] {
  return {
    async executeTestRun(): Promise<FuFireTestRunResult> {
      return {
        normalizedBirthPayload: { birthDate: "1990-05-15" },
        requests: [{ operation: "bazi", body: { date: "1990-05-15" } }],
        responses: [{ operation: "bazi", error: "FUFIRE_BAZI_FAILED" }],
        warnings: [],
        gatewayIssues: [
          {
            id: "gi-2",
            providerKind: "data_request",
            providerName: "FuFire",
            operation: "bazi",
            httpStatus: 500,
            errorCode: "FUFIRE_BAZI_FAILED",
            message: "FUFIRE_BAZI_FAILED (HTTP 500)",
            retryable: true,
            retryCount: 0,
            severity: "major",
            status: "open",
            sanitizedRequestMetadata: {},
            sanitizedResponseMetadata: { status: 500 },
            createdAt: "2026-06-17T00:00:00.000Z",
          } as GatewayIssue,
        ],
        readinessStatus: "READY",
      };
    },
  };
}

describe("createBaziSoloRun (REQ-F-001/002)", () => {
  it("(a) READY FuFireDataService → status ok with rawBundle.responses present", async () => {
    const run = await createBaziSoloRun(SIM_ORDER, deps(readyFufireDouble()));

    expect(run.status).toBe("ok");
    expect(run.runId).toBe("run-fixed-id");
    expect(run.readinessStatus).toBe("READY");
    expect(run.rawBundle.responses).toEqual([
      { operation: "bazi", data: { pillars: { year: { stamm: "Geng" } } } },
    ]);
    expect(run.rawBundle.requests).toHaveLength(1);
    expect(run.rawBundle.gatewayIssues).toEqual([]);
  });

  it("(b) NOT_READY → BLOCKED, deterministic reason, no fabricated responses", async () => {
    const run = await createBaziSoloRun(SIM_ORDER, deps(notReadyFufireDouble()));

    expect(run.status).toBe("BLOCKED");
    expect(run.readinessStatus).toBe("NOT_READY");
    // Deterministic, greppable reason — not the raw upstream message.
    expect(run.reason).toBe("FUFIRE_NOT_READY");
    // No fabricated bazi response: the (empty) bundle is surfaced as-is, never invented.
    expect(run.rawBundle.responses).toEqual([]);
  });

  it("(c) bazi-op gatewayIssue (READY but op failed) → BLOCKED, deterministic reason", async () => {
    const run = await createBaziSoloRun(SIM_ORDER, deps(baziFailedFufireDouble()));

    expect(run.status).toBe("BLOCKED");
    expect(run.reason).toBe("FUFIRE_BAZI_OPERATION_FAILED");
    // The raw bundle is surfaced honestly — no invented success response.
    expect(run.rawBundle.responses).toEqual([
      { operation: "bazi", error: "FUFIRE_BAZI_FAILED" },
    ]);
  });

  it("(d) the module source imports no MockFuFire* anything (REQ-F-002 hard constraint)", () => {
    const modulePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../services/baziSoloRunService.ts",
    );
    const source = readFileSync(modulePath, "utf8");
    expect(source).not.toMatch(/MockFuFire/);
  });

  it("derives a deterministic runId from the order when no generator is injected", async () => {
    const run1 = await createBaziSoloRun(SIM_ORDER, { fufire: readyFufireDouble() });
    const run2 = await createBaziSoloRun(SIM_ORDER, { fufire: readyFufireDouble() });
    // No Date.now()/Math.random(): same order ⇒ same runId across calls.
    expect(run1.runId).toBe(run2.runId);
    expect(run1.runId.length).toBeGreaterThan(0);
  });
});
