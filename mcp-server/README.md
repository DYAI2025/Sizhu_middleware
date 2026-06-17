# sizhu-mcp-server

An MCP server that lets an agent operate the Sizhu middleware (Bazzi console). It is a
**thin, auth-forwarding proxy** over the Sizhu `/api` — it adds **no privilege**, holds
**no static admin secret**, and can **bypass nothing**: the server-side guards that DO
exist (default-deny `apiGuard`, the `sensitive` role+MFA classification) are enforced by
`/api` exactly as for a direct caller. **Caveat (security review C1):** the dispatch route
does NOT yet enforce `assertDispatchAllowed` server-side, so there is no real approval gate
on the money path — see the **Payment path — KNOWN GAP** section; the money tool is OFF by default.

> **Canonical agent surface.** This HTTP proxy is the canonical MCP surface for remote agents
> operating the deployed Sizhu instance (config / maintenance / emergencies). The in-repo
> `server/mcp/` stdio server is a local co-located dev/ops surface and an intentional strict
> subset; both share the `sizhu_*` tool naming. Authority decision:
> `docs/decisions/0001-canonical-mcp-surface.md`.

## Security model (read first — this surface can reach real money)

- **Caller-supplied credential.** Each MCP request MUST carry the operator's own Sizhu
  access token (an **admin** account, **MFA / aal2**) as `Authorization: Bearer <token>`.
  That token is the ONLY credential — it is forwarded verbatim to `/api`. The MCP server
  stores no admin secret; a stolen MCP endpoint yields no standing access. Tokens are
  short-lived (Supabase aal2) — re-authenticate when they expire.
- **No bearer → 401.** Requests without a forwarded token are rejected before any tool runs.
- **Payment path — KNOWN GAP (security review C1), `pod_dispatch` WITHHELD by default.** The
  backend `/api/fulfillment/pod/dispatch` route does **NOT** currently enforce
  `assertDispatchAllowed` server-side — that guard lives only in the client-side runner, so the
  route trusts the caller-supplied artifact (a fabricated `{ artifact:{ status:'accepted' } }` is
  not rejected by server state). **There is therefore no real server-side approval gate yet.** The
  only present backstops are the unbuilt Gelato adapter (`MISSING_POD_CONTRACT`, no real charge) and
  `mock_success` in DEMO_LOCAL. Consequences:
  - `sizhu_pod_dispatch` is registered **only when `MCP_ENABLE_DISPATCH=true`** (default OFF). Do not
    enable it for autonomous use against a money-live deployment until the server-side approval gate exists.
  - `sizhu_validate_dispatch` is a request-**shape** check only — it does NOT verify approval and will
    green-light a fabricated artifact. Do not treat `READY_FOR_DISPATCH` as a safety go-signal yet.
  - There is no `approve-final-artifact` tool here (an agent can't self-approve), but the real fix is a
    **server-side approval gate on the dispatch route** (load the authoritative run + `assertDispatchAllowed`,
    or require a signed approval token). That is a REQUIRED follow-up before any real-payment autonomy.
    It needs server-side run persistence (REQ-D-001, currently a deferred stub) or a signed-token mechanism.
- **No secrets/PII echoed.** Status tools report only `present: boolean` for secret-refs;
  the FuFire test-run’s birth PII is redacted from any outbound provider request by the server.
- Treat the deployed MCP endpoint as privileged plumbing: front it with TLS, restrict who can
  reach it (network / `ALLOWED_ORIGINS`), and audit usage.

## Tools (11)

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
| `sizhu_validate_dispatch` | POST /fulfillment/pod/validate-dispatch | action — request-**shape** check only (NOT an approval gate, see C1) |
| `sizhu_pod_dispatch` | POST /fulfillment/pod/dispatch | **DESTRUCTIVE (money)** — OFF by default (`MCP_ENABLE_DISPATCH=true`); NO server-side approval gate yet (C1) |
| `sizhu_check_secret_reference` | POST /secret-references/check | action (presence only) |

**Coverage note (honest):** the MCP server can only expose what `/api` actually serves today.
The pipeline-operation endpoints (`generate` / `quality-gate` / `approve-final-artifact`) are
not yet wired server-side (they run client-side in DEMO_LOCAL / are the paused live-loop slice),
so they are intentionally absent here. They become available — `approve` staying human-only —
once that server endpoint lands.

## Config (env)

| Var | Required | Meaning |
|---|---|---|
| `SIZHU_BASE_URL` | yes | Sizhu deployment base, e.g. `https://sizhu.fufire.space` (no `/api` suffix) |
| `PORT` | no | listen port (default 3333) |
| `ALLOWED_ORIGINS` | no | comma-separated `Origin` allowlist (DNS-rebind protection) |

## Run

```bash
npm install && npm run build
SIZHU_BASE_URL=https://sizhu.fufire.space npm start    # POST /mcp ; GET /health
```

Deploy (Railway etc.): build `npm run build`, start `npm start`, set `SIZHU_BASE_URL`, healthcheck `GET /health`.

## Live real-boundary smoke (operator-run)

Verify against the real deployment with a genuine admin+MFA token (the token never lives in
this repo):

```bash
# 1. obtain a Sizhu admin access token (aal2) out-of-band, export it as $SIZHU_TOKEN
# 2. initialize + call a read tool through the MCP server:
curl -s http://localhost:3333/mcp -H "Authorization: Bearer $SIZHU_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
curl -s http://localhost:3333/mcp -H "Authorization: Bearer $SIZHU_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"sizhu_get_readiness","arguments":{}}}'
```

A 401 means the token is missing/expired/non-admin/aal1 — re-authenticate. This proves the
forwarded-token guard chain end-to-end (the MCP server adds nothing the token doesn’t already grant).
