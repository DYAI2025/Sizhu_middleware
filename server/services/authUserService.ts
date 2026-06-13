import { verifyJwtHS256, JwtVerificationError, JwtPayload } from "../lib/jwt";

/**
 * authUserService
 *
 * Turns a raw Supabase access token into a verified {@link AuthUser}. Role
 * resolution for the MVP is backed by ADMIN_EMAIL_ALLOWLIST; the same surface
 * can later be backed by an `admin_users` table without changing callers.
 *
 * Security notes:
 * - The Supabase JWT secret and service-role key never leave the server.
 * - This module never logs token contents, the JWT secret or any secret value.
 */

export type AdminRole = "owner" | "admin" | "operator" | "viewer";

export interface AuthUser {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** Authenticator assurance level, e.g. "aal1" | "aal2". */
  aal: string;
  /** Resolved application role, or null for non-admin authenticated users. */
  role: AdminRole | null;
}

export class AuthTokenError extends Error {
  constructor(message = "Invalid authentication token.") {
    super(message);
    this.name = "AuthTokenError";
  }
}

/** Roles that are permitted to reach admin/operator surfaces. */
const ADMIN_ROLES: ReadonlySet<AdminRole> = new Set<AdminRole>([
  "owner",
  "admin",
  "operator",
]);

export function isAdminRole(role: AdminRole | null | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role);
}

/** Parse a comma-separated allowlist into a normalized lowercase set. */
export function getAdminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST || "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Resolve the application role for an email. For the MVP, any allowlisted email
 * is granted `owner`; everyone else gets no admin role.
 */
export function resolveRole(email: string | null | undefined): AdminRole | null {
  if (!email) return null;
  const allowlist = getAdminAllowlist();
  if (allowlist.has(email.trim().toLowerCase())) {
    return "owner";
  }
  return null;
}

/** Extract a bearer token from an Authorization header value. */
export function extractBearerToken(
  authorizationHeader: string | undefined | null,
): string | null {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function deriveEmailVerified(payload: JwtPayload): boolean {
  if (payload.email_confirmed_at) return true;
  if (payload.email_verified === true) return true;
  const meta = payload.user_metadata as Record<string, unknown> | undefined;
  if (meta && meta.email_verified === true) return true;
  const appMeta = payload.app_metadata as Record<string, unknown> | undefined;
  if (appMeta && appMeta.email_verified === true) return true;
  return false;
}

/**
 * Verify a Supabase access token and map it to an {@link AuthUser}.
 * Throws {@link AuthTokenError} when the token is missing, malformed, expired
 * or signed with the wrong secret.
 */
export function verifyAccessToken(token: string | null): AuthUser {
  if (!token) {
    throw new AuthTokenError("Missing access token.");
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    // Without a verification secret we cannot trust any token. Fail closed.
    throw new AuthTokenError("Token verification is not configured.");
  }

  let payload: JwtPayload;
  try {
    payload = verifyJwtHS256(token, secret);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      throw new AuthTokenError(err.message);
    }
    throw new AuthTokenError();
  }

  if (!payload.sub) {
    throw new AuthTokenError("Token is missing a subject.");
  }

  const email = typeof payload.email === "string" ? payload.email : null;

  return {
    sub: payload.sub,
    email,
    emailVerified: deriveEmailVerified(payload),
    aal: typeof payload.aal === "string" ? payload.aal : "aal1",
    role: resolveRole(email),
  };
}
