import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RED CONTRACT — REQ-LGQ-006 (Per-candidate provenance + per-run cost & rejection
 * telemetry; provenance is PII-safe).
 * Slice A · feat/sizhu-live-generate-qa-loop · TDD Phase 1 (written before impl).
 *
 * Contract surface (T-LGQ-3/4/5, PRD §6/§7; OQ-3 RESOLVED = non-PII derived vars only):
 *   - ImageArtifact (src/types.ts) gains: modelUsed: string; promptVarsProvenance: string
 *       (keeps existing qaScore). Threaded via ArtifactService.createArtifactsFromSwarm.
 *   - Run telemetry on the run RESULT (server run path): realCostUsd: number;
 *       rejectionRate: number; imageCallCount: number; capStopped: boolean.
 *       Exposed by the server run service result (T-LGQ-6), summing real usage.cost.
 *   - Image provider candidate metadata carries usdCost (real usage.cost per call)
 *       so the run can sum it: metadata.usdCost: number.
 *
 * Because the full server run service is built later (T-LGQ-6), this file pins the
 * two INDEPENDENT, already-buildable contracts:
 *   (1) the real image provider surfaces per-candidate provenance (model + usdCost)
 *       and NO raw PII (OQ-3); and
 *   (2) ArtifactService threads provenance fields onto every artifact.
 * The end-to-end telemetry sum (realCostUsd/rejectionRate) is owned by the run
 * endpoint contract (lgq.runEndpoint.contract) + the smoke (T-LGQ-9).
 *
 * Kritische semantische Glättung — REQ-LGQ-006 (BOUNDARY: provenance derived from a
 * real model call that also touched customer PII):
 *   These:      "Each artifact records its model + a QA score → provenance exists."
 *   Gegenthese: Provenance exists but is USELESS or HARMFUL — either it records the
 *               raw rendered prompt (re-leaking name/birth_date/birth_place, OQ-3
 *               violation), or the per-run cost is a hardcoded 0/placeholder so the
 *               cap-tuning value (A3) is fiction. Green "provenance recorded" with
 *               zero trustworthy, PII-safe data.
 *   Schärfung:  Assert provenance carries the REAL model id + REAL usdCost from
 *               usage.cost (non-zero, from the response), the derived non-PII vars,
 *               and that NO raw birth field is in any provenance field.
 *
 * VCHK (Vision value-check): the operator can audit which model produced an accepted
 *   artifact and what the run actually cost — without that audit trail leaking PII.
 *
 * Evidence class: integration-fake (provider) + pure-unit (ArtifactService).
 * Real cost-sum across a run = T-LGQ-9 smoke. This file does NOT promote.
 *
 * EXPECTED NOW: RED — openrouter provider module + new ImageArtifact fields do not exist.
 */

const ENV = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_API_KEY: 'test-openrouter-key-DO-NOT-LEAK',
};

const PII_NAME = 'SENTINEL_NAME_Qx7_Betelgeuse';
const PII_BIRTH_DATE = 'SENTINEL_DATE_1988-02-29_Qx7';
const PII_BIRTH_PLACE = 'SENTINEL_PLACE_Rigel-Prime_Qx7';
const PROMPT_WITH_PII = `Totem for ${PII_NAME} born ${PII_BIRTH_DATE} in ${PII_BIRTH_PLACE}. Animal Dragon, element Fire.`;

let originalFetch: typeof globalThis.fetch;
function installImageFetch(usageCost: number) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const body = {
      choices: [
        { message: { images: [{ image_url: { url: 'data:image/png;base64,iVBORw0KGgo' } }], content: 'ok' } },
      ],
      usage: { cost: usageCost },
    };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
  }) as any;
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
});

describe('REQ-LGQ-006a — image provider surfaces per-candidate provenance (model + REAL usdCost)', () => {
  it('records the real model id and the REAL usage.cost per candidate (not 0/placeholder)', async () => {
    installImageFetch(0.0387); // belegt price R9
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      PROMPT_WITH_PII,
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      { animal: 'Dragon', element: 'Fire', dominant_element: 'Fire', iteration: 1 },
    );

    expect(result[0].metadata.model).toBe('google/gemini-2.5-flash-image');
    // Real cost wired from usage.cost — value-promise #6 / A3 telemetry must be real.
    expect((result[0].metadata as { usdCost?: number }).usdCost).toBeCloseTo(0.0387, 5);
    // Mutation RED: hardcode metadata.usdCost = 0 (or omit it) → cap-tuning telemetry
    // becomes fiction and this fails.
  });

  it('REQ-LGQ-006c — provenance is PII-safe: no raw birth field on any candidate metadata field (OQ-3)', async () => {
    installImageFetch(0.0387);
    const mod = await import('../lib/providers/openrouter/openRouterImageGenerationProvider');
    const provider = new mod.OpenRouterImageGenerationProvider({ env: ENV });

    const result = await provider.generate(
      PROMPT_WITH_PII,
      1,
      'png',
      'hd',
      'google/gemini-2.5-flash-image',
      'OPENROUTER_API_KEY',
      { animal: 'Dragon', element: 'Fire', dominant_element: 'Fire', iteration: 1 },
    );

    const serializedMeta = JSON.stringify(result[0].metadata);
    for (const pii of [PII_NAME, PII_BIRTH_DATE, PII_BIRTH_PLACE]) {
      expect(serializedMeta).not.toContain(pii);
    }
    // The derived non-PII vars MAY appear (anti-tautology: provenance is not empty).
    expect(serializedMeta.toLowerCase()).toContain('dragon');
    // Mutation RED: set metadata.promptUsed = full prompt (verbatim) → raw PII in
    // provenance, OQ-3 violated → RED.
  });
});

describe('REQ-LGQ-006a — ArtifactService threads provenance (modelUsed + promptVarsProvenance) onto every artifact', () => {
  it('every artifact carries modelUsed + promptVarsProvenance + qaScore, with NO raw PII in provenance', async () => {
    const { ArtifactService } = await import('../lib/workflow/artifactService');

    const run = {
      id: 'wf-run-1234',
      orderNumber: 'ORD-1',
      productId: 'prod-001',
      customerName: PII_NAME, // run carries PII, but the ARTIFACT provenance must not
      birthDate: PII_BIRTH_DATE,
      birthPlace: PII_BIRTH_PLACE,
      status: 'running' as const,
      startedAt: new Date().toISOString(),
      currentIteration: 1,
      birthTime: '12:00',
      birthTimeKnown: true,
    };

    const candidates = [
      {
        candidateIndex: 0,
        storagePath: 'data:image/png;base64,iVBOR',
        metadata: {
          promptUsed: 'animal=Dragon element=Fire', // non-PII provenance only
          model: 'google/gemini-2.5-flash-image',
          provider: 'OpenRouter',
          quality: 'hd',
          resolution: '1024x1024',
          usdCost: 0.0387,
        },
      },
    ];
    const evaluations = [
      { candidateIndex: 0, score: 90, status: 'accepted' as const, reason: 'great', detailedJson: '{}' },
    ];

    // Contract: createArtifactsFromSwarm must populate modelUsed + promptVarsProvenance.
    const artifacts = ArtifactService.createArtifactsFromSwarm(
      run as any,
      'prod-001',
      'tpl-1',
      1,
      candidates,
      evaluations,
    );

    expect(artifacts).toHaveLength(1);
    const art = artifacts[0] as unknown as {
      modelUsed?: string;
      promptVarsProvenance?: string;
      qaScore: number;
    };
    expect(art.modelUsed).toBe('google/gemini-2.5-flash-image');
    expect(typeof art.promptVarsProvenance).toBe('string');
    expect(art.promptVarsProvenance!.length).toBeGreaterThan(0);
    expect(art.qaScore).toBe(90);

    // PII-safety (OQ-3): even though run carries PII, no raw birth field is in provenance.
    const serialized = JSON.stringify({
      modelUsed: art.modelUsed,
      promptVarsProvenance: art.promptVarsProvenance,
    });
    for (const pii of [PII_NAME, PII_BIRTH_DATE, PII_BIRTH_PLACE]) {
      expect(serialized).not.toContain(pii);
    }
    // Mutation RED: drop the modelUsed/promptVarsProvenance assignment in
    // createArtifactsFromSwarm → undefined fields → RED.
  });
});
