/**
 * Workflows data API (feat/supabase-data-layer — WORKFLOWS vertical, mirrors Products).
 * Mounts /api/v1/workflow-runs, /workflow-logs, /visual-workflows below the /api apiGuard
 * (session-class). The WorkflowRepository is INJECTED by createApp (P1). Fail-loud (500)
 * on a repo error — never a fabricated empty.
 */
import type { Express, Request, Response } from "express";
import type { WorkflowRepository } from "../../src/lib/repositories/interfaces";
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../../src/lib/domain/models";

function fail(res: Response, where: string, err: unknown): void {
  console.error(`[workflows] ${where} failed:`, (err as Error)?.message);
  res.status(500).json({ error_code: "WORKFLOW_STORE_ERROR", message: `Failed: ${where}. See server logs.` });
}

export function registerWorkflowRoutes(app: Express, repo: WorkflowRepository): void {
  // --- workflow runs ---
  app.get("/api/v1/workflow-runs", async (_req: Request, res: Response) => {
    try { res.status(200).json(await repo.getWorkflowRuns()); } catch (e) { fail(res, "getWorkflowRuns", e); }
  });
  app.post("/api/v1/workflow-runs", async (req: Request, res: Response) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error_code: "INVALID_REQUEST", message: "Body must be a WorkflowRun[]." });
    try { await repo.saveWorkflowRuns(req.body as WorkflowRun[]); res.status(200).json({ ok: true, count: req.body.length }); }
    catch (e) { fail(res, "saveWorkflowRuns", e); }
  });

  // --- workflow logs ---
  app.get("/api/v1/workflow-logs", async (_req: Request, res: Response) => {
    try { res.status(200).json(await repo.getWorkflowLogs()); } catch (e) { fail(res, "getWorkflowLogs", e); }
  });
  app.post("/api/v1/workflow-logs", async (req: Request, res: Response) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error_code: "INVALID_REQUEST", message: "Body must be a WorkflowLog[]." });
    try { await repo.saveWorkflowLogs(req.body as WorkflowLog[]); res.status(200).json({ ok: true, count: req.body.length }); }
    catch (e) { fail(res, "saveWorkflowLogs", e); }
  });

  // --- visual workflows ---
  app.get("/api/v1/visual-workflows", async (_req: Request, res: Response) => {
    try { res.status(200).json(await repo.getVisualWorkflows()); } catch (e) { fail(res, "getVisualWorkflows", e); }
  });
  app.get("/api/v1/visual-workflows/:productId", async (req: Request, res: Response) => {
    try { res.status(200).json(await repo.getVisualWorkflow(req.params.productId)); } catch (e) { fail(res, "getVisualWorkflow", e); }
  });
  app.post("/api/v1/visual-workflows/:productId", async (req: Request, res: Response) => {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      return res.status(400).json({ error_code: "INVALID_REQUEST", message: "Body must be a VisualWorkflow object." });
    }
    try { await repo.saveVisualWorkflow(req.params.productId, req.body as VisualWorkflow); res.status(200).json({ ok: true }); }
    catch (e) { fail(res, "saveVisualWorkflow", e); }
  });
}
