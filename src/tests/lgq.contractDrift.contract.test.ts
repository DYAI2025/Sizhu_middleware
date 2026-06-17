import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RED CONTRACT — REQ-LGQ-007 (No-fake-success / contract-drift guard).
 * Slice A · feat/sizhu-live-generate-qa-loop · TDD Phase 1 (written before impl).
 *
 * Contract surface (T-LGQ-2..4, PRD §7):
 *   src/lib/providers/openrouter/openRouterImageGenerationProvider.ts
 *     → OpenRouterImageGenerationProvider
 *   src/lib/providers/openrouter/openRouterQualityGateProvider.ts
 *     → OpenRouterQualityGateProvider
 *   src/lib/providers/openrouter/errors.ts (or co-located)
 *     → ContractDriftError  (thrown when the response shape diverges)
 *   Both providers, on a divergent/garbage response OR a non-2xx HTTP status,
 *   MUST throw a controlled error — never fabricate a candidate/score.
 *
 * Kritische semantische Glättung — REQ-LGQ-007 (BOUNDARY: parsing a third-party
 * model's HTTP response we do not control):
 *   These:      "The provider parses choices[0].message.images[0].image_url.url
 *               and returns candidates."
 *   Gegenthese: When OpenRouter changes its shape (or returns 402 from an oversized
 *               max_tokens — the belegt R9 trap), naive parsing yields `undefined`
 *               and the provider could silently substitute a placeholder image /
 *               default-pass score. The run reaches `pod_ready` with a FAKE accepted
 *               artifact — green pipeline, zero real value, violates value-promise #2.
 *   Schärfung:  Feed crafted DIVERGENT and NON-2XX responses; assert the provider
 *               THROWS ContractDriftError (or a controlled error) and returns NO
 *               accepted candidate/passing score. And assert the happy path still
 *               parses (both branches — not a guard that always throws).
 *
 * VCHK (Vision value-check): an accepted outcome reflects a REAL model success; the
 *   operator is never shown a fabricated pass when the upstream contract broke.
 *
 * Evidence class: integration-fake (crafted responses). The live 402/slug-drift
 * behaviour is additionally proven by T-LGQ-9 smoke. This file does NOT promote.
 *
 * EXPECTED NOW: RED — the openrouter provider modules do not exist yet (missing impl).
 */

const ENV = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: 'test-openrouter-key-DO-NOT-LEAK',
};

let originalFetch: typeof globalThis.fetch;

function installFetch(response: {
  ok: boolean;
  status: number;
  body: unknown;
}) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
    text: async () => JSON.stringify(response.body),
  })) as any;
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

const VALID_IMAGE_RESPONSE = {
  choices: [
    {
      message: {
        images: [{ image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANS' } }],
        content: 'ok',
      },
    },
  ],
  usage: { cost: 0.0387 },
};

// Divergent shapes that MUST NOT be coerced into a fake success.
const DRIFT_SHAPES: Array<[string, unknown]> = [
  ['empty choices', { choices: [], usage: { cost: 0 } }],
  ['no images array', { choices: [{ message: { content: 'sorry no image' } }], usage: { cost: 0.0387 } }],
  ['null image_url', { choices: [{ message: { images: [{ image_url: null }] } }] }],
  ['missing image_url.url', { choices: [{ message: { images: [{ image_url: {} }] } }] }],
  ['garbage top-level', { unexpected: 'totally different schema', error: { message: 'model overloaded' } }],
];

describe('REQ-LGQ-007a — image provider FAILS LOUD on a divergent response shape', () => {
  for (const [label, body] of DRIFT_SHAPES) {
    it(`throws (no fabricated image) for: ${label}`, async () => {
      installFetch({ ok: true, status: 200, body });
      const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
      const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

      let caught: unknown;
      try {
        await provider.generate(
          'Dragon totem, element Fire',
          1,
          'png',
          'hd',
          'google/gemini-2.5-flash-image',
          'OPENROUTER_API_KEY',
          { animal: 'Dragon', element: 'Fire', iteration: 1 },
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      // It must be a CONTROLLED contract-drift error, not an incidental TypeError
      // from `undefined.url`. The error name/type must be deliberate.
      expect((caught as Error).name).toMatch(/ContractDrift|OpenRouterContract|ContractError/);
      // Mutation RED: replace the throw with `return [{ storagePath: PLACEHOLDER, ... }]`
      // → a fake image is fabricated and this assertion fails (caught is undefined).
    });
  }
});

describe('REQ-LGQ-007b — image provider FAILS LOUD on a non-2xx (e.g. the belegt 402 from oversized max_tokens)', () => {
  it('throws a controlled error on HTTP 402 — does not record a fake-accepted artifact', async () => {
    installFetch({ ok: false, status: 402, body: { error: { message: 'can only afford 337' } } });
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    await expect(
      provider.generate('Dragon totem', 1, 'png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', {
        animal: 'Dragon',
        iteration: 1,
      }),
    ).rejects.toThrow();
    // Mutation RED: swallow the non-2xx and return a placeholder → no rejection.
  });
});

describe('REQ-LGQ-007a — QA provider FAILS LOUD on a divergent score response (never default-pass)', () => {
  it('throws (no fabricated passing score) when the score field is absent/garbage', async () => {
    installFetch({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: 'the model rambled with no JSON score at all' } }] },
    });
    const mod = await import('../lib/providers/openrouter/openRouterQualityGateProvider');
    const provider = new mod.OpenRouterQualityGateProvider({ env: ENV });

    let caught: unknown;
    try {
      await provider.evaluate(
        [{ candidateIndex: 0, storagePath: 'data:image/png;base64,iVBOR', metadata: {} }],
        82,
        'Return JSON {score,reason}',
        'OPENROUTER_API_KEY',
        'google/gemini-2.5-flash',
        { animal: 'Dragon' },
        1,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toMatch(/ContractDrift|OpenRouterContract|ContractError/);
    // Mutation RED: on parse-miss return `[{ score: minScore, status: 'accepted' }]`
    // (silent default-pass) → caught is undefined and this fails.
  });
});

describe('REQ-LGQ-007 — both providers PARSE the valid happy path (anti-tautology: guard is not always-throw)', () => {
  it('image provider returns a seam-shaped candidate on the belegt valid response', async () => {
    installFetch({ ok: true, status: 200, body: VALID_IMAGE_RESPONSE });
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      'Dragon totem, element Fire',
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      { animal: 'Dragon', element: 'Fire', iteration: 1 },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].storagePath).toMatch(/^data:image\/png;base64,/); // belegt R9 shape
    expect(result[0].metadata.model).toBe('google/gemini-2.5-flash-image');
    // Proves the throw-on-drift is shape-specific, not a blanket failure.
  });
});
