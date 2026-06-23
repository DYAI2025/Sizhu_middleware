import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAppMode } from "../lib/app/appMode";
import {
  SupabaseProductRepository,
  SupabaseWorkflowRepository,
  SupabaseSettingsRepository,
} from "../lib/repositories/supabaseRepository.stub";
import type { ProductRepository } from "../lib/repositories/interfaces";
import { SUPABASE_NOT_CONFIGURED } from "../lib/repositories/errors";

/**
 * REQ-D-001 (AC-D-001a, AC-D-001b, AC-D-001d) — Supabase production persistence boundary.
 *
 * Canvas decision: NO real persistence this run. Production / non-DEMO_LOCAL mode must
 * NEVER silently fall back to mock/localStorage; the persistence boundary returns/raises
 * an explicit SUPABASE_NOT_CONFIGURED error. DEMO_LOCAL stays the ONLY mock-permitted mode.
 *
 * Kritische semantische Glättung — REQ-D-001 (BOUNDARY: persistence side effects):
 *   These:      "The non-DEMO repo throws; that proves it doesn't persist."
 *   Gegenthese: A vague 'offline' string lets a caller treat the failure as a transient
 *               outage and silently retry against localStorage, or a misbuild swaps in a
 *               Local* repo outside DEMO_LOCAL. Tests that only assert "throws" never catch
 *               the silent-mock leak. Value (never fake production persistence) dies quietly.
 *   Schärfung:  Assert the surfaced error carries the explicit, machine-readable code
 *               SUPABASE_NOT_CONFIGURED (not a vague message); assert the facade returns the
 *               Supabase stub — never a Local* repo or the local runner — outside DEMO_LOCAL;
 *               and pin the mode decision at the REAL getAppMode() source so a re-implemented
 *               check can't drift past it.
 */

const MODE_ENV = ["APP_MODE", "VITE_APP_MODE"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of MODE_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});
afterEach(() => {
  for (const k of MODE_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("AC-D-001a — non-DEMO_LOCAL persistence boundary surfaces SUPABASE_NOT_CONFIGURED", () => {
  it("exposes a stable machine-readable code constant", () => {
    expect(SUPABASE_NOT_CONFIGURED).toBe("SUPABASE_NOT_CONFIGURED");
  });

  it("read rejects with an error carrying the SUPABASE_NOT_CONFIGURED code (not a vague message)", async () => {
    const repo = new SupabaseProductRepository();
    await expect(repo.getProducts()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
  });

  it("write rejects with an error whose message contains SUPABASE_NOT_CONFIGURED", async () => {
    // Typed against the declared contract so we exercise the real saveProducts signature.
    const repo: ProductRepository = new SupabaseProductRepository();
    await expect(repo.saveProducts([])).rejects.toThrow(/SUPABASE_NOT_CONFIGURED/);
  });

  it("workflow + settings stubs all carry the explicit code", async () => {
    await expect(new SupabaseWorkflowRepository().getWorkflowRuns()).rejects.toMatchObject({
      code: SUPABASE_NOT_CONFIGURED,
    });
    await expect(
      new SupabaseSettingsRepository().getPersonalizationConfig(),
    ).rejects.toMatchObject({ code: SUPABASE_NOT_CONFIGURED });
  });
});

describe("AC-D-001b — facade never returns Local* repos (or local runner) outside DEMO_LOCAL", () => {
  // Drive the REAL facade through the REAL getAppMode() source.
  async function freshFacade() {
    vi.resetModules();
    const mod = await import("../lib/app/appServices");
    return mod.appServices;
  }

  it("DEMO_LOCAL: facade reports DEMO_LOCAL and serves local repos (the only mock-permitted mode)", async () => {
    process.env.APP_MODE = "DEMO_LOCAL";
    expect(getAppMode()).toBe("DEMO_LOCAL");
    const facade = await freshFacade();
    expect(facade.getMode()).toBe("DEMO_LOCAL");
    // Local repos resolve without throwing the offline error.
    await expect(facade.products.getProducts()).resolves.toBeDefined();
  });

  for (const mode of ["PRODUCTION", "CONFIG_REQUIRED", "SUPABASE_READY", "PRODUCTION_NOT_READY"]) {
    // feat/supabase-data-layer: the Products domain is the FIRST vertical to move
    // to the real server-side architecture. Outside DEMO_LOCAL `facade.products`
    // is now the ApiProductRepository (routes through the SERVER data API, behind
    // apiGuard) — NOT the throwing Supabase stub. The boundary INVARIANT this loop
    // protects is unchanged: outside DEMO_LOCAL the repo is NEVER a Local* repo and
    // it FAILS LOUD (it throws PRODUCT_API_ERROR with no session token here — never
    // a silent localStorage fallback / empty array). Only the error CODE differs
    // now that Products has a real path; SUPABASE_NOT_CONFIGURED still gates every
    // not-yet-migrated domain (workflowRunner below, settings/workflows above).
    it(`mode=${mode}: products repo is the ApiProductRepository (fails loud, never a silent Local fallback)`, async () => {
      process.env.APP_MODE = mode;
      const facade = await freshFacade();
      expect(facade.getMode()).not.toBe("DEMO_LOCAL");
      // Fails loud (throws) rather than returning a silent mock/localStorage array.
      await expect(facade.products.getProducts()).rejects.toMatchObject({
        code: "PRODUCT_API_ERROR",
      });
      // And it is NOT a Local* repo (the silent-mock-leak this loop guards against).
      expect(facade.products.constructor.name).toBe("ApiProductRepository");
    });

    it(`mode=${mode}: workflowRunner.run rejects with SUPABASE_NOT_CONFIGURED (no local mock pipeline)`, async () => {
      process.env.APP_MODE = mode;
      const facade = await freshFacade();
      await expect((facade.workflowRunner as any).run({})).rejects.toThrow(
        /SUPABASE_NOT_CONFIGURED/,
      );
    });
  }
});

describe("AC-D-001d — mode boundary read from the real getAppMode source (no re-implemented check)", () => {
  it("facade.getMode() is backed by getAppMode() (single source of truth)", async () => {
    process.env.APP_MODE = "PRODUCTION";
    vi.resetModules();
    const appModeMod = await import("../lib/app/appMode");
    const spy = vi.spyOn(appModeMod, "getAppMode");
    const facade = (await import("../lib/app/appServices")).appServices;
    facade.getMode();
    // The facade must delegate to the real resolver, not a local copy.
    expect(spy).toHaveBeenCalled();
  });
});
