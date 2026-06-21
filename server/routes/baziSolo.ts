/**
 * BaZi-solo routes (ST-8) — the production entry point for the no-mock vertical.
 * Mounted from createApp AFTER `app.use("/api", apiGuard)`, so both routes are
 * session-protected by default-deny (valid token + verified email). They are NOT
 * money/dispatch routes, so they stay at session level (not in SENSITIVE_API_ROUTES).
 */
import type { Express, Request, Response } from "express";
import {
  runBaziSoloPipeline,
  type BaZiSoloStore,
  type BaziSoloPipelineDeps,
} from "../services/baziSoloPipeline";
import type { FuFireDataServiceLike, SimulatedOrder } from "../services/baziSoloRunService";

export interface BaziSoloRouteDeps {
  fufire: FuFireDataServiceLike;
  store: BaZiSoloStore;
  generateRunId?: BaziSoloPipelineDeps["generateRunId"];
  fontPath?: string;
  templateId?: string;
  /** Injected clock for the persisted createdAt (never Date.now()). */
  now?: () => string;
}

function isValidOrder(body: unknown): body is SimulatedOrder {
  if (typeof body !== "object" || body === null) return false;
  const o = body as Record<string, unknown>;
  return typeof o.orderId === "string" && o.orderId.length > 0 && typeof o.birthDate === "string" && o.birthDate.length > 0;
}

export function registerBaziSoloRoutes(app: Express, deps: BaziSoloRouteDeps): void {
  app.post("/api/v1/bazi-solo/runs", async (req: Request, res: Response) => {
    if (!isValidOrder(req.body)) {
      res.status(400).json({ error_code: "INVALID_ORDER", message: "orderId and birthDate are required" });
      return;
    }
    try {
      const summary = await runBaziSoloPipeline(req.body, {
        fufire: deps.fufire,
        store: deps.store,
        generateRunId: deps.generateRunId,
        fontPath: deps.fontPath,
        templateId: deps.templateId,
        now: deps.now?.(),
      });
      res.status(200).json(summary);
    } catch (err) {
      // Fail loud, never a fake success.
      res.status(502).json({
        error_code: "BAZI_SOLO_PIPELINE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/v1/bazi-solo/runs/:id", async (req: Request, res: Response) => {
    const record = await deps.store.getRun(req.params.id);
    if (!record) {
      res.status(404).json({ error_code: "RUN_NOT_FOUND" });
      return;
    }
    res.status(200).json(record);
  });
}
