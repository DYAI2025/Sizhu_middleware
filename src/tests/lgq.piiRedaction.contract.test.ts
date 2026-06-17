import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RED CONTRACT — REQ-LGQ-005 / NFR-3 (PII redaction at the OUTBOUND OpenRouter
 * request body — carrier CORRECTED per spec-sanity F2).
 * Slice A · feat/sizhu-live-generate-qa-loop · TDD Phase 1 (written before impl).
 *
 * Contract surface (T-LGQ-3 / T-LGQ-4, PRD §7):
 *   module:  src/lib/providers/openrouter/openRouterImageGenerationProvider.ts
 *     export class OpenRouterImageGenerationProvider implements ImageGenerationProvider
 *   module:  src/lib/providers/openrouter/openRouterQualityGateProvider.ts
 *     export class OpenRouterQualityGateProvider implements QualityGateProvider
 *   Both call OpenRouter via global fetch (POST {baseUrl}/chat/completions) and read
 *   the key server-side via resolveOpenRouterCredentials (env injected through the
 *   secret-ref). The PROMPT passed to generate()/evaluate() is the carrier the wire
 *   actually receives.
 *
 * F2 (belegt, runner.ts:235-239,252,281-282,306): raw PII (name/birth_date/
 * birth_place) rides the COMPILED PROMPT STRING (first arg to generate(), and the
 * vision-QA text). `customerData`/`resolvedVariables` carry ONLY non-PII derived
 * vars. So a sentinel guard written against customerData would be GREEN-WHILE-LEAKING.
 * This guard asserts on the CAPTURED OUTBOUND request body — the real wire.
 *
 * Kritische semantische Glättung — REQ-LGQ-005 (BOUNDARY: outbound HTTP egress to
 * a third party carrying customer birth data):
 *   These:      "We pass non-PII derived vars to the provider, so no PII leaks."
 *   Gegenthese: That claim is GREEN if you only inspect the derived-var args — yet
 *               the raw name/birth_date/birth_place are embedded in the COMPILED
 *               PROMPT (the first arg), which is exactly what gets serialized into
 *               the outbound `messages[].content`. The customer's PII crosses the
 *               wire to OpenRouter while every derived-var assertion stays green.
 *               (User value — "no PII leak" — is ZERO; this is the prior baseline's
 *               P2 origin defect repeating on a new path.)
 *   Schärfung:  Seed the prompt with UNIQUE sentinel PII tokens, run the REAL
 *               provider with a stubbed fetch, and assert the sentinels appear in
 *               NO outbound request body / header / system prompt — for BOTH
 *               image-gen AND vision-QA. The provider must STRIP/refuse raw birth
 *               fields from the prompt before it reaches fetch.
 *
 * VCHK (Vision value-check): a real customer's birth name/date/place never leaves
 *   the server to a third-party model — the operator can run live without leaking PII.
 *
 * Evidence class: integration-fake (mocked HTTP). The real-boundary assertion on
 * the actual OpenRouter body is owned by T-LGQ-9 (smoke). This file does NOT promote.
 *
 * EXPECTED NOW: RED — the openrouter provider modules do not exist yet (missing impl).
 */

// Unique sentinels — astronomically unlikely to occur incidentally in a prompt/header.
const PII_NAME = 'SENTINEL_NAME_Zzx9q_Aldebaran_DELETEME';
const PII_BIRTH_DATE = 'SENTINEL_DATE_1991-07-23T_Zzx9q';
const PII_BIRTH_PLACE = 'SENTINEL_PLACE_Vega-IV-Zzx9q_DELETEME';
const ALL_PII = [PII_NAME, PII_BIRTH_DATE, PII_BIRTH_PLACE];

// A prompt as the runner WOULD compile it today: raw PII rendered inline (this is
// the real leak path per F2). The provider under test must NOT forward these raw
// fields to OpenRouter. Non-PII derived vars (animal/element) are allowed through.
const COMPILED_PROMPT_WITH_RAW_PII = [
  `Create a celestial totem for ${PII_NAME},`,
  `born ${PII_BIRTH_DATE} in ${PII_BIRTH_PLACE}.`,
  `Zodiac animal: Dragon. Dominant element: Fire. Birth year: 1991.`,
].join(' ');

interface CapturedRequest {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

const ENV = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: 'test-openrouter-key-DO-NOT-LEAK',
};

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
            choices: [
              {
                message: {
                  images: [
                    { image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANS' } },
                  ],
                  content: 'ok',
                },
              },
            ],
            usage: { cost: 0.0387 },
          }
        : {
            choices: [
              {
                message: {
                  content: JSON.stringify({ score: 90, reason: 'looks great', accepted: true }),
                },
              },
            ],
            usage: { cost: 0.0012 },
          };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as any;
  }) as any;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

function assertNoPiiAnywhere(reqs: CapturedRequest[]) {
  expect(reqs.length).toBeGreaterThan(0); // proves we actually hit the wire (no green-on-zero-calls)
  for (const r of reqs) {
    const body = r.init.body ?? '';
    const headers = JSON.stringify(r.init.headers ?? {});
    for (const sentinel of ALL_PII) {
      expect(body).not.toContain(sentinel); // outbound body (messages/system prompt)
      expect(headers).not.toContain(sentinel); // headers
      expect(r.url).not.toContain(sentinel); // url/query
    }
  }
}

describe('REQ-LGQ-005a/c — image-gen outbound body carries NO raw birth PII (the real carrier, F2)', () => {
  it('strips name/birth_date/birth_place from the prompt before it reaches the OpenRouter wire', async () => {
    installCapturingFetch('image');
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    await provider.generate(
      COMPILED_PROMPT_WITH_RAW_PII, // <-- the carrier (first arg) — F2
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      // derived-vars arg: even if these were PII they are NOT the F2 carrier; the
      // assertion targets the prompt-in-body, not this arg (would be green-while-leaking).
      { animal: 'Dragon', element: 'Fire', dominant_element: 'Fire', iteration: 1 },
    );

    assertNoPiiAnywhere(captured);
    // The derived (non-PII) content MAY still appear — proves we asserted on a real
    // leak path, not a prompt that was emptied entirely (anti-tautology).
    const allBodies = captured.map((c) => c.init.body ?? '').join('');
    expect(allBodies.toLowerCase()).toContain('dragon');
    // Mutation RED (the real leak, F2): if the provider forwards the prompt verbatim
    // (no redaction), the raw SENTINEL_NAME/DATE/PLACE land in messages[].content and
    // assertNoPiiAnywhere fails. Reverting any redaction-of-prompt step → RED.
  });
});

describe('REQ-LGQ-005a/c — vision-QA outbound body carries NO raw birth PII (second carrier, F2)', () => {
  it('strips raw birth PII from the QA text/prompt before the vision call', async () => {
    installCapturingFetch('qa');
    const mod = await import('../lib/providers/openrouter/openRouterQualityGateProvider');
    const provider = new mod.OpenRouterQualityGateProvider({ env: ENV });

    await provider.evaluate(
      [
        {
          candidateIndex: 0,
          // Candidate image data URI — and, critically, prompt provenance that the
          // QA call must NOT echo raw to the wire.
          storagePath: 'data:image/png;base64,iVBORw0KGgoAAAANS',
          metadata: { promptUsed: COMPILED_PROMPT_WITH_RAW_PII, model: 'google/gemini-2.5-flash-image' },
        },
      ],
      82,
      // qaPrompt itself could be templated with raw PII in a misimplementation —
      // assert that even a PII-bearing qaPrompt is redacted before egress.
      `Score this totem for ${PII_NAME} born ${PII_BIRTH_DATE} in ${PII_BIRTH_PLACE}. Return JSON {score,reason}.`,
      'OPENROUTER_API_KEY',
      'google/gemini-2.5-flash',
      { animal: 'Dragon', element: 'Fire', birth_year: 1991, dominant_element: 'Fire' },
      1,
    );

    assertNoPiiAnywhere(captured);
    // Mutation RED: forwarding qaPrompt/promptUsed verbatim → raw PII in the QA body.
  });
});

describe('REQ-LGQ-005b — sentinel PII appears on NO returned surface (no-echo, P2 carry-over)', () => {
  it('image provider returns metadata/candidates free of raw birth PII', async () => {
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

    const serialized = JSON.stringify(result);
    for (const sentinel of ALL_PII) {
      expect(serialized).not.toContain(sentinel);
    }
    // Mutation RED: echoing prompt verbatim into metadata.promptUsed (the prior
    // baseline's sanitizedRequestMetadata.{input} defect class) → RED here.
  });
});
