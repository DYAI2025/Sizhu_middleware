import { describe, expect, it } from "vitest";
import { getHealthStatus } from "../adapters/healthTool";
import { callRegisteredTool } from "../registry/tools";
import { anonymousMcpContext } from "../auth/tokenContext";

describe("sizhu_get_health", () => {
  it("returns deterministic public health", () => {
    expect(getHealthStatus()).toEqual({ status: "ok" });
  });

  it("allows anonymous MCP calls and does not leak secrets", async () => {
    process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-value-do-not-log";
    const result = await callRegisteredTool("sizhu_get_health", {}, anonymousMcpContext());
    expect(result.isError).not.toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("ok");
    expect(serialized).not.toContain("test-jwt-secret-value-do-not-log");
  });
});
