import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listActiveMcpTools, callRegisteredTool } from "./registry/tools";
import { getEnvMcpAuthContext } from "./auth/tokenContext";

export function createSizhuMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "sizhu-middleware-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "Sizhu MCP (LOCAL stdio surface — co-located dev/ops). The CANONICAL remote agent surface is the sizhu-mcp-server HTTP proxy under mcp-server/; both surfaces share the sizhu_* tool naming. This stdio surface intentionally exposes only the local-safe read/test tools (no workflow listing, no fulfillment/dispatch). It never returns secret values and dangerous external-effect tools are disabled by default. See docs/decisions/0001-canonical-mcp-surface.md.",
    },
  );

  for (const tool of listActiveMcpTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: `${tool.description}\nSensitivity: ${tool.sensitivity}. Side effects: ${tool.sideEffects}.`,
        inputSchema: tool.inputSchema,
      },
      async (args) => callRegisteredTool(tool.name, args as Record<string, unknown>, getEnvMcpAuthContext()),
    );
  }

  return server;
}

export async function startStdioMcpServer(): Promise<void> {
  if ((process.env.MCP_ENABLED || "true").toLowerCase() === "false") {
    throw new Error("MCP server disabled by MCP_ENABLED=false");
  }
  const server = createSizhuMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const transportArg = process.argv.find((arg) => arg.startsWith("--transport="));
  const transport = transportArg?.split("=")[1] || "stdio";
  if (transport !== "stdio") {
    console.error(`Unsupported MCP transport for this build: ${transport}`);
    process.exit(2);
  }
  startStdioMcpServer().catch((err) => {
    console.error("Failed to start Sizhu MCP server:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
