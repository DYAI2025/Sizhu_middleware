import type { Request, Response, NextFunction } from "express";
import { checkAdminRole, isAuthRequired, sendAuthError } from "./auth";

/**
 * requireRole — express middleware that enforces an admin-capable role
 * (owner/admin/operator). Must run after {@link requireAuth} so `req.auth` is
 * populated.
 *
 * Rejection: 403 ADMIN_ROLE_REQUIRED.
 */
export function requireRole(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthRequired()) {
    return next();
  }
  const result = checkAdminRole(req);
  if (!result.ok) {
    return sendAuthError(res, result.error);
  }
  return next();
}

export default requireRole;
