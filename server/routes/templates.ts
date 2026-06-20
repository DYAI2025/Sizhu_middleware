/**
 * server-template-config-store, Slice-1 — CRUD routes (REQ-002).
 *
 * Mounts the `/api/v1/templates` CRUD surface onto an Express app, backed by a
 * shared {@link TemplateStoreService}. All routes sit BELOW the `/api` apiGuard
 * (default-deny session), and the WRITE routes additionally require the
 * `templates:write` capability scope via {@link requireScope}.
 *
 * Wiring contract (P1 — composition root): the store is INJECTED by createApp,
 * so a single shared instance serves every request (read-after-write works) and
 * tests can drive it on an in-memory repo double with no Supabase / network.
 */
import type { Express, Request, Response } from "express";
import { requireScope } from "../middleware/auth";
import {
  TemplateStoreService,
  TemplateValidationError,
  type Actor,
} from "../services/templateStoreService";
import type { PromptTemplate } from "../../src/types";

const TEMPLATES_WRITE_SCOPE = "templates:write";

/** Resolve the mutating actor from the verified token (req.auth). */
function actorFromRequest(req: Request): Actor {
  return {
    email: req.auth?.email ?? "",
    tokenSub: req.auth?.sub ?? "",
  };
}

/**
 * Register the template CRUD routes on `app`. Must be called AFTER
 * `app.use("/api", apiGuard)` so every route inherits default-deny session auth.
 */
export function registerTemplateRoutes(
  app: Express,
  store: TemplateStoreService,
): void {
  // GET list — session only (read).
  app.get("/api/v1/templates", async (_req: Request, res: Response) => {
    const templates = await store.list();
    res.status(200).json(templates);
  });

  // GET one — session only (read). 404 when absent.
  app.get("/api/v1/templates/:id", async (req: Request, res: Response) => {
    const template = await store.get(req.params.id);
    if (!template) {
      return res
        .status(404)
        .json({ error_code: "TEMPLATE_NOT_FOUND", message: "Template not found." });
    }
    res.status(200).json(template);
  });

  // POST upsert — write-gated. Invalid body → 422 (TemplateValidationError),
  // never a fake save.
  app.post(
    "/api/v1/templates",
    requireScope(TEMPLATES_WRITE_SCOPE),
    async (req: Request, res: Response) => {
      const candidate = req.body as PromptTemplate;
      try {
        const saved = await store.saveTemplate(
          candidate,
          actorFromRequest(req),
          new Date().toISOString(),
        );
        res.status(200).json(saved);
      } catch (err) {
        if (err instanceof TemplateValidationError) {
          return res
            .status(422)
            .json({ error_code: err.code, message: err.message, issues: err.issues });
        }
        throw err;
      }
    },
  );

  // POST set-active / deactivate — write-gated. Body { active: boolean }.
  app.post(
    "/api/v1/templates/:id/active",
    requireScope(TEMPLATES_WRITE_SCOPE),
    async (req: Request, res: Response) => {
      const active = req.body?.active;
      if (typeof active !== "boolean") {
        return res.status(400).json({
          error_code: "INVALID_REQUEST",
          message: "Body must include a boolean `active` field.",
        });
      }
      await store.setActive(
        req.params.id,
        active,
        actorFromRequest(req),
        new Date().toISOString(),
      );
      res.status(200).json({ ok: true, id: req.params.id, active });
    },
  );
}
