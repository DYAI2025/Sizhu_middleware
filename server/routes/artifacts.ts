/**
 * Artifacts data API (feat/supabase-data-layer — mirrors `routes/products.ts`).
 *
 * Mounts the `/api/v1/artifacts` read/write surface onto an Express app, backed by
 * a server-side `ArtifactRepository` (the service-role `SupabaseArtifactRepository`
 * in prod). All routes sit BELOW the `/api` apiGuard, so they inherit default-deny
 * SESSION auth (valid token + verified email). Artifacts CRUD is `session`-class,
 * NOT `sensitive` — it is deliberately left off the SENSITIVE_API_ROUTES allowlist.
 *
 * Wiring contract (P1 — composition root): the repo is INJECTED by createApp, so a
 * single shared instance serves every request and tests can drive it on an
 * in-memory double with no Supabase / network.
 */
import type { Express, Request, Response } from "express";
import type { ArtifactRepository } from "../../src/lib/repositories/interfaces";
import type { ImageArtifact } from "../../src/types";

/**
 * Register the artifact data routes on `app`. Must be called AFTER
 * `app.use("/api", apiGuard)` so every route inherits default-deny session auth.
 */
export function registerArtifactRoutes(
  app: Express,
  repo: ArtifactRepository,
): void {
  // GET list — session only (read). Fails loud (500) if the repo throws, never a
  // fabricated empty array.
  app.get("/api/v1/artifacts", async (_req: Request, res: Response) => {
    try {
      const artifacts = await repo.getImageArtifacts();
      res.status(200).json(artifacts);
    } catch (err) {
      // Keep the detail server-side; the message can embed boundary/RLS context.
      console.error("[artifacts] getImageArtifacts failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "ARTIFACT_STORE_ERROR",
        message: "Failed to load artifacts. See server logs for detail.",
      });
    }
  });

  // POST upsert (bulk) — session only (write). Body must be an ImageArtifact[] array.
  app.post("/api/v1/artifacts", async (req: Request, res: Response) => {
    const body = req.body;
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error_code: "INVALID_REQUEST",
        message: "Body must be an array of artifacts.",
      });
    }
    try {
      await repo.saveImageArtifacts(body as ImageArtifact[]);
      res.status(200).json({ ok: true, count: body.length });
    } catch (err) {
      console.error("[artifacts] saveImageArtifacts failed:", (err as Error)?.message);
      res.status(500).json({
        error_code: "ARTIFACT_STORE_ERROR",
        message: "Failed to save artifacts. See server logs for detail.",
      });
    }
  });
}
