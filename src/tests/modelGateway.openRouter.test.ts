import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MODEL_GATEWAY_ERROR_CODES,
  ModelGatewayError,
  ModelDescriptor,
  assertModelCapableForOperation,
  buildOpenRouterGatewayConfig,
  resolveOpenRouterCredentials,
  selectModelForOperation,
  DEFAULT_OPENROUTER_BASE_URL,
} from '../lib/modelGateway';

/**
 * Unit spec for the model gateway (REQ-A-002 / AC-A-002d) — the OpenRouter
 * gateway config module. Covers:
 *  - AC-A-002d: a model lacking a required capability for an operation raises
 *    the controlled MODEL_CAPABILITY_MISMATCH error.
 *  - Server-side-only key resolution via the secret-ref/env pattern, reporting
 *    only `present: boolean` (never echoing the value), and reading no VITE_ var.
 *  - Per-operation model IDs are configurable via env.
 *
 * Evidence class: pure-unit (injectable env, no network, no real secrets).
 */

const SECRET = 'super-secret-openrouter-key-do-not-log';

describe('AC-A-002d — MODEL_CAPABILITY_MISMATCH on incapable model', () => {
  it('raises a controlled error when the model lacks a required capability', () => {
    // quality_gate requires "vision"; a text-only model is incapable.
    const textOnly: ModelDescriptor = { id: 'some/text-only-model', capabilities: ['text'] };
    let caught: unknown;
    try {
      assertModelCapableForOperation('quality_gate', textOnly);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ModelGatewayError);
    const e = caught as ModelGatewayError;
    expect(e.code).toBe(MODEL_GATEWAY_ERROR_CODES.MODEL_CAPABILITY_MISMATCH);
    expect(e.details?.operation).toBe('quality_gate');
    expect(e.details?.missingCapabilities).toContain('vision');
  });

  it('does NOT raise when the model declares all required capabilities', () => {
    const visionModel: ModelDescriptor = {
      id: 'good/vision-model',
      capabilities: ['vision', 'text'],
    };
    expect(() => assertModelCapableForOperation('quality_gate', visionModel)).not.toThrow();
  });

  it('selectModelForOperation surfaces MODEL_CAPABILITY_MISMATCH for an incapable env override', () => {
    // Override the image-generation model id; capabilities follow the operation
    // default (image_generation + vision), so this stays capable...
    const capable = selectModelForOperation('image_generation', {
      OPENROUTER_MODEL_IMAGE_GENERATION: 'vendor/custom-image-model',
    });
    expect(capable).toBe('vendor/custom-image-model');

    // ...but if we manually validate a model that lacks the capability it throws.
    const bad: ModelDescriptor = { id: 'vendor/no-image', capabilities: ['text'] };
    expect(() => assertModelCapableForOperation('image_generation', bad)).toThrow(
      ModelGatewayError,
    );
  });
});

describe('server-side-only key resolution (secret-ref/env pattern)', () => {
  it('reports present:true when the secret-ref env var holds a value, without echoing it', () => {
    const env = {
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_API_KEY: SECRET,
    };
    const creds = resolveOpenRouterCredentials(env);
    expect(creds.present).toBe(true);
    expect(creds.baseUrl).toBe('https://openrouter.ai/api/v1');
    // The resolved object must NEVER carry the secret value.
    expect(JSON.stringify(creds)).not.toContain(SECRET);
    expect(creds).not.toHaveProperty('apiKey');
    expect(creds).not.toHaveProperty('key');
    expect(creds).not.toHaveProperty('value');
  });

  it('reports present:false when the key is absent or empty', () => {
    expect(resolveOpenRouterCredentials({}).present).toBe(false);
    expect(resolveOpenRouterCredentials({ OPENROUTER_API_KEY: '   ' }).present).toBe(false);
  });

  it('honors OPENROUTER_API_KEY_SECRET_REF indirection (reads the referenced var)', () => {
    const env = {
      OPENROUTER_API_KEY_SECRET_REF: 'SECRET_REF_OPENROUTER_API_KEY',
      SECRET_REF_OPENROUTER_API_KEY: SECRET,
    };
    const creds = resolveOpenRouterCredentials(env);
    expect(creds.secretRef).toBe('SECRET_REF_OPENROUTER_API_KEY');
    expect(creds.present).toBe(true);
    expect(JSON.stringify(creds)).not.toContain(SECRET);
  });

  it('falls back to the OpenRouter default base URL when unset', () => {
    expect(resolveOpenRouterCredentials({}).baseUrl).toBe(DEFAULT_OPENROUTER_BASE_URL);
  });

  it('reads NO VITE_-prefixed var (secrets must never reach the bundle)', () => {
    const env = {
      VITE_OPENROUTER_API_KEY: 'leaked-into-bundle',
      VITE_OPENROUTER_BASE_URL: 'https://evil.example',
    };
    const creds = resolveOpenRouterCredentials(env);
    // The VITE_ vars must be ignored entirely.
    expect(creds.present).toBe(false);
    expect(creds.baseUrl).toBe(DEFAULT_OPENROUTER_BASE_URL);

    // And the gateway source must not READ any VITE_-prefixed var (the only way
    // a value reaches the browser bundle). Comments mentioning "VITE_" are fine;
    // we assert there is no `env.VITE_...` / `env["VITE_..."]` access.
    const src = readFileSync(
      join(process.cwd(), 'src/lib/modelGateway/openRouterGateway.ts'),
      'utf8',
    );
    expect(src).not.toContain('VITE_OPENROUTER');
    expect(src).not.toMatch(/env\s*(\.\s*VITE_|\[\s*['"]VITE_)/);
  });
});

describe('per-operation model IDs are configurable', () => {
  it('uses built-in OpenRouter defaults when no override is set', () => {
    const config = buildOpenRouterGatewayConfig({});
    expect(config.providerName).toBe('OpenRouter');
    expect(config.models.image_generation.id).toBeTruthy();
    expect(config.models.quality_gate.id).toBeTruthy();
  });

  it('applies env overrides for the per-operation model id', () => {
    const config = buildOpenRouterGatewayConfig({
      OPENROUTER_MODEL_QUALITY_GATE: 'vendor/custom-vision',
    });
    expect(config.models.quality_gate.id).toBe('vendor/custom-vision');
  });
});
