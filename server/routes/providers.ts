/**
 * Providers data API (feat/supabase-data-layer — the PROVIDERS data vertical,
 * mirrors the Products reference `routes/products.ts`).
 *
 * Mounts the `/api/v1/providers` read/write/health-check surface onto an Express
 * app, backed by a server-side `ProviderRepository` (the service-role
 * `SupabaseProviderRepository` in prod). All routes sit BELOW the `/api` apiGuard,
 * so they inherit default-deny SESSION auth (valid token + verified email).
 * Providers CRUD is `session`-class, NOT `sensitive` — it is deliberately left off
 * the SENSITIVE_API_ROUTES allowlist.
 *
 * Wiring contract (P1 — composition root): the repo is INJECTED by createApp, so a
 * single shared instance serves every request and tests can drive it on an
 * in-memory double with no Supabase / network.
 */
import type { Express, Request, Response } from "express";
import type { ProviderRepository } from "../../src/lib/repositories/interfaces";
import type { ApiProvider } from "../../src/lib/domain/models";

/**
 * Register the provider data routes on `app`. Must be called AFTER
 * `app.use("/api", apiGuard)` so every route inherits default-deny session auth.
 */
export function registerProviderRoutes(
  app: Express,
  repo: ProviderRepository,
): void {
  // GET list — session only (read). Fails loud (500) if the repo throws, never a
  // fabricated empty array.
  app.get("/api/v1/providers", async (_req: Request, res: Response) => {
    try {
      const providers = await repo.getProviders();
      res.status(200).json(providers);
    } catch (err) {
      // Keep the detail server-side; the message can embed boundary/RLS context.
      console.error("[providers] getProviders failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "PROVIDER_STORE_ERROR",
        message: "Failed to load providers. See server logs for detail.",
      });
    }
  });

  // POST upsert (single) — session only (write). Body must be a single provider
  // object (the contract is saveProvider(provider), not a bulk array).
  app.post("/api/v1/providers", async (req: Request, res: Response) => {
    const body = req.body;
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: "Body must be a single provider object.",
      });
    }
    try {
      await repo.saveProvider(body as ApiProvider);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[providers] saveProvider failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "PROVIDER_STORE_ERROR",
        message: "Failed to save provider. See server logs for detail.",
      });
    }
  });

  // POST health-check — session only. Returns the computed provider status. The
  // repo NEVER fabricates LIVE; an unknown provider id yields ERROR (truthful).
  app.post(
    "/api/v1/providers/:id/health-check",
    async (req: Request, res: Response) => {
      const providerId = req.params.id;
      try {
        const status = await repo.performHealthCheck(providerId);
        res.status(200).json({ status });
      } catch (err) {
        console.error(
          "[providers] performHealthCheck failed:",
          (err as Error)?.message,
        );
        res.status(500).json({
          error_code: "PROVIDER_STORE_ERROR",
          message: "Failed to perform health check. See server logs for detail.",
        });
      }
    },
  );
}
