# Product Canvas: Sizhu Agent-Safe Ops

Status: ready-for-user-confirmation
Feature Slug: sizhu-agent-safe-ops

| Section | ID | Value | Source Type | Source |
|---|---|---|---|---|
| Problem | CAN-001 | Die High-Level-Pipeline (Etsy → Middleware → FuFire → Template → LLM-Bild → QG1 → QG2 → Gelato → Order → Confirmation) ist nie end-to-end getestet; die MCP-/`/api`-Surface mischt reale, lügende und un-gegate-te Elemente. Agenten können nicht sicher operieren. | EXPLICIT | SRC-001, SRC-003 |
| Users / Customers | CAN-002 | Operatoren + Remote-AI-Agenten (Claude Code, Codex, Hermes, openclaw). | EXPLICIT | SRC-005 |
| Value Promise | CAN-003 | Eine agenten-sichere, wahrheitsgemäße Ops-Schicht: keine Fake-Erfolge, kein ungesicherter Geld-Pfad, eine konsolidierte MCP-Surface, ein Vertrags-Backbone. | EXPLICIT | SRC-001 |
| Current Alternatives | CAN-004 | Heute: zwei divergierende MCP-Layer; `/api`-Reads mit hartkodierten Leerlisten; Dispatch-Gate nur im In-Process-Runner, nicht auf der REST-Route. | EXPLICIT | SRC-001, SRC-002 |
| Key Capabilities | CAN-005 | (A) Approval-Gate + ehrliche Read/Validate-Endpunkte; (B) geteilter MCP-Tool-Katalog über beide Transporte; (C) Order/ProductTemplate/WorkflowState/Event-Schemas + granulare State-Machine. | EXPLICIT | SRC-005 |
| Non-Goals | CAN-006 | KEINE reale Persistenz-Implementierung; KEINE FuFire-RAW-Verdrahtung in den Run; KEINE QG1/QG2-Trennung; KEIN Gelato-Adapter; KEIN Etsy-Intake-Adapter; KEIN Fix von H-1 (Placeholder-Bild) / H-2 (QA Default-Pass) in diesem Run. | EXPLICIT | SRC-005 |
| Constraints | CAN-007 | Single-Express-Server-Modell; Secret-Ref-Indirektion; Default-Deny-`apiGuard`; jede Verhaltensänderung mit Guard-Test + RED-on-revert (P1–P9); `mcp-server` ist separates npm-Paket (Cross-Package-Grenze für geteilten Katalog). | EXPLICIT | SRC-006, SRC-002 |
| Risks | CAN-008 | Signed-Token ohne Persistenz → Replay/Revocation-Risiko; ehrliche Endpunkte (NOT_IMPLEMENTED) können bestehende Konsumenten brechen; Contract-only-State-Machine driftet ggü. Laufzeit; H-1/H-2 bleiben offen. | EXPLICIT | SRC-001 |
| Success Signal | CAN-009 | Dispatch nur mit gültigem signiertem Approval; keine fabrizierten Leerdaten; ein Tool-Katalog/Naming; granulare WorkflowState-Contracts referenziert vom Gate. | EXPLICIT | SRC-001, SRC-005 |
| Evidence | CAN-010 | Importer-Grep (Gate auf Route, P1/P9), Tool-Parity-Test, Schema-Validierungstests, 403-DISPATCH_NOT_ALLOWED-Test mit RED-on-revert, tools/list ohne pod_dispatch ohne Flag. | EXPLICIT | SRC-006 |
| Allowed Scope | CAN-011 | `server/index.ts` (Dispatch/Validate/Read-Routen), neues Approval-Token-Modul, `server/mcp/*` + `mcp-server/*` (geteilter Katalog), neue Contract-/State-Machine-Module unter `src/lib/...` + Tests. Keine `/api`-Routen außerhalb Fulfillment/Workflows/Gateway. | EXPLICIT | SRC-005 |
| Unresolved Questions | CAN-012 | OQ-001 Signer/Key-Management des Approval-Tokens; OQ-002 stdio-Surface entfernen vs. aus Katalog generieren; OQ-003 Read-Endpunkte NOT_IMPLEMENTED vs. temporärer Store; OQ-004 H-1/H-2 bestätigt out-of-scope. | EXPLICIT | SRC-005 |

## User Confirmation

The assistant must not confirm this canvas. Siehe Confirmation-Block im Chat / docs/traceability.md.
