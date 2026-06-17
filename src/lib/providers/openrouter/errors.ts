/**
 * Controlled errors for the live OpenRouter providers (REQ-LGQ-007 — no-fake-success).
 *
 * The image-generation and quality-gate providers parse the HTTP response of a
 * third-party model we do NOT control. When that response shape diverges (the
 * model returns no image, a null `image_url`, a different schema) or the HTTP
 * status is non-2xx (e.g. the belegt R9 trap: HTTP 402 from an oversized
 * `max_tokens`), naive parsing yields `undefined`. The providers MUST fail loud
 * with a *controlled, named* error here — never fabricate a placeholder image or
 * a default-pass score, which would let a run reach `pod_ready` with a fake
 * accepted artifact (value-promise #2 violation).
 *
 * The `.name` is set deliberately (not an incidental `TypeError` from
 * `undefined.url`) so callers and the contract guard can branch on it.
 */

/** Stable, code-carrying error names. */
export const OPENROUTER_CONTRACT_ERROR_NAME = 'OpenRouterContractError' as const;

/** Diagnostic codes carried by {@link OpenRouterContractError.code}. */
export const OPENROUTER_CONTRACT_ERROR_CODES = {
  /** A non-2xx HTTP status from OpenRouter (incl. the belegt 402 from oversized max_tokens). */
  HTTP_NOT_OK: 'OPENROUTER_HTTP_NOT_OK',
  /** The 2xx response body did not match the expected contract shape. */
  RESPONSE_SHAPE_DRIFT: 'OPENROUTER_RESPONSE_SHAPE_DRIFT',
} as const;

export type OpenRouterContractErrorCode =
  (typeof OPENROUTER_CONTRACT_ERROR_CODES)[keyof typeof OPENROUTER_CONTRACT_ERROR_CODES];

/**
 * Thrown when an OpenRouter response diverges from the contract we parse, or the
 * HTTP status is non-2xx. Carrying a deliberate `.name` is what turns a silent
 * `undefined`-coercion into a fail-loud signal (REQ-LGQ-007).
 *
 * NOTE: the error message intentionally carries ONLY structural diagnostics
 * (operation, status, code) — never the prompt, the response body, or any
 * customer PII (REQ-LGQ-005 / NFR-3).
 */
export class OpenRouterContractError extends Error {
  constructor(
    public readonly code: OpenRouterContractErrorCode,
    message: string,
    public readonly details?: {
      operation?: 'image_generation' | 'quality_gate';
      httpStatus?: number;
      modelId?: string;
    },
  ) {
    super(message);
    this.name = OPENROUTER_CONTRACT_ERROR_NAME;
    // Restore prototype chain (TS target may downlevel Error subclassing).
    Object.setPrototypeOf(this, OpenRouterContractError.prototype);
  }
}

/**
 * Alias name retained for the contract-drift vocabulary. Some specs/tests refer
 * to the failure mode as a "contract drift"; this is the same controlled error
 * with the same fail-loud semantics. Exported so either name resolves.
 */
export const ContractDriftError = OpenRouterContractError;
