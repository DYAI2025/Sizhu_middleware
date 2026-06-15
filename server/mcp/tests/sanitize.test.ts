import { describe, expect, it } from "vitest";
import { assertNoKnownSecrets, sanitizeForMcpResponse } from "../response/sanitize";

describe("MCP response sanitizer", () => {
  const env = {
    SUPABASE_JWT_SECRET: "test-jwt-secret-value-do-not-log",
    SECRET_REF_FUFIRE_API_KEY: "test-fufire-key-do-not-log",
    SECRET_REF_SUPABASE_SERVICE_ROLE: "test-service-role-do-not-log",
  } as NodeJS.ProcessEnv;

  it("redacts known secrets in nested structures", () => {
    const input = {
      ok: true,
      nested: {
        token: "prefix test-jwt-secret-value-do-not-log suffix",
        arr: ["test-fufire-key-do-not-log"],
      },
    };
    const output = sanitizeForMcpResponse(input, env);
    const serialized = JSON.stringify(output);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("test-jwt-secret-value-do-not-log");
    expect(serialized).not.toContain("test-fufire-key-do-not-log");
    expect(input.nested.token).toContain("test-jwt-secret-value-do-not-log");
  });

  it("throws if an unsanitized known secret remains", () => {
    expect(() => assertNoKnownSecrets({ leaked: "test-service-role-do-not-log" }, env)).toThrow(/known secret/);
  });
});
