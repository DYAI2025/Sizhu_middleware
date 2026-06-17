import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * CONTRACT — REQ-LGQ-004 / sec review I-1: the $ ceiling must NOT silently degrade
 * to a no-op when a real OpenRouter response omits `usage.cost`.
 *
 * If usdCost resolves to 0 when the cost field is absent, accumulatedUsd stays 0 and
 * the maxUsdPerRun branch is unreachable — the money guarantee goes dark invisibly.
 * The provider falls back to the belegt per-image estimate so real spend still
 * accrues. This file pins that fallback (and the happy path stays exact).
 */

const ENV = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: 'test-openrouter-key-DO-NOT-LEAK',
};

let originalFetch: typeof globalThis.fetch;
function installFetch(body: unknown) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

const IMAGE = { image_url: { url: 'data:image/png;base64,iVBORw0KGgo' } };

describe('REQ-LGQ-004 — usdCost falls back to a non-zero estimate when usage.cost is absent', () => {
  it('a valid image response WITHOUT usage.cost yields usdCost > 0 (not a silent 0)', async () => {
    installFetch({ choices: [{ message: { images: [IMAGE], content: 'ok' } } ] }); // no usage at all
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const { DEFAULT_IMAGE_PRICE_USD } = await import('../lib/workflow/costCap');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      'Dragon totem',
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      { animal: 'Dragon', iteration: 1 },
    );

    expect(result[0].metadata.usdCost).toBeGreaterThan(0);
    expect(result[0].metadata.usdCost).toBeCloseTo(DEFAULT_IMAGE_PRICE_USD, 5);
    // Mutation RED: revert the fallback to `: 0` → usdCost is 0 and the $ ceiling
    // can never accrue from a real (cost-less) response.
  });

  it('a real usage.cost is used verbatim when present (fallback does not override real data)', async () => {
    installFetch({ choices: [{ message: { images: [IMAGE], content: 'ok' } }], usage: { cost: 0.0387 } });
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      'Dragon totem', 1, 'png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', { animal: 'Dragon' },
    );
    expect(result[0].metadata.usdCost).toBeCloseTo(0.0387, 5);
  });
});
