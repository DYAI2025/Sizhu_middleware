# sizhu-mcp-server

An MCP server that lets an agent (Claude Code, Codex, any MCP client) operate the Sizhu middleware
(Bazzi console). It is a **thin, auth-forwarding proxy** over the Sizhu `/api` — it adds **no
privilege**, holds **no static admin secret**, and can **bypass nothing**: the server-side guards
(default-deny `apiGuard`, the `sensitive` role+MFA classification, and the **server-side single-use
approval gate on the money path**) are enforced by `/api` exactly as for a direct caller.

> **Canonical agent surface.** This HTTP proxy is the canonical MCP surface for remote agents
> operating the deployed Sizhu instance (config / maintenance / emergencies / compile preview). The
> in-repo `server/mcp/` stdio server was **deleted** (sizhu-agent-safe-ops, ADR
> `docs/decisions/0001-canonical-mcp-surface.md`) — this HTTP surface is the single source.

## Connecting an agent (quick start)

The server is **remote streamable-HTTP** (`POST /mcp`, `GET /health`). Every request carries **your
own Sizhu admin access token** (admin account, MFA/aal2) as `Authorization: Bearer <token>`, forwarded
verbatim to `/api`. No bearer → 401. Ready-to-use client configs are in [`examples/`](./examples/):

```bash
# run the server
cd mcp-server && npm install && npm run build
SIZHU_BASE_URL=https://sizhu.fufire.space PORT=3399 npm start    # POST :3399/mcp · GET :3399/health
export SIZHU_TOKEN="<admin+aal2 access token>"                   # short-lived; re-auth on expiry
```

- **Claude Code** (native HTTP): `claude mcp add --transport http sizhu http://localhost:3399/mcp --header "Authorization: Bearer $SIZHU_TOKEN"` — or `examples/claude-code.mcp.json`.
- **Codex CLI / any stdio-only client** (Claude Desktop, Cursor): the `mcp-remote` stdio↔HTTP bridge — `examples/codex-config.toml`:
  ```toml
  [mcp_servers.sizhu]
  command = "npx"
  args = ["-y", "mcp-remote", "http://localhost:3399/mcp", "--header", "Authorization: Bearer ${SIZHU_TOKEN}"]
  ```

Full walkthrough + verification curls: [`examples/mcp-clients.md`](./examples/mcp-clients.md).

## Security model (read first — this surface can reach real money)

- **Caller-supplied credential.** Each MCP request MUST carry the operator's own Sizhu access token
  (an **admin** account, **MFA / aal2**) as `Authorization: Bearer <token>`. That token is the ONLY
  credential — forwarded verbatim to `/api`. The server stores no admin secret; a stolen MCP endpoint
  yields no standing access. Tokens are short-lived (Supabase aal2) — re-authenticate when they expire.
- **No bearer → 401.** Requests without a forwarded token are rejected before any tool runs.
- **Money path — the server-side approval gate is REAL (security review C1 CLOSED, sizhu-agent-safe-ops).**
  `POST /api/fulfillment/pod/dispatch` enforces a **server-side single-use approval record** as the
  load-bearing gate (`server/index.ts` → `appServices.approvals.consumeApproval`): the request must
  present a valid `recordId` + secret `nonce` bound to the exact `(workflowRunId, artifactId)`; the
  **record** decides the dispatched artifact, never a caller-supplied `artifact.status`. A fabricated
  artifact with no approval record is rejected with `403 DISPATCH_NOT_ALLOWED`. In **production** the
  approval store is the throwing Supabase stub, so `consumeApproval` throws ⇒ the route **fails CLOSED**
  (403, no provider call) — POD dispatch is therefore **not yet functional in prod** until a real
  approval store + an approval-minting path land (REQ-D-001, deferred). `assertDispatchAllowed` is a
  secondary shape-check; `consumeApproval` is primary.
  - `sizhu_pod_dispatch` stays **opt-in** (`MCP_ENABLE_DISPATCH=true`, default OFF) as defense-in-depth
    for a real-money tool — NOT because the gate is fictional (it isn't). Even enabled, it cannot
    dispatch in prod without a consumable approval record.
  - `sizhu_validate_dispatch` is a request-**shape** check only (`shapeOnly: true`,
    `VALIDATION_SHAPE_ONLY`) — it is explicitly NOT dispatch authorization; the gate is the dispatch
    route's `consumeApproval`. Do not read `READY_FOR_DISPATCH` as an approval go-signal.
- **No secrets/PII echoed.** Status tools report only `present: boolean` for secret-refs; the FuFire
  test-run's birth PII is redacted from any outbound provider request by the server. The forwarded
  token / approval nonce are never logged.
- Treat the deployed MCP endpoint as privileged plumbing: front it with TLS, restrict who can reach it
  (network / `ALLOWED_ORIGINS`), and audit usage.

## Tools (11; 12 with `MCP_ENABLE_DISPATCH=true`)

| Tool | Method → /api | Kind |
|---|---|---|
| `sizhu_get_health` | GET /health | read |
| `sizhu_get_readiness` | GET /readiness | read |
| `sizhu_get_config` | GET /config/* | read |
| `sizhu_get_secret_references_status` | GET /secret-references/status | read |
| `sizhu_get_gateway_issues` | GET /gateway-issues | read |
| `sizhu_list_workflows` | GET /workflows/* | read |
| `sizhu_get_fulfillment_readiness` | GET /fulfillment/readiness | read |
| `sizhu_run_fufire_test` | POST /data-requests/fufire/test-run | action (sensitive; personalization, no money) |
| `sizhu_compile_template` | POST /v1/compile-template | action — compile a BaZi poster-prompt preview (deterministic symbols + LLM prose; BLOCKED is shown, never a fake pass) |
| `sizhu_validate_dispatch` | POST /fulfillment/pod/validate-dispatch | action — request-**shape** check only (NOT an approval gate; `shapeOnly`) |
| `sizhu_check_secret_reference` | POST /secret-references/check | action (presence only) |
| `sizhu_pod_dispatch` | POST /fulfillment/pod/dispatch | **DESTRUCTIVE (money)** — opt-in (`MCP_ENABLE_DISPATCH=true`); gated by the server-side single-use approval record (fails closed in prod) |

**Coverage note (honest):** the MCP server exposes what `/api` serves today. `sizhu_compile_template`
(the compile-preview slice) is now wired. The other pipeline-operation endpoints
(`generate` / `quality-gate` / `approve-final-artifact`) are not yet wired server-side (they run
client-side in DEMO_LOCAL / are the paused live-loop slice), so they are intentionally absent —
`approve` will stay human-only when it lands.

## Config (env)

| Var | Required | Meaning |
|---|---|---|
| `SIZHU_BASE_URL` | yes | Sizhu deployment base, e.g. `https://sizhu.fufire.space` (no `/api` suffix) |
| `PORT` | no | listen port (default 3333) |
| `ALLOWED_ORIGINS` | no | comma-separated `Origin` allowlist (DNS-rebind protection; fail-closed when set) |
| `MCP_ENABLE_DISPATCH` | no | `true` registers the opt-in real-money `sizhu_pod_dispatch` tool (default OFF) |

## Run / deploy

```bash
npm install && npm run build
SIZHU_BASE_URL=https://sizhu.fufire.space npm start    # POST /mcp ; GET /health
```

Deploy (Railway etc.): build `npm run build`, start `npm start`, set `SIZHU_BASE_URL`, healthcheck
`GET /health`. For Railway prefer the `RAILPACK` builder (node 22) — `NIXPACKS` defaults to node 18.

## Live real-boundary smoke (operator-run)

Verify against the real deployment with a genuine admin+MFA token (the token never lives in this repo):

```bash
# 1. obtain a Sizhu admin access token (aal2) out-of-band, export it as $SIZHU_TOKEN
# 2. initialize + call a read tool through the MCP server:
curl -s http://localhost:3333/mcp -H "Authorization: Bearer $SIZHU_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
curl -s http://localhost:3333/mcp -H "Authorization: Bearer $SIZHU_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sizhu_get_readiness","arguments":{}}}'
```

A 401 means the token is missing/expired/non-admin/aal1 — re-authenticate. This proves the
forwarded-token guard chain end-to-end (the MCP server adds nothing the token doesn't already grant).
