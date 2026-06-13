import crypto from "crypto";

/**
 * Dependency-free HS256 JWT helpers.
 *
 * Supabase signs user access tokens with the project's JWT secret using the
 * HS256 algorithm. We verify those tokens locally (no network round-trip and no
 * service-role key required) by recomputing the HMAC signature.
 *
 * NOTE: This file never logs token contents or the signing secret.
 */

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const padLength = (4 - (input.length % 4)) % 4;
  const normalized =
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return Buffer.from(normalized, "base64");
}

export interface JwtPayload {
  sub?: string;
  email?: string;
  aal?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  aud?: string | string[];
  role?: string;
  email_confirmed_at?: string | null;
  email_verified?: boolean;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  amr?: Array<{ method?: string; timestamp?: number }>;
  [key: string]: unknown;
}

/** Sign a payload with HS256. Primarily used by tests and tooling. */
export function signJwtHS256(
  payload: JwtPayload,
  secret: string,
  header: Record<string, unknown> = {},
): string {
  const fullHeader = { alg: "HS256", typ: "JWT", ...header };
  const encodedHeader = base64UrlEncode(JSON.stringify(fullHeader));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export class JwtVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

/**
 * Verify an HS256 JWT and return its decoded payload. Throws
 * {@link JwtVerificationError} on any structural, signature or expiry problem.
 */
export function verifyJwtHS256(token: string, secret: string): JwtPayload {
  if (!token || typeof token !== "string") {
    throw new JwtVerificationError("Token missing.");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtVerificationError("Malformed token.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
  } catch {
    throw new JwtVerificationError("Unreadable token header.");
  }
  if (header.alg !== "HS256") {
    // Reject anything we are not prepared to verify (incl. "none").
    throw new JwtVerificationError("Unsupported token algorithm.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const providedSignature = base64UrlDecode(encodedSignature);

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new JwtVerificationError("Invalid token signature.");
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new JwtVerificationError("Unreadable token payload.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now >= payload.exp) {
    throw new JwtVerificationError("Token expired.");
  }
  if (typeof payload.nbf === "number" && now < payload.nbf) {
    throw new JwtVerificationError("Token not yet valid.");
  }

  return payload;
}
