import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * RED CONTRACT — REQ-001 (Dispatch route money-gate) via the REAL composition root.
 * Feature: sizhu-agent-safe-ops · Phase 1 QA (black-box, written BEFORE the coder).
 *
 * GROUND TRUTH at HEAD (verified): POST /api/fulfillment/pod/dispatch
 * (server/index.ts:231) calls podDispatchService.dispatchArtifact(workflowRunId,
 * input, artifact) DIRECTLY with the body artifact — it consumes NO approval record,
 * loads NO server-side run, and never calls assertDispatchAllowed. The `sensitive`/
 * aal2 classification (auth.ts:154) is CALLER-AUTH, already DONE — it is NOT the
 * dispatch gate. So today an admin/aal2 caller dispatches UN-GATED (= C-1).
 *
 * Kritische semantische Glättung — REQ-001 (BOUNDARY: the live, assembled money path):
 *   These:      "The dispatch route is sensitive/aal2, so it is safe."
 *   Gegenthese: aal2 only proves WHO is calling, not WHETHER this artifact was
 *               approved. A valid admin (or a compromised agent token) POSTs a
 *               fabricated artifact and the route dispatches with zero approval
 *               check. Every auth test is green; the money gate does not exist.
 *   Schärfung:  Through createApp(), an aal2 admin dispatch WITHOUT a consumed
 *               approval record must be rejected `403 DISPATCH_NOT_ALLOWED` and NO
 *               dispatch work may run (the response must NOT carry a downstream
 *               dispatch-service verdict like mock_success / MISSING_POD_CONTRACT /
 *               POD_PROVIDER_DISABLED — those would prove the gate let the call reach
 *               dispatchArtifact). A pass is impossible while the route is ungated.
 *
 * VCHK (VIS-006 #1 / VC-001): dispatch happens ONLY behind the server-enforced gate.
 * Evidence class: real-boundary-smoke (auth + gate through createApp via supertest).
 *
 * Most assertions here are RED-by-assertion (route is reachable but ungated today).
 * The gate response codes (DISPATCH_NOT_ALLOWED) do not exist yet → red for the
 * RIGHT reason: the route returns a dispatch-service body, not the gate rejection.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal2",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}
function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

const DISPATCH = "/api/fulfillment/pod/dispatch";

/** Verdicts the DOWNSTREAM dispatch service can emit. If ANY of these appears on a
 *  no-approval / fabricated request, the gate FAILED to fire before dispatch work. */
const DOWNSTREAM_DISPATCH_VERDICTS = [
  "mock_success",
  "MISSING_POD_CONTRACT",
  "POD_PROVIDER_DISABLED",
  "POD_DISPATCH_DISABLED",
  "NO_POD_PRODUCT_UID_MAPPING",
  "NO_POD_API_KEY_CONFIGURED",
  "NO_ACCEPTED_ARTIFACT_FOR_DISPATCH",
];

function provedDispatchWork(body: any): boolean {
  const serialized = JSON.stringify(body ?? {});
  return DOWNSTREAM_DISPATCH_VERDICTS.some((v) => serialized.includes(v));
}

let app: Express;
const ENV_KEYS = ["APP_MODE", "VITE_APP_MODE", "MCP_ENABLE_DISPATCH", "POD_ENABLED", "POD_DISPATCH_MODE"];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  app = createApp();
});

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("REQ-001 / AC-001 — dispatch WITHOUT a valid approval record is gate-rejected, no provider call", () => {
  it("aal2 admin, no approval record → 403 DISPATCH_NOT_ALLOWED and NO dispatch work ran", async () => {
    // DEMO_LOCAL so that, if the gate were absent, the downstream service would emit
    // the most tempting fake: mock_success. The gate MUST pre-empt it.
    process.env.APP_MODE = "DEMO_LOCAL";
    const res = await request(app)
      .post(DISPATCH)
      .set(...bearer(token()))
      .send({
        workflowRunId: "wf-run-1",
        input: { subject: "s" },
        artifact: { id: "artifact-X", url: "https://example.com/a.png" },
        // NOTE: deliberately NO approvalRecordId / nonce → no consumable approval.
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("DISPATCH_NOT_ALLOWED");
    // The gate must fire BEFORE dispatchArtifact: no downstream verdict may leak.
    expect(provedDispatchWork(res.body)).toBe(false);
    // Mutation RED: remove the route gate → the call reaches dispatchArtifact and
    // returns 200 { status:'mock_success' } (DEMO) → both assertions fail.
  });
});

describe("REQ-002 / AC-002 — the RECORD decides, not the body artifact.status", () => {
  it("fabricated { artifact:{status:'accepted'} } with NO record → 403 DISPATCH_NOT_ALLOWED", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const res = await request(app)
      .post(DISPATCH)
      .set(...bearer(token()))
      .send({
        workflowRunId: "wf-run-1",
        input: { subject: "s" },
        // The caller forges QA acceptance in the body. assertDispatchAllowed reads
        // artifact.status (a body field) — but server state (the approval record),
        // not this field, must decide. Without a record the answer is NO.
        artifact: { id: "artifact-X", url: "https://example.com/a.png", status: "accepted" },
      });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe("DISPATCH_NOT_ALLOWED");
    expect(provedDispatchWork(res.body)).toBe(false);
    // Mutation RED: if the gate trusts artifact.status instead of the record, a
    // fabricated {status:'accepted'} passes → this goes RED. (BLOCKER-3.)
  });
});

describe("REQ-001/002 / AC-003b — PRODUCTION (Supabase stub, no approval store) is fail-closed", () => {
  it("prod mode dispatch → 403 (DISPATCH_NOT_ALLOWED / SOURCE_NOT_CONFIGURED), no provider call", async () => {
    // Prod approval store is the throwing Supabase stub ⇒ no store ⇒ no dispatch.
    process.env.APP_MODE = "PRODUCTION";
    process.env.POD_ENABLED = "true";
    process.env.POD_DISPATCH_MODE = "order";
    const res = await request(app)
      .post(DISPATCH)
      .set(...bearer(token()))
      .send({
        workflowRunId: "wf-run-1",
        input: { subject: "s" },
        artifact: { id: "artifact-X", url: "https://example.com/a.png", status: "accepted" },
      });

    expect(res.status).toBe(403);
    expect(["DISPATCH_NOT_ALLOWED", "SOURCE_NOT_CONFIGURED"]).toContain(res.body.error_code);
    // No downstream dispatch verdict (MISSING_POD_CONTRACT etc.) may appear: the gate
    // must fail closed at the store boundary, NOT fall through to dispatchArtifact.
    expect(provedDispatchWork(res.body)).toBe(false);
    // Mutation RED: if prod falls through to dispatchArtifact, the body carries a
    // downstream verdict and/or the status is not 403 → RED.
  });
});

describe("REQ-002 / AC-003c — concurrent double-dispatch on the SAME record → exactly one succeeds", () => {
  it.skip(
    "two concurrent dispatches sharing one valid record → exactly one 2xx, the other 403 (RED-by-missing-module: needs a real minted record via createApp; until T-ASO-2 the route cannot mint/accept one). Covered deterministically at the repo seam in aso.approvalRecord.contract.test.ts (AC-003c).",
    async () => {
      // Intentionally skipped at the route layer: minting a valid server-side record
      // through createApp requires the approval-issue path (T-ASO-2) which does not
      // exist yet. The atomic-consume guarantee is proven at the ApprovalRepository
      // seam (deterministic exactly-one-winner invariant). Un-skip + wire once the
      // route exposes an approval-issue/consume path.
    },
  );
});
