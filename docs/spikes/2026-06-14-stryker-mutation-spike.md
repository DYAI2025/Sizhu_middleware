# Spike — Stryker mutation testing (P4 follow-up)

Status: spike complete — DECISION INPUT (not adopted; branch `spike/stryker-mutation-testing`, not merged)
Date: 2026-06-14 · Origin: sizhu-secure-fufire-baseline Phase-4 retro proposal P4

## Goal (time-boxed)
Evaluate whether Stryker can run on this vitest + TS single-server project, get a REAL mutation
score on a focused module, and assess it as the seed for a `metrics/runs.jsonl`-style baseline —
so the next retro can measure improvement-vs-drift instead of believing it.

## Setup
- `npm i -D @stryker-mutator/core@9.6.1 @stryker-mutator/vitest-runner`.
- `stryker.config.json`: testRunner `vitest`, `mutate: ["server/services/fufireRequestBuilders.ts"]`,
  `coverageAnalysis: "off"` (robust — no coverage-provider dep needed), concurrency 2, timeout 20s.
- Target chosen deliberately: a PURE module (no I/O) with 8 output-asserted unit tests
  (`fufire.requestBuilders.test.ts`) + manual RED-on-revert proofs — i.e. a module the team
  considered well-tested. Best-case signal.

## Result (the headline)
`npx stryker run` → exit 0, **18 seconds**, 8.58 tests/mutant.

| File | Mutation score | killed | survived | no-cov | timeout | errors |
|---|---|---|---|---|---|---|
| fufireRequestBuilders.ts | **38.95%** (42.53% covered) | 37 | **50** | 8 | 0 | 0 |

Survived mutant classes: `ConditionalExpression`, `EqualityOperator`, `StringLiteral` (the report
is at `reports/mutation/mutation.json`).

## Finding (actionable — this is the spike's value)
A module with green output-asserted tests + manual RED-on-revert mutation proofs still scores
**38.95%**. The existing tests pin **shape / presence** (chronometry nested, bazi/wuxing flat, ISO
`date`, lat/lon present) but NOT most **field values and branch conditions** — e.g. flipping a
conditional or swapping a string literal survives. This is exactly the retro's P4 thesis made
measurable: **manual spot-mutation on the specific guards ≠ broad mutation coverage of the module.**
The 8 manual RED-on-revert proofs killed the mutants they targeted; Stryker reveals the ~50 mutants
nobody targeted. Real, weak-test signal that green + tsc + audit-0 did not show.

(Caveat: `coverageAnalysis: off` + targeting one file means cross-file tests that exercise the
builders via the service, e.g. `fufire.testrun.validation.test.ts`, are run but the score reflects
the requestBuilders test file's pinning power. A `perTest` run + including the service path would
refine the number, but the directional finding — weak value/branch pinning — holds.)

## Cost
- **+2 moderate audit advisories** (was 0): `qs` DoS (GHSA-q8mj-m7cp-5q26) via Stryker transitive
  deps. Dev-only / build-time surface, but a real cost of adopting Stryker.
- **Runtime:** 18s for ONE ~150-line module at concurrency 2. Whole-repo mutation would be
  minutes-to-longer — NOT a per-commit CI gate; an opt-in / nightly / critical-module tool.
- Dep weight: Stryker core + vitest-runner.

## Recommendation (decision for the user)
1. **Adopt Stryker as opt-in, scoped** — add `npm run test:mutation` (Stryker on a curated list of
   CRITICAL pure modules: request builders, response interpreter, idempotency key, the auth/JWT
   helpers), NOT a whole-repo per-commit gate. Run it nightly / pre-release / on touched critical files.
2. **Raise the survivors into tests** — the 50 survived mutants on the request builders are a
   ready-made backlog: assert exact field values + each branch (the `if (input.x !== undefined)`
   conditionals, the enum pass-throughs, the ISO-date formatting). This directly hardens REQ-F-001.
3. **Seed the metrics baseline** — record the per-module mutation score as the first
   `metrics/runs.jsonl`-style data point so the next /agileteam run can measure mutation-score
   drift (the prerequisite the retro flagged for FULL mode). A simple `metrics/mutation-baseline.json`
   is committed alongside this spike as the seed (NOT the full agileteam metrics-emitter schema —
   that stays for the governance layer to define).
4. **Weigh the +2 moderate audit** — if adopting, track the qs advisory; it's dev/build-time, low
   practical risk, but should not silently re-introduce a red audit.

## Do NOT (yet)
- Do not make Stryker a blocking per-commit CI gate (runtime).
- Do not merge this spike branch as-is without the user's adopt decision (dep weight + the 2 moderate).

---

## Adoption + survivor-hardening (2026-06-14, post-spike)

User decision: **adopt** (option a). Stryker merged to main (`npm run test:mutation`,
config, metrics seed). Then the survivor backlog was raised into tests as its own slice.

- New test file `server/tests/fufire.requestBuilders.mutation.test.ts` (+32 tests) targeting
  the survivor classes: throw paths (requireCoord/requireString — previously zero coverage),
  the tautological `if (x !== undefined)` optional-field gap (now presence AND absence both
  pinned), and exact toIsoDatetime / calendar_policy values.
- **Mutation score `fufireRequestBuilders.ts`: 38.95% → 94.74% total (95.74% covered)** —
  90 killed / 4 survived / 1 no-cov.
- The remaining 4 survivors + 1 no-cov are **equivalent mutants** (mathematically unkillable),
  documented in `metrics/mutation-baseline.json`, NOT papered over with fake tests:
  - `parts[i] ?? "00"` → `?? ""`: `padStart(2,"0")` re-fills `""`→`"00"`; no input distinguishes them.
  - requireCoord left operand `typeof value !== "number"`→false: `Number.isFinite` alone (no
    coercion) already catches undefined/NaN/string identically — the typeof clause is redundant.
- Independent code-reviewer verdict: **HONEST** — reproduced ≥1 RED-on-mutation per test class,
  confirmed the survivors are genuine equivalents (not work-dodging). Full suite 205 green, lint 0.

This validates recommendation #2 (raise survivors → tests) end-to-end and demonstrates the
metrics-baseline before/after the discipline actually moves the number.
