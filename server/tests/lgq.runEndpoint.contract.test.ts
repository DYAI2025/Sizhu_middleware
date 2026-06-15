import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../index';
import { classifyApiRoute } from '../middleware/auth';
import { signJwtHS256, JwtPayload } from '../lib/jwt';

/**
 * RED CONTRACT — REQ-LGQ-003 (Server-side run endpoint POST /api/workflows/:id/run,
 * classified SENSITIVE) + REQ-LGQ-008a (wired-in-prod via createApp composition).
 * Slice A · feat/sizhu-live-generate-qa-loop · TDD Phase 1 (written before impl).
 *
 * Contract surface (T-LGQ-7, PRD §5 security matrix, §7):
 *   - createApp() registers POST /api/workflows/:id/run.
 *   - A pattern { method:"POST", pattern: /^\/workflows\/[^/]+\/run\/?$/ } is ADDED
 *     to SENSITIVE_API_ROUTES so classifyApiRoute('POST','/workflows/<id>/run')
 *     === "sensitive" (admin role + MFA/aal2).
 *   - Without token → 401 AUTH_REQUIRED; non-admin → 403 ADMIN_ROLE_REQUIRED;
 *     admin@aal1 → 403 MFA_REQUIRED_FOR_ACTION; admin@aal2 → passes the auth layer.
 *
 * This is the CANONICAL security guard for the new privileged, money-spending route.
 * It mirrors server/tests/auth.routes.test.ts (the project's security spec).
 *
 * Kritische semantische Glättung — REQ-LGQ-003 (BOUNDARY: a new privileged HTTP
 * endpoint reachable on the production composition root that spends real money):
 *   These:      "We added a /run endpoint; the runner runs server-side."
 *   Gegenthese: The endpoint exists but, because its pattern was NOT added to
 *               SENSITIVE_API_ROUTES, it defaults to `session` — any verified-email
 *               user (no admin role, no MFA) can trigger real OpenRouter spend. The
 *               handler "works" (green), the security promise (R2: spends money ⇒
 *               sensitive) is silently broken. This is exactly the CLAUDE.md
 *               default-deny trap the spec calls out.
 *   Schärfung:  Drive the REAL apiGuard via supertest@createApp AND classifyApiRoute
 *               directly: assert non-admin→403 and aal1→403 (which ONLY hold if the
 *               route is `sensitive`, i.e. the allowlist entry exists). If the
 *               allowlist entry is missing, the route is `session` and the aal1 case
 *               returns non-403 → RED.
 *
 * VCHK (Vision value-check): only an authenticated admin with MFA can spend money on
 *   a live run — money/customer actions stay gated (value-promise #7).
 *
 * Evidence class: real-composition (real createApp + real apiGuard, no handler stub).
 *
 * EXPECTED NOW: RED — the route is not registered AND not in SENSITIVE_API_ROUTES yet.
 * The aal1/non-admin assertions fail because classifyApiRoute returns "session".
 */

const JWT_SECRET = 'test-jwt-secret-value-do-not-log';
const SERVICE_ROLE_KEY = 'test-service-role-key-SHOULD-NEVER-LEAK';
const OPENROUTER_KEY = 'test-openrouter-key-SHOULD-NEVER-LEAK';
const ADMIN_EMAIL = 'admin@example.com';
const NON_ADMIN_EMAIL = 'stranger@example.com';

const RUN_PATH = '/api/workflows/wf-run-1234/run';

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: 'user-123',
    email: ADMIN_EMAIL,
    aal: 'aal2',
    email_confirmed_at: '2024-01-01T00:00:00Z',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}
function bearer(t: string): [string, string] {
  return ['Authorization', `Bearer ${t}`];
}

// A minimal PII-bearing body (OQ-1 RESOLVED: birth/test data in the body).
const RUN_BODY = {
  orderNumber: 'ORD-1',
  productId: 'prod-001',
  customerName: 'Test User',
  birthDate: '1991-07-23',
  birthTime: '14:00',
  birthTimeKnown: true,
  birthPlace: 'London',
};

let app: Express;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  process.env.OPENROUTER_API_KEY = OPENROUTER_KEY;
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = 'true';
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = 'true';
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  process.env.OPENROUTER_API_KEY = OPENROUTER_KEY;
});

describe('REQ-LGQ-003b — classifyApiRoute classifies POST /workflows/:id/run as sensitive', () => {
  it('returns "sensitive" (pattern added to SENSITIVE_API_ROUTES)', () => {
    expect(classifyApiRoute('POST', '/workflows/wf-run-1234/run')).toBe('sensitive');
    expect(classifyApiRoute('POST', '/workflows/abc/run/')).toBe('sensitive');
    // Mutation RED: omit the allowlist entry → returns "session" → RED.
  });

  it('does NOT over-match a sibling read route', () => {
    // GET listing stays non-sensitive (it is a placeholder read today).
    expect(classifyApiRoute('GET', '/workflows/wf-run-1234')).not.toBe('sensitive');
  });
});

describe('REQ-LGQ-003c — default-deny holds for the new run endpoint', () => {
  it('rejects unauthenticated requests with 401 AUTH_REQUIRED', async () => {
    const res = await request(app).post(RUN_PATH).send(RUN_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('AUTH_REQUIRED');
  });

  it('rejects authenticated but non-admin users with 403 ADMIN_ROLE_REQUIRED (sensitive-only)', async () => {
    const res = await request(app)
      .post(RUN_PATH)
      .set(...bearer(token({ email: NON_ADMIN_EMAIL })))
      .send(RUN_BODY);
    // This 403 ONLY happens if the route is classified `sensitive`. If the allowlist
    // entry is missing, the route is `session` → a verified non-admin passes the guard
    // (non-403) → RED. That is the load-bearing assertion.
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('ADMIN_ROLE_REQUIRED');
  });

  it('rejects admin users at aal1 with 403 MFA_REQUIRED_FOR_ACTION (sensitive-only)', async () => {
    const res = await request(app)
      .post(RUN_PATH)
      .set(...bearer(token({ aal: 'aal1' })))
      .send(RUN_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('MFA_REQUIRED_FOR_ACTION');
    expect(res.body.status).toBe('MFA_REQUIRED');
    // Mutation RED: drop the SENSITIVE_API_ROUTES entry → aal1 is allowed → RED.
  });

  it('rejects admins with an unverified email with 403 EMAIL_VERIFICATION_REQUIRED', async () => {
    const res = await request(app)
      .post(RUN_PATH)
      .set(...bearer(token({ email_confirmed_at: null, email_verified: false } as Partial<JwtPayload>)))
      .send(RUN_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });
});

describe('REQ-LGQ-003a/008a — endpoint is REACHABLE for admin@aal2 (handler exists, wired into createApp)', () => {
  it('admin@aal2 passes the auth layer (not 401/403) — the handler decides the run outcome', async () => {
    const res = await request(app)
      .post(RUN_PATH)
      .set(...bearer(token()))
      .send(RUN_BODY);
    // The auth layer must let an admin@aal2 through; a missing route would 404, a
    // gated route would 401/403. We require the handler to exist and be reachable.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
    // Mutation RED: never register the route in createApp → 404 → RED. This is the
    // P1 wired-in-prod proof at the HTTP boundary (the route reaches a real handler).
  });
});

describe('REQ-LGQ-005b / NFR-6 — the run endpoint never echoes the OpenRouter key or JWT secret', () => {
  it('no secret value appears in any response from the run endpoint (all auth outcomes)', async () => {
    const responses = await Promise.all([
      request(app).post(RUN_PATH).send(RUN_BODY),
      request(app).post(RUN_PATH).set(...bearer(token({ email: NON_ADMIN_EMAIL }))).send(RUN_BODY),
      request(app).post(RUN_PATH).set(...bearer(token({ aal: 'aal1' }))).send(RUN_BODY),
      request(app).post(RUN_PATH).set(...bearer(token())).send(RUN_BODY),
    ]);
    for (const res of responses) {
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(OPENROUTER_KEY);
      expect(serialized).not.toContain(JWT_SECRET);
      expect(serialized).not.toContain(SERVICE_ROLE_KEY);
    }
    // Mutation RED: echo process.env.OPENROUTER_API_KEY into an error/debug field → RED.
  });
});
