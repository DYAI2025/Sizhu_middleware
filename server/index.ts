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
import { runWorkflow, RunWorkflowInput } from "./services/workflowRunService";
import { appServices } from "../src/lib/app/appServices";
import { WorkflowStateMachine } from "../src/lib/workflow/stateMachine";
import type { WorkflowRun, ImageArtifact } from "../src/types";

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

  // POST /api/workflows/:id/run — run the full generate→QA pipeline
  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      const { orderNumber, productId, customerName, birthDate, birthTime, birthTimeKnown, birthPlace } = req.body;

      if (!orderNumber || !productId || !customerName || !birthDate || !birthPlace) {
        return res.status(400).json({ ok: false, error_code: "INVALID_REQUEST", message: "Missing required fields: orderNumber, productId, customerName, birthDate, birthPlace" });
      }

      const input: RunWorkflowInput = {
        orderNumber,
        productId,
        customerName,
        birthDate,
        birthTime: birthTimeKnown ? birthTime || "12:00" : "",
        birthTimeKnown: birthTimeKnown === true,
        birthPlace,
      };

      const result = await runWorkflow(input);
      res.json(result);
    } catch (err: any) {
      // Keep the detail server-side: err.message can embed a third-party (OpenRouter)
      // response string. Do NOT relay it verbatim to the client (sec review I-2).
      console.error(`[workflows/run] run failed for order ${req.params?.id}:`, err?.message);
      res.status(500).json({
        ok: false,
        error_code: "INTERNAL_SERVER_ERROR",
        message: "Workflow run failed. See server logs for detail.",
        retryable: false,
      });
    }
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

  // REQ-001 (sizhu-agent-safe-ops) — THE load-bearing money gate.
  //
  // dispatchArtifact is real-money POD work. Before ANY dispatch work runs, the
  // request must present a server-side approval record that:
  //   • exists, is unexpired, is still `unused`,
  //   • carries the exact minted nonce (a forged/missing nonce fails closed), and
  //   • is BOUND to this (workflowRunId, artifactId) — the RECORD decides, never a
  //     caller-supplied body field like `artifact.status` (BLOCKER-3).
  //
  // appServices.approvals is the SAME mode-switched seam as every other repo: the
  // durable LocalApprovalRepository in DEMO_LOCAL, the throwing Supabase stub in every
  // other mode. So in production consumeApproval THROWS ⇒ this route fails CLOSED
  // (403, no provider call) — never a 500, never a fall-through to dispatchArtifact.
  //
  // assertDispatchAllowed is the SECONDARY shape-check below; consumeApproval is the
  // PRIMARY/load-bearing decider. The nonce is a secret consume token and is NEVER
  // logged or echoed; error responses carry only the machine-readable error_code.
  app.post("/api/fulfillment/pod/dispatch", async (req, res) => {
    const { workflowRunId, input, artifact } = req.body ?? {};

    // Accept the approval credentials under either the explicit field name or the
    // `approval`-prefixed alias. artifactId comes from the approval body / the artifact.
    const recordId: unknown = req.body?.recordId ?? req.body?.approvalRecordId;
    const nonce: unknown = req.body?.nonce ?? req.body?.approvalNonce;
    const artifactId: unknown = req.body?.artifactId ?? artifact?.id;

    // No credentials presented → nothing to consume → gate-reject. (AC-001 / AC-002:
    // a fabricated body with no approval record can never authorize a dispatch.)
    if (
      typeof workflowRunId !== "string" ||
      typeof artifactId !== "string" ||
      typeof recordId !== "string" ||
      typeof nonce !== "string"
    ) {
      return res
        .status(403)
        .json({ ok: false, error_code: "DISPATCH_NOT_ALLOWED" });
    }

    // PRIMARY GATE: atomically consume the single-use approval record. In prod the
    // store throws (SupabaseNotConfiguredError) → fail closed with 403, no provider
    // call (AC-003b). A {ok:false} verdict (absent/tampered/expired/used/binding-
    // mismatch) likewise yields 403 with the store's own error_code.
    let consumed;
    try {
      consumed = await appServices.approvals.consumeApproval({
        recordId,
        workflowRunId,
        artifactId,
        nonce,
      });
    } catch {
      // Prod / store-not-configured boundary: never a 500, never a fall-through.
      return res
        .status(403)
        .json({ ok: false, error_code: "DISPATCH_NOT_ALLOWED" });
    }

    if (!consumed.ok) {
      return res
        .status(403)
        .json({ ok: false, error_code: consumed.error_code });
    }

    // The record is the decider: dispatch ONLY the artifactId the record approved
    // (the consume already enforced the binding — do NOT re-trust the body here).
    const approvedArtifactId = consumed.record.artifactId;

    // SECONDARY shape-check: assertDispatchAllowed mirrors the server-side decision
    // onto the run/artifact shape (and gives that guard a real server-route caller,
    // P9). It is NOT the load-bearing gate — the consumed record above already is.
    const gateRun = {
      id: consumed.record.workflowRunId,
      status: "pod_ready",
      acceptedArtifactId: approvedArtifactId,
    } as WorkflowRun;
    const gateArtifact = {
      id: approvedArtifactId,
      status: "accepted",
    } as ImageArtifact;
    try {
      WorkflowStateMachine.assertDispatchAllowed(gateRun, gateArtifact);
    } catch {
      return res
        .status(403)
        .json({ ok: false, error_code: "DISPATCH_NOT_ALLOWED" });
    }

    try {
      const result = await podDispatchService.dispatchArtifact(
        workflowRunId,
        input,
        { ...(artifact ?? {}), id: approvedArtifactId },
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
