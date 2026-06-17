import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * RED CONTRACT — REQ-003 (truthful reads) + REQ-004 (validate-dispatch is not a
 * go-signal) via the REAL composition root.
 * Feature: sizhu-agent-safe-ops · Phase 1 QA (black-box, written BEFORE the coder).
 *
 * GROUND TRUTH at HEAD (verified):
 *   - GET /api/gateway-issues → 200 { status:'OK', issues:[] }   (server/index.ts:124)
 *   - GET /api/workflows/*    → 200 { status:'OK', workflows:[] } (server/index.ts:128)
 *   - POST /api/fulfillment/pod/validate-dispatch → 200 { ok:true,
 *       status:'READY_FOR_DISPATCH' } for ANY body with workflowRunId + artifact
 *       (server/index.ts:223-229) — a shape check only, greenlights a fabricated artifact.
 *
 * Kritische semantische Glättung — REQ-003/REQ-004 (BOUNDARY: agent-facing HTTP that
 * other systems trust as a sensor):
 *   These:      "The reads return 200 with a well-formed array; validate returns READY."
 *   Gegenthese: The 200/empty-array is FABRICATED success — no real source is wired,
 *               so an agent observing 'issues:[]' / 'workflows:[]' concludes 'all
 *               healthy / nothing to do' when in truth NOTHING is connected. And
 *               validate-dispatch says READY_FOR_DISPATCH for a non-accepted, never-
 *               approved artifact — a green light over a cliff. Lying sensors are the
 *               exact CAN-001 problem this feature exists to kill.
 *   Schärfung:  With no real source configured, the reads must answer NOT_IMPLEMENTED /
 *               SOURCE_NOT_CONFIGURED (NOT a 200 empty-success), and validate-dispatch
 *               must NOT return READY_FOR_DISPATCH for a non-accepted artifact (real
 *               check OR an explicit VALIDATION_SHAPE_ONLY label). A pass is impossible
 *               while the endpoint launders absence into success.
 *
 * VCHK (VIS-006 #2 / VC-003, VC-004): no /api endpoint reports fabricated empty data
 *   as success; validate is not mistaken for an approval gate.
 * Evidence class: real-boundary-smoke (supertest vs createApp).
 *
 * EXPECTED NOW: RED-by-assertion (routes return fabricated 200 success today).
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

const HONEST_CODES = ["NOT_IMPLEMENTED", "SOURCE_NOT_CONFIGURED"];
function isHonestAbsence(res: any): boolean {
  // Either a non-200 status carrying an honest code, or a body whose status/error_code
  // names the absence. Crucially: NOT a 200 success carrying a fabricated empty array.
  const body = res.body ?? {};
  const code = body.error_code ?? body.status ?? "";
  return HONEST_CODES.includes(code);
}

let app: Express;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  // Ensure no real source is configured for these reads.
  delete process.env.WORKFLOWS_SOURCE;
  delete process.env.GATEWAY_ISSUES_SOURCE;
});

describe("REQ-003 / AC-005 — GET /api/workflows/* does not fabricate empty success", () => {
  it("with no real source → NOT_IMPLEMENTED/SOURCE_NOT_CONFIGURED, never 200 { workflows:[] }", async () => {
    const res = await request(app).get("/api/workflows/list").set(...bearer(token()));

    // The fabricated-success shape (today's behavior) must be GONE:
    const looksFabricated = res.status === 200 && Array.isArray(res.body?.workflows);
    expect(looksFabricated).toBe(false);
    // …and the truthful absence signal must be present.
    expect(isHonestAbsence(res)).toBe(true);
    // Mutation RED: revert to res.json({status:'OK', workflows:[]}) → looksFabricated
    // becomes true and isHonestAbsence false → RED.
  });
});

describe("REQ-003 / AC-005 — GET /api/gateway-issues does not fabricate empty success", () => {
  it("with no real source → NOT_IMPLEMENTED/SOURCE_NOT_CONFIGURED, never 200 { issues:[] }", async () => {
    const res = await request(app).get("/api/gateway-issues").set(...bearer(token()));

    const looksFabricated = res.status === 200 && Array.isArray(res.body?.issues);
    expect(looksFabricated).toBe(false);
    expect(isHonestAbsence(res)).toBe(true);
  });
});

describe("REQ-004 / AC-006 — validate-dispatch is not a READY go-signal for a non-accepted artifact", () => {
  it("non-accepted artifact → NOT READY_FOR_DISPATCH (real check OR VALIDATION_SHAPE_ONLY)", async () => {
    const res = await request(app)
      .post("/api/fulfillment/pod/validate-dispatch")
      .set(...bearer(token()))
      .send({
        workflowRunId: "wf-run-1",
        // A non-accepted artifact: no approval, status not 'accepted'.
        artifact: { id: "artifact-X", url: "https://example.com/a.png", status: "rejected" },
      });

    const status = res.body?.status;
    if (status === "READY_FOR_DISPATCH") {
      // The ONLY acceptable way READY-ish text can appear is an explicit shape-only
      // label that callers cannot mistake for an approval go-signal.
      expect(res.body?.shapeOnly === true || res.body?.label === "VALIDATION_SHAPE_ONLY").toBe(true);
    } else {
      // A real check must NOT bless a non-accepted artifact.
      expect(status).not.toBe("READY_FOR_DISPATCH");
    }
    // Mutation RED: today the route returns { ok:true, status:'READY_FOR_DISPATCH' }
    // with no label → the first branch's assertion fails → RED.
  });

  it("explicitly: a non-accepted artifact is never blessed as bare READY_FOR_DISPATCH", async () => {
    const res = await request(app)
      .post("/api/fulfillment/pod/validate-dispatch")
      .set(...bearer(token()))
      .send({
        workflowRunId: "wf-run-1",
        artifact: { id: "artifact-X", url: "https://example.com/a.png", status: "rejected" },
      });
    const bareReady = res.body?.status === "READY_FOR_DISPATCH" &&
      res.body?.shapeOnly !== true && res.body?.label !== "VALIDATION_SHAPE_ONLY";
    expect(bareReady).toBe(false);
  });
});
