# Sizhu MCP Tool Catalog

> **Surface (updated 2026-06-17):** the LOCAL stdio surface (`server/mcp/`, `npm run mcp:stdio`) this file originally documented was **REMOVED** (feature `sizhu-agent-safe-ops`, REQ-006/007 — `docs/decisions/0001-canonical-mcp-surface.md` superseded in part). The **single canonical** agent surface is now the `sizhu-mcp-server` HTTP proxy under `mcp-server/` — see **`mcp-server/README.md` for the authoritative tool list**. The `sizhu_*` names/schemas below carried over to the HTTP surface, so they remain useful detail for those shared tools, but `mcp-server/README.md` is the source of truth.

Status: MCP foundation with active read-only tools plus a policy-gated FuFire test-run tool. On the canonical HTTP surface, `sizhu_pod_dispatch` exists but is OFF by default (`MCP_ENABLE_DISPATCH=true`); the backend dispatch route now enforces a server-side single-use approval gate (prod fail-closed this iteration — see the ADR-0001 banner).

## Active tools

### `sizhu_get_health`

- Description: Returns local MCP/service liveness.
- Sensitivity: `public_read`
- Side effects: none
- Input schema: empty object `{}`
- Output schema:

```json
{ "status": "ok" }
```

- Auth: none required.
- Failure modes: MCP transport/server failure only.
- Example arguments:

```json
{}
```

### `sizhu_get_readiness`

- Description: Returns fail-closed readiness based on required FuFire and Supabase configuration.
- Sensitivity: `session_read`
- Side effects: none
- Input schema: empty object `{}`
- Output schema:

```json
{ "status": "READY" }
```

or:

```json
{ "status": "NOT_READY", "missing": ["SECRET_REF_FUFIRE_API_KEY", "FUFIRE_BASE_URL"] }
```

- Auth: MCP auth context must be `user` or `service_agent` unless policy is explicitly relaxed for local development.
- Secret behavior: returns missing environment variable names or secret reference names only. Never returns secret values.
- Failure modes:
  - `MCP_AUTH_REQUIRED` when called anonymously.
  - `NOT_READY` when required environment variables are missing.

### `sizhu_run_fufire_test`

- Description: Executes server-owned FuFire test-run operations through the existing middleware validation and service layer.
- Sensitivity: `sensitive_admin`
- Side effects: external read/upstream request when configuration, coordinates and operation selection are complete.
- Input schema: strict object with these allowed fields only:

```json
{
  "birthDate": "1990-01-01",
  "birthTime": "12:30",
  "birthTimeKnown": true,
  "manualLat": 52.52,
  "manualLon": 13.405,
  "manualTimezone": "Europe/Berlin",
  "operation": "bazi",
  "requestedOperations": ["bazi", "wuxing", "fusion"],
  "locale": "de",
  "promptTemplate": "Optional {{dominant_element}} template"
}
```

- Explicitly rejected steering fields: `fuFireConfig`, `fufirePath`, `baseUrl`, `apiKeySecretRef`, `authHeaderName`.
- Auth: role `owner`, `admin`, or `operator`; user principals require `aal2` when MFA is enabled.
- Failure modes:
  - `MCP_AUTH_REQUIRED`, `MCP_FORBIDDEN`, `MCP_MFA_REQUIRED` for policy failures.
  - `MCP_INVALID_INPUT` for schema violations.
  - `FUFIRE_OPERATION_NOT_ALLOWED` for non-allowlisted operations.
  - `NO_GEOCODER_CONFIGURED` when manual coordinates/timezone are required.
  - FuFire gateway issue codes for upstream readiness/response failures.

## Disabled/future tools

These are intentionally absent from `tools/list` until their own implementation sprint and tests are complete:

- `sizhu_list_workflows`: blocked until the production workflow run route and OpenRouter provider wiring are green.
- `sizhu_pod_dispatch`: dangerous external-effect tool; disabled until Gelato contract, idempotency, human approval, and live smoke tests exist.
