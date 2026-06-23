/**
 * Settings data API (feat/supabase-data-layer — the SETTINGS data vertical).
 *
 * Mounts the `/api/v1/settings/*` read/write surface onto an Express app, backed by
 * a server-side `SettingsRepository` (the service-role `SupabaseSettingsRepository`
 * in prod). All routes sit BELOW the `/api` apiGuard, so they inherit default-deny
 * SESSION auth (valid token + verified email). Settings CRUD is `session`-class,
 * NOT `sensitive` — deliberately left off the SENSITIVE_API_ROUTES allowlist
 * (it mirrors products).
 *
 * Wiring contract (P1 — composition root): the repo is INJECTED, so a single shared
 * instance serves every request and tests can drive it on an in-memory double with
 * no Supabase / network.
 *
 * Four config groups:
 *   GET/POST /api/v1/settings/gen-configs       → GenerationConfig[]   (array)
 *   GET/POST /api/v1/settings/quality-configs   → QualityGateConfig[]  (array)
 *   GET/POST /api/v1/settings/personalization   → PersonalizationApiConfig (single)
 *   GET/POST /api/v1/settings/pod               → PodProviderConfig (single)
 *
 * Fail loud: on a repo throw the route returns 500 with a generic message and the
 * raw boundary detail kept server-side — never a fabricated empty config.
 */
import type { Express, Request, Response } from "express";
import type { SettingsRepository } from "../../src/lib/repositories/interfaces";
import type {
  GenerationConfig,
  QualityGateConfig,
  PersonalizationApiConfig,
  PodProviderConfig,
} from "../../src/lib/domain/models";

const STORE_ERROR = "SETTINGS_STORE_ERROR";
const INVALID_REQUEST = "INVALID_REQUEST";

/** Standard 500 body — the raw boundary detail stays in the server logs only. */
function storeError(res: Response, action: string): Response {
  return res.status(500).json({
    error_code: STORE_ERROR,
    message: `Failed to ${action}. See server logs for detail.`,
  });
}

/** Register the settings data routes on `app`. Must be called AFTER apiGuard. */
export function registerSettingsRoutes(
  app: Express,
  repo: SettingsRepository,
): void {
  // ── generation_configs (array) ─────────────────────────────────────────────
  app.get("/api/v1/settings/gen-configs", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getGenConfigs());
    } catch (err) {
      console.error("[settings] getGenConfigs failed:", (err as Error)?.message);
      storeError(res, "load generation configs");
    }
  });

  app.post("/api/v1/settings/gen-configs", async (req: Request, res: Response) => {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        error_code: INVALID_REQUEST,
        message: "Body must be an array of generation configs.",
      });
    }
    try {
      await repo.saveGenConfigs(req.body as GenerationConfig[]);
      res.status(200).json({ ok: true, count: req.body.length });
    } catch (err) {
      console.error("[settings] saveGenConfigs failed:", (err as Error)?.message);
      storeError(res, "save generation configs");
    }
  });

  // ── quality_gate_configs (array) ───────────────────────────────────────────
  app.get("/api/v1/settings/quality-configs", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getQualityConfigs());
    } catch (err) {
      console.error("[settings] getQualityConfigs failed:", (err as Error)?.message);
      storeError(res, "load quality configs");
    }
  });

  app.post("/api/v1/settings/quality-configs", async (req: Request, res: Response) => {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        error_code: INVALID_REQUEST,
        message: "Body must be an array of quality gate configs.",
      });
    }
    try {
      await repo.saveQualityConfigs(req.body as QualityGateConfig[]);
      res.status(200).json({ ok: true, count: req.body.length });
    } catch (err) {
      console.error("[settings] saveQualityConfigs failed:", (err as Error)?.message);
      storeError(res, "save quality configs");
    }
  });

  // ── personalization_api_configs (single config) ────────────────────────────
  app.get("/api/v1/settings/personalization", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getPersonalizationConfig());
    } catch (err) {
      console.error(
        "[settings] getPersonalizationConfig failed:",
        (err as Error)?.message,
      );
      storeError(res, "load personalization config");
    }
  });

  app.post("/api/v1/settings/personalization", async (req: Request, res: Response) => {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        error_code: INVALID_REQUEST,
        message: "Body must be a personalization config object.",
      });
    }
    try {
      await repo.savePersonalizationConfig(req.body as unknown as PersonalizationApiConfig);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(
        "[settings] savePersonalizationConfig failed:",
        (err as Error)?.message,
      );
      storeError(res, "save personalization config");
    }
  });

  // ── pod_provider_configs (single config) ───────────────────────────────────
  app.get("/api/v1/settings/pod", async (_req: Request, res: Response) => {
    try {
      res.status(200).json(await repo.getPodConfig());
    } catch (err) {
      console.error("[settings] getPodConfig failed:", (err as Error)?.message);
      storeError(res, "load pod config");
    }
  });

  app.post("/api/v1/settings/pod", async (req: Request, res: Response) => {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        error_code: INVALID_REQUEST,
        message: "Body must be a pod provider config object.",
      });
    }
    try {
      await repo.savePodConfig(req.body as unknown as PodProviderConfig);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[settings] savePodConfig failed:", (err as Error)?.message);
      storeError(res, "save pod config");
    }
  });
}

/** A non-null, non-array plain object (a single config payload). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
