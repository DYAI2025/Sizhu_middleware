# Plan: Prompt Compile Preview Slice (2026-06-18)

Feature: prompt-compile-preview · PRD: docs/prd/prompt-compile-preview.prd.md · Mode: CORE
Loop caps: MAX_DEVREVIEW_LOOPS=4, MAX_QA_RETURNS=3
Validate each task: `VITE_APP_MODE= APP_MODE= npx vitest run <file>` (env-leak guard) + `npm run lint`.

Atomic, dependency-ordered tasks (TDD: RED test first, then minimal impl, then green + review + Watcher):

| T | REQ | Files | Dependency | RED test → green |
|---|---|---|---|---|
| T1 | REQ-003 | server/contracts/fufireContract.ts, server/services/fufireResponseInterpreter.ts | — | new-field reader test (stamm/zweig/lichun/is_before_lichun/provenance from `data.`), existing reads unchanged |
| T2 | REQ-004 | server/services/baziSymbolMapper.ts | — | full 10-stem/12-branch/5-wuxing table; role-keyed; AC-002 + AC-002b collision (Wu→午 not 戊); unknown→SOURCE_NEEDED |
| T3 | REQ-002 | server/services/templateRegistryService.ts | — | two variant ids resolvable; unknown id→BLOCKED |
| T4 | REQ-007 | server/services/compileValidationService.ts | T2 | §5/§12 gates: no unresolved placeholder, branch≠animal, unknown symbol, lichun provenance, image-text policy, claim safety; RED-on-revert |
| T5 | REQ-005 | server/services/promptCompilationService.ts (Lane 1) | T1,T2,T3 | deterministic template_placeholders + overlay_plan + rawDataBindings; no LLM; determinism test |
| T6 | REQ-006 | server/services/promptCompilationService.ts (Lane 2) | T5 | injected LLM client; symbol-value diff vs Lane1 = 0 (AC-005) |
| T7 | REQ-001 | server/index.ts (+ optional server/routes/compileTemplateRoutes.ts), server/middleware/auth.ts | T4,T5,T6 | supertest: 200 happy, 401 unauth, BLOCKED cases; apiGuard classification |
| T8 | REQ-008 | src/components/WorkflowBuilderView.tsx (+ result panel) | T7 | button calls route; panel renders payload/bindings/gates/blockers |
| T9 | REQ-009 | scripts/smoke/{openrouter,fufire}-compile-smoke.ts, package.json | T6,T7 | flag-gated; FuFire shape drift guard (FAIL LOUD); secret-hygiene self-check |

Per-task: fresh coder → code-reviewer (diff) → plumbline-watcher (value adherence) → orchestrator re-verify → atomic signed commit. Per-increment scope-check vs Canvas `Allowed change scope`.

Gate A (Phase 3): typecheck/lint/unit/integration green. Gate C: per-REQ validation + Reality Ledger. Gate E: Watcher true-line.
