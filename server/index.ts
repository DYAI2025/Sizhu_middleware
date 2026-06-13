import express, { type Express } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";
import { FuFireDataService } from "./services/fufireDataService";
import { PodDispatchService } from "./services/podDispatchService";
import { apiGuard } from "./middleware/auth";

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
  app.get("/api/config/*", (_req, res) => {
    res.json({
      status: "OK",
      appMode: process.env.APP_MODE || "CONFIG_REQUIRED",
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
      const result = await fufireDataService.executeTestRun(req.body);
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

  app.post("/api/fufire/*", async (req, res) => {
    try {
      const { fuFireConfig, fufirePath, body } = req.body;

      const apiKey =
        process.env[fuFireConfig.apiKeySecretRef] || process.env.FUFIRE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "NO_FUFIRE_API_KEY_CONFIGURED" });
      }
      if (!fuFireConfig.baseUrl) {
        return res.status(500).json({ error: "NO_FUFIRE_BASE_URL_CONFIGURED" });
      }
      if (!fuFireConfig.enabled) {
        return res.status(500).json({ error: "FUFIRE_ENDPOINT_DISABLED" });
      }

      const fufireUrl = `${fuFireConfig.baseUrl.replace(/\/$/, "")}${fufirePath}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        fuFireConfig.timeoutMs || 10000,
      );

      try {
        const response = await fetch(fufireUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            return res.status(response.status).json({ error: "FUFIRE_UNAUTHORIZED" });
          }
          if (response.status === 429) {
            return res.status(response.status).json({ error: "FUFIRE_RATE_LIMITED" });
          }
          let errorText = "FUFIRE_INVALID_RESPONSE";
          if (fufirePath.includes("chronometry")) errorText = "FUFIRE_CHRONOMETRY_FAILED";
          else if (fufirePath.includes("wuxing")) errorText = "FUFIRE_WUXING_FAILED";
          else if (fufirePath.includes("bazi")) errorText = "FUFIRE_BAZI_FAILED";

          return res
            .status(response.status)
            .json({ error: errorText, details: await response.text() });
        }

        const data = await response.json();
        return res.json(data);
      } catch (fetchError: any) {
        if (fetchError.name === "AbortError") {
          return res.status(504).json({ error: "FUFIRE_TIMEOUT" });
        }
        throw fetchError;
      }
    } catch (err: any) {
      console.error("FuFire server boundary error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
    }
  });

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
