import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callRegisteredTool } from "../registry/tools";
import type { McpAuthContext } from "../auth/tokenContext";
import { anonymousMcpContext } from "../auth/tokenContext";

const adminAal2: McpAuthContext = {
  principalType: "user",
  email: "admin@example.test",
  role: "admin",
  aal: "aal2",
  scopes: ["sizhu:fufire:test-run"],
};

const envKeys = [
  "FUFIRE_API_KEY_SECRET_REF",
  "SECRET_REF_FUFIRE_API_KEY",
  "FUFIRE_BASE_URL",
  "MFA_REQUIRED_FOR_SENSITIVE_ACTIONS",
];
const previous = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of envKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
});

afterEach(() => {
  for (const key of envKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
});

describe("sizhu.fufire_test_run", () => {
  it("denies anonymous calls", async () => {
    const result = await callRegisteredTool("sizhu.fufire_test_run", {}, anonymousMcpContext());
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("MCP_AUTH_REQUIRED");
  });

  it("rejects client-controlled steering fields before service execution", async () => {
    const result = await callRegisteredTool(
      "sizhu.fufire_test_run",
      { baseUrl: "https://evil.example", operation: "bazi" },
      adminAal2,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("MCP_INVALID_INPUT");
  });

  it("rejects disallowed operations without an upstream call", async () => {
    const result = await callRegisteredTool(
      "sizhu.fufire_test_run",
      { operation: "stealSecrets" },
      adminAal2,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("FUFIRE_OPERATION_NOT_ALLOWED");
  });

  it("returns a controlled NOT_READY result when manual coordinates are missing", async () => {
    const result = await callRegisteredTool(
      "sizhu.fufire_test_run",
      { operation: "bazi", birthDate: "1990-01-01" },
      adminAal2,
    );
    const serialized = JSON.stringify(result);
    expect(result.isError).toBe(true);
    expect(serialized).toContain("NO_GEOCODER_CONFIGURED");
  });

  it("does not leak configured FuFire secret values", async () => {
    process.env.FUFIRE_API_KEY_SECRET_REF = "SECRET_REF_FUFIRE_API_KEY";
    process.env.SECRET_REF_FUFIRE_API_KEY = "test-fufire-key-do-not-log";
    process.env.FUFIRE_BASE_URL = "https://api.example.test";
    const result = await callRegisteredTool(
      "sizhu.fufire_test_run",
      { operation: "bazi", birthDate: "1990-01-01" },
      adminAal2,
    );
    expect(JSON.stringify(result)).not.toContain("test-fufire-key-do-not-log");
  });
});
