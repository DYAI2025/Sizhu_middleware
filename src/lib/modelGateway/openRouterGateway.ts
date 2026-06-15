/**
 * OpenRouter model gateway (REQ-A-002) — the single default model gateway.
 *
 * Responsibilities:
 *  - Resolve `OPENROUTER_BASE_URL` / the API key SERVER-SIDE only, via the same
 *    secret-ref/env pattern used for FuFire (`process.env[secretRef]`). The key
 *    value is never returned on status surfaces — only `present: boolean`.
 *  - Expose per-operation model IDs that are configurable via env, with safe
 *    built-in OpenRouter defaults.
 *  - Reject a model that lacks a capability required by an operation with the
 *    controlled `MODEL_CAPABILITY_MISMATCH` error (AC-A-002d).
 *
 * This module reads ONLY non-VITE_ env vars, so its secrets can never be
 * bundled into the browser.
 */

import {
  MODEL_GATEWAY_ERROR_CODES,
  ModelCapability,
  ModelDescriptor,
  ModelGatewayConfig,
  ModelGatewayError,
  ModelGatewayOperation,
  ResolvedGatewayCredentials,
} from './types';

/** OpenRouter default base URL (server-side default; overridable via env). */
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Default secret-ref name the OpenRouter key is read from. */
export const DEFAULT_OPENROUTER_SECRET_REF = 'OPENROUTER_API_KEY';

/**
 * Capabilities each operation REQUIRES. A selected model must declare all of
 * these or the gateway raises MODEL_CAPABILITY_MISMATCH.
 */
export const OPERATION_REQUIRED_CAPABILITIES: Record<
  ModelGatewayOperation,
  readonly ModelCapability[]
> = {
  image_generation: ['image_generation'],
  // The quality gate screens images, so it needs a vision-capable model.
  quality_gate: ['vision'],
};

/**
 * Built-in OpenRouter default model per operation (used when no env override).
 *
 * VERIFIED against the live OpenRouter catalog 2026-06-14 (FX2 live smoke,
 * `npm run smoke:openrouter`, 337 models):
 *  - quality_gate `google/gemini-2.5-flash` — present; a real completion succeeded.
 *  - image_generation `google/gemini-2.5-flash-image` — present. (The prior default
 *    `google/gemini-2.5-flash-image-preview` was STALE — NOT in the live catalog;
 *    the FX2 smoke caught it. The GA slug dropped the `-preview` suffix.)
 * Still overridable via the OPERATION_MODEL_ENV vars. The smoke remains the guard:
 * a future catalog change surfaces as a slug-drift FAIL on the next run.
 */
const DEFAULT_OPERATION_MODELS: Record<ModelGatewayOperation, ModelDescriptor> = {
  image_generation: {
    id: 'google/gemini-2.5-flash-image', // verified present in live catalog (FX2, 2026-06-14)
    capabilities: ['image_generation', 'vision'],
  },
  quality_gate: {
    id: 'google/gemini-2.5-flash', // verified present + completion ok (FX2, 2026-06-14)
    capabilities: ['vision', 'text'],
  },
};

/** Maps an operation to the env var that overrides its model id. */
const OPERATION_MODEL_ENV: Record<ModelGatewayOperation, string> = {
  image_generation: 'OPENROUTER_MODEL_IMAGE_GENERATION',
  quality_gate: 'OPENROUTER_MODEL_QUALITY_GATE',
};

type EnvSource = Record<string, string | undefined>;

/**
 * Resolve the secret-ref name for the OpenRouter key. Honors an explicit
 * `OPENROUTER_API_KEY_SECRET_REF` indirection, else falls back to reading
 * `OPENROUTER_API_KEY` directly. Never returns the value.
 */
function resolveSecretRef(env: EnvSource): string {
  const ref = (env.OPENROUTER_API_KEY_SECRET_REF || '').trim();
  return ref || DEFAULT_OPENROUTER_SECRET_REF;
}

/**
 * Resolve OpenRouter credentials from the SERVER env. Reads the key via the
 * secret-ref indirection (`process.env[secretRef]`) and reports only presence.
 *
 * @param env defaults to `process.env`; injectable for tests.
 */
export function resolveOpenRouterCredentials(
  env: EnvSource = process.env,
): ResolvedGatewayCredentials {
  const baseUrl = (env.OPENROUTER_BASE_URL || '').trim() || DEFAULT_OPENROUTER_BASE_URL;
  const secretRef = resolveSecretRef(env);
  const value = env[secretRef];
  return {
    baseUrl,
    secretRef,
    present: Boolean(value && value.trim().length > 0),
  };
}

/**
 * Resolve the descriptor for an operation, applying an env override of the
 * model id (capabilities follow the default descriptor for that operation,
 * since an operator overriding the id keeps the operation's capability needs).
 */
function resolveModelDescriptor(
  operation: ModelGatewayOperation,
  env: EnvSource,
): ModelDescriptor {
  const base = DEFAULT_OPERATION_MODELS[operation];
  const override = (env[OPERATION_MODEL_ENV[operation]] || '').trim();
  if (!override) return base;
  return { id: override, capabilities: base.capabilities };
}

/**
 * Build the full model-gateway config from the server env. Per-operation model
 * IDs are configurable; OpenRouter is the only provider.
 */
export function buildOpenRouterGatewayConfig(
  env: EnvSource = process.env,
): ModelGatewayConfig {
  const { baseUrl, secretRef } = resolveOpenRouterCredentials(env);
  return {
    providerName: 'OpenRouter',
    baseUrl,
    secretRef,
    models: {
      image_generation: resolveModelDescriptor('image_generation', env),
      quality_gate: resolveModelDescriptor('quality_gate', env),
    },
  };
}

/**
 * Assert a model is capable of an operation. Raises MODEL_CAPABILITY_MISMATCH
 * (AC-A-002d) when the model is missing any required capability.
 */
export function assertModelCapableForOperation(
  operation: ModelGatewayOperation,
  model: ModelDescriptor,
): void {
  const required = OPERATION_REQUIRED_CAPABILITIES[operation];
  const have = new Set(model.capabilities);
  const missing = required.filter((cap) => !have.has(cap));
  if (missing.length > 0) {
    throw new ModelGatewayError(
      MODEL_GATEWAY_ERROR_CODES.MODEL_CAPABILITY_MISMATCH,
      `Model "${model.id}" lacks required capabilit${
        missing.length === 1 ? 'y' : 'ies'
      } [${missing.join(', ')}] for operation "${operation}".`,
      {
        operation,
        modelId: model.id,
        requiredCapabilities: [...required],
        missingCapabilities: missing,
      },
    );
  }
}

/**
 * Select the model id for an operation, validating capabilities first. Returns
 * the model id to pass to the provider seam (which already takes `model: string`).
 *
 * @throws {ModelGatewayError} MODEL_NOT_CONFIGURED if no model resolves;
 *   MODEL_CAPABILITY_MISMATCH if the resolved model is not capable.
 */
export function selectModelForOperation(
  operation: ModelGatewayOperation,
  env: EnvSource = process.env,
): string {
  const config = buildOpenRouterGatewayConfig(env);
  const model = config.models[operation];
  if (!model || !model.id) {
    throw new ModelGatewayError(
      MODEL_GATEWAY_ERROR_CODES.MODEL_NOT_CONFIGURED,
      `No model configured for operation "${operation}".`,
      { operation },
    );
  }
  assertModelCapableForOperation(operation, model);
  return model.id;
}
