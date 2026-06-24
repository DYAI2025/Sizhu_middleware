/**
 * Products data API (feat/supabase-data-layer — the FIRST data-domain vertical).
 *
 * Mounts the `/api/v1/products` read/write surface onto an Express app, backed by
 * a server-side `ProductRepository` (the service-role `SupabaseProductRepository`
 * in prod). All routes sit BELOW the `/api` apiGuard, so they inherit default-deny
 * SESSION auth (valid token + verified email). Products CRUD is `session`-class,
 * NOT `sensitive` — it is deliberately left off the SENSITIVE_API_ROUTES allowlist.
 *
 * Wiring contract (P1 — composition root): the repo is INJECTED by createApp, so a
 * single shared instance serves every request and tests can drive it on an
 * in-memory double with no Supabase / network.
 */
import type { Express, Request, Response } from "express";
import type { ProductRepository } from "../../src/lib/repositories/interfaces";
import type { Product } from "../../src/lib/domain/models";

/**
 * Register the product data routes on `app`. Must be called AFTER
 * `app.use("/api", apiGuard)` so every route inherits default-deny session auth.
 */
export function registerProductRoutes(
  app: Express,
  repo: ProductRepository,
): void {
  // GET list — session only (read). Fails loud (500) if the repo throws, never a
  // fabricated empty array.
  app.get("/api/v1/products", async (_req: Request, res: Response) => {
    try {
      const products = await repo.getProducts();
      res.status(200).json(products);
    } catch (err) {
      // Keep the detail server-side; the message can embed boundary/RLS context.
      console.error("[products] getProducts failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "PRODUCT_STORE_ERROR",
        message: "Failed to load products. See server logs for detail.",
      });
    }
  });

  // POST upsert (bulk) — session only (write). Body must be a Product[] array.
  app.post("/api/v1/products", async (req: Request, res: Response) => {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: "Body must be an array of products.",
      });
    }
    try {
      await repo.saveProducts(body as Product[]);
      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      console.error("[products] saveProducts failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "PRODUCT_STORE_ERROR",
        message: "Failed to save products. See server logs for detail.",
      });
    }
  });
}
