/**
 * Hard cost cap for the live generate→QA loop (REQ-LGQ-004, T-LGQ-1).
 *
 * A run is bounded by BOTH a max real-image-call integer AND a per-run $ spend
 * ceiling, enforced server-side. This module is a PURE, in-process enforcer:
 * its value is only real once the server run loop calls
 * `assertCanIssueImageCall()` immediately BEFORE every real OpenRouter image
 * call (wired in T-LGQ-6) — see the contract's "Gegenthese": a cap that is
 * green in isolation but never called is decorative.
 *
 * Cap derivation (REQ-LGQ-004c, canvas §7b A3): the default is COMPUTED from the
 * active config worst-case, never a blind guess. Real per-product worst-case
 * images per run = `numInitiallyGenerated × maxRejectedBeforeEscalation`,
 * computed WITHIN each product (NEVER crossing values across products — the F1
 * confabulation that produced a false "9"). With the shipped config defaults
 * (prod-001 3×2=6, prod-002 2×3=6) the worst-case across products is 6 images
 * ≈ $0.23/run ($0.0387/image, R9). The shipped default 12 images / $1.00 is a
 * coherent SAFETY CEILING above that worst-case (6) + headroom, and it scales up
 * if a product is configured beyond the default floor so a legit run never bites
 * its own cap.
 */

import type { GenerationConfig, QualityGate1Config } from '../../types';

/**
 * Distinct escalation reason code for a cap-bite (OQ-2 RESOLVED). The run reuses
 * the existing `escalated` terminal state but carries THIS reason so a cap-stop
 * stays honestly distinguishable from quality-exhaustion.
 */
export const COST_CAP_REACHED = 'COST_CAP_REACHED';

/** Default safety-ceiling floor: 12 images (= max per-product worst-case 6 + headroom). */
const DEFAULT_MAX_IMAGES_FLOOR = 12;

/** Default per-run $ spend ceiling: $1.00 (above the ~$0.23 worst-case + headroom). */
const DEFAULT_MAX_USD = 1.0;

/** Cap configuration: both an image-count cap and an independent $ ceiling. */
export interface CostCap {
  maxImagesPerRun: number;
  maxUsdPerRun: number;
}

/**
 * Stateful per-run enforcer. `assertCanIssueImageCall()` is called BEFORE each
 * real image call and throws `CostCapError(COST_CAP_REACHED)` when issuing the
 * next call would exceed EITHER cap; `recordImageCall(usdCost)` records the real
 * cost of a completed call.
 */
export interface CostCapEnforcer {
  /** Throws `CostCapError` if the NEXT image call would exceed either cap. */
  assertCanIssueImageCall(): void;
  /** Record the real $ cost of a completed image call. */
  recordImageCall(usdCost: number): void;
  /** Number of image calls recorded so far. */
  readonly imageCallCount: number;
  /** Summed real $ cost recorded so far. */
  readonly accumulatedUsd: number;
}

/** Error thrown when a run hits either the image-count cap or the $ ceiling. */
export class CostCapError extends Error {
  /** The distinct escalation reason code carried to the run/escalation path. */
  readonly reason: string;

  constructor(reason: string = COST_CAP_REACHED, message?: string) {
    super(message ?? `Cost cap reached: ${reason}`);
    this.name = 'CostCapError';
    this.reason = reason;
    // Preserve the prototype chain for `instanceof` across the TS→JS transpile.
    Object.setPrototypeOf(this, CostCapError.prototype);
  }
}

/**
 * Derive the cap default from the active config worst-case.
 *
 * Worst-case images per run is computed PER PRODUCT (joined on `productId`) as
 * `numInitiallyGenerated × maxRejectedBeforeEscalation`, then the max is taken
 * ACROSS products. The values are NEVER crossed between different products (the
 * F1 confabulation that yielded a false "9"). The returned `maxImagesPerRun` is
 * the larger of the safety-ceiling floor (12) and that worst-case, so a product
 * configured above the floor still gets a cap that sits above its real maximum.
 *
 * @param genConfigs     active generation configs (need `productId`, `numInitiallyGenerated`)
 * @param qualityConfigs active quality-gate configs (need `productId`, `maxRejectedBeforeEscalation`)
 */
export function deriveDefaultCap(
  genConfigs: Array<Pick<GenerationConfig, 'productId' | 'numInitiallyGenerated'>>,
  qualityConfigs: Array<Pick<QualityGate1Config, 'productId' | 'maxRejectedBeforeEscalation'>>,
): CostCap {
  const maxRejectedByProduct = new Map<string, number>();
  for (const qc of qualityConfigs) {
    maxRejectedByProduct.set(qc.productId, qc.maxRejectedBeforeEscalation);
  }

  let worstCaseImages = 0;
  for (const gc of genConfigs) {
    const maxRejected = maxRejectedByProduct.get(gc.productId);
    if (maxRejected === undefined) continue; // no matching quality gate → no worst-case contribution
    // Per-product worst-case: this product's nInit × THIS product's maxRejected.
    const perProduct = gc.numInitiallyGenerated * maxRejected;
    if (perProduct > worstCaseImages) worstCaseImages = perProduct;
  }

  return {
    // Ceiling above the real worst-case: never below it (would bite legit runs),
    // never the confabulated cross-product figure.
    maxImagesPerRun: Math.max(DEFAULT_MAX_IMAGES_FLOOR, worstCaseImages),
    maxUsdPerRun: DEFAULT_MAX_USD,
  };
}

/** Create a stateful per-run cost-cap enforcer for the given cap. */
export function createCostCapEnforcer(cap: CostCap): CostCapEnforcer {
  const { maxImagesPerRun, maxUsdPerRun } = cap;
  let imageCallCount = 0;
  let accumulatedUsd = 0;

  return {
    assertCanIssueImageCall(): void {
      // Count guard: the NEXT call would be the (imageCallCount+1)-th; refuse it
      // once we have already issued the full allowance (`>=` — `>` would let a
      // (C+1)-th call slip through).
      if (imageCallCount >= maxImagesPerRun) {
        throw new CostCapError(
          COST_CAP_REACHED,
          `Image-call cap reached (${imageCallCount}/${maxImagesPerRun})`,
        );
      }
      // Independent $ ceiling: refuse the next call once accumulated real spend
      // has already crossed the ceiling.
      if (accumulatedUsd >= maxUsdPerRun) {
        throw new CostCapError(
          COST_CAP_REACHED,
          `Spend ceiling reached ($${accumulatedUsd.toFixed(4)}/$${maxUsdPerRun.toFixed(2)})`,
        );
      }
    },
    recordImageCall(usdCost: number): void {
      imageCallCount += 1;
      accumulatedUsd += usdCost;
    },
    get imageCallCount(): number {
      return imageCallCount;
    },
    get accumulatedUsd(): number {
      return accumulatedUsd;
    },
  };
}
