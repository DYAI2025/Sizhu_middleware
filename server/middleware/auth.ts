import type { Request, Response, NextFunction } from "express";
import {
  AuthUser,
  AuthTokenError,
  extractBearerToken,
  verifyAccessToken,
} from "../services/authUserService";

/**
 * Central auth wiring for the SIZHU middleware.
 *
 * This module owns:
 * - feature flags (AUTH_REQUIRED, MFA_REQUIRED_FOR_SENSITIVE_ACTIONS)
 * - the canonical error response bodies
 * - route classification (public / session / sensitive)
 * - the `apiGuard` middleware that enforces default-deny on every /api route
 *
 * Flags are read at request time (not import time) so deployments and tests can
 * toggle them without re-importing modules.
 */

export type RouteClass = "public" | "session" | "sensitive";

export interface AuthContext extends AuthUser {}

// Augment Express's Request so `req.auth` is typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function flagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

/** Whether authentication is enforced. Defaults to enabled (fail closed). */
export function isAuthRequired(): boolean {
  return flagEnabled(process.env.AUTH_REQUIRED, true);
}

/** Whether sensitive actions require a verified second factor (aal2). */
export function isMfaRequired(): boolean {
  return flagEnabled(process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS, true);
}

/**
 * Whether template-write capability requires the `templates:write` scope on the
 * token (OQ-DESIGN-1). Defaults to enabled (fail closed).
 *
 * Documented fallback: a deployment that cannot yet mint scoped Supabase tokens
 * may set TEMPLATE_WRITE_REQUIRE_SCOPE=false to downgrade `requireScope` to an
 * admin-role-only check (still no MFA). This is an EXPLICIT, env-gated downgrade
 * — never a silent bypass — and is covered by a test.
 */
export function isTemplateWriteScopeRequired(): boolean {
  return flagEnabled(process.env.TEMPLATE_WRITE_REQUIRE_SCOPE, true);
}

// ---------------------------------------------------------------------------
// Canonical error responses
// ---------------------------------------------------------------------------

export interface AuthErrorBody {
  status: string;
  color: string;
  error_code: string;
  message: string;
}

export const AuthErrors = {
  authRequired(): { http: number; body: AuthErrorBody } {
    return {
      http: 401,
      body: {
        status: "UNAUTHORIZED",
        color: "red",
        error_code: "AUTH_REQUIRED",
        message: "Login required.",
      },
    };
  },
  invalidToken(): { http: number; body: AuthErrorBody } {
    return {
      http: 401,
      body: {
        status: "UNAUTHORIZED",
        color: "red",
        error_code: "INVALID_AUTH_TOKEN",
        message: "Your session token is invalid or expired. Please log in again.",
      },
    };
  },
  emailVerificationRequired(): { http: number; body: AuthErrorBody } {
    return {
      http: 403,
      body: {
        status: "FORBIDDEN",
        color: "red",
        error_code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Please verify your email address before accessing the admin console.",
      },
    };
  },
  adminRoleRequired(): { http: number; body: AuthErrorBody } {
    return {
      http: 403,
      body: {
        status: "FORBIDDEN",
        color: "red",
        error_code: "ADMIN_ROLE_REQUIRED",
        message: "Admin role required.",
      },
    };
  },
  mfaRequired(): { http: number; body: AuthErrorBody } {
    return {
      http: 403,
      body: {
        status: "MFA_REQUIRED",
        color: "blue",
        error_code: "MFA_REQUIRED_FOR_ACTION",
        message: "This action requires a verified second factor.",
      },
    };
  },
  missingScope(scope: string): { http: number; body: AuthErrorBody } {
    return {
      http: 403,
      body: {
        status: "FORBIDDEN",
        color: "red",
        error_code: "MISSING_SCOPE",
        message: `This action requires the "${scope}" capability.`,
      },
    };
  },
};

export function sendAuthError(
  res: Response,
  error: { http: number; body: AuthErrorBody },
): void {
  res.status(error.http).json(error.body);
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/** Routes reachable without any authentication. */
const PUBLIC_API_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^\/health\/?$/ },
];

/**
 * Sensitive actions: valid session + verified email + admin role + (aal2 when
 * MFA is enabled). Patterns are matched against the path *after* the `/api`
 * mount point.
 */
const SENSITIVE_API_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/data-requests\/fufire\/test-run\/?$/ },
  // NOTE: the legacy POST /fufire/* sensitive entry was removed with the
  // arbitrary FuFire proxy (REQ-A-001 / AC-A-001e). It pointed at a route that
  // no longer exists. Default-deny is unchanged: any unlisted route still
  // classifies as `session`.
  { method: "POST", pattern: /^\/model-gateway(\/.*)?$/ },
  { method: "POST", pattern: /^\/workflows\/[^/]+\/generate\/?$/ },
  { method: "POST", pattern: /^\/workflows\/[^/]+\/quality-gate-1\/?$/ },
  { method: "POST", pattern: /^\/workflows\/[^/]+\/quality-gate-2\/?$/ },
  { method: "POST", pattern: /^\/workflows\/[^/]+\/approve-final-artifact\/?$/ },
  { method: "POST", pattern: /^\/workflows\/[^/]+\/run\/?$/ },
  { method: "POST", pattern: /^\/fulfillment\/pod\/validate-dispatch\/?$/ },
  { method: "POST", pattern: /^\/fulfillment\/pod\/dispatch\/?$/ },
  { method: "POST", pattern: /^\/config(\/.*)?$/ },
  { method: "POST", pattern: /^\/secret-references\/check\/?$/ },
];

/** Normalize the path used for classification (strip query, trailing slash). */
function normalizePath(apiPath: string): string {
  const withoutQuery = apiPath.split("?")[0];
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/**
 * Classify an API request. `apiPath` is the path relative to the `/api` mount
 * (e.g. "/readiness", "/fulfillment/pod/dispatch").
 *
 * Default-deny: anything not explicitly public or sensitive still requires a
 * valid session. New routes are therefore protected automatically.
 */
export function classifyApiRoute(method: string, apiPath: string): RouteClass {
  const upperMethod = method.toUpperCase();
  const path = normalizePath(apiPath);

  for (const route of PUBLIC_API_ROUTES) {
    if (route.method === upperMethod && route.pattern.test(path)) {
      return "public";
    }
  }
  for (const route of SENSITIVE_API_ROUTES) {
    if (route.method === upperMethod && route.pattern.test(path)) {
      return "sensitive";
    }
  }
  return "session";
}

// ---------------------------------------------------------------------------
// Core checks (shared by apiGuard and the standalone middlewares)
// ---------------------------------------------------------------------------

export interface CheckResult {
  ok: boolean;
  error?: { http: number; body: AuthErrorBody };
}

/**
 * Verify the bearer token and attach `req.auth`. Enforces a valid token and a
 * verified email. Returns a structured failure instead of writing the response,
 * so callers can decide ordering.
 */
export function authenticateRequest(req: Request): CheckResult {
  const token = extractBearerToken(req.headers["authorization"] as string | undefined);
  if (!token) {
    return { ok: false, error: AuthErrors.authRequired() };
  }
  let user: AuthUser;
  try {
    user = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof AuthTokenError) {
      return { ok: false, error: AuthErrors.invalidToken() };
    }
    return { ok: false, error: AuthErrors.invalidToken() };
  }
  req.auth = user;
  if (!user.emailVerified) {
    return { ok: false, error: AuthErrors.emailVerificationRequired() };
  }
  return { ok: true };
}

export function checkAdminRole(req: Request): CheckResult {
  const role = req.auth?.role ?? null;
  const isAdmin = role === "owner" || role === "admin" || role === "operator";
  if (!isAdmin) {
    return { ok: false, error: AuthErrors.adminRoleRequired() };
  }
  return { ok: true };
}

export function checkMfa(req: Request): CheckResult {
  if (!isMfaRequired()) {
    return { ok: true };
  }
  if (req.auth?.aal !== "aal2") {
    return { ok: false, error: AuthErrors.mfaRequired() };
  }
  return { ok: true };
}

/**
 * Verify the authenticated user carries a named capability scope. Honors the
 * TEMPLATE_WRITE_REQUIRE_SCOPE downgrade for `templates:write` only (the
 * scope this slice introduces); any other scope is always enforced.
 */
export function checkScope(req: Request, scope: string): CheckResult {
  if (scope === "templates:write" && !isTemplateWriteScopeRequired()) {
    return { ok: true };
  }
  const scopes = req.auth?.scopes ?? [];
  if (!scopes.includes(scope)) {
    return { ok: false, error: AuthErrors.missingScope(scope) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// apiGuard: single default-deny gate mounted on /api
// ---------------------------------------------------------------------------

/**
 * Enforces the full policy for every `/api` request based on its classification.
 * Mounted via `app.use("/api", apiGuard)` BEFORE the API route handlers.
 */
export function apiGuard(req: Request, res: Response, next: NextFunction): void {
  // req.path here is relative to the /api mount point.
  const routeClass = classifyApiRoute(req.method, req.path);

  if (routeClass === "public") {
    return next();
  }

  // When auth is disabled we still attach context if a valid token is present,
  // but we do not block. This is an explicit, logged-in-dev escape hatch.
  if (!isAuthRequired()) {
    const token = extractBearerToken(req.headers["authorization"] as string | undefined);
    if (token) {
      try {
        req.auth = verifyAccessToken(token);
      } catch {
        /* ignore in disabled mode */
      }
    }
    return next();
  }

  const auth = authenticateRequest(req);
  if (!auth.ok && auth.error) {
    return sendAuthError(res, auth.error);
  }

  if (routeClass === "sensitive") {
    const role = checkAdminRole(req);
    if (!role.ok && role.error) {
      return sendAuthError(res, role.error);
    }
    const mfa = checkMfa(req);
    if (!mfa.ok && mfa.error) {
      return sendAuthError(res, mfa.error);
    }
  }

  return next();
}

// ---------------------------------------------------------------------------
// requireScope: capability/scope gate (REQ-006 / OQ-DESIGN-1)
// ---------------------------------------------------------------------------

/**
 * Express middleware enforcing a capability scope for an admin action.
 *
 * Policy (deliberately distinct from `sensitive`): valid session + verified
 * email + admin role + the named scope, but **NO aal2/MFA** — per the user's
 * decision that template writes are scope-gated, not MFA-gated. For the
 * `templates:write` scope, TEMPLATE_WRITE_REQUIRE_SCOPE=false downgrades the
 * scope requirement to admin-role-only (documented fallback, see
 * {@link isTemplateWriteScopeRequired}); the session + email + role checks still
 * apply.
 *
 * Self-sufficient: it runs the auth chain itself so it is correct even if mounted
 * standalone. When `apiGuard` has already attached `req.auth`, re-verification is
 * cheap (local HMAC, no network) and idempotent.
 */
export function requireScope(scope: string) {
  return function requireScopeMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!isAuthRequired()) {
      // Mirror apiGuard's escape hatch: attach context if present, don't block.
      const auth = authenticateRequest(req);
      void auth;
      return next();
    }

    const auth = authenticateRequest(req);
    if (!auth.ok && auth.error) {
      return sendAuthError(res, auth.error);
    }

    const role = checkAdminRole(req);
    if (!role.ok && role.error) {
      return sendAuthError(res, role.error);
    }

    // Note: no MFA/aal2 check here by design.

    const scopeCheck = checkScope(req, scope);
    if (!scopeCheck.ok && scopeCheck.error) {
      return sendAuthError(res, scopeCheck.error);
    }

    return next();
  };
}
