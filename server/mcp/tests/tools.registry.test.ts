import { describe, expect, it } from "vitest";
import { listActiveMcpTools } from "../registry/tools";

describe("Sizhu MCP tool registry", () => {
  it("lists active MCP tools", () => {
    const names = listActiveMcpTools().map((tool) => tool.name);
    expect(names).toContain("sizhu_get_health");
    expect(names).toContain("sizhu_get_readiness");
    expect(names).toContain("sizhu_run_fufire_test");
    expect(names).not.toContain("sizhu_list_workflows");
    expect(names).not.toContain("sizhu_pod_dispatch");
  });

  it("every active tool declares metadata, schema, sensitivity and handler", () => {
    for (const tool of listActiveMcpTools()) {
      expect(tool.name).toMatch(/^sizhu_/);
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
      expect(["public_read", "session_read", "sensitive_admin", "dangerous_external_effect"]).toContain(tool.sensitivity);
      expect(typeof tool.handler).toBe("function");
    }
  });
});
