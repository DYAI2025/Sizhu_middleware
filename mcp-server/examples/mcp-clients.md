# Connecting agents to sizhu-mcp-server

The server is a **remote streamable-HTTP** MCP server (`POST /mcp`, `GET /health`). Every request
must carry **your own Sizhu admin access token** (admin account, MFA/aal2) as
`Authorization: Bearer <token>` — it is forwarded verbatim to the Sizhu `/api`, which enforces all
guards. The MCP server holds no secret and grants no extra privilege. No bearer → 401.

> **Deployed endpoint:** `https://talented-victory-production.up.railway.app/mcp` (Railway).
> The config files `claude-code.mcp.json` / `codex-config.toml` point at it. The shell snippets
> below show `localhost:3399` for a self-run local server (§0) — swap in the deployed URL to use
> the hosted one.

## 0. Prerequisites

```bash
# Build + run the server (points it at a Sizhu deployment; no /api suffix)
cd mcp-server && npm install && npm run build
SIZHU_BASE_URL=https://sizhu.fufire.space PORT=3399 npm start   # POST :3399/mcp · GET :3399/health
```

Obtain a Sizhu **admin + aal2** access token out-of-band (Supabase login + MFA) and export it:

```bash
export SIZHU_TOKEN="<your-admin-aal2-access-token>"   # short-lived; re-auth when it expires
```

URL: local `http://localhost:3399/mcp`, or your deployed MCP host `https://<mcp-host>/mcp`.

## 1. Claude Code (native HTTP transport)

```bash
claude mcp add --transport http sizhu http://localhost:3399/mcp \
  --header "Authorization: Bearer $SIZHU_TOKEN"
```

Or project-scoped via `.mcp.json` (see `claude-code.mcp.json` in this folder):

```json
{
  "mcpServers": {
    "sizhu": {
      "type": "http",
      "url": "http://localhost:3399/mcp",
      "headers": { "Authorization": "Bearer ${SIZHU_TOKEN}" }
    }
  }
}
```

## 2. Codex CLI

Native HTTP (recent Codex) or — for any stdio-only client — the `mcp-remote` stdio↔HTTP bridge,
which works universally. See `codex-config.toml`:

```toml
# ~/.codex/config.toml — universal stdio bridge (works on every Codex version)
[mcp_servers.sizhu]
command = "npx"
args = ["-y", "mcp-remote", "http://localhost:3399/mcp", "--header", "Authorization: Bearer ${SIZHU_TOKEN}"]
```

## 3. Any other stdio-only MCP client (Claude Desktop, Cursor, …)

Use the same `mcp-remote` bridge — it presents a local stdio MCP server and forwards to the remote
HTTP endpoint with your header:

```bash
npx -y mcp-remote http://localhost:3399/mcp --header "Authorization: Bearer $SIZHU_TOKEN"
```

```json
{
  "mcpServers": {
    "sizhu": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3399/mcp", "--header", "Authorization: Bearer ${SIZHU_TOKEN}"]
    }
  }
}
```

## Verify the connection

```bash
curl -s http://localhost:3399/health
# → {"status":"ok","server":"sizhu-mcp-server","sizhuHost":"..."}

curl -s http://localhost:3399/mcp -H "Authorization: Bearer $SIZHU_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
# → the tool catalog. A 401 means the token is missing/expired/non-admin/aal1 — re-authenticate.
```

> Security: treat the endpoint as privileged plumbing — front it with TLS, restrict reachability
> (`ALLOWED_ORIGINS` / network), and audit usage. The token is the only credential; it is never stored.
