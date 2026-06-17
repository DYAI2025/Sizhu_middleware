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
 * decorative). It wraps a real ImageGenerationProvider and gates each generate()
 * batch, then records the real per-candidate cost after the batch returns.
 *
 * Guarantee strength (honest, per code review I3):
 *  - The image-COUNT cap is HARD: a batch is refused up front if issuing it would
 *    push the run past `maxImagesPerRun` (whole-batch refusal — a batch can never
 *    straddle the count ceiling).
 *  - The $ ceiling bites at BATCH (iteration) boundaries: real cost is known only
 *    AFTER a batch returns, so the next batch is refused once accumulated spend has
 *    crossed `maxUsdPerRun` — a single in-flight batch MAY overshoot the $ ceiling.
 *    The derived default ($1 vs ~$0.23 worst-case) absorbs one in-flight batch, and
 *    the hard count cap is the primary bound; the $ ceiling is defense-in-depth.
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
