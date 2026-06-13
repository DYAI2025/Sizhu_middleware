import express, { type Express } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import { FuFireDataService } from "./services/fufireDataService";
import { PodDispatchService } from "./services/podDispatchService";
import {
  sanitizeTestRunBody,
  validateRequestedOperations,
} from "./services/fufireOperations";
import { apiGuard } from "./middleware/auth";
import { getAppMode } from "../src/lib/app/appMode";

dotenv.config();

/**
 * Build the Express application with all API routes and the server-side auth
 * layer wired in. Static/SPA serving and the Vite dev middleware are added
 * separately in {@link startServer} so this factory stays import-safe for tests.
 */
export function createApp(): Express {
  const app = express();
  const PORT = Number(process.env.PORT || 8080);

  app.use(express.json());

  // CORS Configuration
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://sizhu.fufire.space,http://localhost:5173,http://localhost:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          if (process.env.NODE_ENV === "production") {
            callback(new Error("Not allowed by CORS"));
          } else {
            callback(null, true);
          }
        }
      },
    }),
  );

  // ---------------------------------------------------------------------------
  // Public health endpoint. Registered BEFORE apiGuard so it stays open.
  // ---------------------------------------------------------------------------
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ---------------------------------------------------------------------------
  // Default-deny gate. Every /api route below requires (at minimum) a valid
  // Supabase session; sensitive routes additionally require admin role + MFA.
  // ---------------------------------------------------------------------------
  app.use("/api", apiGuard);

  // --- Protected read routes (valid session required) ------------------------

  app.get("/api/readiness", (_req, res) => {
    // Readiness never returns READY just because mock mode works.
    const fuFireSecretRef =
      process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
    const supabaseSecretRef =
      process.env.SUPABASE_SERVICE_ROLE_SECRET_REF ||
      "SECRET_REF_SUPABASE_SERVICE_ROLE";

    const requiredEnvVars = [
      fuFireSecretRef,
      supabaseSecretRef,
      "FUFIRE_BASE_URL",
      "SUPABASE_URL",
    ];
    const missing = requiredEnvVars.filter((v) => !process.env[v]);

    if (missing.length === 0) {
      res.json({ status: "READY" });
    } else {
      res.status(503).json({ status: "NOT_READY", missing });
    }
  });

  // Non-secret configuration snapshot. Never returns secret VALUES, only refs.
  //
  // AC-D-001d (audit note N5): the reported appMode is resolved through the SINGLE
  // real source of truth — getAppMode() — not a hardcoded "CONFIG_REQUIRED" default
  // that drifted from the app's DEMO_LOCAL default (commit 4980ee9). This removes the
  // demo-mode-leakage surface where the console showed one mode while the running
  // pipeline behaved as another. getAppMode() itself fails closed: the unset default is
  // an explicit, mock-permitted DEMO_LOCAL — never an implicit production mode.
  app.get("/api/config/*", (_req, res) => {
    res.json({
      status: "OK",
      appMode: getAppMode(),
      authRequired: (process.env.AUTH_REQUIRED || "true").toLowerCase() === "true",
      mfaRequired:
        (process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS || "true").toLowerCase() ===
        "true",
    });
  });

  // Report whether secret references are PRESENT — never echo their values.
  app.get("/api/secret-references/status", (_req, res) => {
    const refs = [
      process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY",
      process.env.SUPABASE_SERVICE_ROLE_SECRET_REF ||
        "SECRET_REF_SUPABASE_SERVICE_ROLE",
    ];
    res.json({
      status: "OK",
      references: refs.map((ref) => ({ ref, present: Boolean(process.env[ref]) })),
    });
  });

  app.get("/api/gateway-issues", (_req, res) => {
    res.json({ status: "OK", issues: [] });
  });

  app.get("/api/workflows/*", (_req, res) => {
    res.json({ status: "OK", workflows: [] });
  });

  // --- Sensitive routes (session + admin role + MFA) -------------------------

  const fufireDataService = new FuFireDataService();

  app.post("/api/data-requests/fufire/test-run", async (req, res) => {
    try {
      // REQ-A-001 / AC-A-001d: only server-owned operations may be executed.
      // An unknown/disallowed operation is rejected up front, before any
      // outbound work, with a controlled error.
      const opCheck = validateRequestedOperations(req.body);
      if (!opCheck.ok) {
        return res.status(400).json({
          ok: false,
          error_code: "FUFIRE_OPERATION_NOT_ALLOWED",
          message: `Operation(s) not allowed: ${opCheck.disallowed.join(", ")}`,
          disallowedOperations: opCheck.disallowed,
          retryable: false,
        });
      }

      // REQ-A-001 / AC-A-001b: strip every body-controlled steering field
      // (fuFireConfig / fufirePath / baseUrl / apiKeySecretRef / authHeaderName)
      // so the request body can never influence the outbound URL, header, or
      // which secret env var is read — nor be echoed back in the response.
      const safeBody = sanitizeTestRunBody(req.body);

      const result = await fufireDataService.executeTestRun(safeBody);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error_code: "INTERNAL_SERVER_ERROR",
        message: err.message,
        retryable: false,
      });
    }
  });

  const podDispatchService = new PodDispatchService();

  // Fulfillment readiness is a protected read (no role/MFA escalation).
  app.get("/api/fulfillment/readiness", (_req, res) => {
    const mode = process.env.POD_DISPATCH_MODE;
    if (!mode || mode === "disabled") {
      return res.status(503).json({
        status: "NOT_READY",
        reason: "POD dispatch is currently disabled via configuration.",
      });
    }
    if (!process.env.SECRET_REF_GELATO_API_KEY) {
      return res
        .status(503)
        .json({ status: "NOT_READY", reason: "Missing POD credentials." });
    }
    res.json({ status: "READY" });
  });

  app.post("/api/fulfillment/pod/validate-dispatch", async (req, res) => {
    const { workflowRunId, artifact } = req.body;
    if (!workflowRunId || !artifact) {
      return res.status(400).json({ ok: false, error_code: "INVALID_REQUEST" });
    }
    res.json({ ok: true, status: "READY_FOR_DISPATCH" });
  });

  app.post("/api/fulfillment/pod/dispatch", async (req, res) => {
    try {
      const { workflowRunId, input, artifact } = req.body;
      const result = await podDispatchService.dispatchArtifact(
        workflowRunId,
        input,
        artifact,
      );
      if (!result.ok) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error_code: "INTERNAL_SERVER_ERROR",
        message: err.message,
        retryable: false,
      });
    }
  });

  // Secret-reference verification is sensitive: it confirms whether a secret is
  // wired up but NEVER returns the secret value.
  app.post("/api/secret-references/check", (req, res) => {
    const ref: string | undefined = req.body?.ref;
    if (!ref || typeof ref !== "string") {
      return res.status(400).json({ ok: false, error_code: "INVALID_REQUEST" });
    }
    res.json({ ok: true, ref, present: Boolean(process.env[ref]) });
  });

  // ---------------------------------------------------------------------------
  // REQ-A-001: the arbitrary, body-controlled FuFire proxy (`POST /api/fufire/*`)
  // has been REMOVED, not re-authed. It previously read `fuFireConfig.baseUrl`,
  // `fuFireConfig.apiKeySecretRef`, and `fufirePath` from the request body and
  // fetched that attacker-chosen URL with the FuFire secret (SSRF /
  // config-bypass). The only legitimate FuFire operation path is
  // `POST /api/data-requests/fufire/test-run`, which resolves baseUrl / path /
  // header / secret exclusively from server config/env. Any `POST /api/fufire/*`
  // request now falls through to the default-deny / not-found behavior.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // CORS error handler. In production an unallowed origin causes the cors()
  // middleware to call back with an Error; without this handler Express would
  // surface that as an unhandled 500 with a stack trace (AC-O-001c). Convert it
  // into a controlled 403 instead.
  // ---------------------------------------------------------------------------
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err && err.message === "Not allowed by CORS") {
        return res
          .status(403)
          .json({ status: "FORBIDDEN", error_code: "CORS_ORIGIN_NOT_ALLOWED" });
      }
      return next(err);
    },
  );

  return app;
}

export async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT || 3000);

  // Vite middleware for development / static serving for production.
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // eslint-disable-next-line no-undef
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Boot when run as the entrypoint (tsx dev / bundled prod), but never under the
// test runner, which imports `createApp` directly.
if (process.env.VITEST !== "true") {
  startServer();
}
