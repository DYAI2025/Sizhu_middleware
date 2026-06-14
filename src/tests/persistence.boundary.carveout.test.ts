import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SupabaseProviderRepository,
  SupabaseRoleRepository,
  SupabaseProductRepository,
  SupabaseWorkflowRepository,
  SupabaseSettingsRepository,
} from "../lib/repositories/supabaseRepository.stub";
import { SUPABASE_NOT_CONFIGURED } from "../lib/repositories/errors";

/**
 * FP3 — T6 persistence boundary closure (REQ-D-001 / AC-D-001a carve-out).
 *
 * Companion to the tester-authored `persistence.boundary.test.ts` (which must NOT
 * be edited). That file proves the THROWING repos (products / workflows /
 * settings) raise SUPABASE_NOT_CONFIGURED outside DEMO_LOCAL. It does NOT cover
 * the two DELIBERATE non-throwing carve-out reads. This file pins them so they
 * can never drift to a privileged role or a LIVE status:
 *
 *  - `RoleRepository.getActiveRole()` is a UX-mirror read that fails SAFE to the
 *    LOWEST-privilege role ('Observer'); it must never return Owner/Admin.
 *  - `ProviderRepository.performHealthCheck()` is a UX-mirror read that fails SAFE
 *    to a NON-LIVE / non-success status ('LIVE_DISABLED'); it must never return
 *    'LIVE'.
 *
 * Real authorization is enforced SERVER-SIDE (apiGuard + role/MFA); these
 * client-side mirrors are intentionally fail-safe, not security boundaries.
 *
 * Evidence class: pure-logic on the real stub (no mode env / no network needed —
 * these stubs return the fail-safe value regardless of mode).
 */

const MODE_ENV = ["APP_MODE", "VITE_APP_MODE"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of MODE_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of MODE_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

// The privileged roles the carve-out read must NEVER drift into.
const PRIVILEGED_ROLES = ["Owner", "Admin"] as const;
// The success/LIVE statuses the health-check carve-out must NEVER drift into.
const LIVE_OR_SUCCESS_STATUSES = ["LIVE", "CONFIGURED"] as const;

describe("FP3 — getActiveRole() carve-out fails safe to lowest privilege", () => {
  for (const mode of ["PRODUCTION", "CONFIG_REQUIRED", "SUPABASE_READY", "PRODUCTION_NOT_READY"]) {
    it(`mode=${mode}: returns the lowest-privilege role 'Observer' (never a privileged role)`, async () => {
      process.env.APP_MODE = mode;
      const role = await new SupabaseRoleRepository().getActiveRole();
      expect(role).toBe("Observer");
      expect(PRIVILEGED_ROLES).not.toContain(role as (typeof PRIVILEGED_ROLES)[number]);
    });
  }
});

describe("FP3 — performHealthCheck() carve-out fails safe to a non-LIVE/non-success status", () => {
  for (const mode of ["PRODUCTION", "CONFIG_REQUIRED", "SUPABASE_READY", "PRODUCTION_NOT_READY"]) {
    it(`mode=${mode}: returns a non-LIVE status 'LIVE_DISABLED' (never 'LIVE')`, async () => {
      process.env.APP_MODE = mode;
      const status = await new SupabaseProviderRepository().performHealthCheck();
      expect(status).toBe("LIVE_DISABLED");
      expect(LIVE_OR_SUCCESS_STATUSES).not.toContain(
        status as (typeof LIVE_OR_SUCCESS_STATUSES)[number],
      );
    });
  }
});

describe("FP3 — the THROWING repos still raise SUPABASE_NOT_CONFIGURED (carve-out is narrow)", () => {
  it("products / workflows / settings reads all reject with the explicit code", async () => {
    process.env.APP_MODE = "PRODUCTION";
    await expect(new SupabaseProductRepository().getProducts()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
    await expect(new SupabaseWorkflowRepository().getWorkflowRuns()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
    await expect(
      new SupabaseSettingsRepository().getPodConfig(),
    ).rejects.toMatchObject({ code: SUPABASE_NOT_CONFIGURED });
  });

  it("role-MUTATING ops (setActiveRole / saveRolePermissions) still throw — only the READ is carved out", async () => {
    process.env.APP_MODE = "PRODUCTION";
    const repo = new SupabaseRoleRepository();
    await expect(repo.setActiveRole()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
    await expect(repo.saveRolePermissions()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
  });

  it("provider-MUTATING op (saveProvider) still throws — only the health-check READ is carved out", async () => {
    process.env.APP_MODE = "PRODUCTION";
    await expect(new SupabaseProviderRepository().saveProvider()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
  });
});
