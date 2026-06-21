/**
 * lichunPillarGuard — REQ-F-010 (non-deferrable lichun hard-gate).
 *
 * The year pillar is computed by FuFire WITH lichun, server-side (AM-4 spike, live):
 *   1990-02-03 → is_before_lichun=true  → year pillar 己巳 (Ji/Si)
 *   1990-02-06 → is_before_lichun=false → year pillar 庚午 (Geng/Wu)
 *
 * Our code does NOT recompute the pillar; it CONSUMES FuFire's lichun-adjusted year pillar.
 * This guard proves we consume it FAITHFULLY (provenance from the response, not a constant)
 * and FAIL CLOSED when the provider declares the day-pillar anchor "unverified" — never
 * laundering "unverified" into "verified".
 *
 * Tests (RED first):
 *  (a) the pre/post fixture PAIR yields DIFFERENT year pillars (己巳 vs 庚午) — RED-on-revert:
 *      a guard that label-copies or hardcodes would yield EQUAL pillars and fail this.
 *  (b) the "unverified" fixture → BLOCKED (no laundering).
 *  (c) provenance: mutating the fixture's year pillar changes the guard's output (proves it
 *      reads from the response, not a constant).
 */

import { describe, expect, it } from "vitest";

import {
  assertYearPillarProvenance,
  type YearPillarProvenance,
} from "../services/lichunPillarGuard";
import {
  POST_LICHUN_BAZI,
  PRE_LICHUN_BAZI,
  UNVERIFIED_ANCHOR_BAZI,
} from "./fixtures/lichun-pair.fixture";

/** Deep-clone a fixture so a per-test mutation never bleeds into another test. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("lichunPillarGuard.assertYearPillarProvenance", () => {
  // --- (a) lichun divergence: the pre/post pair MUST differ -------------------
  it("yields DIFFERENT year pillars for the pre-lichun vs post-lichun pair (己巳 vs 庚午)", () => {
    const pre = assertYearPillarProvenance(PRE_LICHUN_BAZI) as YearPillarProvenance;
    const post = assertYearPillarProvenance(POST_LICHUN_BAZI) as YearPillarProvenance;

    // Exact lichun-adjusted pillars FuFire returns for these dates.
    expect(pre.yearPillarHanzi).toBe("己巳");
    expect(post.yearPillarHanzi).toBe("庚午");

    // The load-bearing divergence: a hardcode/label-copy would make these equal.
    expect(post.yearPillarHanzi).not.toBe(pre.yearPillarHanzi);

    // The lichun side is consumed verbatim from the response, not inferred by us.
    expect(pre.isBeforeLichun).toBe(true);
    expect(post.isBeforeLichun).toBe(false);

    // Romanizations are carried through faithfully for the renderer.
    expect(pre.yearStem).toBe("Ji");
    expect(pre.yearBranch).toBe("Si");
    expect(post.yearStem).toBe("Geng");
    expect(post.yearBranch).toBe("Wu");

    // Both verified fixtures are NOT blocked.
    expect(pre.blocked).toBe(false);
    expect(post.blocked).toBe(false);
  });

  // --- (b) no laundering: unverified anchor MUST be BLOCKED -------------------
  it("BLOCKS when the provider day-pillar anchor_verification is 'unverified' (no laundering)", () => {
    expect(() => assertYearPillarProvenance(UNVERIFIED_ANCHOR_BAZI)).toThrow(
      /unverified/i,
    );
  });

  it("BLOCKS when anchor_verification is absent (cannot assert verified)", () => {
    const noAnchor = clone(POST_LICHUN_BAZI) as Record<string, any>;
    delete noAnchor.data.derivation_trace.day.day_anchor_evidence.anchor_verification;

    expect(() => assertYearPillarProvenance(noAnchor)).toThrow();
  });

  it("never relabels 'unverified' as 'verified' — the verbatim status is surfaced", () => {
    let captured: unknown;
    try {
      assertYearPillarProvenance(UNVERIFIED_ANCHOR_BAZI);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);
    const message = (captured as Error).message;
    // The provider's verbatim status is surfaced...
    expect(message).toContain("unverified");
    // ...and the message never CLAIMS the status is verified (laundering). It may say
    // it is *not* "verified" / refuses an unverified anchor, but never asserts verified.
    expect(message.toLowerCase()).not.toMatch(/\bis\s+"?verified/);
    expect(message.toLowerCase()).not.toMatch(/anchor[_\s]?verification:\s*verified/);
  });

  // --- (c) provenance: output tracks the RESPONSE, not a constant -------------
  it("reads the year pillar FROM the response — mutating the source changes the output", () => {
    // Start from the post fixture (Geng/Wu → 庚午) and mutate ONLY the year pillar.
    const mutated = clone(POST_LICHUN_BAZI) as Record<string, any>;
    mutated.data.pillars.year.stamm = "Jia"; // 甲
    mutated.data.pillars.year.zweig = "Zi"; // 子

    const result = assertYearPillarProvenance(mutated) as YearPillarProvenance;

    // The output follows the mutated source — proves no hardcoded/cached constant.
    expect(result.yearStem).toBe("Jia");
    expect(result.yearBranch).toBe("Zi");
    expect(result.yearPillarHanzi).toBe("甲子");
    expect(result.yearPillarHanzi).not.toBe("庚午");
  });

  it("records provenance source paths (the year pillar came from the FuFire response)", () => {
    const result = assertYearPillarProvenance(POST_LICHUN_BAZI) as YearPillarProvenance;
    expect(result.sources.yearStem).toContain("pillars.year.stamm");
    expect(result.sources.yearBranch).toContain("pillars.year.zweig");
  });

  it("BLOCKS when the year-pillar stem/branch source is absent (no invented pillar)", () => {
    const noPillar = clone(POST_LICHUN_BAZI) as Record<string, any>;
    delete noPillar.data.pillars.year.stamm;

    expect(() => assertYearPillarProvenance(noPillar)).toThrow();
  });

  it("BLOCKS when a romanization is not a known FuFire token (no guessed hanzi)", () => {
    const badToken = clone(POST_LICHUN_BAZI) as Record<string, any>;
    badToken.data.pillars.year.stamm = "Nope";

    expect(() => assertYearPillarProvenance(badToken)).toThrow();
  });
});
