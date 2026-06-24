import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isSupabaseNotConfigured,
  getPersistenceStatus,
} from "../lib/app/persistenceStatus";
import {
  SupabaseNotConfiguredError,
  SUPABASE_NOT_CONFIGURED,
} from "../lib/repositories/errors";

/**
 * fix/persistence-offline-ux — unit spec for the load-bearing persistence-status
 * helpers that turn the (previously SWALLOWED) fail-closed boundary error into a
 * mode-aware, actionable UI state. The repo has no @testing-library/react, so we
 * test the pure helpers, not the component render.
 *
 * RED-on-revert: if `isSupabaseNotConfigured` drops its `.code` branch, the plain
 * `{ code: "SUPABASE_NOT_CONFIGURED" }` case below goes RED — proving the helper
 * still recognises the boundary error across the module/instanceof seam.
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

describe("isSupabaseNotConfigured — robust across the module/instanceof boundary", () => {
  it("true for a real SupabaseNotConfiguredError instance", () => {
    expect(isSupabaseNotConfigured(new SupabaseNotConfiguredError())).toBe(true);
  });

  it("true for a plain object carrying the SUPABASE_NOT_CONFIGURED code (instanceof-free)", () => {
    // This is the RED-on-revert anchor: a structurally-cloned / re-thrown copy
    // loses its prototype, so only the `.code` branch can recognise it.
    expect(isSupabaseNotConfigured({ code: SUPABASE_NOT_CONFIGURED })).toBe(true);
    expect(isSupabaseNotConfigured({ code: "SUPABASE_NOT_CONFIGURED" })).toBe(true);
  });

  it("false for a generic Error (and for other thrown values)", () => {
    expect(isSupabaseNotConfigured(new Error("boom"))).toBe(false);
    expect(isSupabaseNotConfigured({ code: "SOMETHING_ELSE" })).toBe(false);
    expect(isSupabaseNotConfigured(null)).toBe(false);
    expect(isSupabaseNotConfigured(undefined)).toBe(false);
    expect(isSupabaseNotConfigured("SUPABASE_NOT_CONFIGURED")).toBe(false);
  });
});

describe("getPersistenceStatus — mode-aware, actionable", () => {
  it("DEMO_LOCAL: canPersist true with no reason (the only mock-permitted mode)", () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    const status = getPersistenceStatus();
    expect(status.mode).toBe("DEMO_LOCAL");
    expect(status.canPersist).toBe(true);
    expect(status.reason).toBe("");
  });

  it("CONFIG_REQUIRED: canPersist false with a non-empty, actionable reason", () => {
    process.env.APP_MODE = "CONFIG_REQUIRED";
    const status = getPersistenceStatus();
    expect(status.mode).toBe("CONFIG_REQUIRED");
    expect(status.canPersist).toBe(false);
    expect(status.reason.length).toBeGreaterThan(0);
    // Actionable: names the mode and points the operator at a fix.
    expect(status.reason).toContain("CONFIG_REQUIRED");
    expect(status.reason).toContain("SUPABASE_READY");
  });

  it("SUPABASE_READY / PRODUCTION: canPersist true (real data layer), no reason", () => {
    // The data layer routes these modes through the server /api onto live Supabase,
    // so persistence is genuinely available — CONFIG_REQUIRED is the only offline mode.
    for (const mode of ["SUPABASE_READY", "PRODUCTION"]) {
      process.env.APP_MODE = mode;
      const status = getPersistenceStatus();
      expect(status.mode).toBe(mode);
      expect(status.canPersist).toBe(true);
      expect(status.reason).toBe("");
    }
  });
});
