/**
 * Server-owned FuFire operation allowlist + request-body sanitization.
 *
 * This is the security boundary for the operation-only FuFire endpoint
 * (`POST /api/data-requests/fufire/test-run`). It exists to enforce REQ-A-001:
 *
 *  - Only a fixed, server-owned set of operations may be executed. The client
 *    sends an operation *name*, never a URL, path, header name, or secret ref.
 *  - The request body may NEVER steer the outbound URL, the auth header name,
 *    or which env secret is read. Any body field that historically did so
 *    (`fuFireConfig`, `fufirePath`, `baseUrl`, `apiKeySecretRef`,
 *    `authHeaderName`) is stripped here before the request ever reaches the
 *    data service, so it can neither influence execution nor be echoed back.
 *
 * NOTE: This module deliberately does NOT touch the per-operation request body
 * shapes — that is REQ-F-001 / Task T3. T1 only owns the allowlist + the
 * body-cannot-steer guarantee.
 */

/**
 * The operations a client is allowed to request this run. Resolved entirely
 * server-side; the client may only reference these by name.
 *
 * (`chronometry` / `bazi` / `baziTrace` / `wuxing` mirror the keys consumed by
 * {@link FuFireDataService.executeTestRun}.)
 */
export const ALLOWED_FUFIRE_OPERATIONS = [
  "chronometry",
  "bazi",
  "baziTrace",
  "wuxing",
] as const;

export type AllowedFuFireOperation = (typeof ALLOWED_FUFIRE_OPERATIONS)[number];

/**
 * Body fields that must never influence execution. They are stripped from the
 * client payload at the route boundary so the server's outbound URL, header,
 * and secret are resolved exclusively from server config/env (REQ-A-001).
 */
const FORBIDDEN_STEERING_FIELDS = [
  "fuFireConfig",
  "fufirePath",
  "baseUrl",
  "apiKeySecretRef",
  "authHeaderName",
] as const;

export function isAllowedFuFireOperation(op: unknown): op is AllowedFuFireOperation {
  return (
    typeof op === "string" &&
    (ALLOWED_FUFIRE_OPERATIONS as readonly string[]).includes(op)
  );
}

/**
 * Collect the operations a request asks for, from either `requestedOperations`
 * (array) or the single `operation` field. Returns a de-duplicated list.
 */
export function collectRequestedOperations(body: unknown): string[] {
  const source = (body ?? {}) as Record<string, unknown>;
  const ops: string[] = [];

  if (Array.isArray(source.requestedOperations)) {
    for (const op of source.requestedOperations) {
      if (typeof op === "string") ops.push(op);
    }
  }
  if (typeof source.operation === "string") {
    ops.push(source.operation as string);
  }

  return Array.from(new Set(ops));
}

export interface OperationValidationResult {
  ok: boolean;
  /** The operation names that are not in the server-owned allowlist. */
  disallowed: string[];
}

/**
 * Validate every requested operation against the server-owned allowlist. An
 * empty request (no operations) is treated as valid here; the data service
 * decides what to do with an empty operation list. A request that names at
 * least one operation NOT in the allowlist is rejected (REQ-A-001 / AC-A-001d).
 */
export function validateRequestedOperations(body: unknown): OperationValidationResult {
  const requested = collectRequestedOperations(body);
  const disallowed = requested.filter((op) => !isAllowedFuFireOperation(op));
  return { ok: disallowed.length === 0, disallowed };
}

/**
 * Strip all body-controlled steering fields, returning a payload that cannot
 * influence the outbound URL / header / secret. The hostile fields are dropped
 * entirely so they are never executed against AND never echoed back in the
 * response (REQ-A-001 / AC-A-001b). Nested `input` is sanitized too.
 */
export function sanitizeTestRunBody(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const cleaned = stripSteeringFields(body as Record<string, unknown>);
  if (cleaned.input && typeof cleaned.input === "object" && !Array.isArray(cleaned.input)) {
    cleaned.input = stripSteeringFields(cleaned.input as Record<string, unknown>);
  }
  return cleaned;
}

function stripSteeringFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if ((FORBIDDEN_STEERING_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}
