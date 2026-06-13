import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";

/**
 * REQ-A-001 — Remove the arbitrary client-controlled FuFire proxy (SSRF / config-bypass).
 * VCHK-SFB-002 — Server owns FuFirE config.
 *
 * BLACK-BOX acceptance layer, derived from PRD §2 (AC-A-001a..e) + §3.4 + Vision
 * "Risks if Misbuilt": "Re-authing the SSRF proxy instead of removing it".
 *
 * Kritische semantische Glättung — REQ-A-001 (BOUNDARY: HTTP + outbound fetch):
 *   These:      "The proxy now sits behind apiGuard, so the SSRF/config-bypass is handled."
 *   Gegenthese: A green auth suite (auth.routes.test.ts) is fully passing while the
 *               body-controlled `fuFireConfig.baseUrl` / `apiKeySecretRef` / `fufirePath`
 *               primitive is STILL LIVE — any authenticated admin steers the server's
 *               outbound URL + which secret it reads. Value (no arbitrary backend access)
 *               is ZERO even though every auth test is green.
 *   Schärfung:  Drive the PRODUCTION composition root (createApp via supertest) with an
 *               admin aal2 session AND a malicious body; spy on global.fetch and assert it
 *               is NEVER called toward an attacker-chosen URL, and never with an
 *               attacker-chosen secret-env header. A pass here is impossible while the
 *               body-controlled fetch path exists.
 *
 * Evidence class: real-boundary-smoke (production composition root, real apiGuard).
 *
 * STATUS at authoring time: RED CONTRACT. server/index.ts:196 still mounts
 * `app.post("/api/fufire/*")` which fetches `fuFireConfig.baseUrl + fufirePath` with the
 * env secret. These tests MUST fail until the coder removes that primitive (T1).
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";
const ATTACKER_URL = "https://attacker.example.com/exfil";
const ATTACKER_SECRET_REF = "SUPABASE_SERVICE_ROLE_KEY"; // a real env var the attacker tries to coerce as the API key source
const ATTACKER_SECRET_VALUE = "ATTACKER-WANTS-THIS-SECRET-VALUE";

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

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  // The attacker-named secret-env var IS present, so if the body could steer
  // which env var is read, the secret would actually be exfiltrated.
  process.env[ATTACKER_SECRET_REF] = ATTACKER_SECRET_VALUE;
  process.env.FUFIRE_BASE_URL = "https://api.fufire.space";
  process.env.FUFIRE_API_KEY = "server-owned-fufire-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC-A-001a — generic proxy removed (no arbitrary-URL fetch handler)", () => {
  it("POST /api/fufire/<anything> does not reach an outbound fetch handler", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await request(app)
      .post("/api/fufire/v1/calculate/bazi")
      .set(...bearer(token()))
      .send({
        fuFireConfig: {
          baseUrl: ATTACKER_URL,
          apiKeySecretRef: ATTACKER_SECRET_REF,
          enabled: true,
        },
        fufirePath: "/v1/calculate/bazi",
        body: {},
      });

    // The generic proxy must be gone: either route-not-found/default-deny, never a
    // proxied 200 from a server-side outbound fetch to the body-supplied URL.
    expect([401, 403, 404, 405]).toContain(res.status);

    // And crucially: the server must not have fetched the attacker URL.
    const fetchedAttacker = fetchSpy.mock.calls.some((call) =>
      String(call[0]).includes("attacker.example.com"),
    );
    expect(fetchedAttacker, "server must NOT fetch the body-supplied URL").toBe(false);
  });
});

describe("AC-A-001b / VCHK-SFB-002 — body cannot steer URL or secret (operation-only endpoint)", () => {
  const opPath = "/api/data-requests/fufire/test-run";

  it("rejects/ignores fuFireConfig/fufirePath/baseUrl/apiKeySecretRef; never fetches attacker URL or leaks attacker-chosen secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await request(app)
      .post(opPath)
      .set(...bearer(token()))
      .send({
        operation: "bazi",
        requestedOperations: ["bazi"],
        input: {
          birthDate: "1990-06-15",
          birthTime: "14:30",
          manualLat: 52.52,
          manualLon: 13.405,
          manualTimezone: "Europe/Berlin",
        },
        // --- hostile fields that MUST NOT influence execution (PRD §3.4) ---
        fuFireConfig: { baseUrl: ATTACKER_URL, apiKeySecretRef: ATTACKER_SECRET_REF, enabled: true },
        fufirePath: "/v1/calculate/bazi",
        baseUrl: ATTACKER_URL,
        apiKeySecretRef: ATTACKER_SECRET_REF,
        authHeaderName: "X-Attacker-Header",
      });

    // The endpoint must pass the auth guard (admin aal2) and not 401/403 here.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);

    // 1) The outbound URL is server-owned: no fetch toward the attacker URL.
    const fetchedAttacker = fetchSpy.mock.calls.some((call) =>
      String(call[0]).includes("attacker.example.com"),
    );
    expect(fetchedAttacker, "outbound URL must be server-owned, never body-supplied").toBe(false);

    // 2) The attacker-chosen secret env var value must never appear in any outbound
    //    header NOR be echoed back in the response body.
    const outboundHeadersLeakSecret = fetchSpy.mock.calls.some((call) => {
      const init = call[1] as RequestInit | undefined;
      const headers = JSON.stringify(init?.headers ?? {});
      return headers.includes(ATTACKER_SECRET_VALUE);
    });
    expect(outboundHeadersLeakSecret, "attacker-chosen secret must not reach outbound headers").toBe(false);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(ATTACKER_SECRET_VALUE);
    expect(serialized).not.toContain("X-Attacker-Header");
  });
});

describe("AC-A-001d — unknown operation is controlled", () => {
  it("an unknown operation yields FUFIRE_OPERATION_NOT_ALLOWED (not an outbound fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await request(app)
      .post("/api/data-requests/fufire/test-run")
      .set(...bearer(token()))
      .send({
        operation: "definitely-not-an-operation",
        requestedOperations: ["definitely-not-an-operation"],
        input: { manualLat: 52.52, manualLon: 13.405, manualTimezone: "Europe/Berlin" },
      });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);

    const serialized = JSON.stringify(res.body);
    expect(serialized).toContain("FUFIRE_OPERATION_NOT_ALLOWED");

    const fetchedAnything = fetchSpy.mock.calls.length;
    expect(fetchedAnything, "no outbound call for an unknown operation").toBe(0);
  });
});

describe("AC-A-001e — stale sensitive classifier entry for /fufire/* removed", () => {
  it("the dead /^\\/fufire(\\/.*)?$/ entry is gone from SENSITIVE_API_ROUTES", async () => {
    // Source-level guard: the classifier table must not carry a dangling sensitive
    // route once the proxy is removed (must not silently weaken default-deny).
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(process.cwd(), "server/middleware/auth.ts"), "utf8");
    expect(
      src.includes("/^\\/fufire(\\/.*)?$/"),
      "remove or repoint the dead /fufire/* sensitive classifier entry (AC-A-001e)",
    ).toBe(false);
  });
});
