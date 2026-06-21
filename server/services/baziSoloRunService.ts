/**
 * BaZiSoloRunService — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-001 / REQ-F-002).
 *
 * Turns a (simulated) order into a REAL BaZi run by delegating to the injected
 * {@link FuFireDataService}. There is deliberately NO mock fallback anywhere on
 * this path (REQ-F-002): if the real FuFire boundary is not READY, or the `bazi`
 * operation failed upstream, the run is REJECTED with a deterministic, greppable
 * reason and the honest (possibly empty) raw bundle is surfaced as-is. A
 * fabricated success response is never invented.
 *
 * Security / SSRF (mirrors fufireOperations.ts): the order body may name ONLY a
 * birth instant + manual location. It can never steer the outbound URL, header,
 * path, or which secret is read — this module restricts requestedOperations to
 * the server-owned `bazi` entry of {@link ALLOWED_FUFIRE_OPERATIONS} and forwards
 * exactly the normalized birth/location fields, never `baseUrl` / `authHeaderName`
 * / `fufirePath` / `apiKeySecretRef` from the order.
 *
 * Determinism (P4-friendly): `runId` is derived deterministically from the order
 * (or from an injected `generateRunId`); this module never calls `Date.now()` or
 * `Math.random()`, so tests are reproducible.
 */
import { createHash } from "node:crypto";
import {
  ALLOWED_FUFIRE_OPERATIONS,
  type AllowedFuFireOperation,
} from "./fufireOperations";
import type {
  FuFireTestRunInput,
  FuFireTestRunResult,
} from "./fufireDataService";
import type { GatewayIssue } from "../../src/lib/apiConnections/types";

/**
 * The single operation this MVP runs. Resolved from the server-owned allowlist
 * (never a string literal) so a rename of the allowlist entry is a compile error
 * here rather than a silent drift.
 */
const BAZI_OPERATION: AllowedFuFireOperation = "bazi";

/** Deterministic, greppable rejection reasons (never the raw upstream message). */
export const BAZI_SOLO_BLOCK_REASONS = {
  NOT_READY: "FUFIRE_NOT_READY",
  BAZI_OP_FAILED: "FUFIRE_BAZI_OPERATION_FAILED",
} as const;

export type BaziSoloBlockReason =
  (typeof BAZI_SOLO_BLOCK_REASONS)[keyof typeof BAZI_SOLO_BLOCK_REASONS];

/**
 * A simulated order. Only birth instant + manual location are honored; any other
 * field on the object is ignored (never forwarded as a steering field).
 */
export interface SimulatedOrder {
  orderId: string;
  birthDate: string;
  birthTime?: string;
  birthTimeKnown?: boolean;
  manualLat?: number;
  manualLon?: number;
  manualTimezone?: string;
  /** Render locale passthrough (selects the paired animal source downstream). */
  locale?: string;
}

/**
 * The narrow surface this service depends on from {@link FuFireDataService}.
 * Declared structurally (not the concrete class) so tests inject a fake and prod
 * injects the real `new FuFireDataService()`.
 */
export interface FuFireDataServiceLike {
  executeTestRun(input: FuFireTestRunInput): Promise<FuFireTestRunResult>;
}

/** Injected dependencies (DI — tests use fakes; prod passes the real ones). */
export interface BaziSoloRunDeps {
  fufire: FuFireDataServiceLike;
  /**
   * Optional id generator. When absent, the runId is derived deterministically
   * from the order (see {@link deriveRunId}). NEVER `Date.now()`/`Math.random()`.
   */
  generateRunId?: (order: SimulatedOrder) => string;
}

/** The honest raw FuFire bundle, surfaced verbatim (never fabricated). */
export interface BaziSoloRawBundle {
  requests: FuFireTestRunResult["requests"];
  responses: FuFireTestRunResult["responses"];
  gatewayIssues: GatewayIssue[];
  warnings: string[];
}

export interface BaziSoloRunResult {
  runId: string;
  status: "ok" | "BLOCKED";
  rawBundle: BaziSoloRawBundle;
  readinessStatus: FuFireTestRunResult["readinessStatus"];
  /** Present only when status === "BLOCKED": a deterministic, greppable reason. */
  reason?: BaziSoloBlockReason;
}

/**
 * Derive a stable runId from the order's identity-bearing fields. Deterministic
 * (sha256, truncated) so the same order always yields the same id — no clock,
 * no randomness.
 */
function deriveRunId(order: SimulatedOrder): string {
  const seed = [
    order.orderId,
    order.birthDate,
    order.birthTime ?? "",
    order.manualLat ?? "",
    order.manualLon ?? "",
    order.manualTimezone ?? "",
  ].join("|");
  return `bazi-solo-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

/**
 * Build the SANITIZED FuFire input from the order. Only the normalized birth +
 * manual-location fields are projected, plus `requestedOperations` locked to the
 * server-owned `bazi` op. No steering field (baseUrl/path/header/secretRef) is
 * ever read from the order, so the order body cannot influence the outbound call.
 */
function toFuFireInput(order: SimulatedOrder): FuFireTestRunInput {
  return {
    birthDate: order.birthDate,
    birthTime: order.birthTime,
    birthTimeKnown: order.birthTimeKnown,
    manualLat: order.manualLat,
    manualLon: order.manualLon,
    manualTimezone: order.manualTimezone,
    locale: order.locale,
    // Server-owned allowlist — the ONLY op this run is permitted to dispatch.
    requestedOperations: [BAZI_OPERATION],
  };
}

/**
 * Turn a (simulated) order into a real BaZi run.
 *
 * REJECTS to `status: "BLOCKED"` (never a mock fallback) when the FuFire boundary
 * is not READY OR the `bazi` operation failed upstream (a gateway issue scoped to
 * the `bazi` op). On rejection the honest raw bundle is returned untouched.
 */
export async function createBaziSoloRun(
  order: SimulatedOrder,
  deps: BaziSoloRunDeps,
): Promise<BaziSoloRunResult> {
  const runId = (deps.generateRunId ?? deriveRunId)(order);

  const result = await deps.fufire.executeTestRun(toFuFireInput(order));

  const rawBundle: BaziSoloRawBundle = {
    requests: result.requests,
    responses: result.responses,
    gatewayIssues: result.gatewayIssues,
    warnings: result.warnings,
  };

  const blocked = (reason: BaziSoloBlockReason): BaziSoloRunResult => ({
    runId,
    status: "BLOCKED",
    rawBundle,
    readinessStatus: result.readinessStatus,
    reason,
  });

  // Gate 1: the real boundary must be READY. NEVER fall back to a mock.
  if (result.readinessStatus !== "READY") {
    return blocked(BAZI_SOLO_BLOCK_REASONS.NOT_READY);
  }

  // Gate 2: the bazi op itself must not have failed upstream. A gateway issue
  // scoped to the `bazi` operation means no trustworthy BaZi data exists — reject
  // rather than surface a fictional success.
  const baziFailed = result.gatewayIssues.some(
    (issue) => issue.operation === BAZI_OPERATION,
  );
  if (baziFailed) {
    return blocked(BAZI_SOLO_BLOCK_REASONS.BAZI_OP_FAILED);
  }

  return {
    runId,
    status: "ok",
    rawBundle,
    readinessStatus: result.readinessStatus,
  };
}
