import type { McpAuthContext } from "./tokenContext";

export type ToolSensitivity =
  | "public_read"
  | "session_read"
  | "sensitive_admin"
  | "dangerous_external_effect";

export interface ToolPolicyDecision {
  allowed: boolean;
  error_code?: "MCP_AUTH_REQUIRED" | "MCP_FORBIDDEN" | "MCP_MFA_REQUIRED" | "MCP_DISABLED_BY_POLICY";
  message?: string;
}

export interface McpPolicyOptions {
  requireAuth?: boolean;
  requireMfaForSensitive?: boolean;
  allowDangerousTools?: boolean;
}

function flag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

export function getEnvPolicyOptions(env: NodeJS.ProcessEnv = process.env): McpPolicyOptions {
  return {
    requireAuth: flag(env.MCP_REQUIRE_AUTH, true),
    requireMfaForSensitive: flag(env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS, true),
    allowDangerousTools: flag(env.MCP_ALLOW_DANGEROUS_TOOLS, false),
  };
}

function isAuthenticated(context: McpAuthContext): boolean {
  return context.principalType === "user" || context.principalType === "service_agent";
}

function isAdminRole(role: McpAuthContext["role"]): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

export function evaluateToolPolicy(
  sensitivity: ToolSensitivity,
  context: McpAuthContext,
  options: McpPolicyOptions = {},
): ToolPolicyDecision {
  const requireAuth = options.requireAuth ?? true;
  const requireMfaForSensitive = options.requireMfaForSensitive ?? true;
  const allowDangerousTools = options.allowDangerousTools ?? false;

  if (sensitivity === "public_read") return { allowed: true };

  if (requireAuth && !isAuthenticated(context)) {
    return {
      allowed: false,
      error_code: "MCP_AUTH_REQUIRED",
      message: "MCP authentication context required for this tool.",
    };
  }

  if (sensitivity === "session_read") return { allowed: true };

  if (sensitivity === "dangerous_external_effect" && !allowDangerousTools) {
    return {
      allowed: false,
      error_code: "MCP_DISABLED_BY_POLICY",
      message: "Dangerous/external-effect MCP tools are disabled by policy.",
    };
  }

  if (sensitivity === "sensitive_admin" || sensitivity === "dangerous_external_effect") {
    if (!isAdminRole(context.role)) {
      return {
        allowed: false,
        error_code: "MCP_FORBIDDEN",
        message: "Admin/operator role required for this MCP tool.",
      };
    }
    if (
      requireMfaForSensitive &&
      context.principalType === "user" &&
      context.aal !== "aal2"
    ) {
      return {
        allowed: false,
        error_code: "MCP_MFA_REQUIRED",
        message: "MFA aal2 required for this MCP tool.",
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    error_code: "MCP_FORBIDDEN",
    message: "Tool policy did not match an allowed branch.",
  };
}
