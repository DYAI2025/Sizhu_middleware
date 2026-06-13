/**
 * Model gateway types (REQ-A-002).
 *
 * OpenRouter is the single default model gateway. Per-operation model IDs are
 * configurable, and every model carries a declared capability set so a model
 * that lacks a capability required by an operation is rejected with a
 * controlled {@link MODEL_GATEWAY_ERROR_CODES.MODEL_CAPABILITY_MISMATCH} error
 * (AC-A-002d) instead of failing silently at call time.
 */

/** Operations the model gateway routes. Mirrors the provider seams (generation, qa). */
export type ModelGatewayOperation = 'image_generation' | 'quality_gate';

/** Capabilities a model may declare. Operations require a subset of these. */
export type ModelCapability = 'image_generation' | 'vision' | 'text';

/** Controlled error codes raised by the model gateway. */
export const MODEL_GATEWAY_ERROR_CODES = {
  /** A selected model does not declare a capability the operation requires. */
  MODEL_CAPABILITY_MISMATCH: 'MODEL_CAPABILITY_MISMATCH',
  /** No model is configured/known for the requested operation. */
  MODEL_NOT_CONFIGURED: 'MODEL_NOT_CONFIGURED',
} as const;

export type ModelGatewayErrorCode =
  (typeof MODEL_GATEWAY_ERROR_CODES)[keyof typeof MODEL_GATEWAY_ERROR_CODES];

/**
 * A controlled, code-carrying gateway error. Callers branch on `.code`
 * (an `UPPER_SNAKE_CASE` constant, matching the GatewayIssue convention)
 * rather than parsing the message.
 */
export class ModelGatewayError extends Error {
  constructor(
    public readonly code: ModelGatewayErrorCode,
    message: string,
    public readonly details?: {
      operation?: ModelGatewayOperation;
      modelId?: string;
      requiredCapabilities?: ModelCapability[];
      missingCapabilities?: ModelCapability[];
    },
  ) {
    super(message);
    this.name = 'ModelGatewayError';
    // Restore prototype chain (TS target may downlevel Error subclassing).
    Object.setPrototypeOf(this, ModelGatewayError.prototype);
  }
}

/** A model the gateway can route to, with its declared capabilities. */
export interface ModelDescriptor {
  /** OpenRouter model id, e.g. `google/gemini-2.5-flash`. */
  id: string;
  capabilities: readonly ModelCapability[];
}

/**
 * Resolved gateway credentials. The key value is intentionally NOT exposed on
 * status surfaces — only `present` is reported (never echo the value).
 */
export interface ResolvedGatewayCredentials {
  baseUrl: string;
  /** The secret-ref name the key was read from (for diagnostics; not the value). */
  secretRef: string;
  /** Whether a non-empty key value is present in the server env. */
  present: boolean;
}

/** The model-gateway configuration: base URL, per-operation models, capability matrix. */
export interface ModelGatewayConfig {
  providerName: 'OpenRouter';
  baseUrl: string;
  /** The env var the key value lives in (server-side; never VITE_-prefixed). */
  secretRef: string;
  /** Per-operation configured model id. */
  models: Record<ModelGatewayOperation, ModelDescriptor>;
}
