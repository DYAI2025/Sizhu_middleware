import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { sanitizeForMcpResponse, assertNoKnownSecrets } from "../response/sanitize";

export function jsonToolResult(value: unknown, isError = false): CallToolResult {
  const sanitized = sanitizeForMcpResponse(value);
  assertNoKnownSecrets(sanitized);
  return {
    isError,
    content: [
      {
        type: "text",
        text: JSON.stringify(sanitized, null, 2),
      },
    ],
  };
}

export function policyErrorResult(error_code: string, message: string): CallToolResult {
  return jsonToolResult({ ok: false, error_code, message }, true);
}
