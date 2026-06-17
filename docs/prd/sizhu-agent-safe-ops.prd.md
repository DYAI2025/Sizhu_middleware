# PRD: Sizhu Agent-Safe Ops

Status: user-confirmed
Feature Slug: sizhu-agent-safe-ops
Owner: ben.poersch@gmail.com
User Confirmation Required: yes
Confirmed by user: yes
Confirmation date: 2026-06-17 (Phase 0.5 USER GATE; post-council + spec-audited-remediated; CONCERN-1 accepted)

> **Amendment 2026-06-17 (Phase 0.16 Council + user decisions).** Gate mechanism = **Defense-in-Depth** (route `sensitive`/aal2 + persisted single-use approval record + `assertDispatchAllowed` AT the route) — the bespoke signed token (old REQ-002) is **dropped**; OQ-001 resolved. **Epic C (REQ-009/010/011) DEFERRED** to backlog (P1 built-but-dead risk — build only with a real prod consumer). **Epic B = DELETE the `server/mcp` stdio transport** (zero importers verified; ADR-0001 HTTP-canonical) — not "unify two catalogs"; OQ-002 resolved. Honest reads = `NOT_IMPLEMENTED` (OQ-003 resolved). New **OQ-005** (approval-store home). Original-goal vs this-iteration scope split: see §Scope status.

## Source Summary

Umbrella-Intake über drei Epics aus dem Architektur-Audit und der Diagnose-Roadmap:
- **Epic A — Agent-Safe Truth & Dispatch-Gate** (Audit C-1/C-2, GoalForge Slice A)
- **Epic B — Deeper MCP-Consolidation** (ADR-0001 Folgearbeit, Slice B)
- **Epic C — Contract-Backbone** (Diagnose Sprint 1, Slice C: Schemas + State-Machine)

Quellen: SRC-001 Audit, SRC-002 ADR-0001, SRC-003 Diagnose, SRC-004 Gap-Analyse, SRC-005 User-Entscheidungen 2026-06-17, SRC-006 CLAUDE.md P1–P9, SRC-007 Post-LGQ-Merge HEAD (Commits `7fcb782`…`4833280`).

> **Re-baseline 2026-06-17 (nach LGQ-Merge).** Verifiziert am neuen HEAD: H-1 (Placeholder-Bild), H-2 (QA Default-Pass) und H-4 (Cost-Cap) sind durch das LGQ-Feature **gelöst** (Provider nach `src/lib/providers/openrouter/` verschoben + neu geschrieben: wirft statt Placeholder, kein Default-Pass; `costCap.ts` + `lgq.*`-Contract-Tests). **Unverändert offen** (Grundlage dieses Runs): C-1 (Dispatch-Route ruft `assertDispatchAllowed` weiter nicht — `server/index.ts:228`), C-2 (`issues:[]`/`workflows:[]`/`READY_FOR_DISPATCH` — `server/index.ts:125,129,228`), grobe State-Machine (`stateMachine.ts:7`). Slice A und C stehen voll; Slice B ist gemerged.

## Problem Statement

| Field | Value | Source Type | Source |
|---|---|---|---|
| Problem Statement | Die POD-Pipeline ist nie end-to-end getestet; die agentenseitige `/api`-/MCP-Surface mischt reale, lügende (leere Listen, Shape-only-„READY") und un-gegate-te Elemente. Der Dispatch-Pfad umgeht das QA/Approval-Gate. Damit können Agenten nicht sicher konfigurieren, warten oder im Notfall eingreifen. | EXPLICIT | SRC-001 |

## Target Users

| ID | User | Source Type | Source |
|---|---|---|---|
| USER-001 | Sizhu-Operator (admin/owner, MFA aal2) | EXPLICIT | SRC-005 |
| USER-002 | Remote-AI-Agent (Claude Code, Codex, Hermes, openclaw) über MCP | EXPLICIT | SRC-005 |

## Goals

- Den Real-Geld-Dispatch-Pfad serverseitig hinter ein **Defense-in-Depth-Gate** stellen: Route `sensitive`/aal2 + persistierter Single-Use-Approval-Record + `assertDispatchAllowed` AUF der Route (Epic A).
- Die agentenseitigen Read/Validate-Endpunkte wahrheitsgemäß machen (`NOT_IMPLEMENTED`) (Epic A).
- **Eine** MCP-Surface herstellen durch **Löschen der stdio-Surface** (`server/mcp`); HTTP `mcp-server` ist die kanonische Single-Source (Epic B).
- ~~Vertrags-Backbone als Typen/Schemas (Epic C)~~ — **DEFERRED in diesen Run** (Backlog; erst mit realem Prod-Consumer bauen).

## Non-Goals

- Keine reale Supabase-Persistenz-Implementierung — **Ausnahme (narrow)**: der `ApprovalRepository`-Contract + Local-Impl für den Approval-Record; Supabase-Methode bleibt stub/werfend → Prod-Dispatch **fail-closed** (OQ-005).
- **Epic C (REQ-009/010/011) ist DEFERRED** — Backlog, NICHT „done" diesen Run. Das Gate referenziert die bestehende grobe `stateMachine.ts`, nicht eine neue granulare SM.
- Keine FuFire-RAW-Verdrahtung in den Run, keine QG1/QG2-Trennung, kein Gelato-Adapter, kein Etsy-Intake-Adapter.
- H-1 (Placeholder-Bild), H-2 (QA Default-Pass) und H-4 (Cost-Cap) sind **bereits out-of-band durch das LGQ-Feature gelöst** (HEAD nach Merge; H-1/H-4 belegt, H-2 ungeprüft aber out-of-scope) — kein Bestandteil dieses Runs.

## Scope status (Original Goal vs This Iteration)

Per the Plumbline scope-shift rule, reduced scope is never reported as "Original Goal Done".

| | Status |
|---|---|
| **Original Goal** (Vision VIS-003: Slices A + B + C) | **NOT DONE** — Epic C (contract backbone / granular WorkflowState) intentionally moved to **backlog** this iteration. Vision success-signal VIS-006 #4 ("granular WorkflowState contracts referenced by the gate") is **not delivered** this run. |
| **This Iteration** | Epic A (Defense-in-Depth dispatch gate + truthful endpoints) + Epic B (delete stdio → single HTTP MCP surface). The gate references the existing **coarse** `stateMachine.ts`. |
| **Decision** | User chose at the Phase 0.16 Council gate (2026-06-17): **C) move Epic C to backlog**. Recorded, not laundered. Epic C re-enters scope when a real prod consumer needs the contracts. |

**Value-truth statement (spec-audit CONCERN-1 — needs explicit user acceptance at the USER GATE).** This iteration ships **the gate, not a working production dispatch**. Because the prod approval store (Supabase) is a throwing stub and OQ-005's assumption is prod-fail-closed, on the deployed target `sizhu.fufire.space` (VIS-001) a POD dispatch is **defined to be impossible this run** (fail-closed). A working dispatch in production requires a later Supabase approval-store slice. Stated plainly, not softened: prod dispatch = non-functional this iteration; the value "agents can trigger an approved dispatch" is delivered in DEMO_LOCAL only.

## Assumptions

- RESOLVED (war ASSUMPTION/OQ-001): kein bespoke Signing-Algorithmus — Defense-in-Depth nutzt die bestehende aal2/role-Verifikation + einen persistierten Single-Use-Approval-Record + `assertDispatchAllowed` auf der Route.
- RESOLVED (OQ-003): Ehrliche Read-Endpunkte geben `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED` zurück; KEIN In-Memory-Store.
- ASSUMPTION (OQ-005, zu bestätigen Phase 0.5): Der Approval-Record liegt auf dem mode-switched Repo-Seam (`ApprovalRepository`): DEMO_LOCAL=Local (durable/restart-fest), Prod=Supabase-Stub→fail-closed (kein Store ⇒ kein Dispatch).

## Open Questions

- ~~OQ-001~~ **RESOLVED** (Council/User 2026-06-17): kein Signing-Key; Defense-in-Depth (aal2 + persistierter Single-Use-Record + assertDispatchAllowed-auf-Route).
- ~~OQ-002~~ **RESOLVED**: stdio-Surface (`server/mcp`) ENTFERNEN (0 Importer verifiziert; HTTP kanonisch).
- ~~OQ-003~~ **RESOLVED**: `NOT_IMPLEMENTED`, kein Store.
- ~~OQ-004~~ **RESOLVED**: H-1/H-2/H-4 out-of-scope (LGQ-gelöst).
- **OQ-005 (NEW, offen — bestätigen Phase 0.5):** Approval-Store-Home. Leading ASSUMPTION: mode-switched `ApprovalRepository`, DEMO_LOCAL durable, Prod fail-closed. Restart-Festigkeit (Critic-Falsifier) gilt in DEMO_LOCAL; Prod blockt sicher bis Supabase landet. (Spike als erste Run-Aufgabe.)

## Requirements

| Requirement ID | Requirement | Priority | Source Type | Source |
|---|---|---|---|---|
| REQ-001 | `POST /api/fulfillment/pod/dispatch` setzt vor `dispatchArtifact()` das Money-Gate durch. **Klar zur Last-Verteilung (spec-audit BLOCKER-1/2):** Die `sensitive`/aal2-Klassifizierung ist **bereits DONE** (belegt, `server/middleware/auth.ts:154`) und ist **Caller-Auth, NICHT das Dispatch-Gate** — die Route ist heute aal2 UND dispatcht trotzdem ungated (= C-1). Das **alleinige last-tragende Money-Gate ist REQ-002** (verbrauchbarer Single-Use-Approval-Record). TO-BUILD (P9): (a) Record-Verbrauch auf der Route + (b) Bindung der zu dispatchenden `artifactId` an die im Record approbierte Identität; `assertDispatchAllowed` ist nur ein sekundärer Artifact-Shape-Check (liest `artifact.status`, kein Server-State). Sonst `403 DISPATCH_NOT_ALLOWED`, kein Provider-Call. | P0 | EXPLICIT (post-council, spec-audited) | SRC-001, SRC-005, Council 2026-06-17 |
| REQ-002 | **Persistierter Single-Use-Approval-Record = das alleinige last-tragende Money-Gate** (kein bespoke signierter Token): server-seitig verifizierbares Objekt (issuer/approver, workflowRunId, **artifactId**, expiry, nonce, status used/unused) auf dem `ApprovalRepository`-Seam. Der Record **bindet (runId, artifactId) server-seitig**; die zu dispatchende artifactId MUSS gleich der approbierten sein. Manipuliert/abgelaufen/bereits-verbraucht/abwesend/ID-Mismatch → `APPROVAL_TOKEN_INVALID`/`DISPATCH_NOT_ALLOWED`. Verbrauch ist **atomar** (kein sequenzieller UND kein nebenläufiger Replay). | P0 | EXPLICIT (post-council, spec-audited) | SRC-005, Council 2026-06-17 |
| REQ-003 | `GET /api/workflows/*` und `GET /api/gateway-issues` liefern keinen fabrizierten leeren Erfolg mehr, sondern `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED`, solange keine reale Quelle angebunden ist. | P0 | EXPLICIT | SRC-001 |
| REQ-004 | `POST /api/fulfillment/pod/validate-dispatch` gibt für ein nicht-akzeptiertes/nicht-approbiertes Artifact NICHT `READY_FOR_DISPATCH` zurück (echte Prüfung ODER Kennzeichnung `VALIDATION_SHAPE_ONLY`). | P1 | EXPLICIT | SRC-001 |
| REQ-005 | `sizhu_pod_dispatch` wird in der MCP-Surface nur bei `MCP_ENABLE_DISPATCH=true` registriert; Tool-Beschreibung spiegelt den realen Gate-Zustand wider. | P1 | EXPLICIT | SRC-001 |
| REQ-006 | Nach Löschung der stdio-Surface ist die HTTP-`mcp-server`-Katalogquelle die **einzige** Tool-Definitions-Quelle (Name + Beschreibung + Input-Schema + Sensitivity). Kein zweiter, divergierender Hand-Katalog mehr (ein Transport = ein Katalog). | P1 | EXPLICIT (post-council) | SRC-002, SRC-005, Council 2026-06-17 |
| REQ-007 | Der redundante Transport wird **gelöscht**: `server/mcp/*` + die `package.json`-Scripts `mcp:stdio`/`test:mcp` werden entfernt (0 Prod-Importer verifiziert; ADR-0001 HTTP-kanonisch). **Evidence (spec-audit CONCERN-3, belegt):** `server/mcp/auth/agentPolicy.ts` (admin+aal2-Policy) ist NUR stdio-seitig (nur von `server/mcp/registry/tools.ts` importiert); die HTTP-`mcp-server`-Surface forwardet das aal2-Token an `/api`, dessen `apiGuard` aal2/role durchsetzt → die Löschung erweitert KEINE Agent-Auth-Lücke. | P2 | EXPLICIT (post-council, spec-audited) | SRC-002, Council 2026-06-17 |
| REQ-008 | Guard-Test sichert Tool-Parität (gleiche Namen für geteilte Fähigkeiten über beide Transporte) UND dass gefährliche Tools (Dispatch) per Default aus sind. | P1 | EXPLICIT | SRC-006 |
| REQ-009 | **[DEFERRED — Backlog]** `OrderInputSchema` und `ProductTemplateSchema` als typisierte Contracts. *Nicht in diesem Run* — erst bauen, wenn ein realer Prod-Consumer sie auf dem Request-Pfad verdrahtet (P1 built-but-dead vermeiden). | P1→Backlog | EXPLICIT (post-council) | SRC-003, Council 2026-06-17 |
| REQ-010 | **[DEFERRED — Backlog]** Granulare `WorkflowState`-Machine + Transitionen. *Nicht in diesem Run*; das Gate (REQ-001) referenziert die bestehende grobe `stateMachine.ts`. Wird mit einem realen Consumer gebaut. | P1→Backlog | EXPLICIT (post-council) | SRC-003, Council 2026-06-17 |
| REQ-011 | **[DEFERRED — Backlog]** `WorkflowEvent` + Record-Contracts. *Nicht in diesem Run.* | P2→Backlog | EXPLICIT (post-council) | SRC-003, Council 2026-06-17 |

## Acceptance Criteria

| AC ID | Requirement ID | Given | When | Then | Source Type |
|---|---|---|---|---|---|
| AC-001 | REQ-001 | eine Dispatch-Anfrage ohne gültigen signierten Approval-Token | `POST /api/fulfillment/pod/dispatch` aufgerufen wird | antwortet der Server `403 DISPATCH_NOT_ALLOWED` und es läuft keine Dispatch-Arbeit (kein Provider-Call) | EXPLICIT |
| AC-002 | REQ-002 | ein fabriziertes Artifact `{status:'accepted'}` ohne gültigen Approval-Record | Dispatch aufgerufen wird | entscheidet **der Approval-Record (server-seitig keyed auf runId/artifactId), NICHT `artifact.status`** → Ablehnung `403 DISPATCH_NOT_ALLOWED`. (Korrigiert nach spec-audit BLOCKER-3: `assertDispatchAllowed` liest `artifact.status` und ist nicht der State-Decider.) | EXPLICIT (spec-audited) |
| AC-002b | REQ-002 | ein gültiger Record für artifactId=X, aber der Request dispatcht artifactId=Y (swap) | Dispatch aufgerufen wird | wird mit `DISPATCH_NOT_ALLOWED` abgelehnt (dispatched-ID ≠ approbierte-ID) | EXPLICIT (spec-audited BLOCKER-3) |
| AC-003c | REQ-002 | zwei nebenläufige Dispatches mit DEMSELBEN gültigen Record | beide gleichzeitig die Route treffen | genau EINER passiert, der andere → `DISPATCH_NOT_ALLOWED` (atomarer Verbrauch, kein Race) | EXPLICIT (spec-audited CONCERN-2) |
| AC-003 | REQ-002 | ein manipulierter, abgelaufener ODER bereits verbrauchter Approval-Record | die Route ihn verifiziert | wird er mit `APPROVAL_TOKEN_INVALID`/`DISPATCH_NOT_ALLOWED` abgelehnt; ein zweiter Dispatch mit demselben Record (Replay) wird ebenfalls abgelehnt | EXPLICIT (post-council) |
| AC-004 | REQ-001 | ein gültiger Single-Use-Record + akzeptiertes Artifact (Test-Doubles) | Dispatch aufgerufen wird | passiert das Gate, der Record wird als `used` verbraucht und ein Audit-Eintrag (recordId, runId, artifactId, approver) wird erzeugt | ASSUMPTION |
| AC-003b | REQ-001/002 | Prod-Mode (Supabase-Stub, kein Approval-Store) | Dispatch aufgerufen wird | fail-closed: `403 DISPATCH_NOT_ALLOWED`/`SOURCE_NOT_CONFIGURED`, kein Provider-Call (OQ-005) | ASSUMPTION (post-council) |
| AC-005 | REQ-003 | keine reale Persistenzquelle konfiguriert | `GET /api/workflows/*` aufgerufen wird | ist die Antwort `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED`, kein `200 {workflows:[]}` als Erfolg | EXPLICIT |
| AC-006 | REQ-004 | ein nicht-akzeptiertes Artifact | `validate-dispatch` aufgerufen wird | ist die Antwort NICHT `READY_FOR_DISPATCH` (Fehlprüfung oder Label `VALIDATION_SHAPE_ONLY`) | EXPLICIT |
| AC-007 | REQ-005 | `MCP_ENABLE_DISPATCH` ist nicht gesetzt | ein Agent `tools/list` aufruft | ist `sizhu_pod_dispatch` nicht in der Liste | EXPLICIT |
| AC-008 | REQ-006 | der geteilte Katalog definiert Tool X | beide Transporte starten | exponieren beide identischen Namen + Input-Schema für X (eine Quelle) | EXPLICIT |
| AC-009 | REQ-007 | die Konsolidierung ist umgesetzt | nach hand-gepflegten Tool-Namenslisten gegrept wird | existiert keine zweite divergierende Definition mehr | EXPLICIT |
| AC-010 | REQ-008 | der Paritäts-Test | ausgeführt wird | bestätigt gleiche geteilte Namen + Dispatch-off-by-default; Revert der Regel → Test wird RED | EXPLICIT |
| AC-011 | REQ-009 | **[DEFERRED]** `OrderInputSchema`/`ProductTemplateSchema` | — | *Nicht in diesem Run (Epic C Backlog).* | DEFERRED |
| AC-012 | REQ-010 | **[DEFERRED]** die granulare State-Machine | — | *Nicht in diesem Run; Gate nutzt grobe `stateMachine.ts`.* | DEFERRED |
| AC-013 | REQ-011 | **[DEFERRED]** die Record-Contracts | — | *Nicht in diesem Run.* | DEFERRED |

## Non-Functional Requirements

| NFR ID | Requirement | Source Type | Source |
|---|---|---|---|
| NFR-001 | Jede Verhaltensänderung liefert einen Guard-Test mit RED-on-revert-Beweis im Commit-Body (P4). | EXPLICIT | SRC-006 |
| NFR-002 | `wired-in-prod` = ≥1 Produktions-Importer (Importer-Grep), nicht nur Tests (P1). Speziell: `assertDispatchAllowed`/Gate muss einen Server-Routen-Aufrufer haben (P9). | EXPLICIT | SRC-006 |
| NFR-003 | Keine Secrets/PII in Antworten oder Logs; Approval-**Record** server-seitig verifizierbar (kein Klartext-Approval, keine vom Body steuerbare Accept-Entscheidung). | EXPLICIT (spec-audited NOTE-2) | SRC-001 |
| NFR-004 | `npm run lint` (tsc) + `npm run test` grün; geänderte kritische Module in die Mutation-Liste. | EXPLICIT | SRC-006 |

## Risks

| Risk ID | Risk | Source Type | Source |
|---|---|---|---|
| RISK-001 | **Mitigiert (post-council):** Replay/Revocation jetzt durch **persistierten Single-Use-Record** (atomarer Verbrauch + Expiry + Nonce + Audit), nicht durch einen store-losen signierten Token. Restart-Festigkeit gilt in DEMO_LOCAL; Prod fail-closed bis Supabase-Store landet (OQ-005). | MITIGATED | SRC-005, Council 2026-06-17 |
| RISK-002 | Ehrliche Endpunkte (`NOT_IMPLEMENTED`) brechen Konsumenten, die Arrays erwarten (UI/MCP). | EXPLICIT | SRC-001 |
| RISK-003 | Geteilter Katalog über Paketgrenze (`mcp-server` eigenes npm-Paket) → Build/Publish-Komplexität. | EXPLICIT | SRC-002 |
| RISK-004 | **GELÖST (LGQ-Merge):** H-1/H-2 geschlossen — `src/lib/providers/openrouter/openRouterImageGenerationProvider.ts` wirft statt Placeholder; QA ohne Default-Pass; H-4 Cost-Cap (`costCap.ts`) ebenfalls gelandet. Kein offenes Risiko mehr. | RESOLVED | SRC-007 |
| RISK-005 | Contract-only State-Machine driftet ggü. grobem Laufzeit-Zustand bis ein späterer Slice sie verdrahtet. | EXPLICIT | SRC-003 |

## Evidence Needed

| Evidence ID | Requirement ID | Evidence Needed | Source Type |
|---|---|---|---|
| EV-001 | REQ-001 | Importer-Grep: Gate hat Server-Routen-Aufrufer; 403-Test mit RED-on-revert | EXPLICIT |
| EV-002 | REQ-002 | Unit-Tests: gültig/manipuliert/abgelaufen/bereits-verbraucht/ID-Mismatch → korrektes Verdikt; sequenzieller + nebenläufiger Replay abgelehnt. **Scope-Hinweis (spec-audit CONCERN-2):** Restart-Durability wird NUR im DEMO_LOCAL (Local-Repo) getestet; KEIN Prod-Store-Durability-Test diesen Run (Prod = fail-closed) — nicht später als „bewiesen" lesen. | EXPLICIT (spec-audited) |
| EV-003 | REQ-003 | Routen-Test: kein `200 {workflows:[]}`/`{issues:[]}`-Erfolg mehr | EXPLICIT |
| EV-004 | REQ-004 | Test: nicht-akzeptiertes Artifact ⇏ READY_FOR_DISPATCH | EXPLICIT |
| EV-005 | REQ-005 | Tool-Registry-Test: ohne Flag kein `sizhu_pod_dispatch` | EXPLICIT |
| EV-006 | REQ-006 | Grep/Test: eine Katalog-Quelle, beide Transporte konsumieren sie | EXPLICIT |
| EV-007 | REQ-007 | Entscheidung dokumentiert (ADR-Folge); keine Doppel-Definition mehr | EXPLICIT |
| EV-008 | REQ-008 | Paritäts-Test grün; Revert → RED | EXPLICIT |
| EV-009 | REQ-009 | Schema-Validierungstests (valide/invalide Samples) | EXPLICIT |
| EV-010 | REQ-010 | State-Machine-Tests (legale/illegale Transitionen, Terminalzustände) | EXPLICIT |
| EV-011 | REQ-011 | Schema-Konformitätstests für Record-Typen | EXPLICIT |

## Links

- Vision: `docs/vision/sizhu-agent-safe-ops.vision.md`
- Canvas: `docs/canvas/sizhu-agent-safe-ops.canvas.md`
- Traceability: `docs/traceability.md`

## User Confirmation Required

The assistant must not confirm this PRD. Siehe Confirmation-Block.
