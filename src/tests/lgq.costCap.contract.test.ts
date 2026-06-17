import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RED CONTRACT — REQ-LGQ-004 (Hard cost cap: max-image-calls AND $ spend ceiling)
 * Slice A · feat/sizhu-live-generate-qa-loop · TDD Phase 1 (written before impl).
 *
 * Contract surface the coder MUST satisfy (T-LGQ-1, PRD §7):
 *   module:  src/lib/workflow/costCap.ts
 *   exports:
 *     - COST_CAP_REACHED: string  (escalation reason code, OQ-2 RESOLVED)
 *     - deriveDefaultCap(configs): { maxImagesPerRun: number; maxUsdPerRun: number }
 *           derives from active GenerationConfig/QualityGate worst-case per product
 *           (max(numInitiallyGenerated × maxRejectedBeforeEscalation)) + headroom.
 *     - createCostCapEnforcer({ maxImagesPerRun, maxUsdPerRun }): CostCapEnforcer
 *           CostCapEnforcer = {
 *             // throws CostCapError BEFORE the (count+1)-th call / before $ would exceed S
 *             assertCanIssueImageCall(): void;
 *             // record the actual real cost of a completed image call
 *             recordImageCall(usdCost: number): void;
 *             imageCallCount: number;
 *             accumulatedUsd: number;
 *           }
 *     - CostCapError: Error subclass with `.reason === COST_CAP_REACHED`
 *
 * Kritische semantische Glättung — REQ-LGQ-004 (BOUNDARY: a cap that gates a
 * money-spending egress loop; the enforcer module itself is pure, but its VALUE
 * is only real when it actually sits between the run loop and the real
 * OpenRouter image call — so the counter-thesis is about load-bearingness):
 *   These:      "A cost-cap module exists and its unit tests are green."
 *   Gegenthese: The cap is green in isolation yet DECORATIVE at runtime — the run
 *               loop never calls assertCanIssueImageCall(), so a run can still
 *               fire C+1..N real image calls and burn unbounded money while the
 *               cap's own tests stay green. (The user's value — "a run cannot
 *               exceed C real image calls / $S" — is ZERO.)
 *   Schärfung:  (a) here: assert the enforcer THROWS on the (C+1)-th call and the
 *               $S boundary, AND name the RED-on-removal mutation (P2/P4);
 *               (b) the load-bearing wiring is killed by lgq.runEndpoint.contract
 *               + the live smoke (T-LGQ-9), which drive the cap THROUGH the run
 *               loop, not the bare enforcer.
 *
 * VCHK (Vision value-check): a run is bounded by real money, not by hope — the
 *   operator can trust that triggering a run cannot silently spend more than $S.
 *
 * Evidence class for this file: pure-unit (the enforcer is in-process logic).
 * The real-boundary class is owned by T-LGQ-9 (smoke). This file does NOT promote.
 *
 * EXPECTED NOW: RED — `src/lib/workflow/costCap.ts` does not exist yet (missing impl),
 * NOT a typo. After T-LGQ-1 lands it goes GREEN.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let costCap: any;
beforeEach(async () => {
  vi.resetModules();
  // Imported inside beforeEach so the missing-module failure is reported per-test
  // (RED for the right reason) rather than crashing the whole file at collect time.
  costCap = await import('../lib/workflow/costCap');
});

describe('REQ-LGQ-004 — cost-cap reason code (OQ-2 RESOLVED: reuse escalated + distinct reason)', () => {
  it('exports COST_CAP_REACHED as the distinct escalation reason for a cap-bite', () => {
    expect(costCap.COST_CAP_REACHED).toBe('COST_CAP_REACHED');
    // Mutation that turns this RED: rename/remove COST_CAP_REACHED, or fold the
    // cap-stop into the generic quality-exhaustion reason (loses honest
    // distinguishability the spec requires).
  });
});

describe('REQ-LGQ-004c — cap default is DERIVED from config worst-case, not a blind guess', () => {
  it('derives from per-product max(numInitiallyGenerated × maxRejectedBeforeEscalation), NOT crossed across products', () => {
    // Belegt config (localRepository.ts): prod-001 3×2=6, prod-002 2×3=6 → max=6.
    // F1 confabulation guard: NOT 3×3=9 (crossing prod-001's nInit with prod-002's maxRej).
    const genConfigs = [
      { productId: 'prod-001', numInitiallyGenerated: 3 },
      { productId: 'prod-002', numInitiallyGenerated: 2 },
    ];
    const qualityConfigs = [
      { productId: 'prod-001', maxRejectedBeforeEscalation: 2 },
      { productId: 'prod-002', maxRejectedBeforeEscalation: 3 },
    ];

    const derived = costCap.deriveDefaultCap(genConfigs, qualityConfigs);

    // The shipped default is 12/$1.00 = max-worst-case(6) + headroom; it must be
    // a real ceiling ABOVE the derived worst-case (6), never below it (which would
    // make legit runs hit the cap) and never the confabulated 9.
    expect(derived.maxImagesPerRun).toBeGreaterThanOrEqual(6);
    expect(derived.maxImagesPerRun).toBe(12);
    expect(derived.maxUsdPerRun).toBeCloseTo(1.0, 5);
    // Mutation RED: derive from cross-product (3×3=9), or hardcode below 6, or
    // ignore the configs entirely.
  });

  it('the derived ceiling stays >= the real per-product worst-case for an inflated config', () => {
    // A product configured 4×5=20 must NOT silently get a 12-cap that bites legit runs.
    const genConfigs = [{ productId: 'p', numInitiallyGenerated: 4 }];
    const qualityConfigs = [{ productId: 'p', maxRejectedBeforeEscalation: 5 }];
    const derived = costCap.deriveDefaultCap(genConfigs, qualityConfigs);
    expect(derived.maxImagesPerRun).toBeGreaterThanOrEqual(20);
    // Mutation RED: return a fixed 12 ignoring the active worst-case.
  });

  it('F1 BITE: multi-product, per-product worst-case ABOVE the floor — correct (15) NOT cross-product (35)', () => {
    // The single-product / shipped-2-product cases above CANNOT detect a
    // cross-product regression: in both, per-product and cross-product collapse to
    // the same number (single product) or floor to the same 12 (3×2=6, 2×3=6 vs
    // confab 3×3=9 → both Math.max(12, ...) = 12). This case is built so the two
    // computations DIVERGE *above* the floor:
    //   A: 5×3 = 15, B: 2×7 = 14  → correct per-product worst-case = max(15,14) = 15
    //   cross-product confabulation = nInit(5) × max(all maxRejected=7) = 35
    // 15 > floor(12), so the correct value SURFACES (not masked by Math.max(12, ·)).
    const genConfigs = [
      { productId: 'A', numInitiallyGenerated: 5 },
      { productId: 'B', numInitiallyGenerated: 2 },
    ];
    const qualityConfigs = [
      { productId: 'A', maxRejectedBeforeEscalation: 3 },
      { productId: 'B', maxRejectedBeforeEscalation: 7 },
    ];

    const derived = costCap.deriveDefaultCap(genConfigs, qualityConfigs);

    // The cap MUST be the real per-product worst-case (15), never the confabulated
    // cross-product figure (35) — and 15 is above the floor, so it is observable.
    expect(derived.maxImagesPerRun).toBe(15);
    expect(derived.maxImagesPerRun).not.toBe(35);
    expect(derived.maxUsdPerRun).toBeCloseTo(1.0, 5);
    // Mutation RED (proven): derive from cross-product
    // (nInit × max(all maxRejectedBeforeEscalation)) → yields 35, this case goes RED
    // while the shipped-config and single-product cases stay green.
  });
});

describe('REQ-LGQ-004a — the image-COUNT cap bites (no (C+1)-th real image call)', () => {
  it('allows exactly C image calls and THROWS CostCapError on the (C+1)-th', () => {
    const enforcer = costCap.createCostCapEnforcer({ maxImagesPerRun: 3, maxUsdPerRun: 100 });

    // C legal calls: assert-then-record, each ~cheap so the $ ceiling never bites here.
    for (let i = 0; i < 3; i++) {
      expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
      enforcer.recordImageCall(0.0387);
    }
    expect(enforcer.imageCallCount).toBe(3);

    // The (C+1)-th must be REFUSED before any call is issued.
    let caught: unknown;
    try {
      enforcer.assertCanIssueImageCall();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(costCap.CostCapError);
    expect((caught as { reason?: string }).reason).toBe(costCap.COST_CAP_REACHED);
    // The count must NOT have advanced past the cap (no silent 4th call).
    expect(enforcer.imageCallCount).toBe(3);
    // Mutation RED: change `>=` to `>` in the count guard, or remove
    // assertCanIssueImageCall's count check → a 4th call slips through.
  });

  it('a single-call cap (C=1) refuses the 2nd call — boundary of the boundary', () => {
    const enforcer = costCap.createCostCapEnforcer({ maxImagesPerRun: 1, maxUsdPerRun: 100 });
    expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
    enforcer.recordImageCall(0.0387);
    expect(() => enforcer.assertCanIssueImageCall()).toThrow(costCap.CostCapError);
  });
});

describe('REQ-LGQ-004b — the $ SPEND ceiling bites independently of the count cap', () => {
  it('THROWS before the next call when accumulated usage.cost would exceed S, even under the count cap', () => {
    // Count cap is generous (100) so ONLY the $ ceiling can bite here — proves the
    // two caps are independent, not the same guard wearing two hats.
    const enforcer = costCap.createCostCapEnforcer({ maxImagesPerRun: 100, maxUsdPerRun: 0.1 });

    // First call is fine and records real cost that crosses the $0.10 ceiling.
    expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
    enforcer.recordImageCall(0.0387);
    expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
    enforcer.recordImageCall(0.0387);
    // accumulatedUsd ≈ 0.0774 < 0.10 → still allowed
    expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
    enforcer.recordImageCall(0.0387);
    // accumulatedUsd ≈ 0.1161 > 0.10 → the NEXT call must be refused on $ grounds.
    let caught: unknown;
    try {
      enforcer.assertCanIssueImageCall();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(costCap.CostCapError);
    expect((caught as { reason?: string }).reason).toBe(costCap.COST_CAP_REACHED);
    expect(enforcer.accumulatedUsd).toBeCloseTo(0.1161, 4);
    // Mutation RED: drop the $-ceiling branch (only check count), or compare
    // against the wrong field → the $ overspend call slips through.
  });

  it('does NOT throw on $ grounds while accumulated cost stays under S (both-branch coverage)', () => {
    const enforcer = costCap.createCostCapEnforcer({ maxImagesPerRun: 100, maxUsdPerRun: 1.0 });
    for (let i = 0; i < 6; i++) {
      expect(() => enforcer.assertCanIssueImageCall()).not.toThrow();
      enforcer.recordImageCall(0.0387); // 6 × 0.0387 ≈ 0.232 < 1.0 → never bites
    }
    expect(enforcer.accumulatedUsd).toBeLessThan(1.0);
    // Proves the $ guard is not a tautology that always throws.
  });
});
