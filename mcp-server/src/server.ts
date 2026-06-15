/**
 * sizhu-mcp-server — registers the agent-facing tools over the Sizhu /api.
 *
 * Each tool is a thin wrapper over one /api operation, using the per-request
 * SizhuClient (which forwards the caller's admin+MFA token). A fresh server is
 * built per request so each caller's downstream calls use THAT caller's token.
 *
 * Coverage = the operations the deployment actually serves today: status reads,
 * the FuFire personalization test-run, fulfillment validate/dispatch, and the
 * secret-reference presence check. Pipeline-generate/quality-gate/approve are NOT
 * yet wired server-side (they run client-side / are the paused live-loop slice),
 * so they are intentionally absent — the MCP server can only expose what /api serves.
 *
 * Payment safety: `sizhu_pod_dispatch` is the only money-affecting tool. It is
 * exposed but NOT autonomous-by-fiat — the downstream /api enforces
 * `assertDispatchAllowed` (the artifact must be QA-accepted or human-approved), and
 * there is no `approve-final-artifact` tool here, so an agent cannot self-approve a
 * real charge. (When an approval endpoint is added server-side, it stays human-only.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SizhuClient, SizhuApiError } from "./sizhuClient.js";

const FUFIRE_OPERATIONS = ["chronometry", "bazi", "baziTrace", "wuxing", "fusion"] as const;

/** Run a tool body; map a SizhuApiError to an actionable MCP error result. */
async function runTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: (data && typeof data === "object" ? (data as Record<string, unknown>) : { value: data }),
    };
  } catch (err) {
    const msg = err instanceof SizhuApiError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    return { isError: true, content: [{ type: "text" as const, text: `Error: ${msg}` }] };
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function createSizhuMcpServer(client: SizhuClient): McpServer {
  const server = new McpServer({ name: "sizhu-mcp-server", version: "1.0.0" });

  // ---- Read / status tools -------------------------------------------------
  server.registerTool("sizhu_get_health", {
    title: "Sizhu health (liveness)",
    description: "GET /api/health — liveness probe. Returns { status }. Read-only, public-ish (still proxied with your token).",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/health")));

  server.registerTool("sizhu_get_readiness", {
    title: "Sizhu readiness",
    description: "GET /api/readiness — readiness probe. Returns { status: 'READY' } or 503 { status:'NOT_READY', missing[] } listing required secrets/config (FuFire/Supabase secret-refs + base URLs). Read-only. Never green on mock-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/readiness")));

  server.registerTool("sizhu_get_config", {
    title: "Sizhu non-secret config snapshot",
    description: "GET /api/config/* — non-secret config: { appMode (DEMO_LOCAL|CONFIG_REQUIRED|SUPABASE_READY|PRODUCTION), authRequired, mfaRequired }. Never returns secret values. Read-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/config/snapshot")));

  server.registerTool("sizhu_get_secret_references_status", {
    title: "Secret-reference presence status",
    description: "GET /api/secret-references/status — for each known secret-ref name, reports { ref, present: boolean }. NEVER returns secret values. Read-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/secret-references/status")));

  server.registerTool("sizhu_get_gateway_issues", {
    title: "Provider gateway issues",
    description: "GET /api/gateway-issues — recent provider gateway issues (FuFire/OpenRouter/Gelato) as { status, issues[] }. Read-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/gateway-issues")));

  server.registerTool("sizhu_list_workflows", {
    title: "List workflow runs",
    description: "GET /api/workflows/* — list/observe workflow runs as { status, workflows[] }. Read-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/workflows/list")));

  server.registerTool("sizhu_get_fulfillment_readiness", {
    title: "Fulfillment (POD) readiness",
    description: "GET /api/fulfillment/readiness — whether POD dispatch is configured: 200 { status:'READY' } or 503 { status:'NOT_READY', reason } (dispatch disabled or missing POD credentials). Read-only — does NOT dispatch.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/fulfillment/readiness")));

  // ---- FuFire personalization test-run -------------------------------------
  server.registerTool("sizhu_run_fufire_test", {
    title: "Run a FuFire personalization test",
    description: `POST /api/data-requests/fufire/test-run — resolve Chinese-metaphysics personalization (BaZi / Wu Xing / fusion) for a birth input and map it into prompt variables (no invented data). Sensitive: requires admin role + MFA (aal2). No money/fulfillment. Birth input is PII — sent over your authenticated channel; the server redacts PII from any outbound provider request.

Args: birthDate 'YYYY-MM-DD' (required); birthTime 'HH:MM' (optional → default noon); birthTimeKnown; manualLat/manualLon/manualTimezone (lat/lon required for wuxing+fusion); requestedOperations (subset of chronometry|bazi|baziTrace|wuxing|fusion); locale 'de'|'en'; optional contract enums standard/boundary/ambiguousTime/nonexistentTime; optional promptTemplate to render.
Returns: { readinessStatus, requests[], responses[], promptVariables (animal/element/birth_year/western_dominant/eastern_dominant), promptVariableIssues[], responseInterpretation[], gatewayIssues[], renderedPrompt? }.`,
    inputSchema: {
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be YYYY-MM-DD").describe("Birth date YYYY-MM-DD"),
      birthTime: z.string().optional().describe("Birth time HH:MM (omit → default noon)"),
      birthTimeKnown: z.boolean().optional().describe("Whether the birth time is actually known"),
      manualLat: z.number().min(-90).max(90).optional().describe("Latitude (required for wuxing/fusion)"),
      manualLon: z.number().min(-180).max(180).optional().describe("Longitude (required for wuxing/fusion)"),
      manualTimezone: z.string().optional().describe("IANA timezone, e.g. Europe/Berlin"),
      requestedOperations: z.array(z.enum(FUFIRE_OPERATIONS)).min(1).describe("FuFire operations to run"),
      locale: z.enum(["de", "en"]).optional().describe("Render locale (de→Tier, en→animal)"),
      standard: z.enum(["CIVIL", "LMT", "TLST"]).optional(),
      boundary: z.enum(["midnight", "zi"]).optional(),
      ambiguousTime: z.enum(["earlier", "later"]).optional(),
      nonexistentTime: z.enum(["error", "shift_forward"]).optional(),
      promptTemplate: z.string().optional().describe("Optional {{var}} template rendered from the resolved variables"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/data-requests/fufire/test-run", args)));

  // ---- Fulfillment: validate (safe) ----------------------------------------
  server.registerTool("sizhu_validate_dispatch", {
    title: "Validate a POD dispatch (safe dry-run)",
    description: "POST /api/fulfillment/pod/validate-dispatch — a NON-charging readiness/safety check for a would-be dispatch. Returns { ok, status:'READY_FOR_DISPATCH' } or a 400 INVALID_REQUEST. Does NOT place an order or charge money. Use this before sizhu_pod_dispatch. Sensitive (admin+MFA). Args: workflowRunId, artifact.",
    inputSchema: {
      workflowRunId: z.string().min(1).describe("The workflow run id"),
      artifact: z.record(z.unknown()).describe("The candidate artifact object ({ id, url, ... })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/fulfillment/pod/validate-dispatch", args)));

  // ---- Fulfillment: dispatch (MONEY — destructive, gated downstream) --------
  server.registerTool("sizhu_pod_dispatch", {
    title: "Dispatch a POD order (REAL fulfillment — money)",
    description: `POST /api/fulfillment/pod/dispatch — submit an accepted artifact to the POD provider (Gelato). THIS IS THE MONEY / REAL-FULFILLMENT PATH and is DESTRUCTIVE + NOT idempotent at the business level (a duplicate logical order is de-duplicated only by the server's deterministic idempotency key).

GUARDRAILS (enforced by the server, not bypassable from here):
- The server applies assertDispatchAllowed: the artifact MUST be QA-accepted or human-approved, else the dispatch is refused. An agent CANNOT self-approve — there is no approval tool exposed here.
- Today the real Gelato adapter is a safe boundary: a well-formed call returns ok:false error_code 'MISSING_POD_CONTRACT' (no real charge yet). When the live adapter lands, this tool would place a real order — treat every call as potentially money-spending.
ALWAYS call sizhu_validate_dispatch first and confirm READY_FOR_DISPATCH. Args: workflowRunId, input, artifact. Returns { ok, error_code?, message?, idempotencyKey?, gatewayIssue? }.`,
    inputSchema: {
      workflowRunId: z.string().min(1).describe("The workflow run id"),
      input: z.record(z.unknown()).describe("The run input (order context)"),
      artifact: z.record(z.unknown()).describe("The QA-accepted / human-approved artifact to dispatch"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, (args) => runTool(() => client.post("/fulfillment/pod/dispatch", args)));

  // ---- Secret-reference presence check -------------------------------------
  server.registerTool("sizhu_check_secret_reference", {
    title: "Check a secret reference is present",
    description: "POST /api/secret-references/check — confirm whether a named secret env var is wired up: returns { ok, ref, present: boolean }. NEVER returns the secret value. Sensitive (admin+MFA). Args: ref (the env var name, e.g. SECRET_REF_FUFIRE_API_KEY).",
    inputSchema: { ref: z.string().min(1).describe("The secret-ref env var name to check for presence") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/secret-references/check", args)));

  return server;
}
