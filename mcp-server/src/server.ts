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
 * Payment safety (security review C1, corrected): `sizhu_pod_dispatch` is the only
 * money-affecting tool and is WITHHELD by default (registered only when
 * MCP_ENABLE_DISPATCH=true). IMPORTANT — the backend /api/fulfillment/pod/dispatch
 * route does NOT currently enforce `assertDispatchAllowed` server-side (that guard
 * lives only in the client-side runner; the route trusts the caller-supplied
 * artifact). So there is NO real server-side approval gate yet. The only present
 * backstops are the unbuilt Gelato adapter (`MISSING_POD_CONTRACT`) + DEMO_LOCAL
 * mock. There is also no `approve-final-artifact` tool here (an agent can't
 * self-approve), but the real fix is a server-side approval gate on the dispatch
 * route — a tracked follow-up that MUST land before any money-live autonomous use.
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
    description: "POST /api/fulfillment/pod/validate-dispatch — a NON-charging request-SHAPE check. Returns { ok, status:'READY_FOR_DISPATCH' } if the body has a workflowRunId + artifact, else 400 INVALID_REQUEST. WARNING: today this is a shape check ONLY — it does NOT verify QA-acceptance or human-approval and will green-light a fabricated artifact. Do NOT treat READY_FOR_DISPATCH as a safety go-signal until the server-side approval gate exists. Sensitive (admin+MFA). Args: workflowRunId, artifact.",
    inputSchema: {
      workflowRunId: z.string().min(1).describe("The workflow run id"),
      artifact: z.record(z.unknown()).describe("The candidate artifact object ({ id, url, ... })"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (args) => runTool(() => client.post("/fulfillment/pod/validate-dispatch", args)));

  // ---- Fulfillment: dispatch (MONEY — DESTRUCTIVE) -------------------------
  // SAFETY (security review C1): the dispatch tool is WITHHELD by default. The
  // backend /api/fulfillment/pod/dispatch route does NOT currently enforce
  // assertDispatchAllowed server-side (that guard lives only in the client-side
  // runner; the route trusts the caller-supplied artifact). So there is no real
  // server-side approval gate yet — exposing an autonomous money tool would ship a
  // fictional guardrail. It is registered ONLY when the operator explicitly opts in
  // via MCP_ENABLE_DISPATCH=true, AND the description states the true (un-gated) state.
  if (process.env.MCP_ENABLE_DISPATCH === "true") {
    server.registerTool("sizhu_pod_dispatch", {
      title: "Dispatch a POD order (REAL fulfillment — money; UN-GATED today)",
      description: `POST /api/fulfillment/pod/dispatch — submit an artifact to the POD provider (Gelato). DESTRUCTIVE money/real-fulfillment path, not business-idempotent.

⚠️ TRUTHFUL SAFETY STATE (do not rely on a gate that does not exist):
- The backend route does NOT currently verify QA-acceptance or human-approval — it trusts the artifact you pass. assertDispatchAllowed is NOT enforced on this route (only in the client-side runner). A fabricated { artifact: { status:'accepted' } } is NOT rejected by server state.
- The ONLY current backstops are: the unbuilt Gelato adapter returning ok:false 'MISSING_POD_CONTRACT' (no real charge yet), and 'mock_success' in DEMO_LOCAL. When the live Gelato adapter lands WITHOUT a server-side approval gate, this tool WILL place real orders with no approval check.
- This tool is OFF unless MCP_ENABLE_DISPATCH=true. Do NOT enable for autonomous use against a money-live deployment until the server-side approval gate is built. A human should perform/authorize real charges out-of-band.
Args: workflowRunId, input, artifact. Returns { ok, error_code?, message?, idempotencyKey?, gatewayIssue? }.`,
      inputSchema: {
        workflowRunId: z.string().min(1).describe("The workflow run id"),
        input: z.record(z.unknown()).describe("The run input (order context)"),
        artifact: z.record(z.unknown()).describe("The artifact to dispatch (NOTE: not server-verified for approval today)"),
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

  return server;
}
