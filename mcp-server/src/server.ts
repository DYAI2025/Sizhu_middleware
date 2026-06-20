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
 * Payment safety (security review C1 CLOSED, sizhu-agent-safe-ops): `sizhu_pod_dispatch`
 * is the only money-affecting tool and is opt-in (registered only when
 * MCP_ENABLE_DISPATCH=true). The backend /api/fulfillment/pod/dispatch route DOES enforce a
 * server-side single-use approval gate: `appServices.approvals.consumeApproval` is the
 * load-bearing decider (a valid recordId + secret nonce bound to (workflowRunId, artifactId);
 * the RECORD decides the dispatched artifact, never a caller-supplied artifact.status). A
 * fabricated artifact with no approval record → 403 DISPATCH_NOT_ALLOWED. In production the
 * approval store is the throwing Supabase stub, so the route FAILS CLOSED (403, no provider
 * call) — dispatch is not yet functional in prod until a real approval store + minting path
 * land (REQ-D-001, deferred). There is no `approve-final-artifact` tool here (an agent can't
 * self-approve); the opt-in flag is defense-in-depth for a real-money tool.
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

  // ---- Fulfillment: validate (shape check only — NOT an approval gate) ------
  server.registerTool("sizhu_validate_dispatch", {
    title: "Validate a POD dispatch request shape (NOT an approval check)",
    description: "POST /api/fulfillment/pod/validate-dispatch — a NON-charging request-SHAPE check (shapeOnly, VALIDATION_SHAPE_ONLY). Returns { ok, status:'READY_FOR_DISPATCH', shapeOnly:true } if the body has a workflowRunId + artifact, else 400 INVALID_REQUEST. This is a shape check ONLY — it is explicitly NOT dispatch authorization and does NOT verify QA-acceptance or approval. The real money gate is the dispatch route's server-side single-use approval record (consumeApproval). Do NOT treat READY_FOR_DISPATCH as an approval go-signal. Sensitive (admin+MFA). Args: workflowRunId, artifact.",
    inputSchema: {
      workflowRunId: z.string().min(1).describe("The workflow run id"),
      artifact: z.record(z.unknown()).describe("The candidate artifact object ({ id, url, ... })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/fulfillment/pod/validate-dispatch", args)));

  // ---- Fulfillment: dispatch (MONEY — DESTRUCTIVE) -------------------------
  // SAFETY (security review C1 CLOSED, sizhu-agent-safe-ops): the dispatch route enforces a
  // server-side single-use approval gate (consumeApproval, load-bearing; fails closed in prod).
  // The tool is still opt-in (MCP_ENABLE_DISPATCH=true) as defense-in-depth for a real-money
  // tool — even enabled it cannot dispatch in prod without a consumable approval record.
  if (process.env.MCP_ENABLE_DISPATCH === "true") {
    server.registerTool("sizhu_pod_dispatch", {
      title: "Dispatch a POD order (REAL fulfillment — money; server-side approval-gated)",
      description: `POST /api/fulfillment/pod/dispatch — submit an artifact to the POD provider (Gelato). DESTRUCTIVE money/real-fulfillment path, not business-idempotent.

SAFETY STATE (C1 CLOSED):
- The route enforces a server-side SINGLE-USE APPROVAL gate: it requires recordId + secret nonce bound to (workflowRunId, artifactId); consumeApproval is the load-bearing decider and the RECORD decides the artifact (a fabricated { artifact: { status:'accepted' } } with no approval record → 403 DISPATCH_NOT_ALLOWED).
- In PRODUCTION the approval store is the throwing Supabase stub → consumeApproval throws → the route FAILS CLOSED (403, no provider call). So dispatch is NOT yet functional in prod until a real approval store + an approval-minting path land (REQ-D-001). DEMO_LOCAL uses a durable single-use record.
- This tool is OFF unless MCP_ENABLE_DISPATCH=true (defense-in-depth). An agent cannot self-approve; the approval record is minted out-of-band by a human/authorized path.
Args: workflowRunId, input, artifact, recordId, nonce, artifactId. Returns { ok, error_code?, message?, idempotencyKey?, gatewayIssue? }.`,
      inputSchema: {
        workflowRunId: z.string().min(1).describe("The workflow run id"),
        input: z.record(z.unknown()).describe("The run input (order context)"),
        artifact: z.record(z.unknown()).describe("The artifact to dispatch — the approval RECORD decides the artifact, not this field"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, (args) => runTool(() => client.post("/fulfillment/pod/dispatch", args)));
  }

  // ---- Secret-reference presence check -------------------------------------
  server.registerTool("sizhu_check_secret_reference", {
    title: "Check a secret reference is present",
    description: "POST /api/secret-references/check — confirm whether a named secret env var is wired up: returns { ok, ref, present: boolean }. NEVER returns the secret value. Sensitive (admin+MFA). Args: ref (the env var name, e.g. SECRET_REF_FUFIRE_API_KEY).",
    inputSchema: { ref: z.string().min(1).describe("The secret-ref env var name to check for presence") },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/secret-references/check", args)));

  // ---- Compile preview: deterministic BaZi symbols + LLM prose --------------
  server.registerTool("sizhu_compile_template", {
    title: "Compile a BaZi Year-Pillar poster-prompt preview",
    description: `POST /api/v1/compile-template — compile a poster-prompt preview from a real FuFire response. The Hanzi/Pinyin SYMBOL values are filled DETERMINISTICALLY from a verified mapping table (NOT the LLM); a real OpenRouter call formulates ONLY the image-prompt prose; then deterministic quality gates run. A BLOCKED verdict is a SHOWN result with blockers — never a fake pass; inspect validation.gates/blockers, do not treat BLOCKED as success. Session-protected (your admin token is forwarded). No money/fulfillment.
Args: templateId ('bazi_solo_beijing_modern_v1' | 'bazi_solo_sichuan_classical_v1'); rawFuFireResponse (a FuFire bazi response object — the { _note?, data } envelope or its inner object); locale 'de'|'en' (optional).
Returns: { compiled: { variantId, regionPolicy, templatePlaceholders, rawDataBindings, deterministicOverlayPlan, sourceStatus, negativeConstraints, imageGenerationPrompt }, validation: { gates[], verdict:'PASS'|'BLOCKED', blockers[] } }.`,
    inputSchema: {
      templateId: z.string().min(1).describe("bazi_solo_beijing_modern_v1 | bazi_solo_sichuan_classical_v1"),
      rawFuFireResponse: z.record(z.unknown()).describe("FuFire bazi response object ({ _note?, data } envelope or inner object)"),
      locale: z.enum(["de", "en"]).optional().describe("Render locale (de→Tier, en→animal)"),
    },
    // Not idempotent: the Lane-2 prose comes from a live LLM call (non-deterministic).
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, (args) => runTool(() => client.post("/v1/compile-template", args)));

  // ---- Template config store (REQ-007): list / get / save / set-active ------
  // Thin proxies over /api/v1/templates. They forward the caller's admin token;
  // writes require the `templates:write` scope on that forwarded token. The server
  // validates server-side — a BLOCKED/422 is surfaced as an error, never a fake success.
  server.registerTool("sizhu_list_templates", {
    title: "List stored prompt templates",
    description: "GET /api/v1/templates — list the stored prompt templates as an array of template records. Thin proxy; forwards your admin token. Read-only.",
    inputSchema: {}, annotations: READ_ONLY,
  }, () => runTool(() => client.get("/v1/templates")));

  server.registerTool("sizhu_get_template", {
    title: "Get a stored prompt template by id",
    description: "GET /api/v1/templates/:id — fetch one stored prompt template by id. 404 if no such template. Thin proxy; forwards your admin token. Read-only. Args: id.",
    inputSchema: { id: z.string().min(1).describe("The template id") },
    annotations: READ_ONLY,
  }, ({ id }) => runTool(() => client.get(`/v1/templates/${encodeURIComponent(id)}`)));

  server.registerTool("sizhu_save_template", {
    title: "Create or update a prompt template (upsert)",
    description: "POST /api/v1/templates — create or update a prompt template (upsert). The server VALIDATES the template server-side and returns 422 on an invalid template; the 422 is surfaced as an error, never a fake success. Requires the `templates:write` scope on the forwarded admin token. Thin proxy. Args: template { id?, name, content, version, status }.",
    inputSchema: {
      template: z.object({
        id: z.string().min(1).optional().describe("Template id (omit to create a new one)"),
        name: z.string().min(1).describe("Human-readable template name"),
        content: z.string().describe("The template body (e.g. {{var}} prompt text)"),
        version: z.string().min(1).describe("Template version"),
        status: z.string().min(1).describe("Template status (e.g. draft|active|archived)"),
      }).describe("The template to create or update (upsert)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, ({ template }) => runTool(() => client.post("/v1/templates", template)));

  server.registerTool("sizhu_set_template_active", {
    title: "Activate or deactivate (archive) a template",
    description: "POST /api/v1/templates/:id/active — soft activate or deactivate (archive) a template. NEVER deletes a template — deactivation archives it. The server validates server-side; a BLOCKED/422 is surfaced as an error, never a fake success. Requires the `templates:write` scope on the forwarded admin token. Thin proxy. Args: id, active (boolean).",
    inputSchema: {
      id: z.string().min(1).describe("The template id"),
      active: z.boolean().describe("true → activate; false → deactivate (archive, never delete)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, ({ id, active }) => runTool(() => client.post(`/v1/templates/${encodeURIComponent(id)}/active`, { active })));

  return server;
}
