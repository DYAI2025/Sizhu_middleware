import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * CONTRACT — REQ-LGQ-007 / code review I2: the image provider must NOT fan a single
 * returned image out into N "distinct" candidates. Each candidate must be a real,
 * distinct image; if the API returns fewer images than requested, emit fewer honest
 * candidates (never duplicate one image, which would inflate the count-cap accounting
 * and make the QA gate score byte-identical dupes).
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

function img(url: string) {
  return { image_url: { url } };
}

describe('REQ-LGQ-007 — no single-image fan-out into N candidates', () => {
  it('requesting 3 candidates but 1 real image returned → exactly 1 candidate (no duplication)', async () => {
    installFetch({
      choices: [{ message: { images: [img('data:image/png;base64,AAA')], content: 'ok' } }],
      usage: { cost: 0.0387 },
    });
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      'Dragon totem', 3, 'png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', { animal: 'Dragon' },
    );

    expect(result).toHaveLength(1); // NOT 3 copies of the same image
    expect(result[0].storagePath).toBe('data:image/png;base64,AAA');
    // Mutation RED: restore `images[i] ?? images[0]` / `choices[i] ?? choices[0]`
    // padding → result.length === 3 with three identical storagePaths.
  });

  it('3 distinct images returned (single multi-image choice) → 3 distinct candidates', async () => {
    installFetch({
      choices: [
        {
          message: {
            images: [
              img('data:image/png;base64,AAA'),
              img('data:image/png;base64,BBB'),
              img('data:image/png;base64,CCC'),
            ],
            content: 'ok',
          },
        },
      ],
      usage: { cost: 0.1161 },
    });
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      'Dragon totem', 3, 'png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', { animal: 'Dragon' },
    );

    expect(result).toHaveLength(3);
    expect(new Set(result.map((r) => r.storagePath)).size).toBe(3); // all distinct
  });
});
