import type { Request, Response, NextFunction } from "express";
import {
  authenticateRequest,
  isAuthRequired,
  sendAuthError,
} from "./auth";
import { extractBearerToken, verifyAccessToken } from "../services/authUserService";

/**
 * requireAuth — express middleware that enforces a valid Supabase session and a
 * verified email. Attaches `req.auth`.
 *
 * Rejections:
 * - 401 AUTH_REQUIRED        — missing Authorization header
 * - 401 INVALID_AUTH_TOKEN   — malformed / expired / wrong-secret token
 * - 403 EMAIL_VERIFICATION_REQUIRED — verified token but unconfirmed email
 *
 * When AUTH_REQUIRED is not "true" the middleware attaches context best-effort
 * and allows the request through.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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

  const result = authenticateRequest(req);
  if (!result.ok) {
    return sendAuthError(res, result.error);
  }
  return next();
}

export default requireAuth;
