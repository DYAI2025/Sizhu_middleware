import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSizhuMcpServer } from "../server";

describe("Sizhu MCP server", () => {
  it("constructs without starting Express", () => {
    const server = createSizhuMcpServer();
    expect(server).toBeTruthy();
  });

  it("lists MCP tools and calls public health via SDK", async () => {
    const server = createSizhuMcpServer();
    const client = new Client({ name: "sizhu-mcp-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("sizhu_get_health");
    expect(tools.tools.map((tool) => tool.name)).toContain("sizhu_get_readiness");

    const result = await client.callTool({ name: "sizhu_get_health", arguments: {} });
    expect(JSON.stringify(result)).toContain("ok");

    await client.close();
    await server.close();
  });
});
