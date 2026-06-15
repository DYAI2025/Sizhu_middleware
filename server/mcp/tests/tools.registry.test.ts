import { describe, expect, it } from "vitest";
import { listActiveMcpTools } from "../registry/tools";

describe("Sizhu MCP tool registry", () => {
  it("lists active MCP tools", () => {
    const names = listActiveMcpTools().map((tool) => tool.name);
    expect(names).toContain("sizhu.health_check");
    expect(names).toContain("sizhu.readiness_check");
    expect(names).toContain("sizhu.fufire_test_run");
    expect(names).not.toContain("sizhu.workflow_run");
    expect(names).not.toContain("sizhu.pod_dispatch");
  });

  it("every active tool declares metadata, schema, sensitivity and handler", () => {
    for (const tool of listActiveMcpTools()) {
      expect(tool.name).toMatch(/^sizhu\./);
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
      expect(["public_read", "session_read", "sensitive_admin", "dangerous_external_effect"]).toContain(tool.sensitivity);
      expect(typeof tool.handler).toBe("function");
    }
  });
});
