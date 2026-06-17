import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getReadinessStatus } from "../adapters/readinessTool";
import { callRegisteredTool } from "../registry/tools";
import type { McpAuthContext } from "../auth/tokenContext";
import { anonymousMcpContext } from "../auth/tokenContext";

const serviceContext: McpAuthContext = {
  principalType: "service_agent",
  role: "operator",
  aal: "service",
  scopes: ["sizhu:readiness"],
};

const envKeys = [
  "FUFIRE_API_KEY_SECRET_REF",
  "SUPABASE_SERVICE_ROLE_SECRET_REF",
  "SECRET_REF_FUFIRE_API_KEY",
  "SECRET_REF_SUPABASE_SERVICE_ROLE",
  "FUFIRE_BASE_URL",
  "SUPABASE_URL",
  "MCP_REQUIRE_AUTH",
];
const previous = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of envKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
});

describe("sizhu_get_readiness", () => {
  it("reports NOT_READY with missing reference names only", () => {
    const status = getReadinessStatus();
    expect(status.status).toBe("NOT_READY");
    expect(status.missing).toEqual([
      "SECRET_REF_FUFIRE_API_KEY",
      "SECRET_REF_SUPABASE_SERVICE_ROLE",
      "FUFIRE_BASE_URL",
      "SUPABASE_URL",
    ]);
  });

  it("reports READY when all required refs are configured", () => {
    process.env.SECRET_REF_FUFIRE_API_KEY = "test-fufire-key-do-not-log";
    process.env.SECRET_REF_SUPABASE_SERVICE_ROLE = "test-service-role-do-not-log";
    process.env.FUFIRE_BASE_URL = "https://api.example.test";
    process.env.SUPABASE_URL = "https://supabase.example.test";
    expect(getReadinessStatus()).toEqual({ status: "READY" });
  });

  it("denies anonymous MCP calls by default", async () => {
    const result = await callRegisteredTool("sizhu_get_readiness", {}, anonymousMcpContext());
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("MCP_AUTH_REQUIRED");
  });

  it("allows service-agent MCP calls and redacts secret values", async () => {
    process.env.SECRET_REF_FUFIRE_API_KEY = "test-fufire-key-do-not-log";
    process.env.SECRET_REF_SUPABASE_SERVICE_ROLE = "test-service-role-do-not-log";
    process.env.FUFIRE_BASE_URL = "https://api.example.test";
    process.env.SUPABASE_URL = "https://supabase.example.test";
    const result = await callRegisteredTool("sizhu_get_readiness", {}, serviceContext);
    expect(result.isError).not.toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("READY");
    expect(serialized).not.toContain("test-fufire-key-do-not-log");
    expect(serialized).not.toContain("test-service-role-do-not-log");
  });
});
