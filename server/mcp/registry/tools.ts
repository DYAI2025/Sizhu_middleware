import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod/v4";
import { EmptyInputSchema } from "./schemas";
import type { McpAuthContext } from "../auth/tokenContext";
import { getEnvMcpAuthContext } from "../auth/tokenContext";
import { evaluateToolPolicy, getEnvPolicyOptions, type ToolSensitivity } from "../auth/agentPolicy";
import { getHealthStatus } from "../adapters/healthTool";
import { getReadinessStatus } from "../adapters/readinessTool";
import { FufireTestRunInputSchema, runFufireTestRunTool } from "../adapters/fufireTestRunTool";
import { jsonToolResult, policyErrorResult } from "../adapters/result";

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  sensitivity: ToolSensitivity;
  sideEffects: "none" | "external_read" | "external_write";
  handler: (args: Record<string, unknown>, context: McpAuthContext) => Promise<CallToolResult> | CallToolResult;
}

function withPolicy(tool: McpToolDefinition): McpToolDefinition["handler"] {
  return async (args, context) => {
    const decision = evaluateToolPolicy(tool.sensitivity, context, getEnvPolicyOptions());
    if (!decision.allowed) {
      return policyErrorResult(decision.error_code || "MCP_FORBIDDEN", decision.message || "MCP tool denied by policy.");
    }
    return tool.handler(args, context);
  };
}

const healthTool: McpToolDefinition = {
  name: "sizhu_get_health",
  title: "Sizhu Health Check",
  description: "Return the local Sizhu MCP/service liveness status. Public read-only; no secrets or external calls.",
  inputSchema: EmptyInputSchema.shape,
  sensitivity: "public_read",
  sideEffects: "none",
  handler: () => jsonToolResult(getHealthStatus()),
};

const fufireTestRunTool: McpToolDefinition = {
  name: "sizhu_run_fufire_test",
  title: "Sizhu FuFire Test Run",
  description: "Execute server-owned FuFire test-run operations through existing middleware validation. Sensitive admin tool; no client-controlled URL/header/secret steering allowed.",
  inputSchema: FufireTestRunInputSchema.shape,
  sensitivity: "sensitive_admin",
  sideEffects: "external_read",
  handler: (args) => runFufireTestRunTool(args),
};

const readinessTool: McpToolDefinition = {
  name: "sizhu_get_readiness",
  title: "Sizhu Readiness Check",
  description: "Return fail-closed readiness based on required FuFire and Supabase configuration. Returns missing reference names only, never secret values.",
  inputSchema: EmptyInputSchema.shape,
  sensitivity: "session_read",
  sideEffects: "none",
  handler: () => jsonToolResult(getReadinessStatus()),
};

export const SIZHU_MCP_TOOLS: McpToolDefinition[] = [healthTool, readinessTool, fufireTestRunTool];

export function listActiveMcpTools(): McpToolDefinition[] {
  return [...SIZHU_MCP_TOOLS];
}

export async function callRegisteredTool(
  name: string,
  args: Record<string, unknown> = {},
  context: McpAuthContext = getEnvMcpAuthContext(),
): Promise<CallToolResult> {
  const tool = SIZHU_MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    return policyErrorResult("MCP_TOOL_NOT_FOUND", `Unknown MCP tool: ${name}`);
  }
  return withPolicy(tool)(args, context);
}
