/**
 * Roles / RBAC data API (feat/supabase-data-layer — the ROLES/RBAC vertical).
 *
 * Mounts the `/api/v1/roles` read/write surface onto an Express app, backed by a
 * server-side `RoleRepository` (the service-role `SupabaseRoleRepository` in prod).
 * All routes sit BELOW the `/api` apiGuard, so they inherit at minimum default-deny
 * SESSION auth (valid token + verified email).
 *
 * Auth classes (deliberate split, unlike the all-session Products vertical):
 *   - READS  (roles, permissions, role-permissions, users, active-role GETs) are
 *     `session`-class — any verified session may inspect the RBAC matrix.
 *   - WRITES (role-permissions POST, users POST, active-role POST) are PRIVILEGED:
 *     mutating the permission matrix / user roster / acting role is an admin action,
 *     so these three POST paths are added to `SENSITIVE_API_ROUTES` in
 *     server/middleware/auth.ts (session + admin role + MFA). This route module
 *     does NOT re-implement that gate — the single `apiGuard` enforces it from the
 *     classification; the patterns live in one place (P9: the gate is verified at
 *     its real enforcement site, the apiGuard, and asserted by roles.routes.test).
 *
 * Wiring contract (P1 — composition root): the repo is INJECTED by the caller, so a
 * single shared instance serves every request and tests can drive it on an
 * in-memory double with no Supabase / network.
 */
import type { Express, Request, Response } from "express";
import type { RoleRepository } from "../../src/lib/repositories/interfaces";
import type { AppRoleName, AppUser, RolePermissions } from "../../src/types";

/** The valid acting-role values (mirrors src/types.ts `AppRoleName`). */
const VALID_ROLE_NAMES: readonly AppRoleName[] = ["Owner", "Admin", "Observer", "Custom"];

function isValidRoleName(value: unknown): value is AppRoleName {
  return typeof value === "string" && (VALID_ROLE_NAMES as readonly string[]).includes(value);
}

/** Standard 500 body for a failed RBAC store call (boundary detail stays server-side). */
function storeError(res: Response, op: string, err: unknown): void {
  console.error(`[roles] ${op} failed:`, (err as Error)?.message);
  res.status(500).json({
    error_code: "ROLE_STORE_ERROR",
    message: `Failed to ${op}. See server logs for detail.`,
  });
}

/**
 * Register the RBAC data routes on `app`. Must be called AFTER
 * `app.use("/api", apiGuard)` so every route inherits default-deny session auth,
 * and the three write routes inherit the admin+MFA gate from SENSITIVE_API_ROUTES.
 */
export function registerRoleRoutes(app: Express, repo: RoleRepository): void {
  // ── Reads (session) ─────────────────────────────────────────────────────────

  app.get("/api/v1/roles", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getRoles());
    } catch (err) {
      storeError(res, "load roles", err);
    }
  });

  app.get("/api/v1/roles/permissions", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getPermissions());
    } catch (err) {
      storeError(res, "load permissions", err);
    }
  });

  app.get("/api/v1/roles/role-permissions", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getRolePermissions());
    } catch (err) {
      storeError(res, "load role permissions", err);
    }
  });

  app.get("/api/v1/roles/users", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getUsers());
    } catch (err) {
      storeError(res, "load users", err);
    }
  });

  app.get("/api/v1/roles/active-role", async (_req: Request, res: Response) => {
    try {
      const role = await repo.getActiveRole();
      res.status(200).json({ role });
    } catch (err) {
      storeError(res, "load active role", err);
    }
  });

  // ── Writes (sensitive: admin + MFA, via SENSITIVE_API_ROUTES) ────────────────

  // POST role-permissions — body must be a RolePermissions[] array.
  app.post("/api/v1/roles/role-permissions", async (req: Request, res: Response) => {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: "Body must be an array of role-permission bindings.",
      });
    }
    try {
      await repo.saveRolePermissions(body as RolePermissions[]);
      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      storeError(res, "save role permissions", err);
    }
  });

  // POST users — body must be an AppUser[] array.
  app.post("/api/v1/roles/users", async (req: Request, res: Response) => {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: "Body must be an array of users.",
      });
    }
    try {
      await repo.saveUsers(body as AppUser[]);
      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      storeError(res, "save users", err);
    }
  });

  // POST active-role — body must be `{ role: AppRoleName }`.
  app.post("/api/v1/roles/active-role", async (req: Request, res: Response) => {
    const role = (req.body as { role?: unknown })?.role;
    if (!isValidRoleName(role)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: `Body must be { role } where role is one of: ${VALID_ROLE_NAMES.join(", ")}.`,
      });
    }
    try {
      await repo.setActiveRole(role);
      res.status(200).json({ ok: true, role });
    } catch (err) {
      storeError(res, "set active role", err);
    }
  });
}
