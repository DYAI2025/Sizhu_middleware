# Fix Plan — PR #4 code-review findings (sizhu-secure-fufire-baseline)

Status: executed (2026-06-13) — FP1–FP4 done, FP5 via build-before-test; 153/153 tests, tsc clean,
all PRIL gates pass, code-reviewer APPROVE (both behavior-change mutations verified RED-on-revert).
Owner: orchestrator
Branch: feat/sizhu-secure-fufire-baseline
Source: code-review workflow wf_f317284b-bdc (5 dims, 5 verified-real findings + low-severity nits)

## Goal
Close every verified review finding from PR #4 with the smallest correct change set, keeping
130+ tests green and tsc clean. All findings are **minor** (0 blocking, 0 important after
adversarial verification), so this is hygiene/robustness hardening — not a remediation of a
shipped defect.

## Non-goals
- No new feature work (T7 idempotency, T8 verification log remain separate /agileteam tasks).
- No live FuFire/OpenRouter calls; evidence ceilings unchanged (REQ-F-002/F-003 stay integration-fake).
- No broad refactors: provider-union-as-named-types (L10) and RequestBody rename (L9) are
  DEFERRED as cosmetic — not in this plan (documented as "won't do this pass").

## Preconditions / known gaps
- Working tree clean on feat branch (df4b936 + ad6a378 pushed; PR #4 open).
- PRIL Stop-hook provable (local gitignored shims at config/claude/bin; gates pass).
- All fix targets are inside the confirmed Allowed change scope.
- Known gap: F-PLAN-3 (Gelato config call-time eval) overlaps the pending T7 (Gelato safety);
  this plan does the test+config-correctness slice; T7 still owns the idempotency-key work.

## Tasks

### FP1 — FuFire data-request boundary hardening  (REQ-F-001, REQ-A-001)
Fold findings F1 (||-gate + required-coord validation; drop `as number` casts), L1 (drop
`|| process.env.FUFIRE_API_KEY` fallback), L2 (cap upstream error text), L3 (type
`executeTestRun` input/result), L4 (`operation` singular via collectRequestedOperations),
L8 (dispatch `build` → `Record<string,unknown>`), F2 (T4-interpreter not-wired doc breadcrumb),
F5 (requestBuilders test: non-optional enum assertions + single-coordinate validation test).
- Files: `server/services/fufireDataService.ts`, `server/services/fufireRequestBuilders.ts`,
  `server/contracts/fufireContract.ts` (new `*ReadyInput` narrowing or a validate helper),
  `server/services/fufireResponseInterpreter.ts` (header breadcrumb only), `server/services/fufireOperations.ts` (reuse collectRequestedOperations).
- Tests: extend `server/tests/fufire.requestBuilders.test.ts` (F5 + half-coord case); add a
  `server/tests/fufire.testrun.validation.test.ts` (single-coordinate → controlled gateway
  issue, NOT a malformed outbound call; no `FUFIRE_API_KEY` bare-fallback path).
- Acceptance evidence: new validation test RED→GREEN; mutation — reverting the `||` gate to
  `&&` turns the single-coord test RED. Full suite green + tsc clean. No secret in metadata.

### FP2 — shared default-noon constant  (REQ-F-001)
Fold L5: runner uses `'12:00'`, normalizer/contract use `'12:00:00'`. Single-source it.
- Files: `src/lib/workflow/runner.ts` (import `DEFAULT_NOON_TIME` from the contract/normalizer),
  no change to the constant itself.
- Tests: existing workflow tests stay green; add an assertion that the runner's default-noon
  literal === the contract `DEFAULT_NOON_TIME` (single-source guard).
- Acceptance: tsc clean; full suite green; grep shows no bare `'12:00'` default-noon literal in runner.

### FP3 — T6 persistence boundary closure  (REQ-D-001)
Fold F4 (persistence.boundary doesn't test providers/roles repos) + L6 (carve-out doc on the
two non-throwing stub reads) + L12 (workflowRunner stub `Pick` type instead of `as unknown as`).
- Files: `src/lib/repositories/supabaseRepository.stub.ts` (1-line carve-out comment on
  `performHealthCheck`→non-LIVE + `getActiveRole`→lowest-privilege; explain deliberate AC-D-001a
  carve-out), `src/lib/app/appServices.ts` (stub runner typed via `Pick<WorkflowRunner,...>`),
  `src/tests/persistence.boundary.test.ts` (add providers + roles cases in non-DEMO modes).
- Tests: new cases assert `getActiveRole()` returns lowest-privilege (`Observer`) and
  `performHealthCheck()` returns a non-LIVE/non-success status outside DEMO_LOCAL (carve-out pinned,
  cannot drift to privileged/LIVE); the throwing repos still raise SUPABASE_NOT_CONFIGURED.
- Acceptance: new cases RED→GREEN; full suite green; closes T6's review coverage gap.

### FP4 — Gelato no-fake-success test correctness  (REQ-O-002)
Fold F3: `POD_ENABLED` env-mutation is a no-op (config frozen at import) + assertion
`error_code.length>0` never reaches the `MISSING_POD_CONTRACT` boundary it names.
- Files: `src/lib/apiConnections/fulfillmentConfig.ts` (make `enabled`/`dispatchMode`/mappings
  call-time-evaluable — a `getGelatoFulfillmentConfig()` reading env at call time, keeping the
  const export for back-compat OR switching the service to the getter), `server/services/podDispatchService.ts`
  (read config at call time), `server/tests/no-fake-success.mode.test.ts` — NOTE: this is a
  tester-authored file; only edit if it is NOT a frozen contract. If it is a contract, add a NEW
  test `server/tests/pod.dispatch.branches.test.ts` instead that drives each branch and asserts
  the SPECIFIC error_code (POD_PROVIDER_DISABLED / POD_DISPATCH_DISABLED / NO_POD_PRODUCT_UID_MAPPING /
  NO_POD_API_KEY_CONFIGURED / MISSING_POD_CONTRACT) — never `length>0`.
- Tests: a test that reaches the real MISSING_POD_CONTRACT branch (enabled+mode+mappings+key) and
  asserts `error_code==='MISSING_POD_CONTRACT'`, ok:false, no `mock_success` outside DEMO_LOCAL.
- Acceptance: mutation — replacing the MISSING_POD_CONTRACT branch with `{ok:true,'mock_success'}`
  turns the new test RED (it currently stays green). Full suite green.

### FP5 — bundle secret-hygiene ceiling honesty  (REQ-S-002 / NFR)
Fold L7: `bundle.secret-hygiene` silently downgrades to source-grep when `dist/` absent.
- Files: `src/tests/bundle.secret-hygiene.test.ts` (if not a frozen tester contract) OR a note +
  build-before-test guidance. Preferred: when `dist/` is absent, the bundle assertion hard-skips
  with a VISIBLE skip reason (not a silent pass at the weaker ceiling).
- Tests: the file itself; running with/without dist/ shows the explicit ceiling.
- Acceptance: no silent downgrade — absent dist/ → visible skip, present dist/ → real-boundary-smoke.

## Risks & rollback
- **FP1 `&&`→`||` gate**: changes validation behavior — a half-coord request now gets a clean
  local gateway issue instead of a malformed outbound call. Risk: a caller relying on the old
  pass-through. Mitigation: the only caller (FuFireTestConsole) already sends both-or-neither;
  TDD test pins the new behavior. Rollback: revert the gate + the validation helper.
- **FP4 call-time config eval**: changing `fulfillmentConfig` from import-time to call-time could
  affect other consumers. Mitigation: grep all importers first; keep a back-compat const if any
  consumer reads the frozen value. Rollback: revert to import-time const + drop the new test.
- **Tester-contract files** (`no-fake-success.mode.test.ts`, `bundle.secret-hygiene.test.ts`,
  `fufire.requestBuilders.test.ts`): do NOT weaken assertions; if a change would alter what is
  proven, add a NEW test instead of editing the contract. Independence preserved.
- All changes are minor + reversible; each FP is an independent commit-able slice.

## Execution order
FP2 (trivial) → FP1 (largest, security boundary) → FP3 (T6 closure) → FP4 (Gelato test) → FP5.
After all: full `npm test` + `npm run lint` + scope/context/reality gates + one combined
code-review pass (minor-only → no full per-increment chain per task). Update traceability +
reality ledger where evidence class changes.

## Plan-review corrections (2026-06-13, empirical check)
- **C1 (independence):** `fufire.requestBuilders.test.ts` IS a tester contract (marker present) →
  do NOT edit it. F5 (non-optional enum assertion) + the single-coordinate validation move to a
  NEW file `server/tests/fufire.testrun.validation.test.ts`. Same rule for the other
  tester-authored files: FP4 adds NEW `server/tests/pod.dispatch.branches.test.ts` (does not edit
  `no-fake-success.mode.test.ts`); FP5 does not edit `bundle.secret-hygiene.test.ts`.
- **C2 (FP4 blast radius):** `gelatoFulfillmentConfig` has exactly ONE importer
  (`server/services/podDispatchService.ts`) → safe to add `getGelatoFulfillmentConfig()` (call-time
  env eval) and switch the service to it; keep the const export for back-compat.
- **C3 (FP1 geocoder):** `&&`→`||` PRESERVES the existing both-undefined→`NO_GEOCODER` path and adds
  the half-coord case; no existing test breaks (callers send both-or-neither).
- **C4 (FP5 downgrade):** instead of editing the tester file, the T8/verification step runs
  `npm run build` BEFORE the suite so `bundle.secret-hygiene` hits its real-boundary-smoke ceiling;
  add a doc note. Low nit — no production/test-file change this pass.

## Won't do this pass (documented)
- L9 (rename RequestBody<T>), L10 (provider unions as named types), L11 (appmode literal-mode
  assertions), L13 (0,0-guard doc note) — cosmetic / broad-touch; deferred to avoid churn.
