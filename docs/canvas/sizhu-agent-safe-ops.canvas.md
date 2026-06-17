# Product Canvas: Sizhu Agent-Safe Ops

Status: user-confirmed
Feature Slug: sizhu-agent-safe-ops
Confirmed by user: yes
Confirmation date: 2026-06-17
Confirmer: ben.poersch@gmail.com
Re-confirmation note: Re-confirmed at the Phase 0.5 USER GATE after the Phase 0.16 Council amendments + the Phase 0.7 spec-audit remediation (BLOCKER-1/2/3 fixed) + explicit acceptance of CONCERN-1 (prod dispatch fail-closed/non-functional this iteration; DEMO_LOCAL only) and OQ-005 (mode-switched seam).
Amendment date: 2026-06-17
Amendment note: Was user-confirmed at Phase 0.15 (2026-06-17, ben.poersch@gmail.com); RETURNED TO DRAFT after the Phase 0.16 Council challenge gate per the adopt→amend→re-confirm rule. Council (3-way convergence) + user adopted: gate = DEFENSE-IN-DEPTH (aal2/sensitive route + persisted single-use approval record + assertDispatchAllowed-at-route, replacing the bespoke signed token; OQ-001 resolved); DEFER Epic C (contract backbone — P1 built-but-dead risk); DELETE stdio transport (zero importers verified, not unify; OQ-002 resolved); honest reads = NOT_IMPLEMENTED (OQ-003 resolved). New OQ-005 (approval-store home) added. Target-user split NOT adopted (CAN-002 stays fused). Needs user re-confirmation.

| Section | ID | Value | Source Type | Source |
|---|---|---|---|---|
| Problem | CAN-001 | Die High-Level-Pipeline (Etsy → Middleware → FuFire → Template → LLM-Bild → QG1 → QG2 → Gelato → Order → Confirmation) ist nie end-to-end getestet; die MCP-/`/api`-Surface mischt reale, lügende und un-gegate-te Elemente. Agenten können nicht sicher operieren. | EXPLICIT | SRC-001, SRC-003 |
| Users / Customers | CAN-002 | Operatoren + Remote-AI-Agenten (Claude Code, Codex, Hermes, openclaw). | EXPLICIT | SRC-005 |
| Value Promise | CAN-003 | Eine agenten-sichere, wahrheitsgemäße Ops-Schicht: keine Fake-Erfolge, kein ungesicherter Geld-Pfad, eine konsolidierte MCP-Surface, ein Vertrags-Backbone. | EXPLICIT | SRC-001 |
| Current Alternatives | CAN-004 | Heute: zwei divergierende MCP-Layer; `/api`-Reads mit hartkodierten Leerlisten; Dispatch-Gate nur im In-Process-Runner, nicht auf der REST-Route. | EXPLICIT | SRC-001, SRC-002 |
| Key Capabilities | CAN-005 | (A) **Defense-in-Depth Dispatch-Gate** (Route als `sensitive`/aal2 + persistierter Single-Use-Approval-Record + `assertDispatchAllowed` AUF der Route) + ehrliche Read/Validate-Endpunkte. (B) **EINE MCP-Surface**: stdio (`server/mcp`) gelöscht (0 Importer verifiziert), HTTP `mcp-server` ist die kanonische Quelle. (C) **DEFERRED** (Backlog): Contract-Backbone (Order/ProductTemplate/granulare WorkflowState-Machine/Event-Schemas) — erst bauen, wenn ein realer Prod-Consumer sie auf dem Request-Pfad verdrahtet (P1 built-but-dead vermeiden). | EXPLICIT (post-council) | SRC-005, Council 2026-06-17 |
| Non-Goals | CAN-006 | KEINE reale Supabase-Persistenz-Implementierung — **Ausnahme (narrow)**: der `ApprovalRepository`-Contract + Local-Impl (DEMO_LOCAL, durable) für den Single-Use-Approval-Record; in Prod bleibt der Supabase-Stub werfend → Dispatch **fail-closed** (kein Store ⇒ kein Dispatch). KEINE FuFire-RAW-Verdrahtung; KEINE QG1/QG2-Trennung; KEIN Gelato-Adapter; KEIN Etsy-Intake-Adapter. **Epic C (Contract-Backbone) ist diesen Run DEFERRED** (Backlog, nicht „done"). (H-1/H-2/H-4 durch LGQ gelöst — H-1/H-4 belegt, H-2 ungeprüft aber out-of-scope.) | EXPLICIT (post-council) | SRC-005, SRC-007, Council 2026-06-17 |
| Constraints | CAN-007 | Single-Express-Server-Modell; Secret-Ref-Indirektion; Default-Deny-`apiGuard`; jede Verhaltensänderung mit Guard-Test + RED-on-revert (P1–P9); `mcp-server` ist separates npm-Paket (Cross-Package-Grenze für geteilten Katalog). | EXPLICIT | SRC-006, SRC-002 |
| Risks | CAN-008 | Signed-Token ohne Persistenz → Replay/Revocation-Risiko; ehrliche Endpunkte (NOT_IMPLEMENTED) können bestehende Konsumenten brechen; Contract-only-State-Machine driftet ggü. Laufzeit. (H-1/H-2/H-4 sind durch LGQ gelöst — kein offenes Risiko mehr.) | EXPLICIT | SRC-001, SRC-007 |
| Success Signal | CAN-009 | Dispatch nur mit gültigem **verbrauchbarem Single-Use-Approval-Record** (das alleinige last-tragende Money-Gate; aal2/sensitive ist Caller-Auth, schon vorhanden, kein Dispatch-Gate); dispatched artifactId == approbierte; keine fabrizierten Leerdaten (`NOT_IMPLEMENTED`); EINE MCP-Surface (HTTP, stdio gelöscht). ~~granulare WorkflowState-Contracts~~ → Epic C DEFERRED. | EXPLICIT (post-council, spec-audited) | SRC-001, SRC-005, Council 2026-06-17 |
| Evidence | CAN-010 | Importer-Grep (Gate auf Route, P1/P9), Tool-Parity-Test, Schema-Validierungstests, 403-DISPATCH_NOT_ALLOWED-Test mit RED-on-revert, tools/list ohne pod_dispatch ohne Flag. | EXPLICIT | SRC-006 |
| Allowed Scope | CAN-011 | `server/index.ts` (Dispatch/Validate/Read-Routen), `server/middleware/auth.ts` (SENSITIVE_API_ROUTES-Eintrag für `/dispatch`), neues Approval-Record-Modul + `ApprovalRepository` unter `src/lib/repositories/*` + `src/lib/workflow/stateMachine.ts` (assertDispatchAllowed-Aufrufstelle), `supabase-schema.sql` (`dispatch_approvals`-Tabelle, Contract-only/stub-werfend), Löschung von `server/mcp/*` + `package.json` (Script `mcp:stdio`/`test:mcp`), `mcp-server/*` (Single-Surface), zugehörige Tests unter `server/tests/*`, `src/tests/*`, `mcp-server/src/*`. Epic-C-Module NICHT in diesem Run. Keine `/api`-Routen außerhalb Fulfillment/Workflows/Gateway. | EXPLICIT (post-council) | SRC-005, Council 2026-06-17 |
| Unresolved Questions | CAN-012 | **OQ-001 RESOLVED** (Council/User 2026-06-17): kein bespoke Signing-Key — Defense-in-Depth = aal2/sensitive + persistierter Single-Use-Approval-Record + assertDispatchAllowed-auf-Route. **OQ-002 RESOLVED**: stdio löschen. **OQ-003 RESOLVED**: NOT_IMPLEMENTED, kein Store. **OQ-004 RESOLVED**: H-1/H-2/H-4 out-of-scope (LGQ-gelöst). **OQ-005 NEW (zu bestätigen Phase 0.5)**: Approval-Store-Home — ASSUMPTION = mode-switched Repo-Seam (`ApprovalRepository`), DEMO_LOCAL=Local durable, Prod=Supabase-Stub→fail-closed. | EXPLICIT (post-council) | SRC-005, Council 2026-06-17 |

## Allowed change scope

Machine-readable rendering of CAN-011 (faithful, no code-scope broadening) + the P5 process/verification
artifact classes this feature necessarily produces. Read by `plumbline-scope-check` / the PRIL Stop hook.

- `docs/canvas/sizhu-agent-safe-ops.canvas.md`
- `docs/prd/sizhu-agent-safe-ops.prd.md`
- `docs/vision/sizhu-agent-safe-ops.vision.md`
- `docs/traceability.md`
- `docs/plans/**`
- `docs/context/**`
- `docs/reality/**`
- `docs/verification/**`
- `docs/decisions/**`
- `server/index.ts`
- `server/middleware/auth.ts`
- `src/lib/repositories/**`
- `src/lib/workflow/stateMachine.ts`
- `supabase-schema.sql`
- `server/mcp/**`
- `mcp-server/**`
- `server/tests/**`
- `src/tests/**`
- `mcp-server/src/**`
- `mcp-server/tests/**`
- `package.json`
- `stryker.config.json`
- `metrics/**`
- `src/lib/app/**`
- `src/lib/domain/**`
- `src/types.ts`
- `server/services/**`

> NOTE (scope expanded with explicit user confirmation 2026-06-17): the last four bullets
> (`src/lib/app/**`, `src/lib/domain/**`, `src/types.ts`, `server/services/**`) were added at the
> Phase 0.6 scope-expansion gate. The planner confirmed they are the minimal wiring needed for the
> ApprovalRepository to be reachable in production (P9 wired-in-prod): `appServices.ts:93`
> `selectDependency()` seam, the `DispatchApproval` type in both type homes, and the dispatch service.
> User chose "Expand". The rest are CAN-011 verbatim + P5 process artifacts.

## User Confirmation

The assistant must not confirm this canvas. Siehe Confirmation-Block im Chat / docs/traceability.md.
