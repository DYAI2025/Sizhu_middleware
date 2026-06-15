#!/usr/bin/env node
/**
 * sizhu-mcp-server entry — remote streamable HTTP (stateless JSON).
 *
 * Auth model: the MCP request MUST carry the operator's Sizhu access token
 * (admin + MFA/aal2) as `Authorization: Bearer <token>`. That token is the ONLY
 * credential — it is forwarded to the downstream Sizhu /api, which enforces every
 * guard. The MCP server holds no static admin secret. A request without a bearer
 * is rejected before any tool runs.
 *
 * Config (env):
 *   SIZHU_BASE_URL   (required) — e.g. https://sizhu.fufire.space (no /api suffix)
 *   PORT             (optional) — listen port (default 3333)
 *   ALLOWED_ORIGINS  (optional) — comma-separated Origin allowlist (DNS-rebind protection)
 */

import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SizhuClient } from "./sizhuClient.js";
import { createSizhuMcpServer } from "./server.js";

const SIZHU_BASE_URL = process.env.SIZHU_BASE_URL;
const PORT = parseInt(process.env.PORT || "3333", 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!SIZHU_BASE_URL) {
  console.error("FATAL: SIZHU_BASE_URL is required (e.g. https://sizhu.fufire.space)");
  process.exit(1);
}

function bearerFrom(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== "string") return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1];
}

function originAllowed(req: Request): boolean {
  if (ALLOWED_ORIGINS.length === 0) return true; // not configured → no Origin restriction
  const origin = req.headers.origin;
  return typeof origin !== "string" || ALLOWED_ORIGINS.includes(origin);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// MCP server's own liveness (NOT a Sizhu proxy) — for the platform healthcheck.
app.get("/health", (_req, res) => res.json({ status: "ok", server: "sizhu-mcp-server", sizhuHost: safeHost(SIZHU_BASE_URL!) }));

app.post("/mcp", async (req: Request, res: Response) => {
  if (!originAllowed(req)) {
    return res.status(403).json(rpcError(-32001, "Origin not allowed"));
  }
  const token = bearerFrom(req);
  if (!token) {
    return res.status(401).json(rpcError(
      -32001,
      "Missing Authorization bearer. Supply your Sizhu access token (admin account, MFA/aal2) as 'Authorization: Bearer <token>'; it is forwarded to the Sizhu /api which enforces all guards.",
    ));
  }

  // Per-request, stateless: a fresh client (bound to THIS caller's token) + a fresh
  // server + transport, so no auth state is shared across callers.
  const client = new SizhuClient(SIZHU_BASE_URL!, token);
  const server = createSizhuMcpServer(client);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json(rpcError(-32603, `Internal error: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
});

function rpcError(code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}
function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return "<invalid>"; }
}

app.listen(PORT, () => {
  console.error(`sizhu-mcp-server (streamable HTTP) on :${PORT}/mcp → Sizhu ${safeHost(SIZHU_BASE_URL!)}`);
});
