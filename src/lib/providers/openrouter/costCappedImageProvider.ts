import type { ImageGenerationProvider } from '../interfaces';
import {
  createCostCapEnforcer,
  CostCapError,
  COST_CAP_REACHED,
  type CostCap,
  type CostCapEnforcer,
} from '../../workflow/costCap';

/**
 * Decorator that makes the cost cap LOAD-BEARING on the real image path
 * (REQ-LGQ-004, the contract's Gegenthese: a cap that is never called is
 * decorative). It wraps a real ImageGenerationProvider and, BEFORE issuing each
 * generate() batch, refuses the call if it would exceed EITHER cap — then records
 * the real per-candidate cost after the batch returns.
 *
 * Granularity: the underlying provider issues one batched request for
 * `numCandidates` images, so the cap bites at batch (iteration) boundaries — a run
 * cannot start a new image batch once it has hit the image-count or $ ceiling. The
 * derived default cap (worst-case + headroom) absorbs a single in-flight batch.
 */
export class CostCappedImageGenerationProvider implements ImageGenerationProvider {
  readonly enforcer: CostCapEnforcer;

  constructor(
    private readonly inner: ImageGenerationProvider,
    private readonly cap: CostCap,
    enforcer?: CostCapEnforcer,
  ) {
    this.enforcer = enforcer ?? createCostCapEnforcer(cap);
  }

  async generate(
    prompt: string,
    numCandidates: number,
    format: 'png' | 'jpeg',
    quality: 'standard' | 'hd',
    model: string,
    secretRef: string,
    customerData: any,
  ) {
    // Refuse the WHOLE batch if issuing it would push the run past the image-count
    // cap (a batch of N must not straddle the ceiling).
    if (this.enforcer.imageCallCount + numCandidates > this.cap.maxImagesPerRun) {
      throw new CostCapError(
        COST_CAP_REACHED,
        `Image-count cap would be exceeded: ${this.enforcer.imageCallCount} + ${numCandidates} > ${this.cap.maxImagesPerRun}`,
      );
    }
    // Load-bearing call: also bites if a prior batch already crossed the $ ceiling.
    this.enforcer.assertCanIssueImageCall();

    const candidates = await this.inner.generate(
      prompt,
      numCandidates,
      format,
      quality,
      model,
      secretRef,
      customerData,
    );

    // Record the REAL cost of each completed candidate so the $ ceiling can bite
    // the next batch.
    for (const c of candidates) {
      this.enforcer.recordImageCall(c.metadata?.usdCost ?? 0);
    }
    return candidates;
  }
}
