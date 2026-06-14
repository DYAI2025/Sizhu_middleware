import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { signJwtHS256, verifyJwtHS256, JwtVerificationError } from "../lib/jwt";

/**
 * FX6 — mutation-hardening for server/lib/jwt.ts (the SECURITY FLOOR: local HS256
 * verification of Supabase access tokens). The Stryker spike scored this module at
 * 52.75% — the auth route tests exercise jwt through the HTTP layer but never pin
 * the internals: alg≠HS256 rejection, signature mismatch, exp/nbf claims, the
 * structural guards, and every error message. A weak verifier is a silent auth
 * bypass surface, so these assertions are written to KILL those survivors.
 *
 * Mutation oracle: re-running `npx stryker run` (mutate: server/lib/jwt.ts) with
 * this file present must raise the score well above the 52.75% baseline.
 */

const SECRET = "test-jwt-secret-DO-NOT-LOG";
const OTHER_SECRET = "a-different-secret";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/** Forge a token with a chosen header + payload + a VALID HMAC signature (so the
 *  signature gate passes and later gates — alg / payload-parse — are reached). */
function forgeSigned(headerObj: unknown, payloadRaw: string, secret = SECRET): string {
  const signingInput = `${b64url(JSON.stringify(headerObj))}.${Buffer.from(payloadRaw, "utf8").toString("base64url")}`;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest().toString("base64url");
  return `${signingInput}.${sig}`;
}

describe("FX6 jwt — round-trip", () => {
  it("sign then verify returns the original claims", () => {
    const token = signJwtHS256({ sub: "u1", email: "a@b.c", aal: "aal2" }, SECRET);
    const payload = verifyJwtHS256(token, SECRET);
    expect(payload.sub).toBe("u1");
    expect(payload.email).toBe("a@b.c");
    expect(payload.aal).toBe("aal2");
  });

  it("the signed header declares alg HS256 (kills the header-default literal)", () => {
    const token = signJwtHS256({ sub: "u1" }, SECRET);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  it("base64url round-trips payloads of varying length (kills the padding arithmetic)", () => {
    for (const sub of ["a", "ab", "abc", "abcd", "abcde", "x".repeat(40)]) {
      const token = signJwtHS256({ sub }, SECRET);
      expect(verifyJwtHS256(token, SECRET).sub).toBe(sub);
    }
  });
});

describe("FX6 jwt — signature + algorithm (the bypass surface)", () => {
  it("rejects a token signed with a different secret", () => {
    const token = signJwtHS256({ sub: "u1" }, OTHER_SECRET);
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Invalid token signature/);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signJwtHS256({ sub: "u1", aal: "aal1" }, SECRET);
    const [h, , s] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "u1", aal: "aal2" }), "utf8").toString("base64url");
    expect(() => verifyJwtHS256(`${h}.${forgedPayload}.${s}`, SECRET)).toThrow(/Invalid token signature/);
  });

  // CRITICAL — alg-confusion / "none" attack: a token whose header says alg:"none"
  // (or RS256) must be rejected BEFORE any signature/claim processing.
  it('rejects alg:"none" even with an otherwise-valid HMAC signature', () => {
    const token = forgeSigned({ alg: "none", typ: "JWT" }, JSON.stringify({ sub: "u1" }));
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Unsupported token algorithm/);
  });

  it('rejects alg:"RS256"', () => {
    const token = forgeSigned({ alg: "RS256", typ: "JWT" }, JSON.stringify({ sub: "u1" }));
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Unsupported token algorithm/);
  });
});

describe("FX6 jwt — structural guards + exact messages", () => {
  it("missing/empty token → Token missing", () => {
    expect(() => verifyJwtHS256("", SECRET)).toThrow(/Token missing/);
    // exercise the non-string guard (cast — runtime guard, not a compile concern)
    expect(() => verifyJwtHS256(null as unknown as string, SECRET)).toThrow(/Token missing/);
  });

  it("wrong number of segments → Malformed token", () => {
    expect(() => verifyJwtHS256("only.two", SECRET)).toThrow(/Malformed token/);
    expect(() => verifyJwtHS256("a.b.c.d", SECRET)).toThrow(/Malformed token/);
  });

  it("unreadable header → Unreadable token header", () => {
    // header decodes to non-JSON; header parse happens before signature.
    const token = `${b64url("not-json")}.${b64url("{}")}.sig`;
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Unreadable token header/);
  });

  it("unreadable payload (valid header + valid signature) → Unreadable token payload", () => {
    const token = forgeSigned({ alg: "HS256", typ: "JWT" }, "not-json");
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Unreadable token payload/);
  });

  it("JwtVerificationError carries its name", () => {
    try {
      verifyJwtHS256("only.two", SECRET);
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(JwtVerificationError);
      expect((e as Error).name).toBe("JwtVerificationError");
    }
  });
});

describe("FX6 jwt — exp / nbf claims", () => {
  const now = Math.floor(Date.now() / 1000);

  it("expired token (exp in the past) → Token expired", () => {
    const token = signJwtHS256({ sub: "u1", exp: now - 60 }, SECRET);
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Token expired/);
  });

  it("token with a future exp verifies", () => {
    const token = signJwtHS256({ sub: "u1", exp: now + 3600 }, SECRET);
    expect(verifyJwtHS256(token, SECRET).sub).toBe("u1");
  });

  it("no exp claim → not treated as expired (typeof guard)", () => {
    const token = signJwtHS256({ sub: "u1" }, SECRET);
    expect(verifyJwtHS256(token, SECRET).sub).toBe("u1");
  });

  it("nbf in the future → Token not yet valid", () => {
    const token = signJwtHS256({ sub: "u1", nbf: now + 3600 }, SECRET);
    expect(() => verifyJwtHS256(token, SECRET)).toThrow(/Token not yet valid/);
  });

  it("nbf in the past verifies", () => {
    const token = signJwtHS256({ sub: "u1", nbf: now - 3600 }, SECRET);
    expect(verifyJwtHS256(token, SECRET).sub).toBe("u1");
  });
});
