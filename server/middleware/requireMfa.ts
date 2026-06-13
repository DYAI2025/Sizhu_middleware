import type { Request, Response, NextFunction } from "express";
import { checkMfa, isAuthRequired, sendAuthError } from "./auth";

/**
 * requireMfa — express middleware that enforces a verified second factor (aal2)
 * for sensitive actions when MFA_REQUIRED_FOR_SENSITIVE_ACTIONS is enabled.
 * Must run after {@link requireAuth} so `req.auth` is populated.
 *
 * Rejection: 403 MFA_REQUIRED_FOR_ACTION.
 */
export function requireMfa(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) {
    return next();
  }
  const result = checkMfa(req);
  if (!result.ok) {
    return sendAuthError(res, result.error);
  }
  return next();
}

export default requireMfa;
