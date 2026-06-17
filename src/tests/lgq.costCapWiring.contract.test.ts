import { describe, it, expect } from 'vitest';
import { CostCappedImageGenerationProvider } from '../lib/providers/openrouter/costCappedImageProvider';
import { CostCapError, COST_CAP_REACHED } from '../lib/workflow/costCap';
import type { ImageGenerationProvider } from '../lib/providers/interfaces';

/**
 * CONTRACT — REQ-LGQ-004 LOAD-BEARING wiring (the cost-cap contract's Gegenthese:
 * "a cap that exists but is never CALLED before the real image call is decorative").
 *
 * The bare enforcer is proven in lgq.costCap.contract. This file proves the cap is
 * actually IN the image path: it drives candidates THROUGH the real generate() seam
 * of CostCappedImageGenerationProvider (the decorator the run service composes onto
 * the gen provider) and asserts the (C+1)-th real call and the $ ceiling are
 * refused — without ever calling the inner provider for the refused batch.
 */

/** Minimal inner provider that counts how many real batches it was asked to issue. */
function fakeInner(usdCostPerCandidate: number) {
  const inner: ImageGenerationProvider & { calls: number } = {
    calls: 0,
    async generate(_prompt, numCandidates) {
      inner.calls += 1;
      return Array.from({ length: numCandidates }, (_v, i) => ({
        candidateIndex: i,
        storagePath: 'data:image/png;base64,iVBORw0KGgo',
        metadata: {
          promptUsed: 'animal=Dragon',
          model: 'google/gemini-2.5-flash-image',
          provider: 'OpenRouter',
          quality: 'hd',
          resolution: '1792x2304',
          usdCost: usdCostPerCandidate,
        },
      }));
    },
  };
  return inner;
}

const ARGS = ['png', 'hd', 'google/gemini-2.5-flash-image', 'OPENROUTER_API_KEY', { animal: 'Dragon' }] as const;

describe('REQ-LGQ-004 wiring — the image-COUNT cap bites THROUGH the provider seam', () => {
  it('refuses the batch that would cross the count cap, and does NOT call the inner provider for it', async () => {
    const inner = fakeInner(0.0001);
    const capped = new CostCappedImageGenerationProvider(inner, { maxImagesPerRun: 2, maxUsdPerRun: 100 });

    // First batch of 2 is exactly the allowance → allowed, inner called once.
    await capped.generate('p', 2, ...ARGS);
    expect(inner.calls).toBe(1);
    expect(capped.enforcer.imageCallCount).toBe(2);

    // A further batch would be the 3rd..image → refused BEFORE the inner is called.
    let caught: unknown;
    try {
      await capped.generate('p', 1, ...ARGS);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CostCapError);
    expect((caught as CostCapError).reason).toBe(COST_CAP_REACHED);
    expect(inner.calls).toBe(1); // no fake call slipped through
    expect(capped.enforcer.imageCallCount).toBe(2); // count did not advance past the cap
    // Mutation RED: remove the pre-batch count check / the assertCanIssueImageCall →
    // inner.calls becomes 2 and the run spends past its cap.
  });
});

describe('REQ-LGQ-004 wiring — the $ ceiling bites THROUGH the seam, independent of the count cap', () => {
  it('refuses the next batch once accumulated real cost crosses S (count cap generous)', async () => {
    const inner = fakeInner(0.0387); // belegt price R9
    const capped = new CostCappedImageGenerationProvider(inner, { maxImagesPerRun: 100, maxUsdPerRun: 0.1 });

    await capped.generate('p', 1, ...ARGS); // acc 0.0387
    await capped.generate('p', 1, ...ARGS); // acc 0.0774
    await capped.generate('p', 1, ...ARGS); // acc 0.1161 (> 0.1)
    expect(inner.calls).toBe(3);
    expect(capped.enforcer.accumulatedUsd).toBeCloseTo(0.1161, 4);

    await expect(capped.generate('p', 1, ...ARGS)).rejects.toBeInstanceOf(CostCapError);
    expect(inner.calls).toBe(3); // the over-$ batch was refused before the real call
    // Mutation RED: drop the $-ceiling branch in the enforcer / never call
    // assertCanIssueImageCall → the over-spend batch reaches the inner provider.
  });
});

describe('REQ-LGQ-004 wiring — anti-tautology: a generous cap lets real batches through', () => {
  it('passes batches and returns real candidates while under both caps', async () => {
    const inner = fakeInner(0.0387);
    const capped = new CostCappedImageGenerationProvider(inner, { maxImagesPerRun: 12, maxUsdPerRun: 1.0 });

    const out = await capped.generate('p', 3, ...ARGS);
    expect(out).toHaveLength(3);
    expect(inner.calls).toBe(1);
    expect(capped.enforcer.imageCallCount).toBe(3);
    // Proves the wrap is not an always-throw guard.
  });
});
