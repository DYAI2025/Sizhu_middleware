import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redactKnownPiiValues } from '../lib/providers/openrouter/piiRedaction';

/**
 * CONTRACT — REQ-LGQ-005 / NFR-3 (PII redaction), REVISED architecture (fidelity).
 *
 * The PII redaction now happens at the RUNNER (the only layer that knows the run's
 * literal birth PII), which value-strips name/birth_date/birth_place/birth_time from
 * the compiled prompt and the QA rubric while KEEPING the template art direction and
 * the operator's scoring rubric. The providers then FORWARD that already-PII-free
 * text faithfully — so the live loop keeps its fidelity AND no raw birth field reaches
 * OpenRouter.
 *
 * This file pins three things:
 *  (1) the runner-side guard (redactKnownPiiValues) strips the literal PII but retains
 *      the surrounding art direction / rubric (anti-tautology: not emptied);
 *  (2) the providers FORWARD the (PII-free) prompt/rubric faithfully — fidelity, the
 *      art direction actually reaches the wire (not dropped);
 *  (3) no-echo: raw PII never lands in returned provenance/metadata, and the
 *      candidate's promptUsed is never forwarded by the QA call.
 */

const PII_NAME = 'SENTINEL_NAME_Zzx9q_Aldebaran_DELETEME';
const PII_BIRTH_DATE = 'SENTINEL_DATE_1991-07-23T_Zzx9q';
const PII_BIRTH_PLACE = 'SENTINEL_PLACE_Vega-IV-Zzx9q_DELETEME';
const ALL_PII = [PII_NAME, PII_BIRTH_DATE, PII_BIRTH_PLACE];

// A prompt as the runner WOULD compile it (raw PII inline) PLUS real art direction.
const COMPILED_PROMPT_WITH_RAW_PII = [
  `Create a watercolor celestial totem for ${PII_NAME},`,
  `born ${PII_BIRTH_DATE} in ${PII_BIRTH_PLACE}.`,
  `Zodiac animal: Dragon. Dominant element: Fire. Intricate linework, gold leaf accents.`,
].join(' ');

const ENV = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: 'test-openrouter-key-DO-NOT-LEAK',
};

interface CapturedRequest {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}
let captured: CapturedRequest[];
let originalFetch: typeof globalThis.fetch;

function installCapturingFetch(kind: 'image' | 'qa') {
  originalFetch = globalThis.fetch;
  captured = [];
  globalThis.fetch = (async (url: any, init?: any) => {
    captured.push({ url: String(url), init: init ?? {} });
    const body =
      kind === 'image'
        ? {
            choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANS' } }], content: 'ok' } }],
            usage: { cost: 0.0387 },
          }
        : { choices: [{ message: { content: JSON.stringify({ score: 90, reason: 'looks great' }) } }], usage: { cost: 0.0012 } };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
  }) as any;
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

function assertNoPiiInBodies(reqs: CapturedRequest[]) {
  expect(reqs.length).toBeGreaterThan(0); // proves we hit the wire (no green-on-zero-calls)
  for (const r of reqs) {
    const body = r.init.body ?? '';
    const headers = JSON.stringify(r.init.headers ?? {});
    for (const sentinel of ALL_PII) {
      expect(body).not.toContain(sentinel);
      expect(headers).not.toContain(sentinel);
      expect(r.url).not.toContain(sentinel);
    }
  }
}

describe('REQ-LGQ-005 (1) — runner redaction strips literal PII but KEEPS art direction', () => {
  it('redactKnownPiiValues removes name/date/place yet retains the art-direction text + derived vars', () => {
    const out = redactKnownPiiValues(COMPILED_PROMPT_WITH_RAW_PII, [PII_NAME, PII_BIRTH_DATE, PII_BIRTH_PLACE]);
    for (const sentinel of ALL_PII) expect(out).not.toContain(sentinel);
    // Anti-tautology: the art direction and derived vars survive (fidelity).
    expect(out).toContain('watercolor celestial totem');
    expect(out).toContain('Intricate linework');
    expect(out).toContain('Dragon');
    expect(out).toContain('Fire');
    // Mutation RED: revert the runner's redactKnownPiiValues call → the compiled
    // prompt still carries the sentinels onto the wire.
  });

  it('is case-insensitive and skips too-short values (no over-redaction)', () => {
    expect(redactKnownPiiValues('Hello ALDEBARAN world', ['aldebaran'])).toBe('Hello [redacted] world');
    expect(redactKnownPiiValues('a quick fox', ['a'])).toBe('a quick fox'); // 1-char skipped
  });
});

describe('REQ-LGQ-005 (2) — image provider FORWARDS the PII-free prompt faithfully (fidelity)', () => {
  it('the art direction of a PII-free prompt actually reaches the outbound body', async () => {
    installCapturingFetch('image');
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const piiFreePrompt = 'Watercolor celestial totem, Dragon motif, Fire palette, intricate gold linework.';
    await provider.generate(piiFreePrompt, 1, 'png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', {
      animal: 'Dragon',
      element: 'Fire',
      iteration: 1,
    });

    const bodies = captured.map((c) => c.init.body ?? '').join('');
    expect(bodies).toContain('Watercolor celestial totem'); // art direction preserved
    expect(bodies).toContain('intricate gold linework');
    // Mutation RED: drop the prompt back to allowlist-reconstruction → the art
    // direction never reaches the body (fidelity lost).
  });
});

describe('REQ-LGQ-005 (3) — image provider NEVER echoes raw PII into provenance/metadata', () => {
  it('even given a still-PII-bearing prompt, returned metadata carries the derived string only', async () => {
    installCapturingFetch('image');
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      COMPILED_PROMPT_WITH_RAW_PII,
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      { animal: 'Dragon', element: 'Fire', dominant_element: 'Fire', iteration: 1 },
    );
    const serializedMeta = JSON.stringify(result[0].metadata);
    for (const sentinel of ALL_PII) expect(serializedMeta).not.toContain(sentinel);
    expect(serializedMeta.toLowerCase()).toContain('dragon'); // provenance is non-empty (anti-tautology)
    // Mutation RED: set metadata.promptUsed = the raw prompt → sentinels echo into provenance.
  });
});

describe('REQ-LGQ-005 (4/5) — QA provider forwards the PII-free rubric, never the candidate promptUsed', () => {
  it('redactKnownPiiValues strips PII from a rubric while keeping the scoring criteria', () => {
    const rubricWithPii = `Rate composition and color harmony for ${PII_NAME} born ${PII_BIRTH_DATE}. 0-100.`;
    const out = redactKnownPiiValues(rubricWithPii, [PII_NAME, PII_BIRTH_DATE]);
    for (const sentinel of [PII_NAME, PII_BIRTH_DATE]) expect(out).not.toContain(sentinel);
    expect(out).toContain('composition and color harmony'); // real rubric retained
  });

  it('forwards a PII-free rubric to the body AND does NOT forward candidate.metadata.promptUsed', async () => {
    installCapturingFetch('qa');
    const mod = await import('../lib/providers/openrouter/openRouterQualityGateProvider');
    const provider = new mod.OpenRouterQualityGateProvider({ env: ENV });

    await provider.evaluate(
      [
        {
          candidateIndex: 0,
          storagePath: 'data:image/png;base64,iVBORw0KGgoAAAANS',
          // promptUsed STILL carries raw PII — it must NOT be forwarded by the QA call.
          metadata: { promptUsed: COMPILED_PROMPT_WITH_RAW_PII, model: 'google/gemini-2.5-flash-image' },
        },
      ],
      82,
      'Rate composition, color harmony and motif clarity 0-100.', // PII-free rubric (runner-redacted)
      'OPENROUTER_API_KEY',
      'google/gemini-2.5-flash',
      { animal: 'Dragon', element: 'Fire', birth_year: 1991, dominant_element: 'Fire' },
      1,
    );

    assertNoPiiInBodies(captured); // promptUsed's raw PII never reached the wire
    const bodies = captured.map((c) => c.init.body ?? '').join('');
    expect(bodies).toContain('color harmony'); // the real rubric WAS forwarded (fidelity)
    // Mutation RED: forward candidate.metadata.promptUsed → its raw PII lands in the QA body.
  });
});
