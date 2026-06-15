import { describe, expect, it } from "vitest";
import { evaluateToolPolicy } from "../auth/agentPolicy";
import type { McpAuthContext } from "../auth/tokenContext";

const anonymous: McpAuthContext = { principalType: "anonymous", role: null, scopes: [] };
const viewer: McpAuthContext = { principalType: "user", email: "v@example.test", role: "viewer", aal: "aal2", scopes: [] };
const adminAal1: McpAuthContext = { principalType: "user", email: "a@example.test", role: "admin", aal: "aal1", scopes: [] };
const adminAal2: McpAuthContext = { principalType: "user", email: "a@example.test", role: "admin", aal: "aal2", scopes: [] };
const serviceAgent: McpAuthContext = { principalType: "service_agent", role: "operator", aal: "service", scopes: [] };

describe("MCP agent policy", () => {
  it("allows public_read for anonymous", () => {
    expect(evaluateToolPolicy("public_read", anonymous).allowed).toBe(true);
  });

  it("denies session_read for anonymous when auth is required", () => {
    const decision = evaluateToolPolicy("session_read", anonymous, { requireAuth: true });
    expect(decision.allowed).toBe(false);
    expect(decision.error_code).toBe("MCP_AUTH_REQUIRED");
  });

  it("allows session_read for service_agent", () => {
    expect(evaluateToolPolicy("session_read", serviceAgent).allowed).toBe(true);
  });

  it("denies sensitive_admin to viewer", () => {
    const decision = evaluateToolPolicy("sensitive_admin", viewer);
    expect(decision.allowed).toBe(false);
    expect(decision.error_code).toBe("MCP_FORBIDDEN");
  });

  it("denies sensitive_admin to admin without aal2 when MFA is required", () => {
    const decision = evaluateToolPolicy("sensitive_admin", adminAal1, { requireMfaForSensitive: true });
    expect(decision.allowed).toBe(false);
    expect(decision.error_code).toBe("MCP_MFA_REQUIRED");
  });

  it("allows sensitive_admin to admin with aal2", () => {
    const decision = evaluateToolPolicy("sensitive_admin", adminAal2, { requireMfaForSensitive: true });
    expect(decision.allowed).toBe(true);
  });

  it("allows sensitive_admin to service operator without user MFA", () => {
    const decision = evaluateToolPolicy("sensitive_admin", serviceAgent, { requireMfaForSensitive: true });
    expect(decision.allowed).toBe(true);
  });

  it("denies dangerous_external_effect by default", () => {
    const decision = evaluateToolPolicy("dangerous_external_effect", adminAal2, { allowDangerousTools: false });
    expect(decision.allowed).toBe(false);
    expect(decision.error_code).toBe("MCP_DISABLED_BY_POLICY");
  });
});
