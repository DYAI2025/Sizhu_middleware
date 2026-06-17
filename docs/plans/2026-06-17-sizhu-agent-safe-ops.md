# Implementation Plan: sizhu-agent-safe-ops

Status: planned (Phase 1)
Date: 2026-06-17
Feature Slug: sizhu-agent-safe-ops
Branch: feat/sizhu-agent-safe-ops
Author: planner (strategic planning agent)
PRD: docs/prd/sizhu-agent-safe-ops.prd.md
Canvas: docs/canvas/sizhu-agent-safe-ops.canvas.md
Traceability: docs/traceability.md (§sizhu-agent-safe-ops)

> Scope is frozen + user-confirmed. In-scope = REQ-001..008 (Epic A + Epic B).
> Epic C (REQ-009/010/011) is DEFERRED to backlog — see Backlog note at the end; not planned here.
> Every task stays inside CAN-011 Allowed change scope. Every behaviour-change ships a guard test
> + a RED-on-revert proof in the commit body (NFR-001 / P4). One atomic signed commit per task.

## M = 8 milestones (iteration denominator)

M is derived from the atomic breakdown below: **8 tasks** (T1..T8), each an independently
committable, test-backed increment. This is the denominator for the orchestrator's N/M counter.
It is NOT a round number — it is the count of atomic increments after decomposition:

- REQ-002 splits into the seam (T1) and the persistence behaviour (T2) — different files, different
  RED-on-revert proofs, and T2 needs T1's contract to exist first.
- REQ-001 (route gate, the P9 load-bearing wire-in) is its own task (T3) and depends on T1+T2.
- The Supabase contract-only table (OQ-005 prod fail-closed) is its own task (T4) so the schema +
  throwing-stub guard is proved separately from the Local impl.
- REQ-003 and REQ-004 are two distinct route-truth behaviours but touch the same handlers and share
  one supertest file → folded into one task (T5) to keep the commit atomic and avoid a half-edited file.
- REQ-006/007 (delete stdio) is one deletion task (T6) — fully independent of Epic A.
- REQ-008 (off-by-default guard test on the single HTTP surface) is its own task (T7), gated to run
  after T6 so it asserts against the post-deletion single surface.
- T8 = the cross-cutting verification gate (full lint+test+importer-grep+mutation-list update) that
  closes the iteration — it is real work (P1/P9 proof, mutation registration), not a formality.

## Pre-flight (not a milestone — done by the orchestrator before T1)

- Confirm branch `feat/sizhu-agent-safe-ops` is checked out and clean.
- `tester` writes the **failing acceptance tests** (the contract) for AC-001..AC-010 against
  `createApp()` via supertest, plus the unit-level approval-record ACs. These RED acceptance tests
  are the per-task done-oracle; each task's coder then writes its own unit test first (TDD) and turns
  the relevant acceptance test GREEN. Acceptance tests live in `server/tests/*` and `src/tests/*`.

---

## Dependency DAG / safe ordering

```
            ┌─────────────────────────── Epic A (sequential core) ───────────────────────────┐
T1 (REQ-002 seam) ──► T2 (REQ-002 Local impl) ──► T3 (REQ-001 route gate, P9 wire-in)
        │                                              ▲
        └──► T4 (REQ-002 Supabase contract-only) ──────┘   (T4 feeds T3's prod fail-closed path)

T5 (REQ-003 + REQ-004 truthful reads / validate)   — independent of T1..T4, parallelizable

T6 (REQ-006/007 delete stdio)                       — fully independent, parallelizable
        └──► T7 (REQ-008 off-by-default guard test)  — must follow T6 (single-surface assertion)

T8 (verification gate: lint+test+importer-grep+mutation list) — last; depends on ALL of T1..T7
```

**Critical path:** T1 → T2 → T3 → T8  (the load-bearing money gate + its P9 route wire-in).

**Parallelizable lanes** (no shared files, can run concurrently):
- Lane A (Epic A core): T1 → T2 → T3, with T4 branching off T1 and rejoining at T3.
- Lane B (truth endpoints): T5 — touches only `server/index.ts` read/validate handlers + one test file.
- Lane C (MCP consolidation): T6 → T7.

Caveat on T5 vs T3: both edit `server/index.ts`. T5 touches the GET `/api/workflows/*`,
GET `/api/gateway-issues`, and POST `/validate-dispatch` handlers; T3 touches the POST `/dispatch`
handler + the composition-root imports. They are disjoint regions but the same file — if run in
parallel worktrees, T8 (or the orchestrator) resolves the trivial import-block merge. Sequencing
T3 then T5 (or vice-versa) avoids it entirely. Recommended serial order if single-threaded:
**T1, T4, T2, T3, T5, T6, T7, T8** (T4 early so T3 can wire both branches at once).

---

## Tasks

### T1 — ApprovalRepository contract seam (REQ-002 foundation, OQ-005)

- **REQ(s):** REQ-002 (the seam half).
- **Files (within CAN-011):**
  - `src/lib/repositories/interfaces.ts` — add `ApprovalRepository` interface.
  - `src/types.ts` (and re-export via `src/lib/domain/models.ts`) — add the `DispatchApproval`
    record type: `{ id (nonce), workflowRunId, artifactId, approverId, status: 'unused'|'used',
    expiresAt, createdAt, usedAt? }`. **Add the field to BOTH type homes** (memory: vitest env-leak
    / two-type-home rule).
- **Acceptance test(s):** none flips green yet (this is a pure contract). Compile-time only:
  `npm run lint` (tsc) stays green with the new interface referenced by a stub signature.
- **Unit test (TDD, coder writes first):** `src/tests/approvalRepository.contract.test.ts` — asserts
  the interface shape exists and the `DispatchApproval` type carries `workflowRunId` + `artifactId`
  + `status` + `expiresAt` + nonce `id` (a type-level / structural assertion).
- **Done-criterion:** interface + type compile; type present in both homes; lint green. No
  behaviour-change ⇒ no RED-on-revert required (declared explicitly: T1 is a contract-only task).
- **Depends on:** none.

### T2 — LocalApprovalRepository: atomic single-use consume (REQ-002 behaviour)

- **REQ(s):** REQ-002 (the load-bearing behaviour).
- **Files (within CAN-011):**
  - `src/lib/repositories/localRepository.ts` — add `LocalApprovalRepository implements
    ApprovalRepository`: durable (localStorage-backed, restart-resilient in DEMO_LOCAL) store with
    `issue(runId, artifactId, approverId)`, `getById(id)`, and **`consume(id, runId, artifactId)`**
    that atomically flips `unused→used` and returns the record ONLY if (a) it exists, (b) not
    expired, (c) status was `unused`, (d) `record.artifactId === artifactId` AND
    `record.workflowRunId === runId`. The unused→used flip + the check is a single critical section
    (read-modify-write on one key) so two concurrent consumes cannot both succeed.
  - `src/lib/app/appServices.ts` — add `get approvals()` returning
    `selectDependency(localApprovalRepo, supabaseApprovalRepo)` (the Supabase side is wired in T4;
    until then T2 may temporarily point the supabase slot at a throwing placeholder — but prefer
    ordering T4 before T2 so the seam is complete in one selectDependency call).
- **Acceptance test(s):** AC-002 (record decides, not `artifact.status`), AC-002b (id-swap →
  reject), AC-003 (tampered/expired/used → reject; replay rejected), AC-003c (concurrent → exactly
  one succeeds). These are unit-level against `LocalApprovalRepository` (no route yet).
- **Unit test (TDD, coder writes first):** `src/tests/approvalRepository.local.test.ts` —
  valid→consumed-once; second consume (sequential replay) → reject; expired → reject; tampered/absent
  → reject; artifactId-mismatch → reject; **two concurrent `consume()` (Promise.all) → exactly one
  resolves with the record, the other with reject** (AC-003c atomic-consume proof).
- **Done-criterion:** all six verdicts pass; concurrent-consume test green; restart-durability
  asserted in DEMO_LOCAL only (per EV-002 scope note — NO prod durability claim).
  **RED-on-revert (P4):** revert the atomic flip (e.g. make `consume` return the record without
  setting `status='used'`, or drop the `artifactId===` check) → the replay test / id-mismatch test
  goes RED. Note the mutation + restore in the commit body.
- **Depends on:** T1 (interface), and T4 for the complete `selectDependency` wiring.

### T3 — Dispatch route money-gate: consume record + bind artifactId (REQ-001, P9 wire-in)

- **REQ(s):** REQ-001 (route gate; the load-bearing P9 `wired-in-prod` case).
- **Files (within CAN-011):**
  - `server/index.ts` — in the `POST /api/fulfillment/pod/dispatch` handler (currently line ~231,
    calls `dispatchArtifact` directly, ZERO gate): BEFORE `dispatchArtifact()`, (a) read the approval
    record id from the request, (b) `await appServices.approvals.consume(recordId, workflowRunId,
    artifact.id)`; on null/reject → `return res.status(403).json({ ok:false,
    error_code:'DISPATCH_NOT_ALLOWED' })` (or `APPROVAL_TOKEN_INVALID`) with **no provider call**;
    (c) as a SECONDARY shape-check call `WorkflowStateMachine.assertDispatchAllowed(run, artifact)`
    — this gives `assertDispatchAllowed` its first server-route caller (P9), but the spec records it
    as secondary, NOT the state-decider (BLOCKER-3); (d) on success emit a sanitized audit log
    `{ recordId, workflowRunId, artifactId, approverId }` (NFR-003: no PII/secret).
  - `server/middleware/auth.ts` — `/dispatch` is ALREADY `sensitive` (line 154); **no change
    needed** there (BLOCKER-2: classification is DONE, not TO-BUILD). Listed here only to record it
    was verified, not re-added.
  - `src/lib/workflow/stateMachine.ts` — no change to logic; this task makes it imported by the
    route (the assertion call site). If a thin import-only adjustment is needed it stays here.
- **Acceptance test(s):** AC-001 (no valid record → 403 + no provider call), AC-004 (valid record +
  accepted artifact → passes, record consumed, audit entry), AC-003b (prod-mode/no store →
  fail-closed 403 — covered by T4's wiring but exercised here via supertest).
- **Unit/integration test (TDD, coder writes first):** `server/tests/pod.dispatch.gate.test.ts`
  (supertest vs `createApp()`): missing/invalid record → 403, **assert `dispatchArtifact` / provider
  is NOT invoked** (spy); valid record → 200 + record now `used` + audit log emitted; replay of the
  same record on a second request → 403.
- **Done-criterion:** 403-on-no-record + no-provider-call green; **importer-grep proves
  `assertDispatchAllowed` AND `appServices.approvals` now have a non-test server-route caller
  reachable from `createApp()`** (NFR-002/P9 — this is the row that flips `wired-in-prod=yes`).
  **RED-on-revert (P4):** remove the `consume()` call (restore the direct `dispatchArtifact`) →
  AC-001 supertest goes RED. Note in commit body.
- **Depends on:** T1, T2, T4 (the `approvals` seam must select a real Local impl in DEMO_LOCAL and a
  throwing stub in prod before the route can consume it).

### T4 — Supabase ApprovalRepository stub + `dispatch_approvals` table (REQ-002 prod fail-closed, OQ-005)

- **REQ(s):** REQ-002 (prod fail-closed leg), AC-003b.
- **Files (within CAN-011):**
  - `src/lib/repositories/supabaseRepository.stub.ts` — add `SupabaseApprovalRepository implements
    ApprovalRepository`; every method `throw new SupabaseNotConfiguredError()` (same pattern as the
    other Supabase stubs). No store ⇒ in prod `consume()` throws ⇒ dispatch fail-closed.
  - `src/lib/app/appServices.ts` — register `supabaseApprovalRepo` singleton + complete the
    `get approvals()` `selectDependency(localApprovalRepo, supabaseApprovalRepo)` call.
  - `supabase-schema.sql` — add the `dispatch_approvals` table (id/nonce, workflow_run_id,
    artifact_id, approver_id, status, expires_at, created_at, used_at) **contract-only** + an RLS
    note. The stub stays throwing — the table is documentation of the future shape, NOT a live store
    this run (CAN-006 / OQ-005).
- **Acceptance test(s):** AC-003b — in non-DEMO_LOCAL mode, dispatch is fail-closed (403 /
  SOURCE_NOT_CONFIGURED, no provider call).
- **Unit/integration test (TDD, coder writes first):** `server/tests/pod.dispatch.failclosed.test.ts`
  — set app mode to a non-`DEMO_LOCAL` value; POST `/dispatch` with any body → 403 / fail-closed,
  provider NOT invoked, the `SupabaseNotConfiguredError` is caught and mapped to a controlled 403/503
  (no stack/secret leak — NFR-003).
- **Done-criterion:** prod-mode dispatch fail-closed test green; schema table present
  (contract-only); stub throws (verified by the fail-closed test, which is RED if the stub silently
  returned a record). **RED-on-revert (P4):** make the Supabase stub return a fake `unused` record
  instead of throwing → the fail-closed test goes RED. Note in commit body.
- **Depends on:** T1 (interface). Independent of T2; rejoins at T3.

### T5 — Truthful reads + honest validate-dispatch (REQ-003, REQ-004)

- **REQ(s):** REQ-003 (truthful `/workflows/*` + `/gateway-issues`), REQ-004 (`/validate-dispatch`
  not READY for non-accepted).
- **Files (within CAN-011):**
  - `server/index.ts` —
    - GET `/api/gateway-issues` (line ~124, currently `{ status:'OK', issues:[] }`) → return
      `NOT_IMPLEMENTED` / `SOURCE_NOT_CONFIGURED` (no fabricated empty-success 200-with-array).
    - GET `/api/workflows/*` (line ~128, currently `{ status:'OK', workflows:[] }`) → same.
    - POST `/api/fulfillment/pod/validate-dispatch` (line ~223, currently unconditional
      `READY_FOR_DISPATCH`) → for a non-accepted artifact return NOT `READY_FOR_DISPATCH` (real check
      or `VALIDATION_SHAPE_ONLY` label per AC-006).
- **Acceptance test(s):** AC-005 (no `200 {workflows:[]}`/`{issues:[]}` success), AC-006
  (non-accepted artifact ⇏ `READY_FOR_DISPATCH`).
- **Unit/integration test (TDD, coder writes first):** `server/tests/reads.truthful.test.ts`
  (supertest vs `createApp()`): GET `/api/workflows/anything` and GET `/api/gateway-issues` →
  `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED`, never a 200 array-success;
  POST `/validate-dispatch` with `artifact.status!=='accepted'` → not `READY_FOR_DISPATCH`.
- **Done-criterion:** both ACs green. **RISK-002 note:** flag the consumer-break for UI/MCP in the
  commit body (these endpoints previously returned arrays). **RED-on-revert (P4):** restore the
  empty-array `200`/unconditional READY → the truthful-reads test goes RED. Note in commit body.
- **Depends on:** none (parallelizable; only file-region overlap with T3 in `server/index.ts`).

### T6 — Delete the stdio MCP transport (REQ-006, REQ-007)

- **REQ(s):** REQ-006 (single catalog source), REQ-007 (delete redundant transport).
- **Files (within CAN-011):**
  - Delete `server/mcp/*` (all 17 files: `server.ts`, `response/sanitize.ts`, `auth/agentPolicy.ts`,
    `auth/tokenContext.ts`, `adapters/*`, `registry/*`, `tests/*`).
  - `package.json` — remove the `mcp:stdio` (line ~19) and `test:mcp` (line ~20) scripts.
  - `mcp-server/*` — the HTTP surface becomes the SOLE catalog source. Update the
    `mcp-server/README.md` line that says "until the server-side approval gate is built" to reflect
    T3's landed gate (keep it honest — coordinate with T3's state).
- **Pre-deletion verification (record in commit body):** importer-grep confirming `server/mcp/*` has
  ZERO non-test production importers (CAN-011/EV-007 says belegt = already zero); confirm
  `agentPolicy.ts` is stdio-only (imported only by `server/mcp/registry/tools.ts`) so deletion
  widens no agent-auth gap (CONCERN-3 — the HTTP surface forwards the aal2 token to `/api` whose
  `apiGuard` enforces aal2/role).
- **Acceptance test(s):** AC-009 (grep: no second divergent hand-catalog after deletion).
- **Test (coder):** `npm run build` + `npm run test` green post-deletion (no dangling import); a grep
  assertion that `server/mcp` no longer exists and no remaining file imports it.
- **Done-criterion:** `server/mcp` gone; scripts removed; build+test green; importer-grep = zero;
  one-source catalog. No RED-on-revert needed for a pure deletion, BUT record the importer-grep
  evidence (the safety claim "0 importers" is the guard — EV-007). If anything DID import it, that is
  a STOP (escalate, do not delete).
- **Depends on:** none (fully independent of Epic A). Coordinate the README honesty edit with T3.

### T7 — Dispatch off-by-default guard test on the single HTTP surface (REQ-008)

- **REQ(s):** REQ-008 (dangerous tools off by default; parity on the single surface).
- **Files (within CAN-011):**
  - `mcp-server/src/*` tests (e.g. `mcp-server/src/__tests__/dispatch.offbydefault.test.ts` or the
    existing test location for `server.ts`). REQ-005 flag-gate already lives at
    `mcp-server/src/server.ts:138` (DONE) — this task adds the GUARD TEST that locks it.
- **Acceptance test(s):** AC-007 (no `MCP_ENABLE_DISPATCH` → `sizhu_pod_dispatch` NOT in
  `tools/list`), AC-010 (parity test green; revert the off-by-default rule → RED).
- **Test (TDD, coder writes first):** without `MCP_ENABLE_DISPATCH` → `tools/list` excludes
  `sizhu_pod_dispatch`; with `MCP_ENABLE_DISPATCH=true` → it appears; assert shared-capability tool
  names are stable on the single surface.
- **Done-criterion:** off-by-default test green. **RED-on-revert (P4):** flip the `server.ts:138`
  guard to always-register (drop the `=== "true"` check) → the off-by-default test goes RED. Note
  the mutation + restore in the commit body (EV-008).
- **Depends on:** T6 (assert against the single post-deletion HTTP surface).

### T8 — Verification gate: lint + test + importer-grep + mutation registration (NFR-002/004, P1/P9)

- **REQ(s):** cross-cutting — closes EV-001/EV-002 wiring proof + NFR-002/NFR-004.
- **Files (within CAN-011):**
  - `stryker.config.json` — add the new critical pure module(s) (`LocalApprovalRepository`, and the
    `stateMachine`/route-gate decision points if pure-extractable) to the `mutate` list; update
    `metrics/mutation-baseline.json` with the before/after score (P4 mutation oracle).
- **Acceptance / verification:**
  - `npm run lint` (tsc) green; `npm run test` green (full suite, including the new acceptance tests).
  - **Importer-grep (P1/P9):** prove `assertDispatchAllowed` AND `appServices.approvals` each have ≥1
    NON-TEST importer reachable from `createApp()` (this is what authorizes flipping REQ-001/REQ-002
    `wired-in-prod` from `planned` to `yes` in the traceability matrix).
  - `npm run test:mutation` on the curated list → record the new approval-record module's kill score.
  - Run with the env-leak guard (memory): `VITE_APP_MODE= APP_MODE= npx vitest run` to avoid the
    DEMO_LOCAL test leak.
- **Done-criterion:** all green; importer-grep evidence captured; mutation list + baseline updated.
  This task produces the verification artifacts the increment necessarily generates (P5):
  `docs/verification*.md` / reality-ledger evidence + the traceability `wired-in-prod` flip.
- **Depends on:** ALL of T1..T7.

---

## Per-task summary table

| Task | REQ(s) | Acceptance test(s) | Key files | RED-on-revert guard | Depends on |
|---|---|---|---|---|---|
| T1 | REQ-002 (seam) | (compile/lint) | interfaces.ts, types.ts, domain/models.ts | n/a (contract-only) | — |
| T2 | REQ-002 (behaviour) | AC-002, AC-002b, AC-003, AC-003c | localRepository.ts, appServices.ts | revert atomic flip / id-check → replay/id-mismatch test RED | T1 (+T4) |
| T3 | REQ-001 (P9 wire-in) | AC-001, AC-004, AC-003b | server/index.ts, auth.ts (verify only), stateMachine.ts | remove consume() → AC-001 RED | T1, T2, T4 |
| T4 | REQ-002 (prod fail-closed) | AC-003b | supabaseRepository.stub.ts, appServices.ts, supabase-schema.sql | stub returns fake record → fail-closed test RED | T1 |
| T5 | REQ-003, REQ-004 | AC-005, AC-006 | server/index.ts | restore empty-array 200 / unconditional READY → reads test RED | — |
| T6 | REQ-006, REQ-007 | AC-009 | delete server/mcp/*, package.json, mcp-server/README.md | importer-grep=0 evidence (deletion guard) | — |
| T7 | REQ-008 | AC-007, AC-010 | mcp-server/src tests | flip server.ts:138 guard always-on → off-by-default test RED | T6 |
| T8 | NFR-002/004 | lint+test+importer-grep+mutation | stryker.config.json, metrics/mutation-baseline.json | (verification gate) | T1..T7 |

## Risks & mitigations (plan-level)

- **R: `server/index.ts` region overlap (T3 vs T5).** Mitigation: serial order T3→T5, or trivial
  import-block merge resolved at T8. Disjoint handler regions.
- **R: T6 deletion finds a real importer (would widen an auth gap or break build).** Mitigation:
  the pre-deletion importer-grep is a STOP gate (P9) — if non-zero, escalate, do not delete.
- **R: prod dispatch is non-functional this iteration (CONCERN-1, user-accepted).** Mitigation: this
  is recorded plainly in the PRD §Scope-status and AC-003b; the plan does NOT claim a working prod
  dispatch — DEMO_LOCAL only. Not laundered.
- **R: truthful reads break UI/MCP consumers (RISK-002).** Mitigation: flagged in T5 commit body;
  coordinate consumer updates outside this run's scope.

## Success criteria (iteration)

- AC-001..AC-010 all green (AC-011/012/013 are DEFERRED — Epic C).
- REQ-001/REQ-002 traceability rows flip `wired-in-prod=yes` ONLY after T8's importer-grep proof.
- `assertDispatchAllowed` has a real server-route caller (P9 closed).
- One MCP surface (stdio deleted, importer-grep=0); dispatch off-by-default guard test RED-on-revert.
- `npm run lint` + `npm run test` green; new critical module in the Stryker mutate list.

## Backlog (DEFERRED — NOT planned this run)

- **Epic C (REQ-009 OrderInputSchema/ProductTemplateSchema; REQ-010 granular WorkflowState machine;
  REQ-011 WorkflowEvent + Record contracts):** re-enters scope only when a real prod consumer wires
  them on the request path (P1 built-but-dead avoidance). Vision VIS-006 #4 (granular contracts
  referenced by the gate) is explicitly NOT delivered this iteration.
- **Supabase live ApprovalRepository:** a later slice replaces the throwing stub with a real store so
  prod dispatch becomes functional (this run is prod-fail-closed by design).
