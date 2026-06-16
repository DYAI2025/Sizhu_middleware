import { z } from "zod/v4";
import { FuFireDataService } from "../../services/fufireDataService";
import { sanitizeTestRunBody, validateRequestedOperations } from "../../services/fufireOperations";
import { jsonToolResult, policyErrorResult } from "./result";

export const FufireTestRunInputSchema = z
  .object({
    birthDate: z.string().optional(),
    birthTime: z.string().optional(),
    birthTimeKnown: z.boolean().optional(),
    manualLat: z.number().optional(),
    manualLon: z.number().optional(),
    manualTimezone: z.string().optional(),
    standard: z.string().optional(),
    boundary: z.string().optional(),
    ambiguousTime: z.string().optional(),
    nonexistentTime: z.string().optional(),
    calendarPolicy: z.string().optional(),
    locale: z.string().optional(),
    requestedOperations: z.array(z.string()).optional(),
    operation: z.string().optional(),
    promptTemplate: z.string().optional(),
  })
  .strict();

export async function runFufireTestRunTool(args: Record<string, unknown>) {
  const parsed = FufireTestRunInputSchema.safeParse(args);
  if (!parsed.success) {
    return policyErrorResult("MCP_INVALID_INPUT", parsed.error.message);
  }

  const opCheck = validateRequestedOperations(parsed.data);
  if (!opCheck.ok) {
    return jsonToolResult(
      {
        ok: false,
        error_code: "FUFIRE_OPERATION_NOT_ALLOWED",
        message: `Operation(s) not allowed: ${opCheck.disallowed.join(", ")}`,
        disallowedOperations: opCheck.disallowed,
        retryable: false,
      },
      true,
    );
  }

  const safeBody = sanitizeTestRunBody(parsed.data);
  const service = new FuFireDataService();
  const result = await service.executeTestRun(safeBody);
  return jsonToolResult(result, result.readinessStatus === "NOT_READY");
}
