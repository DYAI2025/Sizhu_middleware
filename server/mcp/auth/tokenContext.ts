export type McpPrincipalType = "anonymous" | "user" | "service_agent";
export type McpRole = "owner" | "admin" | "operator" | "viewer" | null;

export interface McpAuthContext {
  principalType: McpPrincipalType;
  email?: string;
  role?: McpRole;
  aal?: "aal1" | "aal2" | string;
  scopes: string[];
}

function splitScopes(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function parsePrincipal(value: string | undefined): McpPrincipalType {
  if (value === "user" || value === "service_agent") return value;
  return "anonymous";
}

function parseRole(value: string | undefined): McpRole {
  if (value === "owner" || value === "admin" || value === "operator" || value === "viewer") {
    return value;
  }
  return null;
}

export function anonymousMcpContext(): McpAuthContext {
  return { principalType: "anonymous", role: null, scopes: [] };
}

export function getEnvMcpAuthContext(env: NodeJS.ProcessEnv = process.env): McpAuthContext {
  const principalType = parsePrincipal(env.MCP_AGENT_PRINCIPAL_TYPE);
  if (principalType === "anonymous") return anonymousMcpContext();
  return {
    principalType,
    email: env.MCP_AGENT_EMAIL,
    role: parseRole(env.MCP_AGENT_ROLE),
    aal: env.MCP_AGENT_AAL || (principalType === "service_agent" ? "service" : undefined),
    scopes: splitScopes(env.MCP_AGENT_SCOPES),
  };
}
